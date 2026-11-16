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
  const id = "example-map-practice-" + teacher.id;
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
        type: "choice",
        prompt: "Какой длины будет линия маршрута в 5 км на карте масштаба 1 : 100 000?",
        options: ["5 мм", "50 см", "5 см"],
        correctIndex: 2,
        criterion: "",
        maxPoints: 1,
      },
      {
        ...base,
        id: randomUUID(),
        type: "choice",
        sourceId: 2,
        quote: "при масштабе 1 : 50 000 отрезок длиной 2 сантиметра соответствует 100 000 сантиметрам",
        prompt: "На двух картах маршрут занимает по 2 см. На первой масштаб 1 : 100 000, на второй — 1 : 50 000. На сколько километров первый маршрут длиннее?",
        options: ["На 1 км", "На 2 км", "На 0,5 км"],
        correctIndex: 0,
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
      title: "Практикум · Масштаб карты",
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
  if (process.env.LOGUS_PUBLIC_PRACTICE === "1") {
    const lesson = JSON.parse(db.prepare("SELECT body FROM lessons WHERE id=?").get(id).body);
    lesson.questions.forEach((q,i)=>{q.id="map-v1-"+(i+1)});
    db.prepare("INSERT OR IGNORE INTO groups VALUES(?,?,?)").run("public-map-group",teacher.id,"Открытый практикум");
    db.prepare("INSERT OR IGNORE INTO runs VALUES(?,?,?,?,?,?,?)").run("public-map-v1",id,"public-map-group","lesson",null,new Date().toISOString(),JSON.stringify(lesson));
  }
} finally {
  db.close();
}
