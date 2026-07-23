import { afterEach, describe, expect, it, vi } from "vitest";

const {
  streamTextMock,
  convertToModelMessagesMock,
  generateTextMock,
  prismaExecuteRawMock,
  finalizeDiscussTurnMock,
  publishProgressMock,
  chargeEnergyForAiUsageMock,
  writeAiRequestLogMock,
  maybeCompactProjectChatMock,
  normalizeWorkspaceTurnMock,
} = vi.hoisted(() => ({
  streamTextMock: vi.fn(),
  convertToModelMessagesMock: vi.fn(async () => []),
  generateTextMock: vi.fn(),
  prismaExecuteRawMock: vi.fn(),
  finalizeDiscussTurnMock: vi.fn(async () => undefined),
  publishProgressMock: vi.fn(),
  chargeEnergyForAiUsageMock: vi.fn(async () => null),
  writeAiRequestLogMock: vi.fn(async () => undefined),
  maybeCompactProjectChatMock: vi.fn(async () => null),
  normalizeWorkspaceTurnMock: vi.fn(() => ({
    brief: { prompt: "p", confidence: 0 },
    projectTitle: "t",
    workspaceCard: { type: "none" },
    readyForBuild: false,
  })),
}));

vi.mock("ai", () => ({
  streamText: streamTextMock,
  convertToModelMessages: convertToModelMessagesMock,
  generateText: generateTextMock,
  tool: vi.fn((opts: unknown) => opts),
  jsonSchema: vi.fn((schema: unknown) => schema),
  Output: { json: vi.fn(() => ({})), object: vi.fn((opts: unknown) => opts) },
}));

vi.mock("@/lib/ai", () => ({
  getAiModel: vi.fn(() => "test-model"),
  getAiTelemetry: vi.fn(() => ({ isEnabled: false })),
}));

vi.mock("@/lib/ai-models", () => ({
  DEFAULT_AI_MODEL: "test/model",
  getDefaultAiModel: vi.fn(() => "test/model"),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { $executeRaw: prismaExecuteRawMock },
}));

vi.mock("@/lib/user-credits", () => ({
  chargeEnergyForAiUsage: chargeEnergyForAiUsageMock,
  checkEnergy: vi.fn(async () => ({ allowed: true, remaining: 100 })),
  isUserVerified: vi.fn(async () => true),
  MIN_ENERGY_DISCUSS: 100,
}));

vi.mock("@/lib/ai-request-log", () => ({
  writeAiRequestLog: writeAiRequestLogMock,
}));

vi.mock("@/lib/projects/discuss-turn", () => ({
  finalizeDiscussTurn: finalizeDiscussTurnMock,
  claimDiscussTurn: vi.fn(async () => ({ claimed: true, turnId: "ct_test" })),
}));

vi.mock("@/lib/projects/discuss-turn-pubsub", () => ({
  publishProgress: publishProgressMock,
}));

vi.mock("@/lib/projects/chat-compaction", () => ({
  maybeCompactProjectChat: maybeCompactProjectChatMock,
}));

vi.mock("@/lib/projects/brief-flow", () => ({
  normalizeWorkspaceTurn: normalizeWorkspaceTurnMock,
}));

vi.mock("@/lib/projects/strip-transport-diagnostic-messages", () => ({
  stripTransportDiagnosticMessages: (m: unknown) => m,
}));

vi.mock("@/lib/projects/ai-error-log", () => ({
  getSafeAiErrorLog: (e: unknown) =>
    e instanceof Error ? e.message : String(e),
}));

vi.mock("@/lib/projects/brief-rich-fields", () => ({
  validateBrief: (b: unknown) => ({ cleaned: b ?? {}, dropped: [] }),
}));

vi.mock("@/lib/projects/discuss-tool", () => ({
  PRESENT_WORKSPACE_CARD_TOOL_NAME: "presentWorkspaceCard",
  presentWorkspaceCardTool: {},
  buildOneCallSystemPrompt: vi.fn(() => "system-prompt"),
  buildCardSystemPrompt: vi.fn(() => "card-prompt"),
}));

