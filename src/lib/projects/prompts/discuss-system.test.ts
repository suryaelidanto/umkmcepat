import { describe, expect, it } from "vitest";

import { DISCUSS_SYSTEM_PROMPT } from "@/lib/projects/prompts/discuss-system";

describe("DISCUSS_SYSTEM_PROMPT", () => {
  it("lists every mandatory field", () => {
    expect(DISCUSS_SYSTEM_PROMPT).toContain("businessName");
    expect(DISCUSS_SYSTEM_PROMPT).toContain("productOrService");
  });

  it("lists every soft field id", () => {
    for (const f of [
      "tagline",
      "usp",
      "targetCustomer",
      "priceRange",
      "visuals",
      "hours",
      "address",
      "deliveryArea",
      "since",
      "testimonials",
      "certifications",
      "paymentMethods",
      "socialLinks",
      "currentPromo",
      "secondaryCta",
    ]) {
      expect(DISCUSS_SYSTEM_PROMPT).toContain(f);
    }
  });

  it("documents the UMKM types", () => {
    for (const t of [
      "fnb",
      "retail",
      "jasa_lokal",
      "jasa_online",
      "kursus",
      "other",
    ]) {
      expect(DISCUSS_SYSTEM_PROMPT).toContain(t);
    }
  });

  it("mentions the confidence rule", () => {
    expect(DISCUSS_SYSTEM_PROMPT).toContain("readyForBuild");
    expect(DISCUSS_SYSTEM_PROMPT).toMatch(/50%/);
  });

  it("forbids hallucinating values", () => {
    expect(DISCUSS_SYSTEM_PROMPT.toLowerCase()).toContain("hallucinat");
  });

  it("documents the first-message greeting", () => {
    expect(DISCUSS_SYSTEM_PROMPT.toLowerCase()).toContain("greeting");
  });

  it("documents multi-product handling", () => {
    expect(DISCUSS_SYSTEM_PROMPT).toContain("isPrimary");
  });
});
