import { describe, expect, it } from "vitest";

import {
  deriveGeneratedSiteKitSelectionInput,
  selectGeneratedSiteDesignKit,
} from "./catalog";
import { deriveGeneratedSitePageStrategy } from "../generated-site-design-quality";

import type { GeneratedSiteWriterContractV2 } from "../generated-site-contract";
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
      expect(kit.taste.variance).toBeGreaterThanOrEqual(1);
      expect(kit.taste.variance).toBeLessThanOrEqual(10);
      expect(kit.taste.motion).toBeGreaterThanOrEqual(1);
      expect(kit.taste.motion).toBeLessThanOrEqual(10);
      expect(kit.taste.density).toBeGreaterThanOrEqual(1);
      expect(kit.taste.density).toBeLessThanOrEqual(10);
      expect(kit.taste.signatureBudget).toBe(1);
      expect(kit.taste.typeGuidance.trim()).not.toBe("");
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

  it("keeps one primary job on one page", () => {
    expect(
      deriveGeneratedSitePageStrategy({
        obligations: {
          routes: [
            {
              path: "/",
              purpose: "Beranda",
              requiredFactIds: [],
              requiredSectionIds: ["hero"],
            },
          ],
        },
      } as unknown as GeneratedSiteWriterContractV2),
    ).toEqual({
      mode: "single",
      reason: "single-primary-job",
      routeCount: 1,
    });
  });

  it("does not collapse distinct accepted routes into one page", () => {
    expect(
      deriveGeneratedSitePageStrategy({
        obligations: {
          routes: [
            {
              path: "/",
              purpose: "Beranda",
              requiredFactIds: [],
              requiredSectionIds: ["hero"],
            },
            {
              path: "/katalog",
              purpose: "Katalog",
              requiredFactIds: ["offer-1"],
              requiredSectionIds: ["catalog"],
            },
          ],
        },
      } as unknown as GeneratedSiteWriterContractV2),
    ).toMatchObject({
      mode: "multi",
      reason: "distinct-routes",
      routeCount: 2,
    });
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
