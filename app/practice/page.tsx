"use client";

import { useCallback, useEffect, useState } from "react";
import Student from "../Student";
import Brand from "../Brand";
import {
  bindPractice,
  forgetPractice,
  lastPracticeResult,
  practiceCopy,
  practiceIdentity,
  practiceRun,
  type SavedResult,
} from "../practice-storage";

export default function Practice() {
  const [actor, setActor] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<SavedResult | null>(null);
  const [token, setToken] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    async function enter() {
      setError("");
      const identity = practiceIdentity();
      setToken(identity);
      setSaved(lastPracticeResult(identity));
      const response = await fetch("/api/practice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: identity }),
        signal: controller.signal,
      });
      const user = await response.json();
      if (!response.ok)
        throw Error(user.error || "Не удалось открыть практикум.");
      if (!active) return;
      bindPractice(identity, user.id);
      const attempt = practiceCopy(user.id);
      if (attempt && user.fresh) {
        const restored = await fetch(
          "/api/student/" +
            practiceRun +
            (attempt.submitted ? "/submit" : "/answers"),
          {
            method: attempt.submitted ? "POST" : "PATCH",
            headers: {
              "Content-Type": "application/json",
              "X-Logus-Student": user.id,
            },
            body: JSON.stringify({ answers: attempt.answers }),
            signal: controller.signal,
          },
        );
        if (!restored.ok)
          throw Error("Не удалось восстановить ответы из этого браузера.");
      }
      if (active) setActor(user);
    }
    void enter().catch((e) => {
      if (active)
        setError(
          e instanceof TypeError
            ? "Сервер недоступен. Проверьте подключение."
            : e.message,
        );
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [retry]);
  const resume = useCallback(() => {
    setActor(null);
    setRetry((n) => n + 1);
  }, []);
  if (actor)
    return (
      <Student
        name={actor.name}
        studentId={actor.id}
        initialRun={
          new URLSearchParams(location.search).has("home")
            ? undefined
            : practiceRun
        }
        onSessionExpired={resume}
        practiceMode
        onLogout={async () => {
          try {
            const res = await fetch("/api/logout", { method: "POST" });
            if (!res.ok) throw Error();
            forgetPractice(token);
            location.replace("/");
          } catch {
            window.alert("Не удалось выйти. Проверьте соединение.");
          }
        }}
      />
    );
  return (
    <main className="entry-wait">
      <Brand />
      {error ? (
        <>
          <p role="alert">{error}</p>
          {saved && (
            <section className="st-card">
              <h2>Последний результат на этом устройстве</h2>
              <strong>{saved.title}</strong>
              <p>
                {saved.status === "pending"
                  ? "За проверенную часть"
                  : "Подтверждённый итог"}{" "}
                · {saved.earned} из {saved.maximum}
              </p>
              {saved.status === "pending" && (
                <p>Открытый ответ ожидает проверки.</p>
              )}
              {saved.skills.map((s) => (
                <p key={s.skill}>
                  {s.skill} · {s.earned} из {s.maxPoints}
                </p>
              ))}
              <small>
                Сохранено {new Date(saved.savedAt).toLocaleString("ru-RU")}
              </small>
            </section>
          )}
          <button onClick={() => setRetry((n) => n + 1)}>Повторить</button>
        </>
      ) : (
        "Открываем практикум…"
      )}
    </main>
  );
}
