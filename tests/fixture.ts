import {
  spawn,
  spawnSync,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";

const listen = async (s: Server) => {
  s.listen(0, "127.0.0.1");
  await once(s, "listening");
  return (s.address() as { port: number }).port;
};
const close = (s: Server) =>
  new Promise<void>((resolve, reject) =>
    s.close((e) => (e ? reject(e) : resolve())),
  );
export const teacherLogin = {
  email: "jury@example.test",
  password: "local-example-password",
};
export const quote = "Cold water condenses on the glass.";
export const skill = "Фазовые переходы";
export const choice = {
  type: "choice",
  prompt: "Что образуется на холодном стекле?",
  options: ["Капли", "Пар", "Лёд"],
  correctIndex: 0,
  criterion: "",
  maxPoints: 1,
  skill,
  sourceId: 2,
  quote,
};
export const open = {
  type: "open",
  prompt: "Объясните появление капель.",
  options: [],
  correctIndex: null,
  criterion: "Упомянут переход из пара в жидкость.",
  maxPoints: 2,
  skill,
  sourceId: 2,
  quote,
};
export async function launchFixture() {
  const dir = await mkdtemp(join(tmpdir(), "logus-e2e-"));
  let providerMode: "ok" | "invalid" | "down" = "ok";
  const provider = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const request = JSON.parse(body),
      input = JSON.parse(request.messages[1].content);
    if (providerMode === "down") {
      res.writeHead(503).end();
      return;
    }
    const reply = input.answer
      ? { points: 2, evidence: input.answer }
      : input.skill
        ? {
            questions: [
              {
                ...choice,
                prompt: "Как называется появление капель на стекле?",
              },
            ],
          }
        : {
            questions: [
              {
                ...choice,
                quote: providerMode === "invalid" ? "absent quote" : quote,
              },
              open,
            ],
          };
    res
      .writeHead(200, { "Content-Type": "application/json" })
      .end(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(reply) } }],
        }),
      );
  });
  const aiPort = await listen(provider);
  const reserve = createServer();
  const port = await listen(reserve);
  await close(reserve);
  const url = "http://127.0.0.1:" + port;
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1",
    LOGUS_DATA_DIR: dir,
    PUBLIC_BASE_URL: url,
    TEACHER_EMAIL: teacherLogin.email,
    TEACHER_PASSWORD: teacherLogin.password,
    OPENAI_API_KEY: "test-fixture",
    AI_BASE_URL: "http://127.0.0.1:" + aiPort + "/v1",
  };
  const setup = spawnSync(process.execPath, ["scripts/setup.mjs"], {
    env,
    encoding: "utf8",
    windowsHide: true,
  });
  if (setup.status !== 0) throw Error(setup.stderr);
  let processRef: ChildProcessWithoutNullStreams | null = null;
  let log = "";
  async function start() {
    processRef = spawn(
      process.execPath,
      [
        require.resolve("next/dist/bin/next"),
        "start",
        "-H",
        "127.0.0.1",
        "-p",
        String(port),
      ],
      { env, windowsHide: true },
    );
    processRef.stderr.on("data", (b) => (log += b));
    processRef.stdout.on("data", (b) => (log += b));
    for (let n = 0; n < 100; n++) {
      if (processRef.exitCode !== null) throw Error(log);
      try {
        if ((await fetch(url + "/api/me")).status === 401) return;
      } catch {}
      await delay(150);
    }
    throw Error("Сервер не запустился. " + log);
  }
  async function stop() {
    if (!processRef || processRef.exitCode !== null) return;
    const exit = once(processRef, "exit");
    processRef.kill();
    await exit;
    processRef = null;
  }
  const cleanup = async () => {
    await stop();
    await close(provider);
    await rm(dir, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 250,
    });
  };
  try {
    await start();
  } catch (e) {
    await cleanup();
    throw e;
  }
  return {
    url,
    setMode: (value: typeof providerMode) => {
      providerMode = value;
    },
    restart: async () => {
      await stop();
      await start();
    },
    cleanup,
    logs: () => log,
  };
}
export function pdfFixture() {
  const stream = (s: string) => {
    const cmd = "BT /F1 15 Tf 40 730 Td (" + s + ") Tj ET";
    return "<< /Length " + cmd.length + " >>\nstream\n" + cmd + "\nendstream";
  };
  const page = (n: number) =>
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 5 0 R >> >> /Contents " +
    n +
    " 0 R >>";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>",
    page(6),
    page(7),
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    stream("First page introduction."),
    stream(quote),
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const [i, o] of objects.entries()) {
    offsets.push(pdf.length);
    pdf += i + 1 + " 0 obj\n" + o + "\nendobj\n";
  }
  const start = pdf.length;
  pdf +=
    "xref\n0 " +
    offsets.length +
    "\n0000000000 65535 f \n" +
    offsets
      .slice(1)
      .map((n) => String(n).padStart(10, "0") + " 00000 n \n")
      .join("") +
    "trailer\n<< /Size " +
    offsets.length +
    " /Root 1 0 R >>\nstartxref\n" +
    start +
    "\n%%EOF\n";
  return Buffer.from(pdf, "ascii");
}
