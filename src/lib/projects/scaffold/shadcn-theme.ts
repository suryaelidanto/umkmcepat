import type { ProjectSiteSchema } from "@/lib/projects/site-schema";

/**
 * Map the brief's theme tokens to shadcn/ui CSS variables (Tailwind v4,
 * CSS-first). The variable names MUST match what the seeded shadcn
 * "new-york" components reference (bg-background, text-foreground,
 * border-border, bg-primary, etc.).
 *
 * ponytail: only light mode is seeded; add a `.dark` block + `data-theme`
 * switching when dark mode is needed. shadcn components already ship
 * dark: variants that read the same var names.
 */
export function shadcnThemeCss(schema: ProjectSiteSchema): string {
  const { background, foreground, muted, accent } = schema.theme;
  const border = mix(foreground, "transparent", 12);
  const input = mix(foreground, "transparent", 20);
  const card = background;
  const popover = background;
  const primary = accent;
  const primaryForeground = contrastForeground(accent);
  const secondary = mix(foreground, background, 8);
  const secondaryForeground = foreground;
  const mutedForeground = muted;
  const accentForeground = contrastForeground(accent);
  const destructive = "#dc2626";
  const destructiveForeground = "#ffffff";

  return `@import "tailwindcss";

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
  --ring: ${accent};
  --radius: 0.625rem;
}

@layer base {
  * {
    border-color: var(--border);
  }

  body {
    background: var(--background);
    color: var(--foreground);
  }
}
`;
}

/** color-mix helper so the CSS stays readable. */
function mix(foreground: string, base: string, percent: number): string {
  return `color-mix(in srgb, ${foreground} ${percent}%, ${base})`;
}

/** White on dark accents, dark on light accents — fallback heuristic. */
function contrastForeground(accent: string): string {
  return isDarkColor(accent) ? "#ffffff" : "#0c0c0c";
}

/** Naive luminance gate — good enough for the brief's hex accent palette. */
function isDarkColor(hex: string): boolean {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) {
    return false;
  }
  const r = parseInt(match[1].slice(0, 2), 16);
  const g = parseInt(match[1].slice(2, 4), 16);
  const b = parseInt(match[1].slice(4, 6), 16);
  // Relative luminance (sRGB) per WCAG.
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.5;
}
