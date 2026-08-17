# Plan: Anti-Slop High-Impact Generation Engine Implementation

**Spec:** `docs/superpowers/specs/2026-08-17-anti-slop-generation-engine-spec.md`  
**Date:** 2026-08-17  
**Branch:** `dev`

---

## 1. Objectives & Deliverables

1. Upgrade generation prompt taste rules (`src/lib/projects/batched-prompt.ts`) to strictly enforce asymmetrical bento layouts, hero value showcase cards, and zero crude SVG clipart across all UMKM verticals.
2. Ensure layout primitives in `src/lib/projects/scaffold/generated-site-primitives.ts` support flexible spans (`colSpan={2}`, `rowSpan={2}`, multi-column grids) and responsive touch targets.
3. Validate and verify output across single-page and multi-page UMKM archetypes (local services, F&B, retail, professional courses) using live Playwright audits.
4. Pass full quality gates (`bun run check` exit 0) and release cleanly to `main` via `push-main` workflow.

---

## 2. Step-by-Step Task Breakdown

### Task 1: Prompt Engine & Anti-Slop Directives
- Refine `REFERENCE_CALIBRATED_TASTE_RULES` in `src/lib/projects/batched-prompt.ts` with explicit negative constraints:
  - Forbid crude SVG outline drawings and abstract squiggle vectors in image-free mode.
  - Require hero right-hand panel to be a rich Value Showcase Bento (`StatCounter`, `BadgePill`, Lucide icons, USP highlights).
  - Require asymmetrical bento cards (`colSpan={2}` for flagship/popular offering).
- Update unit tests in `src/lib/projects/batched-prompt.test.ts`.

### Task 2: AST Normalization & Surface Contrast Safety
- Maintain robust self-healing in `src/lib/projects/generated-site-gates.ts` to guarantee 100% readable contrast for text inside contrast sections and translucent containers.
- Verify all gate unit tests pass in `src/lib/projects/generated-site-gates.test.ts`.

### Task 3: Live Verification & Screenshot Audit
- Run clean generation rebuilds across real UMKM niches (e.g. `cmswp7d7i011o4l0jw5xd2teg` cuci sepatu, and retail/F&B variants).
- Capture and inspect Playwright full-page screenshots in `.data/audit-artifacts/`.

### Task 4: Release via `push-main`
- Run `bun run check` (format, lint, typecheck, unit tests, knip, docs).
- Push branch, create PR, watch CI checks, and squash-merge into protected `main`.
