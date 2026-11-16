export const practiceRun = "public-map-v1";
const identityKey = "logus:practice:identity";
type Answers = Record<string, number | string>;
export type SavedResult = {
  title: string;
  status: "pending" | "graded";
  earned: number;
  maximum: number;
  savedAt: string;
  skills: { skill: string; earned: number; maxPoints: number }[];
};

function read(key: string): string | null {
  for (const name of ["localStorage", "sessionStorage"] as const) {
    try {
      const value = window[name].getItem(key);
      if (value) return value;
    } catch {}
  }
  return null;
}
function write(key: string, value: string) {
  for (const name of ["localStorage", "sessionStorage"] as const) {
    try {
      window[name].setItem(key, value);
      return true;
    } catch {}
  }
  return false;
}
function json(key: string) {
  try {
    return JSON.parse(read(key) ?? "null");
  } catch {
    return null;
  }
}
export function practiceIdentity() {
  const existing = read(identityKey);
  if (existing && /^[a-f0-9]{64}$/.test(existing)) return existing;
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  write(identityKey, token);
  return token;
}
export function bindPractice(token: string, id: string) {
  write("logus:practice:owner:" + token, id);
}
export function forgetPractice(token: string) {
  for (const name of ["localStorage", "sessionStorage"] as const) {
    try {
      if (window[name].getItem(identityKey) === token)
        window[name].removeItem(identityKey);
    } catch {}
  }
}
export function practiceCopy(
  id: string,
): { answers: Answers; submitted: boolean } | null {
  const saved = json("logus:practice:copy:" + id);
  if (
    !saved ||
    typeof saved.answers !== "object" ||
    !saved.answers ||
    Array.isArray(saved.answers)
  )
    return null;
  return { answers: saved.answers, submitted: saved.submitted === true };
}
export function savePracticeAnswers(
  id: string,
  answers: Answers,
  submitted: boolean,
) {
  return write(
    "logus:practice:copy:" + id,
    JSON.stringify({ answers, submitted }),
  );
}
export function savePracticeResult(id: string, result: SavedResult) {
  write("logus:practice:result:" + id, JSON.stringify(result));
}
export function lastPracticeResult(token: string): SavedResult | null {
  const id = read("logus:practice:owner:" + token);
  if (!id) return null;
  return json("logus:practice:result:" + id);
}
