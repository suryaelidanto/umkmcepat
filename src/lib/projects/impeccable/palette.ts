import crypto from "node:crypto";
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

// Diverse fallback seeds across different business vibes
const VIBRANT_SEEDS = [
  { seed: "#1e3a8a", mood: "Deep corporate navy & clean modern trust" },
  { seed: "#047857", mood: "Fresh emerald artisan & organic craft" },
  { seed: "#7c2d12", mood: "Warm roasted espresso & earthy sanctuary" },
  { seed: "#4338ca", mood: "Electric indigo & contemporary tech streetwear" },
  { seed: "#0f766e", mood: "Teal botanical & tranquil apothecary" },
  { seed: "#be123c", mood: "Rich crimson & bold energetic retail" },
  { seed: "#854d0e", mood: "Warm amber honey & nostalgic artisanal bakery" },
  { seed: "#09090b", mood: "Ultra-clean monochrome & raw editorial minimal" },
];

function fallbackSeedFromKey(key?: string): { seed: string; mood: string } {
  if (!key) {
    return VIBRANT_SEEDS[0]!;
  }
  const hash = crypto.createHash("sha256").update(key).digest("hex");
  const index = parseInt(hash.slice(0, 8), 16) % VIBRANT_SEEDS.length;
  return VIBRANT_SEEDS[index]!;
}

function resolveColorHintSeed(
  key?: string,
): { seed: string; mood: string } | null {
  if (!key) {
    return null;
  }
  const lower = key.toLowerCase();
  if (
    lower.includes("hitam") ||
    lower.includes("monokrom") ||
    lower.includes("black") ||
    lower.includes("putih") ||
    lower.includes("grayscale")
  ) {
    return {
      seed: "#09090b",
      mood: "Ultra-clean monochrome & raw editorial minimal",
    };
  }
  if (
    lower.includes("kopi") ||
    lower.includes("coffee") ||
    lower.includes("espresso") ||
    lower.includes("cokelat") ||
    lower.includes("brown") ||
    lower.includes("roasted")
  ) {
    return {
      seed: "#7c2d12",
      mood: "Warm roasted espresso & earthy sanctuary",
    };
  }
  if (
    lower.includes("hijau") ||
    lower.includes("green") ||
    lower.includes("organik") ||
    lower.includes("matcha") ||
    lower.includes("botanical")
  ) {
    return { seed: "#047857", mood: "Fresh emerald artisan & organic craft" };
  }
  if (
    lower.includes("biru") ||
    lower.includes("blue") ||
    lower.includes("navy") ||
    lower.includes("laut")
  ) {
    return {
      seed: "#1e3a8a",
      mood: "Deep corporate navy & clean modern trust",
    };
  }
  if (
    lower.includes("merah") ||
    lower.includes("red") ||
    lower.includes("crimson") ||
    lower.includes("pedas") ||
    lower.includes("berani")
  ) {
    return { seed: "#be123c", mood: "Rich crimson & bold energetic retail" };
  }
  if (
    lower.includes("emas") ||
    lower.includes("gold") ||
    lower.includes("madu") ||
    lower.includes("honey") ||
    lower.includes("amber") ||
    lower.includes("kuning")
  ) {
    return {
      seed: "#854d0e",
      mood: "Warm amber honey & nostalgic artisanal bakery",
    };
  }
  if (
    lower.includes("ungu") ||
    lower.includes("purple") ||
    lower.includes("violet") ||
    lower.includes("indigo")
  ) {
    return {
      seed: "#4338ca",
      mood: "Electric indigo & contemporary tech streetwear",
    };
  }
  if (
    lower.includes("tosca") ||
    lower.includes("teal") ||
    lower.includes("cyan")
  ) {
    return { seed: "#0f766e", mood: "Teal botanical & tranquil apothecary" };
  }
  return null;
}

export async function generatePaletteInMemory(
  seedKey?: string,
): Promise<GeneratedPaletteResult> {
  const explicit = resolveColorHintSeed(seedKey);
  if (explicit) {
    return {
      seed: explicit.seed,
      mood: explicit.mood,
      formula: "OKLCH semantic palette ramp",
    };
  }

  try {
    const paletteModule = await import(pathToFileURL(PALETTE_SCRIPT_PATH).href);
    const { getPaletteSeed } = paletteModule;

    if (typeof getPaletteSeed === "function") {
      const result = getPaletteSeed(seedKey);
      const fallback = fallbackSeedFromKey(seedKey);
      return {
        seed: result?.seed || fallback.seed,
        mood: result?.mood || fallback.mood,
        formula: result?.formula || "OKLCH semantic palette ramp",
      };
    }
  } catch {
    // Fallback dynamic seed
  }

  const fallback = fallbackSeedFromKey(seedKey);
  return {
    seed: fallback.seed,
    mood: fallback.mood,
    formula: "OKLCH semantic palette ramp",
  };
}
