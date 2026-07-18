import { describe, expect, test } from "vitest";

import { generateDiff } from "./diff";

describe("generateDiff", () => {
  test("returns all normal lines when content is unchanged", () => {
    const diff = generateDiff("a\nb\nc", "a\nb\nc");
    expect(diff.every((line) => line.type === "normal")).toBe(true);
  });

  test("detects an added line", () => {
    const diff = generateDiff("a\nb", "a\nb\nc");
    expect(diff.at(-1)).toEqual({ text: "c", type: "add" });
  });

  test("detects a deleted line", () => {
    const diff = generateDiff("a\nb\nc", "a\nc");
    expect(diff).toContainEqual({ text: "b", type: "delete" });
  });

  test("detects a replaced line as delete+add", () => {
    const diff = generateDiff("hello world", "hello there");
    expect(diff).toContainEqual({ text: "hello world", type: "delete" });
    expect(diff).toContainEqual({ text: "hello there", type: "add" });
  });
});
