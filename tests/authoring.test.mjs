import assert from "node:assert/strict";
import { test, after } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { registerHooks, stripTypeScriptTypes } from "node:module";
import {
  ensureRagSchema,
  chunkPages,
  searchTerms,
  boundedChunks,
} from "../lib/rag-schema.mjs";
const temp = mkdtempSync(path.join(tmpdir(), "authoring-"));
process.env.LOGUS_DATA_DIR = temp;
delete process.env.VERCEL;
delete process.env.BLOB_READ_WRITE_TOKEN;
const hooks = registerHooks({
  resolve(s, c, next) {
    if (c.parentURL?.endsWith(".ts") && s.startsWith(".") && !path.extname(s))
      s += ".ts";
    return next(s, c);
  },
  load(url, c, next) {
    if (url.endsWith(".ts") && !url.includes("/node_modules/"))
      return {
        format: "module",
        source: stripTypeScriptTypes(readFileSync(fileURLToPath(url), "utf8"), {
          mode: "transform",
        }),
        shortCircuit: true,
      };
    return next(url, c);
  },
});
after(async () => {
  const { storage } = await import("../lib/server-core.ts");
  storage().db.close();
  hooks.deregister();
  rmSync(temp, { recursive: true, force: true });
});
test("Unicode FTS indexes Kazakh, Russian and English and scopes owners", () => {
  const db = new DatabaseSync(":memory:");
  ensureRagSchema(db);
  const insert = db.prepare("INSERT INTO material_chunks VALUES(?,?,?,?,?,?)");
  insert.run("alice", "lesson", "v", 1, "1:0", "Өсімдік фотосинтез sunlight");
  insert.run("bob", "lesson", "v", 2, "2:0", "Өсімдік фотосинтез sunlight");
  for (const query of ["Өсімдік", "фотосинтез", "sunlight", '" OR *']) {
    const terms = searchTerms(query);
    if (!terms) continue;
    const rows = db
      .prepare(
        "SELECT owner FROM material_chunks WHERE material_chunks MATCH ? AND owner=?",
      )
      .all(terms, "alice");
    assert.ok(rows.every((row) => row.owner === "alice"));
    if (query !== '" OR *') assert.equal(rows.length, 1);
  }
  db.close();
});
test("chunk overlap preserves source identity and bounded context", () => {
  const chunks = chunkPages([
    { id: 17, text: "a".repeat(12000) },
    { id: 91, text: "Өсімдік" },
  ]);
  assert.ok(chunks.length > 5);
  assert.equal(chunks.at(-1).sourceId, 91);
  assert.ok(
    boundedChunks(chunks, 3000).reduce((n, c) => n + c.text.length, 0) <= 3000,
  );
  assert.equal(boundedChunks(chunks, 0).length, 0);
});
test("real retrieval filters selected pages and updates changed material", async () => {
  const { retrieveContext } = await import("../lib/rag.ts");
  const lesson = {
    id: "l",
    selectedPages: [2],
    pages: [
      { id: 1, text: "secret excluded" },
      { id: 2, text: "Өсімдік фотосинтез жарық" },
    ],
  };
  assert.equal(retrieveContext("alice", lesson, "Өсімдік")[0].id, 2);
  lesson.pages[1].text = "Updated lesson text";
  assert.match(retrieveContext("alice", lesson, "Updated")[0].text, /Updated/);
  assert.equal(
    retrieveContext("bob", { ...lesson, selectedPages: [] }, "Updated").length,
    0,
  );
});
test("AI deduplicates, caches by owner and model, logs actual usage and retries failure", async () => {
  const { cachedAi } = await import("../lib/rag.ts");
  const { storage } = await import("../lib/server-core.ts");
  let calls = 0;
  const call = async () => {
    calls++;
    await new Promise((r) => setTimeout(r, 10));
    return {
      value: { ok: true },
      usage: { prompt_tokens: 31, completion_tokens: 9 },
    };
  };
  await Promise.all([
    cachedAi("cache-owner", "test", { x: 1 }, call),
    cachedAi("cache-owner", "test", { x: 1 }, call),
  ]);
  await cachedAi("cache-owner", "test", { x: 1 }, call);
  assert.equal(calls, 1);
  await cachedAi("different-owner", "test", { x: 1 }, call);
  assert.equal(calls, 2);
  const usage = storage()
    .db.prepare("SELECT * FROM ai_usage WHERE owner=?")
    .get("cache-owner");
  assert.equal(usage.input_tokens, 31);
  // A cloud CAS retry may load a snapshot that lacks the initiating request's cache.
  storage().db.prepare("DELETE FROM ai_cache WHERE owner=?").run("cache-owner");
  storage().db.prepare("DELETE FROM ai_usage WHERE owner=?").run("cache-owner");
  await cachedAi("cache-owner", "test", { x: 1 }, call);
  assert.equal(calls, 2);
  assert.equal(
    storage()
      .db.prepare("SELECT input_tokens FROM ai_usage WHERE owner=?")
      .get("cache-owner").input_tokens,
    31,
  );
  for (let i = 0; i < 6; i++) await cachedAi("rate-owner", "test", { i }, call);
  await assert.rejects(
    cachedAi("rate-owner", "test", { i: 7 }, call),
    (error) => error.status === 429,
  );
  let bad = 0;
  for (let i = 0; i < 2; i++)
    await assert.rejects(
      cachedAi("retry-owner", "test", {}, async () => {
        bad++;
        throw Error("fail");
      }),
    );
  assert.equal(bad, 2);
});
test("generation validates options, rejects invented quote without caching then accepts valid result", async () => {
  const { generateQuestions, generationOptions, extractDocument } =
    await import("../lib/material.ts");
  assert.throws(() => generationOptions({ count: 21 }));
  assert.throws(() => generationOptions({ count: 2, openCount: 3 }));
  assert.deepEqual(
    await extractDocument(Buffer.from("One\n\nTwo"), "test.txt"),
    ["One", "Two"],
  );
  const { zipSync, strToU8 } = await import("fflate");
  const docx = zipSync({
    "[Content_Types].xml": strToU8(
      '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    ),
    "_rels/.rels": strToU8(
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    ),
    "word/document.xml": strToU8(
      '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Өсімдік grows.</w:t></w:r></w:p></w:body></w:document>',
    ),
  });
  assert.deepEqual(await extractDocument(Buffer.from(docx), "lesson.docx"), [
    "Өсімдік grows.",
  ]);
  const originalFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = "fixture";
  let calls = 0;
  const q = {
    type: "choice",
    prompt: "What grows?",
    options: ["Plant", "Stone"],
    correctIndex: 0,
    criterion: "",
    maxPoints: 1,
    skill: "Biology",
    sourceId: 3,
    quote: "invented",
    explanation: "Plants grow.",
    optionExplanations: ["Plants grow.", "Stones do not grow."],
  };
  globalThis.fetch = async () => {
    calls++;
    return Response.json({
      choices: [{ message: { content: JSON.stringify({ questions: [q] }) } }],
      usage: { prompt_tokens: 20, completion_tokens: 20 },
    });
  };
  try {
    const opts = {
      owner: "generation-owner",
      count: 1,
      openCount: 0,
      language: "en",
    };
    await assert.rejects(
      generateQuestions(
        [{ id: 3, text: "Plants grow." }],
        undefined,
        undefined,
        undefined,
        opts,
      ),
    );
    q.quote = "Plants grow.";
    const valid = await generateQuestions(
      [{ id: 3, text: "Plants grow." }],
      undefined,
      undefined,
      undefined,
      opts,
    );
    assert.equal(valid[0].explanation, "Plants grow.");
    await generateQuestions(
      [{ id: 3, text: "Plants grow." }],
      undefined,
      undefined,
      undefined,
      opts,
    );
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.OPENAI_API_KEY;
  }
});
