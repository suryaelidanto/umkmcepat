import { prisma } from "@/lib/prisma";

export type HueFamily =
  | "red"
  | "orange"
  | "yellow"
  | "green"
  | "cyan"
  | "blue"
  | "purple"
  | "magenta"
  | "neutral";

const FAMILY_BY_HUE: Array<{ max: number; family: HueFamily }> = [
  { family: "red", max: 15 },
  { family: "orange", max: 50 },
  { family: "yellow", max: 70 },
  { family: "green", max: 165 },
  { family: "cyan", max: 200 },
  { family: "blue", max: 255 },
  { family: "purple", max: 290 },
  { family: "magenta", max: 345 },
  { family: "red", max: 361 },
];

export function classifyHueFamily(hex: string): HueFamily {
  const normalized = hex.trim().replace(/^#?/, "");
  const full =
    normalized.length === 3
      ? normalized
          .split("")
          .map((c) => c + c)
          .join("")
      : normalized;
  if (!/^[0-9a-f]{6}$/i.test(full)) {
    return "neutral";
  }
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max - min < 0.06) {
    return "neutral";
  }
  let hue: number;
  if (max === r) {
    hue = 60 * (((g - b) / (max - min)) % 6);
  } else if (max === g) {
    hue = 60 * ((b - r) / (max - min) + 2);
  } else {
    hue = 60 * ((r - g) / (max - min) + 4);
  }
  const degrees = (hue + 360) % 360;
  for (const entry of FAMILY_BY_HUE) {
    if (degrees < entry.max) {
      return entry.family;
    }
  }
  return "neutral";
}

export function buildHueDiversityPromptLine(families: string[]): string {
  if (families.length === 0) {
    return "";
  }
  return `\nRecent builds for this owner already used these hue families: ${families.join(", ")}. Pick a deliberately different direction unless the business brief genuinely calls for one of them.`;
}

export async function readRecentHueFamilies(
  userId: string,
  take = 12,
): Promise<string[]> {
  try {
    const rows = (await prisma.project.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take,
      select: { userId: true, siteSchema: true },
    })) as Array<{
      userId: string;
      siteSchema: { theme?: { accent?: unknown } } | null;
    }>;
    const families: string[] = [];
    for (const row of rows) {
      if (row.userId !== userId) {
        continue;
      }
      const accent = row.siteSchema?.theme?.accent;
      if (typeof accent !== "string") {
        continue;
      }
      const family = classifyHueFamily(accent);
      if (family !== "neutral" && !families.includes(family)) {
        families.push(family);
      }
    }
    return families;
  } catch {
    return [];
  }
}
