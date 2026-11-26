"use client";
import RunControls from "./RunControls";
import { QuestionChart, ScoreChart, Verdict } from "./Charts";
import { translate, formatDate, useI18n } from "./I18n";
import {
  RosterTools,
  LiveClassroom,
  ExportJournal,
  InviteQR,
} from "./ClassroomTools";
import React, { useEffect, useState } from "react";
import {
  AnyRow,
  Empty,
  Icon,
  Overlay,
  api,
  initials,
  statusName,
} from "./teacher-ui";
import { QuestionEdit, Question, Page, blank, validate } from "./TeacherEditor";
export function CopyLink({
  url,
  label = "Скопировать ссылку",
}: {
  url: string;
  label?: string;
}) {
  useI18n();
  const [state, setState] = useState("");
  return (
    <div className="t-copy">
      <input
        readOnly
        value={url}
        aria-label={translate(label)}
        onFocus={(e) => e.target.select()}
      />
      <button
        className="t-btn"
        type="button"
        onClick={async (e) => {
          const inp = e.currentTarget
            .previousElementSibling as HTMLInputElement;
          try {
            if (navigator.clipboard?.writeText)
              await navigator.clipboard.writeText(url);
            else {
              inp.focus();
              inp.select();
              if (!document.execCommand("copy")) throw Error();
            }
            setState(translate("ui.copied"));
          } catch {
            inp.select();
            setState(translate("ui.press.ctrl.c.or.choose.copy"));
          }
        }}
      >
        <Icon n="link" size={15} />
        {translate(state || label)}
      </button>
    </div>
  );
}
export function Score({ w }: { w: AnyRow }) {
  useI18n();
  return (
    <span
      className={
        "t-status " + w.status +
        (w.status === "graded" && w.maxPoints
          ? w.score / w.maxPoints >= 0.75
            ? " is-high"
            : w.score / w.maxPoints >= 0.5
              ? " is-mid"
              : " is-low"
          : "")
      }
    >
      {w.status === "graded"
        ? w.score + " / " + w.maxPoints
        : statusName(w.status)}
    </span>
  );
}
export function WorkView({
  w,
  close,
  refresh,
}: {
  w: AnyRow;
  close: () => void;
  refresh: () => void;
}) {
  useI18n();
  const [d, setDetails] = useState<AnyRow | null>(null),
    [pts, setPoints] = useState<Record<string, number>>({}),
    [comment, setComment] = useState(""),
    [msg, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [suggest, setSuggestions] = useState<Record<string, AnyRow>>({});
  const url = "/api/works/" + w.runId + "/" + w.studentId;
  useEffect(() => {
    let live = true;
    api(url)
      .then((r) => {
        if (live) {
          setDetails(r);
          setPoints(
            Object.fromEntries(
              r.questions
                .filter(
                  (q: Question) => q.type === "open" && r.points[q.id] != null,
                )
                .map((q: Question) => [q.id, r.points[q.id]]),
            ),
          );
          setComment(r.work.comment || "");
        }
      })
      .catch((e) => live && setMessage(e.message));
    return () => {
      live = false;
    };
  }, [url]);
  const op = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMessage("");
    try {
      await fn();
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Overlay title={translate("ui.student.work")} close={close}>
      <h3>
        {w.studentName} · {w.title}
      </h3>
      {!d && !msg && <p>{translate("ui.loading.work")}</p>}
      {d && (
        <>
          <Score w={d.work} />
          {d.questions.map((q: Question, i: number) => {
            const v = d.answers[q.id];
            return (
              <div className={"t-inset t-stack answer-card" + (d.points[q.id] == null ? "" : d.points[q.id] >= q.maxPoints ? " is-correct" : d.points[q.id] <= 0 ? " is-wrong" : " is-partial")} key={q.id}>
                <div className="t-over answer-head">{translate("ui.questionLabel")}{" "}{i + 1} · {q.skill}
                  <Verdict points={d.points[q.id]} max={q.maxPoints} />
                </div>
                <strong>{q.prompt}</strong>
                <p>{translate("ui.student.answer")}{" "}{" "}
                  {v === undefined || v === ""
                    ? translate("ui.no.answer")
                    : q.type === "choice"
                      ? q.options[Number(v)]
                      : v}
                </p>
                {q.type === "choice" ? (
                  <p className="t-muted">{translate("ui.answer.key")}{" "}{q.options[q.correctIndex ?? 0]}{translate("ui.points")}{" "}{" "}
                    {d.points[q.id] ?? "—"} / {q.maxPoints}
                  </p>
                ) : (
                  <>
                    <p className="t-muted">{translate("ui.criterion")}{" "}{q.criterion}</p>
                    {d.work.status === "pending" ? (
                      <>
                        <label className="t-field">
                          <span>{translate("ui.points.out.of")}{" "}{q.maxPoints}</span>
                          <input
                            type="number"
                            min={0}
                            max={q.maxPoints}
                            value={pts[q.id] ?? ""}
                            onChange={(e) => {
                              const n = { ...pts };
                              if (e.target.value === "") delete n[q.id];
                              else n[q.id] = Number(e.target.value);
                              setPoints(n);
                            }}
                          />
                        </label>
                        <button
                          className="t-textbtn"
                          disabled={busy}
                          onClick={() =>
                            op(async () => {
                              const r = await api(url + "/suggest", "POST", {
                                questionId: q.id,
                              });
                              setSuggestions({ ...suggest, [q.id]: r });
                            })
                          }
                        >
                          <Icon n="spark" />{translate("ui.request.ai.suggestion")}</button>
                        {suggest[q.id] && (
                          <p>{translate("ui.ai.suggestion")}{" "}{suggest[q.id].points}{translate("ui.points.evidence")}{" "}{suggest[q.id].evidence}»
                          </p>
                        )}
                      </>
                    ) : (
                      <p>{translate("ui.pointsLabel")}{" "}{d.points[q.id] ?? "—"} / {q.maxPoints}
                      </p>
                    )}
                  </>
                )}
              </div>
            );
          })}
          {d.work.status === "pending" ? (
            <>
              <label className="t-field">
                <span>{translate("ui.teacher.feedback")}</span>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
              </label>
              <button
                className="t-primary"
                disabled={busy}
                onClick={() =>
                  op(async () => {
                    if (
                      d.questions.some(
                        (q: Question) =>
                          q.type === "open" &&
                          (pts[q.id] == null ||
                            pts[q.id] < 0 ||
                            pts[q.id] > q.maxPoints),
                      )
                    )
                      throw Error(
                        translate("ui.enter.a.valid.score.for.each.open.response"),
                      );
                    const work = await api(url + "/grade", "POST", {
                      points: pts,
                      comment,
                    });
                    setDetails({ ...d, work, points: { ...d.points, ...pts } });
                    refresh();
                    setMessage(translate("ui.result.confirmed"));
                  })
                }
              >{translate("ui.confirm.result")}</button>
            </>
          ) : (
            d.work.comment && <p>{translate("ui.teacher.feedbackLabel")}{" "}{d.work.comment}</p>
          )}
        </>
      )}
      {busy && <p role="status">{translate("ui.processing")}</p>}
      {msg && (
        <p role="status" className="t-notice">
          {translate(msg)}
        </p>
      )}
    </Overlay>
  );
}
function Warmup({
  metric,
  group,
  close,
  done,
}: {
  metric: AnyRow;
  group: AnyRow;
  close: () => void;
  done: () => void;
}) {
  useI18n();
  const [qs, setQuestions] = useState<Question[]>([]),
    [pages, setPages] = useState<Page[]>([]),
    [pdf, setPdfUrl] = useState(""),
    [base, setSourceQuestion] = useState<Question | null>(null),
    [title, setTitle] = useState("Разминка · " + metric.skill),
    [all, setEntireGroup] = useState(true),
    [ids, setRecipientIds] = useState<string[]>([]),
    [err, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const url = "/api/runs/" + metric.runId + "/warmup";
  useEffect(() => {
    const w = metric.works[0];
    if (w)
      api("/api/works/" + metric.runId + "/" + w.studentId)
        .then((d) => {
          const original = d.questions.find(
            (q: Question) => q.id === metric.questionId,
          );
          setPages(d.pages.filter((p: Page) => p.id === original.sourceId));
          setPdfUrl(d.pdfUrl);
          setSourceQuestion(original);
        })
        .catch((e) => setError(e.message));
  }, [metric]);
  const op = async (fn: () => Promise<void>) => {
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
  return (
    <Overlay title={translate("ui.prepare.practice")} close={close}>
      <p className="t-muted">
        {metric.skill} · {metric.prompt}
      </p>
      <label className="t-field">
        <span>{translate("ui.practice.title")}</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <div className="t-actions">
        <button
          disabled={!base || busy}
          className="t-btn"
          onClick={() =>
            op(async () => {
              const r = await api(url + "-preview", "POST", {
                questionId: metric.questionId,
              });
              setQuestions(r.questions);
              setError((r.issues || []).join(" "));
            })
          }
        >
          <Icon n="spark" />{translate("ui.suggest.questions.with.ai")}</button>
        <button
          className="t-btn"
          disabled={!base || qs.length >= 2 || busy}
          onClick={() => {
            if (base)
              setQuestions([
                ...qs,
                {
                  ...blank(
                    pages.find((p) => p.id === base.sourceId),
                    base.skill,
                  ),
                  quote: base.quote,
                },
              ]);
          }}
        >{translate("ui.add.manually")}</button>
      </div>
      {qs.map((q, i) => (
        <QuestionEdit
          key={q.id}
          q={q}
          i={i}
          pages={pages}
          pdf={pdf}
          fixedSkill
          change={(v) => setQuestions(qs.map((o, k) => (k === i ? v : o)))}
          remove={() => setQuestions(qs.filter((_, k) => k !== i))}
        />
      ))}
      <label className="t-field">
        <span>{translate("ui.assign.to")}</span>
        <select
          value={all ? "all" : "some"}
          onChange={(e) => setEntireGroup(e.target.value === "all")}
        >
          <option value="all">{translate("ui.entire.class")}</option>
          <option value="some">{translate("ui.selected.students")}</option>
        </select>
      </label>
      {!all &&
        group.students.map((s: AnyRow) => (
          <label className="t-check" key={s.id}>
            <input
              type="checkbox"
              checked={ids.includes(s.id)}
              onChange={(e) =>
                setRecipientIds(
                  e.target.checked
                    ? [...ids, s.id]
                    : ids.filter((v) => v !== s.id),
                )
              }
            />
            {s.name}
          </label>
        ))}
      {err && (
        <div className="t-notice" role="alert">
          {translate(err)}
        </div>
      )}
      {busy && <p>{translate("ui.processing")}</p>}
      <button
        disabled={busy || !base}
        className="t-primary"
        onClick={() =>
          op(async () => {
            validate(
              qs,
              pages,
              pages.map((p) => p.id),
            );
            if (!all && !ids.length)
              throw Error(translate("ui.select.at.least.one.student"));
            await api(url, "POST", {
              questionId: metric.questionId,
              questions: qs,
              title,
              ...(!all && { studentIds: ids }),
            });
            done();
          })
        }
      >{translate("ui.assign.practice")}</button>
    </Overlay>
  );
}
export default function GroupView({
  id,
  back,
  refresh,
  initialMetric,
  lessons,
  liveRun,
}: {
  id: string;
  back: () => void;
  refresh: () => void;
  lessons: AnyRow[];
  liveRun: string;
  initialMetric?: AnyRow | null;
}) {
  useI18n();
  const [d, setDetails] = useState<AnyRow | null>(null),
    [tick, setRefreshTick] = useState(0),
    [tab, setTab] = useState(
      initialMetric ? "Аналитика" : liveRun ? "Урок идёт" : "Состав",
    ),
    [err, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [name, setName] = useState(""),
    [person, setPerson] = useState<AnyRow | null>(null),
    [work, setWork] = useState<AnyRow | null>(null),
    [metric, setMetric] = useState<AnyRow | null>(initialMetric || null),
    [warm, setWarmup] = useState<AnyRow | null>(null),
    [invite, setInvite] = useState<AnyRow | null>(null),
    [runId, setRunId] = useState(""),
    [success, setSuccess] = useState("");
  const reload = () => {
    setRefreshTick((v) => v + 1);
    refresh();
  };
  useEffect(() => {
    const refreshVisible = () => {
      if (document.visibilityState === "visible") setRefreshTick((v) => v + 1);
    };
    document.addEventListener("visibilitychange", refreshVisible);
    const timer = window.setInterval(refreshVisible, 20000);
    return () => {
      document.removeEventListener("visibilitychange", refreshVisible);
      window.clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    let live = true;
    api("/api/groups/" + id)
      .then((r) => {
        if (live) {
          setDetails(r);
          setError("");
        }
      })
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [id, tick]);
  const op = async (fn: () => Promise<void>) => {
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
  if (!d)
    return (
      <>
        <button className="t-back" onClick={back}>{translate("ui.classesLabelLabelLabelLabel")}</button>
        <p>{err || translate("ui.loading.class")}</p>
      </>
    );
  const g = d.group,
    runs = d.runs as AnyRow[],
    works = d.works as AnyRow[],
    metrics = d.metrics as AnyRow[],
    chosen = runs.find((r) => r.id === runId) || runs[0];
  return (
    <>
      <button className="t-back" onClick={back}>
        <Icon n="back" size={16} />{translate("ui.classes")}</button>
      <header className="t-heading">
        <div>
          <div className="t-over">{translate("ui.classLabelLabelLabel")}</div>
          <h1>{g.name}</h1>
          <p>
            {g.students.length}{" "}{translate("ui.students.assigned.lessons")}{" "}{runs.length}
          </p>
        </div>
      </header>
      <div className="t-tabs">
        {["Состав", "Урок идёт", "Журнал", "Аналитика", "Занятия"].map((s) => (
          <button
            key={s}
            className={s === tab ? "active" : ""}
            onClick={() => setTab(s)}
          >
            {translate(s)}
          </button>
        ))}
      </div>
      {err && (
        <p className="t-error" role="alert">
          {translate(err)}
        </p>
      )}
      {success && <p className="t-notice">{success}</p>}
      {tab === "Урок идёт" && (
        <LiveClassroom initialRun={liveRun} runs={runs} reload={reload} />
      )}
      {tab === "Состав" && (
        <section className="t-card">
          <h2>{translate("ui.class.members")}</h2>
          <RosterTools
            group={g}
            staff={d.staff}
            lessons={lessons}
            reload={reload}
          />
          {g.managesRoster && (
            <form
              className="t-addstudent"
              onSubmit={(e) => {
                e.preventDefault();
                op(async () => {
                  const result = await api(
                    "/api/groups/" + id + "/students",
                    "POST",
                    { name },
                  );
                  const s = result.students.find(
                    (r: AnyRow) =>
                      !g.students.some((old: AnyRow) => old.id === r.id),
                  );
                  setName("");
                  reload();
                  setInvite(s);
                });
              }}
            >
              <label className="t-field">
                <span>{translate("ui.student.name.or.nickname")}</span>
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={translate("ui.for.example.alex.smith")}
                />
              </label>
              <button className="t-primary" disabled={busy}>{translate("ui.add.student")}</button>
            </form>
          )}
          {g.students.length === 0 && (
            <Empty title={translate("ui.no.students.in.this.class.yet")} icon="group">{translate("ui.a.personal.sign.in.link.appears.after.adding.a.member")}</Empty>
          )}
          {g.students.map((s: AnyRow) => (
            <div key={s.id} className="t-item">
              <span className="t-avatar">{initials(s.name)}</span>
              <button
                className="t-namebtn"
                onClick={() =>
                  op(async () =>
                    setPerson(
                      await api("/api/groups/" + id + "/students/" + s.id),
                    ),
                  )
                }
              >
                {s.name}
              </button>
              <span className={"roster-state " + (s.joined ? "is-joined" : "is-waiting")}>
                {s.joined ? "✓ " + translate("roster.joined") : translate("roster.waiting")}
              </span>
              {g.managesRoster && (
                <button className="t-btn sm t-end" onClick={() => setInvite(s)}>
                  <Icon n="link" size={15} />{translate("ui.invitation")}</button>
              )}
            </div>
          ))}
        </section>
      )}
      {tab === "Занятия" && (
        <section className="t-card">
          <h2>{translate("ui.assigned.lessons")}</h2>
          {runs.length === 0 && (
            <Empty title={translate("ui.no.lessons.yet")}>{translate("ui.publish.a.lesson.for.this.class")}</Empty>
          )}
          {runs.map((r) => (
            <div key={r.id} className="t-inset">
              <strong>{r.title}</strong>
              <p className="t-muted">
                {r.kind === "warmup" ? translate("ui.practiceLabel") : translate("ui.lessonLabel")}{translate("ui.submitted")}{" "}{" "}
                {r.submitted}{" "}{translate("ui.of")}{" "}{r.assigned} ({r.completionPercent} %)
              </p>
              <CopyLink url={r.url} label={translate("ui.lesson.link")} /><RunControls run={r} refresh={reload}/>
              <button className="t-btn" onClick={()=>{setRunId(r.id);setTab("Журнал")}}>{translate("test.viewWorks")}</button>
            </div>
          ))}
        </section>
      )}
      {tab === "Журнал" && (
        <section className="t-card">
          <h2>{translate("ui.class.gradebook")}</h2>
          <ExportJournal group={g} runs={runs} works={works} />
          {!!runs.length && (
            <p className="journal-legend">
              <span><i style={{ background: "var(--good)" }} />{translate("journal.high")}</span>
              <span><i style={{ background: "var(--mid)" }} />{translate("journal.mid")}</span>
              <span><i style={{ background: "var(--bad)" }} />{translate("journal.low")}</span>
            </p>
          )}
          {runs.length ? (
            <div className="t-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{translate("ui.studentLabel")}</th>
                    {runs.map((r) => (
                      <th key={r.id}>
                        {r.kind === "warmup" ? translate("ui.practice") : ""}
                        {r.title}
                        <small>
                          {formatDate(r.createdAt)}
                        </small>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {g.students.map((s: AnyRow) => (
                    <tr key={s.id}>
                      <th>{s.name}</th>
                      {runs.map((r) => {
                        const w = works.find(
                          (o) => o.studentId === s.id && o.runId === r.id,
                        );
                        return (
                          <td key={r.id}>
                            {w ? (
                              <button
                                className="t-cell"
                                onClick={() => setWork(w)}
                              >
                                <Score w={w} />
                              </button>
                            ) : (
                              "—"
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title={translate("ui.gradebook.is.empty")}>{translate("ui.results.of.assigned.lessons.will.appear.here")}</Empty>
          )}
        </section>
      )}
      {tab === "Аналитика" && (
        <section className="t-card t-stack">
          <h2>{translate("ui.class.analytics")}</h2>
          {chosen ? (
            <>
              <label className="t-field">
                <span>{translate("ui.lessonLabelLabel")}</span>
                <select
                  value={chosen.id}
                  onChange={(e) => setRunId(e.target.value)}
                >
                  {runs.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title} ·{" "}
                      {formatDate(r.createdAt)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="t-numbers">
                {[
                  [translate("ui.assigned"), "assigned"],
                  [translate("ui.started"), "started"],
                  [translate("ui.submittedLabel"), "submitted"],
                  [translate("ui.awaiting.review"), "pending"],
                ].map(([s, k]) => (
                  <div key={k}>
                    <b>{chosen[k]}</b>
                    <span>{s}</span>
                  </div>
                ))}
              </div>
              <p>{translate("ui.submission.rate")}{" "}{chosen.completionPercent} % (
                {chosen.submitted}{" "}{translate("ui.of")}{" "}{chosen.assigned}).
              </p>
              <ScoreChart run={chosen} />
              <h3>{translate("ui.question.responses")}</h3>
              {metrics
                .filter((m) => m.runId === chosen.id)
                .map((m) => (
                  <div className="t-inset chart-card" key={m.questionId}>
                  <button
                    className="t-linebtn"
                    onClick={() => setMetric(m)}
                  >
                    <div>
                      <strong>{m.prompt}</strong>
                      <small>
                        {m.skill}{" "}{translate("ui.answered")}{" "}{m.answered}{" "}{translate("ui.reviewedLabel")}{" "}{" "}
                        {m.assessed}{" "}{translate("ui.awaiting.reviewLabelLabel")}{" "}{m.pending}
                        {m.assessed > 0 && (
                          <>
                            {" "}{translate("ui.full.marksLabel")}{" "}{m.correct}{" "}{translate("ui.of")}{" "}{m.assessed} (
                            {m.correctPercent} %)
                          </>
                        )}
                      </small>
                    </div>
                    <Icon n="chev" />
                  </button>
                  <QuestionChart metric={m} />
                  </div>
                ))}
              <h3>{translate("ui.skills.across.lessons")}</h3>
              {d.skills.map((s: AnyRow) => (
                <details key={s.skill} className="t-inset">
                  <summary>
                    {s.skill} · {s.earned} / {s.maxPoints} ({s.percent} %)
                  </summary>
                  {s.questions.map((m: AnyRow) => (
                    <button
                      className="t-linebtn"
                      key={m.runId + m.questionId}
                      onClick={() => setMetric(m)}
                    >
                      {m.prompt}
                      <Icon n="chev" />
                    </button>
                  ))}
                </details>
              ))}
            </>
          ) : (
            <Empty title={translate("ui.no.assigned.lessons.yet")} />
          )}
        </section>
      )}
      {invite && (
        <Overlay
          title={translate("ui.personal.invitation")}
          close={() => setInvite(null)}
        >
          <p>{translate("ui.send.this.link.to.student")}{" "}{invite.name}{" "}{translate("ui.it.opens.their.workspace.and.assigned.lessons")}</p>
          <InviteQR url={invite.inviteUrl} />
          <CopyLink url={invite.inviteUrl} />
          <button
            className="t-btn"
            disabled={busy}
            onClick={() => {
              if (
                window.confirm(
                  translate("ui.replace.invitation.the.old.qr.code.will.stop.working.and.the.student.must.sign.in.again"),
                )
              )
                op(async () => {
                  setInvite(
                    await api(
                      "/api/groups/" + id + "/renew/" + invite.id,
                      "POST",
                      {},
                    ),
                  );
                  reload();
                });
            }}
          >{translate("ui.replace.invitation")}</button>
          {err && <p role="alert">{translate(err)}</p>}
        </Overlay>
      )}
      {person && (
        <Overlay title={person.name} close={() => setPerson(null)}>
          <h3>{translate("ui.work.history")}</h3>
          {person.works.length ? (
            person.works.map((w: AnyRow) => (
              <button
                key={w.runId}
                className="t-linebtn"
                onClick={() => {
                  setPerson(null);
                  setWork(w);
                }}
              >
                {w.title}
                <Score w={w} />
              </button>
            ))
          ) : (
            <p>{translate("ui.no.work.yet")}</p>
          )}
          <h3>{translate("ui.points.by.skill")}</h3>
          {person.skills.map((s: AnyRow) => (
            <p key={s.skill}>
              {s.skill} · {s.earned} / {s.maxPoints} ({s.percent} %)
            </p>
          ))}
        </Overlay>
      )}
      {metric && (
        <Overlay title={translate("ui.responses.to.question")} close={() => setMetric(null)}>
          <div className="t-over">{metric.skill}</div>
          <h3>{metric.prompt}</h3>
          <p>{translate("ui.answeredLabel")}{" "}{metric.answered}{" "}{translate("ui.reviewedLabelLabel")}{" "}{metric.assessed}{" "}{translate("ui.awaiting.reviewLabelLabelLabel")}{" "}{metric.pending}.
            {metric.assessed > 0 && (
              <>
                {" "}{translate("ui.full.marks")}{" "}{metric.correct}{" "}{translate("ui.of")}{" "}{metric.assessed}{" "}{translate("ui.reviewedLabelLabelLabel")}{" "}{metric.correctPercent} %).
              </>
            )}
          </p>
          <QuestionChart metric={metric} />
          {metric.wrongOption && (
            <p>{translate("ui.option")}{" "}{metric.wrongOption}{" "}{translate("ui.selected.by")}{" "}{metric.wrongCount}{" "}{translate("ui.of")}{" "}{" "}
              {metric.answered}{" "}{translate("ui.respondents")}</p>
          )}
          {metric.works.map((w: AnyRow) => (
            <button
              key={w.studentId}
              className="t-linebtn"
              onClick={() => {
                setMetric(null);
                setWork(w);
              }}
            >
              {w.studentName}
              <Score w={w} />
            </button>
          ))}
          <button
            className="t-primary"
            disabled={!metric.works.length}
            onClick={() => {
              setWarmup(metric);
              setMetric(null);
            }}
          >{translate("ui.prepare.practice")}</button>
        </Overlay>
      )}
      {warm && (
        <Warmup
          metric={warm}
          group={g}
          close={() => setWarmup(null)}
          done={() => {
            setWarmup(null);
            setSuccess(
              translate("ui.practice.assigned.its.result.will.appear.separately.in.the.gradebook"),
            );
            reload();
          }}
        />
      )}
      {work && (
        <WorkView w={work} close={() => setWork(null)} refresh={reload} />
      )}
    </>
  );
}
