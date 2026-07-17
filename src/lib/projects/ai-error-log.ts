type AiErrorLike = {
  cause?: unknown;
  code?: unknown;
  lastError?: {
    message?: unknown;
    statusCode?: number;
    responseHeaders?: Record<string, string>;
  };
  message?: unknown;
  name?: unknown;
  reason?: string;
  statusCode?: unknown;
};

export function getSafeAiErrorLog(error: unknown) {
  const value = (error ?? {}) as AiErrorLike;
  const statusCode =
    typeof value.statusCode === "number"
      ? value.statusCode
      : value.lastError?.statusCode;
  const retryAfter = value.lastError?.responseHeaders?.["retry-after"];
  const rawMessage = value.message ?? value.lastError?.message;
  const message = sanitizeAiErrorMessage(rawMessage);

  return {
    message,
    reason: resolveAiErrorReason(value, statusCode, message, rawMessage),
    retryAfter,
    statusCode,
  };
}

export function sanitizeAiErrorMessage(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const stripped = value
    .trim()
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, "[redacted]")
    .replace(/sk-or-v1-[A-Za-z0-9_-]{12,}/gi, "[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .replace(
      /\b(api[_-]?key|token|secret|password)\s*[:=]\s*['"]?[^'"\s,;]+['"]?/gi,
      "$1=[redacted]",
    )
    .replace(/[A-Za-z0-9._-]+:[^@/\s]+@/g, "[redacted]@");

  if (!stripped) {
    return undefined;
  }

  return stripped.length > 240 ? `${stripped.slice(0, 240)}…` : stripped;
}

function resolveAiErrorReason(
  value: AiErrorLike,
  statusCode: number | undefined,
  sanitizedMessage: string | undefined,
  rawMessage: unknown,
) {
  if (typeof value.reason === "string" && value.reason.trim()) {
    return clampReason(value.reason.trim());
  }

  if (typeof value.code === "string" && value.code.trim()) {
    return clampReason(value.code.trim());
  }

  if (typeof value.name === "string" && value.name && value.name !== "Error") {
    const fromName = reasonFromText(value.name);
    if (fromName) {
      return fromName;
    }
  }

  if (statusCode === 429) {
    return "rate_limited";
  }
  if (statusCode === 401 || statusCode === 403) {
    return "auth_failed";
  }
  if (statusCode === 408 || statusCode === 504) {
    return "timeout";
  }
  if (typeof statusCode === "number" && statusCode >= 500) {
    return "upstream_error";
  }
  if (typeof statusCode === "number" && statusCode >= 400) {
    return "request_failed";
  }

  const text = [
    typeof rawMessage === "string" ? rawMessage : "",
    sanitizedMessage ?? "",
    typeof value.cause === "object" &&
    value.cause &&
    "message" in value.cause &&
    typeof (value.cause as { message?: unknown }).message === "string"
      ? (value.cause as { message: string }).message
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  return reasonFromText(text) ?? "unknown";
}

function reasonFromText(text: string) {
  const lower = text.toLowerCase();
  if (!lower) {
    return undefined;
  }
  if (/\b(rate.?limit|too many requests|429)\b/.test(lower)) {
    return "rate_limited";
  }
  if (
    /\b(timeout|timed[\s_-]?out|deadline|etimedout|abort(?:ed)?)\b/.test(
      lower,
    ) ||
    /timeout/.test(lower)
  ) {
    return "timeout";
  }
  if (
    /\b(econnreset|econnrefused|enotfound|fetch failed|network)\b/.test(lower)
  ) {
    return "network_error";
  }
  if (/\b(unauthorized|forbidden|invalid.?api.?key|401|403)\b/.test(lower)) {
    return "auth_failed";
  }
  if (/\b(context.?length|too many tokens|max.?tokens)\b/.test(lower)) {
    return "context_overflow";
  }
  if (/\b(tool.?repair|invalid.?tool|tool.?call)\b/.test(lower)) {
    return "tool_error";
  }
  return undefined;
}

function clampReason(reason: string) {
  const cleaned = reason
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, "[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .slice(0, 64);
  return cleaned || "unknown";
}
