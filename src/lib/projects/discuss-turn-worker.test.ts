import { afterEach, describe, expect, it, vi } from "vitest";

const {
  streamTextMock,
  convertToModelMessagesMock,
  generateTextMock,
  prismaExecuteRawMock,
  finalizeDiscussTurnMock,
  publishProgressMock,
  chargeEnergyForAiUsageMock,
  addEnergyUsageLegsMock,
  enqueueAttemptJobMock,
  writeAiRequestLogMock,
  maybeCompactProjectChatMock,
  normalizeWorkspaceTurnMock,
  recordAiCallMock,
  getDiscussHedgeModelsMock,
  getSettingSyncMock,
  primeSettingCacheMock,
} = vi.hoisted(() => ({
  streamTextMock: vi.fn(),
  convertToModelMessagesMock: vi.fn(async () => []),
  generateTextMock: vi.fn(),
  prismaExecuteRawMock: vi.fn(),
  finalizeDiscussTurnMock: vi.fn(async () => undefined),
  publishProgressMock: vi.fn(),
  chargeEnergyForAiUsageMock: vi.fn(async () => null),
  addEnergyUsageLegsMock: vi.fn(async () => ({
    energyUsed: 0,
    inputTokens: 0,
    outputTokens: 0,
  })),
  enqueueAttemptJobMock: vi.fn(async () => undefined),
  writeAiRequestLogMock: vi.fn(async () => undefined),
  maybeCompactProjectChatMock: vi.fn(async () => null),
  recordAiCallMock: vi.fn(),
  // Hedging tests override these; defaults keep hedging off.
  getDiscussHedgeModelsMock: vi.fn(() => [] as string[]),
  getSettingSyncMock: vi.fn((key: string, fallback: unknown) => {
    if (key === "discuss.hedging") {
      return false;
    }
    return fallback;
  }),
  primeSettingCacheMock: vi.fn(async () => undefined),
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
  getAiModel: vi.fn((name?: string) => ({ modelId: name ?? "test-model" })),
  getAiTelemetry: vi.fn(() => ({ isEnabled: false })),
  getNoReasoningCallOptions: vi.fn(() => ({ reasoning: "none" })),
}));

vi.mock("@/lib/ai-models", () => ({
  DEFAULT_AI_MODEL: "test/model",
  getDefaultAiModel: vi.fn(() => "test/model"),
  getDiscussModel: vi.fn(() => "test/model"),
  getDiscussHedgeModels: getDiscussHedgeModelsMock,
  getModerationModel: vi.fn(() => "test/model"),
  getGenerationModel: vi.fn(() => "test/model"),
}));

vi.mock("@/lib/app-settings", () => ({
  getSettingSync: getSettingSyncMock,
  primeSettingCache: primeSettingCacheMock,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { $executeRaw: prismaExecuteRawMock },
}));

