# Archetype-Driven Generation — Kill Template-Ish Output Per Business Shape

**Status:** Design — awaiting approval.
**Date:** 2026-07-27.
**Author:** brainstorming session.

## Context

Every generated UMKM Cepat project reads as template-ish: same hero, same `/kontak` route, same section skeleton (Hero → Fitur → Testimoni → Kontak), regardless of whether the business is a warung, a plumber, or a course seller. The user wants the output to "push the boundary harder" — feel designed, not stamped.

The user's first instinct was 100 UMKM-niche `.md` guidance files + 25 generic fallbacks. After discussion this was rejected: 100 niches collapse into ~16-20 real structural archetypes with heavy overlap; 100 files rot, bloat tokens, and force a fragile matching subsystem. The fallback count of 25 was also rejected — 25 templates "wearing a fallback costume" re-create the exact template-ism being killed. The validated direction: a small set of archetype guidance docs (one per *structure*, not label) + **one** generic-fallback doc written as a decision framework, not a template.

The machinery for AI-decided structure **already exists**:

- `src/lib/projects/implementation-spec.ts` — `implementationSpecTool` lets AI pick `appKind: landing | marketing_site | interactive_app`, `pages[]` (1-6), `components[]` (2-10), `features[]`, `style.palette`, `primaryCta`. `parseImplementationSpec` validates; `implementationSpecFromBrief` is the deterministic fallback.
- `src/lib/projects/site-generation.ts` — `projectSiteGenerationSystemPrompt` already says "Do not force every request into a landing page" and "Prefer specific structure, pages, components, and features over generic landing-page sections."
- `src/routes/api.projects.$id.generate.ts` (~line 637) — runs the spec call, then feeds `implementationSpec` into the source generator.
- `src/lib/projects/custom-source-generator.ts` (~line 2061, `buildGeneratedAppAgentInstructions`) — builds the prompt the source-gen agent sees. It echoes `appKind`, `pages`, `components`, `features`, and a "Build intent" block, but carries **no per-shape guidance** — this is where the safe default skeleton is born, because nothing forces divergence by business specifics.

So "template-ish" is an AI-output-quality gap, not a missing-templates gap. The fix is injecting per-shape guidance at the two points that decide output: the **spec call** (which structure to pick) and the **source-gen prompt** (how to build it). No presets, no classifier service, no new AI call, no user-facing step.

## Goal

Break the default skeleton by giving the source-gen agent **concrete, per-archetype divergence guidance** (recommended sections, sections to AVOID, page-count logic, CTA logic, visual hooks, one example structure) loaded automatically based on an archetype the AI names in its existing spec output. The user sees nothing new; divergence happens behind the existing spec → build flow.

## Non-goals

- **No 100 niche files, no 25 fallbacks.** ~16-20 archetype docs + 1 generic-fallback. Final count flexible 16-20; 16 listed here, 2-4 buffer for authoring-time additions (transport/delivery, dropship, school-canteen).
- **No new AI call, no classifier service.** The AI names the archetype inside the existing `implementationSpecTool` call. Server loads one doc.
- **No discuss-phase change.** No new user-facing question, no UI, no DB column. The archetype lives in the snapshot's persisted spec (already serialized). The user flow stays: prompt → discuss → build.
- **No migration of existing projects.** Only new builds use archetype guidance; old specs without an `archetype` field fall through to the generic fallback doc.
- **No per-archetype new dependencies or scaffolding.** Pure prompt + loader plumbing.

## Design

### The archetype library

New directory `src/lib/projects/archetypes/`. Each archetype is one `.md` file:

```
src/lib/projects/archetypes/
  _index.md              # compact index: id + one-line description, loaded into the spec call
  fnb-menu.md
  fnb-light.md
  retail-catalog.md
  retail-grocery.md
  service-area.md
  service-appointment.md
  service-online.md
  education-course.md
  professional-credibility.md
  community-group.md
  event-promo.md
  property-rental.md
  health-beauty.md
  creative-portfolio.md
  agri-produce.md
  generic-fallback.md
```

Final 16; buffer for 2-4 more during authoring (transport/delivery, dropship, school-canteen). Count capped deliberately — see "Why not 100" in Context.

Each archetype `.md` follows one fixed structure (so the loader and the AI read them uniformly):

1. **`id`** — the slug the AI emits in `spec.archetype`. Must match the filename stem.
2. **`matches`** — 2-4 one-line business shapes this archetype covers (helps the AI pick + helps humans audit coverage).
3. **`recommended_sections`** — named sections with a one-sentence *why* each fits this shape. e.g. for `fnb-menu`: "Menu board — daily-changing menu is the core product; a static feature grid is wrong."
4. **`avoid_sections`** — the anti-template lever. Sections the AI reaches for by default that do NOT fit. e.g. for `service-online`: "Testimoni carousel — avoid unless real client quotes exist; a freelance service gains trust from portfolio + packages, not fabricated testimonials."
5. **`page_count`** — guidance keyed to `appKind`. e.g. "landing = single page; marketing_site = 2-3 pages justified by content volume, not by default."
6. **`cta_logic`** — the primary CTA for this shape and when `secondaryCta` applies. e.g. for `service-appointment`: "Primary = book/reserve; secondary = WhatsApp only if booking is the real bottleneck."
7. **`visual_hooks`** — 2-3 business-specific visual metaphors (not a fixed palette — palettes come from the spec). e.g. for `retail-catalog`: "product-forward grid, price legible, not a hero with abstract gradient."
8. **`example_structure`** — one concrete section sequence the AI may follow or depart from. Departure is encouraged when justified.

`generic-fallback.md` is **not** a mini-template. It is a decision framework keyed off `appKind`:

