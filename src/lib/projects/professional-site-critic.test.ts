import { beforeEach, describe, expect, it, vi } from "vitest";

const { generateTextMock } = vi.hoisted(() => ({
  generateTextMock: vi.fn(),
}));

vi.mock("ai", () => ({ generateText: generateTextMock }));
vi.mock("@/lib/ai", () => ({
  getAiModel: vi.fn(() => ({ modelId: "critic-requested" })),
  getAiTelemetry: vi.fn(
    (functionId: string, metadata: Record<string, unknown>) => ({
      functionId,
      metadata,
    }),
  ),
  getNoReasoningCallOptions: vi.fn(() => ({})),
}));
vi.mock("@/lib/ai-models", () => ({
  getGenerationModel: vi.fn(() => "critic-requested"),
}));
vi.mock("@/lib/ai-timeouts", () => ({
  getAiTimeoutMs: vi.fn(() => 10_000),
}));

import {
  classifyProfessionalBrowserReport,
  REQUIRED_PROFESSIONAL_BROWSER_ASSERTIONS,
  type BrowserGateReportV2,
} from "./browser-gates";
import { GeneratedSiteCallBudget } from "./generated-site-call-budget";
import {
  deriveProfessionalReviewVerdict,
  PROFESSIONAL_REVIEW_CATEGORIES,
  runProfessionalSiteReview,
  type GeneratedSiteProfessionalReviewV1,
} from "./professional-site-critic";
import { PROFESSIONAL_DESIGN_KITS } from "./professional-site-kits";

import type { GeneratedSiteWriterContractV3 } from "./generated-site-contract";
import type { ProfessionalSiteBlueprintV1 } from "./professional-site-blueprint";
import type { WriterDesignPlanV3 } from "./professional-site-plan";
import type { ProfessionalSiteSourceGateReportV1 } from "./professional-site-source-gates";

const kit = (() => {
  const value = PROFESSIONAL_DESIGN_KITS.get("bold-typographic");
  if (!value) {
    throw new Error("critic fixture kit missing");
  }
  return value;
})();

