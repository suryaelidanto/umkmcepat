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
    const parsed = JSON.parse(text) as unknown;
    sanitizePrototype(parsed);
    return parsed;
  } catch (err) {
    if (err instanceof BoundedJsonError) {
      throw err;
    }
    throw new BoundedJsonError("request_body_invalid_json", maxBytes);
  }
}

function sanitizePrototype(value: unknown): void {
  if (!value || typeof value !== "object") {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      sanitizePrototype(item);
    }
    return;
  }

  const obj = value as Record<string, unknown>;

  for (const key of Object.keys(obj)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      throw new BoundedJsonError("request_body_invalid_json", 0);
    }
    sanitizePrototype(obj[key]);
  }
}

export function isBoundedJsonError(error: unknown): error is BoundedJsonError {
  return error instanceof BoundedJsonError;
}
