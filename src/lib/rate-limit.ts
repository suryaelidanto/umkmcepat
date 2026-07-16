import { getConfiguredProvider, getEnv } from "@/lib/config";

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
    ip: { limit: 10, windowMs: 3_600_000 },
    user: { limit: 5, windowMs: 3_600_000 },
  },
};

const envNames: Record<
  RateLimitType,
  Record<RateLimitSubject, { requests: string; windowSeconds: string }>
> = {
  global: {
    ip: {
      requests: "RATE_LIMIT_GLOBAL_IP_REQUESTS",
      windowSeconds: "RATE_LIMIT_GLOBAL_IP_WINDOW_SECONDS",
    },
    user: {
      requests: "RATE_LIMIT_GLOBAL_USER_REQUESTS",
      windowSeconds: "RATE_LIMIT_GLOBAL_USER_WINDOW_SECONDS",
    },
  },
  ai: {
    ip: {
      requests: "RATE_LIMIT_AI_IP_REQUESTS",
      windowSeconds: "RATE_LIMIT_AI_IP_WINDOW_SECONDS",
    },
    user: {
      requests: "RATE_LIMIT_AI_USER_REQUESTS",
      windowSeconds: "RATE_LIMIT_AI_USER_WINDOW_SECONDS",
    },
  },
  build: {
    ip: {
      requests: "RATE_LIMIT_BUILD_IP_REQUESTS",
      windowSeconds: "RATE_LIMIT_BUILD_IP_WINDOW_SECONDS",
    },
    user: {
      requests: "RATE_LIMIT_BUILD_USER_REQUESTS",
      windowSeconds: "RATE_LIMIT_BUILD_USER_WINDOW_SECONDS",
    },
  },
  otp: {
    ip: {
      requests: "RATE_LIMIT_OTP_IP_REQUESTS",
      windowSeconds: "RATE_LIMIT_OTP_IP_WINDOW_SECONDS",
    },
    user: {
      requests: "RATE_LIMIT_OTP_USER_REQUESTS",
      windowSeconds: "RATE_LIMIT_OTP_USER_WINDOW_SECONDS",
    },
  },
};

function getClientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "127.0.0.1"
  );
}

export function getRateLimitConfig(
  type: RateLimitType,
  subject: RateLimitSubject,
): RateLimitConfig {
  const fallback = defaults[type][subject];
  const names = envNames[type][subject];
  const limit = readPositiveInt(names.requests, fallback.limit);
  const windowSeconds = readPositiveInt(
    names.windowSeconds,
    fallback.windowMs / 1000,
  );

  return { limit, windowMs: windowSeconds * 1000 };
}

/**
 * Product routes (ai/build) already gate on daily energy for authenticated users.
 * Fixed hourly/10-min buckets were a second soft-paywall on retries.
 * Default pilot: skip ai|build when userId is known unless RATE_LIMIT_ENFORCE_PRODUCT=1.
 */
export function shouldEnforceProductRateLimit(
  type: RateLimitType,
  userId?: string,
) {
  if (!userId || (type !== "ai" && type !== "build")) {
    return true;
  }

  return process.env.RATE_LIMIT_ENFORCE_PRODUCT === "1";
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
  const config = getRateLimitConfig(type, subject);
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

  return Response.json(
    {
      code: "rate_limited",
      message: `Terlalu banyak percobaan. Coba lagi dalam ${retryAfter} detik.`,
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

function readPositiveInt(name: string, fallback: number) {
  const value = getEnv(name);

  if (!value) {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}
