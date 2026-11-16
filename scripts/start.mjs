import { lanAddress } from "../lib/lan-address.mjs";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const mode = process.argv.includes("--dev") ? "dev" : "start";
const port = process.env.PORT || "3000";
const address = lanAddress();
const phoneUrl = process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL ||
  (address && "http://" + address + ":" + port);
console.log("Учитель: http://localhost:" + port + "\n" +
  (phoneUrl ? "Телефон (ссылка для входа): " + phoneUrl :
    "Адрес для телефона не найден. Подключите Wi-Fi или задайте PUBLIC_BASE_URL в .env.local."));
const server = spawn(
  process.execPath,
  [require.resolve("next/dist/bin/next"), mode, "-H", "0.0.0.0", "-p", port],
  { stdio: "inherit" },
);
for (const sig of ["SIGINT", "SIGTERM"])
  process.on(sig, () => server.kill(sig));
server.on("exit", (code) => process.exit(code ?? 0));
