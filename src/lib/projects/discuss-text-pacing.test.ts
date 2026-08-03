import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DISCUSS_TEXT_PACE_MS,
  publishPacedTextDeltas,
  splitTextForDisplayPacing,
} from "./discuss-text-pacing";

describe("splitTextForDisplayPacing", () => {
  it("keeps short text as one piece", () => {
    expect(splitTextForDisplayPacing("Halo")).toEqual(["Halo"]);
  });

  it("splits long prose into word pieces", () => {
    const pieces = splitTextForDisplayPacing(
      "Oke, siap bantu bikin halaman jualan sayur!",
    );
    expect(pieces.length).toBeGreaterThan(1);
    expect(pieces.join("")).toBe("Oke, siap bantu bikin halaman jualan sayur!");
  });
});

describe("publishPacedTextDeltas", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("publishes word chunks over time, not one dump", async () => {
    vi.useFakeTimers();
    const published: string[] = [];
    const done = publishPacedTextDeltas({
      text: "Oke, siap bantu bikin halaman!",
      publish: (delta) => {
        published.push(delta);
      },
      delayMs: DISCUSS_TEXT_PACE_MS,
    });

    expect(published.length).toBe(1);
    await vi.advanceTimersByTimeAsync(DISCUSS_TEXT_PACE_MS * 20);
    await done;
    expect(published.length).toBeGreaterThan(1);
    expect(published.join("")).toBe("Oke, siap bantu bikin halaman!");
  });
});
