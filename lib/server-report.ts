import { expireAttempt, beginAttempt, clockInfo, resultVisible, settings, settleExpired } from "./test-policy";
import { mapRun, reviewPrefix, reviewQuestions, reviewRunId } from "./map-review";
import {
  all,
  one,
  run,
  found,
  required,
  transaction,
  id,
  groupDto,
  checkQuestions,
  selected,
  fail,
  type Lesson,
  type Row,
  type Question,
} from "./server-core";

type Grades = Record<string, number>;
const total = (values: number[]) => values.reduce((a, b) => a + b, 0);
const percentage = (value: number, total: number) =>
  total ? Math.round((100 * value) / total) : null;
const max = (l: Lesson) => total(l.questions.map((q) => q.maxPoints));
const read = (r: Row): Lesson => JSON.parse(r.body);
const done = (s: string) => s === "graded" || s === "pending";
export function runDto(r: Row, base: string) {
  const l = read(r),
    counts = all(
      "SELECT status,count(*) AS n FROM assignments WHERE run=? GROUP BY status",
      r.id,
    );
  const count = (pred: (s: string) => boolean) =>
    total(counts.filter((c) => pred(c.status)).map((c) => c.n));
  const graded=all("SELECT points FROM assignments WHERE run=? AND status='graded'",r.id).map(row=>total(Object.values(JSON.parse(row.points)) as number[]));
  const maximum=max(l);
  const percentages=graded.map(n=>maximum?100*n/maximum:0);
  const distribution=[0,25,50,75].map(from=>({from,to:from===75?100:from+24,count:percentages.filter(n=>n>=from&&(from===75?n<=100:n<from+25)).length}));
  const assigned = count(() => true);
  const submitted = count(done);
  return {
    id: r.id,
    lessonId: r.lesson,
    title: l.title,
    groupId: r.grp,
    groupName: r.groupName,
    kind: r.kind,
    parentId: r.parent,
    url: base + "/student/" + r.id,
    assigned,
    averagePercent: percentages.length ? Math.round(total(percentages)/percentages.length) : null,
    gradedCount:graded.length, distribution,
    started: count((s) => s !== "not_started"),
    submitted,
    completionPercent: percentage(submitted, assigned),
    pending: count((s) => s === "pending"),
    maxPoints: max(l),
    createdAt: r.created,
    settings: settings(l),
    archived: Boolean(one("SELECT 1 FROM run_archive WHERE run=?",r.id)),
    published: one("SELECT count(*) AS n FROM published_results WHERE run=?",r.id)?.n || 0,
    expired: one("SELECT count(*) AS n FROM attempt_clock WHERE run=? AND expired=1",r.id)?.n || 0,
  };
}
export function issueRun(
  l: Lesson,
  group: Row,
  base: string,
  kind = "lesson",
  parent: string | null = null,
  recipients?: string[],
) {
  checkQuestions(l.questions, selected(l));
  const students = all("SELECT id FROM students WHERE grp=?", group.id).map(
    (s) => s.id as string,
  );
  const assigned = recipients === undefined ? students : recipients;
  if (
    !Array.isArray(assigned) ||
    !assigned.length ||
    assigned.some((s) => !students.includes(s))
  )
    fail(400, "Выберите хотя бы одного участника группы.");
  const r = {
    id: id(),
    lesson: l.id,
    grp: group.id,
    kind,
    parent,
    created: new Date().toISOString(),
    body: JSON.stringify({
      ...l,
      subject:
        group.subject || (l as Lesson & { subject?: string }).subject || "",
      pages: selected(l),
    }),
    groupName: group.name,
  };
  transaction(() => {
    run(
      "INSERT INTO runs VALUES(?,?,?,?,?,?,?)",
      r.id,
      r.lesson,
      r.grp,
      kind,
      parent,
      r.created,
      r.body,
    );
    for (const student of new Set(assigned))
      run("INSERT INTO assignments(run,student) VALUES(?,?)", r.id, student);
  });
  return runDto(r, base);
}
const workQuery =
  "SELECT a.*,r.kind,r.parent,r.created,r.body,s.name AS studentName FROM assignments a JOIN runs r ON a.run=r.id JOIN students s ON s.id=a.student ";
