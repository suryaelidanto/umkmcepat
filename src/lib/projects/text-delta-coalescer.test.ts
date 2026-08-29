import { describe, expect, it, vi } from "vitest";

import { TextDeltaCoalescer } from "./text-delta-coalescer";

describe("TextDeltaCoalescer", () => {
  it("flushes the first delta immediately with zero delay", () => {
    const flushes: string[] = [];
    const coalescer = new TextDeltaCoalescer((d) => flushes.push(d));

    coalescer.push("Halo");
    expect(flushes).toEqual(["Halo"]);
  });

  it("coalesces subsequent small deltas within the time interval", async () => {
    vi.useFakeTimers();
    const flushes: string[] = [];
    const coalescer = new TextDeltaCoalescer((d) => flushes.push(d), {
      intervalMs: 24,
    });

    coalescer.push("Halo");
    expect(flushes).toEqual(["Halo"]);

    coalescer.push(" k");
    coalescer.push("am");
    coalescer.push("u");
    expect(flushes).toEqual(["Halo"]);

    vi.advanceTimersByTime(25);
    expect(flushes).toEqual(["Halo", " kamu"]);

    vi.useRealTimers();
  });

  it("forces flush immediately on flush() call", () => {
    const flushes: string[] = [];
    const coalescer = new TextDeltaCoalescer((d) => flushes.push(d));

    coalescer.push("First");
    coalescer.push(" Second");
    expect(flushes).toEqual(["First"]);

    coalescer.flush();
    expect(flushes).toEqual(["First", " Second"]);
  });
});
