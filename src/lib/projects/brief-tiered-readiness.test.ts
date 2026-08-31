import { describe, expect, it } from "vitest";

import {
  evaluateTieredBriefReadiness,
  getNextTieredEnrichmentCard,
  isExplicitBuildRequest,
} from "./brief-tiered-readiness";
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

describe("isExplicitBuildRequest", () => {
  it("recognizes affirmative build commands", () => {
    expect(isExplicitBuildRequest("buat website sekarang")).toBe(true);
    expect(isExplicitBuildRequest("langsung buat aja")).toBe(true);
    expect(isExplicitBuildRequest("bangun webnya")).toBe(true);
    expect(isExplicitBuildRequest("bikin websitenya")).toBe(true);
    expect(isExplicitBuildRequest("udah cukup")).toBe(true);
    expect(isExplicitBuildRequest("cukup segitu")).toBe(true);
    expect(isExplicitBuildRequest("mulai buat sekarang")).toBe(true);
  });

  it("returns false for regular conversational turns and data inputs", () => {
    expect(isExplicitBuildRequest("08123456789")).toBe(false);
    expect(isExplicitBuildRequest("Jl. Kenangan No 4")).toBe(false);
    expect(isExplicitBuildRequest("Bengkel Ayah")).toBe(false);
    expect(isExplicitBuildRequest("Sepeda Motor")).toBe(false);
    expect(isExplicitBuildRequest("gak tau")).toBe(false);
  });
});

