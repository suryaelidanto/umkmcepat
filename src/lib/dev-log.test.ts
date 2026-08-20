import {
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { devLog, isDevLoggingActive } from "./dev-log";

// Use a process-unique log file so concurrent fire-and-forget devLog writes
const LOG_FILE = path.join(process.cwd(), `dev.test-${process.pid}.log`);
const ROTATED = `${LOG_FILE}.1`;

function reset() {
  for (const f of [LOG_FILE, ROTATED]) {
    try {
      rmSync(f);
    } catch {
      // ignore
    }
  }
}

describe("devLog", () => {
  beforeEach(() => {
    process.env.DEV_LOG_FILE = LOG_FILE;
    reset();
  });
  afterEach(() => {
    reset();
    delete process.env.DEV_LOG_FILE;
  });

  it("is active when NODE_ENV is not production", () => {
    const orig = process.env.NODE_ENV;
    delete process.env.NODE_ENV;
    expect(isDevLoggingActive()).toBe(true);
    process.env.NODE_ENV = "development";
    expect(isDevLoggingActive()).toBe(true);
    process.env.NODE_ENV = orig;
  });

  it("is inactive in production", () => {
    const orig = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    expect(isDevLoggingActive()).toBe(false);
    process.env.NODE_ENV = orig;
  });

  it("appends a structured line to dev.log in dev", async () => {
    const orig = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    devLog("test-scope", "event", {
      projectId: "p1",
      email: "secret@example.com",
    });
    await new Promise((r) => setTimeout(r, 50));
    const contents = readFileSync(LOG_FILE, "utf8");
    expect(contents).toContain("[umkm:test-scope] event");
    expect(contents).toContain('"projectId":"p1"');
    expect(contents).toContain('"email":"[REDACTED]"');
    expect(contents).not.toContain("secret@example.com");
    process.env.NODE_ENV = orig;
  });

  it("preserves arrays in metadata (edited/issues paths)", async () => {
    const orig = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    devLog("generate", "agent.pass", {
      edited: ["src/routes/index.tsx", "src/content/site.ts"],
      issues: ["home route was not written by the agent"],
      writeOps: 2,
    });
    await new Promise((r) => setTimeout(r, 50));
    const contents = readFileSync(LOG_FILE, "utf8");
    expect(contents).toContain('"src/routes/index.tsx"');
    expect(contents).toContain('"src/content/site.ts"');
    expect(contents).toContain("home route was not written by the agent");
    expect(contents).toContain('"writeOps":2');
    // Broken Object.keys replacer used to serialize arrays as {}
    expect(contents).not.toMatch(/"edited"\s*:\s*\{\}/);
    expect(contents).not.toMatch(/"issues"\s*:\s*\{\}/);
    process.env.NODE_ENV = orig;
  });

  it("does not write in production", async () => {
    const orig = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    // Unique marker so a concurrent async write from another test file (devLog
    const marker = `prod-no-write-${Math.random().toString(36).slice(2)}`;
    devLog("test-scope", marker, { projectId: "p2" });
    await new Promise((r) => setTimeout(r, 50));
    // In production, devLog returns before writeToFile, so the marker must
    let contents = "";
    try {
      contents = readFileSync(LOG_FILE, "utf8");
    } catch {
      // File absent is also fine — the marker is definitely not present.
    }
    expect(contents).not.toContain(marker);
    process.env.NODE_ENV = orig;
  });

  it("rotates dev.log to dev.log.1 at the cap", async () => {
    const orig = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    // Pre-seed a file just under 5MB so the next append triggers rotation.
    mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    writeFileSync(LOG_FILE, "x".repeat(5 * 1024 * 1024 - 10));
    devLog("test-scope", "trigger-rotation", {});
    await new Promise((r) => setTimeout(r, 100));
    expect(statSync(ROTATED).size).toBe(5 * 1024 * 1024 - 10);
    // New dev.log exists and contains the new event.
    const fresh = readFileSync(LOG_FILE, "utf8");
    expect(fresh).toContain("trigger-rotation");
    process.env.NODE_ENV = orig;
  });
});
