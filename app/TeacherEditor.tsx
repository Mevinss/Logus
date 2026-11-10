"use client";
import React, { useState } from "react";
import { AnyRow, Icon, Overlay, api } from "./teacher-ui";

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
export function blank(p?: Page, skill = ""): Question {
  return {
    id: "q-" + Math.random().toString(36).slice(2) + Date.now().toString(36),
    type: "choice",
    prompt: "",
    options: ["", ""],
    correctIndex: null,
    criterion: "",
    maxPoints: 1,
    skill,
    sourceId: p?.id || 1,
    quote: "",
  };
}
function label(text: string, input: React.ReactNode) {
  return (
    <label className="t-field">
      <span>{text}</span>
      {input}
    </label>
  );
}
export function validate(qs: Question[], pages: Page[], selected: number[]) {
  if (!qs.length) throw Error("Добавьте хотя бы один вопрос.");
  for (const [i, q] of qs.entries()) {
    const issue = !q.prompt.trim()
      ? "Введите формулировку."
      : !q.skill.trim()
        ? "Укажите навык."
        : !Number.isInteger(q.maxPoints) || q.maxPoints < 1
          ? "Укажите целое число баллов больше нуля."
          : q.type === "choice" &&
              (q.options.length < 2 ||
                q.options.some((o) => !o.trim()) ||
                q.correctIndex === null ||
                !q.options[q.correctIndex])
            ? "Заполните варианты и отметьте правильный ответ."
            : q.type === "open" && !q.criterion.trim()
              ? "Добавьте критерий проверки."
              : !selected.includes(q.sourceId)
                ? "Выберите источник из отмеченных страниц."
                : !q.quote.trim() ||
                    !pages
                      .find((p) => p.id === q.sourceId)
                      ?.text.replace(/\s+/g, " ")
                      .includes(q.quote.trim().replace(/\s+/g, " "))
                  ? "Вставьте точную цитату из источника."
                  : "";
    if (issue) throw Error("Вопрос " + (i + 1) + ". " + issue);
  }
}
export function Source({
  p,
  pdf,
  close,
}: {
  p: Page;
  pdf?: string;
  close: () => void;
}) {
  return (
    <Overlay title={(pdf ? "Страница " : "Абзац ") + p.id} close={close}>
      {pdf && (
        <>
          <a
            target="_blank"
            rel="noreferrer"
            className="t-link"
            href={pdf + "#page=" + p.id}
          >
            Открыть оригинал PDF ↗
          </a>
          <iframe
            title={"Страница " + p.id}
            src={pdf + "#page=" + p.id}
            className="t-pdf"
          />
        </>
      )}
      <p className="t-source-text">
        {p.text || "На этой странице нет извлечённого текста."}
      </p>
    </Overlay>
  );
}
export function QuestionEdit({
  q,
  i,
  pages,
  pdf,
  change,
  remove,
  replace,
  fixedSkill,
}: {
  q: Question;
  i: number;
  pages: Page[];
  pdf?: string;
  change: (q: Question) => void;
  remove: () => void;
  replace?: () => void;
  fixedSkill?: boolean;
}) {
  const [source, setSource] = useState(false);
  const page = pages.find((p) => p.id === q.sourceId);
  const patch = (v: Partial<Question>) => change({ ...q, ...v });
  return (
    <article className="t-question">
      <div className="t-row">
        <strong className="t-qnum">
          Вопрос {String(i + 1).padStart(2, "0")}
        </strong>
        <button type="button" className="t-textbtn" onClick={remove}>
          Удалить
        </button>
      </div>
      <div className="t-qgrid">
        <div className="t-stack">
          {label(
            "Тип вопроса",
            <select
              value={q.type}
              onChange={(e) =>
                patch({
                  type: e.target.value as Question["type"],
                  options: e.target.value === "choice" ? ["", ""] : [],
                  correctIndex: null,
                })
              }
            >
              <option value="choice">Один правильный ответ</option>
              <option value="open">Короткий открытый ответ</option>
            </select>,
          )}
          {label(
            "Формулировка",
            <textarea
              rows={2}
              value={q.prompt}
              onChange={(e) => patch({ prompt: e.target.value })}
            />,
          )}
          {q.type === "choice" ? (
            <fieldset className="t-options">
              <legend>Варианты · отметьте правильный</legend>
              {q.options.map((v, j) => (
                <div className="t-opt" key={j}>
                  <input
                    type="radio"
                    name={"key-" + q.id}
                    checked={q.correctIndex === j}
                    aria-label={"Правильный вариант " + (j + 1)}
                    onChange={() => patch({ correctIndex: j })}
                  />
                  <input
                    aria-label={"Вариант " + (j + 1)}
                    value={v}
                    onChange={(e) =>
                      patch({
                        options: q.options.map((o, k) =>
                          k === j ? e.target.value : o,
                        ),
                      })
                    }
                  />
                  {q.options.length > 2 && (
                    <button
                      type="button"
                      className="t-iconbtn"
                      aria-label={"Удалить вариант " + (j + 1)}
                      onClick={() =>
                        patch({
                          options: q.options.filter((_, k) => k !== j),
                          correctIndex:
                            q.correctIndex === null || q.correctIndex === j
                              ? null
                              : q.correctIndex > j
                                ? q.correctIndex - 1
                                : q.correctIndex,
                        })
                      }
                    >
                      <Icon n="x" size={14} />
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                className="t-textbtn"
                onClick={() => patch({ options: [...q.options, ""] })}
              >
                + Вариант
              </button>
            </fieldset>
          ) : (
            label(
              "Критерий проверки",
              <textarea
                value={q.criterion}
                onChange={(e) => patch({ criterion: e.target.value })}
              />,
            )
          )}
          <div className="t-inline-fields">
            {label(
              "Навык",
              <input
                value={q.skill}
                readOnly={fixedSkill}
                onChange={(e) => patch({ skill: e.target.value })}
              />,
            )}
            {label(
              "Макс. балл",
              <input
                type="number"
                min={1}
                value={q.maxPoints || ""}
                onChange={(e) => patch({ maxPoints: Number(e.target.value) })}
              />,
            )}
          </div>
        </div>
        <aside className="t-source">
          <div className="t-over">
            <Icon n="book" /> Источник вопроса
          </div>
          {label(
            pdf ? "Страница PDF" : "Абзац материала",
            <select
              value={q.sourceId}
              onChange={(e) =>
                patch({ sourceId: Number(e.target.value), quote: "" })
              }
            >
              {pages.map((p) => (
                <option key={p.id} value={p.id}>
                  {pdf ? "Страница" : "Абзац"} {p.id}
                </option>
              ))}
            </select>,
          )}
          {page && (
            <>
              <blockquote>
                {page.text.slice(0, 400)}
                {page.text.length > 400 ? "…" : ""}
              </blockquote>
              <button
                className="t-textbtn"
                type="button"
                onClick={() => setSource(true)}
              >
                Открыть источник ↗
              </button>
            </>
          )}
          {label(
            "Цитата-основание",
            <textarea
              rows={3}
              placeholder="Точная фраза из материала"
              value={q.quote}
              onChange={(e) => patch({ quote: e.target.value })}
            />,
          )}
          {replace && (
            <button type="button" className="t-textbtn" onClick={replace}>
              <Icon n="spark" size={15} /> Заменить с ИИ
            </button>
          )}
        </aside>
      </div>
      {source && page && (
        <Source p={page} pdf={pdf} close={() => setSource(false)} />
      )}
    </article>
  );
}
export default function Editor({
  initial,
  groups,
  leave,
  published,
  updated,
}: {
  initial: AnyRow;
  groups: AnyRow[];
  leave: () => void;
  published: (run: AnyRow) => void;
  updated: () => void;
}) {
  const [lesson, setLesson] = useState(initial),
    [title, setTitle] = useState(initial.title),
    [inst, setInst] = useState(initial.instruction || ""),
    [qs, setQs] = useState<Question[]>(initial.questions),
    [selected, setSelected] = useState<number[]>(initial.selectedPages),
    [manual, setManual] = useState(""),
    [editSource, setEditSource] = useState((initial.pages || []).length === 0),
    [source, setSource] = useState<Page | null>(null),
    [group, setGroup] = useState(groups[0]?.id || ""),
    [publish, setPublish] = useState(false),
    [msg, setMsg] = useState(""),
    [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  const pages: Page[] = lesson.pages;
  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setMsg("");
    setError("");
    try {
      await fn();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };
  const save = async () => {
    if (!title.trim()) throw Error("Введите название урока.");
    if (editSource && manual.trim())
      throw Error("Сначала нажмите «Применить текст».");
    return api("/api/lessons/" + lesson.id, "PATCH", {
      title,
      instruction: inst,
      selectedPages: selected,
      questions: qs,
    });
  };
  const apply = (l: AnyRow) => {
    setLesson(l);
    setSelected(l.selectedPages);
    setQs(l.questions);
    setEditSource(false);
    setManual("");
    updated();
  };
  const generate = (i?: number) =>
    run("Генерация вопросов…", async () => {
      if (!selected.length) throw Error("Выберите страницы материала.");
      await save();
      const r = await api(
        "/api/lessons/" + lesson.id + "/generate",
        "POST",
        {},
      );
      if (r.questions.length) {
        setQs(
          i === undefined
            ? r.questions
            : qs.map((q, k) => (k === i ? { ...r.questions[0], id: q.id } : q)),
        );
      }
      setMsg(
        [
          ...(r.issues || []),
          r.questions.length
            ? "Проверьте вопросы и сохраните черновик."
            : "ИИ не вернул вопросы. Повторите генерацию или добавьте вопрос вручную.",
        ].join(" "),
      );
    });
  return (
    <>
      <button className="t-back" onClick={leave}>
        <Icon n="back" size={16} /> Мои уроки
      </button>
      <header className="t-heading">
        <div>
          <div className="t-over">Конструктор урока</div>
          <h1>Редактор урока</h1>
        </div>
      </header>
      <fieldset className="t-editor-body" disabled={!!busy}>
        <section className="t-card t-stack">
          <h2>Материал урока</h2>
          {label(
            "Название урока",
            <input value={title} onChange={(e) => setTitle(e.target.value)} />,
          )}
          {label(
            "Инструкция ученикам",
            <textarea
              rows={2}
              value={inst}
              onChange={(e) => setInst(e.target.value)}
            />,
          )}
          <div className="t-actions">
            <label className="t-btn t-upload">
              <Icon n="upload" />
              Загрузить PDF
              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  e.target.value = "";
                  void run("Извлекаем текст…", async () => {
                    const f = new FormData();
                    f.append("file", file);
                    const l = await api(
                      "/api/lessons/" + lesson.id + "/pdf",
                      "POST",
                      f,
                    );
                    apply(l);
                    setMsg(
                      l.warning || "PDF загружен. Выберите нужные страницы.",
                    );
                    if (l.warning) setEditSource(true);
                  });
                }}
              />
            </label>
            <button
              className="t-btn"
              onClick={() => {
                if (!editSource)
                  setManual(
                    lesson.pdfUrl ? "" : pages.map((p) => p.text).join("\n\n"),
                  );
                setEditSource(!editSource);
              }}
            >
              {editSource ? "Скрыть поле текста" : "Вставить текст"}
            </button>
          </div>
          {editSource && (
            <div className="t-inset">
              {label(
                "Текст урока · разделяйте абзацы пустой строкой",
                <textarea
                  value={manual}
                  rows={5}
                  onChange={(e) => setManual(e.target.value)}
                />,
              )}
              {pages.length > 0 && (
                <small>Замена материала очистит вопросы черновика.</small>
              )}
              <button
                className="t-btn"
                disabled={!manual.trim()}
                onClick={() =>
                  run("Сохранение…", async () => {
                    apply(
                      await api("/api/lessons/" + lesson.id, "PATCH", {
                        title,
                        instruction: inst,
                        text: manual,
                      }),
                    );
                    setMsg("Материал сохранён.");
                  })
                }
              >
                Применить текст
              </button>
            </div>
          )}
          {pages.length > 0 && (
            <div>
              <h3>{lesson.pdfUrl ? "Страницы PDF" : "Абзацы материала"}</h3>
              <div className="t-pages">
                {pages.map((p) => (
                  <div key={p.id}>
                    <label>
                      <input
                        type="checkbox"
                        checked={selected.includes(p.id)}
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? [...selected, p.id]
                              : selected.filter((n) => n !== p.id),
                          )
                        }
                      />
                      {lesson.pdfUrl ? "Стр." : "Абз."} {p.id}
                    </label>
                    <button
                      className="t-preview"
                      onClick={() => setSource(p)}
                      aria-label={"Предпросмотр " + p.id}
                    >
                      ↗
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
        <section className="t-editor-questions">
          <div className="t-row">
            <h2>
              Задания <small>{qs.length}</small>
            </h2>
            <button className="t-btn" onClick={() => generate()}>
              <Icon n="spark" />
              Сгенерировать вопросы
            </button>
          </div>
          <p className="t-muted">
            ИИ предложит четыре вопроса с выбором ответа и один открытый по
            выбранному материалу.
          </p>
          {qs.map((q, i) => (
            <QuestionEdit
              key={q.id}
              q={q}
              i={i}
              pages={pages.filter((p) => selected.includes(p.id))}
              pdf={lesson.pdfUrl}
              change={(v) => setQs(qs.map((o, j) => (i === j ? v : o)))}
              remove={() => setQs(qs.filter((_, j) => i !== j))}
              replace={() => generate(i)}
            />
          ))}
          <button
            className="t-btn"
            onClick={() =>
              setQs([...qs, blank(pages.find((p) => selected.includes(p.id)))])
            }
          >
            <Icon n="plus" />
            Добавить свой вопрос
          </button>
        </section>
        <div className="t-actions">
          <button
            className="t-btn"
            onClick={() =>
              run("Сохранение…", async () => {
                await save();
                updated();
                setMsg("Черновик сохранён.");
              })
            }
          >
            Сохранить черновик
          </button>
          <button
            className="t-primary"
            onClick={() =>
              run("Проверяем…", async () => {
                validate(qs, pages, selected);
                await save();
                updated();
                setPublish(true);
              })
            }
          >
            Опубликовать для группы <Icon n="arrow" />
          </button>
        </div>
      </fieldset>
      {busy && (
        <div role="status" className="t-toast">
          {busy}
        </div>
      )}
      {msg && (
        <p className="t-notice" role="status">
          {msg}
        </p>
      )}
      {error && (
        <p className="t-error" role="alert">
          {error}
        </p>
      )}
      {source && (
        <Source p={source} pdf={lesson.pdfUrl} close={() => setSource(null)} />
      )}
      {publish && (
        <Overlay title="Провести урок" close={() => setPublish(false)}>
          {groups.length ? (
            label(
              "Группа",
              <select value={group} onChange={(e) => setGroup(e.target.value)}>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>,
            )
          ) : (
            <p>
              Сначала создайте группу в разделе «Группы». Черновик сохранён.
            </p>
          )}
          {error && <p className="t-error">{error}</p>}
          <button
            className="t-primary"
            disabled={!group || !!busy}
            onClick={() =>
              run("Публикуем…", async () => {
                const r = await api(
                  "/api/lessons/" + lesson.id + "/publish",
                  "POST",
                  { groupId: group },
                );
                setPublish(false);
                published(r);
              })
            }
          >
            Назначить урок
          </button>
        </Overlay>
      )}
    </>
  );
}
