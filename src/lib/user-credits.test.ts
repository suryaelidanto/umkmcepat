import { beforeEach, describe, expect, it, vi } from "vitest";

const { getModelPricingMock } = vi.hoisted(() => ({
  getModelPricingMock: vi.fn(),
}));

vi.mock("@/lib/model-pricing", () => ({
  getModelPricing: getModelPricingMock,
}));

import {
  calculateEnergyCost,
  chargeEnergyForAiUsage,
  DAILY_ENERGY_LIMIT,
  getDayBoundaries,
  isDevUnlimitedEnergyEnabled,
  MIN_ENERGY_BUILD,
  MIN_ENERGY_DISCUSS,
  MIN_ENERGY_EDIT,
  setDevUnlimitedEnergy,
} from "./user-credits";

describe("user-credits energy cost formula", () => {
  beforeEach(() => {
    getModelPricingMock.mockReset();
    getModelPricingMock.mockResolvedValue({
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

  it("uses token-scale daily limits", () => {
    expect(DAILY_ENERGY_LIMIT).toBe(250_000);
    expect(MIN_ENERGY_DISCUSS).toBeLessThan(MIN_ENERGY_EDIT);
    expect(MIN_ENERGY_EDIT).toBeLessThan(MIN_ENERGY_BUILD);
  });

  it("uses Asia/Jakarta day boundaries", () => {
    // 2026-07-15 01:30 UTC = 08:30 WIB → same WIB day
    const morning = getDayBoundaries(new Date("2026-07-15T01:30:00.000Z"));
    expect(morning.startOfDay.toISOString()).toBe("2026-07-14T17:00:00.000Z");
    expect(morning.endOfDay.toISOString()).toBe("2026-07-15T17:00:00.000Z");

    // 2026-07-14 17:30 UTC = 00:30 WIB next day
    const afterMidnightWib = getDayBoundaries(
      new Date("2026-07-14T17:30:00.000Z"),
    );
    expect(afterMidnightWib.startOfDay.toISOString()).toBe(
      "2026-07-14T17:00:00.000Z",
    );
  });
});

describe("dev unlimited energy toggle", () => {
  it("defaults to off and only flips via explicit toggle", () => {
    setDevUnlimitedEnergy(false);
    expect(isDevUnlimitedEnergyEnabled()).toBe(false);

    setDevUnlimitedEnergy(true);
    expect(isDevUnlimitedEnergyEnabled()).toBe(true);

    setDevUnlimitedEnergy(false);
    expect(isDevUnlimitedEnergyEnabled()).toBe(false);
  });
});

describe("chargeEnergyForAiUsage", () => {
  beforeEach(() => {
    getModelPricingMock.mockReset();
    getModelPricingMock.mockResolvedValue({
      promptPrice: 0.0000003,
      completionPrice: 0.0000012,
    });
    setDevUnlimitedEnergy(true);
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
    expect(getModelPricingMock).not.toHaveBeenCalled();
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
    expect(getModelPricingMock).toHaveBeenCalled();
  });
});
