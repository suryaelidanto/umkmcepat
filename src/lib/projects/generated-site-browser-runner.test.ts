import { describe, expect, it } from "vitest";

import {
  createProfessionalBrowserPolicy,
  parseBrowserRunnerOutput,
  resolveGeneratedBrowserExecutable,
  resolveGeneratedBrowserRunner,
  parseProfessionalBrowserRunnerOutput,
  runGeneratedSiteBrowserGates,
  runProfessionalSiteBrowserGates,
} from "./generated-site-browser-runner";

import type {
  GeneratedSiteContractV1,
  GeneratedSiteWriterContractV3,
} from "./generated-site-contract";
import type { ProfessionalSiteBlueprintV1 } from "./professional-site-blueprint";

const contract = {
  schemaVersion: 1,
  contractHash: "a".repeat(64),
  business: {
    name: "Test",
    type: "service",
    audience: null,
    primaryJob: "Contact",
    primaryCta: { kind: "other", label: "Contact", target: "#contact" },
  },
  content: {
    headline: "Test",
    subheadline: "Test",
    offer: "Test",
    promotion: null,
    trustPoints: [],
    products: [],
    testimonials: [],
    faq: [],
    usp: [],
    hours: [],
    paymentMethods: [],
    priceRange: null,
    address: null,
    deliveryArea: null,
    socialLinks: [],
  },
  page: {
    appKind: "landing",
    archetype: "generic",
    routes: [{ path: "/", purpose: "home", requiredContent: [] }],
    requiredSections: [],
    prohibitedClaims: [],
  },
  design: {
    recipeId: "generic",
    recipeVersion: 1,
    composition: "content-led",
    hierarchy: [],
    typographyStrategy: "system",
    colorStrategy: "restrained",
    mediaMode: "typographic",
    approvedAssets: [],
    signatureElement: "content-led hero",
    antiPatterns: [],
  },
} satisfies GeneratedSiteContractV1;

const professionalAssertions = [
  "route-load",
  "console-clean",
  "required-content-visible",
  "primary-cta",
  "internal-links",
  "horizontal-overflow",
  "heading-overflow",
  "image-health",
  "media-policy",
  "computed-contrast",
  "focus-visible",
  "touch-target",
  "first-view-contract",
  "section-coverage",
  "section-order",
  "typography-bounds",
  "content-hidden-by-navigation",
  "empty-media-frame",
  "signature-presence",
] as const;

const professionalBlueprint: ProfessionalSiteBlueprintV1 = {
  schemaVersion: 1,
  blueprintHash: "a".repeat(64),
  contractHash: "b".repeat(64),
  kit: {
    id: "bold-typographic",
    version: 2,
    allowedPatternIds: ["full-field-lockup"],
  },
  pageStrategy: { mode: "single", reason: "single-primary-job", routeCount: 1 },
  contentDepth: {
    density: "sparse",
    suppliedFactCount: 1,
    omissionPolicy: "omit-unsupported-sections",
  },
  firstView: { requiredRoles: ["identity", "offer", "primary-action"] },
  signatureRoute: "/",
  artDirection: {
    subject: "Kopi",
    audience: null,
    acceptedDirection: null,
    variance: 7,
    motion: 2,
    density: 3,
    shape: "sharp",
    typography: {
      allowedDisplayStackIds: ["restrained-grotesk"],
      bodyStackId: "restrained-grotesk",
      maxDisplayRem: 5.25,
      maxBodyCh: 64,
    },
    palette: {
      backgroundLightness: "dark",
      temperature: "cool",
      accentSurfaceMaximum: 0.1,
    },
    rhythm: {
      sectionSpacingRem: [3, 6],
      allowAlternatingSurfaces: false,
      maximumConsecutiveEqualTreatments: 2,
    },
    signature: { budget: 1, mustReference: ["offer"], forbidden: [] },
  },
  media: { mode: "typographic", approvedAssets: [] },
  routes: [
    {
      path: "/",
      filePath: "src/routes/index.tsx",
      exportName: "HomeRouteComponent",
      purpose: "Beranda",
      primaryJob: "Memilih kopi",
      requiredFactIds: [],
      requiredContentPaths: ["site.businessName"],
      firstView: {
        identityText: "Kedai",
        offerTexts: ["Kopi"],
        primaryCtaLabel: "Pesan",
        primaryCtaHref: "https://wa.me/628123456789",
      },
      allowedPatternIds: ["full-field-lockup"],
      sections: [
        {
          id: "hero",
          purpose: "Penawaran",
          role: "identity",
          requiredFactIds: [],
          requiredContentPaths: ["site.heroTitle"],
          requiredVisibleTexts: ["Kopi"],
        },
      ],
    },
  ],
  responsive: {
    mobileViewport: { width: 390, height: 844 },
    desktopViewport: { width: 1440, height: 1000 },
    requireExplicitTransformFor: [],
    primaryActionVisibleOnMobile: true,
  },
};

