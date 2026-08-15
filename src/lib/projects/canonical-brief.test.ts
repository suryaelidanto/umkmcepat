import { describe, expect, it } from "vitest";

import {
  applyAiBriefPatch,
  createInitialCanonicalBrief,
  hashCanonicalBrief,
  parseCanonicalBrief,
} from "./canonical-brief";

describe("parseCanonicalBrief", () => {
  it("promotes a legacy offer when productOrService is missing", () => {
    const brief = parseCanonicalBrief({
      businessName: "HP Surya",
      businessType: "retail",
      offer: "HP bekas semua merek",
      productOrService: null,
      contactOrCta: "Lihat stok & harga",
      contact: null,
    });

    expect(brief.business).toEqual({
      name: "HP Surya",
      type: "retail",
      category: null,
    });
    expect(brief.offers).toEqual([
      { name: "HP bekas semua merek", isPrimary: true },
    ]);
    expect(brief.primaryAction).toEqual({
      kind: "browse",
      label: "Lihat stok & harga",
      target: null,
    });
  });

  it("prefers rich typed values over conflicting legacy summaries", () => {
    const brief = parseCanonicalBrief({
      offer: "Wrong summary",
      productOrService: [{ name: "iPhone 13", isPrimary: true }],
      contactOrCta: "Wrong action",
      contact: {
        channel: "whatsapp",
        value: "08123456789",
        label: "Chat stok",
      },
    });

    expect(brief.offers[0]?.name).toBe("iPhone 13");
    expect(brief.primaryAction).toEqual({
      kind: "whatsapp",
      label: "Chat stok",
      target: "08123456789",
    });
  });

  it("does not infer a contact destination from a legacy action label", () => {
    const brief = parseCanonicalBrief({
      contactOrCta: "Chat WhatsApp sekarang",
      contact: null,
    });

    expect(brief.primaryAction).toEqual({
      kind: "browse",
      label: "Chat WhatsApp sekarang",
      target: null,
    });
  });

  it("drops invalid rich values instead of persisting untrusted shapes", () => {
    const brief = parseCanonicalBrief({
      productOrService: [{ name: "" }, null, { title: "Invented alias" }],
      contact: { channel: "whatsapp", value: "not-a-number" },
      testimonials: [{ quote: "", author: "Nobody" }],
      socialLinks: [{ platform: "unknown", handle: "@bad" }],
    });

    expect(brief.offers).toEqual([]);
    expect(brief.primaryAction).toBeNull();
    expect(brief.content.testimonials).toEqual([]);
    expect(brief.content.socialLinks).toEqual([]);
  });

  it("rejects an invalid direct WhatsApp action target", () => {
    const brief = parseCanonicalBrief({
      primaryAction: {
        kind: "whatsapp",
        label: "Chat",
        target: "my number is 1234",
      },
    });

    expect(brief.primaryAction).toBeNull();
  });

  it("round-trips canonical v2 without legacy aliases", () => {
    const initial = createInitialCanonicalBrief("  Buat situs toko  ");
    const parsed = parseCanonicalBrief({
      ...initial,
      business: {
        name: "Toko Sinar",
        type: "Retail elektronik",
        category: "retail",
      },
      offers: [{ name: "Laptop bekas", isPrimary: true }],
      audience: "Pelajar dan pekerja",
      primaryAction: {
        kind: "phone",
        label: "Telepon toko",
        target: "08123456789",
      },
      visualDirection: "Bersih dan modern",
    });

    expect(parsed).toMatchObject({
      version: 2,
      prompt: "Buat situs toko",
      business: {
        name: "Toko Sinar",
        type: "Retail elektronik",
        category: "retail",
      },
      offers: [{ name: "Laptop bekas", isPrimary: true }],
      audience: "Pelajar dan pekerja",
      primaryAction: {
        kind: "phone",
        label: "Telepon toko",
        target: "08123456789",
      },
      visualDirection: "Bersih dan modern",
    });
    expect("offer" in parsed).toBe(false);
    expect("productOrService" in parsed).toBe(false);
    expect("readyForBuild" in parsed).toBe(false);
  });

  it("maps permissive legacy AI patches into canonical fields only", () => {
    const patched = applyAiBriefPatch(createInitialCanonicalBrief("buat web"), {
      businessName: "HP Surya",
      productOrService: [{ name: "HP bekas", isPrimary: true }],
      targetCustomer: "Pembeli HP hemat",
      contact: {
        channel: "whatsapp",
        label: "Tanya stok",
        value: "08123456789",
      },
      stylePreference: "Bersih dan terpercaya",
      confidence: 99,
      openQuestions: [],
      readyForBuild: true,
    });

    expect(patched).toMatchObject({
      version: 2,
      business: { name: "HP Surya" },
      offers: [{ name: "HP bekas", isPrimary: true }],
      audience: "Pembeli HP hemat",
      primaryAction: {
        kind: "whatsapp",
        label: "Tanya stok",
        target: "08123456789",
      },
      visualDirection: "Bersih dan terpercaya",
    });
    for (const alias of [
      "offer",
      "productOrService",
      "contactOrCta",
      "contact",
      "readyForBuild",
      "confidence",
      "openQuestions",
    ]) {
      expect(alias in patched).toBe(false);
    }
  });

  it("accepts canonical patches without adding legacy aliases", () => {
    const patched = applyAiBriefPatch(createInitialCanonicalBrief(), {
      business: { category: "retail" },
      offers: [{ name: "Laptop bekas", isPrimary: true }],
      audience: "Pelajar",
      primaryAction: {
        kind: "phone",
        label: "Telepon toko",
        target: "08123456789",
      },
      visualDirection: "Modern",
    });

    expect(patched.business.category).toBe("retail");
    expect(patched.offers[0]?.name).toBe("Laptop bekas");
    expect(patched.audience).toBe("Pelajar");
    expect(patched.primaryAction?.kind).toBe("phone");
    expect(patched.visualDirection).toBe("Modern");
    expect("productOrService" in patched).toBe(false);
  });

  it("hashes equal canonical content identically", () => {
    const a = parseCanonicalBrief({
      version: 2,
      business: { name: "Toko", type: "Retail", category: "retail" },
      offers: [{ name: "Produk", isPrimary: true }],
    });
    const b = parseCanonicalBrief({
      offers: [{ isPrimary: true, name: "Produk" }],
      business: { category: "retail", type: "Retail", name: "Toko" },
      version: 2,
    });

    expect(hashCanonicalBrief(a)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashCanonicalBrief(a)).toBe(hashCanonicalBrief(b));
  });
  it("derives the category from a business type that names one", () => {
    const brief = parseCanonicalBrief(
      { version: 2, business: { name: "Ayam Nasi Enak", type: "fnb" } },
      "Buat situs",
    );

    expect(brief.business.category).toBe("fnb");
  });

  it("keeps an explicit category over the business type", () => {
    const brief = parseCanonicalBrief(
      {
        version: 2,
        business: { name: "Toko", type: "fnb", category: "retail" },
      },
      "Buat situs",
    );

    expect(brief.business.category).toBe("retail");
  });

  it("leaves the category null when the type names no known kind", () => {
    const brief = parseCanonicalBrief(
      { version: 2, business: { name: "Toko", type: "warung pinggir jalan" } },
      "Buat situs",
    );

    expect(brief.business.category).toBeNull();
  });
});
