import { describe, expect, it, vi } from "vitest";

import {
  __setDiscussProgressBackendForTests,
  publishProgress,
} from "./discuss-turn-pubsub";
import { runDiscussProgressTail } from "./discuss-turn-sse-tail";

describe("runDiscussProgressTail", () => {
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
});
