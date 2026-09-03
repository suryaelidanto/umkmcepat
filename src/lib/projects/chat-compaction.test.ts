import { describe, expect, it, vi } from "vitest";

const { generateObjectMock } = vi.hoisted(() => ({
  generateObjectMock: vi.fn(),
}));

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return { ...actual, generateObject: generateObjectMock };
});

vi.mock("@/lib/ai/ai", () => ({
  getAiModel: vi.fn(() => ({})),
  getAiTelemetry: vi.fn(() => ({})),
}));

vi.mock("@/lib/ai/ai-call-record", () => ({
  classifyAiError: vi.fn(() => "transport"),
  recordAiCall: vi.fn(),
  startAiCallTimer: vi.fn(() => {
    const stop = () => ({ requestMs: 0, ttftMs: 0 });
    stop.firstChunk = vi.fn();
    return stop;
  }),
}));

vi.mock("@/lib/ai/ai-models", () => ({
  getModerationModel: vi.fn(() => "moderation-model"),
}));

vi.mock("@/lib/ai/ai-timeouts", () => ({
  getAiTimeoutMs: vi.fn(() => 1_000),
}));

import {
  CHAT_COMPACTION_RETAIN_TOKENS,
  CHAT_COMPACTION_TRIGGER_TOKENS,
  createFallbackProjectChatCompaction,
  getProjectChatCompactionWindow,
  maybeCompactProjectChat,
  shouldCompactProjectChat,
} from "./chat-compaction";
import {
  createEmptyChatSummary,
  createEmptyMemoryFacts,
  estimateUIMessageTokens,
  parseProjectChatSummary,
  type ProjectChatSummary,
} from "./chat-memory";

describe("project chat compaction", () => {
  it("does not compact a session under the token trigger", () => {
    const messages = Array.from({ length: 40 }, (_, index) => ({
      id: `m${index}`,
      role: "user" as const,
      parts: [{ type: "text" as const, text: `pesan ${index}` }],
    }));

    expect(shouldCompactProjectChat({ messages })).toBe(false);
  });

  it("compacts once the session passes the token trigger", () => {
    const bigMessage = "x".repeat(20_000);
    const messages = Array.from({ length: 80 }, (_, index) => ({
      id: `m${index}`,
      role: "user" as const,
      parts: [{ type: "text" as const, text: bigMessage }],
    }));

    expect(estimateUIMessageTokens(messages)).toBeGreaterThan(
      CHAT_COMPACTION_TRIGGER_TOKENS,
    );
    expect(shouldCompactProjectChat({ messages })).toBe(true);
  });

  it("restarts from retained messages when the old compaction marker was evicted", () => {
    const bigMessage = "x".repeat(8_000);
    const messages = Array.from({ length: 300 }, (_, index) => ({
      id: `retained-${index}`,
      role: "user" as const,
      parts: [{ type: "text" as const, text: bigMessage }],
    }));
    const summary: ProjectChatSummary = {
      ...createEmptyChatSummary(),
      compactedMessageCount: 288,
      compactedThroughMessageId: "evicted-message",
    };

    const window = getProjectChatCompactionWindow({ messages, summary });

    expect(window).not.toBeNull();
    expect(window?.start).toBe(0);
    expect(window?.messages[0]?.id).toBe("retained-0");
    expect(messages.length - (window?.end ?? 0)).toBeLessThan(messages.length);
    const retainedTokens = messages
      .slice(window?.end ?? 0)
      .reduce(
        (total, message) =>
          total + Math.ceil(JSON.stringify(message.parts).length / 4),
        0,
      );
    expect(retainedTokens).toBeLessThanOrEqual(
      CHAT_COMPACTION_RETAIN_TOKENS + 2_000,
    );
  });

  it("preserves owner statements in fallback memory when AI compaction is unavailable", () => {
    const result = createFallbackProjectChatCompaction({
      compactedMessageCount: 16,
      memoryFacts: createEmptyMemoryFacts(),
      messages: [
        {
          id: "owner-1",
          role: "user",
          parts: [{ type: "text", text: "Nama usaha Kedai Pagi" }],
        },
        {
          id: "assistant-1",
          role: "assistant",
          parts: [{ type: "text", text: "Saran gaya minimal" }],
        },
      ],
      summary: parseProjectChatSummary(null),
    });

    expect(result.compactedMessageCount).toBe(16);
    expect(result.memoryFacts.ownerNotes).toEqual(["Nama usaha Kedai Pagi"]);
    expect(result.usage).toEqual({ inputTokens: 0, outputTokens: 0 });
  });

  it("keeps the newest owner statements when the memory note limit is full", () => {
    const result = createFallbackProjectChatCompaction({
      compactedMessageCount: 16,
      memoryFacts: {
        ...createEmptyMemoryFacts(),
        ownerNotes: Array.from({ length: 24 }, (_, index) => `Lama ${index}`),
      },
      messages: [
        {
          id: "new-owner",
          role: "user",
          parts: [{ type: "text", text: "Pernyataan terbaru pemilik" }],
        },
      ],
      summary: parseProjectChatSummary(null),
    });

    expect(result.memoryFacts.ownerNotes).toContain(
      "Pernyataan terbaru pemilik",
    );
    expect(result.memoryFacts.ownerNotes).not.toContain("Lama 0");
  });

  it("advances with owner memory when the compaction model fails", async () => {
    generateObjectMock.mockRejectedValueOnce(new Error("provider unavailable"));
    const bigMessage = "x".repeat(20_000);
    const messages = Array.from({ length: 80 }, (_, index) => ({
      id: `message-${index}`,
      role: "user" as const,
      parts: [{ type: "text" as const, text: `${bigMessage} ${index}` }],
    }));

    const result = await maybeCompactProjectChat({
      memoryFacts: createEmptyMemoryFacts(),
      messages,
      summary: parseProjectChatSummary(null),
    });

    expect(result).not.toBeNull();
    expect(result?.compactedMessageCount).toBeGreaterThan(0);
    expect(result?.memoryFacts.ownerNotes.length).toBeGreaterThan(0);
    expect(result?.usage).toEqual({ inputTokens: 0, outputTokens: 0 });
  });
});
