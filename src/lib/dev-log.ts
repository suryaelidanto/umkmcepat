import { appendFile, rename, stat } from "node:fs/promises";
import path from "node:path";

const LOG_FILE = path.join(process.cwd(), "dev.log");
const ROTATED_FILE = path.join(process.cwd(), "dev.log.1");
const ROTATE_AT_BYTES = 5 * 1024 * 1024;
let rotating = false;

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
    await appendFile(LOG_FILE, line, "utf8");
  } catch {
    // Best-effort: a logging failure must never break the request.
  }
}

async function maybeRotate(line: string) {
  if (rotating) {
    return;
  }
  let size: number;
  try {
    size = (await stat(LOG_FILE)).size;
  } catch {
    return; // file does not exist yet
  }
  if (size + line.length < ROTATE_AT_BYTES) {
    return;
  }
  rotating = true;
  try {
    await rename(LOG_FILE, ROTATED_FILE); // overwrites prior .1
  } catch {
    // ignore — next write recreates dev.log
  } finally {
    rotating = false;
  }
}

function stableJson(value: Record<string, unknown>) {
  return JSON.stringify(value, Object.keys(value).sort());
}

// Transitional wrapper — removed in Task 2 once ai-request-log migrates.
export function isVerboseDevLoggingEnabled() {
  return isDevLoggingActive();
}
