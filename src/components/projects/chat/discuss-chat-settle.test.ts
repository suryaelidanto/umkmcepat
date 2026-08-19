import { describe, expect, it } from "vitest";

import { settleDiscussAfterChatReady } from "./discuss-chat-settle";

describe("settleDiscussAfterChatReady", () => {
  it("applies non-none tool card and clears preparing", () => {
    const r = settleDiscussAfterChatReady({
      toolCard: {
        workspaceCard: {
          type: "question",
          question: {
            id: "q1",
            question: "Pilih?",
            answerMode: "text",
            options: [],
          },
        },
      },
      lastAssistantHasText: true,
      mode: "discuss",
      answeredPreviousQuestion: true,
    });
    expect(r.applyToolCard).toBe(true);
    expect(r.clearPreparing).toBe(true);
    expect(r.enterPreparingPoll).toBe(false);
    expect(r.setCardError).toBe(false);
  });

  it("clears preparing on text-only ready", () => {
    const r = settleDiscussAfterChatReady({
      toolCard: { workspaceCard: { type: "none" } },
      lastAssistantHasText: true,
      mode: "discuss",
      answeredPreviousQuestion: true,
    });
    expect(r.clearPreparing).toBe(true);
    expect(r.enterPreparingPoll).toBe(false);
    expect(r.setCardError).toBe(false);
    expect(r.applyToolCard).toBe(false);
  });

  it("enters preparing poll when answered previous and no assistant text yet", () => {
    const r = settleDiscussAfterChatReady({
      toolCard: null,
      lastAssistantHasText: false,
      mode: "discuss",
      answeredPreviousQuestion: true,
    });
    expect(r.enterPreparingPoll).toBe(true);
    expect(r.clearPreparing).toBe(false);
  });
});
