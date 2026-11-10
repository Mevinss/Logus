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
  return {
    id: r.id,
    lessonId: r.lesson,
    title: l.title,
    groupId: r.grp,
    groupName: r.groupName,
    kind: r.kind,
    parentId: r.parent,
    url: base + "/student/" + r.id,
    assigned: count(() => true),
    started: count((s) => s !== "not_started"),
    submitted: count(done),
    pending: count((s) => s === "pending"),
    maxPoints: max(l),
    createdAt: r.created,
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
    body: JSON.stringify({ ...l, pages: selected(l) }),
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
    earned = total(Object.values(JSON.parse(r.points) as Grades));
  return {
    runId: r.run,
    studentId: r.student,
    studentName: r.studentName,
    title: l.title,
    status: r.status,
    score: r.status === "graded" ? earned : null,
    maxPoints: max(l),
    earned,
    comment: r.comment,
  };
}
function item(r: Row) {
  return {
    ...work(r),
    kind: r.kind,
    parentId: r.parent,
    createdAt: r.created,
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
      "SELECT r.id FROM runs r JOIN groups g ON r.grp=g.id WHERE r.id=? AND g.teacher=?",
      runId,
      teacher,
    ),
  );
  return details(assignment(runId, student));
}
export function studentDetails(student: string, runId: string) {
  const r = assignment(runId, student),
    d = details(r);
  const questions = d.questions.map((q) => ({
    id: q.id,
    type: q.type,
    prompt: q.prompt,
    options: q.type === "choice" ? q.options : [],
    maxPoints: q.maxPoints,
    skill: q.skill,
    sourceId: q.sourceId,
  }));
  return {
    item: item(r),
    pages: d.pages,
    pdfUrl: d.pdfUrl,
    questions,
    answers: d.answers,
    points: done(r.status) ? d.points : {},
    warmups: all(
      workQuery + "WHERE r.parent=? AND a.student=? ORDER BY r.created",
      runId,
      student,
    ).map(item),
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
  return [...totals.values()];
}
export function studentHome(student: string, name: string) {
  const rows = all(
    workQuery + "WHERE a.student=? ORDER BY r.created DESC",
    student,
  );
  return { name, items: rows.map(item), skills: skills(rows) };
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
    const wrong = answered.filter(
      (s) => Object.hasOwn(s.p, q.id) && s.p[q.id] < q.maxPoints,
    );
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
      correct: answered.filter((s) => s.p[q.id] === q.maxPoints).length,
      wrongOption: top ? q.options[top[0]] : null,
      wrongCount: top?.[1] || 0,
      works: answered.map((s) => s.w),
      incorrect: wrong.length,
    };
  });
}
export function groupReport(g: Row, base: string) {
  const rows = all(
    workQuery + "WHERE r.grp=? ORDER BY r.created DESC,s.name",
    g.id,
  );
  const runs = all(
    "SELECT r.*,g.name AS groupName FROM runs r JOIN groups g ON r.grp=g.id WHERE r.grp=? ORDER BY r.created DESC",
    g.id,
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
    metrics: ms,
    skills: skills(rows).map((s) => ({
      ...s,
      questions: ms.filter((m) => m.skill === s.skill),
    })),
  };
}
export function teacherHome(teacher: string, base: string) {
  const gs = all(
    "SELECT * FROM groups WHERE teacher=? ORDER BY rowid DESC",
    teacher,
  ).map((g) => groupReport(g, base));
  const lessons = all(
    "SELECT body FROM lessons WHERE teacher=? ORDER BY rowid DESC",
    teacher,
  ).map(read);
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
  return transaction(() => {
    const r = assignment(runId, student);
    if (done(r.status)) {
      if (action === "submit") return work(r);
      fail(409, "Эта работа уже сдана.");
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
    return action === "submit" ? work(assignment(runId, student)) : { status };
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
