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

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    streamText: streamTextMock,
    convertToModelMessages: convertToModelMessagesMock,
    generateText: generateTextMock,
    tool: vi.fn((opts: unknown) => opts),
    jsonSchema: vi.fn((schema: unknown) => schema),
    Output: {
      json: vi.fn(() => ({})),
      object: vi.fn((opts: unknown) => opts),
    },
  };
});

vi.mock("@/lib/ai", () => ({
  getAiModel: vi.fn(() => "test-model"),
  getAiTelemetry: vi.fn(() => ({ isEnabled: false })),
  getNoReasoningCallOptions: vi.fn(() => ({ reasoning: "none" })),
}));

vi.mock("@/lib/ai-models", () => ({
  DEFAULT_AI_MODEL: "test/model",
  getDefaultAiModel: vi.fn(() => "test/model"),
  getDiscussModel: vi.fn(() => "test/model"),
  getModerationModel: vi.fn(() => "test/model"),
  getGenerationModel: vi.fn(() => "test/model"),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { $executeRaw: prismaExecuteRawMock },
}));

vi.mock("@/lib/user-credits", () => ({
  chargeEnergyForAiUsage: chargeEnergyForAiUsageMock,
  checkEnergy: vi.fn(async () => ({ allowed: true, remaining: 100 })),
  getEnergyConfig: vi.fn(() => ({
    signupGrant: 500_000,
    microUsdPerEnergy: 1_000_000,
    minBuild: 40_000,
    minDiscuss: 5_000,
    minEdit: 10_000,
    minModeration: 500,
  })),
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

vi.mock("@/lib/projects/discuss-tool", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./discuss-tool")>();
  return {
    ...actual,
    presentWorkspaceCardTool: {},
    buildOneCallSystemPrompt: vi.fn(() => "system-prompt"),
    buildCardSystemPrompt: vi.fn(() => "card-prompt"),
  };
});

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
  generationEngine: "legacy-v1",
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
      expect.objectContaining({ userId: "u1", reason: "discuss:step" }),
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
        errorMessage: "Obrolan belum berhasil diproses. Coba kirim ulang ya.",
      }),
    );
    expect(publishProgressMock).toHaveBeenCalledWith(
      "ct_fail",
      expect.objectContaining({
        type: "error",
        errorText: "Obrolan belum berhasil diproses. Coba kirim ulang ya.",
      }),
    );
    expect(prismaExecuteRawMock).not.toHaveBeenCalled();
  });

  it("text-only when card missing and one repair fails", async () => {
    // Primary stream: text only, no usable tool card.
    normalizeWorkspaceTurnMock.mockReturnValue({
      brief: baseBrief,
      projectTitle: "T",
      workspaceCard: { type: "none" },
      readyForBuild: false,
    } as never);
    streamTextMock.mockReturnValueOnce(
      makeStreamResult([{ type: "text-delta", text: "Cerita dulu ya." }]),
    );
    // Repair generateText: no valid tool card.
    generateTextMock.mockResolvedValueOnce({
      usage: { inputTokens: 1, outputTokens: 1 },
      toolCalls: [],
    });

    await runDiscussTurn({
      turnId: "ct_text_only",
      project: baseProject,
      chatContext: baseChatContext,
      effectiveBrief: baseBrief,
      memoryFacts: baseMemoryFacts,
      messages: baseMessages,
      summary: baseSummary,
      userId: "u1",
      modelOverride: "test-model" as never,
    });

    expect(generateTextMock).toHaveBeenCalledTimes(1);
    // Primary normalize + pre-text-only promote attempt.
    expect(normalizeWorkspaceTurnMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        hasBuiltSite: false,
        lastUserText: "hai",
      }),
    );
    expect(writeAiRequestLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ event: "discuss:text-only-fallback" }),
    );
    expect(finalizeDiscussTurnMock).toHaveBeenCalledWith(
      expect.objectContaining({
        turnId: "ct_text_only",
        status: "succeeded",
      }),
    );
    // Protocol none tool events so the stream settles without inventing cards.
    expect(publishProgressMock).toHaveBeenCalledWith(
      "ct_text_only",
      expect.objectContaining({
        type: "tool-output-available",
        output: expect.objectContaining({
          workspaceCard: { type: "none" },
        }),
      }),
    );
    expect(publishProgressMock).toHaveBeenCalledWith(
      "ct_text_only",
      expect.objectContaining({ type: "finish" }),
    );
  });

  it("built site: intentional none is success without repair or text-only-fallback", async () => {
    normalizeWorkspaceTurnMock.mockReturnValue({
      brief: baseBrief,
      projectTitle: "T",
      workspaceCard: { type: "none" },
      readyForBuild: false,
    } as never);
    streamTextMock.mockReturnValueOnce(
      makeStreamResult([
        { type: "text-delta", text: "Siap, aku bikinin varian warna baru." },
      ]),
    );

    await runDiscussTurn({
      turnId: "ct_built_none",
      project: { ...baseProject, status: "ready" },
      chatContext: baseChatContext,
      effectiveBrief: baseBrief,
      memoryFacts: baseMemoryFacts,
      messages: baseMessages,
      summary: baseSummary,
      userId: "u1",
      modelOverride: "test-model" as never,
    });

    expect(generateTextMock).not.toHaveBeenCalled();
    expect(writeAiRequestLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "discuss:finish",
        primaryToolFailed: false,
        workspaceCard: { type: "none" },
      }),
    );
    expect(writeAiRequestLogMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ event: "discuss:text-only-fallback" }),
    );
    expect(finalizeDiscussTurnMock).toHaveBeenCalledWith(
      expect.objectContaining({
        turnId: "ct_built_none",
        status: "succeeded",
      }),
    );
    expect(publishProgressMock).toHaveBeenCalledWith(
      "ct_built_none",
      expect.objectContaining({
        type: "tool-output-available",
        output: expect.objectContaining({
          workspaceCard: { type: "none" },
        }),
      }),
    );
  });

  it("forced tool-only: streams assistantText incrementally from tool-input-delta", async () => {
    const card = {
      type: "question",
      question: {
        id: "business_name",
        question: "Nama usahanya apa?",
        answerMode: "text",
        options: [],
      },
    };
    const fullText =
      "Oke, siap bantu bikin halaman jualan sayur! Pertama, nama usahanya apa?";
    normalizeWorkspaceTurnMock.mockReturnValue({
      brief: baseBrief,
      projectTitle: "Jualan Sayur",
      workspaceCard: card,
      readyForBuild: false,
    } as never);
    // Provider dumps entire tool args in one delta (common with 9Router).
    streamTextMock.mockReturnValueOnce(
      makeStreamResult([
        {
          type: "tool-input-start",
          id: "tc_tool_only",
          toolName: "presentWorkspaceCard",
        },
        {
          type: "tool-input-delta",
          id: "tc_tool_only",
          delta: JSON.stringify({
            assistantText: fullText,
            workspaceCard: card,
          }),
        },
        {
          type: "tool-call",
          toolCallId: "tc_tool_only",
          toolName: "presentWorkspaceCard",
          input: {
            assistantText: fullText,
            workspaceCard: card,
          },
        },
      ]),
    );

    await runDiscussTurn({
      turnId: "ct_tool_only_text",
      project: baseProject,
      chatContext: baseChatContext,
      effectiveBrief: baseBrief,
      memoryFacts: baseMemoryFacts,
      messages: baseMessages,
      summary: baseSummary,
      userId: "u1",
      modelOverride: "test-model" as never,
    });

    expect(generateTextMock).not.toHaveBeenCalled();
    const textDeltas = publishProgressMock.mock.calls
      .filter(
        ([publishedTurnId, event]) =>
          publishedTurnId === "ct_tool_only_text" &&
          event.type === "text-delta",
      )
      .map(([, event]) => event.delta as string);
    // Display pacing must split one provider dump into many text-deltas.
    expect(textDeltas.length).toBeGreaterThan(1);
    expect(textDeltas.join("")).toBe(fullText);
    const progressTypes = publishProgressMock.mock.calls
      .filter(([publishedTurnId]) => publishedTurnId === "ct_tool_only_text")
      .map(([, event]) => event.type);
    expect(progressTypes.indexOf("text-delta")).toBeLessThan(
      progressTypes.indexOf("text-end"),
    );
    const persistedValues = prismaExecuteRawMock.mock.calls
      .flatMap((call) => call.slice(1))
      .join("\n");
    expect(persistedValues).toContain(fullText);
    expect(finalizeDiscussTurnMock).toHaveBeenCalledWith(
      expect.objectContaining({
        turnId: "ct_tool_only_text",
        status: "succeeded",
      }),
    );
  });

  it("card repair: persists assistantText returned with the repaired card", async () => {
    const card = {
      type: "question",
      question: {
        id: "business_name",
        question: "Nama usahanya apa?",
        answerMode: "text",
        options: [],
      },
    };
    normalizeWorkspaceTurnMock.mockReturnValue({
      brief: baseBrief,
      projectTitle: "Jualan Sayur",
      workspaceCard: card,
      readyForBuild: false,
    } as never);
    streamTextMock.mockReturnValueOnce(makeStreamResult([]));
    generateTextMock.mockResolvedValueOnce({
      usage: { inputTokens: 2, outputTokens: 3 },
      toolCalls: [
        {
          input: {
            assistantText: "Aku siap bantu. Pertama, nama usahanya apa?",
            workspaceCard: card,
          },
        },
      ],
    });

    await runDiscussTurn({
      turnId: "ct_repair_text",
      project: baseProject,
      chatContext: baseChatContext,
      effectiveBrief: baseBrief,
      memoryFacts: baseMemoryFacts,
      messages: baseMessages,
      summary: baseSummary,
      userId: "u1",
      modelOverride: "test-model" as never,
    });

    const repairText = "Aku siap bantu. Pertama, nama usahanya apa?";
    const textDeltas = publishProgressMock.mock.calls
      .filter(
        ([publishedTurnId, event]) =>
          publishedTurnId === "ct_repair_text" && event.type === "text-delta",
      )
      .map(([, event]) => event.delta as string);
    expect(textDeltas.length).toBeGreaterThan(1);
    expect(textDeltas.join("")).toBe(repairText);
    expect(publishProgressMock).toHaveBeenCalledWith("ct_repair_text", {
      type: "text-start",
      id: "discuss-text-repair",
    });
    expect(publishProgressMock).toHaveBeenCalledWith("ct_repair_text", {
      type: "text-end",
      id: "discuss-text-repair",
    });
    const persistedValues = prismaExecuteRawMock.mock.calls
      .flatMap((call) => call.slice(1))
      .join("\n");
    expect(persistedValues).toContain(repairText);
  });

  it("legacy gate demotes a premature build recommendation to a question", async () => {
    normalizeWorkspaceTurnMock.mockReturnValue({
      brief: baseBrief,
      projectTitle: "Kedai Kopi",
      workspaceCard: {
        type: "build_recommendation",
        title: "Siap dibangun",
        summary: ["Yuk langsung"],
      },
      readyForBuild: true,
    } as never);
    streamTextMock.mockReturnValueOnce(
      makeStreamResult([
        { type: "text-delta", text: "Sip, siap dibangun" },
        {
          type: "tool-call",
          toolCallId: "tc1",
          toolName: "presentWorkspaceCard",
          input: {
            assistantText: "Sip, siap dibangun",
            workspaceCard: { type: "build_recommendation" },
          },
        },
      ]),
    );

    await runDiscussTurn({
      turnId: "ct_gate_demote",
      project: baseProject,
      chatContext: baseChatContext,
      effectiveBrief: baseBrief,
      memoryFacts: baseMemoryFacts,
      messages: baseMessages,
      summary: baseSummary,
      userId: "u1",
      modelOverride: "test-model" as never,
    });

    // build_recommendation was demoted to a question card.
    const cardEvent = publishProgressMock.mock.calls
      .filter(
        ([publishedTurnId, event]) =>
          publishedTurnId === "ct_gate_demote" &&
          event.type === "tool-output-available",
      )
      .map(([, event]) => event.output.workspaceCard)[0] as {
      type: "question";
      question: { id: string };
    };
    expect(cardEvent.type).toBe("question");
    expect(cardEvent.question.id).toBe("businessName");
    expect(writeAiRequestLogMock).toHaveBeenCalled();
  });

  it("legacy gate lets an explicit early build through with a warning", async () => {
    normalizeWorkspaceTurnMock.mockReturnValue({
      brief: baseBrief,
      projectTitle: "Kedai Kopi",
      workspaceCard: {
        type: "build_recommendation",
        title: "Siap dibangun",
        summary: ["Yuk langsung"],
      },
      readyForBuild: true,
    } as never);
    streamTextMock.mockReturnValueOnce(
      makeStreamResult([
        { type: "text-delta", text: "Oke, aku bangun" },
        {
          type: "tool-call",
          toolCallId: "tc1",
          toolName: "presentWorkspaceCard",
          input: {
            assistantText: "Oke, aku bangun",
            workspaceCard: { type: "build_recommendation" },
          },
        },
      ]),
    );
    const eagerMessages: UIMessage[] = [
      {
        id: "m1",
        role: "user",
        parts: [{ type: "text", text: "langsung bangun aja" }] as never,
      },
    ];

    await runDiscussTurn({
      turnId: "ct_gate_eager",
      project: baseProject,
      chatContext: { ...baseChatContext, messages: eagerMessages },
      effectiveBrief: baseBrief,
      memoryFacts: baseMemoryFacts,
      messages: eagerMessages,
      summary: baseSummary,
      userId: "u1",
      modelOverride: "test-model" as never,
    });

    const cardEvent = publishProgressMock.mock.calls
      .filter(
        ([publishedTurnId, event]) =>
          publishedTurnId === "ct_gate_eager" &&
          event.type === "tool-output-available",
      )
      .map(([, event]) => event.output.workspaceCard)[0] as {
      type: "build_recommendation";
    };
    expect(cardEvent.type).toBe("build_recommendation");
    expect(finalizeDiscussTurnMock).toHaveBeenCalledWith(
      expect.objectContaining({ turnId: "ct_gate_eager", status: "succeeded" }),
    );
  });
});