const professionalContract: GeneratedSiteWriterContractV3 = {
  schemaVersion: 3,
  contractHash: "b".repeat(64),
  handoff: { contractHash: "c".repeat(64), planHash: "d".repeat(64) },
  business: { name: "Kedai", type: "fnb", audience: null, primaryJob: "Pesan" },
  content: {
    businessName: "Kedai",
    businessType: "fnb",
    audience: null,
    ownerTagline: null,
    heroTitle: "Kopi",
    offers: [],
    usp: [],
    testimonials: [],
    certifications: [],
    hours: [],
    paymentMethods: [],
    priceRange: null,
    address: null,
    deliveryArea: null,
    socialLinks: [],
    promotion: null,
    primaryCta: {
      intentId: "cta",
      kind: "whatsapp",
      label: "Pesan",
      targetFactId: null,
      href: "https://wa.me/628123456789",
    },
    secondaryCta: null,
    navigation: [],
    labels: {
      catalog: "Pilihan",
      proof: "Yang perlu diketahui",
      process: "Cara memesan",
      operations: "Informasi usaha",
      contact: "Hubungi",
    },
    otherFacts: [],
  },
  factIndex: [],
  obligations: {
    routes: [
      {
        path: "/",
        purpose: "Beranda",
        requiredFactIds: [],
        requiredSectionIds: ["hero"],
      },
    ],
    sections: [{ id: "hero", purpose: "Penawaran", requiredFactIds: [] }],
    prohibitedClaims: [],
  },
  media: { mode: "typographic", approvedAssets: [] },
  visualInputs: {
    direction: null,
    density: "sparse",
    selectedKitId: "bold-typographic",
    selectedKitVersion: 2,
  },
};

function professionalOutput() {
  return JSON.stringify({
    routes: (["mobile", "desktop"] as const).map((viewport) => ({
      route: "/",
      viewport,
      assertions: professionalAssertions.map((name) => ({
        name,
        status: "pass",
      })),
      professionalSignals: [],
      screenshot: "",
    })),
  });
}

describe("browser executable resolution", () => {
  it("falls back to the installed Playwright executable", () => {
    expect(resolveGeneratedBrowserExecutable(undefined, process.execPath)).toBe(
      process.execPath,
    );
  });

  it("uses Bun to execute the TypeScript runner when the app uses Node", () => {
    expect(resolveGeneratedBrowserRunner("/usr/bin/node", undefined)).toBe(
      "bun",
    );
    expect(resolveGeneratedBrowserRunner("/usr/bin/bun", "1.3.9")).toBe(
      "/usr/bin/bun",
    );
  });
});

describe("parseBrowserRunnerOutput", () => {
  it("parses bounded mobile and desktop reports", () => {
    const result = parseBrowserRunnerOutput(
      JSON.stringify({
        routes: [
          {
            route: "/",
            viewport: "mobile",
            assertions: [{ name: "route-load", status: "pass" }],
          },
          {
            route: "/",
            viewport: "desktop",
            assertions: [{ name: "route-load", status: "pass" }],
          },
        ],
        screenshots: [],
      }),
    );
    expect(result.routes).toHaveLength(2);
  });

  it("rejects malformed subprocess output", () => {
    expect(() => parseBrowserRunnerOutput("not-json")).toThrow(
      "generated-site browser output malformed",
    );
  });
});

