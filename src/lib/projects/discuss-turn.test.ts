import { afterEach, describe, expect, it, vi } from "vitest";

import {
  claimDiscussTurn,
  finalizeDiscussTurn,
  getActiveDiscussTurn,
  releaseDiscussTurn,
} from "@/lib/projects/discuss-turn";

function makeStore() {
  const projectChatTurn = {
    create: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
  };
  const store = {
    projectChatTurn,
    $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
      cb(store),
    ),
  };
  return store;
}

describe("discuss turn lease", () => {
  afterEach(() => vi.clearAllMocks());

  it("claims a turn when none is running", async () => {
    const store = makeStore();
    store.projectChatTurn.findFirst
      .mockResolvedValueOnce(null) // expired scan
      .mockResolvedValueOnce(null); // running scan
    const r = await claimDiscussTurn({
      projectId: "p1",
      userId: "u1",
      userMessageId: "m1",
      now: new Date("2026-07-10T01:00:00.000Z"),
      store: store as never,
    });
    expect(r.claimed).toBe(true);
    expect(r.turnId).toMatch(/^ct_/);
    expect(store.projectChatTurn.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          projectId: "p1",
          userMessageId: "m1",
          status: "running",
        }),
      }),
    );
  });

  it("rejects a second claim while one is running", async () => {
    const store = makeStore();
    store.projectChatTurn.findFirst
      .mockResolvedValueOnce(null) // expired scan
      .mockResolvedValueOnce({ id: "ct_running" }); // existing running turn
    const r = await claimDiscussTurn({
      projectId: "p1",
      userId: "u1",
      userMessageId: "m2",
      store: store as never,
    });
    expect(r.claimed).toBe(false);
    expect(r.turnId).toBeNull();
    expect(store.projectChatTurn.create).not.toHaveBeenCalled();
  });

  it("re-claims after the running turn expires and finalizes the expired one", async () => {
    const store = makeStore();
    store.projectChatTurn.findFirst
      .mockResolvedValueOnce({ id: "ct_expired" }) // expired scan hits
      .mockResolvedValueOnce(null); // running scan after finalize
    const r = await claimDiscussTurn({
      projectId: "p1",
      userId: "u1",
      userMessageId: "m2",
      now: new Date("2026-07-10T01:00:00.000Z"),
      store: store as never,
    });
    expect(r.claimed).toBe(true);
    // Expired turn finalized as failed.
    expect(store.projectChatTurn.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ct_expired" },
        data: expect.objectContaining({
          status: "failed",
          errorMessage: "expired",
        }),
      }),
    );
  });

  it("finalizeDiscussTurn marks the turn done with finishedAt", async () => {
    const store = makeStore();
    const now = new Date("2026-07-10T01:05:00.000Z");
    await finalizeDiscussTurn({
      turnId: "ct_1",
      status: "succeeded",
      now,
      store: store as never,
    });
    expect(store.projectChatTurn.update).toHaveBeenCalledWith({
      where: { id: "ct_1" },
      data: { status: "succeeded", finishedAt: now, errorMessage: null },
    });
  });

  it("releaseDiscussTurn routes through finalizeDiscussTurn as cancelled", async () => {
    const store = makeStore();
    const now = new Date("2026-07-10T01:05:00.000Z");
    await releaseDiscussTurn({ turnId: "ct_1", now, store: store as never });
    expect(store.projectChatTurn.update).toHaveBeenCalledWith({
      where: { id: "ct_1" },
      data: { status: "cancelled", finishedAt: now, errorMessage: null },
    });
  });

  it("getActiveDiscussTurn returns the running turn when live", async () => {
    const store = makeStore();
    const now = new Date("2026-07-10T01:00:00.000Z");
    const running = {
      id: "ct_live",
      projectId: "p1",
      status: "running",
      expiresAt: new Date("2026-07-10T01:10:00.000Z"),
    };
    store.projectChatTurn.findFirst.mockResolvedValueOnce(running);
    const r = await getActiveDiscussTurn({
      projectId: "p1",
      now,
      store: store as never,
    });
    expect(r).toEqual(running);
    expect(store.projectChatTurn.update).not.toHaveBeenCalled();
  });

  it("getActiveDiscussTurn expires + returns null when past TTL", async () => {
    const store = makeStore();
    const now = new Date("2026-07-10T01:00:00.000Z");
    const running = {
      id: "ct_stale",
      projectId: "p1",
      status: "running",
      expiresAt: new Date("2026-07-10T00:55:00.000Z"),
    };
    store.projectChatTurn.findFirst.mockResolvedValueOnce(running);
    const r = await getActiveDiscussTurn({
      projectId: "p1",
      now,
      store: store as never,
    });
    expect(r).toBeNull();
    expect(store.projectChatTurn.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ct_stale" },
        data: expect.objectContaining({ status: "failed" }),
      }),
    );
  });
});
