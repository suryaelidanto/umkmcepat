import { getConfiguredProvider } from "@/lib/config/config";

type RateLimitType = "global" | "ai" | "build" | "otp";
type RateLimitSubject = "ip" | "user";

type Bucket = {
  count: number;
  resetAt: number;
};

type RateLimitConfig = {
  limit: number;
  windowMs: number;
};

const buckets = new Map<string, Bucket>();

const defaults: Record<
  RateLimitType,
  Record<RateLimitSubject, RateLimitConfig>
> = {
  global: {
    ip: { limit: 300, windowMs: 60_000 },
    user: { limit: 300, windowMs: 60_000 },
  },
  ai: {
    ip: { limit: 20, windowMs: 600_000 },
    user: { limit: 60, windowMs: 600_000 },
  },
  build: {
    ip: { limit: 5, windowMs: 3_600_000 },
    user: { limit: 10, windowMs: 3_600_000 },
  },
  otp: {
    ip: { limit: 10, windowMs: 300_000 },
    user: { limit: 5, windowMs: 300_000 },
  },
};

function isPlausibleIp(value: string | null | undefined): value is string {
  if (!value) {
    return false;
  }
  return value.length <= 45 && /^[0-9a-fA-F:.]+$/.test(value);
}

export function getClientIp(request: Request): string {
  const cfConnectingIp = request.headers.get("cf-connecting-ip");
  if (isPlausibleIp(cfConnectingIp)) {
    return cfConnectingIp;
  }

  // Cloudflare appends the real client IP as the LAST hop and preserves any
  const forwardedFor = request.headers.get("x-forwarded-for");
  const lastHop = forwardedFor?.split(",").at(-1)?.trim();
  if (isPlausibleIp(lastHop)) {
    return lastHop;
  }

  const realIp = request.headers.get("x-real-ip");
  if (isPlausibleIp(realIp)) {
    return realIp;
  }

  return "127.0.0.1";
}

export async function getRateLimitConfig(
  type: RateLimitType,
  subject: RateLimitSubject,
): Promise<RateLimitConfig> {
  const fallback = defaults[type][subject];
  const { getSetting } = await import("@/lib/config/app-settings");
  const scope = type === "global" ? "global_ip" : `${type}_${subject}`;
  const limit = await getSetting<number>(
    `ratelimit.${scope}.requests`,
    fallback.limit,
  );
  const windowSeconds = await getSetting<number>(
    `ratelimit.${scope}.window_seconds`,
    fallback.windowMs / 1000,
  );

  return { limit, windowMs: windowSeconds * 1000 };
}

export function shouldEnforceProductRateLimit(
  _type: RateLimitType,
  _userId?: string,
) {
  // Always enforce rate limiting, even for authenticated users on product routes.
  return true;
}

export async function checkRateLimit(
  request: Request,
  type: RateLimitType = "global",
  userId?: string,
) {
  const provider = getConfiguredProvider("rateLimit");

  if (provider === "none") {
    return null;
  }

  if (!shouldEnforceProductRateLimit(type, userId)) {
    return null;
  }

  if (provider !== "memory") {
    throw new Error(
      `Rate limit provider '${provider}' is registered but not implemented yet.`,
    );
  }

  const subject: RateLimitSubject = userId ? "user" : "ip";
  const subjectId = userId || getClientIp(request);
  const config = await getRateLimitConfig(type, subject);
  const now = Date.now();
  const key = `${type}:${subject}:${subjectId}`;
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
  const waitLabel =
    retryAfter >= 60
      ? `${Math.ceil(retryAfter / 60)} menit`
      : `${retryAfter} detik`;

  return Response.json(
    {
      code: "rate_limited",
      message: `Terlalu banyak percobaan. Coba lagi dalam ${waitLabel}.`,
      retryAfter,
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
