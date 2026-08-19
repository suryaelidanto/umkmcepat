import { afterEach, describe, expect, it, vi } from "vitest";

// Mock prisma so getSetting's DB read returns nothing → env/fallback path.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    appSetting: {
      findUnique: vi.fn(async () => null),
    },
  },
}));

import { invalidateSettingCache } from "@/lib/config/app-settings";
import { isWaitlistEnabled } from "@/lib/waitlist/waitlist-enabled";

describe("isWaitlistEnabled", () => {
  const original = process.env.WAITLIST_ENABLED;
  afterEach(() => {
    if (original === undefined) {
      delete process.env.WAITLIST_ENABLED;
    } else {
      process.env.WAITLIST_ENABLED = original;
    }
    invalidateSettingCache();
  });

  it("returns true when set to 'true'", async () => {
    process.env.WAITLIST_ENABLED = "true";
    expect(await isWaitlistEnabled()).toBe(true);
  });

  it("returns false only when set to 'false' (case-insensitive)", async () => {
    process.env.WAITLIST_ENABLED = "false";
    expect(await isWaitlistEnabled()).toBe(false);
    process.env.WAITLIST_ENABLED = "FALSE";
    expect(await isWaitlistEnabled()).toBe(false);
  });

  it("defaults true (fail-safe) when unset or invalid", async () => {
    delete process.env.WAITLIST_ENABLED;
    expect(await isWaitlistEnabled()).toBe(true);
    process.env.WAITLIST_ENABLED = "";
    expect(await isWaitlistEnabled()).toBe(true);
    process.env.WAITLIST_ENABLED = "nope";
    expect(await isWaitlistEnabled()).toBe(true);
  });
});
