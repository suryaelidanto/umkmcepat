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
