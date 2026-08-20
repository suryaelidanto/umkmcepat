import { describe, expect, it } from "vitest";

import {
  readBuildTriggerConfig,
  streamBuildProgress,
  STREAM_TIMEOUT_MAX_MS,
  STREAM_TIMEOUT_MIN_MS,
} from "./trigger-project-build";

describe("readBuildTriggerConfig", () => {
  it("requires a project id and keeps credentials out of the config output", () => {
    expect(() => readBuildTriggerConfig({})).toThrow(/PROJECT_ID/);

    const config = readBuildTriggerConfig({
      AUTH_COOKIE: "authjs.session-token=private",
      BUILD_STREAM_TIMEOUT_MS: String(STREAM_TIMEOUT_MIN_MS),
      PROJECT_ID: "project-1",
    });

    expect(config).toMatchObject({
      projectId: "project-1",
      streamTimeoutMs: STREAM_TIMEOUT_MIN_MS,
    });
    expect(config).not.toHaveProperty("authCookie");
  });

  it("accepts explicit handoff inputs and clamps the documented timeout bounds", () => {
    const config = readBuildTriggerConfig({
      BASE_URL: "http://localhost:4010/",
      BUILD_HANDOFF_ID: "handoff-1",
      BUILD_MODE: "retry_build",
      BUILD_REVIEW_HASH: "a".repeat(64),
      BUILD_STREAM_TIMEOUT_MS: String(STREAM_TIMEOUT_MAX_MS),
      PROJECT_ID: "project-1",
    });

    expect(config).toEqual({
      baseUrl: "http://localhost:4010",
      handoffId: "handoff-1",
      mode: "retry_build",
      projectId: "project-1",
      reviewHash: "a".repeat(64),
      streamTimeoutMs: STREAM_TIMEOUT_MAX_MS,
    });
  });

  it("reports when the progress observer reaches its timeout", async () => {
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start() {},
      }),
    );

    await expect(streamBuildProgress(response, 1)).rejects.toThrow(
      /progress stream timed out/i,
    );
  });

  it("rejects invalid mode, review hashes, and unbounded wait values", () => {
    expect(() =>
      readBuildTriggerConfig({
        BUILD_MODE: "unknown",
        PROJECT_ID: "project-1",
      }),
    ).toThrow(/BUILD_MODE/);
    expect(() =>
      readBuildTriggerConfig({
        BUILD_REVIEW_HASH: "not-a-hash",
        PROJECT_ID: "project-1",
      }),
    ).toThrow(/BUILD_REVIEW_HASH/);
    expect(() =>
      readBuildTriggerConfig({
        BUILD_STREAM_TIMEOUT_MS: String(STREAM_TIMEOUT_MIN_MS - 1),
        PROJECT_ID: "project-1",
      }),
    ).toThrow(/BUILD_STREAM_TIMEOUT_MS/);
  });
});
