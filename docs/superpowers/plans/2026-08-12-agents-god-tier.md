# AGENTS God-Tier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure `AGENTS.md` to ~115-line god-tier bootloader (trust engine, glossary, danger, done, god-tier rules, proactive linter) + 2-line `DEV.md` fix, no other docs deleted.

**Architecture:** In-place restructure of `AGENTS.md`: keep 73-line file's intent but replace volatile bullets with stable map (Sections 1-5 approved). Mirror `no any`/`one-liner`/`solid as hell` to `DEV.md` Core/Cleanliness. Keep `PRINCIPLES.md`/`PRODUCT.md`/`DESIGN.md` frozen.

**Tech Stack:** Markdown, Bun, ESLint (`@typescript-eslint/no-explicit-any` max-warnings 0), `tsc --noEmit`, `prettier --check`, `knip`, `bun scripts/check-doc-links.ts`

## Global Constraints

- No `any` — use `unknown` + narrowing, define shape. No `as any`, no `ts-ignore` without one-liner why (DEV.md Core).
- Comments must be self-explanatory: only one-liner `why` when code looks wrong but is right; delete restating comments.
- Nothing ships without `typecheck + lint + affected tests` green together (`bun run check` before handoff, `bun run verify` does not replace focused checks).
- Use Bun only; `bun.lock` canonical.
- Work from `dev`, PRs into `dev`.
- Product UI copy Indonesian, dev docs/code/logs English.
- Docs are part of change: update canonical doc in same diff if behavior/setup/arch changes.
- Proactive linter: fix violations in/adjacent to touched files NOW.
- Never commit `.env`/secrets; never echo `process.env` values.

---

### Task 1: Restructure AGENTS.md — Sections 1-3 (Special, Glossary, Safety)

**Files:**
- Modify: `AGENTS.md`
- Test: `bun run check:docs` (doc links), `prettier --check` on AGENTS.md

**Interfaces:**
- Consumes: spec Sections 1-3, current `AGENTS.md` (73 lines), `PRODUCT.md`, `DEV.md` Debugging
- Produces: `AGENTS.md` top 60 lines (Read first + What makes special + Glossary + How it works + Where code lives + Three ways + Done + Dev/Test) ready for Task 2 to append Rules

- [ ] **Step 1: Read current AGENTS.md and spec Sections 1-3**

Read `AGENTS.md` fully and `docs/superpowers/specs/2026-08-12-agents-god-tier-design.md` Sections 1-3. Note to keep: `Quick start: bun install → cp .env.example .env → bun run infra → bun run db:migrate → bun run dev` and quality-gate list shape.

- [ ] **Step 2: Write failing doc-links check baseline**

Run: `bun run check:docs`
Expected: PASS on current file (establishes baseline, no broken links after edit).

- [ ] **Step 3: Replace AGENTS.md top half**

Replace in `AGENTS.md`:

Find:
```markdown
## Read first

- `PRINCIPLES.md`: operating taste and quality bar.
- `DEV.md`: local workflow, commands, quality gate, + the **Cleanliness contract** (behavior-preserving refactors, comment hygiene).
- `PRODUCT.md`: required before product positioning, builder flow, generated-project UX, or design-system decisions.
- `DESIGN.md`: required before UI, styling, layout, typography, colors, or components.
- `docs/superpowers/README.md`: how to read specs/plans; many are historical decision trail, not current truth.
- Key modules: `src/lib/s3-client.ts` (MinIO/R2), `src/lib/email.ts` (Resend), `src/lib/analytics.ts` (Umami), `src/lib/waitlist-enabled.ts` (gate toggle), `/media/<assetId>` route, `/admin` dashboard
- Generation engine: contract-v1 only (`generationEngine` is always `contract-v1`; the legacy ToolLoopAgent engine is removed). Build/edit both use the batched/contract streaming writer: `src/lib/projects/batched-response.ts` (streamed `<file>` parser), `src/lib/projects/scaffold/manifest.ts` (auto-derived scaffold manifest), `brief-admission.ts`, `batched-generator.ts`, `batched-edit-targets.ts` + `batched-edit.ts`, wired via `build-attempt-worker.ts` / `edit-attempt-worker.ts`. There is no legacy fallback — a batched failure fails the attempt.
- Observability: `AiCallRecord` table + `src/lib/ai-call-record.ts` (`recordAiCall`, `startAiCallTimer`, ttftMs capture). Query by `turnId`/`attemptId`/`projectId`. Raw payloads stay in `.data/tmp/ai-debug/requests.ndjson` (dev-only).
- Discuss turn: `src/lib/projects/discuss-turn-worker.ts` makes ONE direct call via `getDiscussModel()`. Hedging (the 3-combo parallel race, `discuss.hedging`, `ai.model.discuss_hedge_2/3`, `addEnergyUsageLegs`) is removed.
- Workspace cards: `WorkspaceCard` in `brief.ts` is `none | question | image_upload | build_recommendation`. The `image_upload` card (UI `ImageUploadComposer` in `WorkspacePrimitives.tsx`) collects jpeg/png/webp ≤5MB via `uploadTempImageFile`, single or multiple, always skippable. Answers persist `ProjectBrief.businessImages` (`{id, purpose}`) and are emitted in `briefToBuildPrompt` as `/media/<id> (purpose)` so the build agent's UPLOADED IMAGES placement instruction has real refs. `card-richness.ts` backfills a placeholder on text cards that lack one.
```

