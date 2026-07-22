import { describe, expect, it } from "vitest";

import { createLoopDetector } from "./agent-loop-detector";

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
});
