# Generated-Site Design Quality SOP — Design

**Date:** 2026-08-14  
**Status:** Approved for implementation  
**Supersedes:** The short guidance in `src/lib/projects/skills/design-quality.md` as the canonical generated-site taste contract.  
**Scope:** Reference-calibrated static UMKM sites, with the same principles also available to the legacy generated-site path.

## Problem

The reference-calibrated writer can produce a structurally valid site that still feels generic, too simple, or visually unsafe. The latest Butik Senja candidate shows the failure clearly: the composition is coherent, but the writer reads `site.theme.muted` as visible text. The compiled theme has already repaired semantic foreground tokens, but the route bypasses them and renders almost invisible copy. The browser gate only checked that colors exist, so the bad candidate reached visual review.

The engine also has no compact, inspectable record of why a page is one page or several pages, how much visual variance and motion the brief earns, which type direction was chosen, or what one signature idea makes the page memorable. Prompt prose alone cannot reliably preserve those decisions.

## Goal

Make design quality a repeatable engine decision rather than a model preference:

```text
brief + accepted facts
  -> design read + page strategy + bounded kit taste
  -> compact writer output
  -> source pre-flight
  -> rendered browser pre-flight
  -> one visual critic
  -> bounded correction or honest rejection
```

A candidate may qualify only when it preserves business facts and CTA targets, passes all deterministic gates, has rendered WCAG AA contrast, and has no critical/high visual finding. A critic that cannot return a valid report is recorded as `visual: unknown`; it is never represented as a false visual pass.

## Research calibration

The SOP is informed by the following sources, fetched on 2026-08-14 with Firecrawl and kept as external references rather than runtime dependencies:

