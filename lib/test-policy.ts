import { all, one, run, fail, transaction, storage, type Lesson, type Row } from "./server-core";

export type TestSettings = {
  durationMinutes: number | null;
  opensAt: string | null;
  dueAt: string | null;
  resultMode: "teacher" | "immediate";
};
export const defaultTestSettings: TestSettings = {
  durationMinutes: null, opensAt: null, dueAt: null, resultMode: "teacher",
};
export function settings(lesson: Lesson): TestSettings {
  return lesson.settings || { ...defaultTestSettings, resultMode: "immediate" };
}
export function validateSettings(value: unknown): TestSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(400,"Проверьте настройки теста.");
  const s = value as TestSettings;
  if (s.durationMinutes !== null && (!Number.isInteger(s.durationMinutes) || s.durationMinutes < 1 || s.durationMinutes > 240))
    fail(400,"Длительность должна составлять от 1 до 240 минут.");
  if (!["teacher","immediate"].includes(s.resultMode)) fail(400,"Выберите режим публикации результатов.");
  const date = (v: unknown) => {
    if (v === null || v === "") return null;
    if (typeof v !== "string" || !/(Z|[+-]\d\d:\d\d)$/.test(v) || !Number.isFinite(Date.parse(v))) fail(400,"Укажите дату с часовым поясом.");
    return new Date(v).toISOString();
  };
  const opensAt = date(s.opensAt), dueAt = date(s.dueAt);
  if (opensAt && dueAt && opensAt >= dueAt) fail(400,"Срок сдачи должен быть позже открытия теста.");
  return {durationMinutes:s.durationMinutes,opensAt,dueAt,resultMode:s.resultMode};
}
export function resultVisible(row: Row) {
  const mode = settings(JSON.parse(row.body)).resultMode;
  return mode === "immediate" || Boolean(one("SELECT 1 FROM published_results WHERE run=? AND student=?",row.run,row.student));
}
export function clockInfo(row: Row) {
  const options = settings(JSON.parse(row.body));
  const clock = one("SELECT * FROM attempt_clock WHERE run=? AND student=?",row.run,row.student);
  return { ...options, startedAt: clock?.started ?? null, endsAt:clock?.ends ?? null,
    expired:Boolean(clock?.expired), archived:Boolean(one("SELECT 1 FROM run_archive WHERE run=?",row.run)), serverNow:Date.now() };
}
export function beginAttempt(row: Row) {
  const options = settings(JSON.parse(row.body));
  const now = Date.now();
  if (one("SELECT 1 FROM run_archive WHERE run=?",row.run)) fail(409,"Занятие архивировано.");
  if (options.opensAt && now < Date.parse(options.opensAt)) fail(409,"Тест ещё не открыт.");
  if (options.dueAt && now >= Date.parse(options.dueAt)) fail(409,"Срок сдачи завершён.");
  const timerEnd = options.durationMinutes ? now + options.durationMinutes * 60000 : null;
  const due = options.dueAt ? Date.parse(options.dueAt) : null;
  const ends = timerEnd && due ? Math.min(timerEnd,due) : timerEnd || due;
  run("INSERT OR IGNORE INTO attempt_clock(run,student,started,ends) VALUES(?,?,?,?)",row.run,row.student,now,ends);
}
// Called before reads and writes. An elapsed attempt is graded from its saved answers.
export function settleExpired(student?: string, runId?: string) {
  // Read after acquiring the write lock: another process may have saved the
  // last valid answer while this request was waiting to begin its transaction.
  const settle=()=>{
    const rows = all(`SELECT a.*,r.body FROM assignments a JOIN runs r ON r.id=a.run
      JOIN attempt_clock c ON c.run=a.run AND c.student=a.student
      WHERE a.status='in_progress' AND c.ends IS NOT NULL AND c.ends<=?
      ${student ? "AND a.student=?" : ""} ${runId ? "AND a.run=?" : ""}`,
      Date.now(), ...(student ? [student] : []), ...(runId ? [runId] : []));
    for(const row of rows) expireAttempt(row);
  };
  // Grading can request teacherDetails inside its own write transaction.
  if(storage().db.isTransaction) settle(); else transaction(settle);
}
export function publishResults(runId: string) {
  settleExpired(undefined,runId);
  return transaction(()=>{
    if(one("SELECT 1 FROM assignments WHERE run=? AND status='pending'",runId)) fail(409,"Проверьте все сданные открытые ответы перед публикацией.");
    const {changes}=run("INSERT OR IGNORE INTO published_results SELECT run,student,? FROM assignments WHERE run=? AND status='graded'",Date.now(),runId);
    return {published:Number(changes)};
  });
}

export function expireAttempt(row:Row) {
      const lesson: Lesson=JSON.parse(row.body), answers=JSON.parse(row.answers);
      const points=Object.fromEntries(lesson.questions.filter(q=>q.type==="choice").map(q=>[q.id,answers[q.id]===q.correctIndex?q.maxPoints:0]));
      run("UPDATE assignments SET status=?,points=? WHERE run=? AND student=? AND status='in_progress'",
        lesson.questions.some(q=>q.type==="open")?"pending":"graded",JSON.stringify(points),row.run,row.student);
      run("UPDATE attempt_clock SET expired=1 WHERE run=? AND student=?",row.run,row.student);
}
