import { describe, expect, it } from "vitest";

import {
  createBuildConfirmationCard,
  evaluateTieredBriefReadiness,
  getNextTieredEnrichmentCard,
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

  it("asks for an offer when the existing offer is only an AI suggestion", () => {
    const brief = parseCanonicalBrief({
      businessName: "Fresh Clean Laundry",
      productOrService: [{ name: "Jasa laundry", isPrimary: true }],
      contact: {
        channel: "whatsapp",
        value: "08123456789",
        label: "Chat WhatsApp",
      },
      factLedger: {
        version: 1,
        entries: [
          {
            id: "business-name-primary",
            field: "businessName",
            label: "Nama usaha",
            value: "Fresh Clean Laundry",
            state: "owner_confirmed",
            origin: "owner_message",
            source: "owner",
            sourceTurnId: "turn-1",
          },
          {
            id: "offers-primary",
            field: "offers",
            label: "Produk atau layanan",
            value: [{ name: "Jasa laundry", isPrimary: true }],
            state: "ai_suggestion",
            origin: "safe_derivation",
            source: "assistant",
            sourceTurnId: "turn-1",
          },
          {
            id: "contact-primary",
            field: "contact",
            label: "Kontak",
            value: "08123456789",
            state: "owner_confirmed",
            origin: "owner_message",
            source: "owner",
            sourceTurnId: "turn-1",
          },
        ],
      },
    });

    const card = getNextTieredEnrichmentCard(brief);

    expect(card).toMatchObject({
      type: "question",
      question: {
        id: "services",
        answerMode: "choice",
        selectionMode: "single",
        options: [{ label: "Jasa laundry", description: expect.any(String) }],
      },
    });
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

describe("createBuildConfirmationCard", () => {
  it("creates a confirmation card with structured options and recommendation", () => {
    const brief = parseCanonicalBrief({
      businessName: "Kopi Senja Nusantara",
    });
    const card = createBuildConfirmationCard(brief);
    expect(card.type).toBe("question");
    expect(card.question.id).toBe("confirm_build");
    expect(card.question.answerMode).toBe("choice");
    expect(card.question.options.length).toBe(2);
    expect(card.question.recommendedOptionLabel).toBe(
      "Ya, buat websitenya sekarang",
    );
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
      expect(card.question.answerMode).toBe("choice");
      expect(card.question.options.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("returns usp card when pricing is filled but usp is empty", () => {
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
      expect(card.question.answerMode).toBe("choice");
      expect(card.question.selectionMode).toBe("multiple");
      expect(card.question.options.length).toBeGreaterThanOrEqual(2);
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
      expect(Array.isArray(card.question.options)).toBe(true);
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

  it("returns operational hours question when Tier 2 is satisfied and includeTier3 is true", () => {
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
    const card = getNextTieredEnrichmentCard(brief, { includeTier3: true });
    expect(card).not.toBeNull();
    expect(card?.type).toBe("question");
    if (card?.type === "question") {
      expect(card.question.id).toBe("hours");
      expect(card.question.answerMode).toBe("choice");
      expect(card.question.options.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("returns promo question when Tier 2 and hours are filled and includeTier3 is true", () => {
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
      hours: [{ dayRange: "Setiap hari", open: "08:00", close: "17:00" }],
    });
    const card = getNextTieredEnrichmentCard(brief, { includeTier3: true });
    expect(card).not.toBeNull();
    expect(card?.type).toBe("question");
    if (card?.type === "question") {
      expect(card.question.id).toBe("current_promo");
    }
  });
});
