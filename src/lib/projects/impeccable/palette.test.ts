import { describe, expect, it } from "vitest";

import { generatePaletteInMemory } from "./palette";

describe("generatePaletteInMemory", () => {
  it("resolves monochrome seed when explicit color hint requested", async () => {
    const palette = await generatePaletteInMemory("minimalis hitam putih");
    expect(palette.seed).toBe("#09090b");
    expect(palette.mood).toContain("monochrome");
  });

  it("resolves warm coffee seed when coffee keywords present", async () => {
    const palette = await generatePaletteInMemory("kedai kopi espresso");
    expect(palette.seed).toBe("#7c2d12");
    expect(palette.mood).toContain("espresso");
  });

  it("generates deterministic fallback seed from business name", async () => {
    const palette = await generatePaletteInMemory("Warung Bakso Pak Kumis");
    expect(palette.seed).toBeDefined();
    expect(palette.mood).toBeDefined();
  });
});
