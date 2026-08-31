import { mkdtemp, lstat, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ensureSharedNodeModules,
  linkSharedNodeModules,
} from "./shared-node-modules";

let tempDir = "";

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { force: true, recursive: true });
    tempDir = "";
  }
});

// A successful install runner leaves a node_modules directory behind, same as
function mockInstallRunner() {
  return vi.fn(async (cwd: string) => {
    await mkdir(path.join(cwd, "node_modules"), { recursive: true });
    return { ok: true as const, log: "" };
  });
}

describe("shared node_modules", () => {
  it("provisions once + reuses on the second call (signature stable)", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "umkmcepat-shared-nm-"));
    const install = mockInstallRunner();
    const a = await ensureSharedNodeModules(tempDir, "sig1", {
      installRunner: install,
    });
    const b = await ensureSharedNodeModules(tempDir, "sig1", {
      installRunner: install,
    });
    expect(install).toHaveBeenCalledTimes(1);
    expect(b).toBe(a);
  });

  it("re-provisions when the signature changes", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "umkmcepat-shared-nm-"));
    const install = mockInstallRunner();
    await ensureSharedNodeModules(tempDir, "sig1", {
      installRunner: install,
    });
    await ensureSharedNodeModules(tempDir, "sig2", {
      installRunner: install,
    });
    expect(install).toHaveBeenCalledTimes(2);
  });

  it("keeps per-signature installs so alternating manifests never thrash", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "umkmcepat-shared-nm-"));
    const install = mockInstallRunner();
    const first = await ensureSharedNodeModules(tempDir, "sigA", {
      installRunner: install,
    });
    const second = await ensureSharedNodeModules(tempDir, "sigB", {
      installRunner: install,
    });
    const firstAgain = await ensureSharedNodeModules(tempDir, "sigA", {
      installRunner: install,
    });
    expect(install).toHaveBeenCalledTimes(2);
    expect(firstAgain).toBe(first);
    expect(second).not.toBe(first);
    expect(first.startsWith(path.join(tempDir, "_shared"))).toBe(true);
    expect(second.startsWith(path.join(tempDir, "_shared"))).toBe(true);
  });

  it("links the golden node_modules into a workspace (symlink or junction)", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "umkmcepat-shared-nm-"));
    const shared = await ensureSharedNodeModules(tempDir, "sig1", {
      installRunner: mockInstallRunner(),
    });
    const workspace = path.join(tempDir, "ws");
    await mkdir(workspace, { recursive: true });
    const linked = await linkSharedNodeModules(workspace, shared);
    expect(linked).toBe(true);
    const nm = await lstat(path.join(workspace, "node_modules"));
    // Windows junction reports as a reparse point; accept dir or symlink.
    expect(nm.isSymbolicLink() || nm.isDirectory()).toBe(true);
  });

  it("returns false (caller falls back to install) when linking fails", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "umkmcepat-shared-nm-"));
    const linked = await linkSharedNodeModules(
      tempDir,
      path.join(tempDir, "nonexistent", "golden", "path"),
    );
    expect(linked).toBe(false);
  });
});
