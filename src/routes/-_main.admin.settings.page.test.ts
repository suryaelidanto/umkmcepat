import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const settingsPageSource = readFileSync(
  new URL("./_main.admin.settings.tsx", import.meta.url),
  "utf8",
);

describe("admin settings page", () => {
  it("renders the settings editor instead of a generated route stub", () => {
    expect(settingsPageSource).toContain("function SettingsPage()");
    expect(settingsPageSource).toContain("AdvancedSettingsDisclosure");
    expect(settingsPageSource).toContain("/api/admin/settings");
    expect(settingsPageSource).not.toContain('Hello "/_main/admin/settings"!');
  });
});
