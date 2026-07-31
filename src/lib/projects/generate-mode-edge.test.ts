import { describe, expect, it } from "vitest";

import { resolveGenerateMode } from "./resolve-generate-mode";

/**
 * Edge matrix (B3–B5): client/API mode resolution without network.
 */
describe("generate mode edge matrix", () => {
  it("B3: fail with no source → first_generate on retry request", () => {
    expect(
      resolveGenerateMode({
        requestedMode: "retry_build",
        hasPersistedSource: false,
      }),
    ).toBe("first_generate");
  });

  it("B4: fail with source → retry_build", () => {
    expect(
      resolveGenerateMode({
        requestedMode: "retry_build",
        hasPersistedSource: true,
      }),
    ).toBe("retry_build");
  });

  it("B5: lying client retry_build with empty source → first_generate", () => {
    expect(
      resolveGenerateMode({
        requestedMode: "retry_build",
        hasPersistedSource: false,
      }),
    ).toBe("first_generate");
  });

  it("failed status alone is not hasPersistedSource (client contract)", () => {
    // Client must not treat buildStatus===failed as source; only files/flag.
    const sourceFilesLength = 0;
    const runtimeHasPersistedSource = false;
    const hasPersistedSource =
      runtimeHasPersistedSource || sourceFilesLength > 0;
    expect(
      resolveGenerateMode({
        requestedMode: hasPersistedSource ? "retry_build" : "first_generate",
        hasPersistedSource,
      }),
    ).toBe("first_generate");
  });
});
