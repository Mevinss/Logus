import {
  createHash,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { networkInterfaces } from "node:os";
import { connect } from "./server-schema.mjs";

export type Page = { id: number; text: string };
export type Question = {
  id: string;
  type: "choice" | "open";
  prompt: string;
  options: string[];
  correctIndex: number | null;
  criterion: string;
  maxPoints: number;
  skill: string;
  sourceId: number;
  quote: string;
};
export type Lesson = {
  id: string;
  title: string;
  instruction: string;
  pages: Page[];
  pdfUrl: string | null;
  questions: Question[];
  selectedPages: number[];
  updatedAt: string;
};
export type Row = Record<string, any>;
type Bind = string | number | null;
let cached: ReturnType<typeof connect> | undefined;
export function storage() {
  return (cached ||= connect());
}
export function all(sql: string, ...args: Bind[]): Row[] {
  return storage()
    .db.prepare(sql)
    .all(...args);
}
export function one(sql: string, ...args: Bind[]): Row | undefined {
  return storage()
    .db.prepare(sql)
    .get(...args);
}
export function run(sql: string, ...args: Bind[]) {
  return storage()
    .db.prepare(sql)
    .run(...args);
}
export function transaction<T>(fn: () => T) {
  const { db } = storage();
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function fail(status: number, message: string): never {
  throw new ApiError(status, message);
}
export function found<T>(value: T | undefined | null): T {
  if (!value) fail(404, "Запись не найдена.");
  return value;
}
export function str(value: unknown, max = 1000) {
  if (typeof value !== "string" || value.length > max)
    fail(400, "Проверьте текстовое поле и его длину.");
  return value.trim();
}
export function required(value: unknown, max = 1000) {
  const v = str(value, max);
  if (!v) fail(400, "Заполните обязательное поле.");
  return v;
}
export const id = randomUUID;
const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export const secret = () => randomBytes(32).toString("base64url");
export function cookieToken(req: Request) {
  const value = req.headers
    .get("cookie")
    ?.match(/(?:^|;\s*)logus_session=([a-zA-Z0-9_-]+)/)?.[1];
  return tokenHash(value || "");
}
export function session(req: Request, role?: string) {
  const s = one(
    "SELECT role,user AS id FROM sessions WHERE token=? AND expires>?",
    cookieToken(req),
    Date.now(),
  );
  if (!s) fail(401, "Войдите в свой кабинет.");
  if (role && s.role !== role) fail(403, "Доступ ограничен.");
  const who = found(
    one(
      "SELECT name FROM " +
        (s.role === "teacher" ? "teachers" : "students") +
        " WHERE id=?",
      s.id,
    ),
  );
  return { ...s, name: who.name } as { id: string; name: string; role: string };
}
const loginFailures = new Map<string, { n: number; until: number }>();
export function login(req: Request, email: unknown, password: unknown) {
  const address = required(email, 320).toLowerCase(),
    pw = required(password, 4096);
  const failures = loginFailures.get(address);
  if (failures && failures.until > Date.now() && failures.n >= 12)
    fail(429, "Слишком много попыток. Подождите пять минут.");
  const teacher = one("SELECT * FROM teachers WHERE email=?", address);
  const digest = scryptSync(pw, teacher?.salt || "logus-invalid-login", 64);
  if (!teacher || !timingSafeEqual(digest, Buffer.from(teacher.hash, "hex"))) {
    if (loginFailures.size > 5000) loginFailures.clear();
    loginFailures.set(address, {
      n: (failures && failures.until > Date.now() ? failures.n : 0) + 1,
      until: Date.now() + 300000,
    });
    fail(401, "Проверьте почту и пароль.");
  }
  loginFailures.delete(address);
  return signIn(req, "teacher", teacher);
}
export function signIn(req: Request, role: string, user: Row) {
  const token = secret(),
    days = 30;
  transaction(() => {
    run(
      "DELETE FROM sessions WHERE token=? OR expires<=?",
      cookieToken(req),
      Date.now(),
    );
    run(
      "INSERT INTO sessions VALUES(?,?,?,?)",
      tokenHash(token),
      role,
      user.id,
      Date.now() + days * 86400000,
    );
  });
  return Response.json(
    { id: user.id, name: user.name, role },
    {
      headers: {
        "Set-Cookie": `logus_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${days * 86400}${new URL(req.url).protocol === "https:" ? "; Secure" : ""}`,
        "Cache-Control": "no-store",
      },
    },
  );
}
export function baseUrl(req: Request) {
  if (process.env.PUBLIC_BASE_URL)
    return process.env.PUBLIC_BASE_URL.replace(/\/+$/, "");
  const url = new URL(req.url);
  if (["localhost", "127.0.0.1", "0.0.0.0", "[::1]"].includes(url.hostname)) {
    const cards = Object.entries(networkInterfaces())
      .flatMap(([name, addresses]) =>
        (addresses || []).map((a) => ({ ...a, name })),
      )
      .filter(
        (a) =>
          a.family === "IPv4" &&
          !a.internal &&
          !a.address.startsWith("169.254."),
      );
    const best =
      cards.find((a) => /wi-?fi|wireless|беспровод/i.test(a.name)) ||
      cards.find((a) => !/virtual|wsl|vpn|hyper|docker/i.test(a.name)) ||
      cards[0];
    if (best) url.hostname = best.address;
  }
  return url.origin;
}
export function ownedGroup(teacher: string, group: string) {
  return found(
    one("SELECT * FROM groups WHERE teacher=? AND id=?", teacher, group),
  );
}
export function groupDto(group: Row, base: string) {
  const students = all(
    "SELECT id,name,invite FROM students WHERE grp=? ORDER BY rowid",
    group.id,
  ).map((s) => ({
    id: s.id,
    name: s.name,
    inviteUrl: base + "/invite/" + s.invite,
  }));
  return { id: group.id, name: group.name, students };
}
export function ownedLesson(teacher: string, lesson: string): Lesson {
  return JSON.parse(
    found(
      one("SELECT body FROM lessons WHERE teacher=? AND id=?", teacher, lesson),
    ).body,
  );
}
export function ownedRun(teacher: string, runId: string) {
  return found(
    one(
      "SELECT r.*,g.name AS groupName FROM runs r JOIN groups g ON r.grp=g.id WHERE g.teacher=? AND r.id=?",
      teacher,
      runId,
    ),
  );
}
export const normalized = (s: string) => s.replace(/\s+/gu, " ").trim();
export function questionIssues(questions: Question[], pages: Page[]) {
  const issues: string[] = [],
    ids = new Set<string>();
  if (!Array.isArray(questions) || !questions.length)
    return ["Добавьте хотя бы один вопрос."];
  if (questions.length > 100) return ["Допускается до 100 вопросов."];
  questions.forEach((q, i) => {
    const err = (s: string) => issues.push(`Вопрос ${i + 1}: ${s}`);
    if (!q || typeof q !== "object") {
      err("проверьте структуру.");
      return;
    }
    if (
      typeof q.id !== "string" ||
      !q.id ||
      ids.has(q.id) ||
      ["__proto__", "constructor", "prototype"].includes(q.id)
    )
      err("проверьте идентификатор.");
    ids.add(q.id);
    if (!["choice", "open"].includes(q.type)) err("укажите тип.");
    if (typeof q.prompt !== "string" || !q.prompt.trim())
      err("введите формулировку.");
    if (typeof q.skill !== "string" || !q.skill.trim()) err("укажите навык.");
    if (!Number.isInteger(q.maxPoints) || q.maxPoints < 1 || q.maxPoints > 100)
      err("укажите балл от 1 до 100.");
    if (
      q.type === "choice" &&
      (!Array.isArray(q.options) ||
        q.options.length < 2 ||
        q.options.length > 20 ||
        q.options.some((v) => typeof v !== "string" || !v.trim()) ||
        !Number.isInteger(q.correctIndex) ||
        q.correctIndex === null ||
        q.correctIndex < 0 ||
        q.correctIndex >= q.options.length)
    )
      err("проверьте варианты и ключ.");
    if (
      q.type === "open" &&
      (typeof q.criterion !== "string" || !q.criterion.trim())
    )
      err("добавьте критерий.");
    const p = pages.find((p) => p.id === q.sourceId);
    if (
      !p ||
      typeof q.quote !== "string" ||
      !normalized(q.quote) ||
      !normalized(p.text).includes(normalized(q.quote))
    )
      err("проверьте цитату на выбранной странице.");
  });
  return issues;
}
export function selected(l: Lesson) {
  return l.pages.filter((p) => l.selectedPages.includes(p.id));
}
export function checkQuestions(questions: Question[], pages: Page[]) {
  const issues = questionIssues(questions, pages);
  if (issues.length) fail(400, issues.join(" "));
}
export function saveLesson(l: Lesson, teacher: string) {
  l.updatedAt = new Date().toISOString();
  run(
    "INSERT INTO lessons VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body",
    l.id,
    teacher,
    JSON.stringify(l),
  );
  return l;
}
export function editLesson(l: Lesson, data: Row) {
  if ("title" in data) l.title = required(data.title, 240);
  if ("instruction" in data) l.instruction = str(data.instruction, 20000);
  if ("text" in data) {
    l.pages = str(data.text, 2000000)
      .split(/\r?\n\s*\n/)
      .map((t) => t.trim())
      .filter(Boolean)
      .map((text, i) => ({ id: i + 1, text }));
    l.selectedPages = l.pages.map((p) => p.id);
    l.pdfUrl = null;
    l.questions = [];
  }
  if ("selectedPages" in data) {
    if (
      !Array.isArray(data.selectedPages) ||
      data.selectedPages.some((n: unknown) => !l.pages.some((p) => p.id === n))
    )
      fail(400, "Неизвестная страница.");
    l.selectedPages = [...new Set<number>(data.selectedPages)];
  }
  if ("questions" in data) {
    if (
      !Array.isArray(data.questions) ||
      data.questions.length > 100 ||
      data.questions.some((q: unknown) => q === null || typeof q !== "object")
    )
      fail(400, "Некорректный список вопросов.");
    l.questions = data.questions;
  }
  return l;
}