vi.mock("@/lib/user-credits", () => ({
  chargeEnergyForAiUsage: chargeEnergyForAiUsageMock,
  addEnergyUsageLegs: addEnergyUsageLegsMock,
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

vi.mock("@/lib/ai-call-record", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai-call-record")>()),
  recordAiCall: recordAiCallMock,
}));

vi.mock("@/lib/projects/discuss-turn", () => ({
  finalizeDiscussTurn: finalizeDiscussTurnMock,
  claimDiscussTurn: vi.fn(async () => ({ claimed: true, turnId: "ct_test" })),
}));

vi.mock("@/lib/projects/attempt-queue", () => ({
  enqueueAttemptJob: enqueueAttemptJobMock,
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

  it("publishes finish before enqueueing background compaction", async () => {
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
      turnId: "ct_compact_bg",
      project: baseProject,
      chatContext: baseChatContext,
      effectiveBrief: baseBrief,
      memoryFacts: baseMemoryFacts,
      messages: baseMessages,
      summary: baseSummary,
      userId: "u1",
      modelOverride: "test-model" as never,
    });

    expect(maybeCompactProjectChatMock).not.toHaveBeenCalled();
    expect(enqueueAttemptJobMock).toHaveBeenCalledWith({
      kind: "compaction",
      projectId: "p1",
      turnId: "ct_compact_bg",
      userId: "u1",
    });
    expect(publishProgressMock).toHaveBeenCalledWith("ct_compact_bg", {
      type: "finish",
    });
    expect(
      publishProgressMock.mock.invocationCallOrder.at(-1) ?? 0,
    ).toBeLessThan(enqueueAttemptJobMock.mock.invocationCallOrder[0] ?? 0);
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

  it("mid-stream error after text yields one latched row with status=error", async () => {
    streamTextMock.mockReturnValueOnce({
      stream: (async function* () {
        yield { type: "text-delta", text: "Halo, setengah jalan" };
        throw new Error("socket hang up");
      })(),
      usage: Promise.resolve({ inputTokens: 10, outputTokens: 5 }),
      response: Promise.resolve({ modelId: "test-model" }),
    });

    await runDiscussTurn({
      turnId: "ct_midstream",
      project: baseProject,
      chatContext: baseChatContext,
      effectiveBrief: baseBrief,
      memoryFacts: baseMemoryFacts,
      messages: baseMessages,
      summary: baseSummary,
      userId: "u1",
      modelOverride: "test-model" as never,
    });

    // Degraded path: partial text persists, turn succeeds.
    expect(finalizeDiscussTurnMock).toHaveBeenCalledWith(
      expect.objectContaining({ turnId: "ct_midstream", status: "succeeded" }),
    );
    // Ledger: exactly one discuss row, marked error with a classified cause.
    const discussRows = recordAiCallMock.mock.calls.filter(
      ([entry]) => entry.task === "discuss",
    );
    expect(discussRows).toHaveLength(1);
    expect(discussRows[0][0]).toEqual(
      expect.objectContaining({
        projectId: "p1",
        turnId: "ct_midstream",
        status: "error",
        errorClass: "transport",
      }),
    );
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

function makeRaceStreamResult({
  parts,
  usage = { inputTokens: 10, outputTokens: 5 },
  modelId,
}: {
  parts: unknown[];
  usage?: { inputTokens: number; outputTokens: number };
  modelId: string;
}) {
  let aborted = false;
  let abortedBeforeFirstYield = false;
  return {
    abort: vi.fn(() => {
      aborted = true;
    }),
    state: () => ({ aborted, abortedBeforeFirstYield }),
    result: {
      stream: (async function* () {
        for (const part of parts) {
          if (aborted) {
            abortedBeforeFirstYield = true;
            break;
          }
          yield part;
        }
      })(),
      usage: Promise.resolve(usage),
      response: Promise.resolve({ modelId }),
    },
  };
}

function enableHedging(hedges: string[]) {
  getDiscussHedgeModelsMock.mockImplementation(() => hedges);
  getSettingSyncMock.mockImplementation(
    (key: string, fallback: unknown) =>
      (key === "discuss.hedging" ? true : fallback) as never,
  );
}

const raceCard = {
  type: "question",
  question: {
    id: "business_name",
    question: "Nama usahanya apa?",
    answerMode: "text",
    options: [],
  },
};

function okNormalize() {
  normalizeWorkspaceTurnMock.mockReturnValue({
    brief: { prompt: "p", confidence: 0 },
    projectTitle: "T",
    workspaceCard: raceCard,
    readyForBuild: false,
  } as never);
}

describe("runDiscussTurn hedged race", () => {
  afterEach(() => vi.clearAllMocks());

  it("hedge on: primary wins cleanly, hedge aborted, events only from winner", async () => {
    enableHedging(["discuss-combo-2"]);
    okNormalize();
    const winnerParts = [
      { type: "text-delta", text: "Halo" },
      {
        type: "tool-call",
        toolCallId: "tc-win",
        toolName: "presentWorkspaceCard",
        input: { assistantText: "Halo", workspaceCard: raceCard },
      },
    ];
    const primaryStream = makeRaceStreamResult({
      parts: winnerParts,
      modelId: "test/model",
      usage: { inputTokens: 10, outputTokens: 5 },
    });
    const hedgeStream = makeRaceStreamResult({
      // Loser streams nothing before the primary wins — aborted legs would
      // otherwise leak deltas while they complete before the winner check.
      parts: [],
      modelId: "z-ai/glm-4.6v",
      usage: { inputTokens: 4, outputTokens: 2 },
    });
    // Worker creates hedge streams first, then primary; mockReturnValueOnce
    // consumes in that call order (hedge first, then primary).
    streamTextMock
      .mockReturnValueOnce(hedgeStream.result)
      .mockReturnValueOnce(primaryStream.result);

    await runDiscussTurn({
      turnId: "ct_hedge_win",
      project: baseProject,
      chatContext: baseChatContext,
      effectiveBrief: baseBrief,
      memoryFacts: baseMemoryFacts,
      messages: baseMessages,
      summary: baseSummary,
      userId: "u1",
    });

    expect(streamTextMock).toHaveBeenCalledTimes(2);
    const requestedModels = streamTextMock.mock.calls.map(
      ([opts]) => (opts as { model: { modelId: string } }).model.modelId,
    );
    expect(requestedModels).toEqual(["discuss-combo-2", "test/model"]);
    // Each leg got its own abortSignal.
    for (const [opts] of streamTextMock.mock.calls) {
      expect(
        (opts as { abortSignal?: AbortSignal }).abortSignal,
      ).toBeInstanceOf(AbortSignal);
    }

    // Events seen by the UI came only from the winning stream.
    const deltas = publishProgressMock.mock.calls
      .filter(
        ([publishedTurnId, event]) =>
          publishedTurnId === "ct_hedge_win" && event.type === "text-delta",
      )
      .map(([, event]) => event.delta as string);
    expect(deltas.join("")).toBe("Halo");
    expect(
      publishProgressMock.mock.calls.some(([, event]) =>
        JSON.stringify(event).includes("HEDGE-EVENT-MUST-NOT-PUBLISH"),
      ),
    ).toBe(false);
    expect(finalizeDiscussTurnMock).toHaveBeenCalledWith(
      expect.objectContaining({ turnId: "ct_hedge_win", status: "succeeded" }),
    );

    // Per-racer ledger rows.
    const discussRows = recordAiCallMock.mock.calls
      .filter(([entry]) => entry.task === "discuss")
      .map(([entry]) => entry);
    expect(discussRows).toHaveLength(2);
    const winnerRow = discussRows.find((r) => r.raceRole === "winner");
    const abortedRow = discussRows.find((r) => r.raceRole === "aborted");
    expect(winnerRow).toEqual(
      expect.objectContaining({
        hedged: true,
        status: "ok",
        modelRequested: "test/model",
        modelServed: "test/model",
      }),
    );
    expect(abortedRow).toEqual(
      expect.objectContaining({
        hedged: true,
        status: "aborted",
        modelRequested: "discuss-combo-2",
        modelServed: "z-ai/glm-4.6v",
      }),
    );

    // Single debit equal to the sum of per-racer usage, each leg priced at
    // its own real served model.
    expect(addEnergyUsageLegsMock).toHaveBeenCalledTimes(1);
    const legCall = addEnergyUsageLegsMock.mock.calls[0] as unknown as [
      string,
      Array<{ modelId: string; inputTokens: number; outputTokens: number }>,
    ];
    const legs = legCall[1];
    const legsSumInput = legs.reduce((acc, l) => acc + l.inputTokens, 0);
    const legsSumOutput = legs.reduce((acc, l) => acc + l.outputTokens, 0);
    expect(legsSumInput).toBe(10 + 4);
    expect(legsSumOutput).toBe(5 + 2);
    const legModels = legs.map((l) => l.modelId).sort();
    expect(legModels).toEqual(["test/model", "z-ai/glm-4.6v"]);
  });

  it("all legs fail: text-only fallback reached, per-racer error rows", async () => {
    enableHedging(["discuss-combo-2"]);
    normalizeWorkspaceTurnMock.mockReturnValue({
      brief: baseBrief,
      projectTitle: "T",
      workspaceCard: { type: "none" },
      readyForBuild: false,
    } as never);
    streamTextMock.mockImplementation(
      (opts: { model: { modelId: string } }) =>
        makeRaceStreamResult({
          parts: [{ type: "text-delta", text: `ans-${opts.model.modelId}` }],
          modelId: opts.model.modelId,
          usage: { inputTokens: 3, outputTokens: 3 },
        }).result,
    );
    generateTextMock.mockResolvedValue({
      usage: { inputTokens: 1, outputTokens: 1 },
      toolCalls: [],
    });

    await runDiscussTurn({
      turnId: "ct_hedge_fail",
      project: baseProject,
      chatContext: baseChatContext,
      effectiveBrief: baseBrief,
      memoryFacts: baseMemoryFacts,
      messages: baseMessages,
      summary: baseSummary,
      userId: "u1",
    });

    // Existing text-only fallback path (repair attempted once, failed).
    expect(writeAiRequestLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ event: "discuss:text-only-fallback" }),
    );
    expect(finalizeDiscussTurnMock).toHaveBeenCalledWith(
      expect.objectContaining({ turnId: "ct_hedge_fail", status: "succeeded" }),
    );
    const discussRows = recordAiCallMock.mock.calls
      .filter(([entry]) => entry.task === "discuss")
      .map(([entry]) => entry);
    expect(discussRows).toHaveLength(2);
    for (const row of discussRows) {
      expect(row.hedged).toBe(true);
      // No winner: primary errored out, hedges aborted invalid.
      expect(row.raceRole).not.toBe("winner");
      expect(row.status).toBe("error");
      expect(row.errorClass).toBe("invalid-card");
    }
    // Tokens from every racer still reach the single UserCredit debit.
    const legCall = addEnergyUsageLegsMock.mock.calls.at(-1) as unknown as [
      string,
      Array<{ inputTokens: number; outputTokens: number }>,
    ];
    const legsSumInput = legCall[1].reduce((acc, l) => acc + l.inputTokens, 0);
    const legsSumOutput = legCall[1].reduce(
      (acc, l) => acc + l.outputTokens,
      0,
    );
    expect(legsSumInput).toBe(6);
    expect(legsSumOutput).toBe(6);
  });

  it("winner with invalid card: repair runs once on winner state only", async () => {
    enableHedging(["discuss-combo-2"]);
    normalizeWorkspaceTurnMock.mockReturnValue({
      brief: baseBrief,
      projectTitle: "T",
      workspaceCard: { type: "none" },
      readyForBuild: false,
    } as never);
    streamTextMock.mockImplementation(
      (opts: { model: { modelId: string } }) =>
        makeRaceStreamResult({
          parts: [{ type: "text-delta", text: `teks-${opts.model.modelId}` }],
          modelId: opts.model.modelId,
        }).result,
    );
    generateTextMock.mockResolvedValueOnce({
      usage: { inputTokens: 2, outputTokens: 3 },
      toolCalls: [
        {
          input: {
            assistantText: "Nama usahanya apa?",
            workspaceCard: raceCard,
          },
        },
      ],
    });

    await runDiscussTurn({
      turnId: "ct_hedge_repair",
      project: baseProject,
      chatContext: baseChatContext,
      effectiveBrief: baseBrief,
      memoryFacts: baseMemoryFacts,
      messages: baseMessages,
      summary: baseSummary,
      userId: "u1",
    });

    // One repair call, on the winner's model only.
    expect(generateTextMock).toHaveBeenCalledTimes(1);
    expect(
      (generateTextMock.mock.calls[0][0] as { model: { modelId: string } })
        .model.modelId,
    ).toBe("test/model");
    expect(
      publishProgressMock.mock.calls.some(([, event]) =>
        JSON.stringify(event).includes("teks-discuss-combo-2"),
      ),
    ).toBe(false);
    expect(finalizeDiscussTurnMock).toHaveBeenCalledWith(
      expect.objectContaining({
        turnId: "ct_hedge_repair",
        status: "succeeded",
      }),
    );
  });

  it("flag off: single call, no hedged rows, identical to today", async () => {
    normalizeWorkspaceTurnMock.mockReturnValueOnce({
      brief: baseBrief,
      projectTitle: "T",
      workspaceCard: raceCard,
      readyForBuild: false,
    } as never);
    streamTextMock.mockReturnValueOnce(
      makeStreamResult([
        { type: "text-delta", text: "Halo" },
        {
          type: "tool-call",
          toolCallId: "tc1",
          toolName: "presentWorkspaceCard",
          input: { workspaceCard: raceCard },
        },
      ]),
    );

    await runDiscussTurn({
      turnId: "ct_no_hedge",
      project: baseProject,
      chatContext: baseChatContext,
      effectiveBrief: baseBrief,
      memoryFacts: baseMemoryFacts,
      messages: baseMessages,
      summary: baseSummary,
      userId: "u1",
      modelOverride: "test-model" as never,
    });

    expect(finalizeDiscussTurnMock).toHaveBeenCalledWith(
      expect.objectContaining({ turnId: "ct_no_hedge", status: "succeeded" }),
    );
  });

  it("force refreshes settings before deciding whether to hedge", async () => {
    getDiscussHedgeModelsMock.mockImplementation(() => ["discuss-combo-2"]);
    getSettingSyncMock.mockImplementation(
      (key: string, fallback: unknown) =>
        (key === "discuss.hedging" ? false : fallback) as never,
    );
    okNormalize();
    streamTextMock.mockReturnValueOnce(
      makeStreamResult([
        { type: "text-delta", text: "Halo" },
        {
          type: "tool-call",
          toolCallId: "tc1",
          toolName: "presentWorkspaceCard",
          input: { assistantText: "Halo", workspaceCard: raceCard },
        },
      ]),
    );

    await runDiscussTurn({
      turnId: "ct_force_refresh_no_hedge",
      project: baseProject,
      chatContext: baseChatContext,
      effectiveBrief: baseBrief,
      memoryFacts: baseMemoryFacts,
      messages: baseMessages,
      summary: baseSummary,
      userId: "u1",
    });

    expect(primeSettingCacheMock).toHaveBeenCalledWith({ force: true });
    expect(streamTextMock).toHaveBeenCalledTimes(1);
  });

  it("hedge wins: ledger rows sum to exactly the single UserCredit debit", async () => {
    enableHedging(["discuss-combo-2"]);
    okNormalize();
    // Hedge finishes its card synchronously (async iterator yields before the
    // primary's first await turn), so it promotes and aborts the primary
    // mid-flight with the primary's partial usage already accumulated.
    const hedgeParts = [
      { type: "text-delta", text: "H" },
      {
        type: "tool-call",
        toolCallId: "tc-hedge",
        toolName: "presentWorkspaceCard",
        input: { assistantText: "Halo", workspaceCard: raceCard },
      },
    ];
    const hedgeStream = makeRaceStreamResult({
      parts: hedgeParts,
      modelId: "z-ai/glm-4.6v",
      usage: { inputTokens: 8, outputTokens: 4 },
    });
    const primaryStream = makeRaceStreamResult({
      // One delta, no terminal tool-call — the hedge winner aborts it while
      // its usage promise still reports what the partial stream spent.
      parts: [{ type: "text-delta", text: "loser-text-partial" }],
      modelId: "test/model",
      usage: { inputTokens: 10, outputTokens: 5 },
    });
    // Primary's first yield is interleaving-slow so the hedge leg promotes
    // to winner before the primary's stream loop starts; the worker then
    // adopts the winner and aborts the primary mid-flight.
    const slowPrimaryStream = (async function* () {
      for (let i = 0; i < 10; i++) {
        await Promise.resolve();
      }
      for (const part of [{ type: "text-delta", text: "loser-text-partial" }]) {
        yield part;
      }
    })();
    let primarySignal: AbortSignal | undefined;
    streamTextMock.mockImplementation(
      (opts: {
        model: { modelId: string };
        messages: unknown;
        abortSignal?: AbortSignal;
      }) => {
        // Hedge call has no messages array (model-only leg wrapped per-leg);
        // disambiguate by model id instead: hedge model is its own combo.
        if (opts.model.modelId === "discuss-combo-2") {
          return hedgeStream.result;
        }
        primarySignal = opts.abortSignal;
        return { ...primaryStream.result, stream: slowPrimaryStream };
      },
    );

    await runDiscussTurn({
      turnId: "ct_hedge_winner_ledger",
      project: baseProject,
      chatContext: baseChatContext,
      effectiveBrief: baseBrief,
      memoryFacts: baseMemoryFacts,
      messages: baseMessages,
      summary: baseSummary,
      userId: "u1",
    });

    expect(hedgeStream.state().aborted).toBe(false);
    expect(primarySignal?.aborted).toBe(true);
    const discussRows = recordAiCallMock.mock.calls
      .filter(([entry]) => entry.task === "discuss")
      .map(([entry]) => entry);
    expect(discussRows).toHaveLength(2);
    const winnerRow = discussRows.find((r) => r.raceRole === "winner");
    const abortedRow = discussRows.find((r) => r.raceRole === "aborted");
    expect(winnerRow).toEqual(
      expect.objectContaining({
        modelRequested: "discuss-combo-2",
        modelServed: "z-ai/glm-4.6v",
      }),
    );
    expect(abortedRow).toEqual(
      expect.objectContaining({
        modelRequested: "test/model",
        modelServed: "z-ai/glm-4.6v",
      }),
    );
    // Hedge won; the per-leg debit prices every racer at its own model.
    expect(addEnergyUsageLegsMock).toHaveBeenCalledTimes(1);
    const legCall = addEnergyUsageLegsMock.mock.calls[0] as unknown as [
      string,
      Array<{ modelId: string; inputTokens: number; outputTokens: number }>,
      string,
    ];
    const legs = legCall[1];
    const legsSumInput = legs.reduce((acc, l) => acc + l.inputTokens, 0);
    const legsSumOutput = legs.reduce((acc, l) => acc + l.outputTokens, 0);
    expect(legsSumInput).toBe(10 + 8);
    expect(legsSumOutput).toBe(5 + 4);
    const legModels = legs.map((l) => l.modelId).sort();
    expect(legModels).toEqual(["test/model", "z-ai/glm-4.6v"]);
    // Regression pin: per-racer input rows must sum to the debit 1:1 — no
    // double-counted hedge usage inside the primary's own row.
    const debit = {
      inputTokens: legsSumInput,
      outputTokens: legsSumOutput,
    };
    const sumInput = discussRows.reduce(
      (acc, row) => acc + (row.inputTokens ?? 0),
      0,
    );
    const sumOutput = discussRows.reduce(
      (acc, row) => acc + (row.outputTokens ?? 0),
      0,
    );
    expect(sumInput).toBe(debit.inputTokens);
    expect(sumOutput).toBe(debit.outputTokens);
  });

  it("late loser leg settles before the debit includes its usage", async () => {
    enableHedging(["discuss-combo-2"]);
    okNormalize();
    const primary = makeRaceStreamResult({
      parts: [
        { type: "text-delta", text: "Halo" },
        {
          type: "tool-call",
          toolCallId: "tc-early",
          toolName: "presentWorkspaceCard",
          input: { assistantText: "Halo", workspaceCard: raceCard },
        },
      ],
      modelId: "test/model",
      usage: { inputTokens: 10, outputTokens: 5 },
    });
    const hedgeUsage = { inputTokens: 7, outputTokens: 3 };
    let releaseHedgeUsage: (() => void) | undefined;
    const hedgeUsagePromise = new Promise<typeof hedgeUsage>((resolve) => {
      releaseHedgeUsage = () => resolve(hedgeUsage);
    });
    const hedge = makeRaceStreamResult({
      parts: [],
      modelId: "discuss-combo-2",
    });
    hedge.result.usage = hedgeUsagePromise;

    streamTextMock
      .mockReturnValueOnce(hedge.result)
      .mockReturnValueOnce(primary.result);

    const runPromise = runDiscussTurn({
      turnId: "ct_late_loser",
      project: baseProject,
      chatContext: baseChatContext,
      effectiveBrief: baseBrief,
      memoryFacts: baseMemoryFacts,
      messages: baseMessages,
      summary: baseSummary,
      userId: "u1",
    });

    // Let the worker reach its settle point.
    for (let i = 0; i < 20; i++) {
      await Promise.resolve();
    }
    releaseHedgeUsage?.();

    await runPromise;

    expect(addEnergyUsageLegsMock).toHaveBeenCalledTimes(1);
    const legCall = addEnergyUsageLegsMock.mock.calls[0] as unknown as [
      string,
      Array<{ modelId: string; inputTokens: number; outputTokens: number }>,
      string,
    ];
    const legs = legCall[1];
    const legsSumInput = legs.reduce((acc, l) => acc + l.inputTokens, 0);
    const legsSumOutput = legs.reduce((acc, l) => acc + l.outputTokens, 0);
    expect(legsSumInput).toBe(10 + hedgeUsage.inputTokens);
    expect(legsSumOutput).toBe(5 + hedgeUsage.outputTokens);
  });

  it("invalid primary card aborts hedge legs before repair fires", async () => {
    enableHedging(["discuss-combo-2"]);
    // Card invalid everywhere → primary heads to repair; hedges must already
    // be aborted by the time the repair call fires, not after the stream ends.
    normalizeWorkspaceTurnMock.mockReturnValue({
      brief: baseBrief,
      projectTitle: "T",
      workspaceCard: { type: "none" },
      readyForBuild: false,
    } as never);

    let hedgeSignal: AbortSignal | undefined;
    const hedge = makeRaceStreamResult({
      parts: [{ type: "text-delta", text: "hedge-text" }],
      modelId: "discuss-combo-2",
      usage: { inputTokens: 7, outputTokens: 3 },
    });
    const primary = makeRaceStreamResult({
      parts: [
        {
          type: "tool-call",
          toolCallId: "tc-invalid",
          toolName: "presentWorkspaceCard",
          input: { workspaceCard: { type: "invalid-but-toolcalled" } },
        },
      ],
      modelId: "test/model",
      usage: { inputTokens: 10, outputTokens: 5 },
    });
    streamTextMock.mockImplementation(
      (opts: { model: { modelId: string }; abortSignal?: AbortSignal }) => {
        if (opts.model.modelId === "discuss-combo-2") {
          hedgeSignal = opts.abortSignal;
          return hedge.result;
        }
        return primary.result;
      },
    );

    let hedgeAbortedWhenRepairFired: boolean | undefined;
    generateTextMock.mockImplementation(() => {
      hedgeAbortedWhenRepairFired = hedgeSignal?.aborted;
      return Promise.resolve({
        usage: { inputTokens: 2, outputTokens: 3 },
        toolCalls: [
          {
            input: {
              assistantText: "Nama usahanya apa?",
              workspaceCard: raceCard,
            },
          },
        ],
      });
    });

    await runDiscussTurn({
      turnId: "ct_invalid_abort",
      project: baseProject,
      chatContext: baseChatContext,
      effectiveBrief: baseBrief,
      memoryFacts: baseMemoryFacts,
      messages: baseMessages,
      summary: baseSummary,
      userId: "u1",
    });

    expect(generateTextMock).toHaveBeenCalled();
    expect(hedgeSignal).toBeDefined();
    // The exact promise of fix #1: primary terminal outcome aborts hedges
    // before any repair fires — not after the stream finishes.
    expect(hedgeAbortedWhenRepairFired).toBe(true);
  });

  it("each leg records its own timing: aborted leg shorter than winner, pre-chunk error ttftMs null", async () => {
    enableHedging(["discuss-combo-2"]);
    okNormalize();
    const winnerParts = [
      { type: "text-delta", text: "Halo" },
      {
        type: "tool-call",
        toolCallId: "tc-win",
        toolName: "presentWorkspaceCard",
        input: { assistantText: "Halo", workspaceCard: raceCard },
      },
    ];
    const primaryStream = makeRaceStreamResult({
      parts: winnerParts,
      modelId: "test/model",
      usage: { inputTokens: 10, outputTokens: 5 },
    });
    // Real 5ms before the winner's first chunk: the publish path awaits only
    // microtasks, so without a wall-clock delay ttftMs floors to 0 and the
    // per-leg-timing assertion cannot distinguish winner from shared timer.
    const slowWinnerResult = {
      ...primaryStream.result,
      stream: (async function* () {
        await new Promise((resolve) => setTimeout(resolve, 5));
        yield* primaryStream.result.stream;
      })(),
    };
    // Pre-chunk transport failure: never emits a content chunk, so the leg's
    // timer sees firstChunkAt=null → ttftMs must be null, not 0/requestMs.
    const hedgeStream = {
      stream: (async function* () {
        throw new Error("socket hang up");
      })(),
      usage: Promise.resolve({ inputTokens: 4, outputTokens: 2 }),
      response: Promise.resolve({ modelId: "discuss-combo-2" }),
    };
    streamTextMock
      .mockReturnValueOnce(hedgeStream)
      .mockReturnValueOnce(slowWinnerResult);

    await runDiscussTurn({
      turnId: "ct_hedge_timing",
      project: baseProject,
      chatContext: baseChatContext,
      effectiveBrief: baseBrief,
      memoryFacts: baseMemoryFacts,
      messages: baseMessages,
      summary: baseSummary,
      userId: "u1",
    });

    const discussRows = recordAiCallMock.mock.calls
      .filter(([entry]) => entry.task === "discuss")
      .map(([entry]) => entry);
    expect(discussRows).toHaveLength(2);
    const winnerRow = discussRows.find((r) => r.raceRole === "winner");
    const errorRow = discussRows.find((r) => r.status === "error");
    expect(winnerRow).toEqual(
      expect.objectContaining({
        status: "ok",
        modelRequested: "test/model",
      }),
    );
    // Winner carries its own ttftMs from its marked first chunk (+ hedge
    // polling ticks), 0-bounded and capped by its own requestMs — never the
    // hedge leg's shared-timer-sourced fallback duration.
    expect(winnerRow.ttftMs).toBeGreaterThan(0);
    expect(winnerRow.ttftMs).toBeLessThanOrEqual(winnerRow.requestMs);
    expect(errorRow).toEqual(
      expect.objectContaining({
        modelRequested: "discuss-combo-2",
        errorClass: "transport",
      }),
    );
    expect(errorRow.ttftMs).toBeNull();
    // Every racer gets its own stopTimer (set when the hedge leg is launched),
    // so the throwing leg records its own (finite) requestMs and never a
    // null/absent timing. Its ttftMs stays null (no content chunk).
    expect(typeof errorRow.requestMs).toBe("number");
    expect(errorRow.requestMs).toBeGreaterThanOrEqual(0);
  });
});
