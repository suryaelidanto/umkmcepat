import { beforeEach, describe, expect, it } from "vitest";

import {
  REQUIRED_PROFESSIONAL_BROWSER_ASSERTIONS,
  type BrowserGateReportV2,
} from "./browser-gates";
import { PROFESSIONAL_DESIGN_KITS } from "./professional-site-kits";
import {
  runProfessionalSitePipeline,
  type ProfessionalSitePipelineDeps,
  type RunProfessionalSitePipelineInput,
} from "./professional-site-pipeline";

import type { GeneratedSiteWriterContractV3 } from "./generated-site-contract";
import type { GeneratedDistFile } from "./generated-types";
import type { ProfessionalSiteBlueprintV1 } from "./professional-site-blueprint";
import type {
  ProfessionalSiteReleaseManifestV1,
  ProfessionalCalibrationSummaryV1,
} from "./professional-site-calibration";
import type { GeneratedSiteProfessionalReviewV1 } from "./professional-site-critic";
import type { WriterDesignPlanV3 } from "./professional-site-plan";
import type { ProfessionalSiteSourceGateReportV1 } from "./professional-site-source-gates";
import type { ProfessionalSiteGenerateResult } from "./professional-site-writer";

const kit = (() => {
  const value = PROFESSIONAL_DESIGN_KITS.get("bold-typographic");
  if (!value) {
    throw new Error("pipeline fixture kit missing");
  }
  return value;
})();

