import { describe, expect, it } from "vitest";

import { resolveGenerateMode } from "./resolve-generate-mode";

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

  it("B1: first_generate with no source stays first_generate", () => {
    expect(
      resolveGenerateMode({
        requestedMode: "first_generate",
        hasPersistedSource: false,
      }),
    ).toBe("first_generate");
  });

  it("B2: first_generate with source stays first_generate (no silent demote)", () => {
    expect(
      resolveGenerateMode({
        requestedMode: "first_generate",
        hasPersistedSource: true,
      }),
    ).toBe("first_generate");
  });

  it("R-style: empty source + retry never leaves retry_build", () => {
    const mode = resolveGenerateMode({
      requestedMode: "retry_build",
      hasPersistedSource: false,
    });
    expect(mode).not.toBe("retry_build");
    expect(mode).toBe("first_generate");
  });
});
