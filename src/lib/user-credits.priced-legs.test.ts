import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { addEnergyUsageLegs } from "./user-credits";

describe("addEnergyUsageLegs", () => {
  beforeEach(() => {
    resolveModelPricingMock.mockReset();
    prismaQueryRawMock.mockReset();
    prismaQueryRawMock.mockResolvedValue([{ used: 0 }]);
    prismaExecuteRawMock.mockReset();
    prismaExecuteRawMock.mockResolvedValue(1);
  });

  it("prices each leg at its own model and sums energy into one debit", async () => {
    // modelA: prompt 1e-6, completion 2e-6
    // modelB: prompt 3e-6, completion 4e-6
    // legA = 1000*1e-6 + 500*2e-6 = 0.001 + 0.001 = 0.002 USD = 2000 energy
    // legB = 2000*3e-6 + 250*4e-6 = 0.006 + 0.001 = 0.007 USD = 7000 energy
    // total = 9000 energy (NOT winner-priced at one model for all tokens)
    resolveModelPricingMock
      .mockResolvedValueOnce({
        rawModelId: "modelA",
        pricedModelId: "modelA",
        pricingSource: "manual-override",
        promptPrice: 0.000001,
        completionPrice: 0.000002,
      })
      .mockResolvedValueOnce({
        rawModelId: "modelB",
        pricedModelId: "modelB",
        pricingSource: "manual-override",
        promptPrice: 0.000003,
        completionPrice: 0.000004,
      })
      .mockResolvedValue({
        rawModelId: "modelB",
        pricedModelId: "modelB",
        pricingSource: "manual-override",
        promptPrice: 0.000003,
        completionPrice: 0.000004,
      });

    const result = await addEnergyUsageLegs(
      "u1",
      [
        { modelId: "modelA", inputTokens: 1000, outputTokens: 500 },
        { modelId: "modelB", inputTokens: 2000, outputTokens: 250 },
      ],
      "discuss:step",
      { projectId: "p1" },
    );

    expect(result?.energyUsed).toBe(9000);
    expect(result?.inputTokens).toBe(3000);
    expect(result?.outputTokens).toBe(750);
  });

  it("returns null when all legs have zero tokens", async () => {
    await expect(
      addEnergyUsageLegs(
        "u1",
        [
          { modelId: "a", inputTokens: 0, outputTokens: 0 },
          { modelId: "b", inputTokens: 0, outputTokens: 0 },
        ],
        "discuss:step",
      ),
    ).resolves.toEqual({ energyUsed: 0, inputTokens: 0, outputTokens: 0 });
    expect(resolveModelPricingMock).not.toHaveBeenCalled();
  });
});
