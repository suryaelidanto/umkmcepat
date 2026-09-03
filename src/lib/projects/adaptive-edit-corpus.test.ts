import { describe, expect, it } from "vitest";

import {
  ADAPTIVE_EDIT_DIMENSIONS,
  ADAPTIVE_EDIT_SCENARIOS,
  type AdaptiveEditDimension,
} from "./adaptive-edit-corpus";

const requiredTags = [
  "add_section",
  "remove_section",
  "reorder_layout",
  "uploaded_photo",
  "premium_redesign",
  "palette_only",
  "explicit_full_rebuild",
] as const;

describe("adaptive edit corpus", () => {
  it("contains exactly 15 scenarios with enough coverage for each edit dimension", () => {
    expect(ADAPTIVE_EDIT_SCENARIOS).toHaveLength(15);

    for (const dimension of ADAPTIVE_EDIT_DIMENSIONS) {
      const count = ADAPTIVE_EDIT_SCENARIOS.filter((scenario) =>
        scenario.dimensions.includes(dimension),
      ).length;
      expect(count, dimension).toBeGreaterThanOrEqual(2);
    }
  });

  it("covers the major user-requested edit shapes", () => {
    for (const tag of requiredTags) {
      expect(
        ADAPTIVE_EDIT_SCENARIOS.filter((scenario) =>
          scenario.tags.includes(tag),
        ).length,
      ).toBeGreaterThanOrEqual(1);
    }
  });

  it("uses only the declared dimensions and unique scenario identifiers", () => {
    const ids = ADAPTIVE_EDIT_SCENARIOS.map((scenario) => scenario.id);
    expect(new Set(ids).size).toBe(ids.length);

    const dimensions = new Set<AdaptiveEditDimension>(ADAPTIVE_EDIT_DIMENSIONS);
    for (const scenario of ADAPTIVE_EDIT_SCENARIOS) {
      expect(scenario.instruction.trim().length).toBeGreaterThan(0);
      expect(scenario.dimensions.length).toBeGreaterThan(0);
      expect(
        scenario.dimensions.every((dimension) => dimensions.has(dimension)),
      ).toBe(true);
    }
  });
});
