---
version: alpha
name: "Lovable AI Builder"
description: "Warm off-white AI builder design system inspired by Lovable: aurora hero, Plus Jakarta Sans typography, soft radii, flat depth, chat-first interaction."
colors:
  surface-base: "#eceae4"
  surface-muted: "#f7f4ed"
  surface-warm-white: "#fcfbf8"
  action-primary: "#1c1c1c"
  foreground-primary: "#1c1c1c"
  text-secondary: "#5f5f5d"
typography:
  display-hero:
    fontFamily: "Plus Jakarta Sans"
    fontSize: "60px"
    fontWeight: "480"
    lineHeight: "60px"
  display-large:
    fontFamily: "Plus Jakarta Sans"
    fontSize: "60px"
    fontWeight: "600"
    lineHeight: "66px"
    letterSpacing: "-1.5px"
  heading-xl:
    fontFamily: "Plus Jakarta Sans"
    fontSize: "48px"
    fontWeight: "600"
    lineHeight: "52.8px"
    letterSpacing: "-1.2px"
  heading-lg:
    fontFamily: "Plus Jakarta Sans"
    fontSize: "36px"
    fontWeight: "600"
    lineHeight: "39.6px"
    letterSpacing: "-0.9px"
  body-large:
    fontFamily: "Plus Jakarta Sans"
    fontSize: "18px"
    fontWeight: "400"
    lineHeight: "24.75px"
  body-base:
    fontFamily: "Plus Jakarta Sans"
    fontSize: "16px"
    fontWeight: "400"
    lineHeight: "24px"
  body-medium:
    fontFamily: "Plus Jakarta Sans"
    fontSize: "15px"
    fontWeight: "400"
    lineHeight: "24px"
  body-small:
    fontFamily: "Plus Jakarta Sans"
    fontSize: "14px"
    fontWeight: "400"
    lineHeight: "21px"
  label-emphasis:
    fontFamily: "Plus Jakarta Sans"
    fontSize: "14px"
    fontWeight: "480"
    lineHeight: "21px"
rounded:
  radius-sm: "6px"
  radius-md: "8px"
  radius-lg: "12px"
  radius-xl: "16px"
  radius-2xl: "24px"
  radius-3xl: "28px"
spacing:
  spacing-1: "2px"
  spacing-2: "4px"
  spacing-3: "6px"
  spacing-4: "8px"
  spacing-5: "10px"
  spacing-6: "12px"
  spacing-7: "16px"
  spacing-8: "20px"
  spacing-9: "24px"
  spacing-10: "32px"
  spacing-11: "40px"
  spacing-12: "48px"
  spacing-13: "56px"
  spacing-14: "80px"
  spacing-15: "144px"
  spacing-16: "160px"
  spacing-17: "192px"
---

## Overview

Target visual: Lovable-style AI builder.

Core traits:

- Full-bleed aurora gradient hero: pink, magenta, blue, orange.
- Warm neutral surfaces: `#eceae4`, `#fcfbf8`, `#f7f4ed`.
- Plus Jakarta Sans everywhere.
- Chat-first interaction card: rounded `12px`, warm white, flat border.
- Minimal transparent nav.
- Soft radius card system.
- Flat depth; avoid heavy shadows.

## Tailwind v4 tokens

```css
@theme {
  --color-surface-base: #eceae4;
  --color-foreground-primary: #1c1c1c;
  --color-surface-warm-white: #fcfbf8;
  --color-surface-muted: #f7f4ed;
  --color-text-secondary: #5f5f5d;
  --color-action-primary: #1c1c1c;

  --spacing-spacing-1: 2px;
  --spacing-spacing-2: 4px;
  --spacing-spacing-3: 6px;
  --spacing-spacing-4: 8px;
  --spacing-spacing-5: 10px;
  --spacing-spacing-6: 12px;
  --spacing-spacing-7: 16px;
  --spacing-spacing-8: 20px;
  --spacing-spacing-9: 24px;
  --spacing-spacing-10: 32px;
  --spacing-spacing-11: 40px;
  --spacing-spacing-12: 48px;
  --spacing-spacing-13: 56px;
  --spacing-spacing-14: 80px;
  --spacing-spacing-15: 144px;
  --spacing-spacing-16: 160px;
  --spacing-spacing-17: 192px;

  --radius-radius-sm: 6px;
  --radius-radius-md: 8px;
  --radius-radius-lg: 12px;
  --radius-radius-xl: 16px;
  --radius-radius-2xl: 24px;
  --radius-radius-3xl: 28px;

  --font-plus-jakarta-sans:
    "Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif;
}
```

