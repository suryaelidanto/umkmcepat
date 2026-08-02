import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/app-settings", () => ({
  getSettingSync: vi.fn((_key: string, fallback: number) => fallback),
}));

import { getSettingSync } from "@/lib/app-settings";
import {
  DEFAULT_BUILD_CONCURRENCY,
  getBuildConcurrencyLimit,
} from "@/lib/projects/attempt-queue";

describe("getBuildConcurrencyLimit", () => {
  it("returns positive integer from settings", () => {
    vi.mocked(getSettingSync).mockReturnValue(4);
    expect(getBuildConcurrencyLimit()).toBe(4);
  });

  it("falls back to DEFAULT_BUILD_CONCURRENCY for invalid values", () => {
    vi.mocked(getSettingSync).mockReturnValue(0);
    expect(getBuildConcurrencyLimit()).toBe(DEFAULT_BUILD_CONCURRENCY);
    vi.mocked(getSettingSync).mockReturnValue(-2);
    expect(getBuildConcurrencyLimit()).toBe(DEFAULT_BUILD_CONCURRENCY);
    vi.mocked(getSettingSync).mockReturnValue(1.5);
    expect(getBuildConcurrencyLimit()).toBe(DEFAULT_BUILD_CONCURRENCY);
  });
});
