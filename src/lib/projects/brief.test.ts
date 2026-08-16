import { describe, expect, it } from "vitest";

import {
  applyBriefValidator,
  briefToBuildPrompt,
  createInitialBrief,
  getMissingBriefFields,
  mergeProjectBriefPatch,
  parseProjectBrief,
} from "./brief";

import type { CleanedBrief } from "./brief-rich-fields";

describe("project brief", () => {
  it("creates a safe initial brief", () => {
    const brief = createInitialBrief("buat web toko baju");

    expect(brief.prompt).toBe("buat web toko baju");
    expect(getMissingBriefFields(brief)).toContain("businessType");
  });

  it("parses unknown values safely", () => {
    expect(parseProjectBrief(null, "halo").prompt).toBe("halo");
    expect(
      parseProjectBrief({ businessType: " Fashion  " }, "halo").businessType,
    ).toBe("Fashion");
  });

  it("reads canonical V2 rows without losing discussion fields", () => {
    const brief = parseProjectBrief(
      {
        version: 2,
        prompt: "buat toko",
        business: { name: "HP Surya", type: "Retail HP", category: "retail" },
        offers: [{ name: "HP bekas", isPrimary: true }],
        audience: "Pembeli HP hemat",
        primaryAction: {
          kind: "whatsapp",
          label: "Tanya stok",
          target: "08123456789",
        },
        visualDirection: "Bersih",
        fieldState: { contact: "answered" },
        content: { tagline: "HP hemat", usp: ["Bergaransi"] },
        assets: [{ id: "logo-1", purpose: "logo" }],
        provenance: {
          facts: [{ key: "location", label: "Lokasi", value: "Bandung" }],
          decisions: [],
        },
        visitorJobs: [
          {
            id: "primary",
            goal: "Memahami pilihan",
            priority: "primary",
          },
          {
            id: "lokasi",
            goal: "Menemukan lokasi",
            priority: "secondary",
          },
        ],
      },
      "fallback",
    );

    expect(brief).toMatchObject({
      version: 1,
      prompt: "buat toko",
      businessName: "HP Surya",
      businessType: "Retail HP",
      offer: "HP bekas",
      productOrService: [{ name: "HP bekas", isPrimary: true }],
      targetCustomer: "Pembeli HP hemat",
      contactOrCta: "Tanya stok",
      contact: {
        channel: "whatsapp",
        label: "Tanya stok",
        value: "08123456789",
      },
      stylePreference: "Bersih",
      tagline: "HP hemat",
      usp: ["Bergaransi"],
      businessImages: [{ id: "logo-1", purpose: "logo" }],
      visitorJobs: [
        { id: "primary", goal: "Memahami pilihan", priority: "primary" },
        { id: "lokasi", goal: "Menemukan lokasi", priority: "secondary" },
      ],
    });
  });

  it("keeps malformed visitor-job patches from creating a route", () => {
    const brief = createInitialBrief("buat web");
    const merged = mergeProjectBriefPatch(brief, {
      visitorJobs: [
        { id: "primary", goal: "Pilih menu", priority: "primary" },
        { id: "primary", goal: "Cari lokasi", priority: "secondary" },
      ],
    });

    expect(merged.visitorJobs).toEqual([]);
  });

  it("round-trips an explicit visitor-job patch", () => {
    const merged = mergeProjectBriefPatch(createInitialBrief(), {
      visitorJobs: [
        { id: "primary", goal: "Pilih menu", priority: "primary" },
        { id: "lokasi", goal: "Cari lokasi", priority: "secondary" },
      ],
    });

    expect(merged.visitorJobs).toEqual([
      { id: "primary", goal: "Pilih menu", priority: "primary" },
      { id: "lokasi", goal: "Cari lokasi", priority: "secondary" },
    ]);
  });

  it("persists typed UMKM classification and field state", () => {
    const brief = parseProjectBrief({
      umkmType: "fnb",
      fieldState: { address: "answered", hours: "declined" },
    });

    expect(brief.umkmType).toBe("fnb");
    expect(brief.fieldState).toEqual({
      address: "answered",
      hours: "declined",
    });

    const merged = mergeProjectBriefPatch(brief, {
      fieldState: { visuals: "explicitly_empty" },
    });

    expect(merged.fieldState).toEqual({
      address: "answered",
      hours: "declined",
      visuals: "explicitly_empty",
    });
  });

  it("keeps legacy fields available for prompts without authorizing readiness", () => {
    const brief = parseProjectBrief(
      {
        businessType: "Fashion",
        offer: "Katalog produk",
        targetCustomer: "Anak muda",
        contactOrCta: "Chat WA",
        stylePreference: "Bold gelap",
      },
      "buat web",
    );

    expect(briefToBuildPrompt(brief)).toContain("Bidang usaha: Fashion");
  });
});

