import { afterEach, describe, expect, it, vi } from "vitest";

import { DISCUSS_CARD_SERVER_DEADLINE_MS, getAiTimeoutMs } from "./ai-timeouts";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("discuss card timeout", () => {
  it("uses 45s per attempt with 135s total deadline across three semantic attempts", () => {
    expect(getAiTimeoutMs("discussCard")).toBe(45_000);
    expect(DISCUSS_CARD_SERVER_DEADLINE_MS).toBe(135_000);
  });

  it("allows environment overrides up to the maxMs cap", () => {
    vi.stubEnv("AI_TIMEOUT_DISCUSS_CARD_MS", "60000");

    expect(getAiTimeoutMs("discussCard")).toBe(60_000);
  });
});
