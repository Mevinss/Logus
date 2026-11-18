"use client";
import React, { useState } from "react";
import { Temporal } from "@js-temporal/polyfill";
import { useI18n, translate } from "./I18n";
import { authoringLegacy, authoringMessages } from "./authoring-messages";
import { AnyRow, Icon, Overlay, api } from "./teacher-ui";

export type Page = {
  id: number;
  text: string;
  documentId?: string;
  documentName?: string;
  sourcePage?: number;
  pdfUrl?: string;
};
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
  explanation?: string;
  optionExplanations?: string[];
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
    explanation: "",
    optionExplanations: ["", ""],
    quote: "",
  };
}
function label(text: string, input: React.ReactNode) {
  return (
    <label className="t-field">
      <span>{text}</span>
      {React.isValidElement(input)
        ? React.cloneElement(
            input as React.ReactElement<{ "aria-label"?: string }>,
            { "aria-label": text },
          )
        : input}
    </label>
  );
}
export function validate(
  qs: Question[],
  pages: Page[],
  selected: number[],
  tr: (v: string) => string = translate,
) {
  if (!qs.length) throw Error(tr("authoring.legacy.016"));
  for (const [i, q] of qs.entries()) {
    const issue = !q.prompt.trim()
      ? tr("authoring.legacy.006")
      : !q.skill.trim()
        ? tr("authoring.legacy.048")
        : !Number.isInteger(q.maxPoints) || q.maxPoints < 1
          ? tr("authoring.legacy.049")
          : q.type === "choice" &&
              (q.options.length < 2 ||
                q.options.some((o) => !o.trim()) ||
                q.correctIndex === null ||
                !q.options[q.correctIndex])
            ? tr("authoring.legacy.017")
            : q.type === "open" && !q.criterion.trim()
              ? tr("authoring.legacy.015")
              : !selected.includes(q.sourceId)
                ? tr("authoring.legacy.011")
                : !q.quote.trim() ||
                    !pages
                      .find((p) => p.id === q.sourceId)
                      ?.text.replace(/\s+/g, " ")
                      .includes(q.quote.trim().replace(/\s+/g, " "))
                  ? tr("authoring.legacy.010")
                  : "";
    if (issue) throw Error(tr("authoring.legacy.007") + (i + 1) + ". " + issue);
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
  const { language } = useI18n();
  const tr = (v: string) => authoringLegacy[language][v] || v;
  pdf = p.documentId ? p.pdfUrl || undefined : pdf;
  const sourcePage = p.sourcePage || p.id;
  return (
    <Overlay
      title={
        (p.documentName ? p.documentName + " · " : "") +
        (pdf ? tr("authoring.legacy.041") : tr("authoring.legacy.052")) +
        sourcePage
      }
      close={close}
    >
      {pdf && (
        <>
          <a
            target="_blank"
            rel="noreferrer"
            className="t-link"
            href={pdf + "#page=" + sourcePage}
          >
            {tr("authoring.legacy.073")}
          </a>
          <iframe
            title={tr("authoring.legacy.041") + sourcePage}
            src={pdf + "#page=" + sourcePage}
            className="t-pdf"
          />
        </>
      )}
      <p className="t-source-text">{p.text || tr("authoring.legacy.024")}</p>
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
  fixedType,
  moveUp,
  moveDown,
}: {
  q: Question;
  i: number;
  pages: Page[];
  pdf?: string;
  change: (q: Question) => void;
  remove?: () => void;
  replace?: () => void;
  fixedSkill?: boolean;
  fixedType?: boolean;
  moveUp?: () => void;
  moveDown?: () => void;
}) {
  const { language, timeZone } = useI18n();
  const a = authoringMessages[language];
  const tr = (v: string) => authoringLegacy[language][v] || v;
  const [source, setSource] = useState(false);
  const page = pages.find((p) => p.id === q.sourceId);
  const patch = (v: Partial<Question>) => change({ ...q, ...v });
  return (
    <article className="t-question">
      <div className="t-row">
        <strong className="t-qnum">
          {tr("authoring.legacy.007")} {String(i + 1).padStart(2, "0")}
        </strong>
        {moveUp && (
          <button
            type="button"
            className="t-textbtn"
            aria-label={a.up}
            onClick={moveUp}
          >
            ↑
          </button>
        )}
        {moveDown && (
          <button
            type="button"
            className="t-textbtn"
            aria-label={a.down}
            onClick={moveDown}
          >
            ↓
          </button>
        )}
        {remove && (
          <button type="button" className="t-textbtn" onClick={remove}>
            {tr("authoring.legacy.080")}
          </button>
        )}
      </div>
      <div className="t-qgrid">
        <div className="t-stack">
          {label(
            tr("authoring.legacy.045"),
            <select
              value={q.type}
              disabled={fixedType}
              onChange={(e) =>
                patch({
                  type: e.target.value as Question["type"],
                  options: e.target.value === "choice" ? ["", ""] : [],
                  correctIndex: null,
                  optionExplanations: [],
                })
              }
            >
              <option value="choice">{tr("authoring.legacy.069")}</option>
              <option value="open">{tr("authoring.legacy.065")}</option>
            </select>,
          )}
          {label(
            tr("authoring.legacy.050"),
            <textarea
              rows={2}
              value={q.prompt}
              onChange={(e) => patch({ prompt: e.target.value })}
            />,
          )}
          {q.type === "choice" ? (
            <fieldset className="t-options">
              <legend>{tr("authoring.legacy.058")}</legend>
              {q.options.map((v, j) => (
                <div className="t-opt" key={j}>
                  <input
                    type="radio"
                    name={"key-" + q.id}
                    checked={q.correctIndex === j}
                    aria-label={tr("authoring.legacy.028") + (j + 1)}
                    onChange={() => patch({ correctIndex: j })}
                  />
                  <input
                    aria-label={tr("authoring.legacy.003") + (j + 1)}
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
                      aria-label={tr("authoring.legacy.047") + (j + 1)}
                      onClick={() =>
                        patch({
                          options: q.options.filter((_, k) => k !== j),
                          optionExplanations: q.optionExplanations?.filter(
                            (_, k) => k !== j,
                          ),
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
                {tr("authoring.legacy.057")}
              </button>
            </fieldset>
          ) : (
            label(
              tr("authoring.legacy.021"),
              <textarea
                value={q.criterion}
                onChange={(e) => patch({ criterion: e.target.value })}
              />,
            )
          )}
          {label(
            a.explanation,
            <textarea
              value={q.explanation || ""}
              onChange={(e) => patch({ explanation: e.target.value })}
            />,
          )}
          {q.type === "choice" &&
            q.options.map((_, j) =>
              label(
                a.optionExplanation + " " + (j + 1),
                <textarea
                  key={j}
                  value={q.optionExplanations?.[j] || ""}
                  onChange={(e) =>
                    patch({
                      optionExplanations: q.options.map((_, k) =>
                        k === j
                          ? e.target.value
                          : q.optionExplanations?.[k] || "",
                      ),
                    })
                  }
                />,
              ),
            )}
          <div className="t-inline-fields">
            {label(
              tr("authoring.legacy.025"),
              <input
                value={q.skill}
                readOnly={fixedSkill}
                onChange={(e) => patch({ skill: e.target.value })}
              />,
            )}
            {label(
              tr("authoring.legacy.022"),
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
            <Icon n="book" /> {tr("authoring.legacy.063")}
          </div>
          {label(
            pdf ? tr("authoring.legacy.042") : tr("authoring.legacy.053"),
            <select
              value={q.sourceId}
              onChange={(e) =>
                patch({ sourceId: Number(e.target.value), quote: "" })
              }
            >
              {pages.map((p) => (
                <option key={p.id} value={p.id}>
                  {pdf
                    ? tr("authoring.legacy.040")
                    : tr("authoring.legacy.051")}{" "}
                  {p.sourcePage || p.id} {p.documentName || ""}
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
                {tr("authoring.legacy.072")}
              </button>
            </>
          )}
          {label(
            tr("authoring.legacy.055"),
            <textarea
              rows={3}
              placeholder={tr("authoring.legacy.046")}
              value={q.quote}
              onChange={(e) => patch({ quote: e.target.value })}
            />,
          )}
          {replace && (
            <button type="button" className="t-textbtn" onClick={replace}>
              <Icon n="spark" size={15} /> {tr("authoring.legacy.062")}
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
  pdfLimitMiB,
  groups,
  leave,
  published,
  updated,
}: {
  initial: AnyRow;
  pdfLimitMiB: number;
  groups: AnyRow[];
  leave: () => void;
  published: (run: AnyRow) => void;
  updated: () => void;
}) {
  const { language, timeZone } = useI18n();
  const a = authoringMessages[language];
  const tr = (v: string) => authoringLegacy[language][v] || v;
  const [config, setConfig] = useState({
    count: 5,
    openCount: 1,
    language: "ru",
    difficulty: "medium",
    topic: "",
    focus: "",
    prompt: "",
    mode: "append",
  });
  const [settings, setSettings] = useState(
    initial.settings || {
      durationMinutes: null,
      opensAt: null,
      dueAt: null,
      resultMode: "teacher",
    },
  );
  const [preview, setPreview] = useState(false);
  const [search, setSearch] = useState("");
  const [matches, setMatches] = useState<Page[] | null>(null);
  const localDate = (v: string | null) => {
    if (!v) return "";
    return Temporal.Instant.from(v)
      .toZonedDateTimeISO(timeZone)
      .toPlainDateTime()
      .toString()
      .slice(0, 16);
  };
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
    [proposal, setProposal] = useState<Question | null>(null),
    [proposalIssues, setProposalIssues] = useState<string[]>([]),
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
    if (!title.trim()) throw Error(tr("authoring.legacy.004"));
    if (editSource && manual.trim()) throw Error(tr("authoring.legacy.037"));
    return api("/api/lessons/" + lesson.id, "PATCH", {
      title,
      instruction: inst,
      selectedPages: selected,
      questions: qs,
      settings,
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
  const generate = (target?: Question) =>
    run(tr("authoring.legacy.013"), async () => {
      if (!selected.length) throw Error(tr("authoring.legacy.012"));
      await save();
      const r = await api(
        "/api/lessons/" + lesson.id + "/generate",
        "POST",
        target ? { ...config, replaceQuestionId: target.id } : config,
      );
      if (target) {
        if (r.questions.length !== 1 || r.questions[0].id !== target.id)
          throw Error(tr("authoring.legacy.027"));
        setProposal(r.questions[0]);
        setProposalIssues(r.issues || []);
        return;
      }
      if (r.questions.length)
        setQs(config.mode === "append" ? [...qs, ...r.questions] : r.questions);
      setMsg(
        [
          ...(r.issues || []),
          r.questions.length
            ? tr("authoring.legacy.031")
            : tr("authoring.legacy.018"),
        ].join(" "),
      );
    });
  return (
    <>
      <button className="t-back" onClick={leave}>
        <Icon n="back" size={16} /> {tr("authoring.legacy.067")}
      </button>
      <header className="t-heading">
        <div>
          <div className="t-over">{tr("authoring.legacy.064")}</div>
          <h1>{tr("authoring.legacy.076")}</h1>
        </div>
      </header>
      <fieldset className="t-editor-body" disabled={!!busy}>
        <section className="t-card t-stack">
          <h2>{tr("authoring.legacy.066")}</h2>
          {label(
            tr("authoring.legacy.026"),
            <input value={title} onChange={(e) => setTitle(e.target.value)} />,
          )}
          {label(
            tr("authoring.legacy.020"),
            <textarea
              rows={2}
              value={inst}
              onChange={(e) => setInst(e.target.value)}
            />,
          )}
          <div className="t-actions">
            <label className="t-btn t-upload">
              <Icon n="upload" />
              {a.upload}
              <input
                type="file"
                multiple
                accept=".pdf,.docx,.txt"
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  if (!files.length) return;
                  e.target.value = "";
                  if (
                    files.some((file) => file.size > pdfLimitMiB * 1024 * 1024)
                  ) {
                    setError(`${pdfLimitMiB} MB · PDF / DOCX / TXT`);
                    setMsg("");
                    return;
                  }
                  void run(tr("authoring.legacy.019"), async () => {
                    await save();
                    const f = new FormData();
                    files.forEach((file) => f.append("file", file));
                    const l = await api(
                      "/api/lessons/" + lesson.id + "/materials",
                      "POST",
                      f,
                    );
                    apply(l);
                    setMsg(
                      (l.warning ? tr(l.warning) : "") ||
                        tr("authoring.legacy.001"),
                    );
                    if (l.warning) setEditSource(true);
                  });
                }}
              />
            </label>
            <small className="t-muted">
              {pdfLimitMiB} MB · PDF / DOCX / TXT
            </small>
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
              {editSource
                ? tr("authoring.legacy.036")
                : tr("authoring.legacy.009")}
            </button>
          </div>
          {editSource && (
            <div className="t-inset">
              {label(
                tr("authoring.legacy.044"),
                <textarea
                  value={manual}
                  rows={5}
                  onChange={(e) => setManual(e.target.value)}
                />,
              )}

              {pages.length > 0 && <small>{tr("authoring.legacy.061")}</small>}
              <button
                className="t-btn"
                disabled={!manual.trim()}
                onClick={() =>
                  run(tr("authoring.legacy.038"), async () => {
                    apply(
                      await api("/api/lessons/" + lesson.id, "PATCH", {
                        title,
                        instruction: inst,
                        text: manual,
                      }),
                    );
                    setMsg(tr("authoring.legacy.023"));
                  })
                }
              >
                {tr("authoring.legacy.075")}
              </button>
            </div>
          )}
          {pages.length > 0 && (
            <div className="t-stack">
              {label(
                a.searchPlaceholder,
                <input
                  value={search}
                  maxLength={2000}
                  onChange={(e) => setSearch(e.target.value)}
                />,
              )}
              <button
                className="t-btn"
                onClick={() =>
                  run(a.search, async () => {
                    await save();
                    const r = await api(
                      "/api/lessons/" + lesson.id + "/search",
                      "POST",
                      { query: search },
                    );
                    setMatches(r.fragments);
                  })
                }
              >
                {a.search}
              </button>
              {matches &&
                (matches.length ? (
                  matches.map((p, i) => (
                    <button
                      className="t-btn"
                      key={i}
                      onClick={() => setSource(p)}
                    >
                      {p.documentName || p.id}: {p.text.slice(0, 160)}…
                    </button>
                  ))
                ) : (
                  <p>{a.noMatches}</p>
                ))}
            </div>
          )}
          {pages.length > 0 && (
            <div>
              <h3>
                {lesson.pdfUrl
                  ? tr("authoring.legacy.043")
                  : tr("authoring.legacy.054")}
              </h3>
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
                      {p.documentName ? p.documentName + " · " : ""}
                      {lesson.pdfUrl
                        ? tr("authoring.legacy.039")
                        : tr("authoring.legacy.002")}{" "}
                      {p.sourcePage || p.id}
                    </label>
                    <button
                      className="t-preview"
                      onClick={() => setSource(p)}
                      aria-label={tr("authoring.legacy.030") + p.id}
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
              {tr("authoring.legacy.060")} <small>{qs.length}</small>
            </h2>
            <button className="t-btn" onClick={() => generate()}>
              <Icon n="spark" />
              {tr("authoring.legacy.077")}
            </button>
          </div>
          <div className="t-card t-stack">
            <div className="t-generation-fields">
              {label(
                a.count,
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={config.count}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      count: Number(e.target.value),
                      openCount: Math.min(
                        config.openCount,
                        Number(e.target.value),
                      ),
                    })
                  }
                />,
              )}
              {label(
                a.openCount,
                <input
                  type="number"
                  min={0}
                  max={config.count}
                  value={config.openCount}
                  onChange={(e) =>
                    setConfig({ ...config, openCount: Number(e.target.value) })
                  }
                />,
              )}
              {label(
                a.language,
                <select
                  value={config.language}
                  onChange={(e) =>
                    setConfig({ ...config, language: e.target.value })
                  }
                >
                  <option value="ru">Русский</option>
                  <option value="kk">Қазақша</option>
                  <option value="en">English</option>
                </select>,
              )}
              {label(
                a.difficulty,
                <select
                  value={config.difficulty}
                  onChange={(e) =>
                    setConfig({ ...config, difficulty: e.target.value })
                  }
                >
                  <option value="easy">{a.easy}</option>
                  <option value="medium">{a.medium}</option>
                  <option value="hard">{a.hard}</option>
                </select>,
              )}
            </div>
            {label(
              a.topic,
              <input
                maxLength={2000}
                value={config.topic}
                onChange={(e) =>
                  setConfig({ ...config, topic: e.target.value })
                }
              />,
            )}
            {label(
              a.focus,
              <input
                maxLength={2000}
                value={config.focus}
                onChange={(e) =>
                  setConfig({ ...config, focus: e.target.value })
                }
              />,
            )}
            {label(
              a.prompt,
              <textarea
                maxLength={2000}
                value={config.prompt}
                onChange={(e) =>
                  setConfig({ ...config, prompt: e.target.value })
                }
              />,
            )}
            {label(
              a.mode,
              <select
                value={config.mode}
                onChange={(e) => setConfig({ ...config, mode: e.target.value })}
              >
                <option value="append">{a.append}</option>
                <option value="replace">{a.replace}</option>
              </select>,
            )}
            <p className="t-muted">{a.budget}</p>
          </div>
          {qs.map((q, i) => (
            <QuestionEdit
              key={q.id}
              q={q}
              i={i}
              pages={pages.filter((p) => selected.includes(p.id))}
              pdf={lesson.pdfUrl}
              change={(v) => setQs(qs.map((o, j) => (i === j ? v : o)))}
              remove={() => setQs(qs.filter((_, j) => i !== j))}
              moveUp={
                i > 0
                  ? () =>
                      setQs(
                        qs.map((v, j) =>
                          j === i - 1 ? q : j === i ? qs[i - 1] : v,
                        ),
                      )
                  : undefined
              }
              moveDown={
                i < qs.length - 1
                  ? () =>
                      setQs(
                        qs.map((v, j) =>
                          j === i + 1 ? q : j === i ? qs[i + 1] : v,
                        ),
                      )
                  : undefined
              }
              replace={() => generate(q)}
            />
          ))}
          <button
            className="t-btn"
            onClick={() =>
              setQs([...qs, blank(pages.find((p) => selected.includes(p.id)))])
            }
          >
            <Icon n="plus" />
            {tr("authoring.legacy.059")}
          </button>
        </section>
        <section className="t-card t-stack">
          <h2>{a.settings}</h2>
          {label(
            a.duration,
            <input
              type="number"
              min={1}
              max={480}
              value={settings.durationMinutes ?? ""}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  durationMinutes: e.target.value
                    ? Number(e.target.value)
                    : null,
                })
              }
            />,
          )}
          {label(
            a.opens,
            <input
              type="datetime-local"
              value={localDate(settings.opensAt)}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  opensAt: e.target.value
                    ? Temporal.PlainDateTime.from(e.target.value)
                        .toZonedDateTime(timeZone)
                        .toInstant()
                        .toString()
                    : null,
                })
              }
            />,
          )}
          {label(
            a.due,
            <input
              type="datetime-local"
              value={localDate(settings.dueAt)}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  dueAt: e.target.value
                    ? Temporal.PlainDateTime.from(e.target.value)
                        .toZonedDateTime(timeZone)
                        .toInstant()
                        .toString()
                    : null,
                })
              }
            />,
          )}
          <small>{timeZone}</small>
          {label(
            a.results,
            <select
              value={settings.resultMode}
              onChange={(e) =>
                setSettings({ ...settings, resultMode: e.target.value })
              }
            >
              <option value="teacher">{a.teacher}</option>
              <option value="immediate">{a.immediate}</option>
            </select>,
          )}
        </section>
        <div className="t-actions">
          <button className="t-btn" onClick={() => setPreview(true)}>
            {a.preview}
          </button>
          <button
            className="t-textbtn"
            onClick={() => {
              if (window.confirm(a.deleteConfirm))
                void run(a.delete, async () => {
                  await api("/api/lessons/" + lesson.id, "DELETE");
                  updated();
                  leave();
                });
            }}
          >
            {a.delete}
          </button>
          <button
            className="t-btn"
            onClick={() =>
              run(tr("authoring.legacy.038"), async () => {
                await save();
                updated();
                setMsg(tr("authoring.legacy.056"));
              })
            }
          >
            {tr("authoring.legacy.079")}
          </button>
          <button
            className="t-primary"
            onClick={() =>
              run(tr("authoring.legacy.033"), async () => {
                validate(qs, pages, selected, tr);
                await save();
                updated();
                setPublish(true);
              })
            }
          >
            {tr("authoring.legacy.070")} <Icon n="arrow" />
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
      {proposal && (
        <Overlay
          title={tr("authoring.legacy.029")}
          close={() => setProposal(null)}
        >
          {proposalIssues.length > 0 && (
            <p role="alert" className="t-notice">
              {proposalIssues.join(" ")}
            </p>
          )}
          <QuestionEdit
            q={proposal}
            i={qs.findIndex((q) => q.id === proposal.id)}
            pages={pages.filter((p) => p.id === proposal.sourceId)}
            pdf={lesson.pdfUrl}
            change={setProposal}
            fixedSkill
            fixedType
          />
          <div className="t-actions">
            <button
              className="t-primary"
              onClick={() => {
                try {
                  validate([proposal], pages, selected, tr);
                  const normalize = (prompt: string) =>
                    prompt
                      .normalize("NFKC")
                      .toLocaleLowerCase("ru")
                      .replace(/[^\p{L}\p{N}]+/gu, "");
                  if (
                    qs.some(
                      (q) => normalize(q.prompt) === normalize(proposal.prompt),
                    )
                  )
                    throw Error(tr("authoring.legacy.005"));
                  setQs(qs.map((q) => (q.id === proposal.id ? proposal : q)));
                  setProposal(null);
                  setMsg(tr("authoring.legacy.008"));
                } catch (e) {
                  setProposalIssues([
                    e instanceof Error ? e.message : tr("authoring.legacy.032"),
                  ]);
                }
              }}
            >
              {tr("authoring.legacy.074")}
            </button>
            <button className="t-btn" onClick={() => setProposal(null)}>
              {tr("authoring.legacy.071")}
            </button>
          </div>
        </Overlay>
      )}
      {preview && (
        <Overlay title={a.preview} close={() => setPreview(false)}>
          <h2>{title}</h2>
          <p>{inst}</p>
          {qs.map((q, i) => (
            <article className="t-question" key={q.id}>
              <h3>
                {i + 1}. {q.prompt}
              </h3>
              {q.type === "choice" ? (
                q.options.map((v, j) => (
                  <label className="t-opt" key={j}>
                    <input type="radio" name={"preview-" + q.id} />
                    {v}
                  </label>
                ))
              ) : (
                <textarea aria-label={q.prompt} />
              )}
            </article>
          ))}
        </Overlay>
      )}
      {publish && (
        <Overlay
          title={tr("authoring.legacy.034")}
          close={() => setPublish(false)}
        >
          {groups.length ? (
            label(
              tr("authoring.legacy.014"),
              <select value={group} onChange={(e) => setGroup(e.target.value)}>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>,
            )
          ) : (
            <p>{tr("authoring.legacy.078")}</p>
          )}
          {error && <p className="t-error">{error}</p>}
          <button
            className="t-primary"
            disabled={!group || !!busy}
            onClick={() =>
              run(tr("authoring.legacy.035"), async () => {
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
            {tr("authoring.legacy.068")}
          </button>
        </Overlay>
      )}
    </>
  );
}
