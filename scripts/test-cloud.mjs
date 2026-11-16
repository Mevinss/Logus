import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { BlobPreconditionFailedError } from "@vercel/blob";
import { connect } from "../lib/server-schema.mjs";
import { seedCloud } from "./seed-cloud.mjs";
import {
  databaseKey,
  pdfKey,
  withCloudDatabase,
  cloudStorage,
  stageCloudPdf,
  withRequestDatabase,
} from "../lib/server-cloud.mjs";

class MemoryStore {
  records = new Map();
  async get(key, options) {
    assert.deepEqual(options, { access: "private", useCache: false });
    const entry = this.records.get(key);
    if (!entry) return null;
    return {
      statusCode: 200,
      blob: { etag: entry.etag },
      stream: new Response(entry.bytes).body,
    };
  }
  async put(key, bytes, options) {
    assert.equal(options.access, "private");
    assert.equal(options.addRandomSuffix, false);
    const current = this.records.get(key);
    if (options.ifMatch) {
      if (current?.etag !== options.ifMatch)
        throw new BlobPreconditionFailedError();
    } else {
      assert.equal(options.allowOverwrite, false);
      if (current) throw Error("already exists");
    }
    const etag = randomUUID();
    this.records.set(key, { etag, bytes: Buffer.from(bytes) });
    return { etag, url: key };
  }
  async del(key, options) {
    assert.equal(options.ifMatch, this.records.get(key)?.etag);
    this.records.delete(key);
  }
}

test("seed preserves WAL, pending updates conflict and retry against fresh snapshots", async () => {
  const dir = await mkdtemp(join(tmpdir(), "logus-test-seed-"));
  const store = new MemoryStore();
  const oldDir = process.env.LOGUS_DATA_DIR;
  process.env.LOGUS_DATA_DIR = dir;
  let original;
  try {
    await assert.rejects(
      withCloudDatabase(() => assert.fail("missing snapshot"), store),
      { status: 503 },
    );
    assert.equal(store.records.size, 0);
    original = connect().db;
    original
      .prepare("INSERT INTO teachers VALUES (?,?,?,?,?)")
      .run("t", "A", "t@example.test", "hash", "salt");
    original.prepare("INSERT INTO files VALUES (?,?)").run("f", "t");
    const seedPdf = Buffer.from("%PDF-1.4 seed");
    await writeFile(join(dir, "files", "f.pdf"), seedPdf);
    assert.equal(await seedCloud(dir, store), 1);
    assert.deepEqual(store.records.get(pdfKey("f")).bytes, seedPdf);
    await assert.rejects(seedCloud(dir, store), /уже есть/);
    const before = store.records.get(databaseKey).etag;
    const list = (ctx) =>
      ctx.db
        .prepare("SELECT id FROM groups ORDER BY id")
        .all()
        .map((g) => g.id);
    assert.deepEqual(
      await withCloudDatabase(() => list(cloudStorage()), store),
      [],
    );
    assert.equal(store.records.get(databaseKey).etag, before);

    const bothReady = Promise.withResolvers();
    let started = 0;
    const add = (id, parallel) =>
      withCloudDatabase(async () => {
        const ctx = cloudStorage();
        if (parallel) {
          assert.deepEqual(list(ctx), []);
          if (++started === 2) bothReady.resolve();
          await bothReady.promise;
        }
        assert.equal(cloudStorage(), ctx);
        ctx.db.prepare("INSERT INTO groups VALUES (?,?,?)").run(id, "t", id);
        ctx.db.prepare("INSERT INTO files VALUES (?,?)").run(id, "t");
        stageCloudPdf(id, Buffer.from("%PDF-1.4 " + id));
        return id;
      }, store);
    const results = await Promise.allSettled(
      ["a", "b"].map((id) => add(id, true)),
    );
    const won = results.filter((r) => r.status === "fulfilled");
    const lost = results.filter((r) => r.status === "rejected");
    assert.equal(won.length, 1);
    assert.equal(lost.length, 1);
    assert.equal(lost[0].reason.status, 409);
    const loser = won[0].value === "a" ? "b" : "a";
    assert.equal(store.records.has(pdfKey(loser)), false);
    await add(loser, false);

    // New module instance: no connection or AsyncLocalStorage shared with the writer.
    const cold = await import("../lib/server-cloud.mjs?cold-start");
    assert.deepEqual(
      await cold.withCloudDatabase(() => list(cold.cloudStorage()), store),
      ["a", "b"],
    );
    assert.equal(
      await new Response(
        await cold.withCloudDatabase(() => cold.readCloudPdf("a"), store),
      ).text(),
      "%PDF-1.4 a",
    );
    await assert.rejects(
      withCloudDatabase(() => {
        cloudStorage().db.exec("DELETE FROM groups");
        throw Error("cancel");
      }, store),
      /cancel/,
    );
    assert.deepEqual(
      await withCloudDatabase(() => list(cloudStorage()), store),
      ["a", "b"],
    );
    await assert.rejects(
      withCloudDatabase(() => null, {
        get: async () => {
          throw Error("outage");
        },
      }),
      { status: 503 },
    );
    const valid = store.records.get(databaseKey);
    store.records.set(databaseKey, { ...valid, bytes: Buffer.from("corrupt") });
    await assert.rejects(
      withCloudDatabase(() => assert.fail("invalid database"), store),
      { status: 503 },
    );
    assert.equal(store.records.get(databaseKey).etag, valid.etag);
  } finally {
    original?.close();
    if (oldDir === undefined) delete process.env.LOGUS_DATA_DIR;
    else process.env.LOGUS_DATA_DIR = oldDir;
    await rm(dir, { recursive: true, force: true, maxRetries: 3 });
  }
});

test("Vercel refuses API work without its store token", () => {
  const vercel = process.env.VERCEL;
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  try {
    process.env.VERCEL = "1";
    delete process.env.BLOB_READ_WRITE_TOKEN;
    assert.throws(
      () =>
        withRequestDatabase(() => assert.fail("must not open local SQLite")),
      { status: 503 },
    );
  } finally {
    if (vercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = vercel;
    if (token !== undefined) process.env.BLOB_READ_WRITE_TOKEN = token;
  }
});
