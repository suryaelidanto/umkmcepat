import { describe, expect, it } from "vitest";

import {
  createProjectSiteSchemaFromBrief,
  createFallbackProjectSiteSchema,
  parseProjectSiteSchema,
} from "./site-schema";
import {
  getProjectSiteSchemaCandidateIssues,
  getProjectSiteSchemaQualityIssues,
  resolveProjectSiteSchemaCandidate,
} from "./site-schema-issues";

import type { ProjectBrief } from "./brief";

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
      productOrService: null,
      contact: null,
      tagline: null,
      usp: null,
      priceRange: null,
      visuals: null,
      hours: null,
      address: null,
      deliveryArea: null,
      since: null,
      testimonials: null,
      certifications: null,
      paymentMethods: null,
      socialLinks: null,
      currentPromo: null,
      secondaryCta: null,
      readyForBuild: false,
    });

    expect(schema.businessName).toBe("Angkringan Hangat");
    expect(schema.headline.toLowerCase()).toContain("angkringan");
    expect(schema.offer.toLowerCase()).toContain("nasi kucing");
    expect(schema.primaryCta).toBe("Pesan via WhatsApp");
    expect(schema.sections.length).toBeGreaterThanOrEqual(4);
    expect(getProjectSiteSchemaQualityIssues(schema)).toEqual([]);
  });

  it("falls back usp to the already-computed trustPoints when the brief has none", () => {
    // compileGeneratedSiteContract auto-fills content.usp with grounded
    // fallback copy (publicTrustPoints) even when the brief's usp is empty,
    // and referenceCalibratedRequiredContentFields requires site.usp whenever
    // that fallback ran. Reproduced live: the writer had no site.usp to
    // render at all — an unsatisfiable requirement — because this schema
    // left usp undefined while the contract already considered it populated.
    // trustPoints is computed unconditionally, two lines above usp, from the
    // same grounded offer/contactOrCta/stylePreference fields, so reusing it
    // costs nothing invented.
    const schema = createProjectSiteSchemaFromBrief({
      version: 1,
      prompt: "buatkan saya website buat jualan angkringan",
      businessName: "",
      businessType: "Warung fisik yang juga ingin terima pesanan online",
      offer: "Menu klasik: nasi kucing, sate usus",
      targetCustomer: "Anak kos dan mahasiswa",
      contactOrCta: "WA + link Google Maps",
      stylePreference: "Hangat dan tradisional",
      notes: [],
      productOrService: null,
      contact: null,
      tagline: null,
      usp: null,
      priceRange: null,
      visuals: null,
      hours: null,
      address: null,
      deliveryArea: null,
      since: null,
      testimonials: null,
      certifications: null,
      paymentMethods: null,
      socialLinks: null,
      currentPromo: null,
      secondaryCta: null,
      readyForBuild: false,
    } as ProjectBrief);

    expect(schema.usp).toEqual(schema.trustPoints);
    expect(schema.usp?.length).toBeGreaterThan(0);
  });

  it("truncates an overlong offer at a word boundary with a visible ellipsis, never mid-word", () => {
    // Reproduced live: a real build's offer text was hard-sliced to a fixed
    // character count, landing mid-word and mid-clause with no closing
    // punctuation ("...seblak ceker bakso sosis " with nothing after it) —
    // reads as broken copy, not shortened copy, to the owner reviewing it.
    const longOffer =
      "Seblak Ceker sih yang paling laku sekarang, seblak ada 3 menu saat ini: seblak ceker Rp10.000, seblak ceker bakso sosis Rp15.000, seblak sultan Rp20.000 lengkap dengan kerupuk dan isian lengkap";
    const schema = createProjectSiteSchemaFromBrief({
      version: 1,
      prompt: "Saya jualan seblak namanya Seblak Surya",
      businessName: "Seblak Surya",
      businessType: "fnb",
      offer: longOffer,
      targetCustomer: "Mahasiswa dan anak sekolah",
      contactOrCta: "Chat WhatsApp ke 08123456789",
      stylePreference: "Pedas dan menggugah selera",
      notes: [],
      productOrService: null,
      contact: null,
      tagline: null,
      usp: null,
      priceRange: null,
      visuals: null,
      hours: null,
      address: null,
      deliveryArea: null,
      since: null,
      testimonials: null,
      certifications: null,
      paymentMethods: null,
      socialLinks: null,
      currentPromo: null,
      secondaryCta: null,
      readyForBuild: false,
    } as ProjectBrief);

    expect(schema.offer.length).toBeLessThanOrEqual(120);
    expect(schema.offer.endsWith("…")).toBe(true);
    const truncatedBody = schema.offer.slice(0, -1);
    const nextChar = longOffer[truncatedBody.length];
    expect(nextChar === undefined || nextChar === " ").toBe(true);
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
      productOrService: null,
      contact: null,
      tagline: null,
      usp: null,
      priceRange: null,
      visuals: null,
      hours: null,
      address: null,
      deliveryArea: null,
      since: null,
      testimonials: null,
      certifications: null,
      paymentMethods: null,
      socialLinks: null,
      currentPromo: null,
      secondaryCta: null,
      readyForBuild: false,
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
        productOrService: null,
        contact: null,
        tagline: null,
        usp: null,
        priceRange: null,
        visuals: null,
        hours: null,
        address: null,
        deliveryArea: null,
        since: null,
        testimonials: null,
        certifications: null,
        paymentMethods: null,
        socialLinks: null,
        currentPromo: null,
        secondaryCta: null,
        readyForBuild: false,
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
        productOrService: null,
        contact: null,
        tagline: null,
        usp: null,
        priceRange: null,
        visuals: null,
        hours: null,
        address: null,
        deliveryArea: null,
        since: null,
        testimonials: null,
        certifications: null,
        paymentMethods: null,
        socialLinks: null,
        currentPromo: null,
        secondaryCta: null,
        readyForBuild: false,
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
  it("uses deterministic brief schema when AI structured output is empty but fallback is specific", () => {
    const brief = {
      version: 1 as const,
      prompt: "buatkan website bengkel motor",
      businessName: "Website Bengkel Motor",
      businessType: "Bengkel servis motor harian",
      offer:
        "Ganti ban dan velg, perbaikan kelistrikan, aki, lampu, klakson, ECU",
      targetCustomer:
        "Pengendara harian, pekerja kantoran, mahasiswa, dan ibu-ibu pengguna motor",
      contactOrCta: "Booking servis dan konsultasi lewat WhatsApp",
      stylePreference: "Modern bersih, rapi, jelas, dan mudah dipercaya",
      notes: [],
      productOrService: null,
      contact: null,
      tagline: null,
      usp: null,
      priceRange: null,
      visuals: null,
      hours: null,
      address: null,
      deliveryArea: null,
      since: null,
      testimonials: null,
      certifications: null,
      paymentMethods: null,
      socialLinks: null,
      currentPromo: null,
      secondaryCta: null,
      readyForBuild: false,
    };
    const fallbackSchema = createProjectSiteSchemaFromBrief(brief);

    const result = resolveProjectSiteSchemaCandidate({
      brief,
      fallbackSchema,
      value: {},
    });

    expect(result.issues).toEqual([]);
    expect(result.schema).toBe(fallbackSchema);
    expect(result.usedDeterministicFallback).toBe(true);
  });
  it("creates specific automotive copy instead of menu-style fallback sections", () => {
    const schema = createProjectSiteSchemaFromBrief({
      version: 1,
      prompt: "buatkan website bengkel motor",
      businessName: "Website Bengkel Motor",
      businessType: "Bengkel servis motor harian",
      offer:
        "Ganti ban dan velg, perbaikan kelistrikan, aki, lampu, klakson, ECU",
      targetCustomer: "Pengendara harian dan pekerja sekitar",
      contactOrCta: "Booking servis lewat WhatsApp",
      stylePreference: "Modern bersih dan teknis",
      notes: [],
      productOrService: null,
      contact: null,
      tagline: null,
      usp: null,
      priceRange: null,
      visuals: null,
      hours: null,
      address: null,
      deliveryArea: null,
      since: null,
      testimonials: null,
      certifications: null,
      paymentMethods: null,
      socialLinks: null,
      currentPromo: null,
      secondaryCta: null,
      readyForBuild: false,
    });
    const allCopy = [
      schema.headline,
      schema.subheadline,
      ...schema.trustPoints,
      ...schema.sections.flatMap((section) => [section.title, section.body]),
    ].join(" ");

    expect(schema.headline.toLowerCase()).toContain("servis motor");
    expect(allCopy.toLowerCase()).toContain("kelistrikan");
    expect(allCopy.toLowerCase()).toContain("booking");
    expect(allCopy.toLowerCase()).not.toContain("menu malam");
    expect(allCopy.toLowerCase()).not.toContain("datang malam");
  });
});
