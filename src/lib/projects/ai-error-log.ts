type AiErrorLike = {
  lastError?: {
    message?: unknown;
    statusCode?: number;
    responseHeaders?: Record<string, string>;
  };
  message?: unknown;
  reason?: string;
  statusCode?: unknown;
};

export function getSafeAiErrorLog(error: unknown) {
  const value = error as AiErrorLike;
  const statusCode =
    typeof value.statusCode === "number"
      ? value.statusCode
      : value.lastError?.statusCode;
  const retryAfter = value.lastError?.responseHeaders?.["retry-after"];

  return {
    message: sanitizeAiErrorMessage(value.message ?? value.lastError?.message),
    reason: value.reason || "unknown",
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
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .replace(/[A-Za-z0-9._-]+:[^@/\s]+@/g, "[redacted]@");

  if (!stripped) {
    return undefined;
  }

  return stripped.length > 240 ? `${stripped.slice(0, 240)}…` : stripped;
}