Replace with:
```markdown
## Read first

- `PRINCIPLES.md` → taste
- `DEV.md` → workflow + Cleanliness + typecheck/lint/test gate
- `PRODUCT.md` → who/what for
- `DESIGN.md` → tokens/UI
- `docs/superpowers/README.md` → specs/plans are decision trail, trust source over old specs

## What makes UMKM Cepat special

Warm, restrained trust engine for busy Indonesian owners. Four non-negotiables:

1. Trust beats spectacle — visible progress, honest states, no fake awards/prices/addresses
2. One useful path — next action obvious: discuss → build → preview → edit → publish
3. Portable output — generated Vite+Tailwind stands alone, no lock-in
4. 100% free to succeed — every feature works on pilot Energy grant (500k), booster is optional extra, never a paywall

## Glossary

- brief = AI-owned facts/decisions (facts, offer, contact, product)
- turn = one discuss cycle (user message → workspace card)
- attempt = queued build/edit job (BullMQ)
- handoff = spec → build bridge
- scaffold = manifest-derived template (archetype + shadcn)
- project = DB row + .data/project-*

## How it works

brief → discuss-turn-worker (ONE call) → build-planner → batched-generator / batched-edit → scaffold/manifest → generated-source → preview-proxy / runtime-supervisor
One control-plane, many project rows, supervised generated runtimes.

## Where code lives

- `src/lib/projects/` — 224 files: brief-flow, batched-generator, batched-edit, build-attempt-worker
- `src/routes/api.projects.*` — 40 handlers: generate, edit, preview, chat.turn, runtime
- `src/components/projects/Workspace*` — shell, composer, preview
- `src/lib/s3-client.ts` — storage (MinIO local / R2 prod)
- `src/lib/projects/scaffold/` — archetypes + shadcn starter
- Graphify → `bun run graph:update`, read `graph.html` before non-trivial discovery

## Three ways to hurt yourself

1. Killing infra by pattern — never pkill -f, use `bun run dev:reset` (kills only repo-owned PID on 3000)
2. Writing to live `.data/project-*` or `.env` secrets to tracked files — public leak, fix is `sweep:project-orphans`
3. `rm -rf .data` — use `bun run sweep:project-orphans`, thumbnails/snapshots regrow

## Hit every surface — definition of done

Before calling frontend done, check: build+edit both? preview + /media/<id> + thumbnail? /admin? Storybook if reusable UI? brief cards + /media refs emitted?

## Dev servers

`bun run infra` (full) / `infra:minimal` (Postgres+Redis only). App `http://localhost:3000`, `dev.log` at root + `docker compose logs`. Read `dev.log` grepping projectId/turnId first. `bun run dev:logs` tails.

## Test data

Empty DB = bad test. Seed worktree `.data` from real copy (never symlink live), bring `state.sqlite*` with VACUUM, keep secrets only if flow needs it.
```

Keep the existing `## Commands` block verbatim below this.

