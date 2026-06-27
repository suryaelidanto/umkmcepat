import { describe, expect, it } from "vitest";

import {
  CHAT_COMPACTION_BATCH_MESSAGES,
  CHAT_COMPACTION_TRIGGER_MESSAGES,
  shouldCompactProjectChat,
} from "./chat-compaction";

describe("project chat compaction", () => {
  it("does not compact short chats", () => {
    expect(
      shouldCompactProjectChat({
        lastCompactedMessageCount: 0,
        messageCount: CHAT_COMPACTION_TRIGGER_MESSAGES - 1,
      }),
    ).toBe(false);
  });

  it("compacts after enough new messages arrive", () => {
    expect(
      shouldCompactProjectChat({
        lastCompactedMessageCount: 0,
        messageCount: CHAT_COMPACTION_TRIGGER_MESSAGES,
      }),
    ).toBe(true);

    expect(
      shouldCompactProjectChat({
        lastCompactedMessageCount: CHAT_COMPACTION_TRIGGER_MESSAGES,
        messageCount:
          CHAT_COMPACTION_TRIGGER_MESSAGES + CHAT_COMPACTION_BATCH_MESSAGES - 1,
      }),
    ).toBe(false);

    expect(
      shouldCompactProjectChat({
        lastCompactedMessageCount: CHAT_COMPACTION_TRIGGER_MESSAGES,
        messageCount:
          CHAT_COMPACTION_TRIGGER_MESSAGES + CHAT_COMPACTION_BATCH_MESSAGES,
      }),
    ).toBe(true);
  });
});
