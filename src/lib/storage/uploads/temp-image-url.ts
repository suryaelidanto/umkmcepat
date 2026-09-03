const TEMP_IMAGE_PATH = "/api/uploads/temp-images/";

type TempImageUrlPayload = {
  expiresAt?: unknown;
};

export function isExpiredTempImageUrl(url: string, now = Date.now()): boolean {
  if (!url.startsWith(TEMP_IMAGE_PATH)) {
    return false;
  }

  const rawToken = url
    .slice(TEMP_IMAGE_PATH.length)
    .split(/[?#]/, 1)[0]
    ?.trim();
  if (!rawToken) {
    return false;
  }

  let token: string;
  try {
    token = decodeURIComponent(rawToken);
  } catch {
    return false;
  }

  const encodedPayload = token.split(".", 1)[0];
  if (!encodedPayload) {
    return false;
  }

  try {
    const base64 = encodedPayload.replace(/-/g, "+").replace(/_/g, "/");
    const padding = "=".repeat((4 - (base64.length % 4)) % 4);
    const binary = globalThis.atob(`${base64}${padding}`);
    const bytes = Uint8Array.from(binary, (character) =>
      character.charCodeAt(0),
    );
    const payload = JSON.parse(
      new TextDecoder().decode(bytes),
    ) as TempImageUrlPayload;
    return (
      typeof payload.expiresAt === "number" &&
      Number.isFinite(payload.expiresAt) &&
      payload.expiresAt <= now
    );
  } catch {
    return false;
  }
}