- [Impeccable](https://impeccable.style/): shared design vocabulary, context-aware commands, audit/critique separation, deterministic anti-slop detection, design-system preservation, and a final polish pass.
- [Anthropic Frontend Design](https://github.com/anthropics/claude-code/blob/main/plugins/frontend-design/skills/frontend-design/SKILL.md): ground the design in the subject, make the hero a thesis, choose typography deliberately, plan before building, take one justified risk, and critique screenshots.
- [UI UX Pro Max](https://ui-ux-pro-max-skill.nextlevelbuilder.io/): brief-to-design-system mapping across style, typography, color, landing structure, and UX checks. Its catalog is a source of vocabulary, not a license to copy a visual preset.
- [Taste Skill](https://www.tasteskill.dev/): explicit variance/motion/density dials, page-level theme and accent locks, hero and CTA discipline, mobile fallbacks, copy self-audit, anti-pattern pre-flight, and a strict final checklist.

UMKM-specific overrides are deliberate: trust, readable copy, real facts, mobile-first contact actions, and portable output outrank novelty. A creative risk is allowed only when the brief earns it and the risk does not obscure the next business action.

## Design decisions

### 1. Design read and page strategy are platform decisions

Add a small, typed taste profile to each generated design kit. It records:

- `variance` from 1-10: symmetry versus intentional asymmetry;
- `motion` from 1-10: static state through cinematic motion;
- `density` from 1-10: gallery-like space through information density;
- `shape`: `sharp`, `soft`, or `pill` radius language;
- type guidance for the display/body roles and why the role fits the kit;
- the kit's signature budget: one primary memorable composition choice.

The generated contract derives page strategy from the accepted handoff:

- **single page** is the default when one visitor job and one coherent content story can be completed on `/`;
- **multi page** is selected only when the accepted plan has distinct visitor jobs or a materially separate content set that deserves its own route (for example, catalog browsing versus product detail or booking versus location information);
- extra pages are never added to pad a sparse brief;
- a reference-calibrated writer that cannot safely express a multi-page contract must fail closed or use the existing multi-route path, never silently collapse required routes into `/`.

The accepted design plan records the page strategy, dials, type roles, and signature. The writer does not need to re-emit the plan; the platform supplies it without spending output budget.

### 2. Source pre-flight is hard and bounded

Extend the reference-calibrated source gate and correction safety checks with deterministic findings for:

- direct `site.theme.*` color reads or inline palette styles;
- raw color literals in generated route source;
- `h-screen` instead of viewport-stable `min-h-dvh`;
- missing selected primitive/pattern, missing required facts, wrong route export, missing preview hook, wrong CTA target, or placeholder media;
- repeated generic scaffolding that violates the selected kit (duplicate eyebrows/number markers, identical card grids, technical headings, default renderer fingerprints, or unmotivated decoration);
- visible em/en-dash copy tells where the generated-site policy forbids them;
- duplicate CTA intent or a primary CTA that is not a real accepted action;
- an unbounded route/page shape that conflicts with the platform's page strategy.

Only objective violations become hard failures. Creative judgments remain critic findings so the engine does not flatten every business into one template.

### 3. Rendered browser contrast is real, not merely present

Upgrade the browser subprocess's `computed-contrast` assertion to inspect visible text against its effective rendered background:

- normal/body text requires at least `4.5:1`;
- large text requires at least `3:1`;
- CTA text, labels, helper text, and focus-visible controls are included;
- transparent ancestor backgrounds are resolved up the tree;
- unsupported gradient/image backgrounds are reported as unknown details rather than silently passing;
- the gate remains fail-closed when the browser or evidence is unavailable.

The screenshot evidence remains part of the candidate proof, so a future visual review can still judge hierarchy, type character, density, and business fit.

### 4. Visual critic is advisory but not dishonest

The critic receives the immutable contract, selected taste profile, design plan, kit rubric, browser report, and mobile/desktop screenshots. It must assess:

- whether the hero states the business outcome and next action quickly;
- whether the type hierarchy fits the audience and remains readable;
- whether the page is too simple for the supplied facts or too busy for a sparse brief;
- whether the chosen signature is specific to the business rather than decorative AI grammar;
- whether sections have useful rhythm without card/eyebrow/number repetition;
- whether page-level color, shape, motion, and CTA treatment stay consistent;
- whether the mobile composition is intentional and the customer path remains obvious.

The critic has one call and no write authority. Parse failure, empty output, or transport failure returns `unknown`. A completed report with critical/high findings either consumes the existing single correction when the finding maps to an allowed browser assertion or fails conservatively when it is human-only.

### 5. Quality proof semantics

`GeneratedSiteQualityProofV2` keeps `visual: "unknown"` distinct from `visual: "pass"`. A candidate can have `outcome: "pass"` when response, source, build, and browser gates pass and the visual critic is unknown, because the deterministic quality floor is explicit and the critic did not assert success. The proof must retain the unknown state for observability and future human review.

No malformed critic response may be converted into a visual pass. No failed deterministic gate may be bypassed by a critic response.

## Data flow and boundaries

- `generated-site-design-kits/types.ts` and `catalog.ts` own bounded taste profiles and kit-specific anti-patterns.
- `generated-site-design-plan.ts` owns the platform-supplied plan frame and page/taste record.
- `generated-site-gates.ts` owns source pre-flight findings.
- `scripts/qualify-generated-site.cjs` owns rendered browser assertions and screenshot capture.
- `generated-site-pipeline.ts` owns correction budget and proof outcome.
- `visual-critic.ts` owns read-only visual review parsing and unknown semantics.
- `src/lib/projects/skills/design-quality.md` documents the SOP for future agents and generated-project guidance.
- `.firecrawl/` research files remain ignored local evidence; external pages are not fetched during generation.
- Generated `.data` workspaces remain test artifacts. This change never manually edits generated source.

## Testing requirements

Test-first changes must cover:

1. kit taste profiles and their bounds;
2. single/multi page strategy decisions and the collapse-to-one-page failure case;
3. plan-frame preservation of immutable taste and contract fields;
4. source rejection for theme bypass, common AI tells, and unsafe layout patterns;
5. rendered contrast calculations for passing and failing normal/large text;
6. browser report classification with a failed computed-contrast assertion;
7. critic malformed/empty/transport output as `unknown` without a retry;
8. quality proof acceptance of deterministic pass plus visual unknown, while still rejecting visual fail or critical/high findings;
9. existing focused generator, parser, browser, source-gate, and pipeline regressions.

Verification evidence:

```bash
bun run check
bun test src/lib/projects/generated-site-*.test.ts src/lib/projects/visual-critic.test.ts
```

Then regenerate `cmss98mi8000c4lveqqui7scy` through the engine, inspect both screenshots and persisted gate evidence, and verify its build, browser assertions, quality proof, and preview readiness. No generated route is edited by hand.

## Non-goals

- Changing `default-combo` or selecting another model for one failure.
- Adding Firecrawl or external design libraries to runtime dependencies.
- Copying identities, assets, wording, or palettes from the researched sites.
- Adding a second renderer or an unlimited correction loop.
- Replacing user facts with invented copy, prices, claims, contacts, or assets.
- Treating an aesthetic critic score as a substitute for deterministic accessibility and business-contract gates.
