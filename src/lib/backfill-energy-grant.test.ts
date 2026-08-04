import { describe, expect, it } from "vitest";

import { calculateBackfillAmount } from "../../scripts/backfill-energy-grant";

describe("calculateBackfillAmount", () => {
  it("reconciles an eligible user to 500k plus remaining paid energy", () => {
    expect(
      calculateBackfillAmount({
        currentBalance: 900_000,
        paidEnergy: 600_000,
        spentEnergy: 200_000,
        userId: "u1",
      }),
    ).toBe(0);
  });

  it("removes inflated historical test credit", () => {
    expect(
      calculateBackfillAmount({
        currentBalance: 2_000_000,
        paidEnergy: 0,
        spentEnergy: 100_000,
        userId: "u1",
      }),
    ).toBe(-1_500_000);
  });
});
