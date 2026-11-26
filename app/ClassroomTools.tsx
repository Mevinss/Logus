"use client";
import { Skeleton } from "./Motion";
import { translate, formatDate, useI18n } from "./I18n";
import { useEffect, useState } from "react";
import { AnyRow, Overlay, api, statusName } from "./teacher-ui";

async function qr(url: string) {
  const { toDataURL } = await import("qrcode");
  return toDataURL(url, { width: 220, margin: 4 });
}
export function InviteQR({ url }: { url: string }) {
  useI18n();
  const [src, setSrc] = useState("");
  useEffect(() => {
    let live = true;
    setSrc("");
    qr(url)
      .then((s) => live && setSrc(s))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [url]);
  return src ? (
    <img
      src={src}
      width="180"
      height="180"
      alt={translate("ui.personal.invitation.qr.code")}
    />
  ) : null;
}
async function printCards(group: AnyRow) {
  const win = window.open("", "_blank");
  if (!win) throw Error(translate("ui.allow.the.print.window.to.open"));
  try {
    win.opener = null;
    const doc = win.document;
    doc.title = translate("Приглашения ·") + " " + group.name;
    const style = doc.createElement("style");
    style.textContent =
      "body{font:16px Arial;color:#17271d} main{display:grid;grid-template-columns:repeat(3,1fr)} article{text-align:center;border:1px dashed #aaa;padding:12px;break-inside:avoid} img{display:block;width:36mm;height:36mm;margin:auto} small{display:block} @page{margin:10mm}";
    doc.head.append(style);
    const main = doc.createElement("main");
    doc.body.append(main);
    await Promise.all(
      group.students.map(async (s: AnyRow) => {
        const card = doc.createElement("article"),
          title = doc.createElement("strong"),
          sub = doc.createElement("small"),
          img = doc.createElement("img");
        title.textContent = s.name;
        sub.textContent = "Logus · " + group.name;
        card.append(title, img, sub);
        main.append(card);
        img.src = await qr(s.inviteUrl);
        await img.decode();
      }),
    );
    win.focus();
    win.print();
  } catch (e) {
    win.close();
    throw e;
  }
}

export function RosterTools({
  group,
  staff,
  lessons,
  reload,
}: {
  group: AnyRow;
  staff: AnyRow[];
  lessons: AnyRow[];
  reload: () => void;
}) {
  useI18n();
  const [mode, setMode] = useState(""),
    [raw, setRaw] = useState(""),
    [email, setEmail] = useState(""),
    [subject, setSubject] = useState(""),
    [lesson, setLesson] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const names = raw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const norm = (s: string) =>
    s.normalize("NFKC").toLocaleLowerCase("ru").replace(/\s+/g, " ").trim();
  const known = new Set(group.students.map((s: AnyRow) => norm(s.name)));
  const fresh = names.filter((s) => {
    if (known.has(norm(s))) return false;
    known.add(norm(s));
    return true;
  });
  const open = (s: string) => {
    setMode(s);
    setMessage("");
    setEmail("");
    setRaw("");
    setSubject("");
    setLesson(lessons[0]?.id || "");
  };
  const perform = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="t-stack">
      <div className="t-actions">
        {group.managesRoster && (
          <>
            <button className="t-btn" onClick={() => open("import")}>{translate("ui.import.class")}</button>
            <button
              className="t-btn"
              disabled={busy || !group.students.length}
              onClick={() => perform(() => printCards(group))}
            >{translate("ui.print.qr.cards")}</button>
          </>
        )}
        {(group.managesRoster || !!lessons.length) && (
          <details className="t-more">
            <summary className="t-btn">{translate("roster.more")} <span aria-hidden="true">⋯</span></summary>
            <div className="t-more-menu">
              {group.managesRoster && (
                <button onClick={(e) => { (e.currentTarget.closest("details") as HTMLDetailsElement).open = false; open("staff"); }}>{translate("ui.class.teachers")}</button>
              )}
              {!!lessons.length && (
                <button onClick={(e) => { (e.currentTarget.closest("details") as HTMLDetailsElement).open = false; open("share"); }}>{translate("ui.share.lesson.copy")}</button>
              )}
            </div>
          </details>
        )}
      </div>
      {!mode && message && <p role="status">{translate(message)}</p>}
      {mode && (
        <Overlay
          title={
            mode === "import"
              ? translate("ui.import.class")
              : mode === "staff"
                ? translate("ui.class.teachers")
                : translate("ui.share.lesson.copy")
          }
          close={() => {
            if (!busy) setMode("");
          }}
        >
          {mode === "import" ? (
            <>
              <label className="t-field">{translate("ui.student.list")}<textarea
                  rows={7}
                  value={raw}
                  onChange={(e) => setRaw(e.target.value)}
                  placeholder={translate("ui.paste.one.excel.column.one.name.per.line")}
                />
              </label>
              <p>{translate("ui.to.add")}{" "}{fresh.length}{" "}{translate("ui.matching.names")}{" "}{" "}
                {names.length - fresh.length}{translate("ui.use.distinct.labels.for.students.with.matching.names")}</p>
              {!!fresh.length && (
                <details>
                  <summary>{translate("ui.check.list")}</summary>
                  <ol>
                    {fresh.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ol>
                </details>
              )}
              <button
                className="t-primary"
                disabled={busy || !fresh.length}
                onClick={() =>
                  perform(async () => {
                    const r = await api(
                      "/api/groups/" + group.id + "/import",
                      "POST",
                      { names },
                    );
                    setMode("");
                    setMessage(
                      translate("Добавлено:") + " " +
                        r.added +
                        translate(". Пропущено:") + " " +
                        r.skipped +
                        ".",
                    );
                    reload();
                  })
                }
              >{translate("ui.add.list")}</button>
            </>
          ) : (
            <>
              {mode === "staff" && (
                <>
                  {staff.length ? (
                    staff.map((s) => (
                      <p key={s.email}>
                        {s.subject} · {s.email}
                      </p>
                    ))
                  ) : (
                    <p>{translate("ui.you.are.the.only.teacher.in.this.class")}</p>
                  )}
                  <label className="t-field">{translate("ui.subject")}<input
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                    />
                  </label>
                </>
              )}
              {mode === "share" && (
                <label className="t-field">{translate("ui.lessonLabel")}<select
                    value={lesson}
                    onChange={(e) => setLesson(e.target.value)}
                  >
                    {lessons.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.title}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="t-field">{translate("ui.teacher.email")}<input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <p>
                {mode === "staff"
                  ? translate("ui.the.teacher.needs.a.logus.account.they.will.get.the.class.roster.and.their.own.gradebook")
                  : translate("ui.a.colleague.teaching.this.class.receives.a.separate.draft.with.materials.and.questions")}
              </p>
              <button
                className="t-primary"
                disabled={
                  busy ||
                  !email.trim() ||
                  (mode === "staff" ? !subject.trim() : !lesson)
                }
                onClick={() =>
                  perform(async () => {
                    if (mode === "staff")
                      await api("/api/groups/" + group.id + "/staff", "POST", {
                        email,
                        subject,
                      });
                    else
                      await api("/api/lessons/" + lesson + "/share", "POST", {
                        email,
                        groupId: group.id,
                      });
                    setMessage(
                      mode === "staff"
                        ? translate("ui.teacher.assigned")
                        : translate("ui.copy.added.to.colleague.s.lessons"),
                    );
                    setMode("");
                    reload();
                  })
                }
              >
                {mode === "staff"
                  ? translate("ui.assign.teacher")
                  : translate("ui.share.copy")}
              </button>
            </>
          )}
          {message && <p role="alert">{translate(message)}</p>}
        </Overlay>
      )}
    </div>
  );
}

export function ExportJournal({
  group,
  runs,
  works,
}: {
  group: AnyRow;
  runs: AnyRow[];
  works: AnyRow[];
}) {
  useI18n();
  const [open, setOpen] = useState(false),
    [run, setRun] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const day = (s: string) => new Date(s).toLocaleDateString("sv-SE");
  const selected = runs.filter(
    (r) =>
      (!run || r.id === run) &&
      (!from || day(r.createdAt) >= from) &&
      (!to || day(r.createdAt) <= to),
  );
  async function download() {
    setBusy(true);
    setError("");
    try {
      const writeExcel = (await import("write-excel-file/browser")).default;
      const header = [
        translate("Ученик"),
        ...selected.map(
          (r) =>
            (r.kind === "warmup" ? translate("Разминка") : translate("Урок")) +
            " · " +
            r.title +
            " · " +
            day(r.createdAt) +
            " " + translate("(из") + " " +
            r.maxPoints +
            ")",
        ),
      ];
      const cells = new Map(works.map((w) => [w.studentId + "/" + w.runId, w]));
      const rows = group.students.map((s: AnyRow) => [
        s.name,
        ...selected.map((r) => {
          const w = cells.get(s.id + "/" + r.id);
          if (!w) return translate("Не назначено");
          if (w.status === "graded") return w.score;
          return w.status === "pending"
            ? translate("Ожидает проверки")
            : translate("Не сдал ·") + " " + statusName(w.status);
        }),
      ]);
      await writeExcel(
        [
          header.map((value) => ({ value, fontWeight: "bold" as const })),
          ...rows,
        ],
        {
          sheet: translate("Журнал"),
          columns: header.map(() => ({ width: 32 })),
          stickyRowsCount: 1,
          stickyColumnsCount: 1,
        },
      ).toFile(translate("Журнал") + " " + group.name + ".xlsx");
      setOpen(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        className="t-btn"
        disabled={!runs.length}
        onClick={() => setOpen(true)}
      >{translate("ui.download.excel")}</button>
      {open && (
        <Overlay title={translate("ui.export.gradebook")} close={() => setOpen(false)}>
          <label className="t-field">{translate("ui.lessonLabelLabel")}<select value={run} onChange={(e) => setRun(e.target.value)}>
              <option value="">{translate("ui.all.lessons")}</option>
              {runs.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title} · {day(r.createdAt)}
                </option>
              ))}
            </select>
          </label>
          <div className="t-actions">
            <label className="t-field">{translate("ui.from.date")}<input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label className="t-field">{translate("ui.to.date")}<input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
          </div>
          <p>{translate("ui.lessons.in.file")}{" "}{selected.length}</p>
          {error && <p role="alert">{translate(error)}</p>}
          <button
            className="t-primary"
            disabled={busy || !selected.length}
            onClick={download}
          >
            {busy ? translate("ui.creating.file") : translate("ui.download.xlsx")}
          </button>
        </Overlay>
      )}
    </>
  );
}

export function LiveClassroom({
  runs,
  reload,
  initialRun,
}: {
  runs: AnyRow[];
  reload: () => void;
  initialRun: string;
}) {
  useI18n();
  const [chosen, setChosen] = useState(initialRun),
    run = chosen || runs[0]?.id;
  return (
    <section className="t-card t-stack">
      <h2>{translate("ui.live.lesson")}</h2>
      {!run ? (
        <p>{translate("ui.assign.a.lesson.to.the.class.first")}</p>
      ) : (
        <>
          <label className="t-field">{translate("ui.lessonLabelLabel")}<select value={run} onChange={(e) => setChosen(e.target.value)}>
              {runs.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title} · {formatDate(r.createdAt,true)}
                </option>
              ))}
            </select>
          </label>
          <RunMonitor key={run} run={run} reload={reload} />
        </>
      )}
    </section>
  );
}
function LiveChip({ s, total, max }: { s: AnyRow; total: number; max: number }) {
  if (s.status === "not_started") {
    const label = s.opened
      ? translate("ui.opened.material")
      : s.entered
        ? translate("ui.signed.inLabel")
        : translate("ui.not.opened.yet");
    return <span key={"n" + (s.opened ? 2 : s.entered ? 1 : 0)} className={"live-chip " + (s.opened || s.entered ? "is-seen" : "is-idle")}>{label}</span>;
  }
  if (s.status === "in_progress")
    return (
      <span key={"w" + (s.answered || 0)} className="live-chip is-working">
        {translate("live.answering", undefined, { done: s.answered || 0, total })}
        <i className="live-mini" aria-hidden="true">
          <b style={{ width: (total ? ((s.answered || 0) / total) * 100 : 0) + "%" }} />
        </i>
      </span>
    );
  if (s.status === "graded" && max) {
    const ratio = (s.score || 0) / max;
    return (
      <span key={"g" + s.score} className={"live-chip is-graded " + (ratio >= 0.75 ? "is-high" : ratio >= 0.5 ? "is-mid" : "is-low")}>
        ✓ {statusName(s.status)} · {s.score} / {max}
      </span>
    );
  }
  return <span key="p" className="live-chip is-pending">✓ {translate("live.submitted")} · {statusName(s.status)}</span>;
}
function RunMonitor({ run, reload }: { run: string; reload: () => void }) {
  useI18n();
  const [data, setData] = useState<AnyRow | null>(null),
    [error, setError] = useState(""),
    [version, setVersion] = useState(0),
    [qid, setQid] = useState("");
  const [busy, setBusy] = useState(false),
    [draft, setDraft] = useState({ id: "", score: "", note: "" }),
    [markError, setMarkError] = useState("");
  useEffect(() => {
    let live = true,
      timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const d = await api("/api/runs/" + run + "/classroom");
        if (live) {
          setData(d);
          setError("");
        }
      } catch (e) {
        if (live) setError((e as Error).message);
      } finally {
        if (live) timer = setTimeout(poll, 5000);
      }
    };
    void poll();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [run, version]);
  const students: AnyRow[] = data?.students || [],
    questions: AnyRow[] = data?.questions || [];
  const question = questions.find((q) => q.id === qid) || questions[0];
  const queue = students.filter(
    (s) =>
      s.status === "pending" &&
      question &&
      !Object.hasOwn(s.points, question.id),
  );
  const pupil = queue.find((s) => s.id === draft.id) || queue[0];
  const field =
    pupil && draft.id === pupil.id
      ? draft
      : { id: pupil?.id || "", score: "", note: "" };
  async function mark() {
    setBusy(true);
    setMarkError("");
    try {
      await api("/api/works/" + run + "/" + pupil.id + "/mark", "POST", {
        questionId: question.id,
        points: Number(field.score),
        comment: field.note,
      });
      setData(
        (current) =>
          current && {
            ...current,
            students: current.students.map((s: AnyRow) =>
              s.id !== pupil.id
                ? s
                : {
                    ...s,
                    points: { ...s.points, [question.id]: Number(field.score) },
                  },
            ),
          },
      );
      setDraft({ id: "", score: "", note: "" });
      setVersion((v) => v + 1);
      reload();
    } catch (e) {
      setMarkError((e as Error).message);
      setVersion((v) => v + 1);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {error && <p role="alert">{translate(error)}</p>}
      {!data ? (
        <Skeleton label={translate("ui.loading.list")} rows={5} />
      ) : (
        <>
          {(() => {
            const total = students.length,
              done = students.filter((s) => ["pending", "graded"].includes(s.status)).length,
              working = students.filter((s) => s.status === "in_progress").length;
            return (
              <div className="live-progress" aria-label={translate("live.progress", undefined, { done, total })}>
                <div className="live-progress-head">
                  <strong>{translate("live.progress", undefined, { done, total })}</strong>
                  <span>{total ? Math.round((done / total) * 100) : 0} %</span>
                </div>
                <div className="live-bar" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
                  <span className="is-done" style={{ width: (total ? (done / total) * 100 : 0) + "%" }} />
                  <span className="is-working" style={{ width: (total ? (working / total) * 100 : 0) + "%" }} />
                </div>
              </div>
            );
          })()}
          <p className="live-funnel">{translate("test.liveCounts",undefined,{
            assigned:students.length,
            entered:students.filter(s=>s.entered||s.opened||s.status!=="not_started").length,
            opened:students.filter(s=>s.opened||s.status!=="not_started").length,
            started:students.filter(s=>s.status!=="not_started").length,
            submitted:students.filter(s=>["pending","graded"].includes(s.status)).length,
          })}</p>
          <div className="t-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{translate("ui.studentLabel")}</th>
                  <th>{translate("ui.work.progress")}</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.id}>
                    <td>{s.name}</td>
                    <td>
                      <LiveChip s={s} total={data.totalQuestions || 0} max={data.maxPoints || 0} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!!question && (
            <>
              <h3>{translate("ui.review.by.question")}</h3>
              <label className="t-field">{translate("ui.open.questionLabel")}<select
                  value={question.id}
                  disabled={busy}
                  onChange={(e) => {
                    setQid(e.target.value);
                    setDraft({ id: "", score: "", note: "" });
                    setMarkError("");
                  }}
                >
                  {questions.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.prompt}
                    </option>
                  ))}
                </select>
              </label>
              <p>{translate("ui.criterion")}{" "}{question.criterion}</p>
              <details>
                <summary>{translate("ui.all.submitted.responses.to.this.question")}</summary>
                {students
                  .filter(
                    (s) => s.status === "pending" || s.status === "graded",
                  )
                  .map((s) => (
                    <div className="t-inset" key={s.id}>
                      <strong>{s.name}</strong>
                      <p>{s.answers[question.id] || translate("ui.no.response.entered")}</p>
                      <small>
                        {Object.hasOwn(s.points, question.id)
                          ? s.points[question.id] + " / " + question.maxPoints
                          : translate("ui.awaiting.reviewLabelLabelLabelLabel")}
                      </small>
                    </div>
                  ))}
              </details>
              {pupil ? (
                <div className="t-inset t-stack">
                  <strong>
                    {pupil.name}{" "}{translate("ui.in.queue")}{" "}{queue.length}
                  </strong>
                  <p>{pupil.answers[question.id] || translate("ui.no.response.entered")}</p>
                  <label className="t-field">{translate("ui.points.out.of")}{" "}{question.maxPoints}
                    <input
                      type="number"
                      min="0"
                      max={question.maxPoints}
                      value={field.score}
                      onChange={(e) =>
                        setDraft({ ...field, score: e.target.value })
                      }
                    />
                  </label>
                  <label className="t-field">{translate("ui.response.feedback")}<textarea
                      maxLength={2000}
                      value={field.note}
                      onChange={(e) =>
                        setDraft({ ...field, note: e.target.value })
                      }
                    />
                  </label>
                  <button
                    className="t-primary"
                    disabled={
                      busy ||
                      field.score === "" ||
                      Number(field.score) < 0 ||
                      Number(field.score) > question.maxPoints
                    }
                    onClick={mark}
                  >{translate("ui.confirm.and.continue")}</button>
                </div>
              ) : (
                <p>{translate("ui.all.submitted.responses.to.this.question.have.been.reviewed")}</p>
              )}
              {markError && <p role="alert">{markError}</p>}
            </>
          )}
        </>
      )}
    </>
  );
}
