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

  it("redacts OpenRouter-style API keys", () => {
    expect(
      sanitizeAiErrorMessage(
        "auth failed for sk-or-v1-abcdef0123456789xyz0123",
      ),
    ).toBe("auth failed for [redacted]");
  });

  it("redacts key-value secret pairs", () => {
    expect(sanitizeAiErrorMessage("api_key=supersecretvalue123")).toBe(
      "api_key=[redacted]",
    );
    expect(sanitizeAiErrorMessage('token: "abc123def456"')).toBe(
      "token=[redacted]",
    );
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

  it("prefers explicit reason over status heuristics", () => {
    expect(
      getSafeAiErrorLog({ reason: "custom_reason", statusCode: 429 }),
    ).toMatchObject({ reason: "custom_reason" });
  });

  it("uses code when reason is missing", () => {
    expect(getSafeAiErrorLog({ code: "ECONNRESET" })).toMatchObject({
      reason: "ECONNRESET",
    });
  });

  it("maps status codes to stable reasons", () => {
    expect(getSafeAiErrorLog({ statusCode: 429 }).reason).toBe("rate_limited");
    expect(getSafeAiErrorLog({ statusCode: 401 }).reason).toBe("auth_failed");
    expect(getSafeAiErrorLog({ statusCode: 403 }).reason).toBe("auth_failed");
    expect(getSafeAiErrorLog({ statusCode: 408 }).reason).toBe("timeout");
    expect(getSafeAiErrorLog({ statusCode: 504 }).reason).toBe("timeout");
    expect(getSafeAiErrorLog({ statusCode: 502 }).reason).toBe(
      "upstream_error",
    );
    expect(getSafeAiErrorLog({ statusCode: 400 }).reason).toBe(
      "request_failed",
    );
  });

  it("infers reason from message text", () => {
    expect(getSafeAiErrorLog({ message: "Too Many Requests" }).reason).toBe(
      "rate_limited",
    );
    expect(
      getSafeAiErrorLog({ message: "socket hang up ETIMEDOUT" }).reason,
    ).toBe("timeout");
    expect(
      getSafeAiErrorLog({ message: "fetch failed ENOTFOUND" }).reason,
    ).toBe("network_error");
    expect(getSafeAiErrorLog({ message: "invalid API key" }).reason).toBe(
      "auth_failed",
    );
    expect(
      getSafeAiErrorLog({ message: "context length exceeded" }).reason,
    ).toBe("context_overflow");
    expect(getSafeAiErrorLog({ message: "invalid tool call" }).reason).toBe(
      "tool_error",
    );
  });

  it("infers from Error name when not generic Error", () => {
    expect(getSafeAiErrorLog({ name: "TimeoutError" }).reason).toBe("timeout");
  });

  it("ignores generic Error name", () => {
    expect(getSafeAiErrorLog({ name: "Error" }).reason).toBe("unknown");
  });

  it("reads cause.message for heuristics", () => {
    expect(
      getSafeAiErrorLog({ cause: { message: "rate limit exceeded" } }).reason,
    ).toBe("rate_limited");
  });

  it("clamps long reason and redacts keys in reason", () => {
    expect(getSafeAiErrorLog({ reason: "r".repeat(80) }).reason?.length).toBe(
      64,
    );
    expect(
      getSafeAiErrorLog({ reason: "leak sk-abcdef0123456789xyz0123" }).reason,
    ).toContain("[redacted]");
  });

  it("handles null/undefined error objects safely", () => {
    expect(getSafeAiErrorLog(null)).toEqual({
      message: undefined,
      reason: "unknown",
      retryAfter: undefined,
      statusCode: undefined,
    });
    expect(getSafeAiErrorLog(undefined)).toMatchObject({ reason: "unknown" });
  });
});
