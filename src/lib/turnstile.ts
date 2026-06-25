import { getEnv } from "@/lib/config";

export function getTurnstileSiteKey() {
  return getEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY");
}

export async function verifyTurnstileToken(token: unknown) {
  const secret = getEnv("TURNSTILE_SECRET_KEY");
  const siteKey = getTurnstileSiteKey();

  if (!siteKey && !secret && process.env.NODE_ENV !== "production") {
    return token === "dev";
  }

  if (!secret || typeof token !== "string" || !token) {
    return false;
  }

  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      body: new URLSearchParams({ response: token, secret }),
    },
  ).catch(() => null);

  if (!response?.ok) {
    return false;
  }

  const result = (await response.json().catch(() => ({}))) as {
    success?: boolean;
  };

  return result.success === true;
}
