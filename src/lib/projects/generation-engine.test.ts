import { describe, expect, it } from "vitest";

import { resolveGenerationEngine } from "./generation-engine";

describe("resolveGenerationEngine", () => {
  it("always resolves to contract (legacy engine removed)", () => {
    expect(resolveGenerationEngine()).toBe("contract");
  });
});
