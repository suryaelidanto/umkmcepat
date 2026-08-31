import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(process.cwd(), "src");
const RETIRED_AUTHORITIES = [
  "hasMinimumBriefForBuild",
  "getBriefReadiness",
  "isBriefReadyForBuild",
  "evaluateDiscussReadiness",
  "REQUIRED_BRIEF_FIELDS",
];

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      return sourceFiles(path);
    }
    return /\.(ts|tsx)$/.test(entry) && !entry.endsWith(".test.ts")
      ? [path]
      : [];
  });
}

describe("canonical brief architecture", () => {
  it("has no competing brief-readiness authorities", () => {
    const violations = sourceFiles(ROOT).flatMap((path) => {
      const source = readFileSync(path, "utf8");
      return RETIRED_AUTHORITIES.filter((symbol) =>
        source.includes(symbol),
      ).map((symbol) => `${relative(process.cwd(), path)}: ${symbol}`);
    });

    expect(violations).toEqual([]);
  });

  it("does not read the mutable project brief after accepted handoff loading", () => {
    const worker = readFileSync(
      join(ROOT, "lib/projects/build-attempt-worker.ts"),
      "utf8",
    );
    const acceptedHandoffIndex = worker.indexOf(
      "loadAcceptedHandoffForAttempt",
    );
    const generationIndex = worker.indexOf("await runAgenticGenerate");
    const generationSlice = worker.slice(acceptedHandoffIndex, generationIndex);

    expect(acceptedHandoffIndex).toBeGreaterThanOrEqual(0);
    expect(generationIndex).toBeGreaterThan(acceptedHandoffIndex);
    expect(generationSlice).not.toContain("project.brief");
  });
});
