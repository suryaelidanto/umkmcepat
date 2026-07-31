import { afterEach, describe, expect, it } from "vitest";

import { getRedisUrl } from "@/lib/redis-url";

describe("getRedisUrl", () => {
  const prev = process.env.REDIS_URL;

  afterEach(() => {
    if (prev === undefined) {
      delete process.env.REDIS_URL;
    } else {
      process.env.REDIS_URL = prev;
    }
  });

  it("defaults to local compose Redis", () => {
    delete process.env.REDIS_URL;
    expect(getRedisUrl()).toBe("redis://127.0.0.1:6379");
  });

  it("honors REDIS_URL when set", () => {
    process.env.REDIS_URL = "redis://example:6380";
    expect(getRedisUrl()).toBe("redis://example:6380");
  });
});
