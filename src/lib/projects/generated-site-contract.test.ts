import { describe, expect, it } from "vitest";

import { hashBuildContract, hashBuildPlan } from "./build-hash";
import { parseCanonicalBrief } from "./canonical-brief";
import { compileGeneratedSiteContract } from "./generated-site-contract";
import { selectGeneratedSiteRecipe } from "./generated-site-recipes";

import type { ProjectBrief } from "./brief";
import type { BuildContractV1 } from "./build-contract";
import type { BuildPlanV1 } from "./build-plan";

function fixtures(input?: {
  assets?: BuildContractV1["assets"];
  archetype?: string;
}): {
  brief: ProjectBrief;
  briefSnapshot: ReturnType<typeof parseCanonicalBrief>;
  contract: BuildContractV1;
  plan: BuildPlanV1;
} {
  const contract: BuildContractV1 = {
    schemaVersion: 1,
    revision: 1,
    contentHash: "",
    identity: { businessName: "SuryaPhone", businessType: "retail" },
    facts: [
      {
        id: "offer-1",
        kind: "offer",
        value: [
          {
            name: "iPhone 13",
            description: "Battery health tercatat",
            priceRange: "Rp 3–4 juta",
            isPrimary: true,
          },
        ],
        provenance: {
          source: "owner",
          turnId: "turn-1",
          assetId: null,
          supersedesFactId: null,
          reviewItemId: null,
        },
      },
      {
        id: "contact-1",
        kind: "contact",
        value: { channel: "whatsapp", value: "+628123456789" },
        provenance: {
          source: "owner",
          turnId: "turn-1",
          assetId: null,
          supersedesFactId: null,
          reviewItemId: null,
        },
      },
      {
        id: "social-1",
        kind: "social_link",
        value: [
          {
            platform: "instagram",
            handle: "@suryaphone",
            url: "https://instagram.com/suryaphone",
          },
        ],
        provenance: {
          source: "owner",
          turnId: "turn-1",
          assetId: null,
          supersedesFactId: null,
          reviewItemId: null,
        },
      },
    ],
    decisions: [],
    visitorJobs: [
      { id: "job-browse", goal: "Memilih iPhone", priority: "primary" },
    ],
    ctaIntents: [
      {
        id: "cta-wa",
        kind: "whatsapp",
        label: "Chat WhatsApp",
        targetFactId: "contact-1",
      },
    ],
    hardRequirements: [],
    prohibitedClaims: [
      { id: "claim-stock", statement: "Jangan mengarang stok" },
    ],
    preferences: {
      visualDirection: "gelap dan presisi",
      tone: null,
      density: "balanced",
      motion: "minimal",
    },
    assets: input?.assets ?? [],
    blockers: [],
    omissions: [],
  };
  contract.contentHash = hashBuildContract(contract);
  const plan: BuildPlanV1 = {
    schemaVersion: 1,
    revision: 1,
    contractHash: contract.contentHash,
    contentHash: "",
    appKind: "landing",
    archetype: input?.archetype ?? "retail-catalog",
    pages: [
      {
        id: "home",
        path: "/",
        title: "SuryaPhone",
        purpose: "Membantu pembeli memilih iPhone dan menghubungi penjual.",
        visitorJobIds: ["job-browse"],
        requiredFactIds: ["offer-1", "contact-1", "social-1"],
        sections: [
          {
            id: "catalog",
            purpose: "Bandingkan pilihan iPhone.",
            surfaceIntent: "contained",
            requiredFactIds: ["offer-1"],
            requiredAssetIds: [],
          },
          {
            id: "contact",
            purpose: "Hubungi penjual melalui WhatsApp.",
            surfaceIntent: "contained",
            requiredFactIds: ["contact-1"],
            requiredAssetIds: [],
          },
        ],
      },
    ],
    navigation: [],
    capabilities: ["catalog", "whatsapp_cta"],
    artDirection: {
      businessSpecificReference: "etalase perangkat yang presisi",
      antiReferences: ["generic card grid"],
      imageStrategy: "graphic",
      fontStrategy: "system_stack",
    },
  };
  plan.contentHash = hashBuildPlan(plan);
  const brief: ProjectBrief = {
    version: 1,
    prompt: "jualan iPhone bekas",
    facts: [],
    decisions: [],
    businessName: "SuryaPhone",
    businessType: "retail",
    offer: "iPhone bekas dengan kondisi tercatat",
    targetCustomer: "Pembeli iPhone bekas",
    contactOrCta: "Chat WhatsApp",
    stylePreference: "gelap dan presisi",
    notes: [],
    confidence: 100,
    openQuestions: [],
    productOrService: [
      {
        name: "iPhone 13",
        description: "Battery health tercatat",
        priceRange: "Rp 3–4 juta",
        isPrimary: true,
      },
    ],
    contact: { channel: "whatsapp", value: "+628123456789" },
    tagline: "Pilih unit dengan jelas",
    usp: ["Kondisi unit tercatat"],
    priceRange: "Rp 3–4 juta",
    visuals: null,
    hours: null,
    address: null,
    deliveryArea: null,
    since: null,
    testimonials: null,
    certifications: null,
    paymentMethods: null,
    socialLinks: [
      {
        platform: "instagram",
        handle: "@suryaphone",
        url: "https://instagram.com/suryaphone",
      },
    ],
    currentPromo: null,
    secondaryCta: { label: "Lihat katalog", action: "browse" },
    readyForBuild: true,
  };
  const briefSnapshot = parseCanonicalBrief(brief, brief.prompt);
  return { brief, briefSnapshot, contract, plan };
}

