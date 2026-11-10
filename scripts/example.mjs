import { randomUUID } from "node:crypto";
import { connect } from "../lib/server-schema.mjs";
const { db } = connect();
try {
  const teacher = db
    .prepare("SELECT id FROM teachers WHERE email=?")
    .get(
      (process.env.TEACHER_EMAIL || "teacher@logus.local").trim().toLowerCase(),
    );
  if (!teacher) throw Error("Сначала выполните npm run db:setup.");
  const id = "example-map-" + teacher.id;
  if (!db.prepare("SELECT id FROM lessons WHERE id=?").get(id)) {
    const pages = [
      {
        id: 1,
        text: "Масштаб карты показывает, во сколько раз расстояния на карте уменьшены по сравнению с расстояниями на местности. В масштабе 1 : 100 000 один сантиметр на карте соответствует 100 000 сантиметрам, или одному километру, на местности.",
      },
      {
        id: 2,
        text: "Чтобы определить расстояние на местности, измерьте отрезок на карте, умножьте его длину на знаменатель масштаба и переведите результат в удобные единицы. Например, при масштабе 1 : 50 000 отрезок длиной 2 сантиметра соответствует 100 000 сантиметрам, то есть одному километру.",
      },
    ];
    const base = {
      skill: "Чтение масштаба",
      sourceId: 1,
      quote:
        "один сантиметр на карте соответствует 100 000 сантиметрам, или одному километру, на местности",
    };
    const questions = [
      {
        ...base,
        id: randomUUID(),
        type: "choice",
        prompt:
          "Какому расстоянию на местности соответствуют 3 см на карте масштаба 1 : 100 000?",
        options: ["300 м", "3 км", "30 км"],
        correctIndex: 1,
        criterion: "",
        maxPoints: 1,
      },
      {
        ...base,
        id: randomUUID(),
        type: "open",
        sourceId: 2,
        quote:
          "умножьте его длину на знаменатель масштаба и переведите результат в удобные единицы",
        prompt:
          "Объясните, как перевести 4 см на карте масштаба 1 : 50 000 в километры.",
        options: [],
        correctIndex: null,
        criterion:
          "1 балл за умножение 4 на 50 000, ещё 1 балл за перевод 200 000 см в 2 км.",
        maxPoints: 2,
      },
    ];
    const draft = {
      id,
      title: "Пример · Как читать масштаб карты",
      instruction:
        "Прочитайте два абзаца и решите задачи. Это демонстрационный урок с заранее подготовленными вопросами.",
      pages,
      questions,
      selectedPages: [1, 2],
      pdfUrl: null,
      updatedAt: new Date().toISOString(),
    };
    db.prepare("INSERT INTO lessons VALUES(?,?,?)").run(
      id,
      teacher.id,
      JSON.stringify(draft),
    );
  }
  console.log("Демонстрационный черновик доступен в разделе «Мои уроки».");
} finally {
  db.close();
}
