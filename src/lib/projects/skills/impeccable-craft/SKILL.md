---
name: impeccable-craft
description: Use when designing, redesigning, shaping, critiquing, auditing, hardening, or polishing a generated frontend interface and its visual hierarchy.
license: Apache-2.0
metadata:
  source: https://github.com/pbakaus/impeccable/blob/main/.claude/skills/impeccable/SKILL.md
  adaptation: UMKM Cepat static-site runtime
---

# Impeccable craft

Own the creative direction. Make the interface feel chosen for this business, not assembled from a familiar AI template. Impeccable is the only creative governor. The other skills review correctness, local copy, components, or motion within this direction.

## Before writing

1. Read the accepted business context in `PRODUCT.md` and `DESIGN.md`.
2. Read `src/content/site.ts`. It is the only source for customer-facing facts in the generated project.
3. Identify the visitor's job: decide, ask, visit, compare, browse, or take another supported action.
4. Choose a visual direction that serves that job. Name the dominant first-view idea, type roles, surface rhythm, and one signature pattern before adding sections.
5. Keep direction separate from facts. A reference may teach composition, density, or material behavior; it may not add a business name, identity, price, address, contact, claim, testimonial, or placeholder treatment.

A sparse brief deserves a sparse page. Do not fill missing information with decoration or confident prose.

## Craft sequence

Use the smallest sequence that fits the task:

1. **Direction:** make one clear visual choice instead of blending unrelated references.
2. **Craft:** give hierarchy, typography, spacing, contrast, alignment, and density deliberate roles.
3. **Critique:** remove anything that does not help the visitor understand or act.
4. **Harden:** check long text, mobile order, focus, contrast, media, empty states, and real routes.
5. **Audit:** confirm facts, actions, responsive behavior, and scaffold boundaries.
6. **Polish:** make one bounded correction pass, then stop when the evidence is clean.

Do not run an open-ended taste loop. A review must end in a concrete change, a reason to keep the current choice, or a failed build state.

## Craft floor

- Build around the business job, not a default section list.
- Give the first viewport one dominant idea and one obvious next action.
- Use a small number of differentiated sections. A section must earn its space through a real fact, visitor question, or supported action.
- Let contrast come from warm surfaces, typography, spacing, borders, and composition before gradients or effects.
- Use a restrained palette from the accepted theme. A gradient is not a substitute for a direction.
- Keep body copy readable and bounded. Break long Indonesian words and let real content wrap.
- Use asymmetry only when it improves scanability or emphasizes the primary offer.
- Prefer one strong showcase to a grid of equal cards.
- Preserve empty or unavailable states honestly. An omitted fact is not an invitation to invent a UI value.

## Never ship

- Fake calculators, counters, progress, carts, checkout, booking confirmation, login, persistence, or API state.
- Invented testimonials, ratings, awards, certifications, metrics, guarantees, stock, urgency, prices, locations, hours, or payment claims.
- Three identical cards as the answer to every business, badge soup, nested cards, random glass panels, or purple-blue AI gradients.
- Technical headings such as component names, internal plan notes, or scaffold instructions.
- Decorative SVG illustrations, placeholder media, or empty image frames when the brief has no approved asset.
- A visual reference's brand identity, copy, contact details, or claims.
- A section that exists only because a template normally has it.

## Authority boundaries

Facts, routes, platform-owned files, accepted handoff constraints, and build gates outrank visual preference. Do not rewrite `src/content/site.ts`, `src/index.css`, the router scaffold, or other protected files. Do not add a fact to make a composition look complete. Ask the available data to shape the page, then delete the part that the data cannot support.

The runtime has no Impeccable CLI, detector service, shell tool, browser tool, or remote reference fetch. Existing local source and browser gates are the verification surface. Never claim that an upstream detector ran.

## Source note

Adapted from Paul Bakaus's Impeccable workflow and craft floor. The project keeps the direction, context gate, bounded passes, and anti-slop discipline while removing upstream commands and capabilities unavailable to the generated agent.
