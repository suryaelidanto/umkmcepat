import { describe, expect, it } from "vitest";

import { ARCHETYPE_IDS, loadArchetypeGuide, loadArchetypeIndex } from "./index";

describe("archetype loader", () => {
  it("always exposes a generic fallback id", () => {
    expect(ARCHETYPE_IDS).toContain("generic");
  });

  it("loadArchetypeIndex returns non-empty text", () => {
    expect(loadArchetypeIndex().trim().length).toBeGreaterThan(0);
  });

  it("resolves every registered id to a non-empty doc", () => {
    for (const id of ARCHETYPE_IDS) {
      expect(loadArchetypeGuide(id).trim().length).toBeGreaterThan(0);
    }
  });

  it("falls back to generic for unknown ids", () => {
    const fallback = loadArchetypeGuide("generic");
    const unknown = loadArchetypeGuide("this-archetype-does-not-exist");
    expect(unknown).toBe(fallback);
  });

  it("falls back to generic for empty input", () => {
    expect(loadArchetypeGuide("")).toBe(loadArchetypeGuide("generic"));
  });
});
