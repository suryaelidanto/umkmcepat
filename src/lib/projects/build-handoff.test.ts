import { describe, expect, it } from "vitest";

import { buildHandoffLine } from "./build-handoff";

import type { ProjectBrief } from "./brief";

function makeBrief(over: Partial<ProjectBrief>): ProjectBrief {
  return {
    version: 1,
    prompt: "",
    facts: [],
    decisions: [],
    businessName: "Kopi Tuku",
    businessType: "fnb",
    offer: "Kopi",
    targetCustomer: "",
    contactOrCta: "",
    stylePreference: "",
    notes: [],
    confidence: 0,
    openQuestions: [],
    productOrService: null,
    contact: { channel: "whatsapp", value: "08123456789", label: undefined },
    tagline: null,
    usp: null,
    priceRange: null,
    visuals: null,
    hours: null,
    address: null,
    deliveryArea: null,
    since: null,
    testimonials: null,
    certifications: null,
    paymentMethods: null,
    socialLinks: null,
    currentPromo: null,
    secondaryCta: null,
    readyForBuild: true,
    ...over,
  };
}

describe("buildHandoffLine", () => {
  it("names the business, primary product, and contact when all three are present", () => {
    const line = buildHandoffLine(
      makeBrief({ productOrService: [{ name: "Kopi", isPrimary: true }] }),
    );
    expect(line).toContain("Kopi Tuku");
    expect(line).toContain("Kopi");
    expect(line).toContain("08123456789");
  });

  it("omits contact when absent", () => {
    const line = buildHandoffLine(
      makeBrief({
        contact: null,
        productOrService: [{ name: "Kopi", isPrimary: true }],
      }),
    );
    expect(line).not.toContain("08123456789");
  });

  it("formats confident professional handoff message", () => {
    const line = buildHandoffLine(
      makeBrief({ productOrService: [{ name: "Kopi", isPrimary: true }] }),
    );
    expect(line).toContain("Siap, langsung aku buatkan website");
    expect(line).not.toContain("sisanya bisa lo");
  });

  it("uses the primary product when productOrService has multiple", () => {
    const line = buildHandoffLine(
      makeBrief({
        productOrService: [
          { name: "Kopi Susu", isPrimary: true },
          { name: "Roti Bakar" },
        ],
      }),
    );
    expect(line).toContain("Kopi Susu");
  });
});
