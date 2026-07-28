import { describe, expect, it } from "vitest";

import { validateSettingValue } from "@/routes/api.admin.settings";

describe("validateSettingValue", () => {
  it("accepts an in-range number", () => {
    expect(
      validateSettingValue("ratelimit.ai_ip.requests", 20, "rate_limit"),
    ).toBeNull();
  });

  it("rejects a number below min", () => {
    expect(
      validateSettingValue("ratelimit.ai_ip.requests", 0, "rate_limit"),
    ).toMatch(/must be between/);
  });

  it("rejects a number above max", () => {
    expect(
      validateSettingValue("ratelimit.ai_ip.requests", 999_999, "rate_limit"),
    ).toMatch(/must be between/);
  });

  it("rejects a key from the wrong category", () => {
    expect(validateSettingValue("ratelimit.ai_ip.requests", 20, "ai")).toMatch(
      /Invalid key/,
    );
  });

  it("rejects an unknown key", () => {
    expect(validateSettingValue("nope.nope", 1, "ai")).toMatch(/Invalid key/);
  });

  it("rejects a wrong-typed value", () => {
    expect(
      validateSettingValue("feature.streamer_mode", 1, "feature_flag"),
    ).toMatch(/must be a boolean/);
  });
});
