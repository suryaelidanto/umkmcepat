import { describe, expect, it, vi } from "vitest";

const { getSettingSyncMock } = vi.hoisted(() => ({
  getSettingSyncMock: vi.fn(),
}));

vi.mock("@/lib/app-settings", () => ({ getSettingSync: getSettingSyncMock }));

import {
  resolveApprovedReferenceCalibratedMode,
  resolveReferenceCalibratedGenerationMode,
} from "./generated-site-rollout";

describe("reference-calibrated rollout mode", () => {
  it.each([
    [false, false, "off"],
    [false, true, "off"],
    [true, true, "shadow"],
    [true, false, "replace"],
  ] as const)(
    "resolves enabled=%s shadow=%s to %s",
    (enabled, shadow, expected) => {
      getSettingSyncMock.mockImplementation((key: string, fallback: unknown) =>
        key.endsWith("_enabled")
          ? enabled
          : fallback === true
            ? shadow
            : fallback,
      );
      expect(resolveReferenceCalibratedGenerationMode()).toBe(expected);
    },
  );

  it("downgrades replacement until code-owned benchmark approval exists", () => {
    getSettingSyncMock.mockImplementation((key: string) =>
      key.endsWith("_enabled") ? true : false,
    );
    expect(resolveApprovedReferenceCalibratedMode()).toBe("shadow");
  });
});
