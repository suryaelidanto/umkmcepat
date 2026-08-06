import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import { getEnv } from "@/lib/config";

export const TURNSTILE_VERIFIED_COOKIE = "umkm_turnstile_verified";
export const TURNSTILE_GRACE_MS = 10 * 60 * 1000;

const VERSION = "v1";

function getSecret() {
  const configured = getEnv("NEXTAUTH_SECRET") || getEnv("AUTH_SECRET");
  if (configured) {
    return configured;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "A turnstile gate secret (NEXTAUTH_SECRET) is required in production.",
    );
  }
  return "dev-turnstile-gate";
}

function sign(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function buildBody(issuedAtSeconds: string, nonce: string) {
  return [VERSION, issuedAtSeconds, nonce].join(".");
}

function issueValue(now: number) {
  const issuedAtSeconds = Math.floor(now / 1000).toString(36);
  const nonce = randomUUID();
  const body = buildBody(issuedAtSeconds, nonce);
  const signature = sign(`${TURNSTILE_VERIFIED_COOKIE}:${body}`, getSecret());
  return `${body}.${signature}`;
}

export function createTurnstileVerifiedValue(now = Date.now()): string {
  return issueValue(now);
}

export function verifyTurnstileVerification(
  request: Request,
  now = Date.now(),
): boolean {
  const cookies = request.headers.get("cookie")?.split(";") ?? [];
  const cookie = cookies
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${TURNSTILE_VERIFIED_COOKIE}=`));

  if (!cookie) {
    return false;
  }

  const value = cookie.slice(TURNSTILE_VERIFIED_COOKIE.length + 1);
  const [version, issuedAt, nonce, signature, ...extra] = value.split(".");

  if (
    version !== VERSION ||
    !issuedAt ||
    !nonce ||
    !signature ||
    extra.length > 0
  ) {
    return false;
  }

  const issuedAtMs = Number.parseInt(issuedAt, 36) * 1000;
  if (
    !Number.isFinite(issuedAtMs) ||
    issuedAtMs > now ||
    now - issuedAtMs > TURNSTILE_GRACE_MS
  ) {
    return false;
  }

  const body = buildBody(issuedAt, nonce);
  const expected = sign(`${TURNSTILE_VERIFIED_COOKIE}:${body}`, getSecret());
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);

  return left.length === right.length && timingSafeEqual(left, right);
}

export function turnstileVerifiedCookie(
  secure: boolean,
  now = Date.now(),
): string {
  const maxAge = Math.floor(TURNSTILE_GRACE_MS / 1000);
  return `${TURNSTILE_VERIFIED_COOKIE}=${issueValue(now)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}
