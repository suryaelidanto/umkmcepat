import { beforeEach, describe, expect, it, vi } from "vitest";

const { chargeMock, executeRawMock, generateTextMock, recordAiCallMock } =
  vi.hoisted(() => ({
    chargeMock: vi.fn(async (..._args: unknown[]) => null),
    executeRawMock: vi.fn(async (..._args: unknown[]) => 1),
    generateTextMock: vi.fn(),
    recordAiCallMock: vi.fn(),
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

vi.mock("@/lib/ai/ai-call-record", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai/ai-call-record")>()),
  recordAiCall: (...args: unknown[]) => recordAiCallMock(...args),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { $executeRaw: (...args: unknown[]) => executeRawMock(...args) },
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

import {
  persistProjectChatCompaction,
  persistProjectChatTurn,
  repairDiscussCardWithTool,
} from "./discuss-turn-shared";

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

describe("persistProjectChatTurn context checkpoint", () => {
  beforeEach(() => {
    executeRawMock.mockClear();
  });

  it("writes the latest discussion context into the canonical brief", async () => {
    await persistProjectChatTurn({
      brief: {
        version: 2,
        business: { name: "Kedai Pagi", type: "fnb" },
        offers: [{ name: "Sarapan", isPrimary: true }],
      },
      discussionContext: {
        memoryFacts: {
          facts: ["Usaha sarapan"],
          decisions: [],
          ownerNotes: ["Buka pagi"],
          preferences: [],
        },
        summary: {
          text: "Pemilik membuka kedai pagi.",
          compactedMessageCount: 4,
          compactedThroughMessageId: "m4",
        },
      },
      messages: [
        {
          id: "m5",
          role: "user",
          parts: [{ type: "text", text: "Tampilkan menu sarapan" }],
        },
      ] as never,
      projectId: "p1",
      title: "Kedai Pagi",
      userId: "u1",
      workspaceCard: null,
    });

    const serialized = executeRawMock.mock.calls[0]
      ?.map((part) => String(part))
      .join(" ");
    expect(serialized).toContain('"compactedThroughMessageId":"m4"');
    expect(serialized).toContain('"ownerNotes":["Buka pagi"]');
    expect(serialized).toContain("Tampilkan menu sarapan");
  });
});

describe("persistProjectChatCompaction concurrency", () => {
  beforeEach(() => {
    executeRawMock.mockClear();
  });

  it("only advances the compaction checkpoint", async () => {
    await persistProjectChatCompaction({
      compactedMessageCount: 40,
      memoryFacts: { version: 1 },
      projectId: "p1",
      summary: { version: 1, compactedMessageCount: 40 },
      userId: "u1",
    });

    const query = executeRawMock.mock.calls[0]
      ?.map((part) => String(part))
      .join(" ");
    expect(query).toContain('"lastCompactedMessageCount" <= ');
  });
});

describe("repairDiscussCardWithTool energy accounting", () => {
  beforeEach(() => {
    chargeMock.mockClear();
    generateTextMock.mockReset();
    recordAiCallMock.mockClear();
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
    expect(recordAiCallMock).toHaveBeenCalledTimes(2);
    expect(recordAiCallMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        inputTokens: 3,
        outputTokens: 1,
        projectId: "p1",
        status: "ok",
        task: "discuss-repair",
      }),
    );
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
    expect(recordAiCallMock).toHaveBeenCalledTimes(2);
    expect(recordAiCallMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        inputTokens: 4,
        outputTokens: 1,
        projectId: "p1",
        status: "ok",
        task: "discuss-repair",
      }),
    );
  });
});
