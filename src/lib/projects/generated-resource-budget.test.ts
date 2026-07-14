import { describe, expect, it } from "vitest";

import {
  assertGeneratedResourceBudget,
  getGeneratedResourceUsage,
} from "@/lib/projects/generated-resource-budget";

describe("generated resource budget", () => {
  it("measures UTF-8 bytes and accepts bounded source", () => {
    const files = [
      { content: "halo", path: "src/a.ts" },
      { content: "kopi ☕", path: "src/b.ts" },
    ];

    expect(getGeneratedResourceUsage(files)).toEqual({
      fileCount: 2,
      largestFileBytes: Buffer.byteLength("kopi ☕"),
      totalBytes: Buffer.byteLength("halokopi ☕"),
    });
    expect(() => assertGeneratedResourceBudget(files, "source")).not.toThrow();
  });

  it("rejects per-file, aggregate, and file-count overflow", () => {
    expect(() =>
      assertGeneratedResourceBudget(
        [{ content: "x".repeat(256 * 1024 + 1), path: "src/large.ts" }],
        "source",
      ),
    ).toThrow("Generated source file exceeds 262144 bytes: src/large.ts");

    expect(() =>
      assertGeneratedResourceBudget(
        Array.from({ length: 101 }, (_, index) => ({
          content: "x",
          path: `src/${index}.ts`,
        })),
        "source",
      ),
    ).toThrow("Generated source exceeds 100 files.");
  });
});