const contract: GeneratedSiteWriterContractV3 = {
  schemaVersion: 3,
  contractHash: "c".repeat(64),
  handoff: { contractHash: "h".repeat(64), planHash: "p".repeat(64) },
  business: {
    name: "Kedai Senja",
    type: "fnb",
    audience: null,
    primaryJob: "Memilih kopi",
  },
  content: {
    businessName: "Kedai Senja",
    businessType: "fnb",
    audience: null,
    ownerTagline: null,
    heroTitle: "Kopi Senja",
    offers: [{ name: "Kopi Senja", description: "Seduh manual" }],
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
  media: { mode: "graphic", approvedAssets: [] },
  visualInputs: {
    direction: "hangat",
    density: "sparse",
    selectedKitId: "bold-typographic",
    selectedKitVersion: 2,
  },
};

const blueprint: ProfessionalSiteBlueprintV1 = {
  schemaVersion: 1,
  blueprintHash: "b".repeat(64),
  contractHash: contract.contractHash,
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
    subject: "Kopi Senja",
    audience: null,
    acceptedDirection: "hangat",
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
  media: { mode: "graphic", approvedAssets: [] },
  routes: [
    {
      path: "/",
      filePath: "src/routes/index.tsx",
      exportName: "HomeRouteComponent",
      purpose: "Beranda",
      primaryJob: "Memilih kopi",
      requiredFactIds: [],
      requiredContentPaths: [
        "site.businessName",
        "site.heroTitle",
        "site.primaryCta",
      ],
      firstView: {
        identityText: "Kedai Senja",
        offerTexts: ["Kopi Senja"],
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
          requiredVisibleTexts: ["Kopi Senja"],
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

const plan: WriterDesignPlanV3 = {
  schemaVersion: 3,
  blueprintHash: blueprint.blueprintHash,
  visualThesis: "One accepted offer carries the page.",
  signature: {
    route: "/",
    description: "Offer signature",
    sourceAnchor: "offer",
  },
  typography: {
    displayStackId: "restrained-grotesk",
    bodyStackId: "restrained-grotesk",
  },
  palette: {
    background: "#171b2b",
    foreground: "#f3f4ff",
    muted: "#2c3150",
    accent: "#9d7cff",
  },
  routes: [
    {
      path: "/",
      patternId: "full-field-lockup",
      sections: [
        {
          id: "hero",
          treatment: "full-field-lockup",
          surface: "base",
          density: "regular",
        },
      ],
    },
  ],
  mobileTransforms: [],
};

const sourceReport: ProfessionalSiteSourceGateReportV1 = {
  version: 1,
  status: "pass",
  findings: [],
  hardFailureCounts: {
    fact: 0,
    action: 0,
    media: 0,
    accessibility: 0,
    route: 0,
    contract: 0,
  },
  professionalSignals: [],
};

const browserReport = (
  status: BrowserGateReportV2["status"] = "pass",
): BrowserGateReportV2 => ({
  version: 2,
  status,
  routes:
    status === "infrastructure_error"
      ? []
      : (["mobile", "desktop"] as const).map((viewport) => ({
          route: "/",
          viewport,
          assertions: REQUIRED_PROFESSIONAL_BROWSER_ASSERTIONS.map((name) => ({
            name,
            status: "pass" as const,
          })),
          professionalSignals: [],
        })),
  evidenceIds: status === "infrastructure_error" ? [] : ["mobile", "desktop"],
  overheadMs: 1,
});

const review = (
  rating: 1 | 2 | 3 | 4 = 3,
): Extract<GeneratedSiteProfessionalReviewV1, { status: "complete" }> => ({
  status: "complete",
  promptVersion: "professional-static-review-v1",
  requestedModel: "default-combo",
  servedModel: "served-critic",
  assessments: [
    "business_specificity",
    "first_view_hierarchy",
    "content_architecture",
    "composition_rhythm",
    "typography",
    "color_system",
    "media_integrity",
    "mobile_quality",
    "professional_finish",
  ].map((category) => ({
    route: "/",
    category: category as Extract<
      Extract<
        GeneratedSiteProfessionalReviewV1,
        { status: "complete" }
      >["assessments"][number],
      { route: "/" }
    >["category"],
    rating,
    viewport: "both",
    evidence: "visible mobile and desktop evidence",
    blueprintReference: "blueprint.firstView",
    suggestedRevision: rating < 3 ? "Move the action earlier." : null,
    confidence: 0.9,
  })),
});

const projectFiles = [{ path: "src/routes/index.tsx", content: "route" }];
const distFiles: GeneratedDistFile[] = [
  { path: "index.html", contentType: "text/html", content: "<main>ok</main>" },
];

function writerResult(
  overrides: Partial<
    Extract<ProfessionalSiteGenerateResult, { ok: true }>
  > = {},
): Extract<ProfessionalSiteGenerateResult, { ok: true }> {
  return {
    ok: true,
    files: projectFiles,
    plan,
    summary: "done",
    writtenPaths: ["src/routes/index.tsx"],
    sourceReport,
    modelRequested: "default-combo",
    modelServed: "served-writer",
    writerMs: 10,
    firstFileClosedMs: 5,
    editableBytes: 100,
    ...overrides,
  };
}

const calibrationSummary: ProfessionalCalibrationSummaryV1 = {
  schemaVersion: 1,
  promptVersion: "professional-static-review-v1",
  kitVersion: 2,
  evaluatorVersion: "4",
  samples: 50,
  seededDefects: 30,
  categories: {
    business_specificity: { positives: 1, negatives: 1 },
    first_view_hierarchy: { positives: 1, negatives: 1 },
    content_architecture: { positives: 1, negatives: 1 },
    composition_rhythm: { positives: 1, negatives: 1 },
    typography: { positives: 1, negatives: 1 },
    color_system: { positives: 1, negatives: 1 },
    media_integrity: { positives: 1, negatives: 1 },
    mobile_quality: { positives: 1, negatives: 1 },
    professional_finish: { positives: 1, negatives: 1 },
  },
  blockerPrecision: 0.9,
  blockerRecall: 0.8,
  falseReadyRate: 0.05,
  p0FalseAccepts: 0,
  acceptedReference07RejectedForMinimalism: false,
};

const releaseManifest: ProfessionalSiteReleaseManifestV1 = {
  schemaVersion: 1,
  approved: true,
  requestedModelId: "default-combo",
  allowedWriterModelIds: ["default-combo", "served-writer"],
  allowedCriticModelIds: ["default-combo", "served-critic"],
  criticPromptVersion: "professional-static-review-v1",
  kitVersion: 2,
  evaluatorVersion: "4",
  corpusVersion: "professional-static-v3",
  calibration: {
    samples: 50,
    seededDefects: 30,
    blockerPrecision: 0.9,
    blockerRecall: 0.8,
    falseReadyRate: 0.05,
    p0FalseAccepts: 0,
  },
  benchmark: {
    runId: "run",
    completedTreatmentTrials: 24,
    treatmentReadyRate: 0.9,
    decisiveTreatmentPreference: 0.75,
  },
  ownerApprovedAt: "2026-08-15T00:00:00.000Z",
};

function input(
  mode: "calibration" | "selection" = "calibration",
): RunProfessionalSitePipelineInput {
  return {
    mode,
    releaseManifest,
    calibrationSummary,
    requestedModelId: "default-combo",
    projectId: "p1",
    userId: "u1",
    attemptId: "a1",
    buildId: null,
  };
}

function depsFor(
  options: {
    writer?: () => Promise<ProfessionalSiteGenerateResult>;
    build?: (
      files: typeof projectFiles,
    ) => Promise<{ ok: boolean; distFiles: GeneratedDistFile[]; log: string }>;
    browser?: () => Promise<BrowserGateReportV2>;
    review?: () => Promise<GeneratedSiteProfessionalReviewV1>;
    correction?: () => Promise<ProfessionalSiteGenerateResult>;
    order?: string[];
  } = {},
): ProfessionalSitePipelineDeps {
  const order = options.order ?? [];
  return {
    deriveSelectionInput: async () => {
      order.push("derive-selection-input");
      return { archetype: "generic" };
    },
    selectKit: () => {
      order.push("select-kit");
      return kit;
    },
    compileContract: () => {
      order.push("compile-contract");
      return contract;
    },
    compileBlueprint: () => {
      order.push("compile-blueprint");
      return blueprint;
    },
    runWriter: async () => {
      order.push("writer");
      return options.writer
        ? options.writer()
        : Promise.resolve(writerResult());
    },
    runCorrection: async () => {
      order.push("correction");
      return options.correction
        ? options.correction()
        : Promise.resolve(writerResult());
    },
    build: async () => {
      order.push("build");
      return options.build
        ? options.build(projectFiles)
        : { ok: true, distFiles, log: "" };
    },
    runBrowser: async () => {
      order.push("browser");
      return options.browser
        ? options.browser()
        : Promise.resolve(browserReport());
    },
    loadEvidence: async () => {
      order.push("load-evidence");
      return [
        { route: "/", viewport: "mobile" as const, bytes: new Uint8Array([1]) },
        {
          route: "/",
          viewport: "desktop" as const,
          bytes: new Uint8Array([2]),
        },
      ];
    },
    review: async () => {
      order.push("professional-review");
      return options.review ? options.review() : Promise.resolve(review());
    },
    now: () => 100,
  };
}

describe("professional site pipeline", () => {
  beforeEach(() => undefined);

  it("runs the final review in the bounded order and passes", async () => {
    const order: string[] = [];
    const result = await runProfessionalSitePipeline(
      input(),
      depsFor({ order }),
    );
    expect(order).toEqual([
      "derive-selection-input",
      "select-kit",
      "compile-contract",
      "compile-blueprint",
      "writer",
      "build",
      "browser",
      "load-evidence",
      "professional-review",
    ]);
    expect(result.ok).toBe(true);
    expect(result.ok && result.proof.outcome).toBe("pass");
    expect(result.ok && result.proof.calls).toMatchObject({
      writerCalls: 1,
      criticCalls: 1,
      correctionCalls: 0,
    });
  });

  it("uses one build correction, then requalifies before the final critic", async () => {
    const order: string[] = [];
    let builds = 0;
    const result = await runProfessionalSitePipeline(
      input(),
      depsFor({
        order,
        build: async () => {
          builds += 1;
          return builds === 1
            ? { ok: false, distFiles: [], log: "broken" }
            : { ok: true, distFiles, log: "" };
        },
        correction: async () =>
          writerResult({
            modelRequested: "default-combo",
            modelServed: "served-correction",
          }),
      }),
    );
    expect(order).toEqual([
      "derive-selection-input",
      "select-kit",
      "compile-contract",
      "compile-blueprint",
      "writer",
      "build",
      "correction",
      "build",
      "browser",
      "load-evidence",
      "professional-review",
    ]);
    expect(result.ok && result.proof.calls).toMatchObject({
      correctionCalls: 1,
      correctionReason: "build",
    });
    expect(result.ok && result.proof.models.correctionServed).toBe(
      "served-correction",
    );
  });

  it("fails a low-rated or unknown final review without correction", async () => {
    const lowOrder: string[] = [];
    const low = await runProfessionalSitePipeline(
      input(),
      depsFor({ order: lowOrder, review: async () => review(2) }),
    );
    expect(low.ok).toBe(false);
    expect(lowOrder).not.toContain("correction");
    const unknownOrder: string[] = [];
    const unknown = await runProfessionalSitePipeline(
      input(),
      depsFor({
        order: unknownOrder,
        review: async () => ({
          status: "unknown",
          reason: "transport",
          requestedModel: "default-combo",
          servedModel: null,
        }),
      }),
    );
    expect(unknown.ok).toBe(false);
    expect(unknownOrder).not.toContain("correction");
  });

  it("returns infrastructure outcome when the browser is unavailable", async () => {
    const result = await runProfessionalSitePipeline(
      input(),
      depsFor({ browser: async () => browserReport("infrastructure_error") }),
    );
    expect(result.ok).toBe(false);
    expect(result.ok ? null : result.proof.outcome).toBe(
      "infrastructure_error",
    );
  });

  it("rejects blocked selection before calling the writer and rejects uncalibrated model IDs", async () => {
    let called = false;
    const blocked = await runProfessionalSitePipeline(
      {
        ...input("selection"),
        releaseManifest: { ...releaseManifest, approved: false },
      },
      depsFor({
        writer: async () => {
          called = true;
          return writerResult();
        },
      }),
    );
    expect(blocked.ok).toBe(false);
    expect(called).toBe(false);
    const uncalibrated = await runProfessionalSitePipeline(
      input("selection"),
      depsFor({
        writer: async () => writerResult({ modelServed: "not-authorized" }),
      }),
    );
    expect(uncalibrated.ok).toBe(false);
  });
});
