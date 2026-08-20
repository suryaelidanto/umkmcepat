import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  invalidateSettingCache,
  getSettingSync,
  primeSettingCache,
} from "@/lib/config/app-settings";

// getSetting is async + hits prisma; mock the client.
vi.mock("@/lib/prisma", () => {
  const store = new Map<string, unknown>();
  return {
    prisma: {
      appSetting: {
        findUnique: vi.fn(async ({ where }: { where: { key: string } }) =>
          store.has(where.key) ? { value: store.get(where.key) } : null,
        ),
        findMany: vi.fn(async () =>
          [...store.entries()].map(([key, value]) => ({ key, value })),
        ),
        upsert: vi.fn(
          async (args: {
            where: { key: string };
            create: { value: unknown };
          }) => {
            store.set(args.where.key, args.create.value);
            return { value: args.create.value };
          },
        ),
        delete: vi.fn(async ({ where }: { where: { key: string } }) => {
          store.delete(where.key);
          return null;
        }),
      },
    },
  };
});

describe("getSetting", () => {
  beforeEach(() => {
    invalidateSettingCache();
    delete process.env.FEATURE_DUMMY;
    delete process.env.WAITLIST_ENABLED;
  });

  // ponytail: brief imported afterEach but left the body empty; the mock's
  afterEach(async () => {
    const { prisma } = await import("@/lib/prisma");
    await prisma.appSetting.delete({
      where: { key: "feature.waitlist_enabled" },
    });
  });

  it("returns the DB row value when present and valid", async () => {
    const { prisma } = await import("@/lib/prisma");
    await prisma.appSetting.upsert({
      where: { key: "feature.waitlist_enabled" },
      create: {
        key: "feature.waitlist_enabled",
        category: "feature_flag",
        value: false,
      },
      update: { value: false },
    });
    const { getSetting } = await import("@/lib/config/app-settings");
    invalidateSettingCache();
    const v = await getSetting<boolean>("feature.waitlist_enabled", true);
    expect(v).toBe(false);
  });

  it("falls back to env when no DB row", async () => {
    process.env.WAITLIST_ENABLED = "false";
    const { getSetting } = await import("@/lib/config/app-settings");
    invalidateSettingCache();
    const v = await getSetting<boolean>("feature.waitlist_enabled", true);
    expect(v).toBe(false);
  });

  it("falls back to hardcoded default when no DB row and no env", async () => {
    const { getSetting } = await import("@/lib/config/app-settings");
    invalidateSettingCache();
    const v = await getSetting<boolean>("feature.waitlist_enabled", true);
    expect(v).toBe(true);
  });

  it("falls back gracefully when DB row has wrong type", async () => {
    const { prisma } = await import("@/lib/prisma");
    await prisma.appSetting.upsert({
      where: { key: "feature.waitlist_enabled" },
      create: {
        key: "feature.waitlist_enabled",
        category: "feature_flag",
        value: "not-a-bool",
      },
      update: { value: "not-a-bool" },
    });
    const { getSetting } = await import("@/lib/config/app-settings");
    invalidateSettingCache();
    const v = await getSetting<boolean>("feature.waitlist_enabled", true);
    expect(v).toBe(true);
  });
});

describe("getSettingSync", () => {
  it("returns fallback when cache cold", () => {
    invalidateSettingCache();
    expect(getSettingSync("feature.waitlist_enabled", true)).toBe(true);
  });
});

