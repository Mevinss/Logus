import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const edge =
  process.platform === "win32" &&
  existsSync(
    join(
      process.env["ProgramFiles(x86)"] || "C:/Program Files (x86)",
      "Microsoft/Edge/Application/msedge.exe",
    ),
  );
export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  workers: 1,
  timeout: 120_000,
  outputDir: join(tmpdir(), "logus-playwright-artifacts"),
  use: { channel: edge ? "msedge" : undefined, trace: "retain-on-failure" },
  reporter: "list",
});
