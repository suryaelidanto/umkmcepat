# Design Quality Guide

Best practices for production-grade frontend interfaces. Based on Impeccable (Paul Bakaus) and Anthropic Frontend Design.

## Color

- **Verify contrast.** Body text must hit ≥4.5:1 against its background; large text (≥18px or bold ≥14px) needs ≥3:1.
- Use tinted neutrals, not pure gray. Warm base hue for backgrounds.
- No pure black (#000) backgrounds. Use dark tinted shades instead.
- Gray text on a colored background looks washed out. Use a darker shade of the background's own hue.
- OKLCH color space preferred for perceptual uniformity.

## Typography

- Cap body line length at 65–75ch.
- Don't pair fonts that are similar but not identical (two geometric sans-serifs). Pair on a contrast axis (serif + sans, geometric + humanist) or use one family in multiple weights.
- Hero / display heading ceiling: clamp() max ≤ 6rem (~96px). Above that the page is shouting, not designing.
- Display heading letter-spacing floor: ≥ -0.04em. Anything tighter and letters touch.
- Use `text-wrap: balance` on h1–h3 for even line lengths; `text-wrap: pretty` on long prose to reduce orphans.

## Layout

- Vary spacing for rhythm. Uniform spacing makes sections feel disconnected.
- Cards are the lazy answer. Use them only when they're truly the best affordance. Nested cards are always wrong.
- Flexbox for 1D, Grid for 2D. Don't default to Grid when `flex-wrap` would be simpler.
- For responsive grids without breakpoints: `repeat(auto-fit, minmax(280px, 1fr))`.
- Build a semantic z-index scale (dropdown → sticky → modal-backdrop → modal → toast → tooltip). Never arbitrary values like 999 or 9999.

## Motion

- Motion should be intentional, not an afterthought.
- Don't animate CSS layout properties unless truly needed.
- Ease out with exponential curves (ease-out-quart / quint / expo). No bounce, no elastic.
- Reduced motion is not optional. Every animation needs a `@media (prefers-reduced-motion: reduce)` alternative.
- Reveal animations must enhance an already-visible default. Don't gate content visibility on a class-triggered transition.

## Spacing Philosophy

- "Art Gallery Airy" — generous margins, optical alignment, let content breathe.
- Use consistent spacing scale (4px/8px baseline grid).
- Section padding: generous (48-96px vertical).
- Component internal padding: moderate (16-32px).
