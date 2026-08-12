import { beforeEach, describe, expect, it, vi } from "vitest";

const { generateTextMock } = vi.hoisted(() => ({
  generateTextMock: vi.fn(),
}));

vi.mock("ai", () => ({ generateText: generateTextMock }));
vi.mock("@/lib/ai", () => ({
  getAiModel: vi.fn(() => ({ modelId: "critic" })),
  getAiTelemetry: vi.fn(() => ({ isEnabled: false })),
  getNoReasoningCallOptions: vi.fn(() => ({})),
}));
vi.mock("@/lib/ai-models", () => ({
  getGenerationModel: vi.fn(() => "critic"),
}));

import { runShadowCritic } from "./visual-critic";

import type { BuildContractV1 } from "./build-contract";

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
      screenshots: [{ route: "/", viewport: "mobile", image: "base64" }],
    });
    expect(result).toMatchObject({
      status: "complete",
      modelId: "served-critic",
      findings: [{ category: "hierarchy", severity: "high" }],
    });
    expect(JSON.stringify(result)).not.toContain("files");
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
        screenshots: [{ route: "/", viewport: "desktop" }],
      }),
    ).resolves.toMatchObject({ status: "unavailable" });
  });
});
