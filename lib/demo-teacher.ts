import { randomBytes } from "node:crypto";
import { editLesson, fail, id, one, run, saveLesson, secret, transaction, type Lesson, type Question } from "./server-core";
import { defaultTestSettings } from "./test-policy";
import { issueRun } from "./server-report";

// A reviewer can try the teacher side without anyone's password: this creates
// a private sandbox teacher with a class of synthetic students and one lesson
// already issued. Three students have synthetic submissions so analytics has
// something to show; two are left for the reviewer to complete by invite link.
const TEXT = [
  "Лемара — вымышленный остров в северной части Тихого океана, созданный для учебного примера. Его площадь составляет 412 квадратных километров, а длина береговой линии — 96 километров.",
  "Самая высокая точка острова — вулкан Тарус высотой 1 318 метров. Последнее извержение Таруса произошло в 1911 году и длилось 17 дней.",
  "Символ Лемары — серый тупик-лемарец, морская птица с оранжевым клювом. Ежегодно на острове гнездится около 40 000 пар этих птиц.",
].join("\n\n");
const QUESTIONS: Question[] = [
  { id: "demo-area", type: "choice", prompt: "Какова площадь острова Лемара?", options: ["412 км²", "96 км²", "1 318 км²"], correctIndex: 0, criterion: "", maxPoints: 1, skill: "Факты из текста", sourceId: 1, quote: "Его площадь составляет 412 квадратных километров", explanation: "В тексте сказано: площадь — 412 квадратных километров.", optionExplanations: ["Верно.", "96 км — это длина береговой линии, а не площадь.", "1 318 — это высота вулкана в метрах."] },
  { id: "demo-bird", type: "choice", prompt: "Сколько пар тупиков-лемарцев гнездится на острове ежегодно?", options: ["около 4 000", "около 40 000", "около 400 000"], correctIndex: 1, criterion: "", maxPoints: 1, skill: "Факты из текста", sourceId: 3, quote: "Ежегодно на острове гнездится около 40 000 пар этих птиц.", explanation: "В тексте указано около 40 000 пар.", optionExplanations: ["В десять раз меньше, чем в тексте.", "Верно.", "В десять раз больше, чем в тексте."] },
  { id: "demo-volcano", type: "open", prompt: "Расскажите о вулкане Тарус: какова его высота и когда он извергался последний раз?", options: [], correctIndex: null, criterion: "1 балл за высоту 1 318 м, 1 балл за 1911 год.", maxPoints: 2, skill: "Пересказ", sourceId: 2, quote: "Самая высокая точка острова — вулкан Тарус высотой 1 318 метров.", explanation: "Высота 1 318 м, последнее извержение в 1911 году." },
];
const STUDENTS = ["Алия (демо)", "Данияр (демо)", "София (демо)", "Тимур (демо)", "Ерлан (демо)"];
// Synthetic results for the first three students: [area, bird, volcano points].
const SEEDED: [number, number, number][] = [[0, 1, 2], [1, 1, 1], [0, 2, 0]];

export function createDemoTeacher(base: string) {
  const count = one("SELECT count(*) AS n FROM teachers WHERE email LIKE 'demo-%@sandbox.logus'")?.n || 0;
  if (count >= 500) fail(503, "Демо-кабинеты временно закончились. Попробуйте позже.");
  return transaction(() => {
    const teacher = { id: id(), name: "Демо-учитель" };
    const tag = teacher.id.slice(0, 8);
    run("INSERT INTO teachers VALUES(?,?,?,?,?)", teacher.id, teacher.name, `demo-${tag}@sandbox.logus`, randomBytes(64).toString("hex"), randomBytes(16).toString("hex"));
    const group = { id: id(), name: "Демо-класс" };
    run("INSERT INTO groups VALUES(?,?,?)", group.id, teacher.id, group.name);
    const students = STUDENTS.map((name) => {
      const s = { id: id(), name };
      run("INSERT INTO students VALUES(?,?,?,?)", s.id, group.id, name, secret());
      return s;
    });
    let lesson: Lesson = { id: id(), title: "Новый урок", instruction: "", pdfUrl: null, pages: [], questions: [], selectedPages: [], updatedAt: "", settings: { ...defaultTestSettings, resultMode: "immediate" } };
    lesson = editLesson(lesson, { title: "Остров Лемара · демо", text: TEXT });
    lesson = editLesson(lesson, { questions: QUESTIONS });
    saveLesson(lesson, teacher.id);
    const issued = issueRun(lesson, group, base);
    SEEDED.forEach(([area, bird, volcano], i) => {
      const answers = { "demo-area": area, "demo-bird": bird, "demo-volcano": "Синтетический ответ ученика." };
      const points = { "demo-area": area === 0 ? 1 : 0, "demo-bird": bird === 1 ? 1 : 0, "demo-volcano": volcano };
      run("UPDATE assignments SET status='graded',answers=?,points=? WHERE run=? AND student=?", JSON.stringify(answers), JSON.stringify(points), issued.id, students[i].id);
    });
    return teacher;
  });
}
