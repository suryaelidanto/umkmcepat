import { describe, expect, it } from "vitest";

import {
  publishProgress,
  replayProgressAfter,
  subscribeProgress,
  readTurnState,
} from "./discuss-turn-pubsub";

describe("discuss-turn pub/sub", () => {
  it("delivers published events to a live subscriber", () => {
    const received: unknown[] = [];
    const unsub = subscribeProgress("t1", (e) => received.push(e));
    publishProgress("t1", { type: "text-delta", delta: "hi" });
    publishProgress("t1", { type: "finish" });
    unsub();
    expect(received).toHaveLength(2);
  });

  it("buffers events before a subscriber attaches (replay on subscribe)", () => {
    publishProgress("t2", { type: "text-delta", delta: "early" });
    const received: unknown[] = [];
    subscribeProgress("t2", (e) => received.push(e));
    expect(received).toHaveLength(1);
  });

  it("readTurnState returns 'live' when a channel exists, 'gone' otherwise", () => {
    publishProgress("t3", { type: "text-delta", delta: "x" });
    expect(readTurnState("t3")).toBe("live");
    expect(readTurnState("nope")).toBe("gone");
  });

  it("unsubscribe stops delivery", () => {
    const received: unknown[] = [];
    const unsub = subscribeProgress("t4", (e) => received.push(e));
    publishProgress("t4", { type: "finish" });
    unsub();
    publishProgress("t4", { type: "text-delta", delta: "after" });
    expect(received).toHaveLength(1);
  });

  it("stamps monotonic sequence values and replays after a cursor", () => {
    publishProgress("t5", { type: "text-delta", delta: "a" });
    publishProgress("t5", { type: "text-delta", delta: "b" });
    publishProgress("t5", { type: "finish" });

    const received: unknown[] = [];
    subscribeProgress("t5", (event) => received.push(event));

    expect(
      received.map((event) => (event as { sequence?: number }).sequence),
    ).toEqual([0, 1, 2]);
    expect(replayProgressAfter("t5", 0).map((event) => event.sequence)).toEqual(
      [1, 2],
    );
  });
});
