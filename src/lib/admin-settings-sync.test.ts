import { describe, expect, it } from "vitest";

import { settingsSaveInvalidateKeys } from "./admin-settings-sync";
import { queryKeys } from "./query-client";

describe("settingsSaveInvalidateKeys", () => {
  it("invalidates settings form and live streamer mode", () => {
    const keys = settingsSaveInvalidateKeys();
    expect(keys).toEqual(
      expect.arrayContaining([
        ["admin", "settings"],
        [...queryKeys.adminStreamerMode],
      ]),
    );
  });
});
