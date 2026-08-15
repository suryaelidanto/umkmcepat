import { describe, expect, it } from "vitest";

import {
  compileGeneratedSiteWriterContractV3,
  compileProfessionalPrimaryCta,
  deriveProfessionalSiteSelectionInput,
  type GeneratedSiteHandoffInput,
  type GeneratedSiteWriterContractV3,
} from "./generated-site-contract";
import {
  compileProfessionalSiteBlueprint,
  deriveProfessionalRouteRoles,
} from "./professional-site-blueprint";
import { PROFESSIONAL_DESIGN_KITS } from "./professional-site-kits";

import type { ContractFactV1 } from "./build-contract";
import type { BuildPlanV1 } from "./build-plan";
import type { ProjectBriefV2 } from "./canonical-brief";

type Fixture = {
  handoff: GeneratedSiteHandoffInput;
  briefSnapshot: ProjectBriefV2;
  contract: GeneratedSiteWriterContractV3;
};

function provenance() {
  return {
    source: "owner" as const,
    turnId: "turn-1",
    assetId: null,
    supersedesFactId: null,
    reviewItemId: null,
  };
}

function makeFixture(paths: string[] = ["/"]): Fixture {
  const facts: ContractFactV1[] = [
    {
      id: "offer-1",
      kind: "offer",
      value: [
        {
          name: "Kopi Senja",
          description: "Kopi seduh manual",
          priceRange: "Rp 20 ribu",
          isPrimary: true,
        },
      ],
      provenance: provenance(),
    },
    {
      id: "contact-1",
      kind: "contact",
      value: { channel: "whatsapp", value: "+628123456789" },
      provenance: provenance(),
    },
    {
      id: "other-1",
      kind: "other",
      value: "Seduh perlahan di sore hari",
      provenance: provenance(),
    },
  ];
  const contract = {
    schemaVersion: 1 as const,
    revision: 1,
    contentHash: "c".repeat(64),
    identity: { businessName: "Kedai Senja", businessType: "retail" },
    facts,
    decisions: [],
    visitorJobs: [
      { id: "job-browse", goal: "Memilih kopi", priority: "primary" as const },
    ],
    ctaIntents: [
      {
        id: "cta-wa",
        kind: "whatsapp" as const,
        label: "Pesan lewat WhatsApp",
        targetFactId: "contact-1",
      },
    ],
    hardRequirements: [],
    prohibitedClaims: [{ id: "claim-1", statement: "Jangan mengarang rasa" }],
    preferences: {
      visualDirection: "hangat dan tenang",
      tone: null,
      density: "balanced" as const,
      motion: "minimal" as const,
    },
    assets: [],
    blockers: [],
    omissions: [],
  };
  const pages: BuildPlanV1["pages"] = paths.map((path, index) => ({
    id: index === 0 ? "home" : "kelas",
    path,
    title: index === 0 ? "Kedai Senja" : "Pilihan kopi",
    purpose:
      index === 0
        ? "Beranda kedai dan pilihan kopi"
        : "Katalog kopi yang tersedia",
    visitorJobIds: ["job-browse"],
    requiredFactIds: ["offer-1", "contact-1"],
    sections:
      index === 0
        ? [
            {
              id: "catalog",
              purpose: "Pilihan kopi untuk dipilih",
              surfaceIntent: "contained" as const,
              requiredFactIds: ["offer-1"],
              requiredAssetIds: [],
            },
            {
              id: "contact",
              purpose: "Hubungi kedai",
              surfaceIntent: "contained" as const,
              requiredFactIds: ["contact-1"],
              requiredAssetIds: [],
            },
          ]
        : [
            {
              id: "catalog-kelas",
              purpose: "Katalog pilihan kopi",
              surfaceIntent: "contained" as const,
              requiredFactIds: ["offer-1"],
              requiredAssetIds: [],
            },
            {
              id: "story",
              purpose: "Cerita seduh kedai",
              surfaceIntent: "prose" as const,
              requiredFactIds: ["other-1"],
              requiredAssetIds: [],
            },
          ],
  }));
  const plan: BuildPlanV1 = {
    schemaVersion: 1,
    revision: 1,
    contractHash: contract.contentHash,
    contentHash: "p".repeat(64),
    appKind: paths.length === 1 ? "landing" : "marketing_site",
    archetype: "retail-catalog",
    pages,
    navigation:
      paths.length === 1
        ? []
        : [{ fromPageId: "home", toPageId: "kelas", label: "Lihat pilihan" }],
    capabilities: ["catalog", "whatsapp_cta"],
    artDirection: {
      businessSpecificReference: "ritual seduh sore",
      antiReferences: ["generic card grid"],
      imageStrategy: "graphic",
      fontStrategy: "system_stack",
    },
  };
  const briefSnapshot: ProjectBriefV2 = {
    version: 2,
    prompt: "Kedai kopi sore",
    business: { name: "Kedai Senja", type: "retail", category: "retail" },
    offers: facts[0].kind === "offer" ? facts[0].value : [],
    audience: "orang yang ingin menikmati kopi sore",
    primaryAction: {
      kind: "whatsapp",
      label: "Pesan lewat WhatsApp",
      target: "+628123456789",
    },
    visualDirection: "hangat dan tenang",
    fieldState: {},
    content: {
      tagline: "Kopi untuk jeda sore",
      usp: ["Seduh manual"],
      priceRange: "Rp 20 ribu",
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
    assets: [],
    provenance: { facts: [], decisions: [] },
  };
  const handoff: GeneratedSiteHandoffInput = {
    id: "handoff-1",
    briefSnapshot,
    briefHash: "b".repeat(64),
    briefRevision: 2,
    contract,
    plan,
    contractHash: contract.contentHash,
    planHash: plan.contentHash,
    contractRevision: 1,
    planRevision: 1,
  };
  const kit = PROFESSIONAL_DESIGN_KITS.get("catalog-story");
  if (!kit) {
    throw new Error("catalog kit missing from fixture");
  }
  return {
    handoff,
    briefSnapshot,
    contract: compileGeneratedSiteWriterContractV3({
      handoff,
      briefSnapshot,
      photoEnabled: false,
      kit,
    }),
  };
}

function compileBlueprint(paths: string[] = ["/"]) {
  const fixture = makeFixture(paths);
  const kit = PROFESSIONAL_DESIGN_KITS.get("catalog-story");
  if (!kit) {
    throw new Error("blueprint fixture is incomplete");
  }
  return compileProfessionalSiteBlueprint({ contract: fixture.contract, kit });
}

describe("professional V3 contract", () => {
  it("preserves accepted content without V2 synthetic copy", () => {
    const fixture = makeFixture();
    const content = fixture.contract.content;

    expect(content).not.toHaveProperty("headline");
    expect(content).not.toHaveProperty("subheadline");
    expect(content).not.toHaveProperty("trustPoints");
    expect(JSON.stringify(content)).not.toMatch(
      /mudah dipahami|mudah dipesan|pilihan utama terlihat jelas|detail produk mudah dipahami/i,
    );
    expect(content.offers).toEqual(fixture.handoff.contract.facts[0].value);
    expect(content.ownerTagline).toBe("Kopi untuk jeda sore");
    expect(content.heroTitle).toBe("Kopi untuk jeda sore");
    expect(content.labels).toEqual({
      catalog: "Pilihan",
      proof: "Yang perlu diketahui",
      process: "Cara memesan",
      operations: "Informasi usaha",
      contact: "Hubungi",
    });
  });

  it("hashes equal accepted inputs deterministically and indexes only fact ids", () => {
    const first = makeFixture().contract;
    const second = makeFixture().contract;
    expect(first.contractHash).toBe(second.contractHash);
    expect(first.factIndex).toEqual([
      { id: "offer-1", kind: "offer" },
      { id: "contact-1", kind: "contact" },
      { id: "other-1", kind: "other" },
    ]);
    expect(JSON.stringify(first.factIndex)).not.toContain("Kopi Senja");
  });

  it.each([
    ["missing target", undefined],
    ["unknown target", "missing-contact"],
  ])("rejects %s CTA target", (_label, targetFactId) => {
    const fixture = makeFixture();
    const intent = {
      ...fixture.handoff.contract.ctaIntents[0],
      ...(targetFactId === undefined
        ? { targetFactId: undefined }
        : { targetFactId }),
    };
    expect(() =>
      compileProfessionalPrimaryCta({
        contract: { ...fixture.handoff.contract, ctaIntents: [intent] },
        plan: fixture.handoff.plan,
        briefSnapshot: fixture.briefSnapshot,
      }),
    ).toThrow();
  });
});

describe("professional site blueprints", () => {
  it("binds home and multi-route files with accepted first-view evidence", () => {
    const blueprint = compileBlueprint(["/", "/kelas"]);
    expect(
      blueprint.routes.map((route) => [
        route.path,
        route.filePath,
        route.exportName,
      ]),
    ).toEqual([
      ["/", "src/routes/index.tsx", "HomeRouteComponent"],
      ["/kelas", "src/routes/kelas.tsx", "KelasRouteComponent"],
    ]);
    for (const route of blueprint.routes) {
      expect(route.firstView.identityText).toBe("Kedai Senja");
      expect(route.firstView.offerTexts.length).toBeGreaterThan(0);
      expect(route.firstView.primaryCtaLabel).toBe("Pesan lewat WhatsApp");
      expect(route.firstView.primaryCtaHref).toBe("https://wa.me/628123456789");
    }
    expect(blueprint.pageStrategy).toMatchObject({
      mode: "multi",
      reason: "distinct-customer-jobs",
      routeCount: 2,
    });
    expect(blueprint.signatureRoute).toBe("/");
    expect(blueprint.responsive.requireExplicitTransformFor).toEqual(
      expect.arrayContaining([
        "asymmetric-catalog-hero",
        "catalog-narrative-rail",
      ]),
    );
  });

  it("shares route role derivation between selection and blueprint", () => {
    const fixture = makeFixture(["/", "/kelas"]);
    const kit = PROFESSIONAL_DESIGN_KITS.get("catalog-story");
    if (!kit) {
      throw new Error("blueprint fixture is incomplete");
    }
    const selection = deriveProfessionalSiteSelectionInput({
      handoff: fixture.handoff,
      briefSnapshot: fixture.briefSnapshot,
      photoEnabled: false,
    });
    const blueprintRoles = deriveProfessionalRouteRoles({
      handoff: fixture.handoff,
    });
    expect(selection.routeRoles).toEqual(blueprintRoles);
  });

  it.each([
    ["/../admin", "unsafe route path"],
    ["/kelas?x=1", "unsafe route path"],
    ["/kelas#harga", "unsafe route path"],
    ["/:id", "dynamic routes are unsupported"],
    ["/*", "wildcard routes are unsupported"],
  ])("rejects %s", (path, message) => {
    expect(() => compileBlueprint(["/", path])).toThrow(message);
  });

  it("rejects more than three routes and duplicate routes", () => {
    expect(() =>
      compileBlueprint(["/", "/kelas", "/cerita", "/kontak"]),
    ).toThrow("at most three routes");
    expect(() => compileBlueprint(["/", "/kelas", "/kelas"])).toThrow(
      "duplicate route",
    );
  });

  it("keeps sparse content structural without synthesizing filler", () => {
    const fixture = makeFixture();
    fixture.handoff.plan.pages[0].sections = [
      {
        id: "contact",
        purpose: "Hubungi kedai",
        surfaceIntent: "contained",
        requiredFactIds: ["contact-1"],
        requiredAssetIds: [],
      },
    ];
    const blueprint = compileProfessionalSiteBlueprint({
      contract: compileGeneratedSiteWriterContractV3({
        handoff: fixture.handoff,
        briefSnapshot: fixture.briefSnapshot,
        photoEnabled: false,
        kit: PROFESSIONAL_DESIGN_KITS.get("bold-typographic")!,
      }),
      kit: PROFESSIONAL_DESIGN_KITS.get("bold-typographic")!,
    });
    expect(
      blueprint.routes[0]?.sections.map((section) => section.role),
    ).not.toContain("proof");
    expect(
      blueprint.routes[0]?.sections.map((section) => section.role),
    ).not.toContain("catalog");
    expect(
      blueprint.routes[0]?.sections.map((section) => section.role),
    ).toContain("identity");
  });
});
