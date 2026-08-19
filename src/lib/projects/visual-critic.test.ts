import { beforeEach, describe, expect, it, vi } from "vitest";

const { generateTextMock } = vi.hoisted(() => ({
  generateTextMock: vi.fn(),
}));

vi.mock("ai", () => ({ generateText: generateTextMock }));
vi.mock("@/lib/ai/ai", () => ({
  getAiModel: vi.fn(() => ({ modelId: "critic" })),
  getAiTelemetry: vi.fn(() => ({ isEnabled: false })),
  getNoReasoningCallOptions: vi.fn(() => ({})),
}));
vi.mock("@/lib/ai/ai-models", () => ({
  getGenerationModel: vi.fn(() => "critic"),
}));

import { GeneratedSiteCallBudget } from "./generated-site-call-budget";
import { selectGeneratedSiteDesignKit } from "./generated-site-design-kits/catalog";
import { runGeneratedSiteVisualReview, runShadowCritic } from "./visual-critic";

import type { BuildContractV1 } from "./build-contract";
import type { GeneratedSiteWriterContractV2 } from "./generated-site-contract";
import type { WriterDesignPlanV2 } from "./generated-site-design-plan";

const contract: BuildContractV1 = {
  schemaVersion: 1,
  revision: 1,
  contentHash: "c",
  identity: { businessName: "Sate", businessType: "fnb" },
  facts: [],
  decisions: [],
  visitorJobs: [],
  ctaIntents: [],
  hardRequirements: [],
  prohibitedClaims: [],
  preferences: {
    visualDirection: null,
    tone: null,
    density: null,
    motion: null,
  },
  assets: [],
  blockers: [],
  omissions: [],
};

const v2Contract: GeneratedSiteWriterContractV2 = {
  schemaVersion: 2,
  contractHash: "a".repeat(64),
  handoff: { contractHash: "b".repeat(64), planHash: "c".repeat(64) },
  business: {
    name: "Sate Sintetis",
    type: "fnb",
    audience: "Pembeli",
    primaryJob: "Memesan",
    primaryCta: { kind: "whatsapp", label: "Pesan", target: "+6281100000000" },
  },
  content: {
    headline: "Pesan mudah",
    subheadline: "Lihat menu.",
    offer: "Sate",
    promotion: null,
    trustPoints: ["Jelas"],
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
    selectedKitVersion: 1,
  },
};
const v2Plan: WriterDesignPlanV2 = {
  schemaVersion: 2,
  contractHash: v2Contract.contractHash,
  kit: { id: "bold-typographic", version: 1 },
  mediaMode: "graphic",
  pageStrategy: "single",
  taste: {
    variance: 7,
    motion: 2,
    density: 3,
    shape: "sharp",
    typeGuidance: "Let a single sans display voice carry the statement.",
    signatureBudget: 1,
  },
  visualThesis: "Bold promise",
  compositionPatternId: "full-field-lockup",
  palette: {
    background: "#171b2b",
    foreground: "#f3f4ff",
    muted: "#2c3150",
    accent: "#9d7cff",
  },
  typography: { displayRole: "sans", bodyRole: "sans" },
  sections: [
    { id: "hero", treatment: "lockup", surface: "base", density: "airy" },
  ],
  sectionOrder: ["hero"],
  mobileStrategy: ["stack"],
  signatureElement: "full-field-lockup",
};

