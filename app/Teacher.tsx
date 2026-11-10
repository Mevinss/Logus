"use client";
import React, { useCallback, useEffect, useState } from "react";
import Brand from "./Brand";
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
  const [data, setData] = useState<AnyRow | null>(null),
    [nav, setSection] = useState("Сегодня"),
    [group, setGroup] = useState(""),
    [edit, setEditor] = useState<AnyRow | null>(null),
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
  const visitGroup = (id: string, m?: AnyRow) => {
    navigate("Группы");
    setGroup(id);
    setInitialMetric(m || null);
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
    today = new Intl.DateTimeFormat("ru-RU", {
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
            aria-label="Logus · Сегодня"
          >
            <Brand />
          </button>
          <nav aria-label="Разделы кабинета">
            {[
              ["Сегодня", "today"],
              ["Мои уроки", "book"],
              ["Группы", "group"],
            ].map(([s, n]) => (
              <button
                aria-current={nav === s ? "page" : undefined}
                key={s}
                className={nav === s ? "active" : ""}
                onClick={() => navigate(s)}
              >
                <Icon n={n} />
                {s}
              </button>
            ))}
          </nav>
          <div className="t-account">
            <button
              className="t-account-btn"
              aria-label="Меню профиля"
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
                  <Icon n="logout" />
                  Выйти
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      <main className="t-main">
        {!data ? (
          <section className="t-card">
            <h2>
              {err ? "Не удалось загрузить кабинет" : "Загрузка кабинета…"}
            </h2>
            {err && (
              <>
                <p>{err}</p>
                <button className="t-btn" onClick={load}>
                  Повторить
                </button>
              </>
            )}
          </section>
        ) : edit ? (
          <Editor
            key={edit.id}
            initial={edit}
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
            key={group}
            id={group}
            back={() => navigate("Группы")}
            refresh={load}
            initialMetric={initMetric}
          />
        ) : (
          <>
            {err && !modal && !repeat && (
              <p className="t-error" role="alert">
                {err}
              </p>
            )}
            {nav === "Сегодня" ? (
              <>
                <header className="t-heading">
                  <div>
                    <div className="t-over">
                      <span className="t-dash" />
                      Кабинет преподавателя
                    </div>
                    <h1>Сегодня</h1>
                    <p className="t-date">{today}</p>
                  </div>
                  <button className="t-primary" onClick={startLesson}>
                    <Icon n="plus" />
                    Создать урок
                  </button>
                </header>
                <section className="t-summary">
                  <div className="t-over">
                    <span className="t-dot" /> Обзор занятий
                  </div>
                  <h2>Ваш учебный день</h2>
                  <div className="t-summary-nums">
                    {[
                      [runs.length, "Занятий"],
                      [groups.length, "Групп"],
                      [pending.length, "На проверке"],
                    ].map(([n, s]) => (
                      <div key={s}>
                        <strong>{n}</strong>
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
                      <h2>Активные занятия</h2>
                    </div>
                    {runs.length ? (
                      runs.slice(0, 4).map((r, i) => (
                        <button
                          className="t-run"
                          key={r.id}
                          onClick={() => visitGroup(r.groupId)}
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
                              {r.groupName} · Сдали {r.submitted} из{" "}
                              {r.assigned}
                            </small>
                          </span>
                          <Icon n="chev" size={16} />
                        </button>
                      ))
                    ) : (
                      <Empty title="Занятий пока нет" icon="book">
                        {groups.length
                          ? "Создайте урок и назначьте его своей группе."
                          : "Создайте группу, чтобы пригласить учеников и провести первое занятие."}
                      </Empty>
                    )}
                    {!runs.length && (
                      <button
                        className="t-textbtn"
                        onClick={groups.length ? startLesson : startGroup}
                      >
                        {groups.length ? "Создать урок" : "Создать группу"}
                        <Icon n="arrow" size={16} />
                      </button>
                    )}
                  </section>
                  <section className="t-repeat-card">
                    <div className="t-section-title">
                      <span className="t-iconbox rust">
                        <Icon n="layers" />
                      </span>
                      <h2>Что повторить</h2>
                    </div>
                    {metric ? (
                      <>
                        <div className="t-tag">{metric.skill}</div>
                        <h3>{metric.prompt}</h3>
                        <p>
                          {metric.wrongOption
                            ? "Вариант «" +
                              metric.wrongOption +
                              "» выбрали " +
                              metric.wrongCount +
                              " из " +
                              metric.answered +
                              " ответивших."
                            : "Правильно ответили " +
                              metric.correct +
                              " из " +
                              metric.answered +
                              "."}
                        </p>
                        <button
                          className="t-textbtn"
                          onClick={() =>
                            visitGroup(
                              runs.find((r) => r.id === metric.runId)?.groupId,
                              metric,
                            )
                          }
                        >
                          Открыть вопрос <Icon n="arrow" size={16} />
                        </button>
                      </>
                    ) : (
                      <>
                        <h3>Пока нет ответов для разбора</h3>
                        <p>
                          Когда ученики сдадут работу, здесь появится вопрос для
                          повторения и ответы группы.
                        </p>
                      </>
                    )}
                  </section>
                  <section className="t-panel t-pending">
                    <div className="t-section-title">
                      <span className="t-iconbox tan">
                        <Icon n="pen" />
                      </span>
                      <h2>Ожидают проверки</h2>
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
                          <span>Проверить →</span>
                        </button>
                      ))
                    ) : (
                      <p className="t-muted">
                        Открытых ответов на проверке пока нет.
                      </p>
                    )}
                  </section>
                </div>
              </>
            ) : (
              <>
                <header className="t-heading">
                  <div>
                    <div className="t-over">
                      <span className="t-dash" />
                      Кабинет преподавателя
                    </div>
                    <h1>{nav}</h1>
                    <p>
                      {nav === "Группы"
                        ? groups.length +
                          " " +
                          countWord(groups.length, [
                            "группа",
                            "группы",
                            "групп",
                          ])
                        : lessons.length +
                          " " +
                          countWord(lessons.length, [
                            "урок",
                            "урока",
                            "уроков",
                          ])}
                    </p>
                  </div>
                  <button
                    className="t-primary"
                    onClick={nav === "Группы" ? startGroup : startLesson}
                  >
                    <Icon n="plus" />
                    {nav === "Группы" ? "Создать группу" : "Создать урок"}
                  </button>
                </header>
                {!!(nav === "Группы" ? groups : lessons).length && (
                  <label className="t-search">
                    <Icon n="search" />
                    <input
                      aria-label="Поиск по названию"
                      placeholder="Поиск по названию"
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
                          <span>
                            {g.students.length}{" "}
                            {countWord(g.students.length, [
                              "ученик",
                              "ученика",
                              "учеников",
                            ])}
                          </span>
                          <div className="t-group-foot">
                            Открыть группу
                            <Icon n="arrow" />
                          </div>
                        </button>
                      ))}
                    {groups.length === 0 && (
                      <Empty title="Создайте первую группу" icon="group">
                        Добавьте учеников по имени и отправьте им индивидуальные
                        приглашения.
                      </Empty>
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
                                "вопрос",
                                "вопроса",
                                "вопросов",
                              ])}{" "}
                              · Обновлено{" "}
                              {new Date(l.updatedAt).toLocaleDateString(
                                "ru-RU",
                              )}
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
                              <Icon n="pen" size={15} />
                              Редактировать
                            </button>
                            <button
                              className="t-textbtn"
                              onClick={() => {
                                setRepeat(l);
                                setGroupId(groups[0]?.id || "");
                                setError("");
                              }}
                            >
                              Провести в другой группе
                            </button>
                          </div>
                        </article>
                      ))}
                    {!lessons.length && (
                      <Empty title="Создайте первый урок" icon="book">
                        Добавьте PDF или вставьте текст, чтобы подготовить
                        вопросы.
                      </Empty>
                    )}
                  </div>
                )}
                {!!query &&
                  !(nav === "Группы" ? groups : lessons).some((v) =>
                    (v.name || v.title)
                      .toLocaleLowerCase()
                      .includes(query.toLocaleLowerCase()),
                  ) && (
                    <p className="t-muted">
                      По вашему запросу ничего не найдено.
                    </p>
                  )}
              </>
            )}
          </>
        )}
      </main>
      {modal && (
        <Overlay
          title={modal === "group" ? "Создать группу" : "Создать урок"}
          close={() => setModal("")}
        >
          <form
            className="t-stack"
            onSubmit={(e) => {
              e.preventDefault();
              doIt(async () => {
                if (!input.trim()) throw Error("Введите название.");
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
                {modal === "group" ? "Название группы" : "Название урока"}
              </span>
              <input
                required
                autoFocus
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  modal === "group"
                    ? "Например, 8 «Б»"
                    : "Введите название урока"
                }
              />
            </label>
            {err && <p className="t-error">{err}</p>}
            <button className="t-primary" disabled={busy}>
              {busy
                ? "Создание…"
                : modal === "group"
                  ? "Создать группу"
                  : "Перейти в редактор"}
            </button>
          </form>
        </Overlay>
      )}
      {repeat && (
        <Overlay title="Провести в другой группе" close={() => setRepeat(null)}>
          <h3>{repeat.title}</h3>
          {groups.length ? (
            <label className="t-field">
              <span>Группа</span>
              <select value={gid} onChange={(e) => setGroupId(e.target.value)}>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p>Сначала создайте группу.</p>
          )}
          {err && <p className="t-error">{err}</p>}
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
          >
            Назначить урок
          </button>
        </Overlay>
      )}
      {share && (
        <Overlay title="Урок опубликован" close={() => setShare(null)}>
          <h3>{share.title}</h3>
          <p>
            Группа «{share.groupName}». Отправьте ссылку на занятие ученикам,
            которые уже вошли в кабинет.
          </p>
          <CopyLink url={share.url} />
          <p className="t-muted">
            Новому ученику сначала отправьте его индивидуальное приглашение из
            состава группы.
          </p>
          <button
            className="t-btn"
            onClick={() => {
              visitGroup(share.groupId);
              setShare(null);
            }}
          >
            Открыть группу <Icon n="arrow" size={16} />
          </button>
        </Overlay>
      )}
      {work && <WorkView w={work} close={() => setWork(null)} refresh={load} />}
    </div>
  );
}
