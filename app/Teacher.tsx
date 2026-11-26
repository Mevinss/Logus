"use client";
import { translate, formatDate } from "./I18n";
import React, { useCallback, useEffect, useState } from "react";
import Brand from "./Brand";
import Calendar from "./Calendar";
import {useI18n} from "./I18n";
import Editor from "./TeacherEditor";
import GroupView, { CopyLink, WorkView } from "./TeacherGroup";
import { AnyRow, Empty, Icon, Overlay, api, initials } from "./teacher-ui";
import "./teacher.css";

function DeskArt() {
  return (
    <div className="t-desk" aria-hidden="true">
      <div className="t-gridpaper" />
      <div className="t-sheet shadow" />
      <div className="t-sheet main">
        <div className="t-sheet-top" />
        <div className="t-diagram">
          <i />
          <b />
          <em />
        </div>
        <div className="t-sheet-lines" />
      </div>
      <div className="t-pencil" />
    </div>
  );
}
// Counts up to the value once it appears; shows the final value at once for reduced motion.
function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  useEffect(() => {
    if (!value || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(value);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 700);
      setShown(Math.round(value * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{shown}</>;
}
function countWord(n: number, forms: string[]) {
  const a = Math.abs(n) % 100,
    b = a % 10;
  return a > 10 && a < 20
    ? forms[2]
    : b === 1
      ? forms[0]
      : b >= 2 && b <= 4
        ? forms[1]
        : forms[2];
}
export default function Teacher({
  name,
  onLogout,
}: {
  name: string;
  onLogout: () => void;
}) {
  const {locale,timeZone,t}=useI18n();
  const [data, setData] = useState<AnyRow | null>(null),
    [nav, setSection] = useState("Сегодня"),
    [group, setGroup] = useState(""),
    [edit, setEditor] = useState<AnyRow | null>(null),
    [liveRun, setLiveRun] = useState(""),
    [initMetric, setInitialMetric] = useState<AnyRow | null>(null),
    [work, setWork] = useState<AnyRow | null>(null),
    [modal, setModal] = useState(""),
    [input, setInput] = useState(""),
    [busy, setBusy] = useState(false),
    [err, setError] = useState(""),
    [share, setShare] = useState<AnyRow | null>(null),
    [repeat, setRepeat] = useState<AnyRow | null>(null),
    [gid, setGroupId] = useState(""),
    [query, setQuery] = useState(""),
    [menu, setMenuOpen] = useState(false);
  const load = useCallback(async () => {
    try {
      const d = await api("/api/teacher");
      setData(d);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);
  useEffect(() => {
    load();
    const f = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", f);
    const timer = window.setInterval(f, 20000);
    return () => {
      document.removeEventListener("visibilitychange", f);
      window.clearInterval(timer);
    };
  }, [load]);
  const navigate = (s: string) => {
    setSection(s);
    setGroup("");
    setEditor(null);
    setInitialMetric(null);
    setLiveRun("");
    setError("");
    setQuery("");
    setMenuOpen(false);
    window.scrollTo(0, 0);
  };
  const open = (s: string) => {
    setModal(s);
    setInput("");
    setError("");
  };
  const doIt = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const visitGroup = (id: string, m?: AnyRow, run = "") => {
    navigate("Группы");
    setGroup(id);
    setInitialMetric(m || null);
    setLiveRun(run);
  };
  const published = (r: AnyRow) => {
    navigate("Мои уроки");
    setShare(r);
    load();
  };
  const groups: AnyRow[] = data?.groups || [],
    lessons: AnyRow[] = data?.lessons || [],
    runs: AnyRow[] = data?.runs || [],
    pending: AnyRow[] = data?.pending || [],
    metric = data?.repeat;
  const startLesson = () => open("lesson"),
    startGroup = () => open("group"),
    today = new Intl.DateTimeFormat(locale, {
      timeZone,
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(new Date());
  return (
    <div className="teacher">
      <header className="t-header">
        <div className="t-header-inner">
          <button
            className="t-brand"
            onClick={() => navigate("Сегодня")}
            aria-label={translate("ui.logus.today")}
          >
            <Brand />
          </button>
          <nav aria-label={translate("ui.workspace.navigation")}>
            {[
              ["Сегодня", "today"],
              ["Мои уроки", "book"],
              ["Группы", "group"], ["calendar", "today"],
            ].map(([s, n]) => (
              <button
                aria-current={nav === s ? "page" : undefined}
                key={s === "calendar" ? t("calendar.title") : translate(s)}
                className={nav === s ? "active" : ""}
                onClick={() => navigate(s)}
              >
                <Icon n={n} />
                {s === "calendar" ? t("calendar.title") : translate(s)}
              </button>
            ))}
          </nav>
          <div className="t-account">
            <button
              className="t-account-btn"
              aria-label={translate("ui.profile.menu")}
              aria-expanded={menu}
              onClick={() => setMenuOpen(!menu)}
            >
              <span className="t-avatar">{initials(name)}</span>
              <span>{name}</span>
              <span aria-hidden="true">⌄</span>
            </button>
            {menu && (
              <div className="t-dropdown">
                <button onClick={onLogout}>
                  <Icon n="logout" />{translate("ui.sign.out")}</button>
              </div>
            )}
          </div>
        </div>
      </header>
      <main className="t-main">
        {!data ? (
          <section className="t-card">
            <h2>
              {err ? translate("ui.could.not.load.workspace") : translate("ui.loading.workspace")}
            </h2>
            {err && (
              <>
                <p>{translate(err)}</p>
                <button className="t-btn" onClick={load}>{translate("ui.retry")}</button>
              </>
            )}
          </section>
        ) : nav === "calendar" ? (<Calendar role="teacher" onOpenRun={(runId,groupId)=>visitGroup(groupId,undefined,runId)}/>) : edit ? (
          <Editor
            key={edit.id}
            initial={edit}
            pdfLimitMiB={data.pdfLimitMiB}
            groups={groups}
            leave={() => {
              navigate("Мои уроки");
              load();
            }}
            updated={load}
            published={published}
          />
        ) : group ? (
          <GroupView
            lessons={lessons}
            key={group}
            id={group}
            back={() => navigate("Группы")}
            refresh={load}
            liveRun={liveRun}
            initialMetric={initMetric}
          />
        ) : (
          <>
            {err && !modal && !repeat && (
              <p className="t-error" role="alert">
                {translate(err)}
              </p>
            )}
            {nav === "Сегодня" ? (
              <>
                <header className="t-heading">
                  <div>
                    <div className="t-over">
                      <span className="t-dash" />{translate("ui.teacher.workspaceLabel")}</div>
                    <h1>{translate("ui.today")}</h1>
                    <p className="t-date">{today}</p>
                  </div>
                  <button className="t-primary" onClick={startLesson}>
                    <Icon n="plus" />{translate("ui.create.lesson")}</button>
                </header>
                <section className="t-summary">
                  <div className="t-over">
                    <span className="t-dot" />{translate("ui.lesson.overview")}</div>
                  <h2>{translate("ui.your.teaching.day")}</h2>
                  <div className="t-summary-nums">
                    {[
                      [runs.length, translate("ui.lessons")],
                      [groups.length, translate("ui.classesLabel")],
                      [pending.length, translate("ui.awaiting.review")],
                    ].map(([n, s]) => (
                      <div key={String(s)}>
                        <strong><CountUp value={Number(n)} /></strong>
                        <span>{s}</span>
                      </div>
                    ))}
                  </div>
                  <DeskArt />
                </section>
                <div className="t-dash-grid">
                  <section className="t-panel">
                    <div className="t-section-title">
                      <span className="t-iconbox">
                        <Icon n="book" />
                      </span>
                      <h2>{translate("ui.active.lessons")}</h2>
                    </div>
                    {runs.length ? (
                      runs.slice(0, 4).map((r, i) => (
                        <button
                          className="t-run"
                          key={r.id}
                          onClick={() => visitGroup(r.groupId, undefined, r.id)}
                        >
                          <span className={"t-cover c" + (i % 3)}>
                            <Icon
                              n={r.kind === "warmup" ? "spark" : "file"}
                              size={24}
                            />
                          </span>
                          <span>
                            <b>{r.title}</b>
                            <small>
                              {r.groupName}{" "}{translate("ui.submitted")}{" "}{r.submitted}{" "}{translate("ui.of")}{" "}{" "}
                              {r.assigned} ({r.completionPercent} %)
                            </small>
                          </span>
                          <Icon n="chev" size={16} />
                        </button>
                      ))
                    ) : (
                      <Empty title={translate("ui.no.lessons.yet")} icon="book">
                        {groups.length
                          ? translate("ui.create.a.lesson.and.assign.it.to.your.class")
                          : translate("ui.create.a.class.to.invite.students.and.run.your.first.lesson")}
                      </Empty>
                    )}
                    {!runs.length && (
                      <button
                        className="t-textbtn"
                        onClick={groups.length ? startLesson : startGroup}
                      >
                        {groups.length ? translate("ui.create.lesson") : translate("ui.create.class")}
                        <Icon n="arrow" size={16} />
                      </button>
                    )}
                  </section>
                  <section className="t-repeat-card">
                    <div className="t-section-title">
                      <span className="t-iconbox rust">
                        <Icon n="layers" />
                      </span>
                      <h2>{translate("ui.what.to.review")}</h2>
                    </div>
                    {metric ? (
                      <>
                        <div className="t-tag">{metric.skill}</div>
                        <h3>{metric.prompt}</h3>
                        <p>
                          {metric.wrongOption
                            ? translate("Вариант «") +
                              metric.wrongOption +
                              translate("» выбрали") + " " +
                              metric.wrongCount +
                              " " + translate("из") + " " +
                              metric.answered +
                              " " + translate("ответивших.")
                            : translate("Полный балл:") + " " +
                              metric.correct +
                              " " + translate("из") + " " +
                              metric.assessed +
                              " " + translate("проверенных.")}
                        </p>
                        <button
                          className="t-textbtn"
                          onClick={() =>
                            visitGroup(
                              runs.find((r) => r.id === metric.runId)?.groupId,
                              metric,
                            )
                          }
                        >{translate("ui.open.question")}<Icon n="arrow" size={16} />
                        </button>
                      </>
                    ) : (
                      <>
                        <h3>{translate("ui.no.responses.to.review.yet")}</h3>
                        <p>{translate("ui.after.students.submit.a.review.question.and.class.responses.will.appear.here")}</p>
                      </>
                    )}
                  </section>
                  <section className="t-panel t-pending">
                    <div className="t-section-title">
                      <span className="t-iconbox tan">
                        <Icon n="pen" />
                      </span>
                      <h2>{translate("ui.awaiting.reviewLabel")}</h2>
                      <span className="t-count">{pending.length}</span>
                    </div>
                    {pending.length ? (
                      pending.map((w) => (
                        <button
                          className="t-linebtn"
                          key={w.runId + w.studentId}
                          onClick={() => setWork(w)}
                        >
                          <span>
                            <b>{w.studentName}</b>
                            <small>{w.title}</small>
                          </span>
                          <span>{translate("ui.review")}</span>
                        </button>
                      ))
                    ) : (
                      <p className="t-muted">{translate("ui.no.open.responses.awaiting.review")}</p>
                    )}
                  </section>
                </div>
              </>
            ) : (
              <>
                <header className="t-heading">
                  <div>
                    <div className="t-over">
                      <span className="t-dash" />{translate("ui.teacher.workspaceLabel")}</div>
                    <h1>{translate(nav)}</h1>
                    <p>
                      {nav === "Группы"
                        ? groups.length +
                          " " +
                          countWord(groups.length, [
                            translate("группа"),
                            translate("группы"),
                            translate("групп"),
                          ])
                        : lessons.length +
                          " " +
                          countWord(lessons.length, [
                            translate("урок"),
                            translate("ui.lessonsFew"),
                            translate("уроков"),
                          ])}
                    </p>
                  </div>
                  <button
                    className="t-primary"
                    onClick={nav === "Группы" ? startGroup : startLesson}
                  >
                    <Icon n="plus" />
                    {nav === "Группы" ? translate("ui.create.class") : translate("ui.create.lesson")}
                  </button>
                </header>
                {!!(nav === "Группы" ? groups : lessons).length && (
                  <label className="t-search">
                    <Icon n="search" />
                    <input
                      aria-label={translate("ui.search.by.title")}
                      placeholder={translate("ui.search.by.title")}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </label>
                )}
                {nav === "Группы" ? (
                  <div className="t-catalog">
                    {groups
                      .filter((g) =>
                        g.name
                          .toLocaleLowerCase()
                          .includes(query.toLocaleLowerCase()),
                      )
                      .map((g) => (
                        <button
                          className="t-groupcard"
                          key={g.id}
                          onClick={() => visitGroup(g.id)}
                        >
                          <span className="t-iconbox">
                            <Icon n="group" />
                          </span>
                          <h2>{g.name}</h2>
                          {g.subject && <small>{g.subject}</small>}
                          <span>
                            {g.students.length}{" "}
                            {countWord(g.students.length, [
                              translate("ui.student"),
                              translate("ui.students"),
                              translate("ui.studentsLabel"),
                            ])}
                          </span>
                          <div className="t-group-foot">{translate("ui.open.class")}<Icon n="arrow" />
                          </div>
                        </button>
                      ))}
                    {groups.length === 0 && (
                      <Empty title={translate("ui.create.your.first.class")} icon="group">{translate("ui.add.students.by.name.and.send.personal.invitations")}</Empty>
                    )}
                  </div>
                ) : (
                  <div className="t-lesson-list">
                    {lessons
                      .filter((l) =>
                        l.title
                          .toLocaleLowerCase()
                          .includes(query.toLocaleLowerCase()),
                      )
                      .map((l) => (
                        <article className="t-lesson" key={l.id}>
                          <span className="t-cover">
                            <Icon n="book" size={25} />
                          </span>
                          <div>
                            <h3>{l.title}</h3>
                            <small className="t-muted">
                              {l.questions.length}{" "}
                              {countWord(l.questions.length, [
                                translate("ui.question"),
                                translate("ui.questions"),
                                translate("ui.questionsLabel"),
                              ])}{" "}{translate("ui.updated")}{" "}{" "}
                              {formatDate(l.updatedAt)}
                            </small>
                          </div>
                          <div className="t-actions t-end">
                            <button
                              className="t-btn sm"
                              onClick={() => {
                                setEditor(l);
                                window.scrollTo(0, 0);
                              }}
                            >
                              <Icon n="pen" size={15} />{translate("ui.edit")}</button>
                            <button
                              className="t-textbtn"
                              onClick={() => {
                                setRepeat(l);
                                setGroupId(groups[0]?.id || "");
                                setError("");
                              }}
                            >{translate("ui.assign.to.another.class")}</button>
                          </div>
                        </article>
                      ))}
                    {!lessons.length && (
                      <Empty title={translate("ui.create.your.first.lesson")} icon="book">{translate("ui.upload.a.pdf.or.paste.text.to.prepare.questions")}</Empty>
                    )}
                  </div>
                )}
                {!!query &&
                  !(nav === "Группы" ? groups : lessons).some((v) =>
                    (v.name || v.title)
                      .toLocaleLowerCase()
                      .includes(query.toLocaleLowerCase()),
                  ) && (
                    <p className="t-muted">{translate("ui.no.matching.results")}</p>
                  )}
              </>
            )}
          </>
        )}
      </main>
      {modal && (
        <Overlay
          title={modal === "group" ? translate("ui.create.class") : translate("ui.create.lesson")}
          close={() => setModal("")}
        >
          <form
            className="t-stack"
            onSubmit={(e) => {
              e.preventDefault();
              doIt(async () => {
                if (!input.trim()) throw Error(translate("ui.enter.a.title"));
                const g = modal === "group";
                const d = await api(
                  g ? "/api/groups" : "/api/lessons",
                  "POST",
                  g ? { name: input.trim() } : { title: input.trim() },
                );
                await load();
                setModal("");
                if (g) visitGroup(d.id);
                else {
                  navigate("Мои уроки");
                  setEditor(d);
                }
              });
            }}
          >
            <label className="t-field">
              <span>
                {modal === "group" ? translate("ui.class.name") : translate("ui.lesson.title")}
              </span>
              <input
                required
                autoFocus
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  modal === "group"
                    ? translate("ui.for.example.class.8b")
                    : translate("ui.enter.lesson.title")
                }
              />
            </label>
            {err && <p className="t-error">{translate(err)}</p>}
            <button className="t-primary" disabled={busy}>
              {busy
                ? translate("ui.creating")
                : modal === "group"
                  ? translate("ui.create.class")
                  : translate("ui.open.editor")}
            </button>
          </form>
        </Overlay>
      )}
      {repeat && (
        <Overlay title={translate("ui.assign.to.another.class")} close={() => setRepeat(null)}>
          <h3>{repeat.title}</h3>
          {groups.length ? (
            <label className="t-field">
              <span>{translate("ui.classLabel")}</span>
              <select value={gid} onChange={(e) => setGroupId(e.target.value)}>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p>{translate("ui.create.a.class.first")}</p>
          )}
          {err && <p className="t-error">{translate(err)}</p>}
          <button
            className="t-primary"
            disabled={busy || !gid}
            onClick={() =>
              doIt(async () => {
                const r = await api(
                  "/api/lessons/" + repeat.id + "/publish",
                  "POST",
                  { groupId: gid },
                );
                setRepeat(null);
                published(r);
              })
            }
          >{translate("ui.assign.lesson")}</button>
        </Overlay>
      )}
      {share && (
        <Overlay title={translate("ui.lesson.published")} close={() => setShare(null)}>
          <h3>{share.title}</h3>
          <p>{translate("ui.classLabelLabel")}{" "}{share.groupName}{" "}{translate("ui.share.the.lesson.link.with.students.who.have.already.signed.in")}</p>
          <CopyLink url={share.url} />
          <p className="t-muted">{translate("ui.send.new.students.their.personal.invitation.from.the.class.roster.first")}</p>
          <button
            className="t-btn"
            onClick={() => {
              visitGroup(share.groupId);
              setShare(null);
            }}
          >{translate("ui.open.class")}<Icon n="arrow" size={16} />
          </button>
        </Overlay>
      )}
      {work && <WorkView w={work} close={() => setWork(null)} refresh={load} />}
    </div>
  );
}
