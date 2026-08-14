import { describe, expect, it } from "vitest";

import { selectGeneratedSiteDesignKit } from "./generated-site-design-kits/catalog";
import {
  deriveDefaultWriterDesignPlanV2,
  normalizeWriterDesignPlanV2Candidate,
  parseWriterDesignPlanV2,
} from "./generated-site-design-plan";

function expected() {
  const kit = selectGeneratedSiteDesignKit({
    archetype: "retail-catalog",
    density: "rich",
    mediaMode: "graphic",
    primaryJobKind: "compare",
    hasOperationalDetails: false,
  });
  return {
    contractHash: "a".repeat(64),
    kit,
    mediaMode: "graphic" as const,
    requiredSectionIds: ["hero", "catalog", "contact"],
  };
}

function validPlan() {
  return {
    schemaVersion: 2,
    contractHash: "a".repeat(64),
    kit: { id: "catalog-story", version: 1 },
    mediaMode: "graphic",
    visualThesis: "A comparison-led catalog with a quiet trust close.",
    compositionPatternId: "product-rail",
    palette: {
      background: "#f7f3ec",
      foreground: "#3d2b1f",
      muted: "#e5ddd2",
      accent: "#d4a017",
    },
    typography: { displayRole: "serif", bodyRole: "sans" },
    pageStrategy: "single",
    taste: expected().kit.taste,
    sections: [
      { id: "hero", treatment: "split", surface: "base", density: "airy" },
      {
        id: "catalog",
        treatment: "comparison",
        surface: "muted",
        density: "regular",
      },
      {
        id: "contact",
        treatment: "close",
        surface: "contrast",
        density: "regular",
      },
    ],
    mobileStrategy: ["stack hero", "keep CTA visible"],
    signatureElement: "numbered comparison labels",
  };
}

describe("WriterDesignPlanV2", () => {
  it("accepts a bounded plan matching the immutable contract", () => {
    expect(
      parseWriterDesignPlanV2({ value: validPlan(), expected: expected() }),
    ).toMatchObject({
      schemaVersion: 2,
      kit: { id: "catalog-story", version: 1 },
      sectionOrder: ["hero", "catalog", "contact"],
    });
  });

  it("derives a complete deterministic frame when the writer omits its plan", () => {
    const defaults = deriveDefaultWriterDesignPlanV2(expected());

    expect(defaults).toMatchObject({
      schemaVersion: 2,
      contractHash: "a".repeat(64),
      kit: { id: "catalog-story", version: 1 },
      mediaMode: "graphic",
      compositionPatternId: "asymmetric-catalog-hero",
      typography: { displayRole: "serif", bodyRole: "sans" },
      pageStrategy: "single",
      taste: expected().kit.taste,
      sectionOrder: ["hero", "catalog", "contact"],
    });
    expect(defaults.sections).toHaveLength(3);
    expect(defaults.mobileStrategy.length).toBeGreaterThan(0);
    expect(defaults.visualThesis.length).toBeGreaterThanOrEqual(12);
    expect(defaults.signatureElement.length).toBeGreaterThan(0);
    expect(defaults.pageStrategy).toBe("single");
    expect(defaults.taste).toEqual(expected().kit.taste);
  });

  it("does not accept candidate taste over the platform frame", () => {
    const candidate = {
      ...validPlan(),
      pageStrategy: "multi",
      taste: { ...expected().kit.taste, variance: 10 },
    };
    const frame = deriveDefaultWriterDesignPlanV2(expected());
    expect(
      parseWriterDesignPlanV2({
        value: normalizeWriterDesignPlanV2Candidate({
          value: candidate,
          frame,
        }),
        expected: expected(),
      }),
    ).toMatchObject({
      pageStrategy: "single",
      taste: expected().kit.taste,
    });
  });

  it.each([
    ["wrong contract hash", { contractHash: "b".repeat(64) }],
    ["wrong pattern", { compositionPatternId: "not-a-kit-pattern" }],
    ["missing section", { sections: validPlan().sections.slice(0, 2) }],
    ["unknown field", { unexpected: true }],
  ])("rejects %s", (_label, patch) => {
    expect(() =>
      parseWriterDesignPlanV2({
        value: { ...validPlan(), ...patch },
        expected: expected(),
      }),
    ).toThrow();
  });
});
