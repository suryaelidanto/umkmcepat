import { describe, expect, it } from "vitest";

import {
  getProjectChatContext,
  getProjectChatPage,
  MAX_CONTEXT_MESSAGES,
  parseProjectChatMessages,
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
