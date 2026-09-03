import { describe, expect, it } from "vitest";

import { HOW_IT_WORKS_STEPS, nextHowItWorksIndex } from "./how-it-works-data";

describe("how it works data", () => {
  it("keeps the user journey as three ordered visual steps", () => {
    expect(HOW_IT_WORKS_STEPS.map((step) => step.id)).toEqual([
      "describe",
      "generate",
      "share",
    ]);
    expect(HOW_IT_WORKS_STEPS.every((step) => step.imageSrc.length > 0)).toBe(
      true,
    );
  });

  it("wraps the selected step index without producing an invalid index", () => {
    expect(nextHowItWorksIndex(0, 3)).toBe(1);
    expect(nextHowItWorksIndex(2, 3)).toBe(0);
    expect(nextHowItWorksIndex(-1, 3)).toBe(0);
    expect(nextHowItWorksIndex(0, 0)).toBe(0);
  });
});
