import { describe, expect, it } from "vitest";

import {
  deriveGeneratedSiteKitSelectionInput,
  selectGeneratedSiteDesignKit,
} from "./catalog";

import type { GeneratedSiteKitSelectionInput } from "./types";

describe("generated-site design kit catalog", () => {
  it("contains five owner-calibrated kit families", async () => {
    const { DESIGN_KITS } = await import("./catalog");
    expect([...DESIGN_KITS.keys()]).toEqual([
      "editorial-airy",
      "menu-led-editorial",
      "catalog-story",
      "warm-commerce",
      "bold-typographic",
    ]);
    for (const kit of DESIGN_KITS.values()) {
      expect(kit.referenceLabels.length).toBeGreaterThan(0);
      expect(kit.compositionPatterns.length).toBeGreaterThanOrEqual(2);
      expect(kit.sourceAssertions.length).toBeGreaterThan(0);
      expect(kit.browserAssertions.length).toBeGreaterThan(0);
      expect(kit.criticRubric.length).toBeGreaterThan(0);
      expect(kit.primitiveFileIds.length).toBeGreaterThan(0);
    }
  });

  it.each([
    [
      {
        archetype: "fnb-menu",
        density: "rich",
        mediaMode: "typographic",
        primaryJobKind: "browse",
        hasOperationalDetails: true,
      },
      "menu-led-editorial",
    ],
    [
      {
        archetype: "retail-catalog",
        density: "rich",
        mediaMode: "owner_assets",
        primaryJobKind: "compare",
        hasOperationalDetails: false,
      },
      "catalog-story",
    ],
    [
      {
        archetype: "retail",
        density: "regular",
        mediaMode: "graphic",
        primaryJobKind: "browse",
        hasOperationalDetails: true,
      },
      "warm-commerce",
    ],
    [
      {
        archetype: "service-area",
        density: "sparse",
        mediaMode: "typographic",
        primaryJobKind: "inquire",
        hasOperationalDetails: false,
      },
      "editorial-airy",
    ],
    [
      {
        archetype: "generic",
        density: "sparse",
        mediaMode: "graphic",
        primaryJobKind: "inquire",
        hasOperationalDetails: false,
      },
      "bold-typographic",
    ],
  ] as const)("selects a compatible executable kit", (input, expected) => {
    expect(selectGeneratedSiteDesignKit(input)).toMatchObject({ id: expected });
  });

  it("derives stable traits without copying owner copy", () => {
    const input: GeneratedSiteKitSelectionInput = {
      archetype: "retail-catalog",
      density: "rich",
      mediaMode: "graphic",
      primaryJobKind: "compare",
      hasOperationalDetails: true,
    };
    expect(deriveGeneratedSiteKitSelectionInput(input)).toEqual(input);
  });
});
