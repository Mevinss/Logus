import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import * as vercel from "@vercel/blob";
import {
  databaseKey,
  freshRead,
  immutableWrite,
  pdfKey,
} from "../lib/server-cloud.mjs";

export async function seedCloud(directory, store = vercel) {
  const existing = await store.get(databaseKey, freshRead);
  if (existing) {
    await existing.stream?.cancel();
    throw Error("В хранилище уже есть база Logus.");
  }
  const dir = await mkdtemp(join(tmpdir(), "logus-seed-"));
  const snapshotFile = join(dir, "seed.sqlite");
  try {
    const source = new DatabaseSync(join(directory, "logus.sqlite"), {
      readOnly: true,
    });
    try {
      source.prepare("VACUUM INTO ?").run(snapshotFile);
    } finally {
      source.close();
    }
    const snapshot = new DatabaseSync(snapshotFile, { readOnly: true });
    let files;
    try {
      if (
        snapshot.prepare("PRAGMA quick_check").get().quick_check !== "ok" ||
        snapshot.prepare("PRAGMA foreign_key_check").get() ||
        !snapshot.prepare("SELECT id FROM teachers LIMIT 1").get()
      )
        throw Error("Требуется подготовленная база с учителем.");
      const tables = new Set(
        snapshot
          .prepare("SELECT name FROM sqlite_master WHERE type='table'")
          .all()
          .map((row) => row.name),
      );
      for (const table of [
        "teachers",
        "groups",
        "students",
        "sessions",
        "lessons",
        "files",
        "runs",
        "assignments",
      ])
        if (!tables.has(table))
          throw Error("Отсутствует таблица Logus: " + table);
      files = snapshot.prepare("SELECT id FROM files").all();
    } finally {
      snapshot.close();
    }
    for (const { id } of files) {
      const key = pdfKey(id);
      const bytes = await readFile(join(directory, "files", id + ".pdf"));
      const uploaded = await store.get(key, freshRead);
      if (uploaded) {
        const persisted = Buffer.from(
          await new Response(uploaded.stream).arrayBuffer(),
        );
        if (!persisted.equals(bytes))
          throw Error("В хранилище уже есть другой PDF: " + id);
      } else {
        await store.put(key, bytes, {
          ...immutableWrite,
          contentType: "application/pdf",
        });
      }
    }
    await store.put(databaseKey, await readFile(snapshotFile), {
      ...immutableWrite,
      contentType: "application/vnd.sqlite3",
    });
    return files.length;
  } finally {
    await rm(dir, { recursive: true, force: true, maxRetries: 3 });
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    if (!process.env.BLOB_READ_WRITE_TOKEN || !process.argv[2])
      throw Error(
        "Укажите BLOB_READ_WRITE_TOKEN и путь к подготовленной папке данных.",
      );
    console.log(
      "База загружена. PDF:",
      await seedCloud(resolve(process.argv[2])),
    );
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
