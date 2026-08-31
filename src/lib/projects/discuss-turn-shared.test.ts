import { beforeEach, describe, expect, it, vi } from "vitest";

const { chargeMock, generateTextMock } = vi.hoisted(() => ({
  chargeMock: vi.fn(async (..._args: unknown[]) => null),
  generateTextMock: vi.fn(),
}));

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    generateText: (...args: unknown[]) => generateTextMock(...args),
  };
});

vi.mock("@/lib/payment/user-credits", () => ({
  chargeEnergyForAiUsage: (...args: unknown[]) => chargeMock(...args),
}));

vi.mock("@/lib/ai/ai", () => ({
  getAiTelemetry: () => undefined,
  getNoReasoningCallOptions: () => ({}),
}));

vi.mock("@/lib/ai/ai-timeouts", () => ({
  DISCUSS_CARD_SEMANTIC_ATTEMPTS: 2,
  DISCUSS_CARD_SERVER_DEADLINE_MS: 5_000,
  getAiTimeoutMs: () => 5_000,
}));

import { repairDiscussCardWithTool } from "./discuss-turn-shared";

const baseInput = {
  brief: { businessName: "Toko" },
  cardSystemPrompt: "card prompt",
  chatText: "jawaban aku",
  hasBuiltSite: false,
  lastUserText: "kue",
  modelName: "m-1",
  model: {} as never,
  modelMessages: [],
  ownerTexts: ["kue"],
  projectId: "p1",
  userId: "u1",
};

function allowResponse(usage: { inputTokens: number; outputTokens: number }) {
  return {
    usage,
    toolCalls: [
      {
        input: {
          briefPatch: { businessType: "Katering sekolah" },
          projectTitle: "Katering Sekolah",
          assistantText: "Siap, catat kue.",
          workspaceCard: {
            type: "question",
            question: {
              id: "offer",
              question: "Jenis katering apa yang ingin kamu tawarkan?",
              options: [
                { label: "Nasi kotak", description: "Dikirim tiap hari." },
              ],
            },
          },
        },
      },
    ],
  };
}

function noneResponse(usage: { inputTokens: number; outputTokens: number }) {
  return {
    usage,
    toolCalls: [{ input: { workspaceCard: { type: "none" } } }],
  };
}

describe("repairDiscussCardWithTool energy accounting", () => {
  beforeEach(() => {
    chargeMock.mockClear();
    generateTextMock.mockReset();
  });

  it("charges exactly once with summed usage when every attempt fails", async () => {
    generateTextMock.mockResolvedValueOnce(
      noneResponse({ inputTokens: 3, outputTokens: 1 }) as never,
    );
    generateTextMock.mockResolvedValueOnce(
      noneResponse({ inputTokens: 3, outputTokens: 1 }) as never,
    );

    const result = await repairDiscussCardWithTool(baseInput as never);

    expect(result).toBeNull();
    expect(chargeMock).toHaveBeenCalledTimes(1);
    expect(chargeMock).toHaveBeenCalledWith({
      userId: "u1",
      projectId: "p1",
      modelId: "m-1",
      inputTokens: 6,
      outputTokens: 2,
      reason: "discuss:repair",
    });
  });

  it("charges exactly once with summed usage on success after a failed attempt", async () => {
    generateTextMock.mockResolvedValueOnce(
      noneResponse({ inputTokens: 4, outputTokens: 1 }) as never,
    );
    generateTextMock.mockResolvedValueOnce(
      allowResponse({ inputTokens: 4, outputTokens: 1 }) as never,
    );

    const result = await repairDiscussCardWithTool(baseInput as never);

    expect(result?.workspaceCard.type).toBe("question");
    expect(chargeMock).toHaveBeenCalledTimes(1);
    expect(chargeMock).toHaveBeenCalledWith({
      userId: "u1",
      projectId: "p1",
      modelId: "m-1",
      inputTokens: 8,
      outputTokens: 2,
      reason: "discuss:repair",
    });
  });
});
