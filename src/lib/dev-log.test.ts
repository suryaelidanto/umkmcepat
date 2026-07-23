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

const LOG_FILE = path.join(process.cwd(), "dev.log");
const ROTATED = path.join(process.cwd(), "dev.log.1");

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
  beforeEach(reset);
  afterEach(reset);

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
    devLog("test-scope", "event", { projectId: "p1" });
    await new Promise((r) => setTimeout(r, 50));
    const contents = readFileSync(LOG_FILE, "utf8");
    expect(contents).toContain("[umkm:test-scope] event");
    expect(contents).toContain('"projectId":"p1"');
    process.env.NODE_ENV = orig;
  });

  it("does not write in production", async () => {
    const orig = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    devLog("test-scope", "event", { projectId: "p2" });
    await new Promise((r) => setTimeout(r, 50));
    expect(() => readFileSync(LOG_FILE, "utf8")).toThrow();
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
    expect(statSync(ROTATED).size).toBeGreaterThan(0);
    // New dev.log exists and contains the new event.
    const fresh = readFileSync(LOG_FILE, "utf8");
    expect(fresh).toContain("trigger-rotation");
    process.env.NODE_ENV = orig;
  });
});
