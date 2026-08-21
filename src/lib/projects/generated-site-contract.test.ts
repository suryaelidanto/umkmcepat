import { describe, expect, it } from "vitest";

import { hashBuildContract, hashBuildPlan } from "./build-hash";
import { parseCanonicalBrief } from "./canonical-brief";
import {
  compileGeneratedSiteContract,
  compileGeneratedSiteWriterContractV2,
  createDeterministicGeneratedSiteControlRoute,
} from "./generated-site-contract";
import { selectGeneratedSiteDesignKit } from "./generated-site-design-kits/catalog";
import { selectGeneratedSiteRecipe } from "./generated-site-recipes";
import { createProjectSiteSchemaFromGeneratedContract } from "./site-schema";

import type { ProjectBrief } from "./brief";
import type { BuildContractV1 } from "./build-contract";
import type { AcceptedBuildHandoff } from "./build-handoffs";
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

function acceptedHandoff(
  values: ReturnType<typeof fixtures>,
): AcceptedBuildHandoff {
  return {
    id: "handoff-1",
    briefSnapshot: values.briefSnapshot,
    briefHash: "c".repeat(64),
    briefRevision: 2,
    contract: values.contract,
    plan: values.plan,
    contractHash: values.contract.contentHash,
    planHash: values.plan.contentHash,
    contractRevision: 1,
    planRevision: 1,
    creativeDirection: null,
  };
}

describe("compileGeneratedSiteContract", () => {
  it("derives public fashion copy when the accepted brief has no tagline", () => {
    const values = fixtures();
    const result = compileGeneratedSiteContract({
      briefSnapshot: {
        ...values.briefSnapshot,
        content: { ...values.briefSnapshot.content, tagline: null },
      },
      contract: values.contract,
      plan: values.plan,
      photoEnabled: false,
      recipe: selectGeneratedSiteRecipe(values.plan.archetype),
    });

    expect(result.content.headline).toBe("Koleksi iPhone 13 Pilihan Terbaik");
    expect(result.content.subheadline).toContain(
      "Temukan berbagai pilihan iPhone 13",
    );
    expect(result.content.trustPoints).toEqual(
      expect.arrayContaining(["Kondisi unit tercatat"]),
    );
  });

  it("routes internal contact actions through home on multi-page sites", () => {
    const values = fixtures();
    const compiled = compileGeneratedSiteContract({
      contract: values.contract,
      plan: values.plan,
      briefSnapshot: values.briefSnapshot,
      photoEnabled: false,
      recipe: selectGeneratedSiteRecipe(values.plan.archetype),
    });
    const contract = {
      ...compiled,
      business: {
        ...compiled.business,
        primaryCta: {
          kind: "browse" as const,
          label: "Lihat kontak",
          target: "#kontak",
        },
      },
      page: {
        ...compiled.page,
        routes: [
          ...compiled.page.routes,
          {
            path: "/lokasi",
            purpose: "Informasi lokasi",
            requiredContent: [],
          },
        ],
      },
    };

    expect(
      createProjectSiteSchemaFromGeneratedContract({ contract }).contact,
    ).toEqual({ channel: "browse", value: "#/#kontak" });
  });

  it("maps accepted facts, routes, CTA, and customer-facing sections", () => {
    const result = compile({ photoEnabled: false });
    expect(result.business.primaryCta).toMatchObject({
      kind: "whatsapp",
      label: "Chat WhatsApp",
      target: "+628123456789",
    });
    expect(result.content.products[0]?.name).toBe("iPhone 13");
    expect(result.content.socialLinks[0]?.url).toContain("instagram.com");
    expect(
      result.page.requiredSections.every(
        (section) => !/intro|primary cta|hero|catalog/i.test(section.purpose),
      ),
    ).toBe(true);
    expect(result.page.requiredSections.map((section) => section.id)).toEqual([
      "catalog",
      "contact",
    ]);
    expect(JSON.stringify(result)).not.toContain("ProductCard");
    expect(result.contractHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("creates a compact route that renders accepted site fields", () => {
    const source = createDeterministicGeneratedSiteControlRoute(
      compile({ photoEnabled: false }),
    );

    expect(source).toContain('import { site } from "@/content/site"');
    expect(source).toContain("site.headline");
    expect(source).toContain("site.primaryCta");
    expect(source).toContain("site.products.map");
    expect(source).toContain("site.trustPoints.map");
    expect(source).toContain('id="catalog"');
    expect(source).not.toContain("placeholder");
    expect(source.length).toBeLessThan(7_000);
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

  it("compiles the reference-calibrated V2 writer contract without default-theme rendering", () => {
    const values = fixtures({ archetype: "retail-catalog" });
    const kit = selectGeneratedSiteDesignKit({
      archetype: "retail-catalog",
      density: "rich",
      mediaMode: "graphic",
      primaryJobKind: "compare",
      hasOperationalDetails: false,
    });
    const result = compileGeneratedSiteWriterContractV2({
      handoff: acceptedHandoff(values),
      briefSnapshot: values.briefSnapshot,
      photoEnabled: false,
      kit,
    });
    expect(result.schemaVersion).toBe(2);
    expect(result.visualInputs.selectedKitId).toBe("catalog-story");
    expect(result.media.mode).toBe("graphic");
    expect(result.obligations.sections.map((section) => section.id)).toEqual([
      "catalog",
      "contact",
    ]);
    expect(result.content.products[0]?.name).toBe("iPhone 13");
    expect(result.contractHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(result)).not.toContain("defaultTheme");
  });

  it("keeps sparse no-photo contracts image-free and rejects interactive apps", () => {
    const values = fixtures({ archetype: "generic" });
    values.plan.appKind = "interactive_app";
    expect(() =>
      compileGeneratedSiteWriterContractV2({
        handoff: acceptedHandoff(values),
        briefSnapshot: values.briefSnapshot,
        photoEnabled: false,
        kit: selectGeneratedSiteDesignKit({
          archetype: "generic",
          density: "sparse",
          mediaMode: "typographic",
          primaryJobKind: "inquire",
          hasOperationalDetails: false,
        }),
      }),
    ).toThrow(
      "generated-site quality supports landing and marketing_site only",
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
