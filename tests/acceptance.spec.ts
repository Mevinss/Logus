import {
  test,
  expect,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import {
  launchFixture,
  pdfFixture,
  teacherLogin,
  choice,
  quote,
  open,
  skill,
} from "./fixture";

async function read(ctx: APIRequestContext, url: string) {
  const res = await ctx.get(url);
  expect(res.ok(), await res.text()).toBeTruthy();
  return res.json();
}
async function write(
  ctx: APIRequestContext,
  url: string,
  data: unknown,
  method = "POST",
) {
  const res = await ctx.fetch(url, { method, data });
  expect(res.ok(), await res.text()).toBeTruthy();
  return res.json();
}
const noOverflow = async (p: Page) =>
  expect(
    await p.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
const button = (p: Page, text: string) =>
  p.getByRole("button", { name: text, exact: true });

test("Ручной урок, PDF, журнал, выборочная разминка и постоянная база", async ({
  browser,
}) => {
  const fixture = await launchFixture();
  const { url } = fixture,
    teacher = await browser.newContext({
      viewport: { width: 1440, height: 960 },
    }),
    pupil = await browser.newContext({
      viewport: { width: 360, height: 780 },
      isMobile: true,
      hasTouch: true,
    }),
    other = await browser.newContext({ viewport: { width: 360, height: 780 } });
  const t = await teacher.newPage(),
    p = await pupil.newPage(),
    o = await other.newPage();
  const tr = teacher.request,
    pr = pupil.request,
    or = other.request;
  try {
    await t.goto(url);
    await t.getByLabel("Электронная почта").fill(teacherLogin.email);
    await t.locator('input[name="password"]').fill(teacherLogin.password);
    await t.getByRole("button", { name: /Войти в кабинет/ }).click();
    await expect(t.getByRole("heading", { name: "Сегодня" })).toBeVisible();
    // First take a teacher-authored question from a blank draft through the journal.
    const one = await write(tr, url + "/api/groups", { name: "Практика" });
    const pair = await write(tr, url + "/api/groups/" + one.id + "/students", {
      name: "Ученик практики",
    });
    const quick = await write(tr, url + "/api/lessons", {
      title: "Ручной урок",
      text: quote,
    });
    await write(
      tr,
      url + "/api/lessons/" + quick.id,
      { questions: [{ ...choice, id: "manual", sourceId: 1 }] },
      "PATCH",
    );
    const issued = await write(
      tr,
      url + "/api/lessons/" + quick.id + "/publish",
      { groupId: one.id },
    );
    await o.goto(url);
    await button(o, "Я ученик").click();
    await o.getByLabel("Ссылка-приглашение").fill(issued.url);
    await button(o, "Войти по приглашению").click();
    await expect(o.locator("form").getByRole("alert")).toContainText("/invite/");
    await o.getByLabel("Ссылка-приглашение").fill(pair.students[0].inviteUrl);
    await button(o, "Войти по приглашению").click();
    await expect(o.getByRole("heading", { name: "Мои занятия" })).toBeVisible();
    await o.goto(issued.url);
    await o.getByRole("button", { name: /Перейти к заданиям/ }).click();
    await o.getByRole("radio", { name: "Капли" }).check();
    await button(o, "Сдать работу").click();
    await expect(
      o.getByRole("heading", { name: "Итоговый балл" }),
    ).toBeVisible();
    expect((await read(tr, url + "/api/groups/" + one.id)).works[0].score).toBe(
      1,
    );

    await t.reload();
    await t
      .getByRole("button", { name: "Группы", exact: true })
      .first()
      .click();
    await t
      .getByRole("button", { name: /Создать группу/ })
      .first()
      .click();
    await t.getByLabel("Название группы").fill("Физика 8");
    await t
      .getByRole("dialog")
      .getByRole("button", { name: /Создать/ })
      .click();
    await expect(t.getByRole("heading", { name: "Физика 8" })).toBeVisible();
    const invites: Record<string, string> = {};
    for (const studentName of ["Анна", "Борис"]) {
      await t.getByLabel("Имя или псевдоним ученика").fill(studentName);
      await button(t, "Добавить ученика").click();
      const invite = t.getByRole("dialog");
      await expect(invite).toBeVisible();
      invites[studentName] = await invite.getByRole("textbox").inputValue();
      await invite.getByRole("button", { name: "Закрыть" }).click();
    }
    await t
      .getByRole("button", { name: "Мои уроки", exact: true })
      .first()
      .click();
    await t
      .getByRole("button", { name: /Создать урок/ })
      .first()
      .click();
    const title = "Конденсация";
    await t.getByLabel("Название урока").fill(title);
    await button(t, "Перейти в редактор").click();
    await t
      .getByLabel("Инструкция ученикам")
      .fill("Прочитайте вторую страницу и выполните задания.");
    await t
      .locator("input[type=file]")
      .setInputFiles({
        name: "condensation.pdf",
        mimeType: "application/pdf",
        buffer: pdfFixture(),
      });
    await expect(t.getByRole("checkbox", { name: "Стр. 2" })).toBeChecked();
    await t.getByRole("checkbox", { name: "Стр. 1" }).uncheck();
    fixture.setMode("down");
    await button(t, "Сгенерировать вопросы").click();
    await expect(t.locator(".t-error")).toContainText(
      /провайдер|ошибк|недоступ/i,
    );
    fixture.setMode("invalid");
    await button(t, "Сгенерировать вопросы").click();
    await expect(t.locator(".t-notice")).toContainText(/цитат/i);
    fixture.setMode("ok");
    await button(t, "Сгенерировать вопросы").click();
    const changed = "Какое вещество видно на холодном стекле?";
    await expect(t.getByLabel("Цитата-основание").first()).toHaveValue(quote);
    await t
      .getByRole("button", { name: /Открыть источник/ })
      .first()
      .click();
    await expect(t.getByRole("dialog").getByRole("link")).toHaveAttribute(
      "href",
      /#page=2$/,
    );
    await t
      .getByRole("dialog")
      .getByRole("button", { name: "Закрыть" })
      .click();
    await t.getByLabel("Формулировка").first().fill(changed);
    await t.getByRole("button", { name: /Опубликовать для группы/ }).click();
    await t
      .getByRole("dialog")
      .getByRole("combobox")
      .selectOption({ label: "Физика 8" });
    await button(t, "Назначить урок").click();
    await expect
      .poll(
        async () =>
          (await read(tr, url + "/api/teacher")).runs.filter(
            (r: { title: string }) => r.title === title,
          ).length,
      )
      .toBe(1);
    const snapshot = await read(tr, url + "/api/teacher"),
      group = snapshot.groups.find(
        (g: { name: string }) => g.name === "Физика 8",
      ),
      run = snapshot.runs.find((r: { title: string }) => r.title === title);
    const a = group.students.find((s: { name: string }) => s.name === "Анна"),
      b = group.students.find((s: { name: string }) => s.name === "Борис");
    await p.goto(run.url);
    await expect(
      p.getByRole("heading", { name: "Вход на занятие" }),
    ).toBeVisible();
    await p.goto(invites["Анна"]);
    await expect(p.getByRole("heading", { name: title })).toBeVisible();
    await expect(p.getByText(quote, { exact: true })).toBeVisible();
    await expect(
      p.getByText("First page introduction.", { exact: true }),
    ).toHaveCount(0);
    await expect(p.getByRole("link", { name: /оригинал PDF/ })).toBeVisible();
    await noOverflow(p);
    const publicDetail = await read(pr, url + "/api/student/" + run.id);
    for (const q of publicDetail.questions)
      for (const privateField of ["correctIndex", "criterion", "quote"])
        expect(q).not.toHaveProperty(privateField);
    await p.getByRole("button", { name: /Перейти к заданиям/ }).click();
    await expect(p.getByRole("heading", { name: changed })).toBeVisible();
    await p.getByRole("radio", { name: "Пар", exact: true }).check();
    await expect(p.getByText("Все ответы сохранены")).toBeVisible();
    await p.reload();
    await expect(
      p.getByRole("radio", { name: "Пар", exact: true }),
    ).toBeChecked();
    await p.getByRole("button", { name: /Далее/ }).click();
    const explanation = "Пар переходит в жидкость.";
    await pupil.setOffline(true);
    await p.getByRole("textbox", { name: "Ваш ответ" }).fill(explanation);
    await expect(p.getByText(/Ожидают сохранения/)).toBeVisible();
    await pupil.setOffline(false);
    await expect
      .poll(
        async () =>
          (await read(pr, url + "/api/student/" + run.id)).answers[
            publicDetail.questions[1].id
          ],
      )
      .toBe(explanation);
    await p.reload();
    await expect(p.getByRole("textbox", { name: "Ваш ответ" })).toHaveValue(
      explanation,
    );
    await noOverflow(p);
    await button(p, "Сдать работу").click();
    await expect(
      p.getByRole("heading", { name: "За проверенную часть" }),
    ).toBeVisible();
    await expect(
      p.getByText("Ожидает проверки", { exact: true }).first(),
    ).toBeVisible();
    const duplicate = await write(
      pr,
      url + "/api/student/" + run.id + "/submit",
      {},
    );
    expect(duplicate.status).toBe("pending");
    expect(duplicate.earned).toBe(0);
    await o.goto(invites["Борис"]);
    await expect(o.getByRole("heading", { name: "Мои занятия" })).toBeVisible();
    const independent = await read(or, url + "/api/student/" + run.id);
    expect(independent.item.status).toBe("not_started");
    expect(independent.answers).toEqual({});
    expect([403, 404]).toContain(
      (await or.get(url + "/api/works/" + run.id + "/" + a.id)).status(),
    );
    await t.goto(url);
    await button(t, "Группы").first().click();
    await t
      .getByRole("button", { name: /Физика 8/ })
      .first()
      .click();
    await button(t, "Журнал").click();
    await t
      .getByRole("row", { name: /Анна/ })
      .getByRole("button", { name: "Ожидает проверки" })
      .click();
    await expect(t.getByRole("dialog")).toContainText(explanation);
    await button(t, "Запросить подсказку ИИ").click();
    await expect(t.getByRole("dialog")).toContainText("Предложение ИИ");
    await t.getByLabel("Баллы из 2").fill("2");
    await t
      .getByLabel("Комментарий преподавателя")
      .fill("Переход объяснён верно.");
    await button(t, "Подтвердить итог").click();
    await expect(t.getByRole("dialog")).toContainText("Итог подтверждён");
    await t
      .getByRole("dialog")
      .getByRole("button", { name: "Закрыть" })
      .click();
    await expect(t.getByRole("row", { name: /Анна/ })).toContainText("2 / 3");
    await p.reload();
    await expect(
      p.getByRole("heading", { name: "Итоговый балл" }),
    ).toBeVisible();
    await expect(p.locator(".st-result")).toHaveText("2из 3 за работу");
    await p.getByRole("button", { name: /К материалу/ }).click();
    await expect(p.getByText(quote, { exact: true })).toBeVisible();
    await button(p, "Вернуться к результату").click();
    await button(t, "Аналитика").click();
    await t
      .getByRole("button", { name: new RegExp(changed.slice(0, 16)) })
      .first()
      .click();
    await expect(t.getByRole("dialog")).toContainText(
      "Вариант «Пар» выбрали 1 из 1",
    );
    await button(t, "Подготовить разминку").click();
    await button(t, "Предложить задания с ИИ").click();
    await expect(t.getByLabel("Формулировка")).toHaveValue(/капель/);
    await t.getByLabel("Кому назначить").selectOption("some");
    await t.getByRole("checkbox", { name: "Анна" }).check();
    await button(t, "Назначить разминку").click();
    await expect(t.getByText(/Разминка назначена/)).toBeVisible();
    await p.reload();
    await p.getByRole("button", { name: /Открыть разминку/ }).click();
    await p.getByRole("button", { name: /Перейти к заданиям/ }).click();
    await p.getByRole("radio", { name: "Капли" }).check();
    await button(p, "Сдать работу").click();
    await expect(
      p.getByRole("heading", { name: "Итоговый балл" }),
    ).toBeVisible();
    const results = await read(pr, url + "/api/student"),
      warm = results.items.find((i: { kind: string }) => i.kind === "warmup");
    expect(warm.score).toBe(1);
    expect(warm.parentId).toBe(run.id);
    expect(
      results.items.find((i: { runId: string }) => i.runId === run.id).score,
    ).toBe(2);
    expect(
      (await read(or, url + "/api/student")).items.some(
        (i: { kind: string }) => i.kind === "warmup",
      ),
    ).toBe(false);
    expect([403, 404]).toContain(
      (await or.get(url + "/api/student/" + warm.runId)).status(),
    );
    await button(p, "← Мои занятия").click();
    await p.getByRole("tab", { name: "История результатов" }).click();
    await expect(
      p.getByRole("heading", { name: "Разминка · " + skill, exact: true }),
    ).toBeVisible();
    await expect(
      p.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    const report = await read(tr, url + "/api/groups/" + group.id);
    const counters = report.runs.find((i: { id: string }) => i.id === run.id);
    expect([
      counters.assigned,
      counters.started,
      counters.submitted,
      counters.pending,
    ]).toEqual([2, 1, 1, 0]);
    expect(
      report.works.find(
        (i: { studentId: string; runId: string }) =>
          i.studentId === b.id && i.runId === run.id,
      ).score,
    ).toBeNull();
    // Repeat the latest draft in another group; the first version remains frozen.
    const draft = snapshot.lessons.find(
      (i: { title: string }) => i.title === title,
    );
    const later = "Вопрос для следующей группы";
    await write(
      tr,
      url + "/api/lessons/" + draft.id,
      { questions: [{ ...draft.questions[0], prompt: later }] },
      "PATCH",
    );
    const second = await write(
      tr,
      url + "/api/lessons/" + draft.id + "/publish",
      { groupId: one.id },
    );
    expect(second.id).not.toBe(run.id);
    expect(second.submitted).toBe(0);
    await fixture.restart();
    const persisted = await read(pr, url + "/api/student/" + run.id);
    expect(persisted.questions[0].prompt).toBe(changed);
    expect(persisted.item.score).toBe(2);
    expect(persisted.warmups[0].score).toBe(1);
    expect((await pr.get(url + persisted.pdfUrl)).ok()).toBe(true);
  } finally {
    await Promise.all([teacher.close(), pupil.close(), other.close()]);
    await fixture.cleanup();
  }
});
