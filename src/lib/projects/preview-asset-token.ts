import { createHmac, timingSafeEqual } from "node:crypto";

import { getEnv } from "@/lib/config";

export const PREVIEW_ASSET_TOKEN_PARAM = "assetToken";

const TOKEN_VERSION = "v1";
const TOKEN_AUDIENCE = "preview-asset";
const DEFAULT_TTL_SECONDS = 300;
const MIN_TTL_SECONDS = 60;
const MAX_TTL_SECONDS = 900;

export function createPreviewAssetToken({
  deploymentId,
  now = Date.now(),
  projectId,
}: {
  deploymentId: string;
  now?: number;
  projectId: string;
}) {
  const expiresAtSeconds = Math.floor(now / 1_000) + getTokenTtlSeconds();
  const expiry = expiresAtSeconds.toString(36);
  const payload = createPayload({ deploymentId, expiry, projectId });
  const [signingSecret] = getPreviewAssetSecrets();
  const signature = sign(payload, signingSecret);

  return `${TOKEN_VERSION}.${expiry}.${signature}`;
}

export function verifyPreviewAssetToken({
  deploymentId,
  now = Date.now(),
  projectId,
  token,
}: {
  deploymentId: string;
  now?: number;
  projectId: string;
  token: string | null;
}) {
  if (!token) {
    return false;
  }

  const [version, expiry, signature, ...extra] = token.split(".");

  if (version !== TOKEN_VERSION || !expiry || !signature || extra.length > 0) {
    return false;
  }

  const expiresAtSeconds = Number.parseInt(expiry, 36);

  if (
    !Number.isFinite(expiresAtSeconds) ||
    expiresAtSeconds <= Math.floor(now / 1_000)
  ) {
    return false;
  }

  const payload = createPayload({ deploymentId, expiry, projectId });

  return getPreviewAssetSecrets().some((secret) =>
    safeEqual(signature, sign(payload, secret)),
  );
}

function createPayload({
  deploymentId,
  expiry,
  projectId,
}: {
  deploymentId: string;
  expiry: string;
  projectId: string;
}) {
  return [TOKEN_AUDIENCE, TOKEN_VERSION, projectId, deploymentId, expiry].join(
    ":",
  );
}

function sign(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function getPreviewAssetSecrets() {
  const configured = getEnv("PREVIEW_ASSET_TOKEN_SECRETS")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const authSecret = getEnv("NEXTAUTH_SECRET") || getEnv("AUTH_SECRET");
  const secrets = configured.length
    ? configured
    : authSecret
      ? [authSecret]
      : [];

  if (!secrets.length) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "A preview asset signing secret is required in production.",
      );
    }

    return ["development-preview-asset-token"];
  }

  return secrets;
}

function getTokenTtlSeconds() {
  const parsed = Number(getEnv("PREVIEW_ASSET_TOKEN_TTL_SECONDS"));

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_TTL_SECONDS;
  }

  return Math.min(
    MAX_TTL_SECONDS,
    Math.max(MIN_TTL_SECONDS, Math.round(parsed)),
  );
}
