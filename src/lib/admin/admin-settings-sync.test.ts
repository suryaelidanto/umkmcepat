import { describe, expect, it } from "vitest";

import { settingsSaveInvalidateKeys } from "./admin-settings-sync";

import { queryKeys } from "@/lib/query-client";

describe("settingsSaveInvalidateKeys", () => {
  it("invalidates all product-facing settings-dependent client caches", () => {
    const keys = settingsSaveInvalidateKeys();
    expect(keys).toEqual(
      expect.arrayContaining([
        ["admin", "settings"],
        ["public-flags"],
        [...queryKeys.adminStreamerMode],
        [...queryKeys.boosterPacks],
        [...queryKeys.projects],
        [...queryKeys.energy],
        [...queryKeys.waitlistStatus],
      ]),
    );
    expect(keys).toHaveLength(7);
  });
});
