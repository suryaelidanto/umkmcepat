import type { ProjectSiteSchema } from "@/lib/projects/site-schema";

export type ThemeContrastCheck = {
  role: string;
  foreground: string;
  background: string;
  ratio: number;
  minimum: number;
  pass: boolean;
};

export type CompiledShadcnTheme = {
  css: string;
  checks: ThemeContrastCheck[];
};

export type ShadcnThemeFontOptions = {
  fontDisplay?: string;
  fontBody?: string;
};

export function shadcnThemeCss(schema: ProjectSiteSchema): string {
  return compileShadcnTheme(schema).css;
}

export function compileShadcnTheme(
  schema: ProjectSiteSchema,
  options: ShadcnThemeFontOptions = {},
): CompiledShadcnTheme {
  const background = resolveReadableSurface(
    validHex(schema.theme.background),
    4.5,
  );
  const foreground = readable(schema.theme.foreground, background, 4.5);
  const muted = readableSurface(schema.theme.muted, foreground, background);
  const accent = resolveReadableSurface(
    validHex(schema.theme.accent),
    4.5,
    background,
  );
  const border = mix(foreground, "transparent", 12);
  const input = mix(foreground, "transparent", 20);
  const card = background;
  const popover = background;
  const primary = accent;
  const primaryForeground = bestReadable(accent, 4.5);
  const secondary = mix(foreground, background, 8);
  const secondaryForeground = foreground;
  const mutedForeground = readable(foreground, muted, 4.5);
  const accentForeground = bestReadable(accent, 4.5);
  const destructive = "#dc2626";
  const destructiveForeground = bestReadable(destructive, 4.5);
  const ring = bestRing(accent, background);
  const fontDisplay =
    options.fontDisplay ?? "ui-sans-serif, system-ui, sans-serif";
  const fontBody = options.fontBody ?? "ui-sans-serif, system-ui, sans-serif";

  const checks = [
    contrastCheck("foreground", foreground, background, 4.5),
    contrastCheck("muted-surface", foreground, muted, 4.5),
    contrastCheck("muted-foreground", mutedForeground, muted, 4.5),
    contrastCheck("primary-foreground", primaryForeground, primary, 4.5),
    contrastCheck("accent-foreground", accentForeground, accent, 4.5),
    contrastCheck("accent-as-text", accent, background, 4.5),
    contrastCheck(
      "destructive-foreground",
      destructiveForeground,
      destructive,
      4.5,
    ),
    contrastCheck("focus-ring", ring, background, 3),
  ];

  const css = `@import "tailwindcss";

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
  --background: ${background};
  --foreground: ${foreground};
  --card: ${card};
  --card-foreground: ${foreground};
  --popover: ${popover};
  --popover-foreground: ${foreground};
  --primary: ${primary};
  --primary-foreground: ${primaryForeground};
  --secondary: ${secondary};
  --secondary-foreground: ${secondaryForeground};
  --muted: ${muted};
  --muted-foreground: ${mutedForeground};
  --accent: ${accent};
  --accent-foreground: ${accentForeground};
  --destructive: ${destructive};
  --destructive-foreground: ${destructiveForeground};
  --border: ${border};
  --input: ${input};
  --ring: ${ring};
  --site-font-display: ${fontDisplay};
  --site-font-body: ${fontBody};
  --radius: 0.625rem;
}

@layer base {
  * {
    border-color: var(--border);
  }

  html {
    scroll-behavior: smooth;
  }

  body {
    background: var(--background);
    color: var(--foreground);
    font-family: var(--site-font-body);
  }
}

@media (prefers-reduced-motion: reduce) {
  html {
    scroll-behavior: auto;
  }
}
`;

  return { css, checks };
}

export function contrastRatio(foreground: string, background: string): number {
  const light = Math.max(
    luminance(validHex(foreground)),
    luminance(validHex(background)),
  );
  const dark = Math.min(
    luminance(validHex(foreground)),
    luminance(validHex(background)),
  );
  return (light + 0.05) / (dark + 0.05);
}