## Implementation rules

- Use `#1c1c1c` for primary action. Remove orange CTA except aurora gradient decoration.
- Use `#eceae4` as page bg/header/borders structural base.
- Use `#fcfbf8` for hero cards, forms, elevated surfaces.
- Use `#f7f4ed` for muted sections/footer.
- Use `#5f5f5d` for secondary text only.
- Replace heavy shadows with border/outline: `0 0 0 2px` max.
- Radius map: inputs/buttons `12px`, cards `16–28px`, subtle chips `6–8px`.
- Mobile breakpoint priority: `<=600px`, vertical stacking.
- Plus Jakarta Sans is loaded via `next/font/google` under the SIL Open Font License. Keep this legal open-source font path unless a future licensed replacement is explicitly approved.

## Design principles and governance

- Design system is source of truth. Do not create page-specific visual language unless it is added here first.
- Any new reusable UI or repeated visual pattern must be added to Storybook first or in the same change.
- Reuse tokens and UI primitives before adding custom classes. Prefer `surface-*`, `foreground-primary`, `text-secondary`, `action-primary`, `spacing-*`, and `radius-*` tokens.
- Keep visual hierarchy intentional: one dominant headline, clear supporting text, grouped sections, generous warm whitespace, and one primary action per area.
- Typography must follow named roles: display hero, display large, heading XL, heading LG, body large, body base, body medium, body small, label emphasis.
- Avoid AI slop: no random gradients, arbitrary brand colors, excessive shadows, inconsistent radii, mixed font families, or generic card clutter.
- Styling belongs to components/renderers, not AI output. AI may generate content; UI code owns layout, spacing, color, and type.
- Prefer explicit design tokens over legacy shadcn aliases in product UI. If aliases are used, they must map back to this system.
- Product surfaces default to dark warm-neutral chrome (`#151515`, `#232321`) for workspace/account/modal UI; light warm surfaces are allowed only when the surrounding product context is intentionally light.
- Workspace decision/build cards should use restrained editorial rows, hairline separators, and clear action placement. Avoid emoji-led cards, badge clutter, and excessive pill clusters in the core builder flow.
- Dark mode must not introduce a separate visual brand. If enabled, it must still use this warm-neutral system or be disabled.
- Component states must be consistent: hover uses subtle warm surface shifts, focus uses near-black ring, disabled lowers opacity, errors use destructive only for actual errors.
- Accessibility is part of the system: preserve keyboard focus, readable contrast, semantic landmarks, clear labels, and reduced visual noise.
- Content standards matter: keep UMKM copy warm, clear, concise, useful, and non-generic. Do not imitate Lovable copy.
- Drift guard: keep design changes aligned with this file, then verify with lint, typecheck, tests, and browser review.

## Component state rules

- Button primary: `action-primary` background, `surface-warm-white` text, `12px` radius, no heavy shadow.
- Button secondary/outline: warm white or muted surface, near-black text, low-contrast border.
- Inputs/textareas/selects: warm white surface, subtle border, `12px` radius, near-black focus ring.
- Cards/dialogs/dropdowns: warm white surface, `16–28px` radius, subtle border/outline depth only.
- Error/destructive states: use `#9f1d1d` sparingly and only for destructive/error meaning.
- Loading/skeleton states: use foreground opacity or muted warm surfaces, never cold gray systems.
