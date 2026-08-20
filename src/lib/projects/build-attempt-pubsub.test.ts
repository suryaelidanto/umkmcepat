import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createReadStreamFromChannel,
  publishBuildProgress,
  readBuildProgressState,
  subscribeBuildProgress,
} from "./build-attempt-pubsub";

describe("build-attempt-pubsub", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("returns gone for an unknown attempt", () => {
    expect(readBuildProgressState("build_unknown")).toBe("gone");
  });

  it("keeps channel type as operation when tool payload also has type", () => {
    // Worker used to publish { type: "operation", ...op } where op.type is
    const received: Array<Record<string, unknown>> = [];
    const unsub = subscribeBuildProgress("build_op_type", (event) => {
      received.push(event as Record<string, unknown>);
    });
    publishBuildProgress("build_op_type", {
      type: "operation",
      title: "Menulis file",
      path: "src/routes/index.tsx",
      detail: "File dibuat atau ditimpa oleh agent.",
      // tool command name — must NOT replace channel event type
      tool: "write_file",
      diff: [
        { text: "export function Home()", type: "add" },
        { text: "// starter", type: "delete" },
      ],
      state: "succeeded",
    } as never);
    unsub();
    expect(received).toHaveLength(1);
    expect(received[0]?.type).toBe("operation");
    expect(received[0]?.tool).toBe("write_file");
    expect(received[0]?.diff).toEqual([
      { text: "export function Home()", type: "add" },
      { text: "// starter", type: "delete" },
    ]);
  });

  it("replays buffered events to late subscribers", () => {
    publishBuildProgress("build_a", { type: "progress", label: "spec" });
    publishBuildProgress("build_a", { type: "progress", label: "sources" });

    const events: string[] = [];
    subscribeBuildProgress("build_a", (event) => {
      events.push(String(event.label ?? event.type));
    });

    expect(events).toEqual(["spec", "sources"]);
    expect(readBuildProgressState("build_a")).toBe("live");
  });

  it("removes terminal channels after the grace window", () => {
    publishBuildProgress("build_b", { type: "progress", label: "spec" });
    publishBuildProgress("build_b", { type: "done" });

    expect(readBuildProgressState("build_b")).toBe("live");
    vi.advanceTimersByTime(60_000);
    expect(readBuildProgressState("build_b")).toBe("gone");
  });

  it("replays terminal events inside the grace window", () => {
    publishBuildProgress("build_c", { type: "progress", label: "spec" });
    publishBuildProgress("build_c", { type: "done" });

    const events: string[] = [];
    subscribeBuildProgress("build_c", (event) => events.push(event.type));

    expect(events).toEqual(["progress", "done"]);
  });

  it("unsubscribe stops future deliveries", () => {
    publishBuildProgress("build_d", { type: "progress", label: "spec" });
    const events: string[] = [];
    const unsubscribe = subscribeBuildProgress("build_d", (event) => {
      events.push(String(event.label ?? event.type));
    });

    unsubscribe();
    publishBuildProgress("build_d", { type: "progress", label: "sources" });

    expect(events).toEqual(["spec"]);
  });

  it("stamps a monotonic seq and the attempt id on every event", () => {
    publishBuildProgress("build_seq_stamp", {
      type: "progress",
      label: "spec",
    });
    publishBuildProgress("build_seq_stamp", {
      type: "operation",
      title: "Menulis file",
    });
    publishBuildProgress("build_seq_stamp", { type: "done" });

    const stamped: { attemptId: unknown; seq: unknown }[] = [];
    subscribeBuildProgress("build_seq_stamp", (event) => {
      stamped.push({ attemptId: event.attemptId, seq: event.seq });
    });

    expect(stamped.map((event) => event.seq)).toEqual([0, 1, 2]);
    expect(stamped.map((event) => event.attemptId)).toEqual([
      "build_seq_stamp",
      "build_seq_stamp",
      "build_seq_stamp",
    ]);
  });

  it("replays the same seq values to a late subscriber", () => {
    publishBuildProgress("build_seq_replay", {
      type: "progress",
      label: "spec",
    });
    publishBuildProgress("build_seq_replay", {
      type: "progress",
      label: "sources",
    });

    const seqs: unknown[] = [];
    subscribeBuildProgress("build_seq_replay", (event) => seqs.push(event.seq));

    expect(seqs).toEqual([0, 1]);

    publishBuildProgress("build_seq_replay", {
      type: "progress",
      label: "build",
    });

    expect(seqs).toEqual([0, 1, 2]);
  });

  it("counts seq independently per attempt channel", () => {
    publishBuildProgress("build_seq_one", { type: "progress", label: "spec" });
    publishBuildProgress("build_seq_one", { type: "progress", label: "build" });
    publishBuildProgress("build_seq_two", { type: "progress", label: "spec" });

    const first: unknown[] = [];
    const second: unknown[] = [];
    subscribeBuildProgress("build_seq_one", (event) => first.push(event.seq));
    subscribeBuildProgress("build_seq_two", (event) => second.push(event.seq));

    expect(first).toEqual([0, 1]);
    expect(second).toEqual([0]);
  });

  it("returns an SSE response that closes on terminal", async () => {
    publishBuildProgress("build_e", { type: "progress", label: "spec" });
    const response = createReadStreamFromChannel("build_e");

    expect(response.headers.get("Content-Type")).toBe(
      "text/event-stream; charset=utf-8",
    );

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();

    publishBuildProgress("build_e", { type: "done" });

    const first = await reader.read();
    expect(first.done).toBe(false);
    expect(decoder.decode(first.value)).toContain("event: progress");

    const second = await reader.read();
    expect(second.done).toBe(false);
    expect(decoder.decode(second.value)).toContain("event: done");

    await Promise.resolve();
    const closed = await reader.read();
    expect(closed.done).toBe(true);
  });
});