describe("professional browser runner", () => {
  it("parses V2 assertions and builds a bounded public policy", () => {
    const parsed = parseProfessionalBrowserRunnerOutput(professionalOutput());
    expect(parsed.routes[0]?.assertions).toHaveLength(19);
    const policy = createProfessionalBrowserPolicy(professionalBlueprint);
    expect(policy).toEqual({
      routes: [
        expect.objectContaining({
          path: "/",
          sections: [{ id: "hero", requiredVisibleTexts: ["Kopi"] }],
        }),
      ],
      signatureRoute: "/",
      typography: {
        maxDisplayPx: 96,
        minDisplayLetterSpacingEm: -0.04,
        minBodyPx: 15,
        minBodyLineHeight: 1.4,
        maxBodyCh: 78,
      },
    });
  });

  it("runs V2 qualification, passes policy only, and stores both viewport evidence", async () => {
    const received: Array<{ professionalPolicy?: unknown }> = [];
    const result = await runProfessionalSiteBrowserGates(
      {
        projectId: "p1",
        candidateId: "c1",
        files: [],
        contract: professionalContract,
        blueprint: professionalBlueprint,
        timeoutMs: 100,
      },
      {
        execute: async (input) => {
          received.push({ professionalPolicy: input.professionalPolicy });
          return professionalOutput();
        },
        storeEvidence: async (input) => [`${input.route}-${input.viewport}`],
      },
    );
    expect(result.version).toBe(2);
    expect(result.status).toBe("pass");
    expect(result.evidenceIds).toEqual(["/-mobile", "/-desktop"]);
    expect(received[0]?.professionalPolicy).toMatchObject({
      signatureRoute: "/",
    });
  });
});

describe("runGeneratedSiteBrowserGates", () => {
  it("classifies launch failure as infrastructure_error", async () => {
    const result = await runGeneratedSiteBrowserGates(
      {
        projectId: "p1",
        candidateId: "c1",
        files: [
          { path: "index.html", content: "<main />", contentType: "text/html" },
        ],
        contract,
        timeoutMs: 100,
      },
      {
        execute: async () => {
          throw new Error("browser unavailable");
        },
        storeEvidence: async () => ["ref"],
      },
    );
    expect(result.status).toBe("infrastructure_error");
  });

  const browserIt =
    process.env.RUN_GENERATED_SITE_BROWSER_TESTS === "1" ? it : it.skip;

  browserIt("qualifies a real static artifact at both viewports", async () => {
    const evidence: Array<{ screenshot?: Uint8Array }> = [];
    const result = await runGeneratedSiteBrowserGates(
      {
        projectId: "browser-smoke",
        candidateId: "candidate-smoke",
        files: [
          {
            path: "index.html",
            contentType: "text/html; charset=utf-8",
            content: `<!doctype html><html><head><style>*{box-sizing:border-box}body{margin:0;color:#172019;background:#fffaf0;font:18px system-ui}main{min-height:100vh;padding:48px}a{display:inline-flex;min-width:160px;min-height:48px;align-items:center;justify-content:center;background:#173f2a;color:white;border-radius:12px}a:focus{outline:3px solid #d18b22}</style></head><body><main><h1>Warung Uji</h1><p>Menu harian untuk keluarga sekitar.</p><a href="https://wa.me/6281100000000">Hubungi kami</a></main></body></html>`,
          },
        ],
        contract,
        timeoutMs: 10_000,
      },
      {
        storeEvidence: async (item) => {
          evidence.push({ screenshot: item.screenshot });
          return [`evidence-${evidence.length}`];
        },
      },
    );
    expect(result.status).toBe("pass");
    expect(result.routes).toHaveLength(2);
    expect(result.routes.flatMap((route) => route.assertions)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "primary-cta", status: "pass" }),
        expect.objectContaining({
          name: "horizontal-overflow",
          status: "pass",
        }),
      ]),
    );
    expect(evidence.every((item) => (item.screenshot?.length ?? 0) > 0)).toBe(
      true,
    );
  });
});