describe("runGeneratedSiteVisualReview", () => {
  beforeEach(() => vi.clearAllMocks());

  it("makes exactly one structured visual call", async () => {
    generateTextMock.mockResolvedValue({
      text: JSON.stringify({ findings: [] }),
      response: { modelId: "served-critic" },
    });
    const kit = selectGeneratedSiteDesignKit({
      archetype: "generic",
      density: "sparse",
      mediaMode: "graphic",
      primaryJobKind: "inquire",
      hasOperationalDetails: false,
    });
    const result = await runGeneratedSiteVisualReview({
      contract: v2Contract,
      designPlan: v2Plan,
      kit,
      browserReport: {
        version: 1,
        status: "pass",
        routes: [],
        evidenceIds: [],
        overheadMs: 1,
      },
      screenshots: [new Uint8Array([1, 2, 3])],
      budget: new GeneratedSiteCallBudget(),
    });
    expect(result.status).toBe("complete");
    expect(generateTextMock).toHaveBeenCalledTimes(1);
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({ maxRetries: 0 }),
    );
  });

  it("keeps malformed visual output unknown without retrying", async () => {
    generateTextMock.mockResolvedValue({ text: "not json", response: {} });
    const kit = selectGeneratedSiteDesignKit({
      archetype: "generic",
      density: "sparse",
      mediaMode: "graphic",
      primaryJobKind: "inquire",
      hasOperationalDetails: false,
    });
    const result = await runGeneratedSiteVisualReview({
      contract: v2Contract,
      designPlan: v2Plan,
      kit,
      browserReport: {
        version: 1,
        status: "pass",
        routes: [],
        evidenceIds: [],
        overheadMs: 1,
      },
      screenshots: [new Uint8Array([1])],
      budget: new GeneratedSiteCallBudget(),
    });
    expect(result.status).toBe("unknown");
    expect(generateTextMock).toHaveBeenCalledTimes(1);
  });

  it("keeps visual transport failure unknown without retrying", async () => {
    generateTextMock.mockRejectedValue(new Error("critic unavailable"));
    const kit = selectGeneratedSiteDesignKit({
      archetype: "generic",
      density: "sparse",
      mediaMode: "graphic",
      primaryJobKind: "inquire",
      hasOperationalDetails: false,
    });
    const result = await runGeneratedSiteVisualReview({
      contract: v2Contract,
      designPlan: v2Plan,
      kit,
      browserReport: {
        version: 1,
        status: "pass",
        routes: [],
        evidenceIds: [],
        overheadMs: 1,
      },
      screenshots: [new Uint8Array([1])],
      budget: new GeneratedSiteCallBudget(),
    });
    expect(result.status).toBe("unknown");
    expect(generateTextMock).toHaveBeenCalledTimes(1);
  });
});

describe("runShadowCritic", () => {
  beforeEach(() => vi.clearAllMocks());

  it("parses structured visual findings without write authority", async () => {
    generateTextMock.mockResolvedValue({
      text: JSON.stringify({
        findings: [
          {
            category: "hierarchy",
            severity: "high",
            route: "/",
            viewport: "mobile",
            evidence: "CTA below fold",
            proposedCorrection: "Move CTA into hero",
            confidence: 0.9,
          },
        ],
      }),
      response: { modelId: "served-critic" },
    });
    const result = await runShadowCritic({
      contract,
      plan: {},
      hardGateStatus: "pass",
      screenshots: [{ route: "/", viewport: "mobile", screenshot: "aGVsbG8=" }],
    });
    expect(result).toMatchObject({
      status: "complete",
      modelId: "served-critic",
      findings: [{ category: "hierarchy", severity: "high" }],
    });
    expect(JSON.stringify(result)).not.toContain("files");
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          expect.objectContaining({
            content: expect.arrayContaining([
              expect.objectContaining({
                type: "file",
                mediaType: "image/jpeg",
              }),
            ]),
          }),
        ],
      }),
    );
  });

  it("returns unknown when evidence is insufficient", async () => {
    const result = await runShadowCritic({
      contract: null,
      plan: null,
      hardGateStatus: "pass",
    });
    expect(result.status).toBe("unknown");
  });

  it("returns unavailable on transport or malformed output", async () => {
    generateTextMock.mockResolvedValue({ text: "bad", response: {} });
    await expect(
      runShadowCritic({
        contract,
        plan: {},
        hardGateStatus: "pass",
        screenshots: [
          { route: "/", viewport: "desktop", screenshot: "aGVsbG8=" },
        ],
      }),
    ).resolves.toMatchObject({ status: "unavailable" });
  });
});
