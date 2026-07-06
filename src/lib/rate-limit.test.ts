import { afterEach, describe, expect, it } from "vitest";

import { getRateLimitConfig } from "@/lib/rate-limit";

const envNames = [
  "RATE_LIMIT_AI_USER_REQUESTS",
  "RATE_LIMIT_AI_USER_WINDOW_SECONDS",
  "RATE_LIMIT_BUILD_IP_REQUESTS",
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
