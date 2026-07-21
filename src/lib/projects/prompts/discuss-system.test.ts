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
    expect(DISCUSS_SYSTEM_PROMPT).toMatch(/95\+/);
  });

  it("forbids hallucinating values", () => {
    expect(DISCUSS_SYSTEM_PROMPT.toLowerCase()).toContain("hallucinat");
  });

  it("instructs the AI to reply in Bahasa Indonesia to the user", () => {
    expect(DISCUSS_SYSTEM_PROMPT).toContain("Bahasa Indonesia");
    expect(DISCUSS_SYSTEM_PROMPT).toContain("Mirror the user's register");
  });

  it("instructs the AI to push back on single-word generic business names", () => {
    expect(DISCUSS_SYSTEM_PROMPT).toContain("Warung");
    expect(DISCUSS_SYSTEM_PROMPT).toContain("Toko");
    expect(DISCUSS_SYSTEM_PROMPT).toContain("nama brand penuhnya apa?");
  });
});
