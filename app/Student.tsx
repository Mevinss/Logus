"use client";
import { translate } from "./I18n";

import { useCallback, useEffect, useRef, useState } from "react";
import Brand from "./Brand";
import Calendar from "./Calendar";
import { useI18n } from "./I18n";
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
  resultsVisible?:boolean; expired?:boolean;
  subject?: string;
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
  correctIndex?:number|null; criterion?:string; explanation?:string; optionExplanations?:string[];
};
type Home = {
  name: string;
  items: Item[];
  skills: { skill: string; earned: number; maxPoints: number }[];
};
type Lesson = {
  timing?:{durationMinutes:number|null;opensAt:string|null;dueAt:string|null;endsAt:number|null;startedAt:number|null;serverNow:number;expired:boolean;archived:boolean};
  item: Item;
  pages: { id: number; text: string;sourcePage?:number;pdfUrl?:string|null;documentName?:string }[];
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
const kind = (item: Item) => (item.kind === "warmup" ? translate("Разминка") : translate("Урок"));
const answered = (a: number | string | undefined) =>
  typeof a === "number" || !!a?.trim();
function message(e: unknown) {
  return e instanceof Error ? e.message : translate("Не удалось выполнить действие.");
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
    throw new Error(translate("Нет связи с сервером. Проверьте подключение."));
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401)
    throw new SessionExpired(data.error || translate("Сессия завершена."));
  if (!res.ok)
    throw new Error(data.error || translate("Не удалось получить данные с сервера."));
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
  const {t,locale,timeZone}=useI18n();
  const [calendar,setCalendar]=useState(false);
  const [seconds,setSeconds]=useState<number|null>(null);
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
      const started=await api<{timing:Lesson["timing"]}>("/" + run + "/start", "POST", {});
      setLesson(await api<Lesson>("/"+run));
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
  useEffect(()=>{
    if(view!=="test"||!run||!lesson?.timing?.endsAt)return;
    let alive=true, polling=false;
    const offset=lesson.timing.serverNow-Date.now();
    const update=async()=>{
      const remaining=Math.max(0,Math.ceil((lesson.timing!.endsAt!-Date.now()-offset)/1000));
      if(alive)setSeconds(remaining);
      if(remaining===0&&!polling){
        polling=true;
        try{const current=await api<Lesson>("/"+run);if(alive&&completed(current.item.status)){
          delete queue.current[run];persist();setLesson(current);setAnswers(current.answers);setView("result");
        }}catch(e){if(alive)setError(message(e))}finally{polling=false}
      }
    };
    void update();const timer=setInterval(update,1000);
    return()=>{alive=false;clearInterval(timer);setSeconds(null)};
  },[view,run,lesson?.timing?.endsAt,api,persist]);
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
          <span className="st-status">{item.resultsVisible===false&&done?t("test.waitingTitle"):translate(statusText[item.status])}</span>
        </div>
        {item.subject && <small>{item.subject}</small>}
        <h3>{item.title}</h3>
        <div className="st-split">
          {done && item.resultsVisible===false ? <span>{t("test.waitingTitle")}</span> : done ? (
            <span>
              {item.status === "graded" ? translate("ui.result") : translate("ui.for.reviewed.questions")} ·{" "}
              <b>
                {item.score ?? item.earned}{" "}{translate("ui.of")}{" "}{item.gradedMaxPoints}
              </b>
            </span>
          ) : (
            <span />
          )}
          <button className="st-btn" onClick={() => navigate(item.runId)}>
            {done
              ? translate("ui.view.result")
              : item.kind === "warmup"
                ? translate("ui.open.practice")
                : translate("ui.open.lesson")}{" "}
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
            aria-label={translate("ui.logus.my.lessons")}
          >
            <Brand />
          </button>
          <span className="st-role">{translate("ui.student.workspace")}</span>
          <button className="st-ghost st-logout" onClick={onLogout}>{translate("ui.sign.out")}</button>
        </div>
      </header>
      <main className="st-main">
        {view==="home"&&<button className="st-btn" onClick={()=>setCalendar(!calendar)}>{t(calendar?"test.close":"test.calendar")}</button>}
        {view==="home"&&calendar&&<Calendar role="student"/>}
        {run && (
          <button className="st-back" onClick={() => navigate(null)}>{translate("ui.my.lessonsLabel")}</button>
        )}
        {error && (
          <div className="st-error" role="alert">
            {translate(error)}{" "}{" "}
            <button className="st-link" onClick={() => setReload((n) => n + 1)}>{translate("ui.refresh")}</button>
          </div>
        )}
        {view === "home" && !calendar && (
          <>
            <div className="st-heading">
              <span className="st-sub">{name}</span>
              <h1>{translate("ui.my.lessonsLabelLabel")}</h1>
            </div>
            <div className="st-tabs" role="tablist" aria-label={translate("ui.lessonsLabelLabel")}>
              <button
                role="tab"
                aria-selected={tab === "active"}
                onClick={() => setTab("active")}
              >{translate("ui.assignedLabelLabel")}</button>
              <button
                role="tab"
                aria-selected={tab === "history"}
                onClick={() => setTab("history")}
              >{translate("ui.results.history")}</button>
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
                          ? translate("ui.no.assigned.lessons.yet")
                          : translate("ui.your.results.will.appear.here")}
                      </h3>
                      <p className="st-sub">
                        {tab === "active"
                          ? translate("ui.lessons.and.practice.assigned.by.your.teacher.appear.here")
                          : translate("ui.submit.your.first.work.to.see.scores.and.teacher.feedback")}
                      </p>
                    </div>
                  )}
                </div>
                {tab === "history" && home.skills.length > 0 && (
                  <section className="st-card">
                    <h2>{translate("ui.points.by.skill")}</h2>
                    {home.skills.map((s) => (
                      <div className="st-scoreline" key={s.skill}>
                        <span>{s.skill}</span>
                        <strong>
                          {s.earned}{" "}{translate("ui.of")}{" "}{s.maxPoints}
                        </strong>
                      </div>
                    ))}
                  </section>
                )}
              </>
            ) : (
              !error && <p role="status">{translate("ui.loading.lessons")}</p>
            )}
          </>
        )}
        {run && !lesson && !error && <p role="status">{translate("ui.loading.lesson")}</p>}
        {lesson && view === "lesson" && (
          <>
            <div className="st-heading">
              <span className="st-sub">{kind(lesson.item)} {translate("ui.material")}</span>
              <h1>{lesson.item.title}</h1>
              {lesson.item.instruction && (
                <p className="st-text">{lesson.item.instruction}</p>
              )}
            </div>
            <section className="st-card">
              <div className="st-split">
                <h2>{translate("ui.lesson.material")}</h2>
                {lesson.pdfUrl && (
                  <a
                    className="st-link"
                    href={lesson.pdfUrl}
                    target="_blank"
                    rel="noreferrer"
                  >{translate("ui.open.original.pdf")}</a>
                )}
              </div>
              {lesson.pages.map((p) => (
                <article
                  className="st-page"
                  key={p.id}
                  id={"st-source-" + p.id}
                >
                  <b className="st-fine">
                    {p.documentName&&<span>{p.documentName} · </span>}
                    {p.pdfUrl ? translate("Страница") + " " + (p.sourcePage||p.id) : lesson.pdfUrl ? translate("Страница") + " " + p.id : run === practiceRun || lesson.item.parentId === practiceRun
                      ? (p.id === 1 ? translate("ui.how.to.read.scale") : p.id === 2 ? translate("ui.convert.to.kilometres") : translate("Фрагмент") + " " + p.id)
                      : translate("Фрагмент") + " " + p.id}
                  </b>
                  <p>{p.text}</p>
                  {p.pdfUrl&&<a className="st-link" href={p.pdfUrl+"#page="+(p.sourcePage||p.id)} target="_blank" rel="noreferrer">PDF ↗</a>}
                </article>
              ))}
            </section>
            {(run === practiceRun || lesson.review || lesson.item.parentId === practiceRun) && <ScaleLab />}
            {lesson.timing?.durationMinutes&&<p className="st-note">{t("test.timerInfo",{minutes:lesson.timing.durationMinutes})}</p>}
            {lesson.timing?.opensAt&&<p>{t("test.opens",{date:new Date(lesson.timing.opensAt).toLocaleString(locale,{timeZone})})}</p>}
            {lesson.timing?.dueAt&&<p>{t("test.due",{date:new Date(lesson.timing.dueAt).toLocaleString(locale,{timeZone})})}</p>}
            {lesson.timing?.archived&&<p>{t("test.archived")}</p>}
            <div className="st-row">
              {completed(lesson.item.status) ? (
                <button className="st-btn" onClick={() => setView("result")}>{translate("ui.back.to.result")}</button>
              ) : (
                <button className="st-btn" disabled={busy||lesson.timing?.archived||Boolean(lesson.timing?.opensAt&&Date.parse(lesson.timing.opensAt)>Date.now())||Boolean(lesson.timing?.dueAt&&Date.parse(lesson.timing.dueAt)<=Date.now())} onClick={start}>
                  {busy ? translate("ui.opening.tasks") : translate("ui.go.to.tasks")} →
                </button>
              )}
            </div>
          </>
        )}
        {lesson && q && view === "test" && (
          <>
            <div className="st-heading">
              <span className="st-sub">{lesson.item.title}</span>
              <h1>{translate("ui.tasks")}</h1>
            </div>
            {seconds!==null&&<div className="st-note" role="timer">{t("test.timeLeft",{time:Math.floor(seconds/60)+":"+String(seconds%60).padStart(2,"0")})}{seconds<60&&<p role="status">{t("test.timeWarning")}</p>}</div>}
            <div className="st-question">
              <div className="st-split">
                <b>{translate("ui.questionLabel")}{" "}{position + 1}{" "}{translate("ui.of")}{" "}{lesson.questions.length}
                </b>
                <span className="st-fine">{translate("ui.answeredLabelLabel")}{" "}{count}{" "}{translate("ui.of")}{" "}{lesson.questions.length}
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
                  {q.type === "choice" ? translate("ui.single.choice") : translate("ui.open.response")}
                </span>
                <span className="st-fine">{translate("ui.max.points")}{" "}{q.maxPoints}</span>
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
                  aria-label={translate("ui.your.answer")}
                  placeholder={translate("ui.write.a.short.explanation")}
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
                    ? translate("ui.saving")
                    : translate("Ожидают сохранения · ответы №") + " " + pendingNumbers
                  : translate("ui.all.answers.saved")}
                {pending > 0 && syncError && (
                  <div>
                    {syncError}{" "}
                    <button className="st-link" onClick={() => void sync()}>{translate("ui.retry.saving")}</button>
                  </div>
                )}
                {pending > 0 && localWarning && (
                  <div>{translate("ui.browser.storage.unavailable.keep.this.page.open.until.answers.are.saved")}</div>
                )}
              </div>
            </section>
            <div className="st-split st-actions">
              {position > 0 && (
                <button
                  className="st-ghost"
                  disabled={busy}
                  onClick={() => at(position - 1)}
                >{translate("ui.back")}</button>
              )}
              {position < lesson.questions.length - 1 ? (
                <button
                  className="st-btn"
                  disabled={busy}
                  onClick={() => at(position + 1)}
                >{translate("ui.next")}</button>
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
                  {busy ? translate("ui.submitting") : translate("ui.submit.work")}
                </button>
              )}
            </div>
            {confirm && (
              <div className="st-card">
                <p>{translate("ui.unanswered.questions")}{" "}{" "}
                  {lesson.questions.length - count}{translate("ui.submit.anyway")}</p>
                <button className="st-btn" disabled={busy} onClick={submit}>{translate("ui.confirm.submission")}</button>
              </div>
            )}
            <nav className="st-index" aria-label={translate("ui.question.numbers")}>
              {lesson.questions.map((v, i) => (
                <button
                  key={v.id}
                  aria-label={translate("Вопрос") + " " + (i + 1)}
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
        {lesson && view === "result" && lesson.item.resultsVisible===false && <section className="st-card">
          <h1>{t("test.waitingTitle")}</h1><p>{t("test.resultsWaiting")}</p>
          {lesson.item.expired&&<p>{t("test.expired")}</p>}
        </section>}
        {lesson && view === "result" && lesson.item.resultsVisible!==false && (
          <>
            <div className="st-heading">
              <span className="st-sub">{kind(lesson.item)}{translate("ui.resultLabel")}</span>
              <h1>{lesson.item.title}</h1>
            </div>
            <section className="st-card">
              <div className="st-split">
                <h2>
                  {lesson.item.status === "pending"
                    ? translate("ui.for.reviewed.questions")
                    : translate("ui.final.score")}
                </h2>
                <span className="st-tag green">
                  {translate(statusText[lesson.item.status])}
                </span>
              </div>
              <div className="st-result">
                <strong>{lesson.item.score ?? lesson.item.earned}</strong>
                <span>{translate("ui.of")}{" "}{lesson.item.gradedMaxPoints}{" "}
                  {lesson.item.status === "pending"
                    ? translate("ui.for.reviewed.questionsLabel")
                    : translate("ui.for.this.work")}
                </span>
              </div>
              {lesson.item.status === "pending" && (
                <p className="st-sub">{translate("ui.maximum.total.score")}{" "}{lesson.item.maxPoints}{" "}{translate("ui.final.score.follows.review.of.the.open.response")}</p>
              )}
              {lesson.item.comment && (
                <div className="st-note">
                  <b>{translate("ui.teacher.feedback")}</b>
                  <p className="st-text">{lesson.item.comment}</p>
                </div>
              )}
            </section>
            {lesson.review && (
              <section className="st-card st-review">
                <h2>{lesson.review.rows.length ? translate("ui.review.mistakes") : translate("ui.all.three.test.questions.answered.correctly")}</h2>
                {lesson.review.rows.length > 0 && <>
                  <p>{lesson.review.rows[0].after === null
                    ? translate("ui.each.skill.below.has.a.new.task.compare.results.after.practice")
                    : translate("ui.scores.for.one.task.testing.the.same.skill.across.two.attempts")}</p>
                  <table><thead><tr><th>{translate("ui.skill")}</th><th>{translate("ui.before")}</th><th>{translate("ui.after")}</th></tr></thead>
                    <tbody>{lesson.review.rows.map(row => <tr key={row.label}>
                      <th scope="row">{row.label}</th><td>{row.before} / 1</td>
                      <td>{row.after === null ? translate("ui.not.yet") : row.after + " / 1"}</td>
                    </tr>)}</tbody></table>
                  {run === practiceRun && lesson.review.rows[0].after === null &&
                    <button className="st-btn" disabled={busy} onClick={openReview}>
                      {busy ? translate("ui.opening") : translate("ui.go.to.practice")} →
                    </button>}
                </>}
              </section>
            )}
            {lessonSkills(lesson).length > 0 && (
              <section className="st-card">
                <h2>{translate("ui.skills.in.this.work")}</h2>
                {lessonSkills(lesson).map((s) => (
                  <div className="st-scoreline" key={s.skill}>
                    <span>{s.skill}</span>
                    <strong>
                      {s.earned}{" "}{translate("ui.of")}{" "}{s.maxPoints}
                    </strong>
                  </div>
                ))}
              </section>
            )}
            {lesson.warmups.length > 0 && (
              <section className="st-cards">
                <h2>{translate("ui.practice.for.this.lesson")}</h2>
                {lesson.warmups.map(tile)}
              </section>
            )}
            {lesson.item.parentId && (
              <button
                className="st-link"
                onClick={() => navigate(lesson.item.parentId)}
              >{translate("ui.open.original.work")}</button>
            )}
            {lesson.item.expired&&<p className="st-note">{t("test.expired")}</p>}
            <h2>{translate("ui.task.responses")}</h2>
            {lesson.questions.map((v, i) => {
              const points = lesson.points[v.id],
                waiting = v.type === "open" && lesson.item.status === "pending" && points == null,
                value = lesson.answers[v.id];
              return (
                <article className="st-card" key={v.id}>
                  <div className="st-split">
                    <span className="st-fine">{translate("ui.questionLabel")}{" "}{i + 1}</span>
                    <b className="st-status">
                      {waiting
                        ? translate("ui.awaiting.reviewLabelLabelLabelLabel")
                        : (points ?? 0) + " " + translate("из") + " " + v.maxPoints}
                    </b>
                  </div>
                  <h3>{v.prompt}</h3>
                  <p className="st-text">
                    <b>{translate("ui.your.answerLabel")}</b>
                    {answered(value)
                      ? v.type === "choice"
                        ? v.options[Number(value)]
                        : value
                      : translate("ui.unanswered")}
                  </p>
                  {!waiting&&<div className="st-note">
                    {v.type==="choice"&&typeof v.correctIndex==="number"&&<p><strong>{t("test.correct")}</strong> · {v.options[v.correctIndex]}</p>}
                    {v.type==="open"&&v.criterion&&<p><strong>{t("test.criterion")}</strong> · {v.criterion}</p>}
                    {v.explanation&&<p><strong>{t("test.why")}</strong> · {v.explanation}</p>}
                    {v.type==="choice"&&typeof value==="number"&&v.optionExplanations?.[value]&&<p><strong>{t("test.yourOption")}</strong> · {v.optionExplanations[value]}</p>}
                  </div>}
                  {!waiting && (points ?? 0) < v.maxPoints && (
                    <div className="st-note">
                      <p>{translate("ui.review.the.skill")}{" "}{v.skill}»</p>
                      <button
                        className="st-link"
                        onClick={() => {
                          sourceTarget.current = v.sourceId;
                          setView("lesson");
                        }}
                      >{translate("ui.to.material")}{" "}{lesson.pdfUrl ? translate("ui.pageLabel") : translate("ui.passageLabel")}{" "}
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
