import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCheckFingerprint, runCachedCheck } from "./check-cache";

let cacheDirectory: string;
let projectDirectory: string;

beforeEach(async () => {
  cacheDirectory = await mkdtemp(path.join(os.tmpdir(), "umkm-check-cache-"));
  projectDirectory = await mkdtemp(
    path.join(os.tmpdir(), "umkm-check-project-"),
  );
});

afterEach(async () => {
  await Promise.all([
    rm(cacheDirectory, { force: true, recursive: true }),
    rm(projectDirectory, { force: true, recursive: true }),
  ]);
});

describe("createCheckFingerprint", () => {
  it("changes when an input file changes", async () => {
    await writeFile(
      path.join(projectDirectory, "source.ts"),
      "export const value = 1;",
      "utf8",
    );

    const first = createCheckFingerprint(
      "typecheck",
      ["bun", "run", "typecheck"],
      [{ path: ".", extensions: [".ts"] }],
      projectDirectory,
    );

    await writeFile(
      path.join(projectDirectory, "source.ts"),
      "export const value = 2;",
      "utf8",
    );

    const second = createCheckFingerprint(
      "typecheck",
      ["bun", "run", "typecheck"],
      [{ path: ".", extensions: [".ts"] }],
      projectDirectory,
    );

    expect(second).not.toBe(first);
  });
});

describe("runCachedCheck", () => {
  it("reuses a successful result for the same task fingerprint", async () => {
    let runs = 0;
    const run = async () => {
      runs += 1;
      return { ok: true, output: "passed" };
    };

    const first = await runCachedCheck({
      cacheDirectory,
      fingerprint: "fingerprint-a",
      run,
      task: "lint",
    });
    const second = await runCachedCheck({
      cacheDirectory,
      fingerprint: "fingerprint-a",
      run,
      task: "lint",
    });

    expect(first).toMatchObject({ cached: false, ok: true });
    expect(second).toMatchObject({ cached: true, ok: true });
    expect(runs).toBe(1);
  });

  it("does not cache a failed result", async () => {
    let runs = 0;
    const run = async () => {
      runs += 1;
      return { ok: runs > 1, output: runs === 1 ? "failed" : "passed" };
    };

    const first = await runCachedCheck({
      cacheDirectory,
      fingerprint: "fingerprint-a",
      run,
      task: "typecheck",
    });
    const second = await runCachedCheck({
      cacheDirectory,
      fingerprint: "fingerprint-a",
      run,
      task: "typecheck",
    });

    expect(first).toMatchObject({ cached: false, ok: false });
    expect(second).toMatchObject({ cached: false, ok: true });
    expect(runs).toBe(2);
  });

  it("bypasses cached results when caching is disabled", async () => {
    let runs = 0;
    const run = async () => {
      runs += 1;
      return { ok: true, output: "passed" };
    };

    await runCachedCheck({
      cacheDirectory,
      fingerprint: "fingerprint-a",
      run,
      task: "docs",
    });
    const uncached = await runCachedCheck({
      cacheDirectory,
      fingerprint: "fingerprint-a",
      run,
      task: "docs",
      useCache: false,
    });

    expect(uncached).toMatchObject({ cached: false, ok: true });
    expect(runs).toBe(2);
  });

  it("reruns a task when its fingerprint changes", async () => {
    let runs = 0;
    const run = async () => {
      runs += 1;
      return { ok: true, output: "passed" };
    };

    await runCachedCheck({
      cacheDirectory,
      fingerprint: "fingerprint-a",
      run,
      task: "test",
    });
    const changed = await runCachedCheck({
      cacheDirectory,
      fingerprint: "fingerprint-b",
      run,
      task: "test",
    });

    expect(changed).toMatchObject({ cached: false, ok: true });
    expect(runs).toBe(2);
  });
});
