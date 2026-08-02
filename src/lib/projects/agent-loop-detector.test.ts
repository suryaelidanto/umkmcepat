import { describe, expect, it } from "vitest";

import { createLoopDetector, createStepTimer } from "./agent-loop-detector";

describe("createLoopDetector", () => {
  it("does not nudge before 3 exact repeats", () => {
    const d = createLoopDetector();
    expect(d.track("read_file", { path: "a.tsx" })).toEqual({ hardCap: false });
    expect(d.track("read_file", { path: "a.tsx" })).toEqual({ hardCap: false });
    expect(d.track("write_file", { path: "b.tsx" })).toEqual({
      hardCap: false,
    });
    // 2 of a.tsx + 1 of b.tsx — no nudge yet.
  });

  it("nudges at 3 exact repeats of (tool, args)", () => {
    const d = createLoopDetector();
    d.track("read_file", { path: "a.tsx" });
    d.track("read_file", { path: "a.tsx" });
    const third = d.track("read_file", { path: "a.tsx" });
    expect(third.nudge).toMatch(/loop/i);
    expect(third.hardCap).toBe(false);
  });

  it("hard-caps at 5 exact repeats", () => {
    const d = createLoopDetector();
    for (let i = 0; i < 4; i++) {
      d.track("read_file", { path: "a.tsx" });
    }
    const fifth = d.track("read_file", { path: "a.tsx" });
    expect(fifth.hardCap).toBe(true);
  });

  it("does not conflate different args", () => {
    const d = createLoopDetector();
    d.track("read_file", { path: "a.tsx" });
    d.track("read_file", { path: "b.tsx" });
    const third = d.track("read_file", { path: "a.tsx" });
    expect(third.nudge).toBeUndefined(); // only 2 of a.tsx
  });

  it("reset() clears counts so prior repeats do not nudge", () => {
    const d = createLoopDetector();
    d.track("read_file", { path: "a.tsx" });
    d.track("read_file", { path: "a.tsx" });
    d.track("read_file", { path: "a.tsx" });
    d.reset();
    // After reset, a single call must not nudge or hard-cap.
    const first = d.track("read_file", { path: "a.tsx" });
    expect(first).toEqual({ hardCap: false });
  });

  it("nudges after consecutive failed replace_in_file", () => {
    const d = createLoopDetector();
    d.noteReplaceFailure();
    const second = d.noteReplaceFailure();
    expect(second.nudge).toMatch(/write_file/i);
    expect(second.hardCap).toBe(false);
  });

  it("hard-caps after three consecutive failed replaces", () => {
    const d = createLoopDetector();
    d.noteReplaceFailure();
    d.noteReplaceFailure();
    const third = d.noteReplaceFailure();
    expect(third.hardCap).toBe(true);
  });

  it("nudges on read storm without writes", () => {
    const d = createLoopDetector();
    for (let i = 0; i < 3; i++) {
      d.track("read_file", { path: `f${i}.tsx` });
    }
    const fourth = d.track("read_file", { path: "f3.tsx" });
    expect(fourth.nudge).toMatch(/without a write|write_file/i);
  });
});

describe("createStepTimer", () => {
  it("measures elapsed wall-clock ms", () => {
    const timer = createStepTimer();
    const span = timer.start();
    expect(typeof span.end()).toBe("number");
    expect(span.end()).toBeGreaterThanOrEqual(0);
  });
});
