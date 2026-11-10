import os from "node:os";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const mode = process.argv.includes("--dev") ? "dev" : "start";
const port = process.env.PORT || "3000";
const urls = Object.values(os.networkInterfaces())
  .flat()
  .filter((x) => x?.family === "IPv4" && !x.internal)
  .map((x) => "http://" + x.address + ":" + port);
console.log(
  "Учитель: http://localhost:" +
    port +
    "\nВ локальной сети: " +
    (process.env.PUBLIC_BASE_URL || urls.join("  ")),
);
const server = spawn(
  process.execPath,
  [require.resolve("next/dist/bin/next"), mode, "-H", "0.0.0.0", "-p", port],
  { stdio: "inherit" },
);
for (const sig of ["SIGINT", "SIGTERM"])
  process.on(sig, () => server.kill(sig));
server.on("exit", (code) => process.exit(code ?? 0));
