export function parseHexColor(
  hex: string,
): { r: number; g: number; b: number } | null {
  const raw = hex.trim().toLowerCase();
  if (raw === "white") {
    return { r: 255, g: 255, b: 255 };
  }
  if (raw === "black") {
    return { r: 0, g: 0, b: 0 };
  }
  const hex3 = /^#?([a-f\d])([a-f\d])([a-f\d])$/i.exec(raw);
  if (hex3) {
    return {
      r: parseInt(hex3[1] + hex3[1], 16),
      g: parseInt(hex3[2] + hex3[2], 16),
      b: parseInt(hex3[3] + hex3[3], 16),
    };
  }
  const hex6 = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(raw);
  if (hex6) {
    return {
      r: parseInt(hex6[1], 16),
      g: parseInt(hex6[2], 16),
      b: parseInt(hex6[3], 16),
    };
  }
  const rgb = /^rgba?\s*\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i.exec(
    raw,
  );
  if (rgb) {
    return {
      r: Math.min(255, parseInt(rgb[1], 10)),
      g: Math.min(255, parseInt(rgb[2], 10)),
      b: Math.min(255, parseInt(rgb[3], 10)),
    };
  }
  return parseOklchColor(raw);
}

function parseOklchColor(
  value: string,
): { r: number; g: number; b: number } | null {
  const match =
    /^oklch\(\s*([+-]?(?:\d+\.?\d*|\.\d+)%?)\s+([+-]?(?:\d+\.?\d*|\.\d+)%?)\s+([+-]?(?:\d+\.?\d*|\.\d+))(?:deg)?(?:\s*\/\s*[^)]+)?\s*\)$/iu.exec(
      value,
    );
  if (!match) {
    return null;
  }
  const lightness = toOklchLightness(match[1]);
  const chroma = toOklchChroma(match[2]);
  const hue = Number(match[3]);
  if (
    lightness === null ||
    chroma === null ||
    !Number.isFinite(hue) ||
    lightness < 0 ||
    lightness > 1 ||
    chroma < 0
  ) {
    return null;
  }
  return oklabToSrgb(lightness, chroma, (hue * Math.PI) / 180);
}

function toOklchLightness(value: string): number | null {
  const numeric = Number(value.replace(/%$/u, ""));
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return value.endsWith("%") ? numeric / 100 : numeric;
}

function toOklchChroma(value: string): number | null {
  const numeric = Number(value.replace(/%$/u, ""));
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return value.endsWith("%") ? numeric / 100 : numeric;
}

