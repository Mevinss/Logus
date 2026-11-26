import { test, expect, request } from "@playwright/test";
import { launchFixture } from "./fixture";

test("демо-кабинет учителя открывается без пароля и содержит класс и урок", async () => {
  const fixture = await launchFixture();
  const ctx = await request.newContext();
  try {
    const res = await ctx.post(fixture.url + "/api/demo-teacher", { data: {} });
    expect(res.ok(), await res.text()).toBeTruthy();
    expect((await res.json()).role).toBe("teacher");
    const home = await (await ctx.get(fixture.url + "/api/teacher")).json();
    const group = home.groups.find((g: { name: string }) => g.name === "Демо-класс");
    expect(group.students).toHaveLength(5);
    const run = home.runs.find((r: { title: string }) => r.title === "Остров Лемара · демо");
    expect(run.assigned).toBe(5);
    expect(run.submitted).toBe(3);
    // Each sandbox is private: a second visitor gets their own class.
    const other = await request.newContext();
    await other.post(fixture.url + "/api/demo-teacher", { data: {} });
    const otherHome = await (await other.get(fixture.url + "/api/teacher")).json();
    expect(otherHome.groups.map((g: { id: string }) => g.id)).not.toContain(group.id);
    await other.dispose();
  } finally {
    await ctx.dispose();
    await fixture.cleanup();
  }
});
