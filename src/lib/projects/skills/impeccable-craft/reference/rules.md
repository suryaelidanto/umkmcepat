# Impeccable Craft & Design System Directives

## 1. Hierarchy & Spatial Rhythm (Layout)

- **Squint Test**: The most important value/offer on the page must dominate visually through weight, scale, and contrast before any secondary details.
- **Break Card Monotony**: Never build a wall of identical 3-column cards. Alternate layout structures:
  - Hero thesis showcase (dominant 7/5 or 8/4 grid split).
  - Asymmetric bento grid (one large focal feature + 2 compact detail blocks).
  - Editorial list with generous spacing and typographic anchors.
- **Rhythm through Whitespace**:
  - Tight grouping for related elements (8-12px / `gap-2` to `gap-3`).
  - Generous section breathing room (56-80px / `py-14` to `py-20`).
  - Never use uniform padding across everything.

## 2. Typography & Typographic Scale (Typeset)

- **Contrast over Decoration**: Establish clear hierarchy using size + weight + tonal contrast.
- **Scale Ceiling**:
  - Hero display heading: `text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-balance`.
  - Section headings: `text-2xl sm:text-3xl font-bold tracking-tight`.
  - Body text: `text-sm sm:text-base leading-relaxed text-foreground/80`.
  - Captions/metadata: `text-xs text-muted-foreground font-medium`.
- **Line Length**: Keep body text capped at `max-w-2xl` (65–75ch) for effortless readability.
- **No Arbitrary Numbers**: Never slap decorative `01 / 02 / 03` numbered counters unless content is a genuine step-by-step sequential workflow.

## 3. Surface & Color Layering (Colorize)

- **Contrast Ratios**:
  - Body text must meet ≥ 4.5:1 against its background.
  - Large headings must meet ≥ 3.0:1.
  - Never use light gray body text on tinted off-white backgrounds.
- **Semantic Theme Tokens Only**:
  - Use `bg-background`, `bg-card`, `bg-muted`, `bg-secondary`, `bg-primary`.
  - Use `text-foreground`, `text-muted-foreground`, `text-primary`.
  - Never hardcode arbitrary hex colors (`#111312`) in JSX/Tailwind.

## 4. Hardening & Edge Cases (Harden)

- **Text Wrapping**: Always use `text-balance` for headings, `break-words` or `leading-relaxed` for Indonesian UMKM copy.
- **Touch Target Floor**: Interactive buttons, anchors, and toggles must satisfy `min-h-11 min-w-11` (≥44px) accessible hit area.
- **Data Grounding**: Every visible fact, price, address, phone number, and feature MUST be derived directly from `src/content/site.ts`. Never hallucinate.
