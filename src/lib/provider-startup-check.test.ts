import { afterEach, describe, expect, it } from "vitest";

import { assertProvidersForProduction } from "@/lib/provider-startup-check";

const original = { ...process.env };
afterEach(() => {
  process.env = { ...original };
});

describe("assertProvidersForProduction", () => {
  it("prod + key set -> no throw", () => {
    process.env.NODE_ENV = "production";
    process.env.RESEND_API_KEY = "re_x";
    expect(() => assertProvidersForProduction()).not.toThrow();
  });

  it("prod + missing RESEND -> throws naming it", () => {
    process.env.NODE_ENV = "production";
    process.env.RESEND_API_KEY = "";
    expect(() => assertProvidersForProduction()).toThrow(/RESEND_API_KEY/);
  });

  it("prod does not require OTP_SPACE_API_KEY", () => {
    process.env.NODE_ENV = "production";
    process.env.RESEND_API_KEY = "re_x";
    delete process.env.OTP_SPACE_API_KEY;
    expect(() => assertProvidersForProduction()).not.toThrow();
  });

  it("dev -> no-op even if keys missing", () => {
    process.env.NODE_ENV = "development";
    delete process.env.RESEND_API_KEY;
    expect(() => assertProvidersForProduction()).not.toThrow();
  });
});
