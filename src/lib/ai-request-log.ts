import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

import { isVerboseDevLoggingEnabled } from "@/lib/dev-log";

const LOG_DIR = path.join(process.cwd(), ".data", "tmp", "ai-debug");
const LOG_FILE = path.join(LOG_DIR, "requests.ndjson");

export async function writeAiRequestLog(event: Record<string, unknown>) {
  if (!isVerboseDevLoggingEnabled()) {
    return;
  }

  const entry = {
    timestamp: new Date().toISOString(),
    ...event,
  };

  console.warn(
    `[umkm:ai] ${String(event.event ?? "event")}`,
    JSON.stringify(entry),
  );

  await mkdir(LOG_DIR, { recursive: true });
  await appendFile(LOG_FILE, `${JSON.stringify(entry)}\n`, "utf8");
}
