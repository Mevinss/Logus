import { test, expect } from "@playwright/test";
import { launchFixture } from "./fixture";

test("Открытый практикум восстанавливает личные ответы после замены базы", async ({
  browser,
}) => {
  const fixture = await launchFixture(true);
  const alice = await browser.newContext({
    viewport: { width: 360, height: 780 },
    isMobile: true,
  });
  const bob = await browser.newContext();
  const a = await alice.newPage(),
    b = await bob.newPage();
  const url = fixture.url + "/practice",
    api = fixture.url + "/api/student/public-map-v1";
  const heading = (name: string) =>
    a.getByRole("heading", { name, exact: true });
  const start = a.getByRole("button", { name: /Перейти к заданиям/ });
  const next = a.getByRole("button", { name: /Далее/ });
  try {
    await a.goto(url);
    await start.click();
    await a.getByRole("radio", { name: "3 км", exact: true }).check();
    await expect(a.getByText("Все ответы сохранены")).toBeVisible();
    const id = (await (await alice.request.get(fixture.url + "/api/me")).json())
      .id;
    await fixture.resetServiceStorage();
    await a.reload();
    await expect(
      a.getByRole("radio", { name: "3 км", exact: true }),
    ).toBeChecked();
    await next.click();
    await a.getByRole("radio", { name: "5 см", exact: true }).check();
    await next.click();
    await a.getByRole("radio", { name: "На 2 км", exact: true }).check();
    await next.click();
    const explanation = "Получаю 200 000 сантиметров и перевожу в 2 км.";
    await a.getByRole("textbox", { name: "Ваш ответ" }).fill(explanation);
    await a.getByRole("button", { name: "Сдать работу" }).click();
    await expect(heading("За проверенную часть")).toBeVisible();
    await expect(a.locator(".st-result")).toContainText(
      "2из 3 за проверенные задания",
    );
    await expect(heading("Навыки в этой работе").locator("..")).toContainText(
      "2 из 3",
    );
    await b.goto(url);
    await expect(
      b.getByRole("button", { name: /Перейти к заданиям/ }),
    ).toBeVisible();
    const other = await (await bob.request.get(api)).json();
    expect(other.item.studentId).not.toBe(id);
    expect(other.answers).toEqual({});
    expect(other.item.status).toBe("not_started");

    await a
      .getByRole("button", { name: /Мои занятия/, exact: false })
      .last()
      .click();
    await a.getByRole("tab", { name: "История результатов" }).click();
    await expect(a.getByRole("article")).toContainText("2 из 3");
    await a.getByRole("button", { name: /Открыть результат/ }).click();
    await expect(a).toHaveURL(url);
    await fixture.resetServiceStorage();
    await alice.clearCookies();
    await a.reload();
    await expect(heading("За проверенную часть")).toBeVisible();
    const restored = await (await alice.request.get(api)).json();
    expect(restored.item.studentId).toBe(id);
    expect(restored.item.score).toBeNull();
    expect(restored.item.gradedMaxPoints).toBe(3);
    expect(restored.item.maxPoints).toBe(5);
    expect(Object.values(restored.answers)).toContain(explanation);
    await a.route("**/api/practice", (route) =>
      route.abort("connectionrefused"),
    );
    await a.reload();
    await expect(
      heading("Последний результат на этом устройстве"),
    ).toBeVisible();
    await expect(a.getByText("За проверенную часть · 2 из 3")).toBeVisible();
    await expect(a.getByText("Открытый ответ ожидает проверки.")).toBeVisible();
    await a.unroute("**/api/practice");
    await a.getByRole("button", { name: "Повторить" }).click();
    await expect(heading("За проверенную часть")).toBeVisible();

    await a.getByRole("button", { name: "Выйти" }).click();
    await expect(a).toHaveURL(fixture.url + "/");
    await a.goto(url);
    await expect(start).toBeVisible();
    const nextVisitor = await (await alice.request.get(api)).json();
    expect(nextVisitor.item.studentId).not.toBe(id);
    expect(nextVisitor.answers).toEqual({});
    await a.route("**/api/practice", (route) => route.abort());
    await a.reload();
    await expect(a.getByRole("button", { name: "Повторить" })).toBeVisible();
    await expect(heading("Последний результат на этом устройстве")).toHaveCount(
      0,
    );
  } finally {
    await alice.close();
    await bob.close();
    await fixture.cleanup();
  }
});
