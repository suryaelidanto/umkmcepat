---
version: alpha
name: "UMKM Cepat"
description: "Warm-neutral AI builder product UI for Indonesian small-business website generation: chat-first, restrained, clear, portable."
colors:
  surface-base: "#eceae4"
  surface-muted: "#f7f4ed"
  surface-warm-white: "#fcfbf8"
  foreground-primary: "#1c1c1c"
  text-secondary: "#5f5f5d"
  action-primary: "#1c1c1c"
  border-warm: "#d8d5cc"
  destructive: "#9f1d1d"
  aurora-orange: "#ff7a59"
  aurora-rose: "#ee4f9b"
  aurora-violet: "#7867ff"
  aurora-blue: "#2f8cff"
  aurora-gold: "#f7a441"
  github-blue: "#58a6ff"
  github-blue-deep: "#0d6efd"
  github-red: "#ff4d4f"
typography:
  display-hero:
    fontFamily: "Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "60px"
    fontWeight: "480"
    lineHeight: "60px"
    letterSpacing: "-0.055em"
  display-large:
    fontFamily: "Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "60px"
    fontWeight: "600"
    lineHeight: "66px"
    letterSpacing: "-1.5px"
  heading-xl:
    fontFamily: "Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "48px"
    fontWeight: "600"
    lineHeight: "52.8px"
    letterSpacing: "-1.2px"
  heading-lg:
    fontFamily: "Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "36px"
    fontWeight: "600"
    lineHeight: "39.6px"
    letterSpacing: "-0.9px"
  body-large:
    fontFamily: "Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: "400"
    lineHeight: "24.75px"
  body-base:
    fontFamily: "Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: "400"
    lineHeight: "24px"
  body-medium:
    fontFamily: "Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: "400"
    lineHeight: "24px"
  body-small:
    fontFamily: "Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: "400"
    lineHeight: "21px"
  label-emphasis:
    fontFamily: "Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif"
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
components:
  button-primary:
    backgroundColor: "{colors.action-primary}"
    textColor: "{colors.surface-warm-white}"
    rounded: "{rounded.radius-lg}"
    padding: "12px 20px"
    height: "44px"
  button-secondary:
    backgroundColor: "{colors.surface-muted}"
    textColor: "{colors.foreground-primary}"
    rounded: "{rounded.radius-lg}"
    padding: "12px 20px"
    height: "44px"
  card-default:
    backgroundColor: "{colors.surface-warm-white}"
    textColor: "{colors.foreground-primary}"
    rounded: "{rounded.radius-2xl}"
    padding: "24px"
  input-default:
    backgroundColor: "{colors.surface-warm-white}"
    textColor: "{colors.foreground-primary}"
    rounded: "{rounded.radius-lg}"
    padding: "12px 16px"
---

# Design System: UMKM Cepat

## Overview

**Creative North Star: "Warm Control Plane"**

UMKM Cepat is a product UI first: a calm control plane that helps business owners turn rough intent into a credible generated website. The interface should feel warm and approachable without becoming decorative. It uses off-white surfaces, near-black actions, generous spacing, and direct hierarchy so the next step is obvious.

The public/home surface may use a restrained aurora gradient as a brand signal. Workspace, account, modal, and builder surfaces should default to warm-neutral product chrome and task-first layouts. The system rejects generic AI SaaS clichés, badge clutter, excessive card grids, and visual noise that competes with the user's business decision.

**Key Characteristics:**

- Warm off-white foundation with near-black primary action.
- Chat-first builder interactions, but never chat bubbles as decoration.
- Product surfaces use restrained dark warm-neutral chrome when focus matters.
- Generated-project guidance favors portable conventions: `PRODUCT.md`, `DESIGN.md`, `.agents/skills`.
- Accessibility is correctness, not polish.

## Colors

The palette is warm-neutral and restrained. Aurora colors are decorative accents for brand moments only; they are not CTA colors or general UI state colors.

### Primary

- **Action Ink** (`#1c1c1c`): primary action, strong text, focus rings, active controls. Use for commitment and decision clarity.
- **Warm White** (`#fcfbf8`): elevated surfaces, cards, dialogs, inputs, composer areas.

### Secondary

- **Surface Base** (`#eceae4`): page background, structural shell, header base, soft separators.
- **Muted Warm Surface** (`#f7f4ed`): secondary panels, footer, nested surfaces, inactive controls.

### Tertiary

