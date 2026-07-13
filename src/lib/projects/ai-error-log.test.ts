import { describe, expect, it } from "vitest";

import {
  getSafeAiErrorLog,
  sanitizeAiErrorMessage,
} from "@/lib/projects/ai-error-log";

describe("sanitizeAiErrorMessage", () => {
  it("returns undefined for non-string input", () => {
    expect(sanitizeAiErrorMessage(undefined)).toBeUndefined();
    expect(sanitizeAiErrorMessage(null)).toBeUndefined();
    expect(sanitizeAiErrorMessage({ boom: 1 })).toBeUndefined();
  });

  it("returns undefined for empty or whitespace-only input", () => {
    expect(sanitizeAiErrorMessage("")).toBeUndefined();
    expect(sanitizeAiErrorMessage("   ")).toBeUndefined();
  });

  it("returns a plain message unchanged when short and clean", () => {
    expect(sanitizeAiErrorMessage("tool call timed out")).toBe(
      "tool call timed out",
    );
  });

  it("redacts OpenAI-style API keys", () => {
    expect(
      sanitizeAiErrorMessage("auth failed for sk-abcdef0123456789xyz0123"),
    ).toBe("auth failed for [redacted]");
  });

  it("redacts Bearer tokens", () => {
    expect(
      sanitizeAiErrorMessage("Bearer abc.def.ghi rejected by gateway"),
    ).toBe("Bearer [redacted] rejected by gateway");
  });

  it("redacts URL credentials", () => {
    expect(
      sanitizeAiErrorMessage("GET https://user:secret@example.com/v1 failed"),
    ).toBe("GET https://[redacted]@example.com/v1 failed");
  });

  it("truncates messages longer than 240 characters", () => {
    const long = "x".repeat(300);
    const result = sanitizeAiErrorMessage(long);
    expect(result?.length).toBe(241);
    expect(result?.endsWith("…")).toBe(true);
    expect(result?.slice(0, 240)).toBe("x".repeat(240));
  });
});

describe("getSafeAiErrorLog", () => {
  it("captures reason, status code, and retry-after from a gateway error", () => {
    expect(
      getSafeAiErrorLog({
        lastError: {
          responseHeaders: { "retry-after": "5" },
          statusCode: 429,
        },
        reason: "rate_limited",
      }),
    ).toEqual({
      message: undefined,
      reason: "rate_limited",
      retryAfter: "5",
      statusCode: 429,
    });
  });

  it("falls back to unknown reason and undefined status when absent", () => {
    expect(getSafeAiErrorLog({})).toEqual({
      message: undefined,
      reason: "unknown",
      retryAfter: undefined,
      statusCode: undefined,
    });
  });

  it("prefers the top-level numeric status code over lastError", () => {
    expect(
      getSafeAiErrorLog({ statusCode: 500, lastError: { statusCode: 502 } }),
    ).toMatchObject({ statusCode: 500 });
  });

  it("surfaces a sanitized message from the top-level message", () => {
    expect(getSafeAiErrorLog({ message: "upstream timed out" })).toMatchObject({
      message: "upstream timed out",
    });
  });

  it("sanitizes secrets in the surfaced message", () => {
    expect(
      getSafeAiErrorLog({ message: "key sk-abcdef0123456789xyz0123 rejected" }),
    ).toMatchObject({ message: "key [redacted] rejected" });
  });

  it("surfaces the lastError message when the top-level message is absent", () => {
    expect(
      getSafeAiErrorLog({ lastError: { message: "connection reset" } }),
    ).toMatchObject({ message: "connection reset" });
  });
});
