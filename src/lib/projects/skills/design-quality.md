# Generated-site design quality SOP

This guide is the taste contract for UMKM Cepat generated static sites. It is an engine rule, not a request for every site to look the same.

## 1. Read the room

Before choosing a layout, identify:

- the business subject and its physical world;
- the audience and the one primary customer job;
- the accepted CTA and the safest next action;
- supplied facts, assets, operational details, and quiet trust/accessibility constraints;
- whether one coherent story fits `/` or distinct jobs/content sets need separate routes.

Default to one page. Choose multiple pages only when the accepted plan has materially distinct jobs or content, such as browsing a catalog versus reading a product detail, or booking versus finding a location. Never add routes to pad a sparse brief. Never collapse accepted routes into `/` silently. A route-capable generator must render every accepted route; a single-file generator must fail closed for a multi-route contract.

## 2. Pick explicit dials

Every selected design kit carries three bounded dials:

- **Variance (1-10):** symmetry to intentional asymmetry. Trust-first service sites usually use 3-4. Commerce can use 5-6. A creative event or brand may earn 7-8.
- **Motion (1-10):** static to cinematic. UMKM defaults to 1-3. Animation must communicate hierarchy, storytelling, feedback, or state change. Reduced motion always wins.
- **Density (1-10):** gallery-like space to information density. Derive it from supplied facts. Never invent content to fill empty space.

Choose one page-level shape language: sharp, soft, or pill. Do not mix rounded cards, square panels, and pill controls without a real component rule.

## 3. Build one compact visual system

The accepted plan must have:

- one page-level theme and one coherent accent family;
- a display/body type decision with a reason, not a reflex font;
- a readable type scale: balanced headings, body copy around 65-75ch, no oversized shouting H1;
- one memorable signature composition choice;
- rhythm that varies section treatment without becoming a card dump;
- semantic Tailwind tokens (`bg-background`, `text-foreground`, `text-muted-foreground`, `bg-primary`, `text-primary-foreground`, `border-border`, and related tokens).

The hero is a business thesis: show the outcome, concrete offer, audience context, and accepted next action quickly. Keep the hero CTA visible on mobile. A sparse brief should feel intentional, not unfinished. A rich brief should have a useful story, not one empty card.

Typography review questions:

1. Can a customer read the headline and body copy at a glance on a phone?
2. Does the display treatment fit this business, or is it a generic serif/sans reflex?
3. Are display and body roles distinct enough to establish hierarchy?
4. Are line length, weight, tracking, and wrapping calm rather than cramped?
5. Is technical monospace limited to genuinely technical data?

## 4. Anti-slop rules

Reject or correct these deterministic tells unless the accepted brief genuinely requires them:

- direct `site.theme.*` color reads, raw palette literals, or color-bearing inline styles;
- `h-screen` instead of `min-h-dvh` for viewport-height composition;
- more than one tracked uppercase eyebrow per three sections;
- repeated `01`/`02`/`03` labels when the content is not a real ordered process;
- technical monospace headings, fixed-renderer copy, technical component names, or starter residue;
- duplicate CTA intent, guessed facts, fake precision, fake awards, fake proof, fake checkout, or fake contact details;
- em/en dash flourishes in generated customer copy;
- equal card grids, nested cards, decorative gradients, or motion with no one-sentence reason;
- placeholder or remote imagery in graphic/typographic mode;
- missing approved owner imagery when the contract explicitly requires it;
- page sections, testimonials, prices, locations, hours, payment methods, or social links that are not accepted facts.

A visual critic may report taste concerns such as “too simple” or “generic,” but it cannot override deterministic fact, route, contrast, source, build, or browser failures.

## 5. Pre-flight checklist

Before accepting a candidate, verify:

- contract hash, routes, required sections, accepted facts, and CTA target are preserved;
- `HomeRouteComponent` and standalone `usePreviewReady()` are present where required;
- selected primitives and composition pattern are visible in source;
- no protected scaffold files were emitted;
- every visible text color passes WCAG AA: 4.5:1 for normal text and 3:1 for large/bold text;
- headings do not overflow, the page has no horizontal overflow, and primary actions are at least 44px;
- mobile `390×844` and desktop `1440×1000` both load cleanly with focus-visible controls;
- source and rendered browser checks agree. A color merely existing in CSS is not contrast evidence;
- the screenshot has readable hierarchy, one clear signature, useful density, and an obvious Indonesian customer path;
- no critical/high visual finding remains. A human-only high finding is not auto-dismissed;
- malformed, empty, or unavailable visual review is recorded as `visual: unknown`, never as visual success;
- failed candidates retain the last-known-good source/build/deployment.

## 6. Review loop

Use this order, stopping when the brief is satisfied:

1. type and hierarchy;
2. spacing and section rhythm;
3. contrast and color consistency;
4. CTA clarity and business path;
5. responsive/mobile composition;
6. restrained motion, only if it earns a reason;
7. final screenshot critique and one subtraction pass.

The writer gets one bounded correction. Corrections may repair only named implicated files and must pass source/build/browser checks again. Never use retries to hide an upstream model or infrastructure failure.

## Research references

These sources calibrated the vocabulary and anti-slop rules; they are not runtime dependencies and their identity, copy, palettes, or assets must not be copied into generated businesses:

- https://impeccable.style/
- https://github.com/anthropics/claude-code/blob/main/plugins/frontend-design/skills/frontend-design/SKILL.md
- https://ui-ux-pro-max-skill.nextlevelbuilder.io/
- https://www.tasteskill.dev/

UMKM overrides always win: trust beats spectacle, real facts beat filler, the next action must be obvious, and generated source must remain portable.
