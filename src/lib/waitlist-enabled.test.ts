import { afterEach, describe, expect, it } from "vitest";

import { isWaitlistEnabled } from "@/lib/waitlist-enabled";

describe("isWaitlistEnabled", () => {
  const original = process.env.WAITLIST_ENABLED;
  afterEach(() => {
    if (original === undefined) {
      delete process.env.WAITLIST_ENABLED;
    } else {
      process.env.WAITLIST_ENABLED = original;
    }
  });

  it("returns true when set to 'true'", () => {
    process.env.WAITLIST_ENABLED = "true";
    expect(isWaitlistEnabled()).toBe(true);
  });

  it("returns false only when set to 'false' (case-insensitive)", () => {
    process.env.WAITLIST_ENABLED = "false";
    expect(isWaitlistEnabled()).toBe(false);
    process.env.WAITLIST_ENABLED = "FALSE";
    expect(isWaitlistEnabled()).toBe(false);
  });

  it("defaults true (fail-safe) when unset or invalid", () => {
    delete process.env.WAITLIST_ENABLED;
    expect(isWaitlistEnabled()).toBe(true);
    process.env.WAITLIST_ENABLED = "";
    expect(isWaitlistEnabled()).toBe(true);
    process.env.WAITLIST_ENABLED = "nope";
    expect(isWaitlistEnabled()).toBe(true);
  });
});