function compile(input: {
  photoEnabled: boolean;
  assets?: BuildContractV1["assets"];
}) {
  const values = fixtures({ assets: input.assets });
  const { brief: _brief, ...rest } = values as unknown as Record<
    string,
    unknown
  >;
  return compileGeneratedSiteContract({
    ...(rest as unknown as {
      briefSnapshot: ReturnType<typeof parseCanonicalBrief>;
      contract: BuildContractV1;
      plan: BuildPlanV1;
    }),
    photoEnabled: input.photoEnabled,
    recipe: selectGeneratedSiteRecipe(values.plan.archetype),
  });
}

describe("compileGeneratedSiteContract", () => {
  it("maps accepted facts, routes, CTA, and customer-facing sections", () => {
    const result = compile({ photoEnabled: false });
    expect(result.business.primaryCta).toMatchObject({
      kind: "whatsapp",
      label: "Chat WhatsApp",
      target: "+628123456789",
    });
    expect(result.content.products[0]?.name).toBe("iPhone 13");
    expect(result.content.socialLinks[0]?.url).toContain("instagram.com");
    expect(result.page.requiredSections.map((section) => section.id)).toEqual([
      "catalog",
      "contact",
    ]);
    expect(JSON.stringify(result)).not.toContain("ProductCard");
    expect(result.contractHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("uses graphic or typographic media when photos are disabled", () => {
    expect(compile({ photoEnabled: false }).design.mediaMode).toMatch(
      /graphic|typographic/,
    );
  });

  it("uses approved owner media when photos are enabled and assets exist", () => {
    const result = compile({
      photoEnabled: true,
      assets: [{ assetId: "asset-1", approvedPurpose: "hero" }],
    });
    expect(result.design.mediaMode).toBe("owner_assets");
    expect(result.design.approvedAssets).toEqual([
      {
        assetId: "asset-1",
        mediaPath: "/media/asset-1",
        purpose: "hero",
      },
    ]);
  });

  it("permits replaceable slots only for image-benefiting recipes", () => {
    expect(compile({ photoEnabled: true }).design.mediaMode).toBe(
      "replaceable_slots",
    );
  });

  it("rejects interactive apps in this phase", () => {
    const values = fixtures();
    values.plan.appKind = "interactive_app";
    const { brief: _b, ...rest } = values as unknown as Record<string, unknown>;
    expect(() =>
      compileGeneratedSiteContract({
        ...(rest as unknown as {
          briefSnapshot: ReturnType<typeof parseCanonicalBrief>;
          contract: BuildContractV1;
          plan: BuildPlanV1;
        }),
        photoEnabled: false,
        recipe: selectGeneratedSiteRecipe(values.plan.archetype),
      }),
    ).toThrow(
      "generated-site quality supports landing and marketing_site only",
    );
  });
});
