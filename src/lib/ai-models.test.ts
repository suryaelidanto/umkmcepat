import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_AI_MODEL, getDefaultAiModel } from "./ai-models";

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

describe("AI model config", () => {
  const previous = process.env.AI_MODELS;

  afterEach(() => {
    if (previous === undefined) {
      delete process.env.AI_MODELS;
    } else {
      process.env.AI_MODELS = previous;
    }
  });

  it("uses the first listed model as the default", () => {
    expect(getDefaultAiModel("fast, pro, flash")).toBe("fast");
  });

  it("uses a single model list value as the default", () => {
    expect(getDefaultAiModel("combo/umkmcepat-combo")).toBe(
      "combo/umkmcepat-combo",
    );
  });

  it("falls back to the platform combo when AI_MODELS is empty or unset", () => {
    delete process.env.AI_MODELS;
    expect(getDefaultAiModel("")).toBe(DEFAULT_AI_MODEL);
    expect(getDefaultAiModel(undefined)).toBe(DEFAULT_AI_MODEL);
  });
});

describe("getDefaultAiModel DB-first", () => {
  afterEach(async () => {
    invalidateSettingCache();
    delete process.env.AI_MODELS;
    const { prisma } = await import("@/lib/prisma");
    await prisma.appSetting
      .delete({
        where: { key: "ai.models_default" },
      })
      .catch(() => {});
  });

  it("prefers the DB value over env", async () => {
    const { prisma } = await import("@/lib/prisma");
    await prisma.appSetting.upsert({
      where: { key: "ai.models_default" },
      create: {
        key: "ai.models_default",
        category: "ai",
        value: "model-db-1, model-db-2",
      },
      update: { value: "model-db-1, model-db-2" },
    });
    process.env.AI_MODELS = "model-env-1, model-env-2";
    invalidateSettingCache();
    const { primeSettingCache } = await import("@/lib/app-settings");
    await primeSettingCache();

    expect(getDefaultAiModel()).toBe("model-db-1");
  });

  it("falls back to env when DB value is not set", async () => {
    process.env.AI_MODELS = "model-env-1, model-env-2";
    invalidateSettingCache();
    const { primeSettingCache } = await import("@/lib/app-settings");
    await primeSettingCache();

    expect(getDefaultAiModel()).toBe("model-env-1");
  });

  it("falls back to the default when neither DB nor env is set", () => {
    invalidateSettingCache();
    expect(getDefaultAiModel()).toBe(DEFAULT_AI_MODEL);
  });
});
