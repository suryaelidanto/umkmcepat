import { describe, expect, it } from "vitest";

import { evaluateTieredBriefReadiness } from "./brief-tiered-readiness";
import { parseCanonicalBrief } from "./canonical-brief";

describe("evaluateTieredBriefReadiness", () => {
  it("marks empty brief as Tier 1 not satisfied with specific missing core fields", () => {
    const brief = parseCanonicalBrief({});
    const readiness = evaluateTieredBriefReadiness(brief);

    expect(readiness.tier1.satisfied).toBe(false);
    expect(readiness.tier1.missing).toEqual([
      "businessName",
      "offer",
      "contact",
    ]);
    expect(readiness.canBuild).toBe(false);
  });

  it("marks Tier 1 as satisfied when businessName, offer, and valid contact exist", () => {
    const brief = parseCanonicalBrief({
      businessName: "Kopi Senja Nusantara",
      productOrService: [
        { name: "Kopi Susu Gula Aren", priceRange: "18.000", isPrimary: true },
      ],
      contact: {
        channel: "whatsapp",
        value: "081234567890",
        label: "Pesan via WhatsApp",
      },
    });
    const readiness = evaluateTieredBriefReadiness(brief);

    expect(readiness.tier1.satisfied).toBe(true);
    expect(readiness.tier1.missing).toEqual([]);
    expect(readiness.canBuild).toBe(true);
    expect(readiness.tier2.satisfied).toBe(false);
    expect(readiness.tier2.missing).toEqual(["usp", "location", "photos"]);
  });

  it("identifies Tier 2 enrichment fields correctly", () => {
    const brief = parseCanonicalBrief({
      businessName: "Kopi Senja Nusantara",
      productOrService: [
        { name: "Kopi Susu Gula Aren", priceRange: "18.000", isPrimary: true },
      ],
      contact: {
        channel: "whatsapp",
        value: "081234567890",
      },
      usp: ["Biji kopi lokal pilihan", "Racikan fresh setiap hari"],
      address: "Jl. Margonda Raya No. 45, Depok",
      assets: [{ id: "img-hero-1", purpose: "hero" }],
    });
    const readiness = evaluateTieredBriefReadiness(brief);

    expect(readiness.tier1.satisfied).toBe(true);
    expect(readiness.tier2.satisfied).toBe(true);
    expect(readiness.tier2.missing).toEqual([]);
    expect(readiness.tier2.filledCount).toBe(4);
    expect(readiness.tier2.totalCount).toBe(4);
  });

  it("evaluates Polish tier (Tier 3) count accurately", () => {
    const brief = parseCanonicalBrief({
      businessName: "Kopi Senja Nusantara",
      productOrService: [{ name: "Kopi Susu", isPrimary: true }],
      contact: { channel: "whatsapp", value: "081234567890" },
      hours: [{ dayRange: "Senin - Minggu", open: "08:00", close: "22:00" }],
      currentPromo: "Diskon 20% pembelian pertama",
      socialLinks: [{ platform: "instagram", handle: "@kopisenja" }],
    });
    const readiness = evaluateTieredBriefReadiness(brief);

    expect(readiness.tier3.filledCount).toBe(3);
    expect(readiness.tier3.totalCount).toBe(4);
  });
});
