import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_AI_MODEL,
  getDefaultAiModel,
  getDiscussHedgeModels,
  getDiscussModel,
  getGenerationModel,
  getModerationModel,
} from "./ai-models";

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
    expect(getDefaultAiModel("combo/default-combo")).toBe(
      "combo/default-combo",
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

describe("task model getters", () => {
  afterEach(async () => {
    invalidateSettingCache();
    delete process.env.AI_MODELS;
    delete process.env.AI_MODEL_MODERATION;
    delete process.env.AI_MODEL_DISCUSS;
    delete process.env.AI_MODEL_BUILD;
    delete process.env.AI_GENERATION_MODEL;
    const { prisma } = await import("@/lib/prisma");
    for (const key of [
      "ai.models_default",
      "ai.model.moderation",
      "ai.model.discuss",
      "ai.model.build",
    ]) {
      await prisma.appSetting.delete({ where: { key } }).catch(() => {});
    }
  });

  it("falls through empty task to default then hardcode", async () => {
    invalidateSettingCache();
    const { primeSettingCache } = await import("@/lib/app-settings");
    await primeSettingCache();
    expect(getModerationModel()).toBe(DEFAULT_AI_MODEL);
    expect(getDiscussModel()).toBe(DEFAULT_AI_MODEL);
    expect(getGenerationModel()).toBe(DEFAULT_AI_MODEL);
  });

  it("prefers task env over default", async () => {
    process.env.AI_MODELS = "default-combo";
    process.env.AI_MODEL_MODERATION = "mod-combo";
    invalidateSettingCache();
    const { primeSettingCache } = await import("@/lib/app-settings");
    await primeSettingCache();
    expect(getModerationModel()).toBe("mod-combo");
    expect(getDiscussModel()).toBe("default-combo");
  });

  it("prefers task DB over task env", async () => {
    const { prisma } = await import("@/lib/prisma");
    await prisma.appSetting.upsert({
      where: { key: "ai.model.discuss" },
      create: {
        key: "ai.model.discuss",
        category: "ai",
        value: "discuss-db",
      },
      update: { value: "discuss-db" },
    });
    process.env.AI_MODEL_DISCUSS = "discuss-env";
    invalidateSettingCache();
    const { primeSettingCache } = await import("@/lib/app-settings");
    await primeSettingCache();
    expect(getDiscussModel()).toBe("discuss-db");
  });

  it("build prefers AI_MODEL_BUILD then AI_GENERATION_MODEL", async () => {
    process.env.AI_GENERATION_MODEL = "legacy-gen";
    invalidateSettingCache();
    const { primeSettingCache } = await import("@/lib/app-settings");
    await primeSettingCache();
    expect(getGenerationModel()).toBe("legacy-gen");

    process.env.AI_MODEL_BUILD = "build-new";
    expect(getGenerationModel()).toBe("build-new");
  });

  it("treats whitespace task value as unset", async () => {
    process.env.AI_MODEL_MODERATION = "   ";
    process.env.AI_MODELS = "default-combo";
    invalidateSettingCache();
    const { primeSettingCache } = await import("@/lib/app-settings");
    await primeSettingCache();
    expect(getModerationModel()).toBe("default-combo");
  });
});

describe("getDiscussHedgeModels", () => {
  afterEach(async () => {
    invalidateSettingCache();
    delete process.env.AI_MODEL_DISCUSS_HEDGE_2;
    delete process.env.AI_MODEL_DISCUSS_HEDGE_3;
    const { prisma } = await import("@/lib/prisma");
    for (const key of [
      "ai.model.discuss_hedge_2",
      "ai.model.discuss_hedge_3",
    ]) {
      await prisma.appSetting.delete({ where: { key } }).catch(() => {});
    }
  });

  it("returns empty when no hedge legs configured (hedge off)", async () => {
    invalidateSettingCache();
    const { primeSettingCache } = await import("@/lib/app-settings");
    await primeSettingCache();
    expect(getDiscussHedgeModels()).toEqual([]);
  });

  it("returns configured legs in stable env order", async () => {
    process.env.AI_MODEL_DISCUSS_HEDGE_2 = "discuss-combo-2";
    process.env.AI_MODEL_DISCUSS_HEDGE_3 = "discuss-combo-3";
    invalidateSettingCache();
    const { primeSettingCache } = await import("@/lib/app-settings");
    await primeSettingCache();
    expect(getDiscussHedgeModels()).toEqual([
      "discuss-combo-2",
      "discuss-combo-3",
    ]);
  });

  it("keeps order when only hedge 3 is set", async () => {
    process.env.AI_MODEL_DISCUSS_HEDGE_3 = "discuss-combo-3";
    invalidateSettingCache();
    const { primeSettingCache } = await import("@/lib/app-settings");
    await primeSettingCache();
    expect(getDiscussHedgeModels()).toEqual(["discuss-combo-3"]);
  });

  it("prefers DB values over env", async () => {
    const { prisma } = await import("@/lib/prisma");
    await prisma.appSetting.upsert({
      where: { key: "ai.model.discuss_hedge_2" },
      create: {
        key: "ai.model.discuss_hedge_2",
        category: "ai",
        value: "db-hedge-2",
      },
      update: { value: "db-hedge-2" },
    });
    process.env.AI_MODEL_DISCUSS_HEDGE_2 = "env-hedge-2";
    invalidateSettingCache();
    const { primeSettingCache } = await import("@/lib/app-settings");
    await primeSettingCache();
    expect(getDiscussHedgeModels()).toEqual(["db-hedge-2"]);
  });

  it("treats whitespace leg value as unset", async () => {
    process.env.AI_MODEL_DISCUSS_HEDGE_2 = "   ";
    invalidateSettingCache();
    const { primeSettingCache } = await import("@/lib/app-settings");
    await primeSettingCache();
    expect(getDiscussHedgeModels()).toEqual([]);
  });
});
