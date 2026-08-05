import { afterEach, describe, expect, it, vi } from "vitest";

import {
  __setDiscussProgressBackendForTests,
  publishProgress,
} from "./discuss-turn-pubsub";
import { runDiscussProgressTail } from "./discuss-turn-sse-tail";

describe("runDiscussProgressTail", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves via DB succeeded when no live publish", async () => {
    __setDiscussProgressBackendForTests({
      publish() {},
      subscribe() {
        return () => {};
      },
    });
    try {
      const events: string[] = [];
      let status: "running" | "succeeded" = "running";
      const done = runDiscussProgressTail({
        turnId: "t-db-ok",
        write: (e) => events.push(String(e.type)),
        pollIntervalMs: 15,
        hardCeilingMs: 2_000,
        isTerminalDb: async () =>
          status === "succeeded" ? { kind: "succeeded" } : { kind: "running" },
      });
      await new Promise((r) => setTimeout(r, 20));
      status = "succeeded";
      await done;
      expect(events).toContain("finish");
    } finally {
      __setDiscussProgressBackendForTests(null);
    }
  });

  it("resolves via live finish without waiting for DB", async () => {
    const events: string[] = [];
    const isTerminalDb = vi.fn(async () => ({ kind: "running" as const }));
    const done = runDiscussProgressTail({
      turnId: "t-live",
      write: (e) => events.push(String(e.type)),
      pollIntervalMs: 500,
      hardCeilingMs: 5_000,
      isTerminalDb,
    });
    publishProgress("t-live", { type: "text-delta", id: "x", delta: "a" });
    publishProgress("t-live", { type: "finish" });
    await done;
    expect(events).toContain("text-delta");
    expect(events).toContain("finish");
  });

  it("writes error when DB reports failed", async () => {
    __setDiscussProgressBackendForTests({
      publish() {},
      subscribe() {
        return () => {};
      },
    });
    try {
      const events: Array<{ type: string; errorText?: string }> = [];
      let status: "running" | "failed" = "running";
      const done = runDiscussProgressTail({
        turnId: "t-db-fail",
        write: (e) =>
          events.push({
            type: String(e.type),
            errorText:
              typeof e.errorText === "string" ? e.errorText : undefined,
          }),
        pollIntervalMs: 15,
        hardCeilingMs: 2_000,
        isTerminalDb: async () =>
          status === "failed"
            ? { kind: "failed", errorText: "Gagal." }
            : { kind: "running" },
      });
      await new Promise((r) => setTimeout(r, 20));
      status = "failed";
      await done;
      expect(
        events.some((e) => e.type === "error" && e.errorText === "Gagal."),
      ).toBe(true);
    } finally {
      __setDiscussProgressBackendForTests(null);
    }
  });

  it("writes heartbeat events and comments while the turn is still running", async () => {
    vi.useFakeTimers();
    let subscriber: (event: { type: string }) => void = () => {};
    __setDiscussProgressBackendForTests({
      publish() {},
      subscribe(_turnId, onEvent) {
        subscriber = onEvent;
        return () => {};
      },
    });
    try {
      const events: string[] = [];
      const comments: string[] = [];
      const done = runDiscussProgressTail({
        turnId: "t-heartbeat",
        write: (e) => events.push(String(e.type)),
        writeComment: (comment) => comments.push(comment),
        pollIntervalMs: 10_000,
        heartbeatIntervalMs: 25,
        hardCeilingMs: 10_000,
        isTerminalDb: async () => ({ kind: "running" }),
      });

      await vi.advanceTimersByTimeAsync(30);

      expect(events).toContain("heartbeat");
      expect(comments).toContain("ping");

      subscriber({ type: "finish" });
      await done;
      const heartbeatCount = events.filter(
        (event) => event === "heartbeat",
      ).length;

      await vi.advanceTimersByTimeAsync(30);
      expect(events.filter((event) => event === "heartbeat")).toHaveLength(
        heartbeatCount,
      );
    } finally {
      __setDiscussProgressBackendForTests(null);
    }
  });
});
