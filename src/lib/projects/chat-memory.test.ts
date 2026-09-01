import { describe, expect, it } from "vitest";

import {
  buildProjectChatContext,
  dedupeUiMessages,
  getProjectChatContext,
  getProjectChatPage,
  MAX_CONTEXT_MESSAGES,
  parseProjectChatMessages,
  parseProjectChatSummary,
  parseProjectMemoryFacts,
  recordFieldAsk,
  recordFieldAnswer,
  recordFieldDecline,
  recordFieldEmpty,
  summarizeFieldState,
  buildFieldStateBlock,
  buildCompactDiscussionContext,
  resolveProjectChatState,
  type FieldStateMap,
} from "./chat-memory";

describe("project chat memory", () => {
  it("deduplicates messages and normalizes consecutive same-role messages (defense against strict Gemini validation)", () => {
    const messages = [
      {
        id: "m1",
        role: "user" as const,
        parts: [{ type: "text" as const, text: "Halo" }],
      },
      {
        id: "m1",
        role: "user" as const,
        parts: [{ type: "text" as const, text: "Halo" }],
      }, // exact dup id
      {
        id: "m2",
        role: "user" as const,
        parts: [{ type: "text" as const, text: "Bikinin web" }],
      }, // consecutive user role
      {
        id: "m3",
        role: "assistant" as const,
        parts: [{ type: "text" as const, text: "Siap!" }],
      },
      {
        id: "m4",
        role: "user" as const,
        parts: [{ type: "text" as const, text: "Ganti warna" }],
      },
      {
        id: "m5",
        role: "user" as const,
        parts: [{ type: "text" as const, text: "Warna biru ya" }],
      }, // consecutive user role
    ];

    const result = dedupeUiMessages(messages);

    expect(result).toHaveLength(3);
    expect(result[0].role).toBe("user");
    expect(result[0].parts).toEqual([
      { type: "text", text: "Halo" },
      { type: "text", text: "Bikinin web" },
    ]);
    expect(result[1].role).toBe("assistant");
    expect(result[1].parts).toEqual([{ type: "text", text: "Siap!" }]);
    expect(result[2].role).toBe("user");
    expect(result[2].parts).toEqual([
      { type: "text", text: "Ganti warna" },
      { type: "text", text: "Warna biru ya" },
    ]);
  });

  it("keeps only valid UI messages", () => {
    expect(
      parseProjectChatMessages([
        null,
        { id: "m1", role: "user", parts: [{ type: "text", text: "Halo" }] },
        { id: "m2", role: "bad", parts: [] },
        { id: "m3", role: "assistant", parts: [] },
      ]),
    ).toEqual([
      { id: "m1", role: "user", parts: [{ type: "text", text: "Halo" }] },
    ]);
  });

  it("drops incomplete assistant stream parts before persistence", () => {
    expect(
      parseProjectChatMessages([
        {
          id: "a1",
          role: "assistant",
          parts: [
            { type: "step-start" },
            { type: "reasoning", state: "done", text: "hidden thought" },
            {
              type: "text",
              state: "streaming",
              text: "Uncommitted next question",
            },
            {
              type: "tool-setWorkspaceUi",
              state: "input-streaming",
              input: { workspaceCard: { type: "question" } },
            },
          ],
        },
        {
          id: "a2",
          role: "assistant",
          parts: [
            { type: "text", state: "done", text: "Committed answer" },
            {
              type: "tool-setWorkspaceUi",
              state: "output-available",
              output: { workspaceCard: { type: "question" } },
            },
          ],
        },
      ]),
    ).toEqual([
      {
        id: "a2",
        role: "assistant",
        parts: [
          { type: "text", state: "done", text: "Committed answer" },
          {
            type: "tool-setWorkspaceUi",
            state: "output-available",
            output: { workspaceCard: { type: "question" } },
          },
        ],
      },
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

  it("does not start active model context with an assistant message", () => {
    const messages = [
      {
        id: "u0",
        role: "user" as const,
        parts: [{ type: "text" as const, text: "Jawaban pemilik" }],
      },
      {
        id: "a0",
        role: "assistant" as const,
        parts: [{ type: "text" as const, text: "Pertanyaan AI" }],
      },
      ...Array.from({ length: MAX_CONTEXT_MESSAGES - 1 }, (_, index) => ({
        id: `m${index + 1}`,
        role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
        parts: [{ type: "text" as const, text: `pesan ${index + 1}` }],
      })),
    ];

    const context = getProjectChatContext(messages);

    expect(context[0]?.role).toBe("user");
    expect(context.length).toBeLessThanOrEqual(MAX_CONTEXT_MESSAGES);
  });

  it("keeps older owner statements in hidden context when the active window is bounded", () => {
    const messages = [
      {
        id: "old-owner",
        role: "user" as const,
        parts: [{ type: "text" as const, text: "Nama usaha: Kedai Pagi" }],
      },
      ...Array.from({ length: MAX_CONTEXT_MESSAGES + 1 }, (_, index) => ({
        id: `recent-${index}`,
        role: "user" as const,
        parts: [{ type: "text" as const, text: `jawaban ${index}` }],
      })),
    ];

    const context = buildProjectChatContext({
      messages,
      memoryFacts: parseProjectMemoryFacts(null),
      summary: parseProjectChatSummary(null),
    });

    expect(context.messages).toHaveLength(MAX_CONTEXT_MESSAGES);
    expect(context.systemContext).toContain("Nama usaha: Kedai Pagi");
  });

  it("serializes bounded discussion context with older owner statements", () => {
    const messages = [
      {
        id: "old-owner",
        role: "user" as const,
        parts: [
          { type: "text" as const, text: "Pemilik memilih pesan WhatsApp" },
        ],
      },
      ...Array.from({ length: MAX_CONTEXT_MESSAGES + 1 }, (_, index) => ({
        id: `recent-${index}`,
        role: "assistant" as const,
        parts: [{ type: "text" as const, text: `Pesan terbaru ${index}` }],
      })),
    ];

    const context = buildCompactDiscussionContext({
      messages,
      memoryFacts: parseProjectMemoryFacts({ ownerNotes: ["Owner note"] }),
      summary: parseProjectChatSummary(null),
    });
    const parsed = JSON.parse(context) as {
      ownerMessages: string[];
      recentMessages: Array<{ id: string }>;
    };

    expect(parsed.ownerMessages).toEqual(
      expect.arrayContaining(["Pemilik memilih pesan WhatsApp", "Owner note"]),
    );
    expect(parsed.recentMessages.map((message) => message.id)).toContain(
      "recent-10",
    );
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

  it("falls back to the canonical discussion snapshot when chat columns are empty", () => {
    const state = resolveProjectChatState({
      chatMessages: null,
      chatSummary: null,
      memoryFacts: null,
      fallback: {
        messages: [
          {
            id: "fallback-1",
            role: "user",
            parts: [{ type: "text", text: "Kedai Pagi" }],
          },
        ],
        summary: {
          text: "Pemilik menjual sarapan.",
          compactedMessageCount: 1,
        },
        memoryFacts: {
          facts: ["Usaha sarapan"],
          decisions: [],
          preferences: [],
        },
      },
    });

    expect(state.messages.map((message) => message.id)).toEqual(["fallback-1"]);
    expect(state.summary.text).toBe("Pemilik menjual sarapan.");
    expect(state.memoryFacts.facts).toEqual(["Usaha sarapan"]);
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

describe("field state tracking", () => {
  it("records an ask and an answer", () => {
    let map: FieldStateMap = {};
    map = recordFieldAsk(map, "hours");
    map = recordFieldAnswer(map, "hours");
    expect(map.hours).toBe("answered");
  });

  it("records a decline", () => {
    let map: FieldStateMap = {};
    map = recordFieldAsk(map, "deliveryArea");
    map = recordFieldDecline(map, "deliveryArea");
    expect(map.deliveryArea).toBe("declined");
  });

  it("records an explicit empty (none yet)", () => {
    let map: FieldStateMap = {};
    map = recordFieldAsk(map, "contact");
    map = recordFieldEmpty(map, "contact");
    expect(map.contact).toBe("explicitly_empty");
  });

  it("summarizeFieldState counts each state", () => {
    let map: FieldStateMap = {};
    map = recordFieldAsk(map, "hours");
    map = recordFieldAnswer(map, "hours");
    map = recordFieldAsk(map, "contact");
    map = recordFieldDecline(map, "contact");
    const summary = summarizeFieldState(map);
    expect(summary.answered).toContain("hours");
    expect(summary.declined).toContain("contact");
  });

  it("buildFieldStateBlock produces a readable block", () => {
    let map: FieldStateMap = {};
    map = recordFieldAsk(map, "hours");
    map = recordFieldAnswer(map, "hours");
    const block = buildFieldStateBlock(map);
    expect(block).toContain("hours: answered");
    expect(block).not.toMatch(/Bahasa dominan/i);
  });
});
