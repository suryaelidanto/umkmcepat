import { describe, expect, it } from "vitest";

import {
  buildContextualWhatsAppHref,
  createFallbackProjectSiteSchema,
  createProjectSiteSchemaFromAcceptedHandoff,
  createProjectSiteSchemaFromBrief,
  parseProjectSiteSchema,
} from "./site-schema";

import type { ProjectBrief } from "./brief";
import type { BuildContractV1 } from "./build-contract";
import type { BuildPlanV1 } from "./build-plan";
import type { ProjectBriefV2 } from "./canonical-brief";

const acceptedBrief: ProjectBriefV2 = {
  version: 2,
  prompt: "Buat website usaha lokal",
  business: { name: "Usaha Nusantara", type: "usaha lokal", category: "other" },
  offers: [{ name: "Layanan utama", isPrimary: true }],
  visitorJobs: [],
  audience: "Pelanggan sekitar",
  primaryAction: { kind: "whatsapp", label: "Chat", target: "08123456789" },
  visualDirection: "Jelas",
  fieldState: {},
  content: {
    tagline: null,
    usp: [],
    priceRange: null,
    hours: [],
    address: null,
    deliveryArea: null,
    since: null,
    testimonials: [],
    certifications: [],
    paymentMethods: [],
    socialLinks: [],
    currentPromo: null,
    secondaryAction: null,
  },
  assets: [{ id: "asset-1", purpose: "business-image" }],
  provenance: { facts: [], decisions: [] },
};

const acceptedContract: BuildContractV1 = {
  schemaVersion: 1,
  revision: 1,
  contentHash: "contract-hash",
  identity: { businessName: "Usaha Nusantara", businessType: "usaha lokal" },
  facts: [],
  decisions: [],
  visitorJobs: [],
  ctaIntents: [{ id: "cta-primary", kind: "whatsapp", label: "Chat" }],
  hardRequirements: [],
  prohibitedClaims: [],
  preferences: {
    visualDirection: "Jelas",
    tone: null,
    density: null,
    motion: null,
  },
  assets: [{ assetId: "asset-1", approvedPurpose: "hero" }],
  blockers: [],
  omissions: [],
};

const acceptedPlan: BuildPlanV1 = {
  schemaVersion: 1,
  revision: 1,
  contractHash: "contract-hash",
  contentHash: "plan-hash",
  appKind: "landing",
  pages: [
    {
      id: "home",
      path: "/",
      title: "Beranda",
      purpose: "Informasi usaha",
      visitorJobIds: [],
      requiredFactIds: [],
    },
    {
      id: "contact",
      path: "/hubungi",
      title: "Hubungi",
      purpose: "Kontak usaha",
      visitorJobIds: [],
      requiredFactIds: [],
    },
  ],
  navigation: [],
  capabilities: ["static_content"],
};

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

  it("derives schema routes and approved assets from the accepted handoff", () => {
    const schema = createProjectSiteSchemaFromAcceptedHandoff({
      briefSnapshot: acceptedBrief,
      contract: acceptedContract,
      plan: acceptedPlan,
    });

    expect(schema.businessName).toBe("Usaha Nusantara");
    expect(schema.routes).toEqual([
      { path: "/", title: "Beranda" },
      { path: "/hubungi", title: "Hubungi" },
    ]);
    expect(schema.images).toEqual([
      { url: "/api/media/asset-1", purpose: "hero", alt: "Usaha Nusantara" },
    ]);
  });

  it("keeps the accepted handoff complete when it has no approved assets", () => {
    const schema = createProjectSiteSchemaFromAcceptedHandoff({
      briefSnapshot: { ...acceptedBrief, assets: [] },
      contract: { ...acceptedContract, assets: [] },
      plan: acceptedPlan,
    });

    expect(schema.images).toEqual([]);
    expect(schema.routes).toHaveLength(2);
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
});
