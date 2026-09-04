import { describe, expect, it } from "vitest";

import { BeforeAfterSection } from "./BeforeAfterSection";

describe("BeforeAfterSection", () => {
  it("exports a valid component function", () => {
    expect(typeof BeforeAfterSection).toBe("function");
  });
});
