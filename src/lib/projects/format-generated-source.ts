import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";

import { devLog } from "@/lib/dev-log";

const FORMAT_TIMEOUT_MS = 30_000;

export async function formatGeneratedSource(
  sourceDir: string,
): Promise<{ failed: boolean; formatted: number }> {
  try {
    await mkdir(sourceDir, { recursive: true });
  } catch {
    return { failed: true, formatted: 0 };
  }

  return new Promise((resolve) => {
    const child = spawn(
      "bunx",
      [
        "prettier",
        "--write",
        "--cache",
        "--cache-location",
        `${sourceDir}/.prettiercache`,
        "**/*.{ts,tsx,js,jsx,css,json,md}",
      ],
      { cwd: sourceDir, shell: false },
    );

    let stdout = "";
    child.stdout?.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr?.on("data", (d) => {
      stdout += d.toString();
    });

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      devLog("generate", "prettier-timeout", { sourceDir });
      resolve({ failed: true, formatted: 0 });
    }, FORMAT_TIMEOUT_MS);

    child.on("error", (error) => {
      clearTimeout(timer);
      devLog("generate", "prettier-error", { error: String(error) });
      resolve({ failed: true, formatted: 0 });
    });

    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        devLog("generate", "prettier-failed", { code, sourceDir });
        return resolve({ failed: true, formatted: 0 });
      }
      const formatted = (stdout.match(/ms$/gm) ?? []).length;
      resolve({ failed: false, formatted });
    });
  });
}
