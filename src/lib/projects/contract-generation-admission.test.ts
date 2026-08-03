import { describe, expect, it } from "vitest";

import {
  assertContractGenerationAdmitted,
  isContractAdmissionValue,
} from "./contract-generation-admission";

describe("assertContractGenerationAdmitted", () => {
  it("throws when contract-v1 execution is paused", () => {
    expect(() =>
      assertContractGenerationAdmitted({
        generationEngine: "contract-v1",
        admission: "paused",
      }),
    ).toThrow("contract generation is paused");
  });

  it("allows contract-v1 when admission is enabled", () => {
    expect(() =>
      assertContractGenerationAdmitted({
        generationEngine: "contract-v1",
        admission: "enabled",
      }),
    ).not.toThrow();
  });

  it("never blocks legacy-v1 even when admission is paused", () => {
    expect(() =>
      assertContractGenerationAdmitted({
        generationEngine: "legacy-v1",
        admission: "paused",
      }),
    ).not.toThrow();
  });
});

describe("isContractAdmissionValue", () => {
  it("accepts paused/enabled and rejects anything else", () => {
    expect(isContractAdmissionValue("paused")).toBe(true);
    expect(isContractAdmissionValue("enabled")).toBe(true);
    expect(isContractAdmissionValue("off")).toBe(false);
  });
});
