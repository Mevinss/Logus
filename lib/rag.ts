import { createHash, randomUUID } from "node:crypto";
import { storage, fail } from "./server-core";
import {
  ensureRagSchema,
  chunkPages,
  searchTerms,
  boundedChunks,
} from "./rag-schema.mjs";
export type MaterialPage = {
  id: number;
  text: string;
  documentId?: string;
  sourcePage?: number;
  pdfUrl?: string | null;
  documentName?: string;
};
export function retrieveContext(
  owner: string,
  lesson: { id: string; pages: MaterialPage[]; selectedPages: number[] },
  query = "",
  budget = 16000,
) {
  const db = storage().db;
  ensureRagSchema(db);
  const version = createHash("sha256")
    .update(JSON.stringify(lesson.pages))
    .digest("hex");
  const prior = db
    .prepare(
      "SELECT version FROM material_chunks WHERE owner=? AND lesson=? LIMIT 1",
    )
    .get(owner, lesson.id) as { version: string } | undefined;
  if (prior?.version !== version) {
    db.prepare("DELETE FROM material_chunks WHERE owner=? AND lesson=?").run(
      owner,
      lesson.id,
    );
    const insert = db.prepare(
      "INSERT INTO material_chunks(owner,lesson,version,source_id,chunk_id,text) VALUES(?,?,?,?,?,?)",
    );
    for (const c of chunkPages(lesson.pages))
      insert.run(owner, lesson.id, version, c.sourceId, c.chunkId, c.text);
  }
  const selected = lesson.selectedPages.filter((id) =>
    lesson.pages.some((p) => p.id === id),
  );
  if (!selected.length) return [];
  const slots = selected.map(() => "?").join(",");
  const terms = searchTerms(query);
  const base = `SELECT source_id AS sourceId,chunk_id AS chunkId,text FROM material_chunks WHERE owner=? AND lesson=? AND CAST(source_id AS INTEGER) IN (${slots})`;
  let chunks = terms
    ? db
        .prepare(
          base +
            " AND material_chunks MATCH ? ORDER BY bm25(material_chunks) LIMIT 60",
        )
        .all(owner, lesson.id, ...selected, terms)
    : [];
  if (!chunks.length)
    chunks = db
      .prepare(base + " ORDER BY CAST(source_id AS INTEGER),rowid LIMIT 60")
      .all(owner, lesson.id, ...selected);
  return boundedChunks(chunks, budget).map(
    (c: { sourceId: number; text: string; chunkId: string }) => ({
      id: Number(c.sourceId),
      text: c.text,
      chunkId: c.chunkId,
    }),
  );
}
type AiResult = {
  value: unknown;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  requestId: string;
  created: number;
};
const inflight = new Map<string, Promise<AiResult>>();
const attempts = new Map<string, number[]>();
// Replay into each request's isolated cloud snapshot; a competing snapshot may win CAS.
const recent = new Map<string, { result: AiResult; expires: number }>();
export async function cachedAi<T>(
  owner: string,
  operation: string,
  input: unknown,
  call: () => Promise<{
    value: T;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  }>,
): Promise<T> {
  const db = storage().db;
  ensureRagSchema(db);
  const model = process.env.AI_MODEL || "gpt-4.1-mini";
  const key = createHash("sha256")
    .update(
      JSON.stringify({
        version: 3,
        model,
        endpoint: process.env.AI_BASE_URL || "https://api.openai.com/v1",
        operation,
        input,
      }),
    )
    .digest("hex");
  const cached = db
    .prepare("SELECT result FROM ai_cache WHERE owner=? AND cache_key=?")
    .get(owner, key) as { result: string } | undefined;
  if (cached) return JSON.parse(cached.result);
  const scope = owner + ":" + key;
  const persist = (result: AiResult) => {
    db.prepare("INSERT OR REPLACE INTO ai_cache VALUES(?,?,?,?)").run(
      owner,
      key,
      JSON.stringify(result.value),
      Date.now(),
    );
    db.prepare("INSERT OR REPLACE INTO ai_usage VALUES(?,?,?,?,?,?,?,?)").run(
      result.requestId,
      owner,
      operation,
      model,
      result.created,
      result.usage?.prompt_tokens ?? null,
      result.usage?.completion_tokens ?? null,
      "complete",
    );
    return structuredClone(result.value) as T;
  };
  for (const [k, v] of recent) if (v.expires < Date.now()) recent.delete(k);
  const memory = recent.get(scope);
  if (memory) return persist(memory.result);
  const pending = inflight.get(scope);
  if (pending) return persist(await pending);
  const count = db
    .prepare("SELECT COUNT(*) AS n FROM ai_usage WHERE owner=? AND created>?")
    .get(owner, Date.now() - 60000) as { n: number };
  for (const [id, times] of attempts)
    if (times.every((t) => t < Date.now() - 60000)) attempts.delete(id);
  const localAttempts = (attempts.get(owner) || []).filter(
    (t) => t > Date.now() - 60000,
  );
  if (Math.max(Number(count.n), localAttempts.length) >= 6)
    fail(429, "Слишком много запросов ИИ. Повторите через минуту.");
  attempts.set(owner, [...localAttempts, Date.now()]);
  const requestId = randomUUID(),
    created = Date.now();
  db.prepare("INSERT INTO ai_usage VALUES(?,?,?,?,?,?,?,?)").run(
    requestId,
    owner,
    operation,
    model,
    created,
    null,
    null,
    "pending",
  );
  const task = (async () => {
    const response = await call();
    const result = { ...response, requestId, created };
    if (recent.size >= 200) recent.delete(recent.keys().next().value!);
    recent.set(scope, { result, expires: Date.now() + 300000 });
    return result;
  })();
  inflight.set(scope, task);
  try {
    return persist(await task);
  } catch (error) {
    const usage = (
      error as {
        aiUsage?: { prompt_tokens?: number; completion_tokens?: number };
      }
    )?.aiUsage;
    db.prepare(
      "UPDATE ai_usage SET status=?,input_tokens=?,output_tokens=? WHERE id=?",
    ).run(
      "failed",
      usage?.prompt_tokens ?? null,
      usage?.completion_tokens ?? null,
      requestId,
    );
    throw error;
  } finally {
    inflight.delete(scope);
  }
}
