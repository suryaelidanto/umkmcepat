import { afterEach, describe, expect, it, vi } from "vitest";

const { getSettingMock } = vi.hoisted(() => ({
  getSettingMock: vi.fn(),
}));

vi.mock("@/lib/config/app-settings", () => ({
  getSetting: getSettingMock,
}));

import { getPublicFlags } from "@/lib/config/feature-flags";

describe("getPublicFlags", () => {
  afterEach(() => {
    getSettingMock.mockReset();
  });

  it("returns both flags with stored values when getSetting resolves", async () => {
    getSettingMock.mockImplementation(
      async (key: string, fallback: boolean) => {
        if (key === "feature.composer_uploads_enabled") {
          return false;
        }
        if (key === "feature.direct_edit_enabled") {
          return true;
        }
        return fallback;
      },
    );

    const flags = await getPublicFlags();

    expect(flags).toEqual({
      "feature.composer_uploads_enabled": false,
      "feature.direct_edit_enabled": true,
    });
  });

  it("falls back to true for every key when getSetting rejects", async () => {
    getSettingMock.mockRejectedValue(new Error("db down"));

    const flags = await getPublicFlags();

    expect(flags).toEqual({
      "feature.composer_uploads_enabled": true,
      "feature.direct_edit_enabled": true,
    });
  });

  it("calls getSetting exactly once per public flag", async () => {
    getSettingMock.mockResolvedValue(true);

    await getPublicFlags();

    expect(getSettingMock).toHaveBeenCalledTimes(2);
    expect(getSettingMock).toHaveBeenCalledWith(
      "feature.composer_uploads_enabled",
      true,
    );
    expect(getSettingMock).toHaveBeenCalledWith(
      "feature.direct_edit_enabled",
      true,
    );
  });
});
