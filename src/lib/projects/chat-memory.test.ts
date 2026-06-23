import { describe, expect, it } from "vitest";

import {
  getProjectChatContext,
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
});
