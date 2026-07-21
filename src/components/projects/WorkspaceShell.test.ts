import { describe, expect, it } from "vitest";

import { canStartBuild } from "./WorkspaceShell";

import type { ProjectBrief } from "@/lib/projects/brief";

function makeBrief(overrides: Partial<ProjectBrief>): ProjectBrief {
  return {
    businessName: "Kopi Tuku",
    businessType: "Kedai kopi",
    confidence: 95,
    contact: null,
    contactOrCta: "Chat WA",
    decisions: [],
    deliveryArea: null,
    facts: [],
    notes: [],
    offer: "Kopi susu",
    openQuestions: [],
    priceRange: null,
    productOrService: [{ name: "Kopi", isPrimary: true }],
    prompt: "buat web kopi",
    readyForBuild: true,
    since: null,
    socialLinks: null,
    stylePreference: "Bold gelap",
    tagline: null,
    targetCustomer: "Mahasiswa",
    testimonials: null,
    hours: null,
    address: null,
    certifications: null,
    currentPromo: null,
    paymentMethods: null,
    secondaryCta: null,
    usp: null,
    visuals: null,
    version: 1,
    ...overrides,
  };
}

describe("canStartBuild", () => {
  it("returns true when brief is present, regardless of completeness gates", () => {
    expect(
      canStartBuild(
        makeBrief({
          productOrService: [{ name: "Kopi", isPrimary: true }],
          readyForBuild: false,
        }),
      ),
    ).toBe(true);

    expect(
      canStartBuild(
        makeBrief({
          businessName: "Kopi Tuku",
          productOrService: [{ name: "Kopi", isPrimary: true }],
          readyForBuild: true,
        }),
      ),
    ).toBe(true);

    expect(
      canStartBuild(
        makeBrief({
          productOrService: [],
          readyForBuild: true,
        }),
      ),
    ).toBe(true);

    expect(
      canStartBuild(
        makeBrief({
          businessName: "",
          productOrService: [{ name: "Kopi", isPrimary: true }],
          readyForBuild: true,
        }),
      ),
    ).toBe(true);
  });

  it("returns false when brief is null or undefined", () => {
    expect(canStartBuild(null)).toBe(false);
    expect(canStartBuild(undefined)).toBe(false);
  });
});
