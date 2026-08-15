import { describe, expect, it } from "vitest";

import { normalizeBlindPreferencesV2 } from "./generation-evaluation-blind";

describe("normalizeBlindPreferencesV2", () => {
  const mapping = {
    mapping: {
      "case-1:1": { leftArm: "treatment", rightArm: "control" },
    },
  };

  it("maps relative choice and absolute A/B readiness through the private arm mapping", () => {
    expect(
      normalizeBlindPreferencesV2(
        {
          schemaVersion: 2,
          preferences: [
            {
              key: "case-1:1",
              choice: "left",
              leftReady: true,
              rightReady: false,
            },
          ],
        },
        mapping,
      ),
    ).toEqual([
      {
        briefId: "case-1",
        trial: 1,
        choice: "treatment",
        controlReady: false,
        treatmentReady: true,
      },
    ]);
  });

  it("drops malformed readiness and incomplete keys instead of inventing defaults", () => {
    expect(
      normalizeBlindPreferencesV2(
        {
          schemaVersion: 2,
          preferences: [
            { key: "case-1:1", choice: "left", leftReady: true },
            {
              key: "case-1:3",
              choice: "right",
              leftReady: true,
              rightReady: true,
            },
          ],
        },
        mapping,
      ),
    ).toEqual([]);
  });
});
