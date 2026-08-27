export function parseHexColor(
  hex: string,
): { r: number; g: number; b: number } | null {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!match) {
    return null;
  }
  return {
    r: parseInt(match[1], 16),
    g: parseInt(match[2], 16),
    b: parseInt(match[3], 16),
  };
}

export const OUTCOME_FONT_STACKS = {
  "system-editorial":
    'Iowan Old Style, "Palatino Linotype", "Book Antiqua", Georgia, serif',
  "system-grotesk": '"Arial Nova", "Helvetica Neue", Arial, sans-serif',
  "system-humanist":
    "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif",
  "system-slab": 'Rockwell, "Roboto Slab", Georgia, serif',
} as const;

export type OutcomeFontStackId = keyof typeof OUTCOME_FONT_STACKS;

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
  displayFontStackId: OutcomeFontStackId;
  bodyFontStackId: OutcomeFontStackId;
  radiusScale: "sharp" | "restrained" | "soft";
};

export type OutcomeContrastIssue = {
  pair: string;
  ratio: number;
  required: number;
};

export type OutcomeDesignSystemResult =
  | { ok: true; css: string; proposal: GeneratedDesignSystemProposalV1 }
  | { ok: false; issues: OutcomeContrastIssue[] };

function relativeLuminance(r: number, g: number, b: number): number {
  const a = [r, g, b].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

function contrastRatio(hex1: string, hex2: string): number {
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

export function compileOutcomeDesignSystem(
  proposal: GeneratedDesignSystemProposalV1,
): OutcomeDesignSystemResult {
  const issues: OutcomeContrastIssue[] = [];

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
    OUTCOME_FONT_STACKS[proposal.displayFontStackId] ||
    OUTCOME_FONT_STACKS["system-humanist"];
  const bodyFont =
    OUTCOME_FONT_STACKS[proposal.bodyFontStackId] ||
    OUTCOME_FONT_STACKS["system-humanist"];

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
