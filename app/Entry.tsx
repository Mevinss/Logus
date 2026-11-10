"use client";
import { FormEvent, useEffect, useState } from "react";
import Brand from "./Brand";
import Atlas from "./Atlas";
import Teacher from "./Teacher";
import Student from "./Student";

type Actor = { id: string; name: string; role: "teacher" | "student" };
type Props = { invite?: string; initialRun?: string; studentEntry?: boolean };

export default function Entry({ invite, initialRun, studentEntry }: Props) {
  const [role, setRole] = useState<Actor["role"]>(
    invite || initialRun || studentEntry ? "student" : "teacher",
  );
  const [user, setUser] = useState<Actor | null>(null);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(""),
    [visible, setVisible] = useState(false);
  const [joinedRun, setJoinedRun] = useState(initialRun);
  useEffect(() => {
    let active = true;
    async function enter() {
      try {
        if (initialRun) sessionStorage.setItem("logus-next-run", initialRun);
        const res = await fetch(
          invite ? "/api/join" : "/api/me",
          invite
            ? {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token: invite }),
              }
            : { cache: "no-store" },
        );
        const data = await res.json();
        if (!active) return;
        if (res.ok) {
          if (data.role === "student") {
            const next =
              initialRun ||
              sessionStorage.getItem("logus-next-run") ||
              undefined;
            setJoinedRun(next);
            sessionStorage.removeItem("logus-next-run");
            if (invite)
              history.replaceState(
                null,
                "",
                next ? "/student/" + encodeURIComponent(next) : "/student",
              );
          }
          setUser(data);
        } else if (invite || res.status !== 401)
          setError(data.error || "Не удалось открыть кабинет.");
      } catch {
        if (active) setError("Сервер недоступен. Обновите страницу.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void enter();
    return () => {
      active = false;
    };
  }, [invite, initialRun]);
  async function login(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const body = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw Error(data.error || "Не удалось войти.");
      setUser(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Проверьте соединение.");
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    try {
      const r = await fetch("/api/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!r.ok) throw Error();
      location.replace("/");
    } catch {
      window.alert("Не удалось выйти. Проверьте соединение и повторите.");
    }
  }
  function openInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = String(
      new FormData(event.currentTarget).get("invitation") || "",
    ).trim();
    try {
      const url = value.startsWith("/invite/")
        ? new URL(value, location.origin)
        : new URL(value);
      const match = /^\/invite\/([A-Za-z0-9_-]+)\/?$/.exec(url.pathname);
      if (!["http:", "https:"].includes(url.protocol) || !match)
        throw new Error();
      setError("");
      setBusy(true);
      location.assign("/invite/" + match[1]);
    } catch {
      setError(
        "Вставьте индивидуальную ссылку с /invite/ из приглашения учителя.",
      );
    }
  }
  if (loading)
    return (
      <div className="entry-wait">
        <Brand /> Открываем кабинет…
      </div>
    );
  if (user?.role === "teacher")
    return <Teacher name={user.name} onLogout={logout} />;
  if (user?.role === "student")
    return (
      <Student
        name={user.name}
        studentId={user.id}
        initialRun={joinedRun}
        onLogout={logout}
      />
    );
  const pupil = role === "student";
  return (
    <main className="entry">
      <header className="entry-head">
        <Brand />
        <span>Платформа для онлайн-занятий</span>
      </header>
      <div className="entry-grid">
        <section className="entry-print">
          <div className="print-title">
            Пространство
            <br />
            <em>урока</em>
          </div>
          <Atlas />
          <div className="print-foot">
            <span>Материалы и задания</span>
            <span aria-hidden="true">✳</span>
          </div>
        </section>
        <section className="entry-form">
          <div className="entry-kicker">
            <i />
            {pupil ? "Кабинет ученика" : "Кабинет учителя"}
          </div>
          <h1>{pupil ? "Вход на занятие" : "С возвращением"}</h1>
          <p>
            {pupil
              ? "Вставьте ссылку, которую учитель выдал лично вам."
              : "Войдите, чтобы подготовить урок и посмотреть работы учеников."}
          </p>
          <div className="entry-roles" role="group" aria-label="Выбор роли">
            {(["teacher", "student"] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={role === option}
                disabled={busy}
                onClick={() => {
                  setRole(option);
                  setError("");
                }}
              >
                {option === "teacher" ? "Я учитель" : "Я ученик"}
              </button>
            ))}
          </div>
          {pupil ? (
            <form onSubmit={openInvitation}>
              <label>
                Ссылка-приглашение
                <input
                  name="invitation"
                  inputMode="url"
                  autoCapitalize="none"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="http://…/invite/…"
                  required
                />
              </label>
              {error && (
                <div role="alert" className="entry-error">
                  {error}
                </div>
              )}
              <button className="entry-submit" disabled={busy}>
                {busy ? "Открываем кабинет…" : "Войти по приглашению"}{" "}
                <span aria-hidden="true">→</span>
              </button>
            </form>
          ) : (
            <form onSubmit={login}>
              <label>
                Электронная почта
                <input
                  name="email"
                  type="email"
                  autoComplete="username"
                  placeholder="teacher@logus.local"
                  required
                />
              </label>
              <label>
                Пароль
                <span className="entry-password">
                  <input
                    name="password"
                    type={visible ? "text" : "password"}
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setVisible(!visible)}
                    aria-pressed={visible}
                  >
                    {visible ? "Скрыть" : "Показать"}
                  </button>
                </span>
              </label>
              {error && (
                <div role="alert" className="entry-error">
                  {error}
                </div>
              )}
              <button className="entry-submit" disabled={busy}>
                {busy ? "Входим…" : "Войти в кабинет"}
                <span aria-hidden="true">→</span>
              </button>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
