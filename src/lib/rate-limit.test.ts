import { afterEach, describe, expect, it } from "vitest";

import {
  checkRateLimit,
  getRateLimitConfig,
  shouldEnforceProductRateLimit,
} from "@/lib/rate-limit";

const envNames = [
  "RATE_LIMIT_AI_USER_REQUESTS",
  "RATE_LIMIT_AI_USER_WINDOW_SECONDS",
  "RATE_LIMIT_BUILD_IP_REQUESTS",
  "RATE_LIMIT_ENFORCE_PRODUCT",
  "RATE_LIMIT_PROVIDER",
] as const;
const previous = Object.fromEntries(
  envNames.map((name) => [name, process.env[name]]),
);

afterEach(() => {
  for (const name of envNames) {
    const value = previous[name];

    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
});

describe("getRateLimitConfig", () => {
  it("uses generous per-user AI defaults", () => {
    delete process.env.RATE_LIMIT_AI_USER_REQUESTS;
    delete process.env.RATE_LIMIT_AI_USER_WINDOW_SECONDS;

    expect(getRateLimitConfig("ai", "user")).toEqual({
      limit: 60,
      windowMs: 600_000,
    });
  });

  it("lets production tune limits from env", () => {
    process.env.RATE_LIMIT_AI_USER_REQUESTS = "42";
    process.env.RATE_LIMIT_AI_USER_WINDOW_SECONDS = "120";

    expect(getRateLimitConfig("ai", "user")).toEqual({
      limit: 42,
      windowMs: 120_000,
    });
  });

  it("keeps build IP fallback stricter than chat", () => {
    delete process.env.RATE_LIMIT_BUILD_IP_REQUESTS;

    expect(getRateLimitConfig("build", "ip").limit).toBeLessThan(
      getRateLimitConfig("ai", "ip").limit,
    );
  });
});

describe("energy-first product rate limits", () => {
  it("skips ai/build buckets for authenticated users by default", () => {
    delete process.env.RATE_LIMIT_ENFORCE_PRODUCT;
    expect(shouldEnforceProductRateLimit("build", "user_1")).toBe(false);
    expect(shouldEnforceProductRateLimit("ai", "user_1")).toBe(false);
    expect(shouldEnforceProductRateLimit("global", "user_1")).toBe(true);
    expect(shouldEnforceProductRateLimit("build", undefined)).toBe(true);
  });

  it("re-enables product buckets when RATE_LIMIT_ENFORCE_PRODUCT=1", () => {
    process.env.RATE_LIMIT_ENFORCE_PRODUCT = "1";
    expect(shouldEnforceProductRateLimit("build", "user_1")).toBe(true);
  });

  it("does not 429 authenticated build retries when energy-first is on", async () => {
    delete process.env.RATE_LIMIT_ENFORCE_PRODUCT;
    process.env.RATE_LIMIT_PROVIDER = "memory";
    const request = new Request("http://localhost/api/projects/x/generate");

    for (let i = 0; i < 20; i += 1) {
      const blocked = await checkRateLimit(request, "build", "user_retry");
      expect(blocked).toBeNull();
    }
  });
});