import { createEmptyChatSummary, createEmptyMemoryFacts } from "./chat-memory";
import { runDiscussTurn } from "./discuss-turn-worker";

import type { UIMessage } from "ai";

function makeStreamResult(parts: unknown[]) {
  return {
    stream: (async function* () {
      for (const p of parts) {
        yield p;
      }
    })(),
    usage: Promise.resolve({ inputTokens: 10, outputTokens: 5 }),
    response: Promise.resolve({ modelId: "test-model" }),
  };
}

const baseProject = {
  id: "p1",
  prompt: "Saya jual kopi",
  status: "draft",
  title: "T",
};
const baseMessages: UIMessage[] = [
  { id: "m1", role: "user", parts: [{ type: "text", text: "hai" }] as never },
];
const baseChatContext = { messages: baseMessages, systemContext: "" };
const baseBrief = { prompt: "Saya jual kopi", confidence: 0 } as never;
const baseMemoryFacts = createEmptyMemoryFacts();
const baseSummary = createEmptyChatSummary();

describe("runDiscussTurn worker", () => {
  afterEach(() => vi.clearAllMocks());

  it("persists the assistant reply + finalizes succeeded + publishes finish on happy path", async () => {
    // normalizeWorkspaceTurn returns a non-none card → primaryToolFailed=false
    // → no repair → straight to persist + charge + finalize.
    normalizeWorkspaceTurnMock.mockReturnValueOnce({
      brief: baseBrief,
      projectTitle: "T",
      workspaceCard: {
        type: "question",
        question: {
          id: "q1",
          question: "Pilih?",
          answerMode: "text",
          options: [],
        },
      },
      readyForBuild: false,
    } as never);
    streamTextMock.mockReturnValueOnce(
      makeStreamResult([
        { type: "text-delta", text: "Halo" },
        {
          type: "tool-call",
          toolCallId: "tc1",
          toolName: "presentWorkspaceCard",
          input: { workspaceCard: { type: "question" } },
        },
      ]),
    );

    await runDiscussTurn({
      turnId: "ct_test",
      project: baseProject,
      chatContext: baseChatContext,
      effectiveBrief: baseBrief,
      memoryFacts: baseMemoryFacts,
      messages: baseMessages,
      summary: baseSummary,
      userId: "u1",
      modelOverride: "test-model" as never,
    });

    // Persisted the assistant reply (chatMessages grew).
    expect(prismaExecuteRawMock).toHaveBeenCalled();
    // Finalized the turn as succeeded.
    expect(finalizeDiscussTurnMock).toHaveBeenCalledWith(
      expect.objectContaining({ turnId: "ct_test", status: "succeeded" }),
    );
    // Published finish.
    expect(publishProgressMock).toHaveBeenCalledWith(
      "ct_test",
      expect.objectContaining({ type: "finish" }),
    );
    // Charged energy for the turn.
    expect(chargeEnergyForAiUsageMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", reason: "discuss_turn" }),
    );
  });

  it("finalizes failed + publishes error when streamText throws", async () => {
    streamTextMock.mockImplementationOnce(() => {
      throw new Error("model down");
    });

    await runDiscussTurn({
      turnId: "ct_fail",
      project: baseProject,
      chatContext: baseChatContext,
      effectiveBrief: baseBrief,
      memoryFacts: baseMemoryFacts,
      messages: baseMessages,
      summary: baseSummary,
      userId: "u1",
    });

    expect(finalizeDiscussTurnMock).toHaveBeenCalledWith(
      expect.objectContaining({
        turnId: "ct_fail",
        status: "failed",
        errorMessage: "model down",
      }),
    );
    expect(publishProgressMock).toHaveBeenCalledWith(
      "ct_fail",
      expect.objectContaining({ type: "error", message: "model down" }),
    );
    expect(prismaExecuteRawMock).not.toHaveBeenCalled();
  });
});