- [ ] **Step 4: Verify doc links and formatting**

Run: `bun run check:docs && bunx prettier --check AGENTS.md`
Expected: PASS (no broken links, formatted).

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md
git commit -m "docs: restructure AGENTS.md sections 1-3 (special, glossary, safety)"
```

---

### Task 2: Restructure AGENTS.md — Sections 4-5 (God-tier Rules + Linter)

**Files:**
- Modify: `AGENTS.md`
- Test: `bun run check:docs`, `prettier --check`

**Interfaces:**
- Consumes: Task 1's AGENTS.md (with Sections 1-3 done)
- Produces: Complete `AGENTS.md` ~115 lines with Sections 4-5, deduplicated secrets rule

- [ ] **Step 1: Read spec Sections 4-5 and current Rules block**

Read spec Sections 4-5. Note existing `## Rules` block to replace (starts `Optimize for the next capable agent...` through `Open-source mindset...` ~19 bullets).

- [ ] **Step 2: Replace Rules block**

Find existing `## Rules` through end-of-file (before optional remaining Commands duplication). Replace with:

```markdown
## Rules — god-tier

- No any — any is lying to the compiler. Use unknown + narrowing, define the shape. No any, no as any, no ts-ignore / eslint-disable without one-liner why
- Comments — code must be self-explanatory. No // loop over items. Only one-liner why when code looks wrong but is right. Delete the rest
- Solid as hell — nothing ships without typecheck + lint + affected tests green together. CI is not your safety net. Broken = rejected, no excuses
- Small, surgical — one concern per change. 50-line fix beats 500-line refactor. If description says also, split it
- No dead weight — no commented-out code, no dead exports, no TODO without ticket. Knip + typecheck must stay green
- Explicit over clever — boring explicit beats clever abstraction. Deep modules hide complexity behind small stable interfaces
- Fail loud — validate at trust boundaries, fail closed on auth/money/publish, bound time/size/retries/concurrency. Silent fallback is a bug
- Prefer deletion, reuse, platform features, existing deps before adding code
- Optimize for next capable agent with zero context: leave canonical docs/scripts/checks clear enough to resume in minutes
- Use Bun only; keep `bun.lock` canonical; work from `dev`; PRs into `dev`
- User-facing copy Indonesian; dev docs/code/logs English
- Follow `PRODUCT.md`, `DESIGN.md`, `.agents/skills/impeccable` before frontend design; new reusable UI → Storybook in same change
- Use Graphify for non-trivial discovery when available; do not add as project dep

## Docs are part of change — you are the linter

- If behavior/setup/env/architecture/provider/storage/deployment/UI changes, update the canonical doc in the same diff or state why not
- If you see code/docs in/adjacent to your touched files that violate DEV.md (any, restating comments, stale docs, broken typecheck/lint/test) — fix it NOW as part of this change. Don't leave broken windows. You are the linter, not deterministic tools
- Surgical but not blind — touch only what task requires, but fix violations you can see nearby. Mention only truly unrelated breaks
- Verification before completion — no claim without fresh evidence. Run `bun run check` (or nearest focused test + lint + typecheck), read exit code, then claim. "Should pass" is not evidence
- Pre-commit runs `bun scripts/check-staged-fix.ts`; CI is real gate. Never bypass failing gate. Before handoff without push, run `bun run check`
- Do not run `bun run build` unless requested or touching build/deployment
- Never commit `.env`/secrets/private data/uploads/logs/screenshots/.next/.pi/graphify-out/storybook-static; env blocks use empty "" values
- Never echo `process.env` values to terminal/logs; log name + set/unset only. Open-source mindset: every tracked file is public forever
```

Ensure `## Commands` block remains above Rules (from Task 1), and this Rules block is last section.

- [ ] **Step 3: Verify**

