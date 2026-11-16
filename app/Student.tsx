"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Brand from "./Brand";
import ScaleLab from "./ScaleLab";
import {
  practiceRun,
  savePracticeAnswers,
  savePracticeResult,
} from "./practice-storage";
import "./student.css";

type Answers = Record<string, number | string>;
type Status = "not_started" | "in_progress" | "pending" | "graded";
type Item = {
  runId: string;
  title: string;
  status: Status;
  kind: "lesson" | "warmup";
  parentId: string | null;
  instruction: string;
  earned: number;
  gradedMaxPoints: number;
  maxPoints: number;
  score: number | null;
  comment: string;
};
type Question = {
  id: string;
  type: "choice" | "open";
  prompt: string;
  options: string[];
  maxPoints: number;
  skill: string;
  sourceId: number;
};
type Home = {
  name: string;
  items: Item[];
  skills: { skill: string; earned: number; maxPoints: number }[];
};
type Lesson = {
  item: Item;
  pages: { id: number; text: string }[];
  pdfUrl: string | null;
  questions: Question[];
  answers: Answers;
  points: Record<string, number>;
  warmups: Item[];
  review: { runId: string | null; rows: { label: string; before: number; after: number | null }[] } | null;
};
function lessonSkills(lesson: Lesson) {
  const skills = new Map<
    string,
    { skill: string; earned: number; maxPoints: number }
  >();
  for (const q of lesson.questions) {
    if (!Object.hasOwn(lesson.points, q.id)) continue;
    const row = skills.get(q.skill) || {
      skill: q.skill,
      earned: 0,
      maxPoints: 0,
    };
    row.earned += lesson.points[q.id];
    row.maxPoints += q.maxPoints;
    skills.set(q.skill, row);
  }
  return [...skills.values()];
}
type Queue = Record<string, Answers>;
type View = "home" | "lesson" | "test" | "result";
const statusText = {
  not_started: "Не начал",
  in_progress: "В процессе",
  pending: "Ожидает проверки",
  graded: "Проверено",
};
const completed = (s: Status) => s === "graded" || s === "pending";
const kind = (item: Item) => (item.kind === "warmup" ? "Разминка" : "Урок");
const answered = (a: number | string | undefined) =>
  typeof a === "number" || !!a?.trim();
