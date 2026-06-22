import { describe, expect, it } from "vitest";

import { PROJECT_REQUEST_MAX_LENGTH, validateProjectRequest } from "./input";

describe("project request input", () => {
  it("normalizes valid user requests", () => {
    expect(validateProjectRequest("  Saya   jual kopi susu  ")).toEqual({
      ok: true,
      value: "Saya jual kopi susu",
    });
  });

  it("rejects empty user requests", () => {
    expect(validateProjectRequest("   ")).toEqual({
      ok: false,
      message: "Tulis kebutuhan usahamu dulu.",
    });
  });

  it("rejects requests that are too long", () => {
    expect(
      validateProjectRequest("a".repeat(PROJECT_REQUEST_MAX_LENGTH + 1)),
    ).toEqual({
      ok: false,
      message: "Maksimal 1.200 karakter. Ringkas sedikit, ya.",
    });
  });
});
