import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getConfiguredProvider,
  isGeneratedBuildExecutionEnabled,
  isGeneratedPublicExecutionEnabled,
} from "./config";

describe("generated capability config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("fails closed for generated execution in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("GENERATED_BUILD_EXECUTION_ENABLED", "");
    vi.stubEnv("GENERATED_PUBLIC_EXECUTION_ENABLED", "");

    expect(isGeneratedBuildExecutionEnabled()).toBe(false);
    expect(isGeneratedPublicExecutionEnabled()).toBe(false);
  });

  it("keeps local and test execution available unless explicitly disabled", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("GENERATED_BUILD_EXECUTION_ENABLED", "");
    vi.stubEnv("GENERATED_PUBLIC_EXECUTION_ENABLED", "false");

    expect(isGeneratedBuildExecutionEnabled()).toBe(true);
    expect(isGeneratedPublicExecutionEnabled()).toBe(false);
  });

  it("rejects ambiguous capability flag values", () => {
    vi.stubEnv("GENERATED_BUILD_EXECUTION_ENABLED", "yes");

    expect(() => isGeneratedBuildExecutionEnabled()).toThrow(
      "GENERATED_BUILD_EXECUTION_ENABLED must be true or false.",
    );
  });
});

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
