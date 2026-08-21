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
      async (key: string, fallback: boolean | string) => {
        if (key === "feature.composer_uploads_enabled") {
          return false;
        }
        if (key === "feature.visual_edit_enabled") {
          return true;
        }
        if (key === "feature.default_theme") {
          return "light";
        }
        return fallback;
      },
    );

    const flags = await getPublicFlags();

    expect(flags).toEqual({
      "feature.composer_uploads_enabled": false,
      "feature.visual_edit_enabled": true,
      "feature.default_theme": "light",
    });
  });

  it("falls back to default for every key when getSetting rejects", async () => {
    getSettingMock.mockRejectedValue(new Error("db down"));

    const flags = await getPublicFlags();

    expect(flags).toEqual({
      "feature.composer_uploads_enabled": false,
      "feature.visual_edit_enabled": false,
      "feature.default_theme": "dark",
    });
  });

  it("calls getSetting exactly once per public flag", async () => {
    getSettingMock.mockResolvedValue(true);

    await getPublicFlags();

    expect(getSettingMock).toHaveBeenCalledTimes(3);
    expect(getSettingMock).toHaveBeenCalledWith(
      "feature.composer_uploads_enabled",
      false,
    );
    expect(getSettingMock).toHaveBeenCalledWith(
      "feature.visual_edit_enabled",
      false,
    );
    expect(getSettingMock).toHaveBeenCalledWith(
      "feature.default_theme",
      "dark",
    );
  });
});
