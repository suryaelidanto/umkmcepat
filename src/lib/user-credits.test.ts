import { describe, expect, it } from "vitest";

import {
  calculateEnergy,
  DAILY_ENERGY_LIMIT,
  getDayBoundaries,
  isDevUnlimitedEnergyEnabled,
  MIN_ENERGY_BUILD,
  MIN_ENERGY_DISCUSS,
  MIN_ENERGY_EDIT,
  setDevUnlimitedEnergy,
} from "./user-credits";

describe("user-credits energy formula", () => {
  it("weights output tokens 2x", () => {
    expect(calculateEnergy(100, 50)).toBe(200);
    expect(calculateEnergy(0, 10)).toBe(20);
    expect(calculateEnergy(10, 0)).toBe(10);
  });

  it("floors and clamps negative values", () => {
    expect(calculateEnergy(-5, 3.9)).toBe(6);
    expect(calculateEnergy(2.8, -1)).toBe(2);
  });

  it("uses token-scale daily limits", () => {
    expect(DAILY_ENERGY_LIMIT).toBe(200_000);
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
