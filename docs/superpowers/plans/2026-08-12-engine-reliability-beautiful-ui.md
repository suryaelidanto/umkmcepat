# Engine Reliability + Beautiful UI Consistency Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make batched contract-v1 engine consistently produce selling-ready, beautiful UI for any UMKM brief (no blank Welcome stubs, no TS2307).

**Architecture:** Harden prompt + gate + brief quality as a single pipeline: enrich `implementationSpec` → writer prompt with DESIGN.md tokens + 2 few-shot heroes → deterministic import fixes → beauty gate (site.* + sections) → 2 repair rounds → Vite build.

**Tech Stack:** Bun, TypeScript, Vite + TanStack Start + shadcn/ui + Tailwind v4, 9Router `default-combo`, BullMQ

## Global Constraints
- Use Bun only; keep `bun.lock` canonical
- `bun run check` must pass (format/lint/typecheck/test/knip/docs)
- No `any`, no `Opsi A/B/C` generic, respect `feature.builder_photo_enabled`
- Indonesian UI copy, English code/logs
- `PRINCIPLES.md` + `DESIGN.md` before UI work

---

### Task 1: Harden Batched Writer Prompt with Design Tokens + Few-Shot

**Files:**
- Modify: `src/lib/projects/batched-prompt.ts`
- Test: `src/lib/projects/batched-generator.test.ts`

**Interfaces:**
- Consumes: `ProjectBrief`, `ProjectSiteSchema`, `DESIGN.md` tokens
- Produces: `buildBatchedWriterPrompt()` with embedded tokens + 2 hero examples

- [ ] **Step 1: Write failing test — prompt contains DESIGN.md tokens**
```ts
import { buildBatchedWriterPrompt } from "./batched-prompt";
const prompt = buildBatchedWriterPrompt({ brief, implementationSpec, projectId:"p1", schema });
expect(prompt.user).toMatch(/site\.headline/);
expect(prompt.system).toMatch(/OKLCH|shadcn|text-wrap: balance/);
```

- [ ] **Step 2: Run test to verify it fails**
Run: `bunx vitest run src/lib/projects/batched-generator.test.ts -t "prompt contains design"`
Expected: FAIL

- [ ] **Step 3: Embed DESIGN.md excerpt + 2 few-shot hero blocks in writer prompt**
Add to `buildBatchedWriterPrompt` system: DESIGN.md palette/typography rules + 2 minimal `src/routes/index.tsx` examples that render `site.headline`, `site.primaryCta`, `site.trustPoints`.

- [ ] **Step 4: Run test to verify it passes**
Run: `bunx vitest run src/lib/projects/batched-generator.test.ts -v`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add src/lib/projects/batched-prompt.ts src/lib/projects/batched-generator.test.ts
git commit -m "fix(prompt): embed DESIGN tokens + few-shot heroes in batched writer"
```

### Task 2: Beauty Gate — Reject Stub Unless site.* + Sections

**Files:**
- Modify: `src/lib/projects/batched-generator.ts:224-234` (already landed `Welcome` + `site.*` check, keep)
- Modify: `src/lib/projects/batched-generator.ts` to also require `site.trustPoints` or `site.sections`
- Test: `src/lib/projects/batched-generator.test.ts`

**Interfaces:**
- Consumes: `stagedFiles` Map
- Produces: `collectBatchedGateIssues()` returns issue for blank Welcome without sections

- [ ] **Step 1: Write failing test — stub without site.sections is rejected**
```ts
const staged = new Map([["src/routes/index.tsx", { path:"src/routes/index.tsx", content:`<h1>Welcome</h1>` }]]);
expect(collectBatchedGateIssues(staged, { indexCss:"" }).join(" ")).toMatch(/generic stub/);
```

- [ ] **Step 2: Run test to verify it fails**
Run: `bunx vitest run src/lib/projects/batched-generator.test.ts -t "stub"`
Expected: FAIL until gate added (now passes after prior commit)

- [ ] **Step 3: Add gate for sections/trustPoints**
If `index.tsx` has no `site.trustPoints` or `site.sections` or `site.offer`, push issue.

- [ ] **Step 4: Run test to verify it passes**
Run: `bunx vitest run src/lib/projects/batched-generator.test.ts -v`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add src/lib/projects/batched-generator.ts
git commit -m "fix(gate): require site.sections/trustPoints for beauty"
```

### Task 3: Deterministic Import Normalize (already landed, keep)

**Files:**
- Modify: `src/lib/projects/batched-generator.ts:947-971` (generalized `*usePreviewReady*` → `@/lib/preview-ready`)
- Test: `src/lib/projects/batched-generator.test.ts`

No new steps — verified `TSC:0`, 19 tests pass at `b7adccd`.

### Task 4: Brief Quality — Enrich Headline Before Build

**Files:**
- Modify: `src/lib/projects/brief.ts` or `src/lib/projects/brief-flow.ts` — ensure `headline` not `Beranda` generic
- Test: `src/lib/projects/brief-flow.test.ts`

- [ ] **Step 1: Write failing test — headline Beranda is rejected for build**
```ts
const brief = parseProjectBrief({ businessName:"SuryaPhone", headline:"Beranda", confidence:95 }, "prompt");
expect(hasMinimumBriefForBuild(brief)).toBe(false) // or require headline !== Beranda
```

- [ ] **Step 2: Run test to verify it fails**
Run: `bunx vitest run src/lib/projects/brief-flow.test.ts -t "headline"`
Expected: FAIL

- [ ] **Step 3: In withHandoffReadiness, replace generic headline with benefit-driven from offer**
If `headline` is `Beranda` or empty, set to `${offer} Bergaransi — ${businessName}`.

- [ ] **Step 4: Run test to verify it passes**
Run: `bunx vitest run src/lib/projects/brief-flow.test.ts -v`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add src/lib/projects/brief-flow.ts
git commit -m "fix(brief): enrich generic Beranda headline before build"
```

### Task 5: E2E Verify — cmsphba Builds Non-Stub Beautifully

**Files:**
- Test: manual `bun -e` check of `ProjectSnapshot` for `cmsphba2y00064ldirgtf7bme`

- [ ] **Step 1: Trigger build**
Run enqueue script for `cmsphba2y00064ldirgtf7bme`

- [ ] **Step 2: Wait 8-10min, verify `src/routes/index.tsx` contains `site.headline` and passes `tsc`**
Expected: `site.headline` present, no `Welcome`, `build.finished ok:true`

- [ ] **Step 3: Commit docs if needed**
Update `docs/superpowers/plans` completion note
