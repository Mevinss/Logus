import { DatabaseSync, backup } from "node:sqlite";
import { copyFile, mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";

const source = resolve(process.env.LOGUS_DATA_DIR || "data");
const root = resolve(process.argv[2] || "backups");
await mkdir(root, { recursive: true });
const staging = await mkdtemp(join(root, ".partial-"));
try {
  const target = join(staging, "logus.sqlite");
  const db = new DatabaseSync(join(source, "logus.sqlite"), { readOnly: true });
  try {
    await backup(db, target);
  } finally {
    db.close();
  }
  const snapshot = new DatabaseSync(target, { readOnly: true });
  try {
    if (
      snapshot.prepare("PRAGMA integrity_check").get().integrity_check !== "ok"
    )
      throw Error("Проверка целостности базы не пройдена.");
    await mkdir(join(staging, "files"));
    for (const { id } of snapshot.prepare("SELECT id FROM files").all()) {
      if (!/^[a-zA-Z0-9_-]+$/.test(id))
        throw Error("Некорректное имя PDF в базе.");
      await copyFile(
        join(source, "files", id + ".pdf"),
        join(staging, "files", id + ".pdf"),
      );
    }
  } finally {
    snapshot.close();
  }
  const folder = join(
    root,
    "logus-" +
      new Date().toISOString().replace(/[:.]/g, "-") +
      "-" +
      randomUUID().slice(0, 8),
  );
  await rename(staging, folder);
  console.log("Копия базы и PDF: " + folder);
} catch (e) {
  await rm(staging, { recursive: true, force: true });
  throw e;
}
