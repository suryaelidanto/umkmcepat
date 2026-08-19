import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

import { devLog, isDevLoggingActive } from "@/lib/dev-log";

const LOG_DIR = path.join(process.cwd(), ".data", "tmp", "ai-debug");
const LOG_FILE = path.join(LOG_DIR, "requests.ndjson");

export async function writeAiRequestLog(event: Record<string, unknown>) {
  if (!isDevLoggingActive()) {
    return;
  }

  const entry = {
    timestamp: new Date().toISOString(),
    ...event,
  };
  const scope = String(event.event ?? "event");
  // devLog handles the rotating dev.log mirror; no direct console.warn so the
  // terminal stays quiet during `bun run dev`.
  devLog("ai", scope, entry);

  await mkdir(LOG_DIR, { recursive: true });
  await appendFile(LOG_FILE, `${JSON.stringify(entry)}\n`, "utf8");
}