function oklabToSrgb(
  lightness: number,
  chroma: number,
  hueRadians: number,
): { r: number; g: number; b: number } {
  const a = chroma * Math.cos(hueRadians);
  const b = chroma * Math.sin(hueRadians);
  const lPrime = lightness + 0.3963377774 * a + 0.2158037573 * b;
  const mPrime = lightness - 0.1055613458 * a - 0.0638541728 * b;
  const sPrime = lightness - 0.0894841775 * a - 1.291485548 * b;
  const l = lPrime ** 3;
  const m = mPrime ** 3;
  const s = sPrime ** 3;
  return {
    r: toSrgbChannel(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: toSrgbChannel(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: toSrgbChannel(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  };
}

function toSrgbChannel(linear: number): number {
  const clamped = Math.max(0, Math.min(1, linear));
  return Math.round(
    255 *
      (clamped <= 0.0031308
        ? 12.92 * clamped
        : 1.055 * clamped ** (1 / 2.4) - 0.055),
  );
}

export const GENERATED_FONT_STACKS = {
  "system-editorial":
    'Iowan Old Style, "Palatino Linotype", "Book Antiqua", Georgia, serif',
  "system-grotesk": '"Arial Nova", "Helvetica Neue", Arial, sans-serif',
  "system-humanist":
    "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif",
  "system-slab": 'Rockwell, "Roboto Slab", Georgia, serif',
} as const;

export type GeneratedFontStackId = keyof typeof GENERATED_FONT_STACKS;

export type GeneratedDesignSystemProposalV1 = {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  muted: string;
  mutedForeground: string;
  primary: string;
  primaryForeground: string;
  accent: string;
  accentForeground: string;
  border: string;
  ring: string;
  displayFontStackId: GeneratedFontStackId;
  bodyFontStackId: GeneratedFontStackId;
  radiusScale: "sharp" | "restrained" | "soft";
};

export type GeneratedContrastIssue = {
  pair: string;
  ratio: number;
  required: number;
};

export function getLuminance(hex: string): number {
  const c = parseHexColor(hex);
  return c ? relativeLuminance(c.r, c.g, c.b) : 0.5;
}

export function repairDesignSystemContrast(
  proposal: GeneratedDesignSystemProposalV1,
): GeneratedDesignSystemProposalV1 {
  const repaired = { ...proposal };
  if (!parseHexColor(repaired.background)) {
    repaired.background = "#f8fafc";
  }
  if (!parseHexColor(repaired.card)) {
    repaired.card = "#ffffff";
  }
  if (!parseHexColor(repaired.muted)) {
    repaired.muted = "#f1f5f9";
  }
  if (!parseHexColor(repaired.border)) {
    repaired.border = "#e2e8f0";
  }
  if (!parseHexColor(repaired.ring)) {
    repaired.ring = "#0369a1";
  }
  if (!parseHexColor(repaired.primary)) {
    repaired.primary = "#0f172a";
  }
  if (!parseHexColor(repaired.accent)) {
    repaired.accent = "#0369a1";
  }
  const bgL = getLuminance(repaired.background);
  if (contrastRatio(repaired.foreground, repaired.background) < 4.5) {
    repaired.foreground = bgL > 0.5 ? "#09090b" : "#f8fafc";
  }
  const cardL = getLuminance(repaired.card);
  if (contrastRatio(repaired.cardForeground, repaired.card) < 4.5) {
    repaired.cardForeground = cardL > 0.5 ? "#09090b" : "#f8fafc";
  }
  const mutedL = getLuminance(repaired.muted);
  if (contrastRatio(repaired.mutedForeground, repaired.muted) < 3.5) {
    repaired.mutedForeground = mutedL > 0.5 ? "#52525b" : "#a1a1aa";
  }
  if (contrastRatio(repaired.primary, repaired.background) < 2.5) {
    repaired.primary = bgL > 0.5 ? "#0f172a" : "#f1f5f9";
  }
  if (contrastRatio(repaired.primaryForeground, repaired.primary) < 4.5) {
    repaired.primaryForeground =
      getLuminance(repaired.primary) > 0.5 ? "#09090b" : "#ffffff";
  }
  if (contrastRatio(repaired.accent, repaired.background) < 2.5) {
    repaired.accent = bgL > 0.5 ? "#0369a1" : "#38bdf8";
  }
  if (contrastRatio(repaired.accentForeground, repaired.accent) < 4.5) {
    repaired.accentForeground =
      getLuminance(repaired.accent) > 0.5 ? "#09090b" : "#ffffff";
  }
  return repaired;
}

export type GeneratedDesignSystemResult =
  | { ok: true; css: string; proposal: GeneratedDesignSystemProposalV1 }
  | { ok: false; issues: GeneratedContrastIssue[] };

function relativeLuminance(r: number, g: number, b: number): number {
  const a = [r, g, b].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

export function contrastRatio(hex1: string, hex2: string): number {
  const c1 = parseHexColor(hex1);
  const c2 = parseHexColor(hex2);
  if (!c1 || !c2) {
    return 1;
  }
  const l1 = relativeLuminance(c1.r, c1.g, c1.b);
  const l2 = relativeLuminance(c2.r, c2.g, c2.b);
  const brighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (brighter + 0.05) / (darker + 0.05);
}

export function compileGeneratedDesignSystem(
  proposal: GeneratedDesignSystemProposalV1,
): GeneratedDesignSystemResult {
  const issues: GeneratedContrastIssue[] = [];

  const checks = [
    {
      pair: "background/foreground",
      fg: proposal.foreground,
      bg: proposal.background,
      required: 4.5,
    },
    {
      pair: "card/cardForeground",
      fg: proposal.cardForeground,
      bg: proposal.card,
      required: 4.5,
    },
    {
      pair: "muted/mutedForeground",
      fg: proposal.mutedForeground,
      bg: proposal.muted,
      required: 3.5,
    },
    {
      pair: "primary/primaryForeground",
      fg: proposal.primaryForeground,
      bg: proposal.primary,
      required: 4.5,
    },
    {
      pair: "accent/accentForeground",
      fg: proposal.accentForeground,
      bg: proposal.accent,
      required: 4.5,
    },
    {
      pair: "background/accent",
      fg: proposal.accent,
      bg: proposal.background,
      required: 2.5,
    },
  ];

  for (const check of checks) {
    const ratio = contrastRatio(check.fg, check.bg);
    if (ratio < check.required) {
      issues.push({ pair: check.pair, ratio, required: check.required });
    }
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  const radiusMap = {
    restrained: "0.5rem",
    sharp: "0.125rem",
    soft: "0.875rem",
  };

  const displayFont =
    GENERATED_FONT_STACKS[proposal.displayFontStackId] ||
    GENERATED_FONT_STACKS["system-humanist"];
  const bodyFont =
    GENERATED_FONT_STACKS[proposal.bodyFontStackId] ||
    GENERATED_FONT_STACKS["system-humanist"];

  const css = `@import "tailwindcss";
@source "../src";

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --font-display: var(--site-font-display);
  --font-body: var(--site-font-body);
  --radius-lg: var(--radius);
  --radius-md: calc(var(--radius) - 2px);
  --radius-sm: calc(var(--radius) - 4px);
}

:root {
  --background: ${proposal.background};
  --foreground: ${proposal.foreground};
  --card: ${proposal.card};
  --card-foreground: ${proposal.cardForeground};
  --popover: ${proposal.card};
  --popover-foreground: ${proposal.cardForeground};
  --primary: ${proposal.primary};
  --primary-foreground: ${proposal.primaryForeground};
  --secondary: ${proposal.muted};
  --secondary-foreground: ${proposal.foreground};
  --muted: ${proposal.muted};
  --muted-foreground: ${proposal.mutedForeground};
  --accent: ${proposal.accent};
  --accent-foreground: ${proposal.accentForeground};
  --destructive: #dc2626;
  --destructive-foreground: #ffffff;
  --border: ${proposal.border};
  --input: ${proposal.border};
  --ring: ${proposal.ring};
  --radius: ${radiusMap[proposal.radiusScale] ?? "0.5rem"};
  --site-font-display: ${displayFont};
  --site-font-body: ${bodyFont};
}

@layer base {
  * { @apply border-border outline-ring/50; }
  html {
    scroll-behavior: smooth;
    scroll-padding-top: 5rem;
  }
  html, body { overflow-x: clip; }
  body { @apply bg-background text-foreground font-body; }
}

@media (prefers-reduced-motion: reduce) {
  html {
    scroll-behavior: auto;
  }
}
`;

  return { ok: true, css, proposal };
}
