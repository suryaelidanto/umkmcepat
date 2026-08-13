import { describe, expect, it } from "vitest";

import {
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
});
