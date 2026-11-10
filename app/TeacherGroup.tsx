"use client";
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
  const [state, setState] = useState("");
  return (
    <div className="t-copy">
      <input
        readOnly
        value={url}
        aria-label={label}
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
            setState("Скопировано");
          } catch {
            inp.select();
            setState("Нажмите Ctrl+C или выберите «Копировать»");
          }
        }}
      >
        <Icon n="link" size={15} />
        {state || label}
      </button>
    </div>
  );
}
export function Score({ w }: { w: AnyRow }) {
  return (
    <span className={"t-status " + w.status}>
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
    <Overlay title="Работа ученика" close={close}>
      <h3>
        {w.studentName} · {w.title}
      </h3>
      {!d && !msg && <p>Загрузка работы…</p>}
      {d && (
        <>
          <Score w={d.work} />
          {d.questions.map((q: Question, i: number) => {
            const v = d.answers[q.id];
            return (
              <div className="t-inset t-stack" key={q.id}>
                <div className="t-over">
                  Вопрос {i + 1} · {q.skill}
                </div>
                <strong>{q.prompt}</strong>
                <p>
                  Ответ ученика:{" "}
                  {v === undefined || v === ""
                    ? "Нет ответа"
                    : q.type === "choice"
                      ? q.options[Number(v)]
                      : v}
                </p>
                {q.type === "choice" ? (
                  <p className="t-muted">
                    Ключ: {q.options[q.correctIndex ?? 0]} · Баллы:{" "}
                    {d.points[q.id] ?? "—"} / {q.maxPoints}
                  </p>
                ) : (
                  <>
                    <p className="t-muted">Критерий: {q.criterion}</p>
                    {d.work.status === "pending" ? (
                      <>
                        <label className="t-field">
                          <span>Баллы из {q.maxPoints}</span>
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
                          <Icon n="spark" />
                          Запросить подсказку ИИ
                        </button>
                        {suggest[q.id] && (
                          <p>
                            Предложение ИИ: {suggest[q.id].points} балл.
                            Основание: «{suggest[q.id].evidence}»
                          </p>
                        )}
                      </>
                    ) : (
                      <p>
                        Баллы: {d.points[q.id] ?? "—"} / {q.maxPoints}
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
                <span>Комментарий преподавателя</span>
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
                        "Укажите допустимый балл для каждого открытого ответа.",
                      );
                    const work = await api(url + "/grade", "POST", {
                      points: pts,
                      comment,
                    });
                    setDetails({ ...d, work, points: { ...d.points, ...pts } });
                    refresh();
                    setMessage("Итог подтверждён.");
                  })
                }
              >
                Подтвердить итог
              </button>
            </>
          ) : (
            d.work.comment && <p>Комментарий преподавателя: {d.work.comment}</p>
          )}
        </>
      )}
      {busy && <p role="status">Обработка…</p>}
      {msg && (
        <p role="status" className="t-notice">
          {msg}
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
    <Overlay title="Подготовить разминку" close={close}>
      <p className="t-muted">
        {metric.skill} · {metric.prompt}
      </p>
      <label className="t-field">
        <span>Название разминки</span>
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
          <Icon n="spark" />
          Предложить задания с ИИ
        </button>
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
        >
          Добавить вручную
        </button>
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
        <span>Кому назначить</span>
        <select
          value={all ? "all" : "some"}
          onChange={(e) => setEntireGroup(e.target.value === "all")}
        >
          <option value="all">Всей группе</option>
          <option value="some">Выбранным ученикам</option>
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
          {err}
        </div>
      )}
      {busy && <p>Обработка…</p>}
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
              throw Error("Выберите хотя бы одного ученика.");
            await api(url, "POST", {
              questionId: metric.questionId,
              questions: qs,
              title,
              ...(!all && { studentIds: ids }),
            });
            done();
          })
        }
      >
        Назначить разминку
      </button>
    </Overlay>
  );
}
export default function GroupView({
  id,
  back,
  refresh,
  initialMetric,
}: {
  id: string;
  back: () => void;
  refresh: () => void;
  initialMetric?: AnyRow | null;
}) {
  const [d, setDetails] = useState<AnyRow | null>(null),
    [tick, setRefreshTick] = useState(0),
    [tab, setTab] = useState(initialMetric ? "Аналитика" : "Состав"),
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
        <button className="t-back" onClick={back}>
          ← Группы
        </button>
        <p>{err || "Загрузка группы…"}</p>
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
        <Icon n="back" size={16} />
        Группы
      </button>
      <header className="t-heading">
        <div>
          <div className="t-over">Учебная группа</div>
          <h1>{g.name}</h1>
          <p>
            {g.students.length} уч. · Назначено занятий: {runs.length}
          </p>
        </div>
      </header>
      <div className="t-tabs">
        {["Состав", "Журнал", "Аналитика", "Занятия"].map((s) => (
          <button
            key={s}
            className={s === tab ? "active" : ""}
            onClick={() => setTab(s)}
          >
            {s}
          </button>
        ))}
      </div>
      {err && (
        <p className="t-error" role="alert">
          {err}
        </p>
      )}
      {success && <p className="t-notice">{success}</p>}
      {tab === "Состав" && (
        <section className="t-card">
          <h2>Участники группы</h2>
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
              <span>Имя или псевдоним ученика</span>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Например, Мария Иванова"
              />
            </label>
            <button className="t-primary" disabled={busy}>
              Добавить ученика
            </button>
          </form>
          {g.students.length === 0 && (
            <Empty title="В группе пока нет учеников" icon="group">
              После добавления участника появится индивидуальная ссылка для
              входа.
            </Empty>
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
              <button className="t-btn sm t-end" onClick={() => setInvite(s)}>
                <Icon n="link" size={15} />
                Приглашение
              </button>
            </div>
          ))}
        </section>
      )}
      {tab === "Занятия" && (
        <section className="t-card">
          <h2>Назначенные занятия</h2>
          {runs.length === 0 && (
            <Empty title="Занятий пока нет">
              Опубликуйте урок для этой группы.
            </Empty>
          )}
          {runs.map((r) => (
            <div key={r.id} className="t-inset">
              <strong>{r.title}</strong>
              <p className="t-muted">
                {r.kind === "warmup" ? "Разминка" : "Урок"} · Сдали{" "}
                {r.submitted} из {r.assigned}
              </p>
              <CopyLink url={r.url} label="Ссылка на занятие" />
            </div>
          ))}
        </section>
      )}
      {tab === "Журнал" && (
        <section className="t-card">
          <h2>Журнал группы</h2>
          {runs.length ? (
            <div className="t-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Ученик</th>
                    {runs.map((r) => (
                      <th key={r.id}>
                        {r.kind === "warmup" ? "Разминка · " : ""}
                        {r.title}
                        <small>
                          {new Date(r.createdAt).toLocaleDateString("ru-RU")}
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
            <Empty title="Журнал пока пуст">
              Здесь появятся результаты назначенных занятий.
            </Empty>
          )}
        </section>
      )}
      {tab === "Аналитика" && (
        <section className="t-card t-stack">
          <h2>Аналитика группы</h2>
          {chosen ? (
            <>
              <label className="t-field">
                <span>Занятие</span>
                <select
                  value={chosen.id}
                  onChange={(e) => setRunId(e.target.value)}
                >
                  {runs.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title} ·{" "}
                      {new Date(r.createdAt).toLocaleDateString("ru-RU")}
                    </option>
                  ))}
                </select>
              </label>
              <div className="t-numbers">
                {[
                  ["Получили", "assigned"],
                  ["Начали", "started"],
                  ["Сдали", "submitted"],
                  ["На проверке", "pending"],
                ].map(([s, k]) => (
                  <div key={k}>
                    <b>{chosen[k]}</b>
                    <span>{s}</span>
                  </div>
                ))}
              </div>
              <h3>Ответы на вопросы</h3>
              {metrics
                .filter((m) => m.runId === chosen.id)
                .map((m) => (
                  <button
                    className="t-linebtn"
                    key={m.questionId}
                    onClick={() => setMetric(m)}
                  >
                    <div>
                      <strong>{m.prompt}</strong>
                      <small>
                        {m.skill} · Верно: {m.correct} из {m.answered}{" "}
                        ответивших
                      </small>
                    </div>
                    <Icon n="chev" />
                  </button>
                ))}
              <h3>Навыки по всем занятиям</h3>
              {d.skills.map((s: AnyRow) => (
                <details key={s.skill} className="t-inset">
                  <summary>
                    {s.skill} · {s.earned} / {s.maxPoints}
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
            <Empty title="Пока нет назначенных занятий" />
          )}
        </section>
      )}
      {invite && (
        <Overlay
          title="Индивидуальное приглашение"
          close={() => setInvite(null)}
        >
          <p>
            Отправьте эту ссылку ученику «{invite.name}». Она открывает личный
            кабинет и все назначенные занятия.
          </p>
          <CopyLink url={invite.inviteUrl} />
        </Overlay>
      )}
      {person && (
        <Overlay title={person.name} close={() => setPerson(null)}>
          <h3>История работ</h3>
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
            <p>Пока нет работ.</p>
          )}
          <h3>Баллы по навыкам</h3>
          {person.skills.map((s: AnyRow) => (
            <p key={s.skill}>
              {s.skill} · {s.earned} / {s.maxPoints}
            </p>
          ))}
        </Overlay>
      )}
      {metric && (
        <Overlay title="Ответы на вопрос" close={() => setMetric(null)}>
          <div className="t-over">{metric.skill}</div>
          <h3>{metric.prompt}</h3>
          <p>
            Правильно ответили {metric.correct} из {metric.answered}.
          </p>
          {metric.wrongOption && (
            <p>
              Вариант «{metric.wrongOption}» выбрали {metric.wrongCount} из{" "}
              {metric.answered} ответивших.
            </p>
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
          >
            Подготовить разминку
          </button>
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
              "Разминка назначена. Результат появится отдельно в журнале.",
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
