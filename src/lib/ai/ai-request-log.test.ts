import { existsSync, rmSync, readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { writeAiRequestLog } from "./ai-request-log";

const DEV_LOG = path.join(process.cwd(), "dev.log");
const NDJSON = path.join(
  process.cwd(),
  ".data",
  "tmp",
  "ai-debug",
  "requests.ndjson",
);

function reset() {
  for (const f of [DEV_LOG, NDJSON]) {
    try {
      rmSync(f);
    } catch {
      /* ignore */
    }
  }
}

describe("writeAiRequestLog", () => {
  beforeEach(reset);
  afterEach(reset);

  it("writes to dev.log and requests.ndjson in dev", async () => {
    const orig = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    await writeAiRequestLog({ event: "test-evt", projectId: "p9" });
    // devLog writes are async (fire-and-forget); wait for the sink to flush.
    await new Promise((r) => setTimeout(r, 100));
    const dev = readFileSync(DEV_LOG, "utf8");
    const nd = readFileSync(NDJSON, "utf8");
    expect(dev).toContain("test-evt");
    expect(nd).toContain('"event":"test-evt"');
    process.env.NODE_ENV = orig;
  });

  it("no-ops in production", async () => {
    const orig = process.env.NODE_ENV;
    const origLogFile = process.env.DEV_LOG_FILE;
    // Point the log at a private path so concurrent parallel tests writing to
    // the shared dev.log can't recreate it between our rmSync and assertion.
    const isolated = path.join(
      process.cwd(),
      `.data/tmp/ai-debug/test-prod-noop-${process.pid}.log`,
    );
    process.env.NODE_ENV = "production";
    process.env.DEV_LOG_FILE = isolated;

    if (existsSync(isolated)) {
      rmSync(isolated);
    }

    await writeAiRequestLog({ event: "prod-evt" });

    // In production, the log file should not be created.
    // (If it was created, readFileSync succeeds and the test fails).
    expect(() => readFileSync(isolated, "utf8")).toThrow();

    if (existsSync(isolated)) {
      rmSync(isolated);
    }
    process.env.NODE_ENV = orig;
    process.env.DEV_LOG_FILE = origLogFile;
  });
});
