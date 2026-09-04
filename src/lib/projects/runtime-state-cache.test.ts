import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  clearRuntimeStateCache,
  invalidateProjectRuntimeStateCache,
  readRuntimeStateCache,
  writeRuntimeStateCache,
} from "./runtime-state-cache";

describe("runtime-state-cache", () => {
  beforeEach(() => {
    clearRuntimeStateCache();
  });

  afterEach(() => {
    clearRuntimeStateCache();
  });

  it("stores and retrieves cached runtime state for the correct user and project", () => {
    const body = { id: "p1", status: "ready" };
    writeRuntimeStateCache("u1", "p1", body);

    const cached = readRuntimeStateCache("u1", "p1");
    expect(cached).not.toBeNull();
    expect(cached?.body).toEqual(body);
    expect(cached?.userId).toBe("u1");
    expect(cached?.projectId).toBe("p1");

    // Different user cannot read cache
    expect(readRuntimeStateCache("u2", "p1")).toBeNull();
    // Different project cannot read cache
    expect(readRuntimeStateCache("u1", "p2")).toBeNull();
  });

  it("strips logText from cached body to prevent memory leaks", () => {
    const body = { id: "p1", logText: "secret-or-huge-log", status: "ready" };
    writeRuntimeStateCache("u1", "p1", body);

    const cached = readRuntimeStateCache("u1", "p1");
    expect(cached?.body).toEqual({ id: "p1", status: "ready" });
  });

  it("invalidates cached entries by projectId", () => {
    writeRuntimeStateCache("u1", "p1", { id: "p1" });
    writeRuntimeStateCache("u1", "p2", { id: "p2" });

    invalidateProjectRuntimeStateCache("p1");

    expect(readRuntimeStateCache("u1", "p1")).toBeNull();
    expect(readRuntimeStateCache("u1", "p2")).not.toBeNull();
  });
});
