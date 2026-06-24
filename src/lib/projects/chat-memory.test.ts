import { describe, expect, it } from "vitest";

import {
  buildProjectChatContext,
  getProjectChatContext,
  getProjectChatPage,
  MAX_CONTEXT_MESSAGES,
  parseProjectChatMessages,
  parseProjectChatSummary,
  parseProjectMemoryFacts,
} from "./chat-memory";

describe("project chat memory", () => {
  it("keeps only valid UI messages", () => {
    expect(
      parseProjectChatMessages([
        null,
        { id: "m1", role: "user", parts: [{ type: "text", text: "Halo" }] },
        { id: "m2", role: "bad", parts: [] },
      ]),
    ).toEqual([
      { id: "m1", role: "user", parts: [{ type: "text", text: "Halo" }] },
    ]);
  });

  it("keeps a larger bounded stored history", () => {
    const messages = Array.from({ length: 205 }, (_, index) => ({
      id: `m${index}`,
      role: "user" as const,
      parts: [{ type: "text" as const, text: `${index}` }],
    }));

    const result = parseProjectChatMessages(messages);

    expect(result).toHaveLength(200);
    expect(result[0]?.id).toBe("m5");
  });

  it("uses a bounded recent context window", () => {
    const messages = Array.from(
      { length: MAX_CONTEXT_MESSAGES + 2 },
      (_, index) => ({
        id: `m${index}`,
        role: "user" as const,
        parts: [{ type: "text" as const, text: `${index}` }],
      }),
    );

    expect(getProjectChatContext(messages)).toHaveLength(MAX_CONTEXT_MESSAGES);
    expect(getProjectChatContext(messages)[0].id).toBe("m2");
  });

  it("builds a hidden summary context with recent messages only", () => {
    const messages = Array.from(
      { length: MAX_CONTEXT_MESSAGES + 2 },
      (_, index) => ({
        id: `m${index}`,
        role: "user" as const,
        parts: [{ type: "text" as const, text: `${index}` }],
      }),
    );

    const context = buildProjectChatContext({
      messages,
      summary: parseProjectChatSummary({
        compactedMessageCount: 10,
        text: "User memilih gaya premium.",
      }),
      memoryFacts: parseProjectMemoryFacts({
        decisions: ["CTA utama WhatsApp"],
        facts: ["Usaha sate"],
        preferences: ["Bahasa santai"],
      }),
    });

    expect(context.messages).toHaveLength(MAX_CONTEXT_MESSAGES);
    expect(context.messages[0]?.id).toBe("m2");
    expect(context.systemContext).toContain("User memilih gaya premium");
    expect(context.systemContext).toContain("CTA utama WhatsApp");
    expect(context.systemContext).toContain("Usaha sate");
  });

  it("parses invalid summary and facts safely", () => {
    expect(parseProjectChatSummary(null).text).toBe("");
    expect(parseProjectMemoryFacts({ facts: ["A", 1, "B"] }).facts).toEqual([
      "A",
      "B",
    ]);
  });

  it("returns paginated chat windows", () => {
    const messages = Array.from({ length: 55 }, (_, index) => ({
      id: `m${index}`,
      role: "user" as const,
      parts: [{ type: "text" as const, text: `${index}` }],
    }));

    const latest = getProjectChatPage(messages, null, 20);
    expect(latest.messages[0]?.id).toBe("m35");
    expect(latest.nextCursor).toBe(35);
    expect(latest.hasMore).toBe(true);

    const older = getProjectChatPage(messages, latest.nextCursor, 20);
    expect(older.messages[0]?.id).toBe("m15");
    expect(older.nextCursor).toBe(15);
  });
});
