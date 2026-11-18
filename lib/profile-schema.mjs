export function profileSchema(db) {
 db.exec(`CREATE TABLE IF NOT EXISTS profile_preferences(role TEXT NOT NULL, user TEXT NOT NULL, language TEXT NOT NULL DEFAULT 'ru', theme TEXT NOT NULL DEFAULT 'system', time_zone TEXT NOT NULL DEFAULT 'Asia/Qyzylorda', PRIMARY KEY(role,user));`);
}
