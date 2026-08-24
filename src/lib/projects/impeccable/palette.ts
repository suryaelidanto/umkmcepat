import path from "node:path";
import { pathToFileURL } from "node:url";

export interface GeneratedPaletteResult {
  seed: string;
  mood: string;
  formula: string;
}

const PALETTE_SCRIPT_PATH = path.resolve(
  process.cwd(),
  "src/lib/projects/skills/impeccable/scripts/palette.mjs",
);

export async function generatePaletteInMemory(
  seedKey?: string,
): Promise<GeneratedPaletteResult> {
  try {
    const paletteModule = await import(pathToFileURL(PALETTE_SCRIPT_PATH).href);
    const { getPaletteSeed } = paletteModule;

    if (typeof getPaletteSeed === "function") {
      const result = getPaletteSeed(seedKey);
      return {
        seed: result.seed || "#f05a28",
        mood: result.mood || "Energetic, approachable Indonesian commerce",
        formula: result.formula || "OKLCH 5-role palette ramp",
      };
    }
  } catch {
    // Fallback safe seed
  }

  return {
    seed: "#f05a28",
    mood: "Warm & trustworthy commerce",
    formula: "OKLCH semantic palette",
  };
}
