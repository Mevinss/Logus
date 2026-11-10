import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { connect } from "../lib/server-schema.mjs";
const { db, dir } = connect();
const email = (process.env.TEACHER_EMAIL || "teacher@logus.local")
  .trim()
  .toLowerCase();
try {
  if (db.prepare("SELECT id FROM teachers WHERE email=?").get(email)) {
    console.log("Учитель уже создан: " + email);
  } else {
    const password =
      process.env.TEACHER_PASSWORD || randomBytes(16).toString("base64url");
    if (password.length < 8)
      throw Error("Пароль учителя должен содержать минимум 8 символов.");
    const salt = randomBytes(24).toString("hex");
    db.prepare("INSERT INTO teachers VALUES (?,?,?,?,?)").run(
      randomUUID(),
      "Преподаватель",
      email,
      scryptSync(password, salt, 64).toString("hex"),
      salt,
    );
    const info = "Вход учителя\n" + email + "\n" + password + "\n";
    if (!process.env.TEACHER_PASSWORD)
      writeFileSync(join(dir, "teacher-login.txt"), info, { mode: 0o600 });
    console.log(
      process.env.TEACHER_PASSWORD
        ? "Учитель создан: " + email
        : info + "Пароль сохранён в " + join(dir, "teacher-login.txt"),
    );
  }
} finally {
  db.close();
}