function message(e: unknown) {
  return e instanceof Error ? e.message : "Не удалось выполнить действие.";
}
class SessionExpired extends Error {}
async function requestStudent<T>(
  studentId: string,
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch("/api/student" + path, {
      method,
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "X-Logus-Student": studentId,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error("Нет связи с сервером. Проверьте подключение.");
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401)
    throw new SessionExpired(data.error || "Сессия завершена.");
  if (!res.ok)
    throw new Error(data.error || "Не удалось получить данные с сервера.");
  return data;
}
function loadQueue(key: string): Queue {
  try {
    return JSON.parse(localStorage.getItem(key) || "{}") || {};
  } catch {
    return {};
  }
}
function testPosition(key: string) {
  try {
    const value = sessionStorage.getItem(key);
    return value === null ? null : Number(value) || 0;
  } catch {
    return null;
  }
}

export default function Student({
  name,
  studentId,
  onLogout,
  initialRun,
  practiceMode = false,
  onSessionExpired,
}: {
  name: string;
  studentId: string;
  onLogout: () => void;
  initialRun?: string | null;
  practiceMode?: boolean;
  onSessionExpired?: () => void;
}) {
  const api = useCallback(
    async <T,>(path: string, method = "GET", body?: unknown) => {
      try {
        return await requestStudent<T>(studentId, path, method, body);
      } catch (e) {
        if (e instanceof SessionExpired) onSessionExpired?.();
        throw e;
      }
    },
    [studentId, onSessionExpired],
  );
  const [run, setRun] = useState<string | null>(initialRun || null);
  const [home, setHome] = useState<Home | null>(null);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [view, setView] = useState<View>(initialRun ? "lesson" : "home");
  const [tab, setTab] = useState<"active" | "history">("active");
  const [position, setPosition] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [revision, setRevision] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [localWarning, setLocalWarning] = useState(false);
  const queue = useRef<Queue>({});
  const syncTask = useRef<Promise<void> | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const sourceTarget = useRef<number | null>(null);
  const draftKey = "logus:outbox:" + studentId;
  const posKey = (id: string) => draftKey + ":" + id + ":position";
  const persist = useCallback(() => {
    try {
      localStorage.setItem(draftKey, JSON.stringify(queue.current));
      setLocalWarning(false);
    } catch {
      setLocalWarning(true);
    }
    setRevision((n) => n + 1);
  }, [draftKey]);
  const sync = useCallback(async () => {
    if (syncTask.current) return syncTask.current;
    if (!Object.keys(queue.current).length) return;
    const work = async () => {
      setSyncing(true);
      try {
        for (const id of Object.keys(queue.current)) {
          while (queue.current[id]) {
            const delta = { ...queue.current[id] };
            await api("/" + id + "/answers", "PATCH", { answers: delta });
            for (const q of Object.keys(delta))
              if (queue.current[id]?.[q] === delta[q])
                delete queue.current[id][q];
            if (!Object.keys(queue.current[id] || {}).length)
              delete queue.current[id];
            persist();
          }
        }
        setSyncError("");
      } catch (e) {
        setSyncError(message(e));
      } finally {
        setSyncing(false);
      }
    };
    syncTask.current = work();
    try {
      await syncTask.current;
    } finally {
      syncTask.current = null;
    }
  }, [persist, api]);
  useEffect(() => {
    queue.current = loadQueue(draftKey);
    const retry = () => {
      void sync();
    };
    retry();
    window.addEventListener("online", retry);
    const timer = setInterval(retry, 5000);
    return () => {
      clearInterval(timer);
      clearTimeout(debounce.current);
      window.removeEventListener("online", retry);
    };
  }, [draftKey, sync]);
  useEffect(() => {
    const onPop = () => {
      const id =
        practiceMode && location.pathname === "/practice"
          ? new URLSearchParams(location.search).has("home")
            ? null
            : practiceRun
          : location.pathname.match(/^\/student\/([^/]+)/)?.[1] || null;
      setRun(id);
      setView(id ? "lesson" : "home");
      setConfirm(false);
      setError("");
      setLesson(null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [practiceMode]);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    setError("");
    if (!run) {
      const refresh = () =>
        api<Home>("")
          .then((data) => {
            if (active) {
              setHome(data);
              setError("");
            }
          })
          .catch((e) => {
            if (active) setError(message(e));
          });
      void refresh();
      const timer = setInterval(refresh, 8000);
      window.addEventListener("focus", refresh);
      return () => {
        active = false;
        clearInterval(timer);
        window.removeEventListener("focus", refresh);
      };
    }
    api<Lesson>("/" + run)
      .then((data) => {
        if (!active) return;
        setLesson(data);
        setAnswers({ ...data.answers, ...queue.current[run] });
        const saved = testPosition(draftKey + ":" + run + ":position");
        if (completed(data.item.status)) {
          if (queue.current[run]) {
            delete queue.current[run];
            persist();
          }
          setView("result");
        } else if (data.item.status === "in_progress" && saved !== null) {
          setPosition(
            Math.min(
              Math.max(saved, 0),
              Math.max(0, data.questions.length - 1),
            ),
          );
          setView("test");
        } else setView("lesson");
      })
      .catch((e) => {
        if (active) setError(message(e));
      });
    return () => {
      active = false;
    };
  }, [run, reload, draftKey, persist, api]);
  useEffect(() => {
    if (!run || view !== "result") return;
    let active = true;
    const refresh = () =>
      api<Lesson>("/" + run)
        .then((data) => {
          if (active) {
            setLesson(data);
            setError("");
          }
        })
        .catch((e) => {
          if (active) setError(message(e));
        });
    const timer = setInterval(refresh, 6000);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [run, view, api]);
  useEffect(() => {
    if (view !== "lesson" || sourceTarget.current === null) return;
    document
      .getElementById("st-source-" + sourceTarget.current)
      ?.scrollIntoView({ block: "start" });
    sourceTarget.current = null;
  }, [view]);
  useEffect(() => {
    if (run !== practiceRun || !lesson || !completed(lesson.item.status))
      return;
    const { item } = lesson;
    savePracticeAnswers(studentId, lesson.answers, true);
    savePracticeResult(studentId, {
      title: item.title,
      status: item.status === "graded" ? "graded" : "pending",
      earned: item.score ?? item.earned,
      maximum: item.gradedMaxPoints,
      savedAt: new Date().toISOString(),
      skills: lessonSkills(lesson),
    });
  }, [studentId, run, lesson]);
  function navigate(id: string | null) {
    setLesson(null);
    setRun(id);
    setView(id ? "lesson" : "home");
    setConfirm(false);
    setError("");
    setBusy(false);
    history.pushState(
      {},
      "",
      practiceMode && (!id || id === practiceRun)
        ? id
          ? "/practice"
          : "/practice?home"
        : id
          ? "/student/" + id
          : "/student",
    );
    window.scrollTo(0, 0);
  }
  function at(i: number) {
    setPosition(i);
    setConfirm(false);
    try {
      if (run) sessionStorage.setItem(posKey(run), String(i));
    } catch {}
  }
  async function openReview() {
    if (!lesson?.review || busy) return;
    if (lesson.review.runId) return navigate(lesson.review.runId);
    setBusy(true);
    setError("");
    try {
      const result = await api<{runId: string}>("/" + practiceRun + "/review", "POST", {});
      navigate(result.runId);
    } catch (e) { setError(message(e)); }
    finally { setBusy(false); }
  }
  async function start() {
    if (!run || !lesson || busy) return;
    setBusy(true);
    setError("");
    try {
      await api("/" + run + "/start", "POST", {});
      at(testPosition(posKey(run)) || 0);
      setView("test");
      window.scrollTo(0, 0);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  function answer(q: string, value: number | string) {
    if (!run) return;
    if (
      run === practiceRun &&
      !savePracticeAnswers(studentId, { ...answers, [q]: value }, false)
    )
      setLocalWarning(true);
    setAnswers((old) => ({ ...old, [q]: value }));
    queue.current[run] = { ...queue.current[run], [q]: value };
    persist();
    setConfirm(false);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => void sync(), 350);
  }
  const submitLock = useRef(false);
  async function submit() {
    if (!run || submitLock.current) return;
    submitLock.current = true;
    setBusy(true);
    setError("");
    clearTimeout(debounce.current);
    try {
      if (syncTask.current) await syncTask.current;
      await api("/" + run + "/submit", "POST", {
        answers: { ...queue.current[run] },
      });
      if (run === practiceRun && !savePracticeAnswers(studentId, answers, true))
        setLocalWarning(true);
      delete queue.current[run];
      persist();
      try {
        sessionStorage.removeItem(posKey(run));
      } catch {}
      setConfirm(false);
      setReload((n) => n + 1);
    } catch (e) {
      setError(message(e));
    } finally {
      submitLock.current = false;
      setBusy(false);
    }
  }
  const draft = run ? queue.current[run] || {} : {};
  const pending = Object.keys(draft).length;
  const pendingNumbers = lesson?.questions
    .flatMap((question, index) =>
      Object.hasOwn(draft, question.id) ? [index + 1] : [],
    )
    .join(", ");
  const q = lesson?.questions[position];
  const count =
    lesson?.questions.filter((item) => answered(answers[item.id])).length || 0;
  function tile(item: Item) {
    const done = completed(item.status);
    return (
      <article className="st-card" key={item.runId}>
        <div className="st-split">
          <span className="st-tag">{kind(item)}</span>
          <span className="st-status">{statusText[item.status]}</span>
        </div>
        <h3>{item.title}</h3>
        <div className="st-split">
          {done ? (
            <span>
              {item.status === "graded" ? "Итог" : "За проверенную часть"} ·{" "}
              <b>
                {item.score ?? item.earned} из {item.gradedMaxPoints}
              </b>
            </span>
          ) : (
            <span />
          )}
          <button className="st-btn" onClick={() => navigate(item.runId)}>
            {done
              ? "Открыть результат"
              : item.kind === "warmup"
                ? "Открыть разминку"
                : "Открыть урок"}{" "}
            →
          </button>
        </div>
      </article>
    );
  }
  return (
    <div className="st-app">
      <header className="st-top">
        <div className="st-topin">
          <button
            className="st-brand"
            onClick={() => navigate(null)}
            aria-label="Logus — мои занятия"
          >
            <Brand />
          </button>
          <span className="st-role">Кабинет ученика</span>
          <button className="st-ghost st-logout" onClick={onLogout}>
            Выйти
          </button>
        </div>
      </header>
      <main className="st-main">
        {run && (
          <button className="st-back" onClick={() => navigate(null)}>
            ← Мои занятия
          </button>
        )}
        {error && (
          <div className="st-error" role="alert">
            {error}{" "}
            <button className="st-link" onClick={() => setReload((n) => n + 1)}>
              Обновить
            </button>
          </div>
        )}
        {view === "home" && (
          <>
            <div className="st-heading">
              <span className="st-sub">{name}</span>
              <h1>Мои занятия</h1>
            </div>
            <div className="st-tabs" role="tablist" aria-label="Занятия">
              <button
                role="tab"
                aria-selected={tab === "active"}
                onClick={() => setTab("active")}
              >
                Назначено
              </button>
              <button
                role="tab"
                aria-selected={tab === "history"}
                onClick={() => setTab("history")}
              >
                История результатов
              </button>
            </div>
            {home ? (
              <>
                <div className="st-cards">
                  {home.items
                    .filter((i) => completed(i.status) === (tab === "history"))
                    .map(tile)}
                  {!home.items.some(
                    (i) => completed(i.status) === (tab === "history"),
                  ) && (
                    <div className="st-card">
                      <h3>
                        {tab === "active"
                          ? "Пока нет назначенных занятий"
                          : "Здесь появятся ваши результаты"}
                      </h3>
                      <p className="st-sub">
                        {tab === "active"
                          ? "Когда преподаватель назначит урок или разминку, вы увидите их здесь."
                          : "Сдайте первую работу, чтобы увидеть баллы и комментарий преподавателя."}
                      </p>
                    </div>
                  )}
                </div>
                {tab === "history" && home.skills.length > 0 && (
                  <section className="st-card">
                    <h2>Баллы по навыкам</h2>
                    {home.skills.map((s) => (
                      <div className="st-scoreline" key={s.skill}>
                        <span>{s.skill}</span>
                        <strong>
                          {s.earned} из {s.maxPoints}
                        </strong>
                      </div>
                    ))}
                  </section>
                )}
              </>
            ) : (
              !error && <p role="status">Загружаем занятия…</p>
            )}
          </>
        )}
        {run && !lesson && !error && <p role="status">Загружаем занятие…</p>}
        {lesson && view === "lesson" && (
          <>
            <div className="st-heading">
              <span className="st-sub">{kind(lesson.item)} · Материал</span>
              <h1>{lesson.item.title}</h1>
              {lesson.item.instruction && (
                <p className="st-text">{lesson.item.instruction}</p>
              )}
            </div>
            <section className="st-card">
              <div className="st-split">
                <h2>Материал занятия</h2>
                {lesson.pdfUrl && (
                  <a
                    className="st-link"
                    href={lesson.pdfUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Открыть оригинал PDF ↗
                  </a>
                )}
              </div>
              {lesson.pages.map((p) => (
                <article
                  className="st-page"
                  key={p.id}
                  id={"st-source-" + p.id}
                >
                  <b className="st-fine">
                    {lesson.pdfUrl ? "Страница " + p.id : run === practiceRun || lesson.item.parentId === practiceRun
                      ? (p.id === 1 ? "Как читать масштаб" : p.id === 2 ? "Перевод в километры" : "Фрагмент " + p.id)
                      : "Фрагмент " + p.id}
                  </b>
                  <p>{p.text}</p>
                </article>
              ))}
            </section>
            {(run === practiceRun || lesson.review || lesson.item.parentId === practiceRun) && <ScaleLab />}
            <div className="st-row">
              {completed(lesson.item.status) ? (
                <button className="st-btn" onClick={() => setView("result")}>
                  Вернуться к результату
                </button>
              ) : (
                <button className="st-btn" disabled={busy} onClick={start}>
                  {busy ? "Открываем задания…" : "Перейти к заданиям"} →
                </button>
              )}
            </div>
          </>
        )}
        {lesson && q && view === "test" && (
          <>
            <div className="st-heading">
              <span className="st-sub">{lesson.item.title}</span>
              <h1>Задания</h1>
            </div>
            <div className="st-question">
              <div className="st-split">
                <b>
                  Вопрос {position + 1} из {lesson.questions.length}
                </b>
                <span className="st-fine">
                  Отвечено {count} из {lesson.questions.length}
                </span>
              </div>
              <div className="st-meter">
                <i
                  style={{
                    width: (100 * count) / lesson.questions.length + "%",
                  }}
                />
              </div>
            </div>
            <section className="st-card" aria-labelledby="student-prompt">
              <div className="st-split">
                <span className="st-tag green">
                  {q.type === "choice" ? "Один вариант" : "Открытый ответ"}
                </span>
                <span className="st-fine">Макс. балл · {q.maxPoints}</span>
              </div>
              <h2 id="student-prompt">{q.prompt}</h2>
              {q.type === "choice" ? (
                <fieldset
                  className="st-options"
                  aria-labelledby="student-prompt"
                  disabled={busy}
                >
                  {q.options.map((o, i) => (
                    <label
                      className={
                        "st-option " + (answers[q.id] === i ? "selected" : "")
                      }
                      key={i}
                    >
                      <input
                        type="radio"
                        name={q.id}
                        checked={answers[q.id] === i}
                        onChange={() => answer(q.id, i)}
                      />
                      <span>{o}</span>
                    </label>
                  ))}
                </fieldset>
              ) : (
                <textarea
                  className="st-answer"
                  maxLength={12000}
                  aria-label="Ваш ответ"
                  placeholder="Напишите короткое объяснение…"
                  value={answers[q.id] ?? ""}
                  disabled={busy}
                  onChange={(e) => answer(q.id, e.target.value)}
                />
              )}
              <div
                className={"st-status " + (pending ? "pending" : "")}
                aria-live="polite"
                data-revision={revision}
              >
                {pending
                  ? syncing
                    ? "Сохраняем…"
                    : "Ожидают сохранения · ответы № " + pendingNumbers
                  : "Все ответы сохранены"}
                {pending > 0 && syncError && (
                  <div>
                    {syncError}{" "}
                    <button className="st-link" onClick={() => void sync()}>
                      Повторить сохранение
                    </button>
                  </div>
                )}
                {pending > 0 && localWarning && (
                  <div>
                    Хранилище браузера недоступно. Оставьте страницу открытой до
                    сохранения.
                  </div>
                )}
              </div>
            </section>
            <div className="st-split st-actions">
              {position > 0 && (
                <button
                  className="st-ghost"
                  disabled={busy}
                  onClick={() => at(position - 1)}
                >
                  ← Назад
                </button>
              )}
              {position < lesson.questions.length - 1 ? (
                <button
                  className="st-btn"
                  disabled={busy}
                  onClick={() => at(position + 1)}
                >
                  Далее →
                </button>
              ) : (
                <button
                  className="st-btn"
                  disabled={busy}
                  onClick={() =>
                    count === lesson.questions.length
                      ? void submit()
                      : setConfirm(true)
                  }
                >
                  {busy ? "Отправляем…" : "Сдать работу"}
                </button>
              )}
            </div>
            {confirm && (
              <div className="st-card">
                <p>
                  Без ответа осталось вопросов:{" "}
                  {lesson.questions.length - count}. Сдать работу в таком виде?
                </p>
                <button className="st-btn" disabled={busy} onClick={submit}>
                  Подтвердить сдачу
                </button>
              </div>
            )}
            <nav className="st-index" aria-label="Номера вопросов">
              {lesson.questions.map((v, i) => (
                <button
                  key={v.id}
                  aria-label={"Вопрос " + (i + 1)}
                  aria-current={position === i ? "step" : undefined}
                  className={
                    (position === i ? "current " : "") +
                    (answered(answers[v.id]) ? "answered" : "")
                  }
                  onClick={() => at(i)}
                  disabled={busy}
                >
                  {i + 1}
                </button>
              ))}
            </nav>
          </>
        )}
        {lesson && view === "result" && (
          <>
            <div className="st-heading">
              <span className="st-sub">{kind(lesson.item)} · Результат</span>
              <h1>{lesson.item.title}</h1>
            </div>
            <section className="st-card">
              <div className="st-split">
                <h2>
                  {lesson.item.status === "pending"
                    ? "За проверенную часть"
                    : "Итоговый балл"}
                </h2>
                <span className="st-tag green">
                  {statusText[lesson.item.status]}
                </span>
              </div>
              <div className="st-result">
                <strong>{lesson.item.score ?? lesson.item.earned}</strong>
                <span>
                  из {lesson.item.gradedMaxPoints}{" "}
                  {lesson.item.status === "pending"
                    ? "за проверенные задания"
                    : "за работу"}
                </span>
              </div>
              {lesson.item.status === "pending" && (
                <p className="st-sub">
                  Максимум за всю работу — {lesson.item.maxPoints}. Итог
                  появится после проверки открытого ответа.
                </p>
              )}
              {lesson.item.comment && (
                <div className="st-note">
                  <b>Комментарий преподавателя</b>
                  <p className="st-text">{lesson.item.comment}</p>
                </div>
              )}
            </section>
            {lesson.review && (
              <section className="st-card st-review">
                <h2>{lesson.review.rows.length ? "Работа над ошибками" : "Все три тестовых задания решены верно"}</h2>
                {lesson.review.rows.length > 0 && <>
                  <p>{lesson.review.rows[0].after === null
                    ? "У каждого навыка ниже есть новая задача. Сравните результат после разминки."
                    : "Баллы за одну задачу на тот же навык в двух попытках."}</p>
                  <table><thead><tr><th>Навык</th><th>До</th><th>После</th></tr></thead>
                    <tbody>{lesson.review.rows.map(row => <tr key={row.label}>
                      <th scope="row">{row.label}</th><td>{row.before} / 1</td>
                      <td>{row.after === null ? "Ещё нет" : row.after + " / 1"}</td>
                    </tr>)}</tbody></table>
                  {run === practiceRun && lesson.review.rows[0].after === null &&
                    <button className="st-btn" disabled={busy} onClick={openReview}>
                      {busy ? "Открываем…" : "Перейти к разминке"} →
                    </button>}
                </>}
              </section>
            )}
            {lessonSkills(lesson).length > 0 && (
              <section className="st-card">
                <h2>Навыки в этой работе</h2>
                {lessonSkills(lesson).map((s) => (
                  <div className="st-scoreline" key={s.skill}>
                    <span>{s.skill}</span>
                    <strong>
                      {s.earned} из {s.maxPoints}
                    </strong>
                  </div>
                ))}
              </section>
            )}
            {lesson.warmups.length > 0 && (
              <section className="st-cards">
                <h2>Разминки по этому уроку</h2>
                {lesson.warmups.map(tile)}
              </section>
            )}
            {lesson.item.parentId && (
              <button
                className="st-link"
                onClick={() => navigate(lesson.item.parentId)}
              >
                Открыть исходную работу
              </button>
            )}
            <h2>Ответы на задания</h2>
            {lesson.questions.map((v, i) => {
              const points = lesson.points[v.id],
                waiting = v.type === "open" && lesson.item.status === "pending",
                value = lesson.answers[v.id];
              return (
                <article className="st-card" key={v.id}>
                  <div className="st-split">
                    <span className="st-fine">Вопрос {i + 1}</span>
                    <b className="st-status">
                      {waiting
                        ? "Ожидает проверки"
                        : (points ?? 0) + " из " + v.maxPoints}
                    </b>
                  </div>
                  <h3>{v.prompt}</h3>
                  <p className="st-text">
                    <b>Ваш ответ · </b>
                    {answered(value)
                      ? v.type === "choice"
                        ? v.options[Number(value)]
                        : value
                      : "Без ответа"}
                  </p>
                  {!waiting && (points ?? 0) < v.maxPoints && (
                    <div className="st-note">
                      <p>Повторите навык «{v.skill}»</p>
                      <button
                        className="st-link"
                        onClick={() => {
                          sourceTarget.current = v.sourceId;
                          setView("lesson");
                        }}
                      >
                        К материалу · {lesson.pdfUrl ? "страница" : "фрагмент"}{" "}
                        {v.sourceId} →
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </>
        )}
      </main>
    </div>
  );
}