export function assignment(runId: string, student: string) {
  return found(
    one(workQuery + "WHERE a.run=? AND a.student=?", runId, student),
  );
}
export function work(r: Row) {
  const l = read(r),
    points: Grades = JSON.parse(r.points),
    earned = total(Object.values(points));
  return {
    runId: r.run,
    studentId: r.student,
    studentName: r.studentName,
    title: l.title,
    status: r.status,
    score: r.status === "graded" ? earned : null,
    maxPoints: max(l),
    earned,
    gradedMaxPoints: total(l.questions.filter(q => Object.hasOwn(points, q.id)).map(q => q.maxPoints)),
    comment: r.comment,
    expired: clockInfo(r).expired,
  };
}
function studentWork(r: Row) {
  const w = work(r), visible = resultVisible(r);
  return visible ? { ...w, resultsVisible:true } : {
    runId:w.runId,studentId:w.studentId,studentName:w.studentName,title:w.title,
    status:w.status,maxPoints:w.maxPoints,expired:w.expired,resultsVisible:false,
  };
}
function item(r: Row, forTeacher=false) {
  return {
    ...(forTeacher ? {...work(r),resultsVisible:true} : studentWork(r)),
    kind: r.kind,
    parentId: r.parent,
    createdAt: r.created,
    subject: JSON.parse(r.body).subject || "",
    instruction: read(r).instruction,
  };
}
function details(r: Row) {
  const l = read(r);
  return {
    work: work(r),
    questions: l.questions,
    answers: JSON.parse(r.answers),
    points: JSON.parse(r.points),
    pages: l.pages,
    pdfUrl: l.pdfUrl,
  };
}
export function teacherDetails(
  teacher: string,
  runId: string,
  student: string,
) {
  found(
    one(
      "SELECT r.id FROM runs r JOIN lessons l ON r.lesson=l.id WHERE r.id=? AND l.teacher=?",
      runId,
      teacher,
    ),
  );
  settleExpired(student,runId);
  return details(assignment(runId, student));
}
function reviewState(student: string, runId: string, row: Row) {
  if (runId !== mapRun && !(runId.startsWith(reviewPrefix) && row.parent === mapRun)) return null;
  const original = runId === mapRun ? row : assignment(mapRun, student);
  if (!done(original.status)) return null;
  const before = JSON.parse(original.points);
  const questions = reviewQuestions(read(original).questions, before);
  const id = reviewRunId(questions);
  const attempt = questions.length ? one("SELECT status,points FROM assignments WHERE run=? AND student=?", id, student) : null;
  const after = attempt && done(attempt.status) ? JSON.parse(attempt.points) : {};
  return { runId: attempt ? id : null, rows: questions.map(q => ({
    label: q.skill, before: before[q.id.slice("review-".length)], after: after[q.id] ?? null,
  })) };
}

export function startMapReview(student: string) {
  return transaction(() => {
    const original = assignment(mapRun, student);
    if (!done(original.status) || !resultVisible(original)) fail(409, "Сначала дождитесь результата основной работы.");
    const lesson = read(original);
    const questions = reviewQuestions(lesson.questions, JSON.parse(original.points));
    if (!questions.length) fail(409, "Все три тестовых задания решены верно.");
    const id = reviewRunId(questions);
    const body = { ...lesson, title: "Работа над ошибками · Масштаб карты", questions,
      instruction: "Повторите правило и решите новую задачу на каждый навык, в котором возникла ошибка." };
    run("INSERT OR IGNORE INTO runs(id,lesson,grp,kind,parent,created,body) SELECT ?,lesson,grp,'warmup',id,?,? FROM runs WHERE id=?",
      id, new Date().toISOString(), JSON.stringify(body), mapRun);
    run("INSERT OR IGNORE INTO assignments(run,student) VALUES(?,?)", id, student);
    return { runId: id };
  });
}