1. Read the brief. Decide the goal (sell / inform / book / persuade).
2. Use `appKind` to decide breadth (landing vs marketing_site vs interactive_app).
3. Pick page count by justifying each page — no justification = no page.
4. Pick sections by justifying each against the goal — no justification = drop it.
5. Pick CTA by goal, not by default ("Hubungi Kami" banned unless contact is genuinely the goal).
6. Pick visual direction from business specifics, not a generic palette.

The fallback is forceful by authoring strength, not by file count.

### The spec call: pick the archetype

`src/lib/projects/site-generation.ts` — append a compact archetype index to `projectSiteGenerationSystemPrompt`. The index is the contents of `_index.md` (id + one-line description per archetype, ~20 lines), sourced via `loadArchetypeIndex()` at module load. The AI reads it during the existing spec call and names one archetype in the tool output. No extra AI round-trip.

### The spec schema: carry the archetype

`src/lib/projects/implementation-spec.ts`:

- `ImplementationSpec` gains `archetype: string` (the id the AI picked).
- `implementationSpecTool.inputSchema` gains `archetype: z.string()`.
- `parseImplementationSpec`: validate `archetype` against the known id set (loaded from the archetypes dir, see loader). Unknown / empty → fall back to `generic` (mapped to `generic-fallback.md`). The build must never fail on a bad archetype id.
- `implementationSpecFromBrief` (deterministic fallback): set `archetype` from `brief.businessType` via a small static map (`fnb → fnb-menu`, `retail → retail-catalog`, `jasa_lokal → service-area`, `jasa_online → service-online`, `kursus → education-course`, `other → generic`). This map is the only deterministic selection; the AI path is preferred, the map is the safety net.

### The loader: one doc into the build prompt

New `src/lib/projects/archetypes/index.ts`:

- Exports `ARCHETYPE_IDS: string[]` — an explicit registry array (not a directory scan), so selection is testable and there are no filesystem reads at module-load. Each entry matches a `.md` filename stem in the same dir.
- Exports `loadArchetypeGuide(id: string): string` — returns the `.md` content for `id`, or `generic-fallback.md` for unknown/`generic`. Imports each doc via `?raw` so the strings are bundled, not read from disk at runtime.
- Exports `loadArchetypeIndex(): string` — returns the `_index.md` content, for injection into the spec-call system prompt.
- Pure, unit-testable: given an id, returns the right doc; given garbage, returns the fallback. No agent-tool-runner dependency.

`src/lib/projects/custom-source-generator.ts` (~`buildGeneratedAppAgentInstructions`, line 2096): when `implementationSpec.archetype` is present, inject `loadArchetypeGuide(spec.archetype)` into the build prompt as a dedicated **Archetype guidance** block, placed *before* the "Build intent" block so the shape logic frames the build. The block is the full `.md` for the matched archetype only (one doc, not all 16).

### The prompt change that forbids the default skeleton

`src/lib/projects/site-generation.ts` — add a negative constraint to the system prompt:

> "Do NOT emit the default skeleton (Hero → Fitur → Testimoni → Kontak) unless the matched archetype's guidance explicitly justifies each section. If you cannot justify a section against this business, drop it or replace it with a section the archetype recommends. A justified absence beats a generic presence."

This lives in the prompt and is reinforced by each archetype's `avoid_sections`. It is the rule that turns "AI plays safe" into "AI must justify or drop."

### Selection + fallback flow

```
discuss brief ──► generateImplementationSpec()
                   │  system prompt includes archetype _index.md
                   │  AI picks appKind + pages + components + archetype
                   ▼
                 parseImplementationSpec()
                   │  validate archetype id against ARCHETYPE_IDS
                   │  unknown/empty → archetype = "generic"
                   ▼
                 buildImplementationSpecPrompt + briefToBuildPrompt
                   │
                   ▼
                 generateCustomProjectFilesWithAgent()
                   │  buildGeneratedAppAgentInstructions injects
                   │  loadArchetypeGuide(spec.archetype) as a block
                   │  + the "justify or drop" rule
                   ▼
                 source-gen agent writes divergent, shape-fit files
```

Fully automatic. User sees nothing new. No discuss-phase change.

## Testing

- **`archetypes/index.test.ts`** — one runnable check: every `ARCHETYPE_IDS` entry resolves to a non-empty doc; unknown id → `generic-fallback.md`; `generic` → `generic-fallback.md`; `loadArchetypeIndex()` returns non-empty text.
- **`implementation-spec.test.ts` (extend)** — `parseImplementationSpec` accepts an `archetype`; unknown archetype falls back to `generic` without rejecting the spec; `implementationSpecFromBrief` maps each `businessType` to the expected archetype.
- **No new test for the prompt text itself** — the prompt is prose; the loader + spec tests cover the wiring. (Trivial wiring needs no test.)
- **No behavioral E2E** in this change — divergence quality is verified by eyeballing generated output across 3-4 archetypes post-build, not by an automated assertion (a generated-site "is not template-ish" is not an assertable predicate). This is a deliberate simplification: `ponytail:` add a visual-diff snapshot suite if regression on divergence becomes a real concern.

## Open questions

- **Authoring the 16 docs is the bulk of the work.** The plumbing is small (~1 loader + spec field + prompt block). The plan should sequence plumbing-first (so the loader + spec + prompt land and build green with only `generic-fallback.md` authored), then author archetypes in batches. This keeps the tree green between archetype additions.
- **Should the archetype id be persisted on `Project` for analytics?** Out of scope here (no DB change in this spec). If wanted later, the snapshot's spec already carries it; a derived column is a separate task.
