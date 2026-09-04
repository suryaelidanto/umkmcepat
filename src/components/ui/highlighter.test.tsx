import { describe, expect, it } from "vitest";

import { Highlighter } from "./highlighter";

describe("Highlighter", () => {
  it("exports a valid component function", () => {
    expect(typeof Highlighter).toBe("function");
  });
});
