import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/app-settings", () => ({
  getSettingSync: vi.fn((_key: string, fallback: number) => fallback),
}));

import { getSettingSync } from "@/lib/app-settings";
import { getBuildConcurrencyLimit } from "@/lib/projects/attempt-queue";

describe("getBuildConcurrencyLimit", () => {
  it("returns positive integer from settings", () => {
    vi.mocked(getSettingSync).mockReturnValue(3);
    expect(getBuildConcurrencyLimit()).toBe(3);
  });

  it("clamps invalid values to 1", () => {
    vi.mocked(getSettingSync).mockReturnValue(0);
    expect(getBuildConcurrencyLimit()).toBe(1);
    vi.mocked(getSettingSync).mockReturnValue(-2);
    expect(getBuildConcurrencyLimit()).toBe(1);
    vi.mocked(getSettingSync).mockReturnValue(1.5);
    expect(getBuildConcurrencyLimit()).toBe(1);
  });
});
