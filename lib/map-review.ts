import type { Question } from "./server-core";

export const mapRun = "public-map-v1";
export const reviewPrefix = "public-map-review-v1-";

const variants = [
  { label: "Расстояние на местности", prompt: "На карте масштаба 1 : 100 000 тропа занимает 7 см. Сколько это километров?", options: ["0,7 км", "70 км", "7 км"], correctIndex: 2 },
  { label: "Длина на карте", prompt: "Маршрут длиной 8 км рисуют на карте масштаба 1 : 100 000. Какой длины будет линия?", options: ["8 см", "80 см", "0,8 см"], correctIndex: 0 },
  { label: "Сравнение маршрутов", prompt: "Два отрезка длиной по 6 см измерили на картах 1 : 100 000 и 1 : 50 000. На сколько километров первый маршрут длиннее?", options: ["На 6 км", "На 3 км", "На 9 км"], correctIndex: 1 },
];

export function reviewQuestions(questions: Question[], points: Record<string, number>) {
  return variants.flatMap((variant, i) => {
    const original = questions.find(q => q.id === "map-v1-" + (i + 1));
    if (!original || points[original.id] !== 0) return [];
    return [{ ...original, id: "review-" + original.id, skill: variant.label,
      prompt: variant.prompt, options: variant.options, correctIndex: variant.correctIndex }];
  });
}

export function reviewRunId(questions: Question[]) {
  return reviewPrefix + questions.map(q => q.id.slice(-1)).join("");
}
