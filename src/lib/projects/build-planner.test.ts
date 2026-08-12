import { describe, expect, it } from "vitest";

import { parseBuildContract } from "./build-contract";
import { hashBuildContract, hashBuildPlan } from "./build-hash";
import {
  buildContractFromBrief,
  buildPlanFromContract,
  type PlannerDeps,
} from "./build-planner";

import type { ProjectBrief } from "./brief";

function brief(): ProjectBrief {
  return {
    version: 1 as const,
    prompt: "jualan sate ayam",
    facts: [],
    decisions: [],
    businessName: "Sate Mas",
    businessType: "fnb",
    offer: "Sate ayam dan kambing",
    targetCustomer: "Karyawan kantoran",
    contactOrCta: "WhatsApp 08123456789",
    stylePreference: "hangat",
    notes: [],
    confidence: 96,
    openQuestions: [],
    productOrService: [{ name: "Sate Ayam", isPrimary: true }],
    contact: { channel: "whatsapp", value: "+628123456789" },
    tagline: "Sate enak",
    usp: ["Bumbu kacang original"],
    priceRange: "15rb",
    visuals: true,
    hours: [{ dayRange: "Senin-Sabtu", open: "09:00", close: "21:00" }],
    address: "Jl. Merdeka 1",
    deliveryArea: "Kota",
    since: "2015",
    testimonials: null,
    certifications: null,
    paymentMethods: [{ method: "cash" }],
    socialLinks: null,
    currentPromo: null,
    secondaryCta: null,
    readyForBuild: true,
  };
}

function deps(): PlannerDeps {
  return {
    parseBuildContract,
    hashContract: hashBuildContract,
  };
}

describe("buildContractFromBrief", () => {
  it("maps a ready brief into a valid contract draft", () => {
    const result = buildContractFromBrief(brief(), deps(), "t1");
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.identity.businessName).toBe("Sate Mas");
    expect(result.value.facts.some((f) => f.kind === "contact")).toBe(true);
    expect(result.value.facts.some((f) => f.kind === "offer")).toBe(true);
    expect(result.value.ctaIntents.length).toBeGreaterThan(0);
    // The draft carries a content hash.
    expect(result.value.contentHash).toMatch(/^[0-9a-f]{64}$/);
    const plan = buildPlanFromContract(result.value);
    expect(plan.contentHash).toBe(hashBuildPlan(plan));
  });

  it("uses valid server provenance when no chat turn is available", () => {
    const result = buildContractFromBrief(brief(), deps());
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(
      result.value.facts.every((fact) => fact.provenance.turnId === "server"),
    ).toBe(true);
  });

  it("fails without a concrete business name or offer", () => {
    const b = brief();
    b.businessName = "";
    const result = buildContractFromBrief(b, deps(), "t1");
    expect(result.ok).toBe(false);
  });
});
