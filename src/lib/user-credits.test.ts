import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveModelPricingMock,
  prismaQueryRawMock,
  prismaExecuteRawMock,
  prismaTransactionMock,
  prismaAppSettingMock,
} = vi.hoisted(() => {
  const store = new Map<string, unknown>();
  return {
    resolveModelPricingMock: vi.fn(),
    prismaQueryRawMock: vi.fn(),
    prismaExecuteRawMock: vi.fn(),
    prismaTransactionMock: vi.fn(async (callback) =>
      callback({
        $queryRaw: prismaQueryRawMock,
        $executeRaw: prismaExecuteRawMock,
      }),
    ),
    prismaAppSettingMock: {
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
  };
});

vi.mock("@/lib/model-pricing", () => ({
  resolveModelPricing: resolveModelPricingMock,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $executeRaw: prismaExecuteRawMock,
    $queryRaw: prismaQueryRawMock,
    $transaction: prismaTransactionMock,
    appSetting: prismaAppSettingMock,
  },
}));

import {
  calculateEnergyCost,
  chargeEnergyForAiUsage,
  chargeEnergyForStep,
  getEnergyConfig,
  grantSignupEnergy,
  getProjectLimit,
} from "./user-credits";

import { invalidateSettingCache, primeSettingCache } from "@/lib/app-settings";

describe("user-credits energy cost formula", () => {
  beforeEach(() => {
    resolveModelPricingMock.mockReset();
    resolveModelPricingMock.mockResolvedValue({
      rawModelId: "m1",
      pricedModelId: "minimax/minimax-m3",
      pricingSource: "catalog",
      promptPrice: 0.0000003, // $0.30 / 1M
      completionPrice: 0.0000012, // $1.20 / 1M
    });
  });

  it("prices input and output with real model rates", async () => {
    // 1000 input * 0.0000003 + 500 output * 0.0000012 = 0.0003 + 0.0006 = 0.0009 USD
    // * 1_000_000 = 900 energy
    await expect(
      calculateEnergyCost("minimax/minimax-m3", 1000, 500),
    ).resolves.toBe(900);
  });

  it("floors and clamps negative values", async () => {
    await expect(calculateEnergyCost("x", -5, 3.9)).resolves.toBe(4); // 3 * 0.0000012 * 1e6 = 3.6 → 4
    await expect(calculateEnergyCost("x", 2.8, -1)).resolves.toBe(1); // 2 * 0.0000003 * 1e6 = 0.6 → 1
  });

  it("uses a one-time 500k signup grant", () => {
    const config = getEnergyConfig();
    expect(config.signupGrant).toBe(500_000);
    expect(config.minDiscuss).toBeLessThan(config.minEdit);
    expect(config.minEdit).toBeLessThan(config.minBuild);
  });
});

