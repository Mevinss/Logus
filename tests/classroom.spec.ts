import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { unzipSync, strFromU8 } from "fflate";
import { launchFixture, teacherLogin, choice, open, quote } from "./fixture";

test("Учитель импортирует класс, проверяет ответы и скачивает журнал при 30 одновременных сдачах", async ({
  browser,
}) => {
  const fixture = await launchFixture();
  const ctx = await browser.newContext();
  try {
    const t = await ctx.newPage();
    const post = async (path: string, data: unknown) => {
      const r = await ctx.request.post(fixture.url + "/api/" + path, { data });
      expect(r.status(), await r.text()).toBe(200);
      return r.json();
    };
    await post("login", teacherLogin);
    const group = await post("groups", { name: "7А" });
    const names = Array.from(
      { length: 30 },
      (_, i) => "Ученик " + String(i + 1).padStart(2, "0"),
    );
    await t.goto(fixture.url);
    await t
      .getByRole("button", { name: "Группы", exact: true })
      .first()
      .click();
    await t.getByRole("button", { name: /7А/ }).first().click();
    await t.getByRole("button", { name: "Импорт класса" }).click();
    await t.getByLabel("Список учеников").fill([...names, names[0]].join("\n"));
    await expect(t.getByText(/К добавлению: 30/)).toBeVisible();
    await t.getByRole("button", { name: "Добавить список" }).click();
    await expect(t.getByText("Добавлено: 30. Пропущено: 1.")).toBeVisible();
    await t
      .getByRole("button", { name: "Приглашение", exact: true })
      .first()
      .click();
    await expect(
      t.getByAltText("QR-код индивидуального приглашения"),
    ).toHaveAttribute("src", /^data:image\/png/);
    await t.getByRole("button", { name: "Закрыть" }).click();
    await t.evaluate(() => {
      const openWindow = window.open.bind(window);
      window.open = (...args) => {
        const popup = openWindow(...args);
        if (popup)
          popup.print = () =>
            popup.document.body.setAttribute("data-print", "ready");
        return popup;
      };
    });
    const printed = ctx.waitForEvent("page");
    await t.getByRole("button", { name: "Печать QR-карточек" }).click();
    const cards = await printed;
    await expect(cards.locator("body")).toHaveAttribute("data-print", "ready");
    await expect(cards.locator("article img")).toHaveCount(30);
    await cards.close();
    const roster = await (
      await ctx.request.get(fixture.url + "/api/groups/" + group.id)
    ).json();
    const lesson = await post("lessons", { title: "Урок физики", text: quote });
    await ctx.request.patch(fixture.url + "/api/lessons/" + lesson.id, {
      data: {
        questions: [
          { ...choice, id: "q1", sourceId: 1 },
          { ...open, id: "q2", sourceId: 1 },
        ],
      },
    });
    const run = await post("lessons/" + lesson.id + "/publish", {
      groupId: group.id,
    });
    const sessions = await Promise.all(
      roster.group.students.map(async (s: { inviteUrl: string }) => {
        const r = await fetch(fixture.url + "/api/join", {
          method: "POST",
          body: JSON.stringify({ token: s.inviteUrl.split("/").pop() }),
        });
        expect(r.status).toBe(200);
        return r.headers.get("set-cookie")!.split(";")[0];
      }),
    );
    await t.getByRole("button", { name: "Урок идёт", exact: true }).click();
    await t.reload();
    await t
      .getByRole("button", { name: "Группы", exact: true })
      .first()
      .click();
    await t.getByRole("button", { name: /7А/ }).first().click();
    await t.getByRole("button", { name: "Урок идёт", exact: true }).click();
    await expect(t.getByText(/Назначено: 30/)).toBeVisible();
    await fetch(fixture.url + "/api/student", {
      headers: { cookie: sessions[0] },
    });
    await fetch(fixture.url + "/api/student/" + run.id, {
      headers: { cookie: sessions[1] },
    });
    await expect(
      t.getByText(/Вошли в кабинет:\s*2\s*·\s*Открыли урок:\s*1/),
    ).toBeVisible({ timeout: 12000 });
    const responses = await Promise.all(
      sessions.map((cookie) =>
        fetch(fixture.url + "/api/student/" + run.id + "/submit", {
          method: "POST",
          headers: { cookie, "content-type": "application/json" },
          body: JSON.stringify({ answers: { q1: 0, q2: "Пар охлаждается" } }),
        }),
      ),
    );
    expect(responses.map((r) => r.status)).toEqual(Array(30).fill(200));
    await expect(t.getByText(/Сдали: 30/)).toBeVisible({ timeout: 12000 });
    await t.getByLabel("Баллы из 2").fill("2");
    await t.getByLabel("Комментарий к ответу").fill("Верно");
    await t
      .getByRole("button", { name: "Подтвердить и перейти дальше" })
      .click();
    await expect(t.getByText(/Ученик 02\s*·\s*В очереди:\s*29/)).toBeVisible();
    await t.getByRole("button", { name: "Журнал", exact: true }).click();
    await expect(t.getByRole("row", { name: /Ученик 01/ })).toContainText(
      "3 / 3",
    );
    await t.getByRole("button", { name: "Скачать Excel" }).click();
    const promise = t.waitForEvent("download");
    await t.getByRole("button", { name: "Скачать .xlsx" }).click();
    const file = await promise;
    expect(file.suggestedFilename()).toBe("Журнал 7А.xlsx");
    const xml = unzipSync(await readFile((await file.path())!));
    const contents = Object.entries(xml)
      .filter(([k]) => k.endsWith(".xml"))
      .map(([, v]) => strFromU8(v))
      .join("");
    expect(contents).toContain("Ученик 30");
    expect(contents).toContain("Ожидает проверки");
    expect(strFromU8(xml["xl/worksheets/sheet1.xml"])).toMatch(/<v>3<\/v>/);
  } finally {
    await ctx.close();
    await fixture.cleanup();
  }
});
