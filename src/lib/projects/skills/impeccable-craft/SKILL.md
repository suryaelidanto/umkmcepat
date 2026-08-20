---
name: impeccable-craft
description: Impeccable art direction, visual hierarchy, anti-slop rules, and high-contrast craft standards. Use when designing, styling, and structuring landing pages, hero sections, and value cards.
---

# Impeccable Design & Anti-Slop Standards

Produce high-converting, authentic, and restrained frontend interfaces. Real working code, committed design choices, zero AI slop.

## Core Anti-Slop Directives (Never Ship)

1. **NO Invented Interactive State**:
   - Never build fake donation calculators, sliders with math state, fake interactive +/- item counters, fake multi-step wizards, or fake checkout carts unless explicitly mandated by the project brief.
   - Do NOT invent fake persistent state or API endpoints (`fetch('/api/...')`).
2. **NO Fake Testimonials & Claims**:
   - Do not invent fake quotes with names, portraits, or made-up statistics (`"120 / 150 Paket Tersalurkan"` or fake RT/RW numbers) that are not in `@/content/site`.
   - Facts and contact data must come strictly from `@/content/site`.
3. **NO Template / Card Soup**:
   - Avoid 3 identical equal-width cards with purple/blue gradients and emoji bullet points.
   - Limit the page to 4–5 well-differentiated, high-impact sections (Hero, Showcase/Paket, Cara Pesan/Alur, FAQ, Kontak).
4. **NO Nested Cards in Cards**:
   - Do not put cards inside cards. Use clean surface contrasts (`bg-background` vs `bg-muted/40` or border dividers).
5. **Restrained Brand Polish**:
   - Avoid generic tech gradients (`bg-radial`, `blur-3xl`) on humble local businesses.
   - Use authentic Indonesian design tokens: warm backgrounds, crisp display typography, clear primary action.

## Visual Hierarchy & Typography Rules

- **Display Headings**: Use `clamp()` for fluid headings (`clamp(2rem, 5vw, 3.5rem)`). Never shout above 4rem.
- **Letter Spacing**: Heading letter-spacing between `-0.03em` and `0`. Never cram letters so tight they collide.
- **Line Length**: Body text max-width capped at `65ch` (`max-w-xl` or `max-w-2xl`).
- **Contrast**: Text contrast ≥ 4.5:1 on light surfaces. On orange/accent buttons, use `text-foreground` or `text-primary-foreground` with verified contrast.
