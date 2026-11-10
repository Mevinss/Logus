import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  extractPdf,
  generateQuestions,
  suggestGrade,
} from "../../../lib/material";
import {
  all,
  one,
  run,
  storage,
  ApiError,
  fail,
  found,
  str,
  required,
  id,
  secret,
  login,
  session,
  signIn,
  cookieToken,
  baseUrl,
  groupDto,
  ownedGroup,
  ownedLesson,
  ownedRun,
  saveLesson,
  editLesson,
  questionIssues,
  selected,
  type Lesson,
  type Question,
  type Row,
} from "../../../lib/server-core";
import {
  teacherHome,
  groupReport,
  studentHome,
  studentDetails,
  studentAction,
  teacherDetails,
  grade,
  issueRun,
} from "../../../lib/server-report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path: string[] }> };
async function input(req: Request): Promise<Row> {
  const raw = await req.text();
  if (raw.length > 5000000) fail(413, "Слишком большой запрос.");
  if (!raw.trim()) return {};
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    fail(400, "Ожидается JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    fail(400, "Ожидается объект.");
  return parsed;
}
async function generate(l: Lesson, skill?: string, originalPrompt?: string) {
  const pages = selected(l);
  if (!pages.length || !pages.some((p) => p.text.trim()))
    fail(400, "Выберите страницы с текстом.");
  try {
    const questions = await generateQuestions(pages, skill, originalPrompt);
    return { questions, issues: questionIssues(questions, pages) };
  } catch (e) {
    fail(
      503,
      e instanceof Error
        ? e.message
        : "Генерация недоступна. Попробуйте ещё раз или добавьте вопрос вручную.",
    );
  }
}
async function dispatch(req: Request, parts: string[]) {
  const [resource, k, action, n] = parts,
    method = req.method;
  const is = (m: string, length: number) =>
    method === m && parts.length === length;
  if (method !== "GET") {
    const origin = req.headers.get("origin");
    if (
      origin &&
      new URL(origin).host !== req.headers.get("host") &&
      origin !== new URL(req.url).origin
    )
      fail(403, "Недопустимый источник запроса.");
  }
  if (resource === "login" && is("POST", 1)) {
    const b = await input(req);
    return login(req, b.email, b.password);
  }
  if (resource === "join" && is("POST", 1)) {
    const b = await input(req),
      s = one("SELECT * FROM students WHERE invite=?", required(b.token, 200));
    if (!s) fail(404, "Приглашение не найдено. Уточните ссылку у учителя.");
    return signIn(req, "student", s);
  }
  if (resource === "logout" && is("POST", 1)) {
    run("DELETE FROM sessions WHERE token=?", cookieToken(req));
    return Response.json(
      { ok: true },
      {
        headers: {
          "Set-Cookie":
            "logus_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
        },
      },
    );
  }
  if (resource === "me" && is("GET", 1)) return session(req);
  if (resource === "files" && is("GET", 2)) {
    const u = session(req),
      f = found(one("SELECT * FROM files WHERE id=?", k));
    if (
      u.role === "teacher"
        ? f.teacher !== u.id
        : !one(
            "SELECT r.id FROM assignments a JOIN runs r ON r.id=a.run WHERE a.student=? AND json_extract(r.body,'$.pdfUrl')=?",
            u.id,
            "/api/files/" + k,
          )
    )
      fail(404, "Файл не найден.");
    const bytes = await readFile(
      /* turbopackIgnore: true */ join(storage().dir, "files", f.id + ".pdf"),
    );
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="material.pdf"',
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  if (resource === "student") {
    const u = session(req, "student");
    if (is("GET", 1)) return studentHome(u.id, u.name);
    if (is("GET", 2)) return studentDetails(u.id, k);
    if (
      parts.length === 3 &&
      ((method === "POST" && ["submit", "start"].includes(action)) ||
        (method === "PATCH" && action === "answers"))
    )
      return studentAction(u.id, k, action, await input(req));
    fail(404, "Маршрут не найден.");
  }
  const u = session(req, "teacher"),
    base = baseUrl(req);
  if (resource === "teacher" && is("GET", 1)) return teacherHome(u.id, base);
  if (resource === "groups") {
    if (is("POST", 1)) {
      const data = await input(req),
        key = id();
      run(
        "INSERT INTO groups VALUES(?,?,?)",
        key,
        u.id,
        required(data.name, 180),
      );
      return groupDto(ownedGroup(u.id, key), base);
    }
    const group = ownedGroup(u.id, k || "");
    if (is("GET", 2)) return groupReport(group, base);
    if (action === "students") {
      if (is("POST", 3)) {
        const data = await input(req);
        run(
          "INSERT INTO students VALUES(?,?,?,?)",
          id(),
          k,
          required(data.name, 120),
          secret(),
        );
        return groupDto(group, base);
      }
      if (is("GET", 4)) {
        const s = found(
            one("SELECT name FROM students WHERE id=? AND grp=?", n, k),
          ),
          home = studentHome(n, s.name);
        return { name: s.name, works: home.items, skills: home.skills };
      }
    }
  }
  if (resource === "lessons") {
    if (is("POST", 1)) {
      const data = await input(req);
      const l: Lesson = {
        id: id(),
        title: "Новый урок",
        instruction: "",
        pdfUrl: null,
        pages: [],
        questions: [],
        selectedPages: [],
        updatedAt: "",
      };
      return saveLesson(editLesson(l, data), u.id);
    }
    let l = ownedLesson(u.id, k || "");
    if (is("GET", 2)) return l;
    if (is("PATCH", 2)) {
      const data = await input(req);
      return saveLesson(editLesson(ownedLesson(u.id, k), data), u.id);
    }
    if (action === "generate" && is("POST", 3)) return generate(l);
    if (action === "publish" && is("POST", 3)) {
      const data = await input(req);
      return issueRun(
        ownedLesson(u.id, k),
        ownedGroup(u.id, required(data.groupId)),
        base,
      );
    }
    if (action === "pdf" && is("POST", 3)) {
      const limit = 20 * 1024 * 1024;
      if (Number(req.headers.get("content-length")) > limit + 65536)
        fail(413, "Максимальный размер PDF — 20 МБ.");
      const form = await req.formData(),
        file = form.get("file");
      if (!file || typeof file === "string" || file.size > limit)
        fail(400, "Выберите PDF до 20 МБ.");
      const bytes = Buffer.from(await file.arrayBuffer());
      if (!bytes.subarray(0, 1024).includes(Buffer.from("%PDF-")))
        fail(400, "Не удалось распознать PDF.");
      let texts: string[] = [];
      try {
        texts = await extractPdf(bytes);
      } catch {
        /* Original stays available for manual transcription. */
      }
      if (texts.join("").length > 4000000)
        fail(413, "Загрузите PDF меньшего объёма.");
      const key = id();
      await writeFile(
        /* turbopackIgnore: true */ join(storage().dir, "files", key + ".pdf"),
        bytes,
        { flag: "wx" },
      );
      l = ownedLesson(u.id, k);
      run("INSERT INTO files VALUES(?,?)", key, u.id);
      l.pdfUrl = "/api/files/" + key;
      l.pages = texts.map((text, i) => ({ id: i + 1, text }));
      l.selectedPages = l.pages.filter((p) => p.text.trim()).map((p) => p.id);
      l.questions = [];
      return {
        ...saveLesson(l, u.id),
        ...(!l.selectedPages.length
          ? { warning: "Текст не извлечён. Вставьте текст материала вручную." }
          : {}),
      };
    }
  }
  if (resource === "works" && action) {
    const detail = teacherDetails(u.id, k, action);
    if (is("GET", 3)) return detail;
    if (n === "grade" && is("POST", 4))
      return grade(k, action, await input(req));
    if (n === "suggest" && is("POST", 4)) {
      if (!["pending", "graded"].includes(detail.work.status))
        fail(409, "Работа ещё не сдана.");
      const data = await input(req),
        q = found(
          detail.questions.find(
            (q) => q.id === data.questionId && q.type === "open",
          ),
        );
      try {
        return await suggestGrade(q, String(detail.answers[q.id] || ""));
      } catch (e) {
        fail(
          503,
          e instanceof Error
            ? e.message
            : "Подсказка недоступна. Выставьте балл вручную.",
        );
      }
    }
  }
  if (
    resource === "runs" &&
    is("POST", 3) &&
    ["warmup-preview", "warmup"].includes(action)
  ) {
    const r = ownedRun(u.id, k),
      l: Lesson = JSON.parse(r.body),
      data = await input(req);
    const q = found(l.questions.find((q) => q.id === data.questionId));
    l.pages = l.pages.filter((p) => p.id === q.sourceId);
    l.selectedPages = l.pages.map((p) => p.id);
    if (action === "warmup-preview") return generate(l, q.skill, q.prompt);
    if (
      !Array.isArray(data.questions) ||
      data.questions.length < 1 ||
      data.questions.length > 2 ||
      data.questions.some((v: Question) => !v || v.skill !== q.skill)
    )
      fail(400, "Добавьте одно или два задания на выбранный навык.");
    l.title = data.title ? required(data.title, 240) : "Разминка · " + q.skill;
    l.instruction = "Повторите материал и выполните короткую разминку.";
    l.questions = data.questions;
    return issueRun(
      l,
      ownedGroup(u.id, r.grp),
      base,
      "warmup",
      k,
      data.studentIds,
    );
  }
  fail(404, "Маршрут не найден.");
}
async function handle(req: Request, ctx: Context) {
  try {
    const result = await dispatch(req, (await ctx.params).path);
    return result instanceof Response
      ? result
      : Response.json(result, {
          headers: { "Cache-Control": "private, no-store" },
        });
  } catch (e) {
    if (!(e instanceof ApiError))
      console.error(
        "Logus API",
        e instanceof Error ? e.name + ": " + e.message : "unexpected error",
      );
    return Response.json(
      {
        error:
          e instanceof ApiError
            ? e.message
            : "Не удалось выполнить действие. Попробуйте ещё раз.",
      },
      {
        status: e instanceof ApiError ? e.status : 500,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
export { handle as GET, handle as POST, handle as PATCH };
