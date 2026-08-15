import { describe, expect, it } from "vitest";

import {
  PROFESSIONAL_DESIGN_KITS,
  compatibleProfessionalPatterns,
  selectProfessionalSiteKit,
} from "./professional-site-kits";

describe("professional site kits", () => {
  it("defines five complete V2 kits", () => {
    expect([...PROFESSIONAL_DESIGN_KITS.keys()].sort()).toEqual([
      "bold-typographic",
      "catalog-story",
      "editorial-airy",
      "menu-led-editorial",
      "warm-commerce",
    ]);

    for (const kit of PROFESSIONAL_DESIGN_KITS.values()) {
      expect(kit.version).toBe(2);
      expect(kit.primitiveFileIds).toEqual(["site-layout-v2"]);
      expect(kit.compositionPatterns.length).toBeGreaterThanOrEqual(2);
      expect(kit.allowedSectionTreatments.length).toBeGreaterThanOrEqual(3);
      expect(kit.allowedSignatureAnchors.length).toBeGreaterThan(0);
      expect(kit.typography.allowedDisplayStackIds.length).toBeGreaterThan(0);
      expect(kit.rhythm.maximumConsecutiveEqualTreatments).toBe(2);
      expect(kit.criticRubric).toHaveLength(9);
    }
  });

  it("filters patterns by real roles and media mode", () => {
    const kit = PROFESSIONAL_DESIGN_KITS.get("catalog-story");
    expect(kit).toBeDefined();

    expect(
      compatibleProfessionalPatterns({
        kit: kit!,
        contentRoles: ["identity", "offer", "catalog", "contact"],
        mediaMode: "graphic",
      }).map((pattern) => pattern.id),
    ).toContain("asymmetric-catalog-hero");

    expect(
      compatibleProfessionalPatterns({
        kit: kit!,
        contentRoles: ["identity", "offer", "contact"],
        mediaMode: "typographic",
      }).map((pattern) => pattern.id),
    ).not.toContain("asymmetric-catalog-hero");
  });

  it("keeps sparse generic content on bold typography", () => {
    expect(
      selectProfessionalSiteKit({
        archetype: "generic",
        density: "sparse",
        mediaMode: "typographic",
        hasOperationalDetails: false,
        routeRoles: [{ path: "/", roles: ["identity", "offer", "contact"] }],
      }).id,
    ).toBe("bold-typographic");
  });

  it("keeps every kit executable and visually distinct", () => {
    const kits = [...PROFESSIONAL_DESIGN_KITS.values()];
    const fingerprints = kits.map((kit) => ({
      patterns: kit.compositionPatterns.map((pattern) => pattern.id),
      display: kit.typography.allowedDisplayStackIds,
      treatments: kit.allowedSectionTreatments,
      rubric: kit.criticRubric,
    }));

    expect(
      new Set(fingerprints.map((fingerprint) => fingerprint.patterns.join("|")))
        .size,
    ).toBe(kits.length);
    expect(
      new Set(fingerprints.map((fingerprint) => fingerprint.display.join("|")))
        .size,
    ).toBe(kits.length);
    expect(
      new Set(
        fingerprints.map((fingerprint) => fingerprint.treatments.join("|")),
      ).size,
    ).toBe(kits.length);
    expect(
      new Set(fingerprints.map((fingerprint) => fingerprint.rubric.join("|")))
        .size,
    ).toBe(kits.length);
  });
});