describe("grantSignupEnergy", () => {
  beforeEach(() => {
    prismaExecuteRawMock.mockReset();
    prismaExecuteRawMock.mockResolvedValue(1);
  });

  it("grants 500k exactly once through the database constraint", async () => {
    await expect(grantSignupEnergy("u1")).resolves.toBe(true);
    expect(prismaExecuteRawMock).toHaveBeenCalledTimes(1);
    const sql = String(prismaExecuteRawMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain('"UserCredit"');
    expect(sql).toContain("ON CONFLICT DO NOTHING");
  });

  it("writes through a supplied transaction client", async () => {
    const transactionExecuteRawMock = vi.fn().mockResolvedValue(1);
    const transactionClient = {
      $executeRaw: transactionExecuteRawMock,
    };

    await expect(
      grantSignupEnergy("u-transaction", transactionClient),
    ).resolves.toBe(true);

    expect(transactionExecuteRawMock).toHaveBeenCalledTimes(1);
    expect(prismaExecuteRawMock).not.toHaveBeenCalled();
  });
});

describe("chargeEnergyForAiUsage", () => {
  beforeEach(() => {
    resolveModelPricingMock.mockReset();
    resolveModelPricingMock.mockResolvedValue({
      rawModelId: "m1",
      pricedModelId: "minimax/minimax-m3",
      pricingSource: "catalog",
      promptPrice: 0.0000003,
      completionPrice: 0.0000012,
    });
    prismaQueryRawMock.mockReset();
    prismaQueryRawMock.mockResolvedValue([{ used: 0 }]);
    prismaExecuteRawMock.mockReset();
    prismaExecuteRawMock.mockResolvedValue(1);
  });

  it("skips when both token counts are zero", async () => {
    await expect(
      chargeEnergyForAiUsage({
        userId: "u1",
        modelId: "minimax/minimax-m3",
        inputTokens: 0,
        outputTokens: 0,
        reason: "test",
      }),
    ).resolves.toBeNull();
    expect(resolveModelPricingMock).not.toHaveBeenCalled();
  });

  it("charges when AI usage exists", async () => {
    const result = await chargeEnergyForAiUsage({
      userId: "u1",
      modelId: "minimax/minimax-m3",
      inputTokens: 1000,
      outputTokens: 500,
      reason: "test",
    });
    expect(result?.energyUsed).toBe(900);
    expect(resolveModelPricingMock).toHaveBeenCalled();
  });

  it("writes pricing proof into debit rows", async () => {
    prismaQueryRawMock.mockResolvedValue([{ used: 0 }]);
    resolveModelPricingMock.mockResolvedValue({
      rawModelId: "cmc/MiniMaxAI/MiniMax-M3",
      pricedModelId: "minimax/minimax-m3",
      pricingSource: "catalog",
      promptPrice: 0.0000003,
      completionPrice: 0.0000012,
    });

    await chargeEnergyForAiUsage({
      userId: "u1",
      modelId: "cmc/MiniMaxAI/MiniMax-M3",
      inputTokens: 1000,
      outputTokens: 500,
      reason: "build:step",
      projectId: "p1",
    });

    const insertSql = String(prismaExecuteRawMock.mock.calls.at(-1)?.[0] ?? "");
    expect(insertSql).toContain('"rawModelId"');
    expect(insertSql).toContain('"pricedModelId"');
    expect(insertSql).toContain('"pricingSource"');
    expect(insertSql).toContain('"promptPrice"');
    expect(insertSql).toContain('"completionPrice"');
  });
});

describe("assertUnderProjectLimit", () => {
  const txQueryRawMock = vi.fn();
  const fakeTx = { $queryRaw: txQueryRawMock } as never;

  const originalLimit = process.env.PROJECT_LIMIT;

  beforeEach(() => {
    txQueryRawMock.mockReset();
    process.env.PROJECT_LIMIT = "3";
  });

  afterEach(() => {
    if (originalLimit === undefined) {
      delete process.env.PROJECT_LIMIT;
    } else {
      process.env.PROJECT_LIMIT = originalLimit;
    }
  });

  it("resolves with count and limit when under the limit", async () => {
    txQueryRawMock.mockResolvedValueOnce([{ count: 2 }]);

    const { assertUnderProjectLimit } = await import("./user-credits");

    await expect(assertUnderProjectLimit(fakeTx, "u1")).resolves.toEqual({
      count: 2,
      limit: 3,
    });
  });

  it("throws ProjectLimitExceededError when count equals the limit", async () => {
    txQueryRawMock.mockResolvedValue([{ count: 3 }]);

    const { ProjectLimitExceededError, assertUnderProjectLimit } =
      await import("./user-credits");

    await expect(assertUnderProjectLimit(fakeTx, "u1")).rejects.toBeInstanceOf(
      ProjectLimitExceededError,
    );
    await expect(assertUnderProjectLimit(fakeTx, "u1")).rejects.toMatchObject({
      count: 3,
      limit: 3,
      code: "project_limit_exceeded",
    });
  });

  it("throws when count is already over the limit (legacy users)", async () => {
    txQueryRawMock.mockResolvedValueOnce([{ count: 5 }]);

    const { ProjectLimitExceededError, assertUnderProjectLimit } =
      await import("./user-credits");

    await expect(assertUnderProjectLimit(fakeTx, "u1")).rejects.toBeInstanceOf(
      ProjectLimitExceededError,
    );
  });

  it("treats a zero/null COUNT result as 0 (defensive)", async () => {
    txQueryRawMock.mockResolvedValueOnce([]);

    const { assertUnderProjectLimit } = await import("./user-credits");

    await expect(assertUnderProjectLimit(fakeTx, "u1")).resolves.toEqual({
      count: 0,
      limit: 3,
    });
  });
});

describe("chargeEnergyForStep", () => {
  beforeEach(() => {
    resolveModelPricingMock.mockReset();
    resolveModelPricingMock.mockResolvedValue({
      rawModelId: "m1",
      pricedModelId: "minimax/minimax-m3",
      pricingSource: "catalog",
      promptPrice: 0.0000003,
      completionPrice: 0.0000012,
    });
    prismaQueryRawMock.mockReset();
    prismaExecuteRawMock.mockReset();
    prismaExecuteRawMock.mockResolvedValue(1);
  });

  it("returns null and writes nothing when usage is zero", async () => {
    const result = await chargeEnergyForStep({
      userId: "u1",
      modelId: "m1",
      inputTokens: 0,
      outputTokens: 0,
      reason: "build:step",
    });

    expect(result).toBeNull();
    expect(prismaExecuteRawMock).not.toHaveBeenCalled();
  });

  it("charges and reports remaining balance", async () => {
    // First query: free energy used today. Later queries: balance stats.
    prismaQueryRawMock.mockResolvedValue([{ used: 0 }]);

    const result = await chargeEnergyForStep({
      userId: "u1",
      modelId: "m1",
      inputTokens: 1_000_000,
      outputTokens: 0,
      reason: "build:step",
      projectId: "p1",
    });

    // 1e6 input tokens * $0.0000003 = $0.30 -> 300_000 energy
    expect(result?.energyUsed).toBe(300_000);
    expect(typeof result?.remaining).toBe("number");
    expect(prismaExecuteRawMock).toHaveBeenCalled();
  });

  it("returns null instead of throwing when the ledger write fails", async () => {
    prismaQueryRawMock.mockResolvedValue([{ used: 0 }]);
    prismaExecuteRawMock.mockRejectedValue(new Error("db down"));

    const result = await chargeEnergyForStep({
      userId: "u1",
      modelId: "m1",
      inputTokens: 1000,
      outputTokens: 1000,
      reason: "build:step",
    });

    expect(result).toBeNull();
  });
});

describe("economics settings are DB-first", () => {
  afterEach(() => {
    invalidateSettingCache();
    delete process.env.PROJECT_LIMIT;
  });

  it("getProjectLimit prefers DB over env", async () => {
    const { prisma } = await import("@/lib/prisma");
    await prisma.appSetting.upsert({
      where: { key: "economics.project_limit" },
      create: {
        key: "economics.project_limit",
        category: "economics",
        value: 12,
      },
      update: { value: 12 },
    });
    process.env.PROJECT_LIMIT = "3";
    invalidateSettingCache();
    await primeSettingCache();

    expect(getProjectLimit()).toBe(12);
  });

  it("getProjectLimit falls back to the code default", () => {
    invalidateSettingCache();
    expect(getProjectLimit()).toBe(5);
  });

  it("getEnergyConfig reads the signup grant from the DB", async () => {
    const { prisma } = await import("@/lib/prisma");
    await prisma.appSetting.upsert({
      where: { key: "economics.signup_energy_grant" },
      create: {
        key: "economics.signup_energy_grant",
        category: "economics",
        value: 750_000,
      },
      update: { value: 750_000 },
    });
    invalidateSettingCache();
    await primeSettingCache();

    expect(getEnergyConfig().signupGrant).toBe(750_000);
  });

  it("getEnergyConfig returns code defaults with an empty DB", () => {
    invalidateSettingCache();
    const config = getEnergyConfig();
    expect(config.signupGrant).toBe(500_000);
    expect(config.minDiscuss).toBe(5_000);
    expect(config.minBuild).toBe(40_000);
    expect(config.minEdit).toBe(10_000);
    expect(config.minModeration).toBe(500);
  });
});
