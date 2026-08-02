import { afterEach, describe, expect, it, vi } from "vitest";

import { DISCUSS_CARD_SERVER_DEADLINE_MS, getAiTimeoutMs } from "./ai-timeouts";

import { invalidateSettingCache } from "@/lib/app-settings";

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

afterEach(async () => {
  delete process.env.AI_TIMEOUT_DISCUSS_CARD_MS;
  const { prisma } = await import("@/lib/prisma");
  await prisma.appSetting
    .delete({ where: { key: "ai.timeout.discuss_ms" } })
    .catch(() => {});
});

describe("discuss card timeout", () => {
  it("uses 45s per attempt with 45s deadline after one semantic repair", () => {
    expect(getAiTimeoutMs("discussCard")).toBe(45_000);
    expect(DISCUSS_CARD_SERVER_DEADLINE_MS).toBe(45_000);
  });

  it("allows environment overrides up to the maxMs cap", () => {
    process.env.AI_TIMEOUT_DISCUSS_CARD_MS = "60000";

    expect(getAiTimeoutMs("discussCard")).toBe(60_000);
  });
});

describe("getAiTimeoutMs DB-first", () => {
  afterEach(() => {
    invalidateSettingCache();
    delete process.env.AI_TIMEOUT_DISCUSS_MS;
  });

  it("prefers the DB value over env", async () => {
    const { prisma } = await import("@/lib/prisma");
    await prisma.appSetting.upsert({
      where: { key: "ai.timeout.discuss_ms" },
      create: {
        key: "ai.timeout.discuss_ms",
        category: "ai",
        value: 45_000,
      },
      update: { value: 45_000 },
    });
    process.env.AI_TIMEOUT_DISCUSS_MS = "120000";
    invalidateSettingCache();
    const { primeSettingCache } = await import("@/lib/app-settings");
    await primeSettingCache();

    expect(getAiTimeoutMs("discuss")).toBe(45_000);
  });

  it("clamps an out-of-range DB value", async () => {
    const { prisma } = await import("@/lib/prisma");
    await prisma.appSetting.upsert({
      where: { key: "ai.timeout.discuss_ms" },
      create: {
        key: "ai.timeout.discuss_ms",
        category: "ai",
        value: 999_999,
      },
      update: { value: 999_999 },
    });
    invalidateSettingCache();
    const { primeSettingCache } = await import("@/lib/app-settings");
    await primeSettingCache();

    expect(getAiTimeoutMs("discuss")).toBe(180_000);
  });

  it("falls back to the default when neither DB nor env is set", () => {
    invalidateSettingCache();
    expect(getAiTimeoutMs("discuss")).toBe(90_000);
  });
});