export function studentDetails(student: string, runId: string) {
  settleExpired(student,runId);
  const r = assignment(runId, student),
    d = details(r);
  const options=settings(read(r));
  const available=(!options.opensAt || Date.now()>=Date.parse(options.opensAt)) && (!options.durationMinutes || r.status!=="not_started");
  const questions = (available?d.questions:[]).map((q) => ({
    id: q.id,
    type: q.type,
    prompt: q.prompt,
    options: q.type === "choice" ? q.options : [],
    maxPoints: q.maxPoints,
    skill: q.skill,
    sourceId: q.sourceId,
    ...(done(r.status) && resultVisible(r) ? { correctIndex:q.correctIndex,criterion:q.criterion,
      explanation:q.explanation || q.quote,optionExplanations:q.optionExplanations || [],quote:q.quote } : {}),
  }));
  return {
    item: item(r),
    timing: clockInfo(r),
    review: resultVisible(r) ? reviewState(student, runId, r) : null,
    pages: d.pages,
    pdfUrl: d.pdfUrl,
    questions,
    answers: d.answers,
    points: done(r.status) && resultVisible(r) ? d.points : {},
    warmups: all(
      workQuery + "WHERE r.parent=? AND a.student=? ORDER BY r.created",
      runId,
      student,
    ).map(row=>item(row)),
  };
}
function skills(rows: Row[]) {
  const totals = new Map<
    string,
    { skill: string; earned: number; maxPoints: number }
  >();
  for (const r of rows.filter((r) => done(r.status))) {
    const points: Grades = JSON.parse(r.points);
    for (const q of read(r).questions)
      if (Object.hasOwn(points, q.id)) {
        const s = totals.get(q.skill) || {
          skill: q.skill,
          earned: 0,
          maxPoints: 0,
        };
        s.earned += points[q.id];
        s.maxPoints += q.maxPoints;
        totals.set(q.skill, s);
      }
  }
  return [...totals.values()].map(s => ({...s, percent: percentage(s.earned, s.maxPoints)}));
}

