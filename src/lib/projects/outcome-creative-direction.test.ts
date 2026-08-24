import { describe, expect, it } from "vitest";

import {
  type CreativeDirectionV1,
  validateCreativeDirection,
} from "./outcome-creative-direction";

import type { OutcomeDirectedSiteContractV1 } from "./outcome-site-contract";

const contract: OutcomeDirectedSiteContractV1 = {
  acceptedContent: {
    address: null,
    certifications: [],
    deliveryArea: "Radius 5km",
    hours: [],
    otherFacts: [],
    paymentMethods: [],
    priceRange: null,
    promotion: null,
    socialLinks: [],
    tagline: null,
    testimonials: [],
    usp: ["Antar jemput cepat"],
  },
  actions: [
    {
      href: "https://wa.me/628123456789",
      id: "cta-wa",
      kind: "whatsapp",
      label: "Chat WhatsApp",
      priority: "primary",
    },
  ],
  business: {
    audience: "Warga sibuk",
    name: "Kilau Laundry",
    type: "jasa_lokal",
  },
  contractHash: "hash-kilau-1",
  media: { approvedAssets: [], mode: "graphic" },
  offers: [
    {
      description: "Cuci dan setrika harian",
      factId: "offer-1",
      isPrimary: true,
      name: "Laundry reguler",
      priceRange: null,
    },
  ],
  omissions: [],
  prohibitedClaims: ["no-fake-awards"],
  routes: [
    {
      path: "/",
      purpose: "Pesan laundry",
      requiredFactIds: ["offer-1"],
      visitorJobIds: ["job-1"],
    },
  ],
  schemaVersion: 1,
  visitorJobs: [
    { goal: "Pesan antar jemput", id: "job-1", priority: "primary" },
  ],
};

const validDirection: CreativeDirectionV1 = {
  businessAnchors: [
    {
      acceptedFactId: "offer-1",
      relevance: "Fokus utama adalah kenyamanan cuci harian selesai rapi.",
      source: "offer",
    },
  ],
  character: ["segar", "efisien", "bersahabat"],
  contractHash: "hash-kilau-1",
  factualBoundaries: ["Tidak ada data harga kiloan pasti di awal"],
  firstViewPriority: "Menunjukkan kemudahan langsung pesan via WhatsApp",
  genericityRisks: ["Jangan terlihat seperti landing page korporat kaku"],
  mobileIntent: "Tombol pesan mudah dijangkau dengan jempol di HP",
  schemaVersion: 1,
  visitorReading:
    "Pelanggan ingin urusan cuci selesai tanpa buang waktu akhir pekan.",
  visualThesis:
    "Menghadirkan kesan pakaian bersih dan waktu luang kembali lega.",
};

describe("validateCreativeDirection", () => {
  it("validates high-level direction that respects the contract", () => {
    expect(validateCreativeDirection(validDirection, contract)).toEqual({
      ok: true,
    });
  });

  it("rejects direction with mismatching contract hash", () => {
    const invalid = { ...validDirection, contractHash: "wrong-hash" };
    expect(validateCreativeDirection(invalid, contract)).toEqual({
      ok: false,
      reason: "contract_hash_mismatch",
    });
  });

  it("rejects direction that prescribes specific layout templates", () => {
    const prescriptive = {
      ...validDirection,
      visualThesis: "Use a split hero with 3 equal cards and orange buttons",
    };
    expect(validateCreativeDirection(prescriptive, contract)).toEqual({
      ok: false,
      reason: "prescriptive_visual_solution",
    });
  });

  it("rejects direction without any accepted business anchors", () => {
    const noAnchors = { ...validDirection, businessAnchors: [] };
    expect(validateCreativeDirection(noAnchors, contract)).toEqual({
      ok: false,
      reason: "missing_business_anchors",
    });
  });
});
