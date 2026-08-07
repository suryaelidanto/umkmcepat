// Design taste rules injected into the batched writer prompt. Shared verbatim
// so generated apps follow one consistent visual language.
export const DESIGN_DIRECTIVE = `DESIGN STANDARDS (non-negotiable — output must look designed, not templated):

TASTE READ (decide before writing CSS): infer vibe from business (warung=friendly/warm, bengkel=industrial/bold, kopi=editorial/calm, laundry=clean/trust). Set 3 dials: DESIGN_VARIANCE (1 symmetrical→10 artsy, default 8), MOTION_INTENSITY (1 static→10 cinematic, default 6), VISUAL_DENSITY (1 airy→10 packed, default 4).

COLOR:
- Tinted neutrals only. No pure black (#000/#111/#0a0a0a) and no pure gray (#333/#444/#555). Use warm-tinted dark shades.
- BANNED: purple-blue gradients, gradient text (background-clip:text), mesh-gradient heroes — the #1 AI-slop signal. Use business-relevant solid colors from the palette.
- Body text contrast ≥4.5:1 against its background; large/bold ≥3:1. No muted gray text on colored bg — use a darker shade of the bg's own hue. Prefer OKLCH.
- Accent ≤10% of surface; one accent, used deliberately.

TYPOGRAPHY:
- Pair fonts on a contrast axis (serif+sans, geometric+humanist) OR one family in multiple weights. Avoid two near-identical sans-serifs.
- Distinctive fonts encouraged; avoid default Inter/Roboto/Arial-only pages.
- Display heading: clamp() max ≤6rem, letter-spacing ≥-0.04em. Cap body line length 65–75ch.
- Use text-wrap:balance on h1–h3, text-wrap:pretty on prose.

LAYOUT:
- Vary spacing for rhythm — uniform section padding reads AI-generated. "Art Gallery Airy": generous margins, let content breathe (section padding 48–96px vertical).
- Cards are the lazy answer. Avoid generic 3-equal-card grids; mix hero + text + list + grid. Nested cards are always wrong.
- Responsive grids without breakpoints: repeat(auto-fit, minmax(280px, 1fr)). Mobile-first: base mobile, @media (min-width:640px) scale up.
- Semantic z-index scale; never arbitrary 999/9999.
- Use h-screen via min-height:100dvh, never h-screen.

MOTION:
- Ease-out exponential curves (ease-out-quart/quint/expo). No bounce, no elastic. Don't animate layout properties.
- Every animation needs @media (prefers-reduced-motion:reduce) fallback. Reveals enhance already-visible content — never gate visibility on a class-triggered transition.
- Section navigation: use <Link to="/" hash="id"> for in-page anchors (never raw href="#id" — hash history turns it into a route and 404s). For smooth in-page scroll set scroll-behavior:smooth on the root and add scroll-mt-* on each id-target section to clear any fixed header.

CONTENT:
- Real, specific Indonesian copy ("Sewa PS Rp 5.000/jam", not "Harga terjangkau"). No "Lorem ipsum" / "Coming soon".
- Use design tokens from src/index.css (--background/--foreground/--muted/--accent) as the single source of truth.`;
