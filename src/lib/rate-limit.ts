import { NextResponse } from "next/server";

import { getConfiguredProvider } from "@/lib/config";

type RateLimitType = "global" | "ai";

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

const limits: Record<RateLimitType, { limit: number; windowMs: number }> = {
  global: { limit: 30, windowMs: 60_000 },
  ai: { limit: 5, windowMs: 600_000 },
};

function getClientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "127.0.0.1"
  );
}

export async function checkRateLimit(
  request: Request,
  type: RateLimitType = "global",
) {
  const provider = getConfiguredProvider("rateLimit");

  if (provider === "none") {
    return null;
  }

  if (provider !== "memory") {
    throw new Error(
      `Rate limit provider '${provider}' is registered but not implemented yet.`,
    );
  }

  const now = Date.now();
  const config = limits[type];
  const key = `${type}:${getClientIp(request)}`;
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + config.windowMs });
    return null;
  }

  bucket.count += 1;

  if (bucket.count <= config.limit) {
    return null;
  }

  const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);

  return NextResponse.json(
    {
      message: `Terlalu banyak percobaan. Coba lagi dalam ${retryAfter} detik.`,
    },
    {
      status: 429,
      headers: {
        "Retry-After": `${retryAfter}`,
        "X-RateLimit-Limit": `${config.limit}`,
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": `${bucket.resetAt}`,
      },
    },
  );
}
