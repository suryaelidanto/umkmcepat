import { describe, expect, it } from "vitest";

import {
  buildContextualWhatsAppHref,
  createFallbackProjectSiteSchema,
  createProjectSiteSchemaFromBrief,
  createProjectSiteSchemaFromGeneratedContract,
  parseProjectSiteSchema,
} from "./site-schema";
import {
  getProjectSiteSchemaCandidateIssues,
  getProjectSiteSchemaQualityIssues,
  resolveProjectSiteSchemaCandidate,
} from "./site-schema-issues";

import type { ProjectBrief } from "./brief";

describe("project site schema", () => {
  it("builds rich contextual WhatsApp hrefs based on business name and offer", () => {
    const full = buildContextualWhatsAppHref(
      "081234567890",
      "Kopi Senja",
      "Kopi Susu Gula Aren",
    );
    expect(full).toBe(
      "https://wa.me/6281234567890?text=Halo%20Kopi%20Senja%2C%20saya%20mau%20tanya%20info%20dan%20pesan%20Kopi%20Susu%20Gula%20Aren.",
    );

    const nameOnly = buildContextualWhatsAppHref("081234567890", "Kopi Senja");
    expect(nameOnly).toBe(
      "https://wa.me/6281234567890?text=Halo%20Kopi%20Senja%2C%20saya%20mau%20tanya%20informasi%20dan%20pemesanan.",
    );
  });

  it("populates images array in site schema from generated contract approvedAssets", () => {
    const schema = createProjectSiteSchemaFromGeneratedContract({
      contract: {
        business: {
          name: "Kedai Kopi",
          primaryCta: { kind: "whatsapp", label: "Chat", target: "0812" },
          primaryJob: "Pesan kopi",
        },
        content: {
          headline: "Kopi Nikmat",
          subheadline: "Kedai lokal",
          offer: "Espresso",
          trustPoints: [],
          products: [],
          testimonials: [],
          hours: [],
          paymentMethods: [],
          socialLinks: [],
        },
        page: { requiredSections: [], routes: [] },
        design: {
          approvedAssets: [
            {
              assetId: "asset_abc",
              mediaPath: "/media/asset_abc",
              purpose: "hero",
            },
          ],
        },
      } as unknown as import("./generated-site-contract").GeneratedSiteContractV1,
    });

    expect(schema.images).toEqual([
      { url: "/api/media/asset_abc", purpose: "hero", alt: "Kedai Kopi" },
    ]);
  });

  it("leaves images undefined when no assets were uploaded (images is strictly optional)", () => {
    const schema = createProjectSiteSchemaFromGeneratedContract({
      contract: {
        business: {
          name: "Kedai Kopi",
          primaryCta: { kind: "whatsapp", label: "Chat", target: "0812" },
          primaryJob: "Pesan kopi",
        },
        content: {
          headline: "Kopi Nikmat",
          subheadline: "Kedai lokal",
          offer: "Espresso",
          trustPoints: [],
          products: [],
          testimonials: [],
          hours: [],
          paymentMethods: [],
          socialLinks: [],
        },
        page: { requiredSections: [], routes: [] },
      } as unknown as import("./generated-site-contract").GeneratedSiteContractV1,
    });

    expect(schema.images).toBeUndefined();
  });

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

  it("creates a valid schema from a completed brief", () => {
    const schema = createProjectSiteSchemaFromBrief({
      version: 1,
      prompt: "buatkan saya website buat usaha lokal",
      businessName: "Usaha Berkah",
      businessType: "Toko fisik dan online",
      offer: "Produk pilihan berkualitas dan terpercaya",
      targetCustomer: "Masyarakat umum",
      contactOrCta: "WhatsApp 08123456789",
      stylePreference: "Hangat dan profesional",
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

    expect(schema.version).toBe(1);
    expect(typeof schema.businessName).toBe("string");
    expect(typeof schema.headline).toBe("string");
    expect(typeof schema.primaryCta).toBe("string");
    expect(schema.sections.length).toBeGreaterThanOrEqual(1);
    expect(getProjectSiteSchemaQualityIssues(schema)).toEqual([]);
  });

  it("falls back usp to the already-computed trustPoints when the brief has none", () => {
    // compileGeneratedSiteContract auto-fills content.usp with grounded
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

  it("cleans parenthetical symbols from natural site copy", () => {
    const schema = createProjectSiteSchemaFromBrief({
      version: 1,
      prompt: "buatkan saya website",
      businessName: "Usaha Maju",
      businessType: "Jasa",
      offer: "Layanan utama pilihan",
      targetCustomer: "Pelanggan setia",
      contactOrCta: "WhatsApp 08123456789",
      stylePreference: "Modern",
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

    expect(schema.businessName).toBe("Usaha Maju");
    expect(typeof schema.headline).toBe("string");
    expect(allCopy).not.toContain("(");
    expect(allCopy).not.toContain("&");
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

    expect(typeof schema.headline).toBe("string");
    expect(schema.headline.length).toBeGreaterThan(0);
    expect(allCopy.length).toBeGreaterThan(0);
    expect(allCopy.toLowerCase()).not.toContain("not provided");
    expect(allCopy.toLowerCase()).not.toContain("undefined");
  });
});
