"use client";
import { useEffect, useState } from "react";
import { AnyRow, Overlay, api, statusName } from "./teacher-ui";

async function qr(url: string) {
  const { toDataURL } = await import("qrcode");
  return toDataURL(url, { width: 220, margin: 4 });
}
export function InviteQR({ url }: { url: string }) {
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
      alt="QR-код индивидуального приглашения"
    />
  ) : null;
}
async function printCards(group: AnyRow) {
  const win = window.open("", "_blank");
  if (!win) throw Error("Разрешите открытие окна для печати.");
  try {
    win.opener = null;
    const doc = win.document;
    doc.title = "Приглашения · " + group.name;
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
            <button className="t-btn" onClick={() => open("import")}>
              Импорт класса
            </button>
            <button
              className="t-btn"
              disabled={busy || !group.students.length}
              onClick={() => perform(() => printCards(group))}
            >
              Печать QR-карточек
            </button>
            <button className="t-btn" onClick={() => open("staff")}>
              Преподаватели класса
            </button>
          </>
        )}
        {!!lessons.length && (
          <button className="t-btn" onClick={() => open("share")}>
            Передать копию урока
          </button>
        )}
      </div>
      {!mode && message && <p role="status">{message}</p>}
      {mode && (
        <Overlay
          title={
            mode === "import"
              ? "Импорт класса"
              : mode === "staff"
                ? "Преподаватели класса"
                : "Передать копию урока"
          }
          close={() => {
            if (!busy) setMode("");
          }}
        >
          {mode === "import" ? (
            <>
              <label className="t-field">
                Список учеников
                <textarea
                  rows={7}
                  value={raw}
                  onChange={(e) => setRaw(e.target.value)}
                  placeholder="Вставьте один столбец из Excel, по одному имени в строке"
                />
              </label>
              <p>
                К добавлению: {fresh.length}. Совпадений по имени:{" "}
                {names.length - fresh.length}. Для однофамильцев укажите разные
                подписи.
              </p>
              {!!fresh.length && (
                <details>
                  <summary>Проверить список</summary>
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
                      "Добавлено: " +
                        r.added +
                        ". Пропущено: " +
                        r.skipped +
                        ".",
                    );
                    reload();
                  })
                }
              >
                Добавить список
              </button>
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
                    <p>Пока класс ведёте только вы.</p>
                  )}
                  <label className="t-field">
                    Предмет
                    <input
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                    />
                  </label>
                </>
              )}
              {mode === "share" && (
                <label className="t-field">
                  Урок
                  <select
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
              <label className="t-field">
                Почта преподавателя
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <p>
                {mode === "staff"
                  ? "У преподавателя должна быть учётная запись Logus. Он получит список учеников и свой журнал."
                  : "Коллега, который ведёт этот класс, получит отдельный черновик с материалом и вопросами."}
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
                        ? "Преподаватель назначен."
                        : "Копия добавлена в уроки коллеги.",
                    );
                    setMode("");
                    reload();
                  })
                }
              >
                {mode === "staff"
                  ? "Назначить преподавателя"
                  : "Передать копию"}
              </button>
            </>
          )}
          {message && <p role="alert">{message}</p>}
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
        "Ученик",
        ...selected.map(
          (r) =>
            (r.kind === "warmup" ? "Разминка" : "Урок") +
            " · " +
            r.title +
            " · " +
            day(r.createdAt) +
            " (из " +
            r.maxPoints +
            ")",
        ),
      ];
      const cells = new Map(works.map((w) => [w.studentId + "/" + w.runId, w]));
      const rows = group.students.map((s: AnyRow) => [
        s.name,
        ...selected.map((r) => {
          const w = cells.get(s.id + "/" + r.id);
          if (!w) return "Не назначено";
          if (w.status === "graded") return w.score;
          return w.status === "pending"
            ? "Ожидает проверки"
            : "Не сдал · " + statusName(w.status);
        }),
      ]);
      await writeExcel(
        [
          header.map((value) => ({ value, fontWeight: "bold" as const })),
          ...rows,
        ],
        {
          sheet: "Журнал",
          columns: header.map(() => ({ width: 32 })),
          stickyRowsCount: 1,
          stickyColumnsCount: 1,
        },
      ).toFile("Журнал " + group.name + ".xlsx");
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
      >
        Скачать Excel
      </button>
      {open && (
        <Overlay title="Экспорт журнала" close={() => setOpen(false)}>
          <label className="t-field">
            Занятие
            <select value={run} onChange={(e) => setRun(e.target.value)}>
              <option value="">Все занятия</option>
              {runs.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title} · {day(r.createdAt)}
                </option>
              ))}
            </select>
          </label>
          <div className="t-actions">
            <label className="t-field">
              С даты
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label className="t-field">
              По дату
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
          </div>
          <p>Занятий в файле: {selected.length}</p>
          {error && <p role="alert">{error}</p>}
          <button
            className="t-primary"
            disabled={busy || !selected.length}
            onClick={download}
          >
            {busy ? "Создаём файл…" : "Скачать .xlsx"}
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
  const [chosen, setChosen] = useState(initialRun),
    run = chosen || runs[0]?.id;
  return (
    <section className="t-card t-stack">
      <h2>Урок идёт</h2>
      {!run ? (
        <p>Сначала назначьте урок группе.</p>
      ) : (
        <>
          <label className="t-field">
            Занятие
            <select value={run} onChange={(e) => setChosen(e.target.value)}>
              {runs.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title} · {new Date(r.createdAt).toLocaleString("ru-RU")}
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
function RunMonitor({ run, reload }: { run: string; reload: () => void }) {
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
      {error && <p role="alert">{error}</p>}
      {!data ? (
        <p>Загружаем список…</p>
      ) : (
        <>
          <p>
            Назначено: {students.length} · Вошли в кабинет:{" "}
            {
              students.filter(
                (s) => s.entered || s.opened || s.status !== "not_started",
              ).length
            }{" "}
            · Открыли урок:{" "}
            {
              students.filter((s) => s.opened || s.status !== "not_started")
                .length
            }{" "}
            · Начали задания:{" "}
            {students.filter((s) => s.status !== "not_started").length} · Сдали:{" "}
            {
              students.filter((s) => ["pending", "graded"].includes(s.status))
                .length
            }
          </p>
          <div className="t-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Ученик</th>
                  <th>Ход работы</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.id}>
                    <td>{s.name}</td>
                    <td>
                      {s.status === "not_started"
                        ? s.opened
                          ? "Открыл материал"
                          : s.entered
                            ? "Вошёл в кабинет"
                            : "Ещё не открыл"
                        : statusName(s.status)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!!question && (
            <>
              <h3>Проверка по вопросу</h3>
              <label className="t-field">
                Открытый вопрос
                <select
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
              <p>Критерий: {question.criterion}</p>
              <details>
                <summary>Все сданные ответы на этот вопрос</summary>
                {students
                  .filter(
                    (s) => s.status === "pending" || s.status === "graded",
                  )
                  .map((s) => (
                    <div className="t-inset" key={s.id}>
                      <strong>{s.name}</strong>
                      <p>{s.answers[question.id] || "Ответ не введён"}</p>
                      <small>
                        {Object.hasOwn(s.points, question.id)
                          ? s.points[question.id] + " / " + question.maxPoints
                          : "Ожидает проверки"}
                      </small>
                    </div>
                  ))}
              </details>
              {pupil ? (
                <div className="t-inset t-stack">
                  <strong>
                    {pupil.name} · В очереди: {queue.length}
                  </strong>
                  <p>{pupil.answers[question.id] || "Ответ не введён"}</p>
                  <label className="t-field">
                    Баллы из {question.maxPoints}
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
                  <label className="t-field">
                    Комментарий к ответу
                    <textarea
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
                  >
                    Подтвердить и перейти дальше
                  </button>
                </div>
              ) : (
                <p>Все сданные ответы на этот вопрос проверены.</p>
              )}
              {markError && <p role="alert">{markError}</p>}
            </>
          )}
        </>
      )}
    </>
  );
}
