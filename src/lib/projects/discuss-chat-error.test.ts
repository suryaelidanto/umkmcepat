import { describe, expect, it } from "vitest";

import {
  classifyDiscussChatError,
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
