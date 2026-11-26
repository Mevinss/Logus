"use client";
import { translate } from "./I18n";
import { FormEvent, useEffect, useState } from "react";
import Brand from "./Brand";
import Atlas from "./Atlas";
import Profile,{PreferencesFields} from "./Profile";
import {useI18n} from "./I18n";
import Teacher from "./Teacher";
import Student from "./Student";

type Actor = { id: string; name: string; role: "teacher" | "student" };
type Props = { invite?: string; initialRun?: string; studentEntry?: boolean };

export default function Entry({ invite, initialRun, studentEntry }: Props) {
  const {t}=useI18n();
  const [role, setRole] = useState<Actor["role"]>(
    invite || initialRun || studentEntry ? "student" : "teacher",
  );
  const [user, setUser] = useState<Actor | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
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
          setError(data.error || translate("Не удалось открыть кабинет."));
      } catch {
        if (active) setError(translate("ui.server.unavailable.refresh.the.page"));
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
      if (!res.ok) throw Error(data.error || translate("Не удалось войти."));
      setUser(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : translate("Проверьте соединение."));
    } finally {
      setBusy(false);
    }
  }
  async function tryDemo() {
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/demo-teacher", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = await res.json();
      if (!res.ok) throw Error(data.error || translate("Не удалось войти."));
      setUser(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : translate("Проверьте соединение."));
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
      window.alert(translate("ui.could.not.sign.out.check.your.connection.and.retry"));
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
        translate("ui.paste.your.personal.invite.link.from.your.teacher"),
      );
    }
  }
  if (loading)
    return (
      <div className="entry-wait">
        <Brand />{translate("ui.opening.workspace")}</div>
    );
  if (user?.role === "teacher")
    return <><Profile user={user} open={profileOpen} onClose={()=>setProfileOpen(false)} onUpdate={name=>setUser({...user,name})} onLogout={logout}/><Teacher name={user.name} onLogout={logout} onProfile={()=>setProfileOpen(true)} /></>;
  if (user?.role === "student")
    return (
      <><Profile user={user} open={profileOpen} onClose={()=>setProfileOpen(false)} onUpdate={name=>setUser({...user,name})} onLogout={logout}/><Student
        name={user.name}
        studentId={user.id}
        initialRun={joinedRun}
        onLogout={logout}
        onProfile={()=>setProfileOpen(true)}
      /></>
    );
  const pupil = role === "student";
  return (
    <main className="entry">
      <header className="entry-head">
        <Brand />
        <span>{translate("ui.a.workspace.for.learning")}</span>
      </header>
      <details className="entry-preferences"><summary>{t("profile.title")}</summary><PreferencesFields/></details>
      <div className="entry-grid">
        <section className="entry-print">
          <div className="print-title">{translate("ui.your.learning")}<br />
            <em>{translate("ui.workspace")}</em>
          </div>
          <Atlas />
          <div className="print-foot">
            <span>{translate("ui.materials.and.assignments")}</span>
            <span aria-hidden="true">✳</span>
          </div>
        </section>
        <section className="entry-form">
          <div className="entry-kicker">
            <i />
            {pupil ? translate("ui.student.workspace") : translate("ui.teacher.workspace")}
          </div>
          <h1>{pupil ? translate("ui.join.a.lesson") : translate("ui.welcome.back")}</h1>
          <p>
            {pupil
              ? translate("ui.paste.the.link.your.teacher.shared.with.you.personally")
              : translate("ui.sign.in.to.prepare.lessons.and.review.student.work")}
          </p>
          <div className="entry-roles" role="group" aria-label={translate("ui.choose.your.role")}>
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
                {option === "teacher" ? translate("ui.i.m.a.teacher") : translate("ui.i.m.a.student")}
              </button>
            ))}
          </div>
          {pupil ? (
            <form onSubmit={openInvitation}>
              <label>{translate("ui.invitation.link")}<input
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
                  {translate(error)}
                </div>
              )}
              <button className="entry-submit" disabled={busy}>
                {busy ? translate("ui.opening.workspace") : translate("ui.join.with.invitation")}{" "}
                <span aria-hidden="true">→</span>
              </button>
            </form>
          ) : (
            <form onSubmit={login}>
              <label>{translate("ui.email")}<input
                  name="email"
                  type="email"
                  autoComplete="username"
                  placeholder="teacher@logus.local"
                  required
                />
              </label>
              <label>{translate("ui.password")}<span className="entry-password">
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
                    {visible ? translate("ui.hide") : translate("ui.show")}
                  </button>
                </span>
              </label>
              {error && (
                <div role="alert" className="entry-error">
                  {translate(error)}
                </div>
              )}
              <button className="entry-submit" disabled={busy}>
                {busy ? translate("ui.signing.in") : translate("ui.sign.in")}
                <span aria-hidden="true">→</span>
              </button>
              <div className="entry-demo">
                <button type="button" className="entry-demo-btn" disabled={busy} onClick={tryDemo}>
                  {t("demo.try")} <span aria-hidden="true">→</span>
                </button>
                <small>{t("demo.note")}</small>
              </div>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