describe("applyBriefValidator", () => {
  const fullClean: CleanedBrief = {
    businessName: "Kopi Tuku",
    productOrService: [{ name: "Kopi Susu", isPrimary: true }],
    contact: { channel: "whatsapp", value: "08123456789", label: undefined },
    tagline: "Kopi susu enak harga mahasiswa",
    usp: ["Biji single origin"],
    targetCustomer: "Mahasiswa",
    priceRange: "15-25rb",
    visuals: true,
    hours: [
      {
        dayRange: "Senin-Jumat",
        open: "08:00",
        close: "21:00",
        note: undefined,
      },
    ],
    address: "Jl. Kaliurang KM 5",
    deliveryArea: "Sleman",
    since: "2018",
    testimonials: [
      { quote: "Mantap", author: "Ibu Rina", context: undefined, rating: 5 },
    ],
    certifications: [{ name: "Halal", issuer: undefined }],
    paymentMethods: [{ method: "qris", detail: undefined }],
    socialLinks: [
      { platform: "instagram", handle: "@kopituku", url: undefined },
    ],
    currentPromo: null,
    secondaryCta: null,
  };

  it("applyBriefValidator populates all fields from a CleanedBrief", () => {
    const brief = applyBriefValidator(fullClean);
    expect(brief.businessName).toBe("Kopi Tuku");
    expect(brief.contact?.channel).toBe("whatsapp");
    expect(brief.paymentMethods?.[0].method).toBe("qris");
  });

  it("applyBriefValidator defaults readyForBuild to false", () => {
    const brief = applyBriefValidator(fullClean);
    expect(brief.readyForBuild).toBe(false);
  });
});

describe("mergeProjectBriefPatch typed rich fields", () => {
  it("propagates productOrService through the patch so the gate can open", () => {
    const brief = createInitialBrief("kopi tuku");
    const merged = mergeProjectBriefPatch(brief, {
      productOrService: [{ name: "Kopi Susu", isPrimary: true }],
    });

    expect(merged.productOrService).toEqual([
      { name: "Kopi Susu", isPrimary: true },
    ]);
  });

  it("copies scalar rich fields (contact, tagline, usp, priceRange) when non-null", () => {
    const brief = createInitialBrief("kopi tuku");
    const merged = mergeProjectBriefPatch(brief, {
      contact: { channel: "whatsapp", value: "08123456789" },
      tagline: "Kopi susu harga mahasiswa",
      usp: ["Single origin"],
      priceRange: "15-25rb",
      visuals: true,
      address: "Jl. Kaliurang KM 5",
      since: "2018",
      currentPromo: "Beli 1 gratis 1",
      secondaryCta: { label: "Lihat menu", action: "scroll_to_menu" },
    });

    expect(merged.contact?.value).toBe("08123456789");
    expect(merged.tagline).toBe("Kopi susu harga mahasiswa");
    expect(merged.usp).toEqual(["Single origin"]);
    expect(merged.priceRange).toBe("15-25rb");
    expect(merged.visuals).toBe(true);
    expect(merged.address).toBe("Jl. Kaliurang KM 5");
    expect(merged.since).toBe("2018");
    expect(merged.currentPromo).toBe("Beli 1 gratis 1");
    expect(merged.secondaryCta).toEqual({
      label: "Lihat menu",
      action: "scroll_to_menu",
    });
  });

  it("copies array rich fields (hours, testimonials, paymentMethods, socialLinks, certifications)", () => {
    const brief = createInitialBrief("kopi tuku");
    const merged = mergeProjectBriefPatch(brief, {
      hours: [{ dayRange: "Senin-Jumat", open: "08:00", close: "21:00" }],
      testimonials: [{ quote: "Mantap", author: "Ibu Rina", rating: 5 }],
      paymentMethods: [{ method: "qris" }],
      socialLinks: [{ platform: "instagram", handle: "@kopituku" }],
      certifications: [{ name: "Halal" }],
      deliveryArea: "Sleman",
    });

    expect(merged.hours).toEqual([
      { dayRange: "Senin-Jumat", open: "08:00", close: "21:00" },
    ]);
    expect(merged.testimonials?.[0].author).toBe("Ibu Rina");
    expect(merged.paymentMethods?.[0].method).toBe("qris");
    expect(merged.socialLinks?.[0].handle).toBe("@kopituku");
    expect(merged.certifications?.[0].name).toBe("Halal");
    expect(merged.deliveryArea).toBe("Sleman");
  });

  it("treats empty array patch as explicit null so the gate stays false", () => {
    const brief = createInitialBrief("kopi tuku");
    const merged = mergeProjectBriefPatch(brief, {
      productOrService: [],
    });

    expect(merged.productOrService).toBeNull();
  });

  it("ignores the new fields entirely when the patch has none (legacy patches still work)", () => {
    const brief = createInitialBrief("kopi tuku");
    const merged = mergeProjectBriefPatch(brief, {
      businessType: "F&B",
      confidence: 30,
    });

    expect(merged.productOrService).toBeNull();
    expect(merged.contact).toBeNull();
    expect(merged.businessType).toBe("F&B");
    expect(merged.confidence).toBe(30);
  });
});
