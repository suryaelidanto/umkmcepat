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

  it("enables generated build execution by default across environments unless disabled", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("GENERATED_BUILD_EXECUTION_ENABLED", "");
    vi.stubEnv("GENERATED_PUBLIC_EXECUTION_ENABLED", "");

    expect(isGeneratedBuildExecutionEnabled()).toBe(true);
    expect(isGeneratedPublicExecutionEnabled()).toBe(false);
  });

  it("respects explicit false to disable build execution", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("GENERATED_BUILD_EXECUTION_ENABLED", "false");

    expect(isGeneratedBuildExecutionEnabled()).toBe(false);
  });

  it("keeps local and test execution available unless explicitly disabled", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("GENERATED_BUILD_EXECUTION_ENABLED", "");
    vi.stubEnv("GENERATED_PUBLIC_EXECUTION_ENABLED", "false");

    expect(isGeneratedBuildExecutionEnabled()).toBe(true);
    expect(isGeneratedPublicExecutionEnabled()).toBe(false);
  });

  it("treats ambiguous values as dev-enabled", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("GENERATED_BUILD_EXECUTION_ENABLED", "yes");

    // Truthy but not "true" → falls through to dev-default true
    expect(isGeneratedBuildExecutionEnabled()).toBe(true);
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
