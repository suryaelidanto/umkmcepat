export type BoundedJsonErrorCode =
  "request_body_invalid_json" | "request_body_too_large";

export class BoundedJsonError extends Error {
  constructor(
    public readonly code: BoundedJsonErrorCode,
    public readonly maxBytes: number,
  ) {
    super(code);
    this.name = "BoundedJsonError";
  }
}

export async function readBoundedJson(
  request: Request,
  { maxBytes }: { maxBytes: number },
): Promise<unknown> {
  const declaredLength = Number(request.headers.get("content-length"));

  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new BoundedJsonError("request_body_too_large", maxBytes);
  }

  if (!request.body) {
    return {};
  }

  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let totalBytes = 0;
  let text = "";

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      totalBytes += value.byteLength;

      if (totalBytes > maxBytes) {
        await reader.cancel("request body too large").catch(() => undefined);
        throw new BoundedJsonError("request_body_too_large", maxBytes);
      }

      text += decoder.decode(value, { stream: true });
    }

    text += decoder.decode();
  } catch (error) {
    if (error instanceof BoundedJsonError) {
      throw error;
    }

    throw new BoundedJsonError("request_body_invalid_json", maxBytes);
  } finally {
    reader.releaseLock();
  }

  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new BoundedJsonError("request_body_invalid_json", maxBytes);
  }
}

export function isBoundedJsonError(error: unknown): error is BoundedJsonError {
  return error instanceof BoundedJsonError;
}
