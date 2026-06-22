import { afterEach, describe, expect, it, vi } from "vitest";

import { getConfiguredProvider } from "./config";

describe("provider config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses the default provider when env is missing", () => {
    vi.stubEnv("RATE_LIMIT_PROVIDER", "");

    expect(getConfiguredProvider("rateLimit")).toBe("memory");
  });

  it("rejects unsupported provider values", () => {
    vi.stubEnv("RATE_LIMIT_PROVIDER", "redis-cluster");

    expect(() => getConfiguredProvider("rateLimit")).toThrow(
      "Invalid RATE_LIMIT_PROVIDER 'redis-cluster'. Supported values: memory, redis, none.",
    );
  });
});
