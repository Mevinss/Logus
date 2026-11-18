import { expect, test } from "@playwright/test";
import { choice, launchFixture, open, quote, teacherLogin } from "./fixture";

test.use({actionTimeout:15000});

test("Замена изменяет только выбранный вопрос после подтверждения", async ({
  page,
}) => {
  const fixture = await launchFixture();
  const root = fixture.url;
  const request = page.request;
  try {
    expect(
      (await request.post(root + "/api/login", { data: teacherLogin })).ok(),
    ).toBe(true);
    const original = [
      { ...open, id: "explain" },
      { ...choice, id: "select" },
    ];
    const created = await request.post(root + "/api/lessons", {
      data: {
        title: "Замена вопроса",
        text: "Первый абзац.\n\n" + quote,
        questions: original,
      },
    });
    expect(created.ok()).toBe(true);
    const lesson = root + "/api/lessons/" + (await created.json()).id;
    const saved = async () =>
      (await (await request.get(lesson)).json()).questions;
    const propose = (id: string) =>
      request.post(lesson + "/generate", { data: { replaceQuestionId: id } });
    // The fixture always proposes a closed question. An open target must survive.
    expect((await propose("explain")).ok()).toBe(false);
    fixture.setMode("down");
    expect((await propose("select")).ok()).toBe(false);
    expect(await saved()).toEqual(original);
    fixture.setMode("ok");
    await page.goto(root);
    await page.getByRole("button", { name: "Мои уроки", exact: true }).click();
    await page.getByRole("button", { name: "Редактировать" }).click();
    const replace = page.getByRole("button", { name: "Заменить с ИИ" }).nth(1);
    await replace.click();
    const preview = page
      .getByRole("dialog")
      .filter({
        has: page.getByRole("heading", { name: "Предложенная замена" }),
      });
    await expect(preview.getByLabel("Цитата-основание")).toHaveValue(quote);
    await preview
      .getByRole("button", { name: "Оставить исходный вопрос" })
      .click();
    expect(await saved()).toEqual(original);
    await replace.click();
    await preview.getByRole("button", { name: "Применить замену" }).click();
    await page.getByRole("button", { name: "Сохранить черновик" }).click();
    await expect(page.getByRole("status")).toContainText("Черновик сохранён");
    const result = await saved();
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(original[0]);
    expect(result[1]).toMatchObject({
      id: "select",
      type: choice.type,
      skill: choice.skill,
      maxPoints: choice.maxPoints,
      sourceId: 2,
      quote,
    });
    expect(result[1].prompt).not.toBe(choice.prompt);
    // The fixture now repeats the newly applied question.
    expect((await propose("select")).ok()).toBe(false);
    expect(await saved()).toEqual(result);
    await request.patch(lesson, {
      data: { text: "Первый абзац.\n\nНовый источник.", questions: original },
    });
    const badQuote = await propose("select");
    expect(badQuote.ok()).toBe(false);
    expect((await badQuote.json()).error).toMatch(/цитат|источник|ИИ/i);
    expect(await saved()).toEqual(original);
  } finally {
    await fixture.cleanup();
  }
});
