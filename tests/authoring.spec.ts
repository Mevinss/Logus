import { test, expect } from "@playwright/test";
import { launchFixture, pdfFixture, teacherLogin, quote } from "./fixture";
test.use({actionTimeout:15000});

test("configurable authoring persists explanations, ordering, settings and scoped source search", async ({
  browser,
}) => {
  const fixture = await launchFixture();
  const context = await browser.newContext({
    viewport: { width: 1200, height: 900 },
  });
  const page = await context.newPage();
  try {
    const login = await context.request.post(fixture.url + "/api/login", {
      data: teacherLogin,
    });
    expect(login.ok()).toBeTruthy();
    await page.goto(fixture.url);
    await page
      .getByRole("button", { name: "Мои уроки", exact: true })
      .first()
      .click();
    await page
      .getByRole("button", { name: /Создать урок/ })
      .first()
      .click();
    await page
      .getByLabel("Название урока")
      .fill("Authoring verification");
    await page
      .getByRole("button", { name: "Перейти в редактор", exact: true })
      .click();
    await page
      .locator("input[type=file]")
      .setInputFiles({
        name: "source.pdf",
        mimeType: "application/pdf",
        buffer: pdfFixture(),
      });
    await expect(
      page.getByRole("checkbox", { name: /Стр\. 2$/ }),
    ).toBeChecked();
    await page.getByRole("checkbox", { name: /Стр\. 1$/ }).uncheck();
    await page.getByLabel("Количество вопросов").fill("3");
    await page.getByLabel("Открытых вопросов").fill("1");
    await page.getByLabel("Язык теста").selectOption("en");
    await page
      .getByLabel("Тематический акцент")
      .fill("condensation");
    await page
      .getByRole("button", { name: "Сгенерировать вопросы", exact: true })
      .click();
    await expect(page.locator("article.t-question")).toHaveCount(3);
    await expect(
      page.getByLabel("Объяснение ответа").first(),
    ).not.toHaveValue("");
    await page
      .getByLabel("Объяснение ответа")
      .first()
      .fill("Teacher verified explanation.");
    const first = await page
      .getByLabel("Формулировка")
      .first()
      .inputValue();
    await page
      .getByRole("button", { name: "Опустить вопрос", exact: true })
      .first()
      .click();
    await expect(
      page.getByLabel("Формулировка").nth(1),
    ).toHaveValue(first);
    await page
      .getByLabel("Длительность, минут (пусто — без таймера)")
      .fill("25");
    await page
      .getByRole("button", { name: "Сохранить черновик", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("Черновик сохранён.");
    await page
      .getByLabel("Слова или тема в материалах")
      .fill("condenses");
    await page
      .getByRole("button", { name: "Найти фрагменты", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: new RegExp("source.pdf:.*Cold water") }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Предпросмотр ученика", exact: true })
      .click();
    const preview = page.getByRole("dialog");
    await expect(preview.locator("article.t-question")).toHaveCount(3);
    await expect(
      preview.getByText("Teacher verified explanation."),
    ).toHaveCount(0);
    await preview.getByRole("button", { name: "Закрыть", exact: true }).click();
    const result = await context.request.get(fixture.url + "/api/teacher");
    expect(result.ok()).toBeTruthy();
    const body = await result.json();
    const lesson = body.lessons.find(
      (l: { title: string }) => l.title === "Authoring verification",
    );
    expect(lesson).toBeTruthy();
    expect(lesson.settings.durationMinutes).toBe(25);
    expect(lesson.questions[1].prompt).toBe(first);
    expect(lesson.questions[1].quote).toBe(quote);
  } finally {
    await context.close();
    await fixture.cleanup();
  }
});
