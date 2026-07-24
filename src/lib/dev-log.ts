import { appendFile, rename, stat } from "node:fs/promises";
import path from "node:path";

const ROTATE_AT_BYTES = 5 * 1024 * 1024;
let rotating = false;

/**
 * Resolve the log file lazily so tests can isolate from concurrent writers by
 * setting DEV_LOG_FILE to a unique path. Defaults to ./dev.log (production).
 * Read at call time (not module load) so env changes in tests take effect.
 */
function logFile(): string {
  const name = process.env.DEV_LOG_FILE || "dev.log";
  return path.isAbsolute(name) ? name : path.join(process.cwd(), name);
}

function rotatedFile(): string {
  const name = process.env.DEV_LOG_FILE || "dev.log";
  const base = path.isAbsolute(name) ? name : path.join(process.cwd(), name);
  return `${base}.1`;
}

export function isDevLoggingActive() {
  return process.env.NODE_ENV !== "production";
}

export function devLog(
  scope: string,
  event: string,
  metadata?: Record<string, unknown>,
) {
  if (!isDevLoggingActive()) {
    return;
  }

  const suffix = metadata ? ` ${stableJson(metadata)}` : "";
  const line = `[umkm:${scope}] ${event}${suffix}\n`;
  void writeToFile(line);
}

async function writeToFile(line: string) {
  try {
    await maybeRotate(line);
    await appendFile(logFile(), line, "utf8");
  } catch {
    // Best-effort: a logging failure must never break the request.
  }
}

async function maybeRotate(line: string) {
  if (rotating) {
    return;
  }
  const file = logFile();
  let size: number;
  try {
    size = (await stat(file)).size;
  } catch {
    return; // file does not exist yet
  }
  if (size + line.length < ROTATE_AT_BYTES) {
    return;
  }
  rotating = true;
  try {
    await rename(file, rotatedFile()); // overwrites prior .1
  } catch {
    // ignore — next write recreates the log file
  } finally {
    rotating = false;
  }
}

function stableJson(value: Record<string, unknown>) {
  return JSON.stringify(value, Object.keys(value).sort());
}