function contrastCheck(
  role: string,
  foreground: string,
  background: string,
  minimum: number,
): ThemeContrastCheck {
  const ratio = contrastRatio(foreground, background);
  return {
    role,
    foreground,
    background,
    ratio,
    minimum,
    pass: ratio >= minimum,
  };
}

function validHex(value: string): string {
  const normalized = value.trim();
  if (!/^#[0-9a-f]{6}$/i.test(normalized)) {
    throw new Error(`invalid generated theme color: ${value}`);
  }
  return normalized;
}

function readableSurface(
  preferred: string,
  foreground: string,
  background: string,
): string {
  const normalized = validHex(preferred);
  if (contrastRatio(foreground, normalized) >= 4.5) {
    return normalized;
  }
  const adjusted = blendHex(background, foreground, 8);
  return contrastRatio(foreground, adjusted) >= 4.5 ? adjusted : background;
}

function blendHex(base: string, overlay: string, percent: number): string {
  const baseChannels = [1, 3, 5].map((offset) =>
    Number.parseInt(base.slice(offset, offset + 2), 16),
  );
  const overlayChannels = [1, 3, 5].map((offset) =>
    Number.parseInt(overlay.slice(offset, offset + 2), 16),
  );
  const weight = percent / 100;
  const channels = baseChannels.map((channel, index) =>
    Math.round(channel + (overlayChannels[index] - channel) * weight),
  );
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function readable(
  preferred: string,
  background: string,
  minimum: number,
): string {
  const normalized = validHex(preferred);
  return contrastRatio(normalized, background) >= minimum
    ? normalized
    : bestReadable(background, minimum);
}

/**
 * A mid-tone surface can be too light for black text and too dark for white
 * text at the same time. The compiler owns semantic colors, so it keeps the
 * chosen hue and moves it the smallest deterministic step that admits readable
 * text — rather than failing an attempt over a legitimate brand colour.
 *
 * against, when given, adds a second constraint: the surface must also read
 * as text against that colour, not just admit black/white text on itself.
 * accent doubles as bare text (an accent-coloured eyebrow label) as well as
 * a button background, and those are different constraints — a saturated
 * mid-tone hue can easily admit black text on itself while still being too
 * close in luminance to a light page background to serve as text on it.
 * Reproduced live: a real theme's accent read at 2.15:1 as text against its
 * own background, well under the 4.5 a real eyebrow label needed.
 */
function resolveReadableSurface(
  surface: string,
  minimum: number,
  against?: string,
): string {
  const admits = (candidate: string) =>
    admitsReadableText(candidate, minimum) &&
    (!against || contrastRatio(candidate, against) >= minimum);
  if (admits(surface)) {
    return surface;
  }
  for (let percent = 1; percent < 100; percent += 1) {
    const darker = blendHex(surface, "#000000", percent);
    if (admits(darker)) {
      return darker;
    }
    const lighter = blendHex(surface, "#ffffff", percent);
    if (admits(lighter)) {
      return lighter;
    }
  }
  return "#000000";
}

function admitsReadableText(surface: string, minimum: number): boolean {
  return (
    Math.max(
      contrastRatio("#0c0c0c", surface),
      contrastRatio("#ffffff", surface),
    ) >= minimum
  );
}

function bestReadable(background: string, minimum: number): string {
  const black = "#0c0c0c";
  const white = "#ffffff";
  const blackRatio = contrastRatio(black, background);
  const whiteRatio = contrastRatio(white, background);
  const best = blackRatio >= whiteRatio ? black : white;
  if (Math.max(blackRatio, whiteRatio) < minimum) {
    throw new Error("generated theme cannot satisfy contrast requirement");
  }
  return best;
}

function bestRing(accent: string, background: string): string {
  return contrastRatio(accent, background) >= 3
    ? accent
    : bestReadable(background, 3);
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map(
    (offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255,
  );
  const linear = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function mix(foreground: string, base: string, percent: number): string {
  return `color-mix(in srgb, ${foreground} ${percent}%, ${base})`;
}
