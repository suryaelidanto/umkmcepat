import { afterEach, describe, expect, it, vi } from "vitest";

const {
  streamTextMock,
  convertToModelMessagesMock,
  generateTextMock,
  prismaExecuteRawMock,
  finalizeDiscussTurnMock,
  publishProgressMock,
  chargeEnergyForAiUsageMock,
  enqueueAttemptJobMock,
  writeAiRequestLogMock,
  maybeCompactProjectChatMock,
  normalizeWorkspaceTurnMock,
  recordAiCallMock,
  getSettingSyncMock,
  primeSettingCacheMock,
  prepareBuildHandoffMock,
  moderateProjectRequestMock,
  chargeModerationEnergyMock,
  readTempImageMock,
  claimTempImageMock,
  deleteTempImageMock,
  uploadProjectAssetMock,
  filterOwnedBusinessAssetIdsMock,
  listProjectBusinessImagesForDiscussionMock,
  readProjectAssetByIdMock,
} = vi.hoisted(() => ({
  streamTextMock: vi.fn(),
  convertToModelMessagesMock: vi.fn<
    (messages: unknown[]) => Promise<unknown[]>
  >(async () => []),
  generateTextMock: vi.fn(),
  prismaExecuteRawMock: vi.fn(),
  finalizeDiscussTurnMock: vi.fn(async () => undefined),
  publishProgressMock: vi.fn(),
  chargeEnergyForAiUsageMock: vi.fn(async () => null),
  enqueueAttemptJobMock: vi.fn(async () => undefined),
  writeAiRequestLogMock: vi.fn(async () => undefined),
  maybeCompactProjectChatMock: vi.fn(async () => null),
  recordAiCallMock: vi.fn(),
  getSettingSyncMock: vi.fn((key: string, fallback: unknown) => {
    return fallback;
  }),
  primeSettingCacheMock: vi.fn(async () => undefined),
  prepareBuildHandoffMock: vi.fn(),
  chargeModerationEnergyMock: vi.fn(async () => undefined),
  moderateProjectRequestMock: vi.fn<
    (
      prompt: string,
      images?: unknown[],
      timeoutMs?: number,
      correlation?: unknown,
    ) => Promise<{
      allowed: boolean;
      message?: string;
      modelId?: string;
      usage?: { inputTokens: number; outputTokens: number };
    }>
  >(async () => ({
    allowed: true,
    modelId: "mod-model",
    usage: { inputTokens: 0, outputTokens: 0 },
  })),
  readTempImageMock: vi.fn(),
  claimTempImageMock: vi.fn(),
  deleteTempImageMock: vi.fn(),
  uploadProjectAssetMock: vi.fn(),
  filterOwnedBusinessAssetIdsMock: vi.fn<
    (
      assetIds: string[],
      projectId?: string,
      userId?: string,
    ) => Promise<string[]>
  >(async () => []),
  listProjectBusinessImagesForDiscussionMock: vi.fn<
    (
      projectId: string,
      userId: string,
    ) => Promise<Array<{ contentType: string; id: string }>>
  >(async () => []),
  readProjectAssetByIdMock: vi.fn(),
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

vi.mock("@/lib/ai/ai", () => ({
  getAiModel: vi.fn((name?: string) => ({ modelId: name ?? "test-model" })),
  getAiTelemetry: vi.fn(() => ({ isEnabled: false })),
  getNoReasoningCallOptions: vi.fn(() => ({ reasoning: "none" })),
}));

vi.mock("@/lib/ai/ai-models", () => ({
  DEFAULT_AI_MODEL: "test/model",
  getDefaultAiModel: vi.fn(() => "test/model"),
  getDiscussModel: vi.fn(() => "test/model"),
  getModerationModel: vi.fn(() => "test/model"),
  getGenerationModel: vi.fn(() => "test/model"),
  getVisionModel: vi.fn(() => "test/model"),
}));

vi.mock("@/lib/config/app-settings", () => ({
  getSettingSync: getSettingSyncMock,
  primeSettingCache: primeSettingCacheMock,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { $executeRaw: prismaExecuteRawMock },
}));

vi.mock("@/lib/payment/user-credits", () => ({
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

vi.mock("@/lib/ai/ai-request-log", () => ({
  writeAiRequestLog: writeAiRequestLogMock,
}));

vi.mock("@/lib/ai/ai-call-record", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai/ai-call-record")>()),
  recordAiCall: recordAiCallMock,
}));

vi.mock("@/lib/projects/discuss-turn", () => ({
  finalizeDiscussTurn: finalizeDiscussTurnMock,
  claimDiscussTurn: vi.fn(async () => ({ claimed: true, turnId: "ct_test" })),
}));

vi.mock("@/lib/projects/attempt-queue", () => ({
  enqueueAttemptJob: enqueueAttemptJobMock,
}));

vi.mock("@/lib/projects/build-handoffs", () => ({
  loadActiveHandoff: vi.fn(async () => null),
}));

vi.mock("@/lib/projects/build-planner", () => ({
  prepareBuildHandoff: prepareBuildHandoffMock,
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

vi.mock("@/lib/ai/ai-moderation", () => ({
  chargeModerationEnergy: chargeModerationEnergyMock,
  getModerationTimeoutMs: () => 2500,
  moderateProjectRequest: moderateProjectRequestMock,
}));

vi.mock("@/lib/storage/uploads/temp-image-storage", () => ({
  readTempImage: readTempImageMock,
  claimTempImage: claimTempImageMock,
  deleteTempImage: deleteTempImageMock,
}));

vi.mock("@/lib/projects/project-assets", () => ({
  filterOwnedBusinessAssetIds: filterOwnedBusinessAssetIdsMock,
  listProjectBusinessImagesForDiscussion:
    listProjectBusinessImagesForDiscussionMock,
}));

vi.mock("@/lib/projects/project-asset-upload", () => ({
  readProjectAssetById: readProjectAssetByIdMock,
  uploadProjectAsset: uploadProjectAssetMock,
}));

vi.mock("@/lib/projects/brief-rich-fields", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/projects/brief-rich-fields")
  >()),
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
  generationEngine: "contract-v1",
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
      expect.objectContaining({
        userId: "u1",
        projectId: "p1",
        reason: "discuss:step",
      }),
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

  it("keeps a tool-only post-build card instead of dropping it as none", async () => {
    normalizeWorkspaceTurnMock.mockReturnValue({
      brief: baseBrief,
      projectTitle: "T",
      workspaceCard: {
        type: "question",
        question: {
          id: "refinement",
          question: "Bagian mana yang ingin kamu perbaiki?",
          answerMode: "text",
          options: [],
        },
      },
      readyForBuild: false,
    } as never);
    streamTextMock.mockReturnValueOnce(
      makeStreamResult([
        {
          type: "tool-call",
          toolCallId: "tc-built-tool-only",
          toolName: "presentWorkspaceCard",
          input: { workspaceCard: { type: "question" } },
        },
      ]),
    );

    await runDiscussTurn({
      turnId: "ct_built_tool_only",
      project: { ...baseProject, status: "ready" },
      chatContext: baseChatContext,
      effectiveBrief: baseBrief,
      memoryFacts: baseMemoryFacts,
      messages: baseMessages,
      summary: baseSummary,
      userId: "u1",
      modelOverride: "test-model" as never,
    });

    expect(publishProgressMock).toHaveBeenCalledWith(
      "ct_built_tool_only",
      expect.objectContaining({
        type: "tool-output-available",
        output: expect.objectContaining({
          workspaceCard: expect.objectContaining({ type: "question" }),
        }),
      }),
    );
    expect(finalizeDiscussTurnMock).toHaveBeenCalledWith(
      expect.objectContaining({
        turnId: "ct_built_tool_only",
        status: "succeeded",
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
    // Deltas are published directly as they arrive from the stream.
    expect(textDeltas.join("")).toBe(fullText);
    expect(getSettingSyncMock).not.toHaveBeenCalledWith(
      "discuss.partial_tool_streaming",
      expect.anything(),
    );
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

  it("applies the contract gate after card repair before persisting a recommendation", async () => {
    const incompleteBrief = {
      businessName: "Fresh Clean Laundry",
      businessType: "jasa_lokal",
      productOrService: [{ name: "Jasa laundry", isPrimary: true }],
      targetCustomer: "Keluarga dan Anak Kos",
      contact: {
        channel: "whatsapp",
        value: "08123456789",
      },
      contactOrCta: "Chat WhatsApp",
      stylePreference: "Minimalis & Praktis",
      address: "Jl. Kenanga No. 12",
      usp: ["Antar jemput gratis"],
    };
    normalizeWorkspaceTurnMock.mockReturnValueOnce({
      brief: incompleteBrief,
      projectTitle: "Website Fresh Clean Laundry",
      workspaceCard: {
        type: "build_recommendation",
        title: "Website siap dibuat",
        summary: ["Fresh Clean Laundry"],
      },
      readyForBuild: true,
    } as never);
    streamTextMock.mockReturnValueOnce(makeStreamResult([]));
    generateTextMock.mockResolvedValueOnce({
      response: { modelId: "test-model" },
      text: "",
      toolCalls: [
        {
          input: {
            assistantText: "Data lengkap",
            workspaceCard: {
              type: "build_recommendation",
              title: "Website siap dibuat",
              summary: ["Fresh Clean Laundry"],
            },
          },
          toolCallId: "repair-card",
          toolName: "presentWorkspaceCard",
        },
      ],
      usage: { inputTokens: 11, outputTokens: 4 },
    } as never);

    await runDiscussTurn({
      turnId: "ct_repair_tiered_intercept",
      project: { ...baseProject, generationEngine: "contract-v1" },
      chatContext: baseChatContext,
      effectiveBrief: baseBrief,
      memoryFacts: baseMemoryFacts,
      messages: baseMessages,
      summary: baseSummary,
      userId: "u1",
      modelOverride: "test-model" as never,
    });

    const cardEvent = publishProgressMock.mock.calls
      .filter(
        ([publishedTurnId, event]) =>
          publishedTurnId === "ct_repair_tiered_intercept" &&
          event.type === "tool-output-available",
      )
      .map(([, event]) => event.output.workspaceCard)[0] as {
      type: "question";
      question: { id: string };
    };
    expect(cardEvent).toMatchObject({
      type: "question",
      question: { id: "price_range" },
    });
    expect(prepareBuildHandoffMock).not.toHaveBeenCalled();
  });

  it("contract gate demotes an explicit build request while a required offer is missing", async () => {
    normalizeWorkspaceTurnMock.mockReturnValue({
      brief: {
        businessName: "HP Surya",
        businessType: "retail",
        offer: "",
        productOrService: null,
        targetCustomer: "Pembeli HP terjangkau",
        contactOrCta: "Lihat stok & harga",
        contact: null,
        stylePreference: "Bersih dan modern",
        fieldState: {
          address: "declined",
          hours: "declined",
          visuals: "declined",
        },
      },
      projectTitle: "HP Surya",
      workspaceCard: {
        type: "build_recommendation",
        title: "Rekomendasi build siap",
        summary: ["HP bekas semua merek"],
      },
      readyForBuild: true,
    } as never);
    streamTextMock.mockReturnValueOnce(
      makeStreamResult([
        { type: "text-delta", text: "Siap dibangun" },
        {
          type: "tool-call",
          toolCallId: "tc-contract-blocked",
          toolName: "presentWorkspaceCard",
          input: {
            assistantText: "Siap dibangun",
            workspaceCard: { type: "build_recommendation" },
          },
        },
      ]),
    );

    await runDiscussTurn({
      turnId: "ct_contract_blocked",
      project: { ...baseProject, generationEngine: "contract-v1" },
      chatContext: baseChatContext,
      effectiveBrief: baseBrief,
      memoryFacts: baseMemoryFacts,
      messages: [
        ...baseMessages,
        {
          id: "m-explicit-build",
          role: "user",
          parts: [{ type: "text", text: "langsung buat sekarang" }],
        },
      ],
      summary: baseSummary,
      userId: "u1",
      modelOverride: "test-model" as never,
    });

    const cardEvent = publishProgressMock.mock.calls
      .filter(
        ([publishedTurnId, event]) =>
          publishedTurnId === "ct_contract_blocked" &&
          event.type === "tool-output-available",
      )
      .map(([, event]) => event.output.workspaceCard)[0] as {
      type: "question";
      question: { id: string };
    };
    expect(cardEvent).toMatchObject({
      type: "question",
      question: { id: "services" },
    });
    expect(prepareBuildHandoffMock).not.toHaveBeenCalled();
  });

  it("intercepts premature build recommendation to Tier 2 enrichment when user did not explicitly command build", async () => {
    const brief = {
      businessName: "Bengkel Ayah",
      businessType: "jasa_lokal",
      productOrService: [{ name: "Servis Motor", isPrimary: true }],
      targetCustomer: "Pengendara motor",
      contact: {
        channel: "whatsapp",
        value: "08123456789",
      },
      contactOrCta: "Pesan via WhatsApp",
      stylePreference: "Bersih dan modern",
      address: "Jl. Kenangan No 4 Jakarta Utara",
    };
    normalizeWorkspaceTurnMock.mockReturnValueOnce({
      brief,
      projectTitle: "Bengkel Ayah",
      workspaceCard: {
        type: "build_recommendation",
        title: "Rekomendasi build siap",
        summary: ["Bengkel Ayah"],
      },
      readyForBuild: true,
    } as never);
    streamTextMock.mockReturnValueOnce(
      makeStreamResult([
        { type: "text-delta", text: "Informasi sudah cukup" },
        {
          type: "tool-call",
          toolCallId: "tc-tiered-intercept",
          toolName: "presentWorkspaceCard",
          input: {
            assistantText: "Informasi sudah cukup",
            workspaceCard: { type: "build_recommendation" },
          },
        },
      ]),
    );

    await runDiscussTurn({
      turnId: "ct_tiered_intercept",
      project: { ...baseProject, generationEngine: "contract-v1" },
      chatContext: baseChatContext,
      effectiveBrief: baseBrief,
      memoryFacts: baseMemoryFacts,
      messages: [
        {
          id: "m1",
          role: "user",
          parts: [{ type: "text", text: "Jl. Kenangan No 4 Jakarta Utara" }],
        },
      ],
      summary: baseSummary,
      userId: "u1",
      modelOverride: "test-model" as never,
    });

    const cardEvent = publishProgressMock.mock.calls
      .filter(
        ([publishedTurnId, event]) =>
          publishedTurnId === "ct_tiered_intercept" &&
          event.type === "tool-output-available",
      )
      .map(([, event]) => event.output.workspaceCard)[0] as {
      type: "question";
      question: { id: string };
    };
    expect(cardEvent.type).toBe("question");
    expect(cardEvent.question.id).toBe("price_range");
    expect(prepareBuildHandoffMock).not.toHaveBeenCalled();
  });

  it("contract gate never exposes a recommendation when handoff preparation fails", async () => {
    const brief = {
      businessName: "HP Surya",
      businessType: "retail",
      productOrService: [{ name: "HP bekas", isPrimary: true }],
      targetCustomer: "Pembeli HP terjangkau",
      contact: null,
      contactOrCta: "Lihat stok & harga",
      stylePreference: "Bersih dan modern",
      fieldState: {
        address: "declined",
        hours: "declined",
        visuals: "declined",
      },
    };
    normalizeWorkspaceTurnMock.mockReturnValue({
      brief,
      projectTitle: "HP Surya",
      workspaceCard: {
        type: "build_recommendation",
        title: "Rekomendasi build siap",
        summary: ["HP bekas"],
      },
      readyForBuild: true,
    } as never);
    prepareBuildHandoffMock.mockResolvedValue({
      state: "failed",
      reason: "contract validation failed",
    });
    streamTextMock.mockReturnValueOnce(
      makeStreamResult([
        { type: "text-delta", text: "Siap dibangun" },
        {
          type: "tool-call",
          toolCallId: "tc-contract-failed",
          toolName: "presentWorkspaceCard",
          input: {
            assistantText: "Siap dibangun",
            workspaceCard: { type: "build_recommendation" },
          },
        },
      ]),
    );

    await runDiscussTurn({
      turnId: "ct_contract_failed",
      project: { ...baseProject, generationEngine: "contract-v1" },
      chatContext: baseChatContext,
      effectiveBrief: baseBrief,
      memoryFacts: baseMemoryFacts,
      messages: baseMessages,
      summary: baseSummary,
      userId: "u1",
      modelOverride: "test-model" as never,
    });

    const cardEvent = publishProgressMock.mock.calls
      .filter(
        ([publishedTurnId, event]) =>
          publishedTurnId === "ct_contract_failed" &&
          event.type === "tool-output-available",
      )
      .map(([, event]) => event.output.workspaceCard)[0] as { type: string };
    expect(cardEvent.type).not.toBe("build_recommendation");
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
    expect(cardEvent.question.id).toBe("business.name");
    expect(writeAiRequestLogMock).toHaveBeenCalled();
  });

  it("handoff preparation runs and attaches proof when build recommendation is ready", async () => {
    prepareBuildHandoffMock.mockResolvedValue({
      state: "ready",
      contract: {
        schemaVersion: 1,
        identity: { businessName: "Kedai Kopi" },
        facts: [
          {
            id: "offer-1",
            kind: "offer",
            value: [{ name: "Kopi Susu", isPrimary: true }],
            provenance: { source: "owner" },
          },
        ],
      },
      plan: { schemaVersion: 1, pages: [{ id: "p1" }] },
      handoffId: "h-ready",
      reviewHash: "a".repeat(64),
      reviewItems: [],
    });
    normalizeWorkspaceTurnMock.mockReturnValue({
      brief: {
        businessName: "Kedai Kopi",
        businessType: "F&B",
        offer: "Kopi Susu",
        targetCustomer: "Mahasiswa",
        contactOrCta: "WhatsApp 08123456789",
        stylePreference: "Warm",
        confidence: 100,
        prompt: "Saya jual kopi",
        offers: [{ name: "Kopi Susu", isPrimary: true }],
        business: { name: "Kedai Kopi", type: "F&B" },
        audience: "Mahasiswa",
        primaryAction: { type: "whatsapp", value: "08123456789" },
        visualDirection: "Warm",
      } as never,
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
      handoffId?: string;
    };
    expect(cardEvent.type).toBe("build_recommendation");
    expect(cardEvent.handoffId).toBe("h-ready");
    expect(finalizeDiscussTurnMock).toHaveBeenCalledWith(
      expect.objectContaining({ turnId: "ct_gate_eager", status: "succeeded" }),
    );
  });
});

const TEMP_URL = (assetId: string) =>
  `/api/uploads/temp-images/${encodeURIComponent(assetId)}`;

function imageMessage(text: string): UIMessage[] {
  return [
    {
      id: "m_img",
      parts: [
        {
          filename: "gambar.jpg",
          mediaType: "image/jpeg",
          type: "file",
          url: TEMP_URL("tok_1"),
        },
        { text, type: "text" },
      ],
      role: "user",
    } as never as UIMessage,
  ];
}

describe("runDiscussTurn asset + moderation phase", () => {
  afterEach(() => {
    vi.clearAllMocks();
    filterOwnedBusinessAssetIdsMock.mockResolvedValue([]);
    listProjectBusinessImagesForDiscussionMock.mockResolvedValue([]);
  });

  function mockAllowedModeration() {
    moderateProjectRequestMock.mockResolvedValue({
      allowed: true,
      modelId: "vision-model",
      usage: { inputTokens: 10, outputTokens: 1 },
    });
  }

  function mockReadableTempImage() {
    readTempImageMock.mockResolvedValue({
      body: Buffer.from("image-bytes"),
      contentType: "image/jpeg",
    });
    deleteTempImageMock.mockResolvedValue(undefined);
    uploadProjectAssetMock.mockResolvedValue({ id: "asset_saved" });
  }

  function mockSuccessfulCardTurn() {
    normalizeWorkspaceTurnMock.mockReturnValue({
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
    streamTextMock.mockReturnValue(
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
  }

  it("hydrates a home-uploaded project asset into the model context", async () => {
    mockSuccessfulCardTurn();
    listProjectBusinessImagesForDiscussionMock.mockResolvedValue([
      { contentType: "image/webp", id: "asset_from_home" },
    ]);
    readProjectAssetByIdMock.mockResolvedValue({
      body: Buffer.from("image-bytes"),
      contentType: "image/webp",
      projectId: "p1",
      userId: "u1",
    });
    const messages: UIMessage[] = [
      {
        id: "m_home",
        parts: [{ text: "buat website laundry", type: "text" }],
        role: "user",
      } as never,
    ];

    await runDiscussTurn({
      turnId: "ct_home_asset",
      project: baseProject,
      chatContext: { messages, systemContext: "" },
      effectiveBrief: baseBrief,
      memoryFacts: baseMemoryFacts,
      messages,
      summary: baseSummary,
      userId: "u1",
    });

    expect(listProjectBusinessImagesForDiscussionMock).toHaveBeenCalledWith(
      "p1",
      "u1",
    );
    expect(readProjectAssetByIdMock).toHaveBeenCalledWith("asset_from_home", {
      projectId: "p1",
      userId: "u1",
    });
    const modelCall = convertToModelMessagesMock.mock.calls[0] as
      [unknown[]] | undefined;
    const modelMessages = modelCall?.[0] as UIMessage[] | undefined;
    const hydratedPart = modelMessages?.[0]?.parts.find(
      (part) => part.type === "file",
    );
    expect(hydratedPart).toMatchObject({
      mediaType: "image/webp",
      type: "file",
      url: "data:image/webp;base64,aW1hZ2UtYnl0ZXM=",
    });
  });

  it("moderates + saves attached images before the model call and persists permanent media URLs", async () => {
    mockSuccessfulCardTurn();
    mockAllowedModeration();
    mockReadableTempImage();
    filterOwnedBusinessAssetIdsMock.mockResolvedValue(["asset_saved"]);
    const messages = imageMessage("1 gambar diunggah.");

    await runDiscussTurn({
      turnId: "ct_img_ok",
      project: baseProject,
      chatContext: { messages, systemContext: "" },
      effectiveBrief: baseBrief,
      memoryFacts: baseMemoryFacts,
      messages,
      summary: baseSummary,
      userId: "u1",
    });

    const order = moderateProjectRequestMock.mock.invocationCallOrder[0]!;
    const saveOrder = uploadProjectAssetMock.mock.invocationCallOrder[0]!;
    const modelOrder = streamTextMock.mock.invocationCallOrder[0]!;
    expect(order).toBeLessThan(saveOrder);
    expect(saveOrder).toBeLessThan(modelOrder);
    expect(moderateProjectRequestMock).toHaveBeenCalledTimes(1);
    expect(moderateProjectRequestMock).toHaveBeenCalledWith(
      "",
      [expect.objectContaining({ mediaType: "image/jpeg" })],
      expect.any(Number),
      { projectId: "p1", turnId: "ct_img_ok" },
    );
    expect(uploadProjectAssetMock).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: "business-image" }),
    );
    expect(deleteTempImageMock).toHaveBeenCalledWith("u1", "tok_1");
    expect(filterOwnedBusinessAssetIdsMock).toHaveBeenCalledWith(
      ["asset_saved"],
      "p1",
      "u1",
    );
    const persistedValues = prismaExecuteRawMock.mock.calls
      .flatMap((call) => call.slice(1))
      .join("\n");
    expect(persistedValues).toContain("/api/media/asset_saved");
    expect(persistedValues).not.toContain("temp-images");
    expect(finalizeDiscussTurnMock).toHaveBeenCalledWith(
      expect.objectContaining({ turnId: "ct_img_ok", status: "succeeded" }),
    );
  });

  it("persists successful image rewrites when a later image promotion fails", async () => {
    prismaExecuteRawMock.mockResolvedValue(1);
    mockAllowedModeration();
    mockReadableTempImage();
    uploadProjectAssetMock
      .mockResolvedValueOnce({ id: "asset_a" })
      .mockRejectedValueOnce(new Error("asset store unavailable"));
    const messages: UIMessage[] = [
      {
        id: "m_img_partial",
        parts: [
          {
            filename: "gambar-a.jpg",
            mediaType: "image/jpeg",
            type: "file",
            url: TEMP_URL("tok_a"),
          },
          {
            filename: "gambar-b.jpg",
            mediaType: "image/jpeg",
            type: "file",
            url: TEMP_URL("tok_b"),
          },
        ],
        role: "user",
      } as never as UIMessage,
    ];

    await runDiscussTurn({
      turnId: "ct_img_partial",
      project: baseProject,
      chatContext: { messages, systemContext: "" },
      effectiveBrief: baseBrief,
      memoryFacts: baseMemoryFacts,
      messages,
      summary: baseSummary,
      userId: "u1",
    });

    const persistedValues = prismaExecuteRawMock.mock.calls
      .flatMap((call) => call.slice(1))
      .join("\n");
    expect(persistedValues).toContain("/api/media/asset_a");
    expect(persistedValues).toContain(TEMP_URL("tok_b"));
    expect(finalizeDiscussTurnMock).toHaveBeenCalledWith(
      expect.objectContaining({
        errorMessage: "Gambar belum berhasil disimpan. Coba lagi sebentar.",
        status: "failed",
        turnId: "ct_img_partial",
      }),
    );
    expect(streamTextMock).not.toHaveBeenCalled();
  });

  it("persists promoted media before a later text moderation failure", async () => {
    prismaExecuteRawMock.mockResolvedValue(1);
    mockReadableTempImage();
    moderateProjectRequestMock.mockImplementation(
      async (_prompt: string, images?: unknown[]) => {
        if (images?.length) {
          return {
            allowed: true,
            modelId: "vision-model",
            usage: { inputTokens: 10, outputTokens: 1 },
          };
        }
        throw new Error("moderation unavailable");
      },
    );
    const messages = imageMessage("halo");

    await runDiscussTurn({
      turnId: "ct_img_text_moderation_down",
      project: baseProject,
      chatContext: { messages, systemContext: "" },
      effectiveBrief: baseBrief,
      memoryFacts: baseMemoryFacts,
      messages,
      summary: baseSummary,
      userId: "u1",
    });

    const persistedValues = prismaExecuteRawMock.mock.calls
      .flatMap((call) => call.slice(1))
      .join("\n");
    expect(persistedValues).toContain("/api/media/asset_saved");
    expect(persistedValues).toContain("business-image");
    expect(persistedValues).not.toContain("temp-images");
    expect(finalizeDiscussTurnMock).toHaveBeenCalledWith(
      expect.objectContaining({
        errorMessage:
          "Pemeriksaan keamanan belum berhasil. Coba lagi sebentar.",
        status: "failed",
        turnId: "ct_img_text_moderation_down",
      }),
    );
    expect(streamTextMock).not.toHaveBeenCalled();
  });

  it("keeps the temp source when rewritten chat persistence fails", async () => {
    prismaExecuteRawMock.mockRejectedValueOnce(
      new Error("database unavailable"),
    );
    mockAllowedModeration();
    mockReadableTempImage();
    const messages = imageMessage("1 gambar diunggah.");

    await runDiscussTurn({
      turnId: "ct_img_persist_down",
      project: baseProject,
      chatContext: { messages, systemContext: "" },
      effectiveBrief: baseBrief,
      memoryFacts: baseMemoryFacts,
      messages,
      summary: baseSummary,
      userId: "u1",
    });

    expect(deleteTempImageMock).not.toHaveBeenCalled();
  });

  it("fails the turn without calling the model when an attached image is blocked", async () => {
    mockSuccessfulCardTurn();
    moderateProjectRequestMock.mockResolvedValue({
      allowed: false,
      message: "Gambar tidak memenuhi syarat.",
      modelId: "vision-model",
      usage: { inputTokens: 10, outputTokens: 1 },
    });
    mockReadableTempImage();
    const messages = imageMessage("1 gambar diunggah.");

    await runDiscussTurn({
      turnId: "ct_img_blocked",
      project: baseProject,
      chatContext: { messages, systemContext: "" },
      effectiveBrief: baseBrief,
      memoryFacts: baseMemoryFacts,
      messages,
      summary: baseSummary,
      userId: "u1",
    });

    expect(finalizeDiscussTurnMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        errorMessage: "Gambar tidak memenuhi syarat.",
        turnId: "ct_img_blocked",
      }),
    );
    expect(publishProgressMock).toHaveBeenCalledWith(
      "ct_img_blocked",
      expect.objectContaining({
        errorText: "Gambar tidak memenuhi syarat.",
        type: "error",
      }),
    );
    expect(streamTextMock).not.toHaveBeenCalled();
    expect(deleteTempImageMock).not.toHaveBeenCalled();
    expect(uploadProjectAssetMock).not.toHaveBeenCalled();
    expect(prismaExecuteRawMock).not.toHaveBeenCalled();
  });

  it("fails the turn and keeps the temp upload when image moderation is unavailable", async () => {
    mockSuccessfulCardTurn();
    moderateProjectRequestMock.mockRejectedValue(new Error("provider down"));
    mockReadableTempImage();
    const messages = imageMessage("1 gambar diunggah.");

    await runDiscussTurn({
      turnId: "ct_img_down",
      project: baseProject,
      chatContext: { messages, systemContext: "" },
      effectiveBrief: baseBrief,
      memoryFacts: baseMemoryFacts,
      messages,
      summary: baseSummary,
      userId: "u1",
    });

    expect(finalizeDiscussTurnMock).toHaveBeenCalledWith(
      expect.objectContaining({
        errorMessage:
          "Pemeriksaan keamanan belum berhasil. Coba lagi sebentar.",
        status: "failed",
      }),
    );
    expect(streamTextMock).not.toHaveBeenCalled();
    expect(claimTempImageMock).not.toHaveBeenCalled();
  });

  it("fails the turn when non-boilerplate text is blocked by moderation", async () => {
    mockSuccessfulCardTurn();
    moderateProjectRequestMock.mockResolvedValue({
      allowed: false,
      message: "Maaf, AI tidak bisa membantu membuat website untuk topik ini.",
      modelId: "mod-model",
      usage: { inputTokens: 10, outputTokens: 1 },
    });

    await runDiscussTurn({
      turnId: "ct_text_blocked",
      project: baseProject,
      chatContext: baseChatContext,
      effectiveBrief: baseBrief,
      memoryFacts: baseMemoryFacts,
      messages: baseMessages,
      summary: baseSummary,
      userId: "u1",
    });

    expect(moderateProjectRequestMock).toHaveBeenCalledWith(
      "hai",
      [],
      undefined,
      { projectId: "p1", turnId: "ct_text_blocked" },
    );
    expect(finalizeDiscussTurnMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed", turnId: "ct_text_blocked" }),
    );
    expect(streamTextMock).not.toHaveBeenCalled();
    expect(prismaExecuteRawMock).not.toHaveBeenCalled();
  });

  it("skips text moderation for image-upload boilerplate answers with no attachments", async () => {
    mockSuccessfulCardTurn();
    mockAllowedModeration();
    const messages: UIMessage[] = [
      {
        id: "m_boiler",
        parts: [{ text: "1 gambar diunggah.", type: "text" }],
        role: "user",
      } as never as UIMessage,
    ];

    await runDiscussTurn({
      turnId: "ct_boiler",
      project: baseProject,
      chatContext: { messages, systemContext: "" },
      effectiveBrief: baseBrief,
      memoryFacts: baseMemoryFacts,
      messages,
      summary: baseSummary,
      userId: "u1",
    });

    expect(moderateProjectRequestMock).not.toHaveBeenCalled();
    expect(streamTextMock).toHaveBeenCalled();
    expect(finalizeDiscussTurnMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "succeeded", turnId: "ct_boiler" }),
    );
  });
});
