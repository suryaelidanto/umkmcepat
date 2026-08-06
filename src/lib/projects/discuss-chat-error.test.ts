import { describe, expect, it } from "vitest";

import {
  classifyDiscussChatError,
  decideAiThinkingTier,
  isTerminalChatError,
  nextRetryAttempt,
} from "@/lib/projects/discuss-chat-error";

describe("classifyDiscussChatError", () => {
  it("treats known transient internal codes as transient", () => {
    expect(classifyDiscussChatError({ code: "stream_error_no_text" })).toBe(
      "transient",
    );
    expect(classifyDiscussChatError({ code: "repair_failed" })).toBe(
      "transient",
    );
  });

  it("treats stack/timeout/queue patterns as transient", () => {
    expect(
      classifyDiscussChatError({
        message: "ECONNREFUSED worker queue failed",
      }),
    ).toBe("transient");
    expect(classifyDiscussChatError({ message: "Failed to fetch" })).toBe(
      "transient",
    );
  });

  it("treats 429 and 408 as transient", () => {
    expect(classifyDiscussChatError({ status: 429 })).toBe("transient");
    expect(classifyDiscussChatError({ status: 408 })).toBe("transient");
  });

  it("treats blocked/too-large as terminal", () => {
    expect(classifyDiscussChatError({ code: "project_request_blocked" })).toBe(
      "terminal",
    );
    expect(classifyDiscussChatError({ code: "chat_turn_too_large" })).toBe(
      "terminal",
    );
  });

  it("treats terminal Indonesian copy as terminal", () => {
    expect(classifyDiscussChatError({ message: "Proses dihentikan." })).toBe(
      "terminal",
    );
    expect(
      classifyDiscussChatError({
        message: "Obrolan belum berhasil diproses. Coba kirim ulang ya.",
      }),
    ).toBe("terminal");
  });

  it("treats an empty/unknown error as transient (safest: retry once)", () => {
    expect(classifyDiscussChatError({})).toBe("transient");
  });

  it("classifies the server transient copy as transient (drives auto-retry)", () => {
    expect(
      classifyDiscussChatError({
        message: "AI lagi gangguan. Coba lagi sebentar.",
      }),
    ).toBe("transient");
  });
});

describe("isTerminalChatError", () => {
  it("returns true for terminal errors", () => {
    expect(isTerminalChatError({ code: "project_request_blocked" })).toBe(true);
    expect(isTerminalChatError({ message: "Proses dihentikan." })).toBe(true);
  });

  it("returns false for transient errors", () => {
    expect(isTerminalChatError({ code: "stream_error_no_text" })).toBe(false);
    expect(isTerminalChatError({ status: 503 })).toBe(false);
  });
});

describe("nextRetryAttempt", () => {
  it("returns the next attempt below the cap", () => {
    expect(nextRetryAttempt(0, 2)).toBe(1);
    expect(nextRetryAttempt(1, 2)).toBe(2);
  });

  it("returns null at the cap", () => {
    expect(nextRetryAttempt(2, 2)).toBeNull();
    expect(nextRetryAttempt(0, 0)).toBeNull();
  });

  it("clamps negative cap to zero", () => {
    expect(nextRetryAttempt(0, -1)).toBeNull();
  });
});

describe("decideAiThinkingTier", () => {
  it("stays idle before any elapsed time", () => {
    expect(
      decideAiThinkingTier({
        hasToken: false,
        hasReasoning: false,
        elapsedMs: 0,
      }),
    ).toBe("idle");
  });

  it("goes active after the grace period", () => {
    expect(
      decideAiThinkingTier({
        hasToken: false,
        hasReasoning: false,
        elapsedMs: 1_500,
      }),
    ).toBe("active");
  });

  it("escalates to slow past 8s", () => {
    expect(
      decideAiThinkingTier({
        hasToken: false,
        hasReasoning: false,
        elapsedMs: 9_000,
      }),
    ).toBe("slow");
  });

  it("prefers reasoning tier while reasoning is in flight", () => {
    expect(
      decideAiThinkingTier({
        hasToken: false,
        hasReasoning: true,
        elapsedMs: 9_000,
      }),
    ).toBe("reasoning");
  });

  it("returns idle the moment a token lands", () => {
    expect(
      decideAiThinkingTier({
        hasToken: true,
        hasReasoning: true,
        elapsedMs: 9_000,
      }),
    ).toBe("idle");
  });
});
