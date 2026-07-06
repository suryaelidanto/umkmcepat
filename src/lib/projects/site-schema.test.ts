import { describe, expect, it } from "vitest";

import {
  createProjectSiteSchemaFromBrief,
  createFallbackProjectSiteSchema,
  getProjectSiteSchemaCandidateIssues,
  getProjectSiteSchemaQualityIssues,
  parseProjectSiteSchema,
} from "./site-schema";

describe("project site schema", () => {
  it("creates a safe fallback schema from a prompt", () => {
    expect(
      createFallbackProjectSiteSchema("  Saya jual kopi susu  "),
    ).toMatchObject({
      version: 1,
      businessName: "Saya jual kopi susu",
      sections: expect.arrayContaining([
        expect.objectContaining({ title: "Tentang usaha" }),
      ]),
    });
  });

  it("normalizes invalid AI output without throwing", () => {
    expect(
      parseProjectSiteSchema(
        {
          version: 1,
          businessName: "  Toko   Roti  ",
          headline: " ",
          subheadline: "Roti hangat untuk keluarga.",
          primaryCta: "Pesan sekarang",
          sections: [
            null,
            "bad",
            { title: " Menu ", body: "Roti, kue, dan kopi." },
          ],
        },
        "Toko roti rumahan",
      ),
    ).toMatchObject({
      version: 1,
      businessName: "Toko Roti",
      headline: "Toko roti rumahan",
      subheadline: "Roti hangat untuk keluarga.",
      primaryCta: "Pesan sekarang",
      sections: [
        { title: "Tentang usaha", body: expect.any(String) },
        { title: "Untuk pelanggan", body: expect.any(String) },
        { title: "Menu", body: "Roti, kue, dan kopi." },
      ],
    });
  });

  it("creates a specific fallback schema from a completed angkringan brief", () => {
    const schema = createProjectSiteSchemaFromBrief({
      version: 1,
      prompt: "buatkan saya website buat jualan angkringan",
      businessName: "",
      businessType: "Warung fisik yang juga ingin terima pesanan online",
      offer:
        "Menu klasik: nasi kucing, sate usus, gorengan, wedang jahe, teh poci",
      targetCustomer: "Anak kos dan mahasiswa yang cari makan murah",
      contactOrCta: "WA + link Google Maps",
      stylePreference: "Hangat dan tradisional dengan nuansa kayu",
      notes: [],
    });

    expect(schema.businessName).toBe("Angkringan Hangat");
    expect(schema.headline.toLowerCase()).toContain("angkringan");
    expect(schema.offer.toLowerCase()).toContain("nasi kucing");
    expect(schema.primaryCta).toBe("Pesan via WhatsApp");
    expect(schema.sections.length).toBeGreaterThanOrEqual(4);
    expect(getProjectSiteSchemaQualityIssues(schema)).toEqual([]);
  });

  it("turns option labels with parenthetical descriptions into natural site copy", () => {
    const schema = createProjectSiteSchemaFromBrief({
      version: 1,
      prompt: "buatkan saya website buat jualan angkringan",
      businessName: "",
      businessType: "Warung fisik yang juga ingin terima pesanan online",
      offer:
        "Menu klasik: nasi kucing, sate usus, gorengan, wedang jahe, teh poci. Harga terjangkau, menu sederhana khas angkringan.",
      targetCustomer:
        "Anak kos & mahasiswa (Cari makan murah, nongkrong santai, biasanya datang malam hari.)",
      contactOrCta:
        "WA + link Google Maps (Selain tombol WA, ada peta lokasi warung supaya yang mau datang langsung mudah menemukan.)",
      stylePreference:
        "Hangat & tradisional (Nuansa kayu, warna coklat-oranye, seperti lesehan angkringan yang akrab. Cocok untuk kesan nostalgia.)",
      notes: [],
    });
    const allCopy = [
      schema.headline,
      schema.subheadline,
      schema.audience,
      ...schema.trustPoints,
      ...schema.sections.flatMap((section) => [section.title, section.body]),
    ].join(" ");

    expect(schema.businessName).toBe("Angkringan Hangat");
    expect(schema.headline).toBe(
      "Angkringan hangat untuk anak kos dan mahasiswa",
    );
    expect(schema.audience).toBe("Anak kos dan mahasiswa");
    expect(schema.trustPoints).toEqual(
      expect.arrayContaining([
        "WhatsApp dan Google Maps mudah ditemukan",
        "Nuansa hangat dan tradisional",
      ]),
    );
    expect(allCopy).not.toContain("(");
    expect(allCopy).not.toContain("&");
    expect(
      getProjectSiteSchemaQualityIssues(schema, {
        version: 1,
        prompt: "buatkan saya website buat jualan angkringan",
        businessName: "",
        businessType: "Warung fisik yang juga ingin terima pesanan online",
        offer: "Menu klasik: nasi kucing, sate usus, gorengan",
        targetCustomer: "Anak kos dan mahasiswa",
        contactOrCta: "WA + link Google Maps",
        stylePreference: "Hangat dan tradisional",
        notes: [],
      }),
    ).toEqual([]);
  });

  it("flags generic fallback schema as unfit for a completed brief", () => {
    const fallback = createFallbackProjectSiteSchema(
      "Permintaan awal: buatkan saya website buat jualan angkringan Bid",
    );

    expect(
      getProjectSiteSchemaQualityIssues(fallback, {
        version: 1,
        prompt: "buatkan saya website buat jualan angkringan",
        businessName: "",
        businessType: "Warung fisik yang juga ingin terima pesanan online",
        offer: "Menu klasik: nasi kucing, sate usus, gorengan",
        targetCustomer: "Anak kos dan mahasiswa",
        contactOrCta: "WA + link Google Maps",
        stylePreference: "Hangat dan tradisional",
        notes: [],
      }),
    ).toEqual(
      expect.arrayContaining([
        "business_name_is_prompt",
        "offer_is_generic",
        "offer_not_reflected",
      ]),
    );
  });

  it("flags incomplete AI schema candidates before fallback fields are applied", () => {
    expect(
      getProjectSiteSchemaCandidateIssues({
        version: 1,
        businessName: "Angkringan Hangat",
        headline: "Angkringan untuk anak kos",
      }),
    ).toEqual(
      expect.arrayContaining([
        "missing_offer",
        "missing_trust_points",
        "missing_sections",
        "missing_theme",
      ]),
    );
  });
});
