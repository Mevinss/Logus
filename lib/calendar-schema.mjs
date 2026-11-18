export function calendarSchema(db) {
 db.exec(`CREATE TABLE IF NOT EXISTS calendar_events(
 id TEXT PRIMARY KEY, teacher TEXT NOT NULL REFERENCES teachers, grp TEXT NOT NULL REFERENCES groups,
 series TEXT NOT NULL, title TEXT NOT NULL, subject TEXT NOT NULL, description TEXT NOT NULL,
 starts TEXT NOT NULL, ends TEXT NOT NULL, timezone TEXT NOT NULL, lesson TEXT REFERENCES lessons,
 run TEXT REFERENCES runs, cancelled INTEGER NOT NULL DEFAULT 0, recurrence TEXT NOT NULL DEFAULT '{}');
 CREATE INDEX IF NOT EXISTS calendar_group_time ON calendar_events(grp,starts);
 CREATE INDEX IF NOT EXISTS calendar_series ON calendar_events(series,starts);`);
}