describe("primeSettingCache", () => {
  beforeEach(() => {
    invalidateSettingCache();
    vi.useRealTimers();
  });

  it("makes getSettingSync return the DB value", async () => {
    const { prisma } = await import("@/lib/prisma");
    await prisma.appSetting.upsert({
      where: { key: "feature.streamer_mode" },
      create: {
        key: "feature.streamer_mode",
        category: "feature_flag",
        value: false,
      },
      update: { value: false },
    });
    invalidateSettingCache();

    expect(getSettingSync("feature.streamer_mode", true)).toBe(true);
    await primeSettingCache();
    expect(getSettingSync("feature.streamer_mode", true)).toBe(false);
  });

  it("snapshot survives past the 5s TTL", async () => {
    const { prisma } = await import("@/lib/prisma");
    await prisma.appSetting.upsert({
      where: { key: "feature.streamer_mode" },
      create: {
        key: "feature.streamer_mode",
        category: "feature_flag",
        value: false,
      },
      update: { value: false },
    });
    invalidateSettingCache();
    await primeSettingCache();

    vi.useFakeTimers();
    vi.advanceTimersByTime(60_000);
    expect(getSettingSync("feature.streamer_mode", true)).toBe(false);
    vi.useRealTimers();
  });

  it("does not throw when the DB read fails", async () => {
    const { prisma } = await import("@/lib/prisma");
    const spy = vi
      .spyOn(prisma.appSetting, "findMany")
      .mockRejectedValueOnce(new Error("db down"));

    await expect(primeSettingCache()).resolves.toBeUndefined();
    expect(getSettingSync("feature.streamer_mode", true)).toBe(true);
    spy.mockRestore();
  });

  it("skips rows whose type does not match the registry", async () => {
    const { prisma } = await import("@/lib/prisma");
    await prisma.appSetting.upsert({
      where: { key: "feature.streamer_mode" },
      create: {
        key: "feature.streamer_mode",
        category: "feature_flag",
        value: "not-a-boolean",
      },
      update: { value: "not-a-boolean" },
    });
    invalidateSettingCache();
    await primeSettingCache();

    expect(getSettingSync("feature.streamer_mode", true)).toBe(true);
  });

  it("is single-flight across concurrent callers", async () => {
    const { prisma } = await import("@/lib/prisma");
    invalidateSettingCache();
    const spy = vi.spyOn(prisma.appSetting, "findMany");
    spy.mockClear();

    await Promise.all([
      primeSettingCache(),
      primeSettingCache(),
      primeSettingCache(),
    ]);

    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("re-primes after invalidateSettingCache", async () => {
    const { prisma } = await import("@/lib/prisma");
    await primeSettingCache();
    const spy = vi.spyOn(prisma.appSetting, "findMany");
    spy.mockClear();

    invalidateSettingCache();
    await primeSettingCache();

    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("after invalidate + prime, getSettingSync returns primed DB value", async () => {
    const { prisma } = await import("@/lib/prisma");
    await prisma.appSetting.upsert({
      where: { key: "economics.signup_energy_grant" },
      create: {
        key: "economics.signup_energy_grant",
        category: "economics",
        value: 999_000,
      },
      update: { value: 999_000 },
    });
    await primeSettingCache();
    expect(getSettingSync("economics.signup_energy_grant", 500_000)).toBe(
      999_000,
    );
    invalidateSettingCache();
    await primeSettingCache();
    expect(getSettingSync("economics.signup_energy_grant", 500_000)).toBe(
      999_000,
    );
  });

  it("force re-primes an already-primed snapshot", async () => {
    const { prisma } = await import("@/lib/prisma");
    await prisma.appSetting.upsert({
      where: { key: "feature.streamer_mode" },
      create: {
        key: "feature.streamer_mode",
        category: "feature_flag",
        value: true,
      },
      update: { value: true },
    });
    await primeSettingCache();
    expect(getSettingSync("feature.streamer_mode", false)).toBe(true);

    await prisma.appSetting.upsert({
      where: { key: "feature.streamer_mode" },
      create: {
        key: "feature.streamer_mode",
        category: "feature_flag",
        value: false,
      },
      update: { value: false },
    });
    await primeSettingCache({ force: true });
    expect(getSettingSync("feature.streamer_mode", true)).toBe(false);
  });
});

describe("runtime settings registry", () => {
  it("build concurrency and max containers do not require restart", async () => {
    const { findConfigEntry } =
      await import("@/lib/config/app-settings-registry");
    expect(
      findConfigEntry("runtime.build_concurrency")?.requiresRestart,
    ).toBeFalsy();
    expect(
      findConfigEntry("runtime.max_containers")?.requiresRestart,
    ).toBeFalsy();
  });
});