Run: `bun run check:docs && bunx prettier --check AGENTS.md && wc -l AGENTS.md`
Expected: PASS, lines ~110-130. Read file to confirm 4× special + glossary + where code lives appear.

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md
git commit -m "docs: restructure AGENTS.md sections 4-5 (god-tier rules, linter)"
```

---

### Task 3: Update DEV.md — No any, one-liner, solid as hell, stale fix

**Files:**
- Modify: `DEV.md`
- Test: `bun run check:docs`, `prettier --check DEV.md`, `bun run lint`, `bun run typecheck` (no code change but validates docs don't break gate)

**Interfaces:**
- Consumes: spec DEV.md Changes, current `DEV.md` (lines: Core rules, Cleanliness contract, Debugging)
- Produces: `DEV.md` with 3 god-tier bullets + hedging fix

- [ ] **Step 1: Read DEV.md Core rules and Debugging**

Locate: `## Core rules` first bullet list, `## Cleanliness contract`, and `## Debugging` paragraph with `Hedged discuss turns record three AiCallRecord rows grouped by turnId`.

- [ ] **Step 2: Edit Core rules — add no any + solid as hell**

In `## Core rules`, after `Keep changes small and reviewable.` insert:

```markdown
- No any — `any` is lying to the compiler. Use `unknown` + narrowing, define the shape. Never `any`, `as any`, or `ts-ignore`/`eslint-disable` without one-liner why.
- Solid as hell — nothing ships without `typecheck + lint + affected tests` green together. CI is not your safety net. Run `bun run check` before handoff.
```

- [ ] **Step 3: Edit Cleanliness contract — one-liner why only**

In `## Cleanliness contract`, replace `Comments explain a non-obvious _why_, never restate...` bullet with:

```markdown
- Comments explain a non-obvious _why_ in one liner, never restate code. Self-explanatory names first; delete obvious/restating comments. `ponytail:` comments mark deliberate simplifications — keep them.
```

Dedupe if needed to one comments bullet.

- [ ] **Step 4: Fix Debugging stale hedging sentence**

Find:
```
Hedged discuss turns record three `AiCallRecord` rows grouped by `turnId`; grep the turnId for the full per-racer picture (`hedged`, `raceRole`, `ttftMs`).
```

Replace with:
```
Discuss turn makes ONE direct call via `getDiscussModel()`; query `AiCallRecord` by `turnId`/`attemptId`/`projectId`. Raw payloads in `.data/tmp/ai-debug/requests.ndjson` (dev-only).
```

- [ ] **Step 5: Verify**

Run: `bun run check:docs && bunx prettier --check DEV.md`
Expected: PASS. Quick sanity: `grep -n "no any" DEV.md` and `grep -n "Solid as hell" DEV.md` both hit.

- [ ] **Step 6: Commit**

```bash
git add DEV.md
git commit -m "docs: harden DEV.md (no any, one-liner why, solid as hell, fix discuss hedging)"
```

---

### Task 4: Verification — Gates, no any, comments hygiene

**Files:**
- Verify only (no new files)
- Test: `bun run check:locks`, `bun run check:docs`, `bun run format:check`, `bun run lint`, `bun run typecheck`, `bun run knip` (via `bun run check`), plus spot any-scan

**Interfaces:**
- Consumes: Tasks 1-3 outputs
- Produces: Evidence that `AGENTS.md` + `DEV.md` land solid-as-hell

- [ ] **Step 1: Run fast gate**

Run: `bun run check`
Expected: PASS. If fails, fix doc formatting/links before proceeding (the spec's files are the change).

- [ ] **Step 2: Spot any-scan + comment hygiene sample**

Run:
```bash
grep -R ":\s*any\b" --include="*.ts" --include="*.tsx" src/lib/projects/brief.ts | head -n 20
grep -R "as any" --include="*.ts" --include="*.tsx" src/ | head -n 20
grep -R "// loop over" --include="*.ts" src/ | head -n 20
```
Expected: `brief.ts` shows no `any` (uses defined types per spec). No `as any` without why. No restating comments in touched files (sanity sample).

- [ ] **Step 3: Final doc diff review**

Run:
```bash
git diff dev --stat
git diff dev -- AGENTS.md DEV.md | head -n 150
wc -l AGENTS.md DEV.md
```
Expected: `AGENTS.md` ~115 lines, `DEV.md` +~4 lines net, no `PRINCIPLES.md`/`PRODUCT.md`/`DESIGN.md` changes. Show diff to reviewer.

- [ ] **Step 4: Handoff**

No commit — this task is verification. Report evidence: `bun run check` output, line counts, any-scan results.

```

