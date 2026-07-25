import { spawn } from "node:child_process";

import { getEnv } from "@/lib/config";
import { devLog } from "@/lib/dev-log";

const CAPTURE_TIMEOUT_MS = 15_000;

// Spawns the capture-runtime-errors.cjs headless-browser script against a URL,
// returns the console-error strings. Empty array = no runtime errors.
export async function captureRuntimeErrors(url: string): Promise<string[]> {
  const browserPath = getEnv("PROJECT_THUMBNAIL_BROWSER_PATH");
  const nodePath = getEnv("PROJECT_THUMBNAIL_NODE_PATH") || "node";
  const scriptPath = new URL(
    "../../../scripts/capture-runtime-errors.cjs",
    import.meta.url,
  ).pathname;

  return new Promise((resolve) => {
    const child = spawn(
      nodePath,
      [scriptPath, url, browserPath, String(CAPTURE_TIMEOUT_MS)],
      {
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    let stdout = "";
    child.stdout?.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr?.on("data", (d) => {
      process.stderr.write(d);
    });

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      devLog("runtime-self-heal", "capture-timeout", { url });
      resolve([]);
    }, CAPTURE_TIMEOUT_MS + 5_000);

    child.on("error", (error) => {
      clearTimeout(timer);
      devLog("runtime-self-heal", "capture-error", { error: String(error) });
      resolve([]);
    });

    child.on("exit", () => {
      clearTimeout(timer);
      try {
        const parsed = JSON.parse(stdout);
        resolve(Array.isArray(parsed) ? parsed : []);
      } catch {
        resolve([]);
      }
    });
  });
}
