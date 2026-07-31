import { beforeEach, describe, expect, it, vi } from "vitest";

const getSetting = vi.fn();

vi.mock("@/lib/app-settings", () => ({
  getSetting: (...args: unknown[]) => getSetting(...args),
}));

import { discountPercentFromPrices, listBoosterPacks } from "@/lib/mayar";

describe("discountPercentFromPrices", () => {
  it("returns percent off list price when compare-at is higher", () => {
    expect(discountPercentFromPrices(8900, 45000)).toBe(80);
  });

  it("returns 0 when there is no discount", () => {
    expect(discountPercentFromPrices(8900, 8900)).toBe(0);
    expect(discountPercentFromPrices(8900, 0)).toBe(0);
    expect(discountPercentFromPrices(10000, 5000)).toBe(0);
  });
});

describe("listBoosterPacks", () => {
  beforeEach(() => {
    getSetting.mockReset();
    getSetting.mockImplementation(async (key: string, fallback: number) => {
      if (key === "booster.starter.amount") {
        return 99_000;
      }
      if (key === "booster.starter.energy") {
        return 777_000;
      }
      if (key === "booster.starter.compare_at_amount") {
        return 150_000;
      }
      return fallback;
    });
  });

  it("resolves amount, compare-at, energy, and discount from settings", async () => {
    const packs = await listBoosterPacks();
    const starter = packs.find((p) => p.id === "starter");
    expect(starter).toMatchObject({
      amount: 99_000,
      compareAtAmount: 150_000,
      discountPercent: 34,
      energy: 777_000,
      id: "starter",
    });
    expect(packs).toHaveLength(4);
    expect(packs.map((p) => p.id).sort()).toEqual(
      ["max", "pocket", "popular", "starter"].sort(),
    );
  });
});