const contract: GeneratedSiteWriterContractV3 = {
  schemaVersion: 3,
  contractHash: "b".repeat(64),
  handoff: { contractHash: "c".repeat(64), planHash: "d".repeat(64) },
  business: {
    name: "Kedai Senja",
    type: "fnb",
    audience: "Pekerja sore",
    primaryJob: "Memilih kopi",
  },
  content: {
    businessName: "Kedai Senja",
    businessType: "fnb",
    audience: "Pekerja sore",
    ownerTagline: "Kopi untuk jeda sore",
    heroTitle: "Kopi untuk jeda sore",
    offers: [{ name: "Kopi Senja", description: "Kopi seduh manual" }],
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
      intentId: "cta-wa",
      kind: "whatsapp",
      label: "Pesan lewat WhatsApp",
      targetFactId: "contact-1",
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
  blueprintHash: "a".repeat(64),
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
    subject: "Kopi untuk jeda sore",
    audience: "Pekerja sore",
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
        primaryCtaLabel: "Pesan lewat WhatsApp",
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
  visualThesis: "One accepted offer carries a quiet first view.",
  signature: {
    route: "/",
    description: "The offer is the signature.",
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

const browserReport: BrowserGateReportV2 = {
  version: 2,
  status: "pass",
  routes: ["mobile", "desktop"].map((viewport) => ({
    route: "/",
    viewport: viewport as "mobile" | "desktop",
    assertions: REQUIRED_PROFESSIONAL_BROWSER_ASSERTIONS.map((name) => ({
      name,
      status: "pass" as const,
    })),
    professionalSignals: [],
  })),
  evidenceIds: ["mobile", "desktop"],
  overheadMs: 1,
};

function assessments(rating: 1 | 2 | 3 | 4 = 3, route = "/") {
  return PROFESSIONAL_REVIEW_CATEGORIES.map((category) => ({
    route,
    category,
    rating,
    viewport: "both" as const,
    evidence: `${category} evidence from mobile and desktop`,
    blueprintReference: `blueprint.${category}`,
    suggestedRevision: rating < 3 ? "Move the visible action earlier." : null,
    confidence: 0.9,
  }));
}

function reviewResponse(rating: 1 | 2 | 3 | 4 = 3, route = "/") {
  return JSON.stringify({ assessments: assessments(rating, route) });
}

function reviewInput(budget = new GeneratedSiteCallBudget()) {
  return {
    contract,
    blueprint,
    plan,
    kit,
    sourceReport,
    browserReport,
    screenshots: [
      {
        route: "/",
        viewport: "mobile" as const,
        bytes: new Uint8Array([1, 2]),
      },
      {
        route: "/",
        viewport: "desktop" as const,
        bytes: new Uint8Array([3, 4]),
      },
    ],
    budget,
  };
}

describe("professional review verdict", () => {
  it("passes sparse bold minimalism when every category is a 3", () => {
    const review: GeneratedSiteProfessionalReviewV1 = {
      status: "complete",
      promptVersion: "professional-static-review-v1",
      requestedModel: "default-combo",
      servedModel: "critic",
      assessments: assessments(),
    };
    expect(
      deriveProfessionalReviewVerdict({ review, routes: ["/"] }),
    ).toMatchObject({
      pass: true,
      minimumRating: 3,
      averageRating: 3,
    });
  });

  it("uses the minimum rating across routes and rejects any blocker", () => {
    const review: GeneratedSiteProfessionalReviewV1 = {
      status: "complete",
      promptVersion: "professional-static-review-v1",
      requestedModel: "default-combo",
      servedModel: "critic",
      assessments: [...assessments(), ...assessments(2, "/kelas")],
    };
    const verdict = deriveProfessionalReviewVerdict({
      review,
      routes: ["/", "/kelas"],
    });
    expect(verdict.pass).toBe(false);
    expect(verdict.minimumRating).toBe(2);
    expect(verdict.categoryRatings.business_specificity).toBe(2);
  });

  it("rejects unknown review status without deriving a pass", () => {
    expect(
      deriveProfessionalReviewVerdict({
        review: { status: "unknown", reason: "malformed" },
        routes: ["/"],
      }),
    ).toMatchObject({ pass: false, minimumRating: null });
  });
});

describe("runProfessionalSiteReview", () => {
  beforeEach(() => generateTextMock.mockReset());

  it("makes one bounded category-complete call with private evidence outside telemetry", async () => {
    generateTextMock.mockResolvedValue({
      text: reviewResponse(),
      response: { modelId: "critic-served" },
    });
    const result = await runProfessionalSiteReview(reviewInput());
    expect(result).toMatchObject({
      status: "complete",
      promptVersion: "professional-static-review-v1",
      requestedModel: "critic-requested",
      servedModel: "critic-served",
      assessments: expect.arrayContaining([
        expect.objectContaining({ category: "professional_finish", rating: 3 }),
      ]),
    });
    expect(generateTextMock).toHaveBeenCalledTimes(1);
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        maxOutputTokens: 6_144,
        maxRetries: 0,
        temperature: 0,
      }),
    );
    const call = generateTextMock.mock.calls[0]?.[0] as {
      system: string;
      telemetry: unknown;
      messages: Array<{ content: unknown }>;
    };
    expect(call.system).toContain("business_specificity");
    expect(call.system).toContain("section count");
    expect(call.system).toContain("reference-07");
    expect(JSON.stringify(call.telemetry)).not.toContain("628123456789");
    expect(JSON.stringify(call.telemetry)).not.toContain("Uint8Array");
    expect(JSON.stringify(call.messages)).toContain("Kedai Senja");
  });

  it.each([
    [
      "missing category",
      JSON.stringify({ assessments: assessments().slice(1) }),
      "incomplete",
    ],
    [
      "malformed rating",
      JSON.stringify({ assessments: [{ ...assessments()[0], rating: 5 }] }),
      "malformed",
    ],
    [
      "low confidence",
      JSON.stringify({
        assessments: assessments().map((assessment) => ({
          ...assessment,
          confidence: 0.79,
        })),
      }),
      "low_confidence",
    ],
  ])("returns unknown for %s", async (_label, text, reason) => {
    generateTextMock.mockResolvedValue({
      text,
      response: { modelId: "critic-served" },
    });
    const result = await runProfessionalSiteReview(reviewInput());
    expect(result).toMatchObject({ status: "unknown", reason });
  });

  it("distinguishes empty, transport, and missing-evidence outcomes without retrying", async () => {
    expect(classifyProfessionalBrowserReport(browserReport, ["/"])).toBe(
      "pass",
    );
    generateTextMock.mockResolvedValue({
      text: "",
      response: { modelId: "critic-served" },
    });
    await expect(
      runProfessionalSiteReview(reviewInput()),
    ).resolves.toMatchObject({ status: "unknown", reason: "empty" });
    const missing = reviewInput();
    missing.screenshots = [
      { route: "/", viewport: "mobile", bytes: new Uint8Array([1]) },
    ];
    await expect(runProfessionalSiteReview(missing)).resolves.toMatchObject({
      status: "unknown",
      reason: "missing_evidence",
    });
    expect(generateTextMock).toHaveBeenCalledTimes(1);
  });

  it("consumes the critic budget once", async () => {
    generateTextMock.mockResolvedValue({
      text: reviewResponse(),
      response: { modelId: "critic-served" },
    });
    const budget = new GeneratedSiteCallBudget();
    await runProfessionalSiteReview(reviewInput(budget));
    await expect(
      runProfessionalSiteReview(reviewInput(budget)),
    ).rejects.toThrow("critic call budget exhausted");
  });
});