// Runs are snapshotted at issue time, so a student added later would miss the
// lessons the whole class already has. Give them every class-wide lesson that
// is still active: a top-level lesson, not archived, that every other member
// of the group already has (a run sent to a chosen few stays as it was).
export function joinClassRuns(student: string) {
  const grp = one("SELECT grp FROM students WHERE id=?", student)?.grp;
  if (!grp) return;
  run(
    `INSERT OR IGNORE INTO assignments(run,student)
     SELECT r.id,? FROM runs r
     WHERE r.grp=? AND r.kind='lesson' AND r.parent IS NULL
       AND NOT EXISTS (SELECT 1 FROM run_archive x WHERE x.run=r.id)
       AND NOT EXISTS (SELECT 1 FROM assignments a WHERE a.run=r.id AND a.student=?)
       AND EXISTS (SELECT 1 FROM students o WHERE o.grp=r.grp AND o.id<>?)
       AND NOT EXISTS (SELECT 1 FROM students o WHERE o.grp=r.grp AND o.id<>?
         AND NOT EXISTS (SELECT 1 FROM assignments a WHERE a.run=r.id AND a.student=o.id))`,
    student, grp, student, student, student,
  );
}
export function studentHome(student: string, name: string, teacher?: string) {
  joinClassRuns(student);
  settleExpired(student);
  const rows = all(
    workQuery +
      "WHERE a.student=?" +
      (teacher
        ? " AND r.lesson IN (SELECT id FROM lessons WHERE teacher=?)"
        : "") +
      " ORDER BY r.created DESC",
    student,
    ...(teacher ? [teacher] : []),
  );
  return { name, items: rows.map(row=>item(row,Boolean(teacher))), skills: skills(teacher ? rows : rows.filter(resultVisible)) };
}
function metrics(r: Row, rows: Row[]) {
  const submissions = rows
    .filter((w) => done(w.status))
    .map((w) => ({
      w: work(w),
      a: JSON.parse(w.answers),
      p: JSON.parse(w.points),
    }));
  return read(r).questions.map((q) => {
    const answered = submissions.filter(
      (s) => s.a[q.id] !== undefined && s.a[q.id] !== null && s.a[q.id] !== "",
    );
    const assessed = answered.filter(s => Object.hasOwn(s.p, q.id));
    const wrong = assessed.filter(s => s.p[q.id] < q.maxPoints);
    const correct = assessed.length - wrong.length;
    const counts = new Map<number, number>();
    if (q.type === "choice")
      for (const s of wrong)
        counts.set(s.a[q.id], (counts.get(s.a[q.id]) || 0) + 1);
    const top = [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
    return {
      runId: r.id,
      questionId: q.id,
      prompt: q.prompt,
      skill: q.skill,
      answered: answered.length,
      assessed: assessed.length,
      pending: answered.length - assessed.length,
      correct,
      correctPercent: percentage(correct, assessed.length),
      wrongOption: top ? q.options[top[0]] : null,
      wrongCount: top?.[1] || 0,
      works: answered.map((s) => s.w),
      incorrect: wrong.length,
      // Answer distribution for the chart: every option for a choice question,
      // every possible score for an open one.
      type: q.type,
      maxPoints: q.maxPoints,
      chart:
        q.type === "choice"
          ? q.options.map((label, i) => ({
              label,
              count: answered.filter((s) => s.a[q.id] === i).length,
              correct: i === q.correctIndex,
            }))
          : Array.from({ length: q.maxPoints + 1 }, (_, n) => ({
              label: String(n),
              count: assessed.filter((s) => Math.round(s.p[q.id]) === n).length,
              correct: n === q.maxPoints,
            })),
    };
  });
}
export function groupReport(g: Row, base: string, teacher: string) {
  settleExpired();
  const rows = all(
    workQuery +
      "WHERE r.grp=? AND r.lesson IN (SELECT id FROM lessons WHERE teacher=?) ORDER BY r.created DESC,s.name",
    g.id,
    teacher,
  );
  const runs = all(
    "SELECT r.*,g.name AS groupName FROM runs r JOIN groups g ON r.grp=g.id JOIN lessons l ON l.id=r.lesson WHERE r.grp=? AND l.teacher=? ORDER BY r.created DESC",
    g.id,
    teacher,
  );
  const ms = runs.flatMap((r) =>
    metrics(
      r,
      rows.filter((w) => w.run === r.id),
    ),
  );
  return {
    group: groupDto(g, base),
    runs: runs.map((r) => runDto(r, base)),
    works: rows.map(work),
    staff: g.subject
      ? []
      : all(
          "SELECT t.email,s.subject FROM subject_teachers s JOIN teachers t ON t.id=s.teacher WHERE s.grp=? ORDER BY s.subject",
          g.id,
        ),
    metrics: ms,
    skills: skills(rows).map((s) => ({
      ...s,
      questions: ms.filter((m) => m.skill === s.skill),
    })),
  };
}
export function teacherHome(teacher: string, base: string) {
  const gs = all(
    "SELECT g.*,s.subject FROM groups g LEFT JOIN subject_teachers s ON s.grp=g.id AND s.teacher=? WHERE g.teacher=? OR s.teacher IS NOT NULL ORDER BY g.rowid DESC",
    teacher,
    teacher,
  ).map((g) => groupReport(g, base, teacher));
  const lessons = all(
    "SELECT body,EXISTS(SELECT 1 FROM runs r WHERE r.lesson=lessons.id) AS issued FROM lessons WHERE teacher=? ORDER BY rowid DESC",
    teacher,
  ).map((r) => ({ ...read(r), issued: Boolean(r.issued) }));
  const repeat =
    gs
      .flatMap((g) => g.metrics)
      .filter((m) => m.incorrect > 0)
      .sort((a, b) => b.incorrect - a.incorrect)[0] || null;
  return {
    groups: gs.map((g) => g.group),
    lessons,
    runs: gs
      .flatMap((g) => g.runs)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    pending: gs.flatMap((g) => g.works.filter((w) => w.status === "pending")),
    repeat,
  };
}
export function studentAction(
  student: string,
  runId: string,
  action: string,
  data: Row,
) {
  settleExpired(student,runId);
  return transaction(() => {
    let r = assignment(runId, student);
    const end=one("SELECT ends FROM attempt_clock WHERE run=? AND student=?",runId,student)?.ends;
    if(r.status==="in_progress" && end && Date.now()>=end) {expireAttempt(r);r=assignment(runId,student);}
    if (done(r.status)) {
      if (action === "submit") return studentWork(r);
      fail(409, "Эта работа уже сдана.");
    }
    if (r.status === "not_started") {
      if (action !== "start" && settings(read(r)).durationMinutes) fail(409,"Сначала начните тест.");
      beginAttempt(r);
    }
    const answers: Record<string, number | string> = JSON.parse(r.answers),
      qs = read(r).questions;
    if (action !== "start" && ("answers" in data || action === "answers")) {
      if (
        !data.answers ||
        Array.isArray(data.answers) ||
        typeof data.answers !== "object"
      )
        fail(400, "Проверьте формат ответов.");
      for (const [k, v] of Object.entries(data.answers)) {
        const q = qs.find((q) => q.id === k);
        if (!q) fail(400, "Вопрос отсутствует в этой работе.");
        if (v === null || v === "") {
          delete answers[k];
          continue;
        }
        if (
          q.type === "choice" &&
          (!(typeof v === "number" && Number.isInteger(v)) ||
            v < 0 ||
            v >= q.options.length)
        )
          fail(400, "Неизвестный вариант ответа.");
        if (q.type === "open" && (typeof v !== "string" || v.length > 12000))
          fail(400, "Ответ должен содержать не более 12 000 символов.");
        answers[k] = v as string | number;
      }
    }
    const points: Grades = {};
    let status = "in_progress";
    if (action === "submit") {
      for (const q of qs)
        if (q.type === "choice")
          points[q.id] = answers[q.id] === q.correctIndex ? q.maxPoints : 0;
      status = qs.some((q) => q.type === "open") ? "pending" : "graded";
    }
    run(
      "UPDATE assignments SET status=?,answers=?,points=? WHERE run=? AND student=?",
      status,
      JSON.stringify(answers),
      JSON.stringify(points),
      runId,
      student,
    );
    return action === "submit" ? studentWork(assignment(runId, student)) : { status, timing:clockInfo(r) };
  });
}
export function grade(runId: string, student: string, data: Row) {
  return transaction(() => {
    const r = assignment(runId, student),
      qs = read(r).questions,
      points: Grades = JSON.parse(r.points);
    if (!done(r.status)) fail(409, "Работа ещё не сдана.");
    for (const q of qs.filter((q) => q.type === "open")) {
      const n = data.points?.[q.id];
      if (!Number.isFinite(n) || n < 0 || n > q.maxPoints)
        fail(400, "Подтвердите баллы для каждого открытого ответа.");
      points[q.id] = n;
    }
    const comment = data.comment === undefined ? "" : data.comment;
    if (typeof comment !== "string" || comment.length > 10000)
      fail(400, "Сократите комментарий.");
    run(
      "UPDATE assignments SET points=?,comment=?,status=? WHERE run=? AND student=?",
      JSON.stringify(points),
      comment,
      "graded",
      runId,
      student,
    );
    return work(assignment(runId, student));
  });
}
