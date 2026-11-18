export function testSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS attempt_clock (
      run TEXT NOT NULL REFERENCES runs, student TEXT NOT NULL REFERENCES students,
      started INTEGER NOT NULL, ends INTEGER, expired INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(run,student)
    );
    CREATE TABLE IF NOT EXISTS published_results (
      run TEXT NOT NULL REFERENCES runs, student TEXT NOT NULL REFERENCES students,
      published INTEGER NOT NULL, PRIMARY KEY(run,student)
    );
    CREATE TABLE IF NOT EXISTS run_archive (run TEXT PRIMARY KEY REFERENCES runs, archived INTEGER NOT NULL);
  `);
}
