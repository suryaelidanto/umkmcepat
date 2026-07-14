export type ApiErrorBody = {
  code?: string;
  message?: string;
  requestId?: string;
  retryAfter?: number;
};

export type ApiResponse<T> =
  | { data: T; ok: true; response: Response }
  | { error: ApiErrorBody; ok: false; response?: Response };

const DEFAULT_ERROR_MESSAGE =
  "Permintaan belum bisa diproses. Coba lagi nanti.";

export async function parseApiResponse<T>(
  response: Response,
): Promise<ApiResponse<T>> {
  const text = await response.text().catch(() => "");
  const parsed = parseJsonObject(text);

  if (response.ok) {
    return { data: (parsed ?? {}) as T, ok: true, response };
  }

  return {
    error: normalizeApiError(parsed, response),
    ok: false,
    response,
  };
}

export function apiNetworkError(error: unknown): ApiResponse<never> {
  return {
    error: {
      code:
        error instanceof DOMException && error.name === "AbortError"
          ? "request_aborted"
          : "network_error",
      message:
        error instanceof DOMException && error.name === "AbortError"
          ? "Permintaan dibatalkan. Coba lagi."
          : "Koneksi bermasalah. Periksa internet lalu coba lagi.",
    },
    ok: false,
  };
}

function parseJsonObject(text: string) {
  if (!text.trim()) {
    return null;
  }

  try {
    const value: unknown = JSON.parse(text);
    return value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function normalizeApiError(
  parsed: Record<string, unknown> | null,
  response: Response,
): ApiErrorBody {
  const retryAfter = Number(response.headers.get("Retry-After"));

  return {
    code:
      typeof parsed?.code === "string"
        ? parsed.code
        : `http_${response.status || 500}`,
    message:
      typeof parsed?.message === "string" && parsed.message.trim()
        ? parsed.message
        : DEFAULT_ERROR_MESSAGE,
    requestId:
      typeof parsed?.requestId === "string" ? parsed.requestId : undefined,
    retryAfter:
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
  };
}
