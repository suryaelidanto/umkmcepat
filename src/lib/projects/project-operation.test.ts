import { describe, expect, it, vi } from "vitest";

import {
  claimProjectOperation,
  finalizeProjectOperation,
  renewProjectOperation,
} from "@/lib/projects/project-operation";

describe("project operation lease", () => {
  it("claims a project with an expiring fencing token", async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const result = await claimProjectOperation({
      kind: "edit",
      now: new Date("2026-07-10T01:00:00.000Z"),
      projectId: "project_1",
      store: { project: { updateMany } },
      ttlMs: 60_000,
      userId: "user_1",
    });

    expect(result.claimed).toBe(true);
    expect(result.token).toMatch(/^op_/);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          activeOperationExpiresAt: new Date("2026-07-10T01:01:00.000Z"),
          activeOperationKind: "edit",
          activeOperationToken: result.token,
          buildStatus: "running",
          status: "building",
        }),
      }),
    );
  });

  it("renews only a live lease owned by the current fencing token", async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const now = new Date("2026-07-10T01:00:00.000Z");

    await expect(
      renewProjectOperation({
        now,
        projectId: "project_1",
        store: { project: { updateMany } },
        token: "op_current",
        ttlMs: 60_000,
        userId: "user_1",
      }),
    ).resolves.toBe(true);
    expect(updateMany).toHaveBeenCalledWith({
      data: {
        activeOperationExpiresAt: new Date("2026-07-10T01:01:00.000Z"),
      },
      where: {
        activeOperationExpiresAt: { gt: now },
        activeOperationToken: "op_current",
        id: "project_1",
        userId: "user_1",
      },
    });
  });

  it("allows only the current fencing token to finalize and clear a claim", async () => {
    const updateMany = vi
      .fn()
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });
    const store = { project: { updateMany } };

    await expect(
      finalizeProjectOperation({
        data: { buildStatus: "passed", status: "ready" },
        projectId: "project_1",
        store,
        token: "op_old",
        userId: "user_1",
      }),
    ).resolves.toBe(false);
    await expect(
      finalizeProjectOperation({
        data: { buildStatus: "passed", status: "ready" },
        projectId: "project_1",
        store,
        token: "op_current",
        userId: "user_1",
      }),
    ).resolves.toBe(true);
    expect(updateMany).toHaveBeenLastCalledWith({
      data: {
        activeOperationExpiresAt: null,
        activeOperationKind: null,
        activeOperationToken: null,
        buildStatus: "passed",
        status: "ready",
      },
      where: {
        activeOperationToken: "op_current",
        id: "project_1",
        userId: "user_1",
      },
    });
  });

  it("returns claimed false when no row is updated", async () => {
    const updateMany = vi.fn(async () => ({ count: 0 }));
    const result = await claimProjectOperation({
      kind: "build",
      now: new Date("2026-07-10T01:00:00.000Z"),
      projectId: "project_1",
      store: { project: { updateMany } },
      userId: "user_1",
    });

    expect(result.claimed).toBe(false);
    expect(result.token).toMatch(/^op_/);
  });

  it("refuses renew when the fencing token is wrong", async () => {
    const updateMany = vi.fn(async () => ({ count: 0 }));
    await expect(
      renewProjectOperation({
        now: new Date("2026-07-10T01:00:00.000Z"),
        projectId: "project_1",
        store: { project: { updateMany } },
        token: "op_wrong",
        userId: "user_1",
      }),
    ).resolves.toBe(false);
  });
});
