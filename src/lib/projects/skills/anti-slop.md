# Anti-Slop Rules

Rules to prevent generic AI-generated design patterns. Based on Impeccable, Taste-Skill, and UI/UX Pro Max.

## Banned Patterns

These patterns make designs look "AI-generated" and generic:

- **Pure black backgrounds** (#000, #111, #0a0a0a) — use tinted dark shades
- **Pure gray card borders** (#333, #444, #555) — use subtle borders or no borders
- **Default Inter/Roboto/Arial fonts** — use distinctive, characterful fonts
- **Bouncing/elastic ease transitions** — use exponential ease-out curves
- **Generic 3-column card layouts** — vary layouts, use alternative structures
- **Purple-blue gradients** — the #1 AI slop signal. Use business-relevant colors
- **Nested cards** (card inside card) — use depth hierarchy instead
- **Muted gray text on colored backgrounds** — use darker shade of background hue
- **Uniform section spacing** — vary rhythm, use intentional whitespace
- **"Coming soon" / "Lorem ipsum" placeholders** — use real, specific content
- **Gradient text** (background-clip: text) — use solid colors
- **h-screen** — use `min-height: 100dvh` instead

## Required Patterns

These patterns signal quality design:

- **Tinted neutrals** — warm gray, not cool gray
- **Font pairing on contrast axis** — serif + sans, or one family in multiple weights
- **Specific, business-relevant content** — no generic filler
- **Varied section layouts** — not all cards, mix hero + text + grid + list
- **High contrast text on backgrounds** — ≥4.5:1 ratio
- **Intentional whitespace** — "Art Gallery Airy" spacing
- **Mobile-first responsive** — base mobile, then scale up
- **Consistent design tokens** — colors, spacing, typography from a single source

## Detection Checklist

Before finalizing, verify:

- [ ] No pure black or pure gray backgrounds
- [ ] No default system fonts (Inter, Roboto, Arial, sans-serif default)
- [ ] No purple-blue gradients
- [ ] No nested cards
- [ ] No uniform spacing between sections
- [ ] No placeholder text
- [ ] Text contrast ≥4.5:1
- [ ] Headings use letter-spacing ≥ -0.04em
- [ ] Responsive layout works on mobile
