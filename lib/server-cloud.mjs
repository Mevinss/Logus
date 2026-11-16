import { AsyncLocalStorage } from "node:async_hooks";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import * as vercel from "@vercel/blob";

export const databaseKey = "logus/v1/logus.sqlite";
export const freshRead = { access: "private", useCache: false };
export const immutableWrite = {
  access: "private",
  addRandomSuffix: false,
  allowOverwrite: false,
};
export function pdfKey(id) {
  if (typeof id !== "string" || !/^[a-zA-Z0-9_-]+$/.test(id))
    throw Error("Некорректный идентификатор файла.");
  return "logus/v1/files/" + id + ".pdf";
}
const requests = new AsyncLocalStorage();
export const cloudStorage = () => requests.getStore();
export class CloudStorageError extends Error {
  constructor(status, message, cause) {
    super(message, { cause });
    this.status = status;
  }
}
function unavailable(cause) {
  return new CloudStorageError(
    503,
    "Облачное хранилище недоступно. Повторите запрос.",
    cause,
  );
}
async function storageOperation(fn) {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof vercel.BlobPreconditionFailedError)
      throw new CloudStorageError(
        409,
        "Данные изменились в другом сеансе. Повторите действие.",
        e,
      );
    throw unavailable(e);
  }
}
async function readBlob(store, key) {
  return storageOperation(async () => {
    const result = await store.get(key, freshRead);
    if (!result || result.statusCode !== 200 || !result.blob.etag)
      throw Error("Отсутствует объект или его ETag: " + key);
    return {
      etag: result.blob.etag,
      bytes: Buffer.from(await new Response(result.stream).arrayBuffer()),
    };
  });
}
export async function readCloudPdf(id) {
  const { store } = requests.getStore();
  return storageOperation(async () => {
    const result = await store.get(pdfKey(id), freshRead);
    if (!result || result.statusCode !== 200)
      throw Error("PDF отсутствует в хранилище.");
    return result.stream;
  });
}
export function stageCloudPdf(id, bytes) {
  const { pdfs } = requests.getStore();
  pdfs.set(pdfKey(id), bytes);
}
// Each invocation has its own database connection and files, also on warm instances.
export async function withCloudDatabase(fn, store = vercel) {
  const snapshot = await readBlob(store, databaseKey);
  const dir = await mkdtemp(join(tmpdir(), "logus-request-"));
  const file = join(dir, "logus.sqlite");
  let db;
  try {
    db = await storageOperation(async () => {
      if (
        snapshot.bytes.subarray(0, 16).toString("latin1") !==
        "SQLite format 3\0"
      )
        throw Error("Некорректный образ SQLite.");
      await writeFile(/* turbopackIgnore: true */ file, snapshot.bytes, {
        flag: "wx",
      });
      const connection = new DatabaseSync(file);
      try {
        connection.exec("PRAGMA journal_mode=DELETE; PRAGMA foreign_keys=ON;");
        connection.prepare("SELECT id FROM teachers LIMIT 1").get();
        return connection;
      } catch (e) {
        connection.close();
        throw e;
      }
    });
    const pdfs = new Map();
    const result = await requests.run({ db, dir, store, pdfs }, fn);
    if (!db.prepare("SELECT total_changes() AS n").get().n) return result;
    db.close();
    db = undefined;
    const updated = await readFile(/* turbopackIgnore: true */ file);
    const uploaded = [];
    try {
      for (const [key, bytes] of pdfs) {
        const file = await storageOperation(() =>
          store.put(key, bytes, {
            ...immutableWrite,
            contentType: "application/pdf",
          }),
        );
        uploaded.push(file);
      }
      await storageOperation(() =>
        store.put(databaseKey, updated, {
          access: "private",
          addRandomSuffix: false,
          ifMatch: snapshot.etag,
          contentType: "application/vnd.sqlite3",
        }),
      );
    } catch (e) {
      // A failed precondition proves this snapshot was never published. A timeout does not.
      if (e instanceof CloudStorageError && e.status === 409)
        await Promise.allSettled(
          uploaded.map((f) => store.del(f.url, { ifMatch: f.etag })),
        );
      throw e;
    }
    return result;
  } finally {
    try {
      db?.close();
    } finally {
      await rm(dir, { recursive: true, force: true, maxRetries: 3 });
    }
  }
}
export function withRequestDatabase(fn) {
  if (process.env.BLOB_READ_WRITE_TOKEN) return withCloudDatabase(fn);
  if (process.env.VERCEL === "1")
    throw new CloudStorageError(
      503,
      "Облачное хранилище не настроено.",
      undefined,
    );
  return fn();
}
