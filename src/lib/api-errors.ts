export type ApiErrorCode =
  | "bad_request"
  | "not_authenticated"
  | "not_found"
  | "project_build_in_progress"
  | "project_create_ai_unavailable"
  | "project_create_unavailable"
  | "rate_limit_unavailable";

export type ApiErrorInput = {
  code: ApiErrorCode | string;
  message: string;
  requestId?: string;
  retryAfter?: number;
  status: number;
};

export function apiError({
  code,
  message,
  requestId,
  retryAfter,
  status,
}: ApiErrorInput) {
  return Response.json(
    { code, message, requestId, retryAfter },
    {
      status,
      headers: retryAfter ? { "Retry-After": `${retryAfter}` } : undefined,
    },
  );
}
