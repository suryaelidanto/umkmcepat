import { describe, expect, it } from "vitest";

import { APP_SETTINGS } from "@/lib/app-settings-registry";

describe("APP_SETTINGS registry", () => {
  it("has no duplicate keys", () => {
    const keys = APP_SETTINGS.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every entry has a non-empty label and valid type", () => {
    for (const entry of APP_SETTINGS) {
      expect(entry.label.length).toBeGreaterThan(0);
      expect(["boolean", "number", "string"]).toContain(entry.type);
    }
  });

  it("every category is one of the known set", () => {
    const valid = ["feature_flag", "booster", "rate_limit", "ai"];
    for (const entry of APP_SETTINGS) {
      expect(valid).toContain(entry.category);
    }
  });

  it("includes the waitlist flag with fail-safe default true", () => {
    const e = APP_SETTINGS.find((x) => x.key === "feature.waitlist_enabled");
    expect(e).toBeDefined();
    expect(e?.type).toBe("boolean");
    expect(e?.fallback).toBe(true);
  });

  it("includes all four booster packs with amount+energy", () => {
    for (const id of ["pocket", "starter", "popular", "max"]) {
      expect(
        APP_SETTINGS.find((x) => x.key === `booster.${id}.amount`),
      ).toBeDefined();
      expect(
        APP_SETTINGS.find((x) => x.key === `booster.${id}.energy`),
      ).toBeDefined();
    }
  });
});
