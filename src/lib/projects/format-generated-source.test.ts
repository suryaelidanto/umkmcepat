import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { formatGeneratedSource } from "@/lib/projects/format-generated-source";

const dirs: string[] = [];

afterEach(() => {
  // temp dirs auto-cleaned by OS; no manual cleanup needed for the test.
});

function fixtureDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "fmt-gen-"));
  dirs.push(dir);
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), content);
  }
  return dir;
}

describe("formatGeneratedSource", () => {
  it("formats unformatted source files", async () => {
    const dir = fixtureDir({ "App.tsx": "const x=(  )=>1" });
    const result = await formatGeneratedSource(dir);
    expect(result.failed).toBe(false);
    expect(result.formatted).toBeGreaterThan(0);
  });

  it("isolates a parse failure (failed=true, never throws)", async () => {
    const dir = fixtureDir({ "bad.tsx": "const =( )=>" });
    const result = await formatGeneratedSource(dir);
    expect(result.failed).toBe(true);
  });

  it("skips unchanged files on the second run (cache)", async () => {
    const dir = fixtureDir({ "App.tsx": "const x = () => 1;\n" });
    await formatGeneratedSource(dir);
    const result = await formatGeneratedSource(dir);
    expect(result.formatted).toBe(0);
  });
});
