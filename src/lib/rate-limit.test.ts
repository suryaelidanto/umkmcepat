import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { invalidateSettingCache } from "@/lib/config/app-settings";
import {
  checkRateLimit,
  getClientIp,
  getRateLimitConfig,
  shouldEnforceProductRateLimit,
} from "@/lib/rate-limit";

// getSetting is async + hits prisma; mock the client.
vi.mock("@/lib/prisma", () => {
  const store = new Map<string, unknown>();
  return {
    prisma: {
      appSetting: {
        findUnique: vi.fn(async ({ where }: { where: { key: string } }) =>
          store.has(where.key) ? { value: store.get(where.key) } : null,
        ),
        upsert: vi.fn(
          async (args: {
            where: { key: string };
            create: { value: unknown };
          }) => {
            store.set(args.where.key, args.create.value);
            return { value: args.create.value };
          },
        ),
        delete: vi.fn(async ({ where }: { where: { key: string } }) => {
          store.delete(where.key);
          return null;
        }),
      },
    },
  };
});

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

beforeEach(() => {
  invalidateSettingCache();
});

afterEach(() => {
  for (const name of envNames) {
    const value = previous[name];

    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
  invalidateSettingCache();
});

describe("getRateLimitConfig", () => {
  it("uses generous per-user AI defaults", async () => {
    delete process.env.RATE_LIMIT_AI_USER_REQUESTS;
    delete process.env.RATE_LIMIT_AI_USER_WINDOW_SECONDS;

    expect(await getRateLimitConfig("ai", "user")).toEqual({
      limit: 60,
      windowMs: 600_000,
    });
  });

  it("lets production tune limits from env", async () => {
    process.env.RATE_LIMIT_AI_USER_REQUESTS = "42";
    process.env.RATE_LIMIT_AI_USER_WINDOW_SECONDS = "120";

    expect(await getRateLimitConfig("ai", "user")).toEqual({
      limit: 42,
      windowMs: 120_000,
    });
  });

  it("keeps build IP fallback stricter than chat", async () => {
    delete process.env.RATE_LIMIT_BUILD_IP_REQUESTS;

    const buildLimit = (await getRateLimitConfig("build", "ip")).limit;
    const aiLimit = (await getRateLimitConfig("ai", "ip")).limit;
    expect(buildLimit).toBeLessThan(aiLimit);
  });
});

describe("getClientIp", () => {
  it("prefers cf-connecting-ip when present (Cloudflare sets it, spoofing cannot)", () => {
    const request = new Request("http://localhost/", {
      headers: {
        "cf-connecting-ip": "203.0.113.7",
        "x-forwarded-for": "1.2.3.4, 198.51.100.9",
        "x-real-ip": "10.0.0.1",
      },
    });
    expect(getClientIp(request)).toBe("203.0.113.7");
  });

  it("uses the LAST x-forwarded-for hop, ignoring attacker-supplied leading hops", () => {
    const request = new Request("http://localhost/", {
      headers: { "x-forwarded-for": "6.6.6.6, 7.7.7.7, 203.0.113.99" },
    });
    expect(getClientIp(request)).toBe("203.0.113.99");
  });

  it("falls back to x-real-ip", () => {
    const request = new Request("http://localhost/", {
      headers: { "x-real-ip": "198.51.100.4" },
    });
    expect(getClientIp(request)).toBe("198.51.100.4");
  });

  it("falls back to 127.0.0.1 when no header is present", () => {
    expect(getClientIp(new Request("http://localhost/"))).toBe("127.0.0.1");
  });

  it("ignores implausible values (e.g. path traversal strings)", () => {
    const request = new Request("http://localhost/", {
      headers: { "x-forwarded-for": "../../etc/passwd" },
    });
    expect(getClientIp(request)).toBe("127.0.0.1");
  });
});

describe("product rate limits always enforced", () => {
  it("enforces limits on all routes and subjects", () => {
    expect(shouldEnforceProductRateLimit("build", "user_1")).toBe(true);
    expect(shouldEnforceProductRateLimit("ai", "user_1")).toBe(true);
    expect(shouldEnforceProductRateLimit("global", "user_1")).toBe(true);
    expect(shouldEnforceProductRateLimit("build", undefined)).toBe(true);
  });

  it("429s authenticated build retries when limit exceeded", async () => {
    process.env.RATE_LIMIT_PROVIDER = "memory";
    const request = new Request("http://localhost/api/projects/x/generate");

    let blockedResponse = null;
    for (let i = 0; i < 20; i += 1) {
      const res = await checkRateLimit(request, "build", "user_retry");
      if (res) {
        blockedResponse = res;
        break;
      }
    }
    expect(blockedResponse).not.toBeNull();
    expect(blockedResponse?.status).toBe(429);
  });
});
