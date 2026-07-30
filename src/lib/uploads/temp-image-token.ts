import { createHmac, timingSafeEqual } from "node:crypto";

import { getEnv } from "@/lib/config";

export type TempImageTokenPayload = {
  contentType: string;
  expiresAt: number;
  key: string;
  sizeBytes: number;
  userId: string;
};

function getSecret() {
  return getEnv("BETTER_AUTH_SECRET") || getEnv("AUTH_SECRET") || "dev-secret";
}

function sign(body: string) {
  return createHmac("sha256", getSecret()).update(body).digest("base64url");
}

export function signTempImageToken(payload: TempImageTokenPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifyTempImageToken(
  token: string,
): TempImageTokenPayload | null {
  const [body, signature] = token.split(".");
  if (!body || !signature) {
    return null;
  }

  const expected = sign(body);
  const actual = Buffer.from(signature);
  const wanted = Buffer.from(expected);
  if (actual.length !== wanted.length || !timingSafeEqual(actual, wanted)) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as TempImageTokenPayload;
    return typeof parsed.contentType === "string" &&
      typeof parsed.expiresAt === "number" &&
      typeof parsed.key === "string" &&
      typeof parsed.sizeBytes === "number" &&
      typeof parsed.userId === "string"
      ? parsed
      : null;
  } catch {
    return null;
  }
}
