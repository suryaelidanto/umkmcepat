import { describe, expect, it } from "vitest";

import { TextAnimate } from "./text-animate";

describe("TextAnimate", () => {
  it("exports a valid component", () => {
    expect(typeof TextAnimate).toBe("object"); // memo component
  });
});