- **Aurora Set** (`#ff7a59`, `#ee4f9b`, `#7867ff`, `#2f8cff`, `#f7a441`): hero/background atmosphere only. Do not turn these into random CTAs, badges, or status colors.
- **GitHub Proof Colors** (`#58a6ff`, `#0d6efd`, `#ff4d4f`): open-source contribution charts only. Do not reuse them as general product accent or status colors.

### Neutral

- **Primary Foreground** (`#1c1c1c`): readable text and product chrome.
- **Secondary Text** (`#5f5f5d`): supporting copy only. Check contrast; do not use for tiny text on tinted backgrounds.
- **Warm Border** (`#d8d5cc`): low-contrast borders and input strokes.
- **Destructive** (`#9f1d1d`): actual errors/destructive actions only.

### Named Rules

**The Aurora Rationing Rule.** Aurora gradients may create atmosphere in brand surfaces; product workflows use them sparingly or not at all.

**The One Action Rule.** Primary action color is near-black. Do not introduce orange, blue, purple, or gradient CTAs unless DESIGN.md is intentionally changed first.

**The Proof-Color Containment Rule.** GitHub blue/red may appear inside contribution proof charts only; they are not brand accents.

## Typography

**Display Font:** Plus Jakarta Sans with `ui-sans-serif, system-ui, sans-serif` fallback.  
**Body Font:** Plus Jakarta Sans with the same fallback.  
**Label/Mono Font:** Plus Jakarta Sans for labels; system monospace only for code/log output.

**Character:** Rounded enough to feel friendly, disciplined enough to support product workflows. Use one family across product UI for consistency.

### Hierarchy

- **Display Hero** (480, `60px`, `60px`, tight tracking): landing hero only. Keep line breaks balanced and avoid overflow on mobile.
- **Display Large** (600, `60px`, `66px`): major brand/product marketing statements.
- **Heading XL** (600, `48px`, `52.8px`): section-level landing or workspace milestones.
- **Heading LG** (600, `36px`, `39.6px`): panels, cards, modal headers, builder decisions.
- **Body Large** (400, `18px`, `24.75px`): hero support and important explanatory copy.
- **Body Base / Medium** (400, `16px` / `15px`, `24px`): default product prose and controls.
- **Body Small** (400, `14px`, `21px`): metadata, helpers, timestamps. Keep contrast high.
- **Label Emphasis** (480, `14px`, `21px`): buttons, compact labels, tabs.

### Named Rules

**The Product Type Rule.** Product UI uses a tighter, calmer scale than brand surfaces. Do not bring fluid oversized headings into workspace panels.

**The No Random Serif Rule.** Do not add a decorative serif for emphasis. Use weight, spacing, layout, and same-family emphasis.

## Elevation

UMKM Cepat is flat-by-default. Depth is conveyed through warm surface contrast, hairline borders, outlines, and spacing. Heavy black shadows are off-brand and reduce trust. If shadow appears, it must be soft, tinted, and tied to interaction or modal layering.

### Shadow Vocabulary

- **Outline Depth** (`border: 1px solid rgba(28, 28, 28, 0.10)`): default cards, dialogs, inputs.
- **Focus Ring** (`0 0 0 2px #1c1c1c`): keyboard focus and active controls.
- **Soft Overlay Shadow** (`0 18px 60px rgba(0, 0, 0, 0.18)`): modal/overlay use only, mostly on dark product chrome.
- **Ring Depth** (`ring-1` with warm foreground opacity): preferred replacement for decorative shadows on landing cards and menus.

### Named Rules

**The Flat-Until-State Rule.** Static product surfaces should not float. Use elevation only when the user opens, hovers, focuses, drags, or needs a clear layer boundary.

## Components

### Buttons

- **Shape:** `12px` radius default; `8px` for compact controls.
- **Primary:** `action-primary` background, `surface-warm-white` text, 44px default height, no gradient, no heavy shadow.
- **Hover / Focus:** subtle opacity/surface shift on hover; near-black 2px focus ring. Disabled lowers opacity and blocks pointer events.
- **Secondary / Ghost:** warm-muted or transparent surfaces, near-black text, low-contrast borders where needed.

### Chips

- **Style:** muted warm surface, low-contrast border, compact radius `6-8px`.
- **State:** chips should clarify state or filter choice. Avoid decorative badge clusters in the builder flow.

### Cards / Containers

