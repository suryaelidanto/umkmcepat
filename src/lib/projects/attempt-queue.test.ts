import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/config/app-settings", () => ({
  getSettingSync: vi.fn((_key: string, fallback: number) => fallback),
}));

import { getSettingSync } from "@/lib/config/app-settings";
import {
  ATTEMPT_QUEUE_NAME,
  COMPACTION_QUEUE_NAME,
  DEFAULT_BUILD_CONCURRENCY,
  DEFAULT_DISCUSS_CONCURRENCY,
  DISCUSS_QUEUE_NAME,
  getBuildConcurrencyLimit,
  getDiscussConcurrencyLimit,
  queueNameForJob,
  type AttemptJob,
} from "@/lib/projects/attempt-queue";

const mockGetSettingSync = getSettingSync as unknown as ReturnType<
  typeof vi.fn
>;

describe("getBuildConcurrencyLimit", () => {
  it("returns positive integer from settings", () => {
    mockGetSettingSync.mockReturnValue(4);
    expect(getBuildConcurrencyLimit()).toBe(4);
  });

  it("falls back to DEFAULT_BUILD_CONCURRENCY for invalid values", () => {
    mockGetSettingSync.mockReturnValue(0);
    expect(getBuildConcurrencyLimit()).toBe(DEFAULT_BUILD_CONCURRENCY);
    mockGetSettingSync.mockReturnValue(-2);
    expect(getBuildConcurrencyLimit()).toBe(DEFAULT_BUILD_CONCURRENCY);
    mockGetSettingSync.mockReturnValue(1.5);
    expect(getBuildConcurrencyLimit()).toBe(DEFAULT_BUILD_CONCURRENCY);
  });
});

describe("queueNameForJob", () => {
  it("routes jobs to their dedicated queues", () => {
    const discuss: AttemptJob = {
      kind: "discuss",
      turnId: "ct_1",
      projectId: "p1",
      userId: "u1",
      projectPrompt: "x",
      projectStatus: "discussing",
      projectTitle: "t",
      generationEngine: "contract-v1",
    };
    const generate: AttemptJob = {
      kind: "generate",
      attemptId: "a1",
      buildId: "b1",
      generateMode: "first_generate",
      operationToken: "tok",
      projectId: "p1",
      projectPrompt: "x",
      projectStatus: "building",
      generationEngine: "contract-v1",
      userId: "u1",
    };
    const compaction: AttemptJob = {
      kind: "compaction",
      projectId: "p1",
      turnId: "ct_1",
      userId: "u1",
    };
    expect(queueNameForJob(discuss)).toBe(DISCUSS_QUEUE_NAME);
    expect(queueNameForJob(generate)).toBe(ATTEMPT_QUEUE_NAME);
    expect(queueNameForJob(compaction)).toBe(COMPACTION_QUEUE_NAME);
    expect(getDiscussConcurrencyLimit()).toBe(DEFAULT_DISCUSS_CONCURRENCY);
  });
});
