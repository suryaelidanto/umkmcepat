import { describe, expect, it } from "vitest";

import { HOW_IT_WORKS_STEPS } from "./how-it-works-data";

describe("HowItWorksSection", () => {
  it("keeps each visible step connected to supplied visual assets", () => {
    expect(HOW_IT_WORKS_STEPS).toHaveLength(3);
    expect(
      HOW_IT_WORKS_STEPS.every(
        (step) => step.title.length > 0 && step.imageSrc.length > 0,
      ),
    ).toBe(true);
  });
});
