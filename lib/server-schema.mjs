import { DatabaseSync } from "node:sqlite";
import { resolve, join } from "node:path";
import { mkdirSync } from "node:fs";
export function connect() {
  const dir = resolve(
    /* turbopackIgnore: true */ process.env.LOGUS_DATA_DIR || "data",
  );
  mkdirSync(join(dir, "files"), { recursive: true });
  const db = new DatabaseSync(join(dir, "logus.sqlite"));
  db.exec(`
    PRAGMA busy_timeout=5000;
    PRAGMA journal_mode=WAL;
    PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS teachers(id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, hash TEXT NOT NULL, salt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS groups(id TEXT PRIMARY KEY, teacher TEXT NOT NULL REFERENCES teachers, name TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS students(id TEXT PRIMARY KEY, grp TEXT NOT NULL REFERENCES groups, name TEXT NOT NULL, invite TEXT UNIQUE NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, role TEXT NOT NULL, user TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS lessons(id TEXT PRIMARY KEY, teacher TEXT NOT NULL REFERENCES teachers, body TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS files(id TEXT PRIMARY KEY, teacher TEXT NOT NULL REFERENCES teachers);
    CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY, lesson TEXT NOT NULL REFERENCES lessons, grp TEXT NOT NULL REFERENCES groups, kind TEXT NOT NULL, parent TEXT REFERENCES runs, created TEXT NOT NULL, body TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS assignments(run TEXT NOT NULL REFERENCES runs, student TEXT NOT NULL REFERENCES students, status TEXT NOT NULL DEFAULT 'not_started', answers TEXT NOT NULL DEFAULT '{}', points TEXT NOT NULL DEFAULT '{}', comment TEXT NOT NULL DEFAULT '', PRIMARY KEY(run,student));
    CREATE INDEX IF NOT EXISTS assignment_student ON assignments(student);
    CREATE INDEX IF NOT EXISTS run_group ON runs(grp);
    CREATE INDEX IF NOT EXISTS student_group ON students(grp);
  `);
  return { db, dir };
}
