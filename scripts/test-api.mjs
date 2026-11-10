import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { registerHooks, stripTypeScriptTypes } from "node:module";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

// Exercise the real route handlers with isolated persistent storage and separate cookies.
const root = fileURLToPath(new URL("../", import.meta.url));
const dir = await mkdtemp(path.join(tmpdir(), "logus-test-"));
process.env.LOGUS_DATA_DIR = dir;
process.env.TEACHER_EMAIL = "test@logus.local";
process.env.TEACHER_PASSWORD = randomUUID();
process.env.PUBLIC_BASE_URL = "http://192.168.1.100:3000";
delete process.env.OPENAI_API_KEY;
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (
      context.parentURL?.endsWith(".ts") &&
      !context.parentURL.includes("/node_modules/") &&
      specifier.startsWith(".") &&
      !path.extname(specifier)
    )
      specifier += ".ts";
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith(".ts") && url.startsWith(pathToFileURL(root).href)) {
      const source = stripTypeScriptTypes(
        readFileSync(fileURLToPath(url), "utf8"),
        { mode: "transform" },
      );
      return { format: "module", source, shortCircuit: true };
    }
    return next(url, context);
  },
});
try {
  const setup = () =>
    execFileSync(process.execPath, ["scripts/setup.mjs"], {
      cwd: root,
      env: process.env,
      stdio: "pipe",
    });
  setup();
  setup();
  const handlers = await import("../app/api/[...path]/route.ts");
  const route = async (cookie, method, p, data, expected = 200) => {
    const request = new Request("http://localhost:3000/api/" + p, {
      method,
      headers: { cookie, "content-type": "application/json" },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    const response = await handlers[method](request, {
      params: Promise.resolve({ path: p.split("/") }),
    });
    const body = await response.json();
    assert.equal(
      response.status,
      expected,
      method + " " + p + " " + JSON.stringify(body),
    );
    return response.headers.has("set-cookie")
      ? response.headers.get("set-cookie").split(";")[0]
      : body;
  };
  const login = () =>
    route("", "POST", "login", {
      email: process.env.TEACHER_EMAIL,
      password: process.env.TEACHER_PASSWORD,
    });
  const tc = await login(),
    t = (...a) => route(tc, ...a);
  const { pdfFixture } = await import("../tests/fixture.ts");
  const pdfLesson = await t("POST", "lessons", { title: "PDF" });
  const form = new FormData();
  form.set(
    "file",
    new Blob([pdfFixture()], { type: "application/pdf" }),
    "pages.pdf",
  );
  const pdfPath = ["lessons", pdfLesson.id, "pdf"];
  const upload = await handlers.POST(
    new Request("http://localhost:3000/api/" + pdfPath.join("/"), {
      method: "POST",
      headers: { cookie: tc },
      body: form,
    }),
    { params: Promise.resolve({ path: pdfPath }) },
  );
  const material = await upload.json();
  assert.equal(upload.status, 200);
  assert.equal(material.pages.length, 2);
  assert.match(material.pages[1].text, /Cold water condenses/);
  const original = await handlers.GET(
    new Request("http://localhost:3000" + material.pdfUrl, {
      headers: { cookie: tc },
    }),
    { params: Promise.resolve({ path: material.pdfUrl.split("/").slice(2) }) },
  );
  assert.equal(original.status, 200);
  assert.deepEqual(Buffer.from(await original.arrayBuffer()), pdfFixture());
  const g = await t("POST", "groups", { name: "Группа" });
  await t("POST", "groups/" + g.id + "/students", { name: "Анна" });
  const group = await t("POST", "groups/" + g.id + "/students", {
    name: "Борис",
  });
  const [a, b] = group.students;
  assert.match(a.inviteUrl, /^http:\/\/192\.168\.1\.100:3000\/invite\//);
  const join = async (s) =>
    route("", "POST", "join", { token: s.inviteUrl.split("/").pop() });
  const ac = await join(a),
    bc = await join(b),
    student = (...args) => route(ac, ...args);
  await student("GET", material.pdfUrl.slice(5), undefined, 404);
  const l = await t("POST", "lessons", {
    title: "Закон",
    text: "Цвет неба синий.\n\nЦвет травы зелёный.",
  });
  const choice = {
    id: "q1",
    type: "choice",
    prompt: "Цвет неба?",
    options: ["Синий", "Красный"],
    correctIndex: 0,
    criterion: "",
    maxPoints: 2,
    skill: "Цвет",
    sourceId: 1,
    quote: "неба синий",
  };
  const open = {
    ...choice,
    id: "q2",
    type: "open",
    prompt: "Какой цвет?",
    options: [],
    correctIndex: null,
    criterion: "Назван синий",
    maxPoints: 3,
  };
  const le = "lessons/" + l.id;
  await t("PATCH", le, {
    selectedPages: [1],
    questions: [{ ...choice, quote: "несуществующая цитата" }],
  });
  await t("POST", le + "/publish", { groupId: g.id }, 400);
  await t("PATCH", le, { questions: [choice, open] });
  await t("POST", le + "/generate", {}, 503);
  const first = await t("POST", le + "/publish", { groupId: g.id });
  await t("PATCH", le, {
    questions: [{ ...choice, prompt: "Новая редакция" }],
  });
  const path = "student/" + first.id,
    work = "works/" + first.id + "/" + a.id;
  const snapshot = await student("GET", path);
  assert.equal(snapshot.pages.length, 1);
  assert.equal(snapshot.questions[0].prompt, "Цвет неба?");
  for (const q of snapshot.questions)
    for (const k of ["correctIndex", "criterion", "quote"])
      assert(!Object.hasOwn(q, k));
  await student("POST", path + "/start", {});
  await student("PATCH", path + "/answers", { answers: { q1: 1 } });
  await student("PATCH", path + "/answers", { answers: { q2: "Небо синее." } });
  assert.deepEqual((await student("GET", path)).answers, {
    q1: 1,
    q2: "Небо синее.",
  });
  const submitted = await student("POST", path + "/submit", {});
  assert.equal(submitted.score, null);
  assert.equal(submitted.status, "pending");
  assert.equal(submitted.earned, 0);
  assert.deepEqual(
    await student("POST", path + "/submit", { answers: { q1: 0 } }),
    submitted,
  );
  await student("PATCH", path + "/answers", { answers: { q1: 0 } }, 409);
  const report = () => t("GET", "groups/" + g.id);
  let journal = await report();
  assert.deepEqual(
    [
      journal.runs[0].assigned,
      journal.runs[0].started,
      journal.runs[0].submitted,
      journal.runs[0].pending,
    ],
    [2, 1, 1, 1],
  );
  assert.equal(journal.metrics[0].wrongOption, "Красный");
  assert.equal(journal.metrics[0].answered, 1);
  assert.equal(journal.works.find((w) => w.studentId === b.id).score, null);
  await student("GET", work, undefined, 403);
  await t("POST", work + "/suggest", { questionId: "q2" }, 503);
  await t("POST", work + "/grade", { points: { q2: 4 } }, 400);
  await t("POST", work + "/grade", { points: { q2: 2 }, comment: "Принято" });
  assert.equal((await student("GET", path)).item.score, 2);
  const warm = await t("POST", "runs/" + first.id + "/warmup", {
    questionId: "q1",
    questions: [{ ...choice, id: "w1", prompt: "Какого цвета дневное небо?" }],
    studentIds: [a.id],
  });
  await route(bc, "GET", "student/" + warm.id, undefined, 404);
  assert(
    !(await route(bc, "GET", "student")).items.some((i) => i.runId === warm.id),
  );
  await student("POST", "student/" + warm.id + "/submit", {
    answers: { w1: 0 },
  });
  journal = await report();
  assert.equal(
    journal.works.find((w) => w.runId === first.id && w.studentId === a.id)
      .score,
    2,
  );
  assert.equal(journal.works.find((w) => w.runId === warm.id).score, 2);
  assert.deepEqual((await student("GET", "student")).skills, [
    { skill: "Цвет", earned: 4, maxPoints: 7 },
  ]);
  const g2 = await t("POST", "groups", { name: "Вторая" });
  await t("POST", "groups/" + g2.id + "/students", { name: "Ирина" });
  const otherRun = await t("POST", le + "/publish", { groupId: g2.id });
  assert.notEqual(otherRun.id, first.id);
  await student("GET", "student/" + otherRun.id, undefined, 404);
  process.env.TEACHER_EMAIL = "another@logus.local";
  setup();
  const other = await login();
  await route(other, "GET", work, undefined, 404);
  await route(other, "GET", "groups/" + g.id, undefined, 404);
  assert.deepEqual((await route(other, "GET", "teacher")).lessons, []);
  const record = execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      "import {connect} from './lib/server-schema.mjs';const {db}=connect();console.log(db.prepare('SELECT count(*) AS n FROM assignments WHERE status=?').get('graded').n);db.close()",
    ],
    { cwd: root, env: process.env, encoding: "utf8" },
  );
  assert.equal(record.trim(), "2");
  console.log(
    "API: PDF, роли, версии, проверка цитат, автосохранение, идемпотентная сдача, оценки, журнал, аналитика, адресная разминка, повторное проведение и SQLite — успешно.",
  );
} finally {
  const { storage } = await import("../lib/server-core.ts");
  storage().db.close();
  hooks.deregister();
  await rm(dir, { recursive: true, force: true });
}