- **Corner Style:** cards use `16-28px`; dialogs and larger surfaces can use `24-28px`.
- **Background:** warm white or dark warm-neutral product chrome depending on context.
- **Shadow Strategy:** flat with borders by default.
- **Border:** `foreground-primary/10` or warm border token.
- **Internal Padding:** use `spacing-8` to `spacing-10` for cards; dense product rows can use less with separators.

### Inputs / Fields

- **Style:** warm white background, subtle border, `12px` radius.
- **Focus:** near-black ring, never color-only.
- **Error / Disabled:** destructive only for real errors; disabled lowers opacity without hiding labels.

### Navigation

Navigation should be minimal and transparent on brand surfaces, then task-oriented inside the workspace. Preserve landmarks and keyboard focus. Do not create novelty navigation for flavor.

### Generated Preview / Workspace

Build progress, preview failures, runtime state, and edit attempts are product states. Show what happened, what changed, and what the user can do next. Generated sites should receive portable context files (`PRODUCT.md`, `DESIGN.md`, `.agents/skills/impeccable`) and should not include platform-branded metadata in source.

### Generated App Design System (locked stack)

Generated UMKM apps use a separate, locked design system from the platform control plane. This section is the canonical record; do not introduce a new generated-app visual language without updating it first.

- **System:** shadcn/ui "new-york" + Tailwind CSS v4 (CSS-first, no `tailwind.config.js`). Components live in `src/components/ui/*`; pre-seeded primitives are `button`, `card`, `badge`, `input`, `label`, `separator`. The AI composes these and writes any extras as source into `src/components/ui/<name>.tsx` (canonical new-york + Tailwind v4 shape). No shadcn CLI at build time.
- **Theme tokens:** the brief's `schema.theme` (`background`, `foreground`, `muted`, `accent`) is mapped to shadcn CSS variables in `src/index.css`. The variable names must match what the seeded shadcn components reference: `--background`, `--foreground`, `--card`, `--card-foreground`, `--popover`, `--popover-foreground`, `--primary`, `--primary-foreground`, `--secondary`, `--secondary-foreground`, `--muted`, `--muted-foreground`, `--accent`, `--accent-foreground`, `--destructive`, `--destructive-foreground`, `--border`, `--input`, `--ring`, `--radius`. Tailwind v4 `@theme inline` maps each to `--color-*` so utilities like `bg-background` resolve. Only light mode is seeded; dark mode is a future upgrade.
- **Composition:** components consume the theme via Tailwind utilities — `bg-background`, `text-foreground`, `bg-primary`, `text-primary-foreground`, `bg-secondary`, `bg-muted`, `text-muted-foreground`, `bg-accent`, `text-accent-foreground`, `border-border`, `ring-ring`. `cn()` from `@/lib/utils` merges classes conditionally.
- **No custom CSS classes:** all styling is Tailwind utility classes inline in TSX. If a reusable style is needed, make a React component, not a CSS class. `src/index.css` and `src/content/site.ts` are read-only to the agent.
- **Taste layer:** `DESIGN_DIRECTIVE` (distilled from anti-slop, design-quality, and the 3-dial taste skill) applies on top of the utility classes — tinted neutrals (no pure black/gray), one deliberate accent ≤10% of surface, varied section rhythm, no purple-blue gradients or gradient text, `min-h-dvh` for full-height sections. Generated copy is real Indonesian business-specific text, never placeholders.

## Do's and Don'ts

### Do

- Use tokens from this file and `src/app/globals.css` before adding one-off values.
- Add or update Storybook for reusable UI or repeated visual states.
- Keep user-facing copy Indonesian; keep developer docs/code/logs/errors English.
- Preserve contrast, focus, reduced-motion alternatives, and clear state language.
- Use CSS/platform behavior before JavaScript for layout and interaction where possible.
- Keep generated project source standalone and conventional.

### Don't

- Do not ship generic AI purple/cyan gradients, gradient text, glassmorphism-by-default, or hero-metric templates.
- Do not nest cards or use equal card grids as the default answer.
- Do not use side-stripe borders, random badges, emoji-led builder cards, or decorative motion in product workflows.
- Do not invent generated-business claims, prices, stock, addresses, awards, checkout, login, or persistence.
- Do not add new visual language without updating this file and Storybook when reusable.
- Do not commit local artifacts: `.env`, uploads, logs, `.next/`, `.pi/`, `.browser/`, `graphify-out/`, `storybook-static/`, coverage.
