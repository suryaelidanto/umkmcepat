import { describe, expect, it } from "vitest";

import {
  readDiscussTriggerConfig,
  DISCUSS_TIMEOUT_MIN_MS,
  DISCUSS_TIMEOUT_MAX_MS,
} from "./trigger-project-discuss";

describe("readDiscussTriggerConfig", () => {
  it("throws when PROJECT_ID is missing", () => {
    expect(() => readDiscussTriggerConfig({})).toThrow(
      "PROJECT_ID is required",
    );
  });

  it("parses valid configuration with defaults", () => {
    const config = readDiscussTriggerConfig({
      PROJECT_ID: "proj_123",
    });

    expect(config.projectId).toBe("proj_123");
    expect(config.baseUrl).toBe("http://localhost:3000");
    expect(config.mode).toBe("discuss");
    expect(config.timeoutMs).toBe(60_000);
  });

  it("parses explicit message, mode, and timeout", () => {
    const config = readDiscussTriggerConfig({
      PROJECT_ID: "proj_123",
      MESSAGE: "Halo ini tes",
      DISCUSS_MODE: "build",
      DISCUSS_TIMEOUT_MS: "10000",
    });

    expect(config.message).toBe("Halo ini tes");
    expect(config.mode).toBe("build");
    expect(config.timeoutMs).toBe(10_000);
  });

  it("throws on out-of-bounds timeout", () => {
    expect(() =>
      readDiscussTriggerConfig({
        PROJECT_ID: "proj_123",
        DISCUSS_TIMEOUT_MS: "1000",
      }),
    ).toThrow(
      `DISCUSS_TIMEOUT_MS must be an integer from ${DISCUSS_TIMEOUT_MIN_MS} to ${DISCUSS_TIMEOUT_MAX_MS}`,
    );
  });
});