describe("getNextTieredEnrichmentCard", () => {
  it("returns business_name question if business name is missing", () => {
    const brief = parseCanonicalBrief({});
    const card = getNextTieredEnrichmentCard(brief);
    expect(card).not.toBeNull();
    expect(card?.type).toBe("question");
    if (card?.type === "question") {
      expect(card.question.id).toBe("business_name");
      expect(card.question.required).toBe(true);
    }
  });

  it("returns location question when Tier 1 is met but address is missing", () => {
    const brief = parseCanonicalBrief({
      businessName: "Bengkel Ayah",
      productOrService: [{ name: "Servis Motor", isPrimary: true }],
      contact: { channel: "whatsapp", value: "08123456789" },
      targetCustomer: "Pengendara harian",
      stylePreference: "Tegas",
    });
    const card = getNextTieredEnrichmentCard(brief);
    expect(card).not.toBeNull();
    expect(card?.type).toBe("question");
    if (card?.type === "question") {
      expect(card.question.id).toBe("address");
    }
  });

  it("returns pricing question when location is filled but pricing is missing", () => {
    const brief = parseCanonicalBrief({
      businessName: "Bengkel Ayah",
      productOrService: [{ name: "Servis Motor", isPrimary: true }],
      contact: { channel: "whatsapp", value: "08123456789" },
      address: "Jl. Kenangan No 4 Jakarta Utara",
      targetCustomer: "Pengendara harian",
      stylePreference: "Tegas",
    });
    const card = getNextTieredEnrichmentCard(brief);
    expect(card).not.toBeNull();
    expect(card?.type).toBe("question");
    if (card?.type === "question") {
      expect(card.question.id).toBe("price_range");
    }
  });

  it("returns usp text card when pricing is filled but usp is empty", () => {
    const brief = parseCanonicalBrief({
      businessName: "Bengkel Ayah",
      productOrService: [
        { name: "Servis Motor", priceRange: "35.000", isPrimary: true },
      ],
      contact: { channel: "whatsapp", value: "08123456789" },
      address: "Jl. Kenangan No 4 Jakarta Utara",
      targetCustomer: "Pengendara harian",
      stylePreference: "Tegas",
    });
    const card = getNextTieredEnrichmentCard(brief);
    expect(card).not.toBeNull();
    expect(card?.type).toBe("question");
    if (card?.type === "question") {
      expect(card.question.id).toBe("usp");
      expect(card.question.answerMode).toBe("text");
      expect(card.question.options).toEqual([]);
    }
  });

  it("returns image_upload card when photos are empty and uploads enabled", () => {
    const brief = parseCanonicalBrief({
      businessName: "Bengkel Ayah",
      productOrService: [
        { name: "Servis Motor", priceRange: "35.000", isPrimary: true },
      ],
      contact: { channel: "whatsapp", value: "08123456789" },
      address: "Jl. Kenangan No 4 Jakarta Utara",
      targetCustomer: "Pengendara harian",
      stylePreference: "Tegas",
      usp: ["Mekanik Berpengalaman"],
    });
    const card = getNextTieredEnrichmentCard(brief, { uploadsEnabled: true });
    expect(card).not.toBeNull();
    expect(card?.type).toBe("image_upload");
  });

  it("prioritizes audience before lower-information enrichment", () => {
    const brief = parseCanonicalBrief({
      businessName: "Bengkel Ayah",
      productOrService: [{ name: "Servis Motor", isPrimary: true }],
      contact: { channel: "whatsapp", value: "08123456789" },
    });

    const card = getNextTieredEnrichmentCard(brief);
    expect(card?.type).toBe("question");
    if (card?.type === "question") {
      expect(card.question.id).toBe("audience");
      expect(card.question.required).toBe(false);
    }
  });

  it("asks for visual direction after audience is resolved", () => {
    const brief = parseCanonicalBrief({
      businessName: "Bengkel Ayah",
      productOrService: [{ name: "Servis Motor", isPrimary: true }],
      contact: { channel: "whatsapp", value: "08123456789" },
      targetCustomer: "Pengendara harian",
    });

    const card = getNextTieredEnrichmentCard(brief);
    expect(card?.type).toBe("question");
    if (card?.type === "question") {
      expect(card.question.id).toBe("visual_direction");
    }
  });

  it("does not repeat an explicitly omitted audience", () => {
    const brief = parseCanonicalBrief({
      businessName: "Bengkel Ayah",
      productOrService: [{ name: "Servis Motor", isPrimary: true }],
      contact: { channel: "whatsapp", value: "08123456789" },
      fieldState: { audience: "declined" },
    });

    const card = getNextTieredEnrichmentCard(brief);
    expect(card?.type).toBe("question");
    if (card?.type === "question") {
      expect(card.question.id).toBe("visual_direction");
    }
  });

  it("does not repeat an explicitly omitted visual direction", () => {
    const brief = parseCanonicalBrief({
      businessName: "Bengkel Ayah",
      productOrService: [{ name: "Servis Motor", isPrimary: true }],
      contact: { channel: "whatsapp", value: "08123456789" },
      fieldState: { visual_direction: "declined" },
    });

    const card = getNextTieredEnrichmentCard(brief);
    expect(card?.type).toBe("question");
    if (card?.type === "question") {
      expect(card.question.id).toBe("audience");
    }
  });

  it("emits one active question instead of a questionnaire", () => {
    const brief = parseCanonicalBrief({
      businessName: "Bengkel Ayah",
      productOrService: [{ name: "Servis Motor", isPrimary: true }],
      contact: { channel: "whatsapp", value: "08123456789" },
    });

    const card = getNextTieredEnrichmentCard(brief);
    expect(card?.type).toBe("question");
    if (card?.type === "question") {
      expect(card.question.id).toBeTruthy();
      expect(card.question.options).toEqual([]);
    }
  });

  it("moves to operations only after higher-information domains are resolved", () => {
    const brief = parseCanonicalBrief({
      businessName: "Bengkel Ayah",
      productOrService: [{ name: "Servis Motor", isPrimary: true }],
      contact: { channel: "whatsapp", value: "08123456789" },
      targetCustomer: "Pengendara harian",
      stylePreference: "Tegas",
    });

    const card = getNextTieredEnrichmentCard(brief);
    expect(card?.type).toBe("question");
    if (card?.type === "question") {
      expect(card.question.id).toBe("address");
    }
  });

  it("returns null when all Tier 2 enrichment fields are satisfied", () => {
    const brief = parseCanonicalBrief({
      businessName: "Bengkel Ayah",
      productOrService: [
        { name: "Servis Motor", priceRange: "35.000", isPrimary: true },
      ],
      contact: { channel: "whatsapp", value: "08123456789" },
      address: "Jl. Kenangan No 4 Jakarta Utara",
      targetCustomer: "Pengendara harian",
      stylePreference: "Tegas",
      usp: ["Mekanik Berpengalaman"],
      assets: [{ id: "photo-1", purpose: "business-image" }],
    });
    const card = getNextTieredEnrichmentCard(brief);
    expect(card).toBeNull();
  });
});
