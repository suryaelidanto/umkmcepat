import { describe, expect, it } from "vitest";

import { resolveGenerateMode } from "./resolve-generate-mode";

describe("resolveGenerateMode", () => {
  it("uses first_generate when no source exists even if client asks retry_build", () => {
    expect(
      resolveGenerateMode({
        requestedMode: "retry_build",
        hasPersistedSource: false,
      }),
    ).toBe("first_generate");
  });

  it("keeps retry_build when source exists and client asks retry", () => {
    expect(
      resolveGenerateMode({
        requestedMode: "retry_build",
        hasPersistedSource: true,
      }),
    ).toBe("retry_build");
  });

  it("keeps first_generate when client asks first_generate even if source exists", () => {
    expect(
      resolveGenerateMode({
        requestedMode: "first_generate",
        hasPersistedSource: true,
      }),
    ).toBe("first_generate");
  });

  it("defaults missing request to first_generate without source", () => {
    expect(
      resolveGenerateMode({
        requestedMode: undefined,
        hasPersistedSource: false,
      }),
    ).toBe("first_generate");
  });

  it("defaults unknown request to first_generate", () => {
    expect(
      resolveGenerateMode({
        requestedMode: "nope",
        hasPersistedSource: true,
      }),
    ).toBe("first_generate");
  });
});
