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

---

## Completion note — 2026-08-12 (second pass)

**What shipped (commits on `dev`):**
- `site-schema.ts`: extended `ProjectSiteSchema` with optional rich fields (products, testimonials, faq, socialLinks, currentPromo, hours, paymentMethods, priceRange, address, deliveryArea, tagline, usp). `createProjectSiteSchemaFromBrief` now populates them from the brief; `parseProjectSiteSchema` round-trips them. Data-driven: empty fields are skipped by the gate so a minimal 2-field brief is not penalized.
- `implementation-spec.ts`: `buildSpecFromBrief` `content` + `components` now mirror the rich fields — the writer prompt tells the AI what to render, not just headline/offer.
- `batched-prompt.ts`: added hero #3 (full multi-section catalog landing page rendering hero + promo + products + testimonials + FAQ + social links) + a RENDER COMPLETENESS RULE section. Research-backed (DigitalOcean few-shot best practices: 3-4 examples is the sweet spot, align examples to task complexity).
- `batched-generator.ts`: new AST-backed completeness gate. `collectBatchedGateIssues` now (a) bans starter boilerplate ("Read the Blog", "View on GitHub", `/blog`, `github.com`, "MDX Ready"), (b) parses staged `site.ts` with a regex to detect populated fields, (c) parses `index.tsx` with the TypeScript compiler and walks the AST to verify each populated `site.*` field is rendered inside JSX (not just mentioned in a comment or unused variable). This is the deterministic semantic validator — no second AI call, instant, free.
- `brief-flow.ts` + `brief-admission.ts`: loosened the minimum buildable brief from 5 fields (businessName + offer + targetCustomer + contactOrCta + stylePreference) to 2 (businessName + offer). Rich fields are optional; a build can start as soon as identity + offering are known. Removed the SuryaPhone-specific `targetCustomer` fallback (dead under the new 2-field minimum).
- Tests: `batched-generator.test.ts` (+3 gate tests: boilerplate rejection, completeness rejection, minimal-brief not penalized), `brief-admission.test.ts` (rewritten for 2-field minimum).

**What was deliberately skipped (YAGNI):**
- AI validator agent (second model call) — the deterministic AST gate catches the actual failure mode (boilerplate + unrendered data) without +30-60s latency/cost. Upgrade ceiling: a separate AI validator pass for subjective aesthetic review, when the deterministic floor is proven insufficient.
- Headless E2E behavioral verification — separate plan, bigger lift (Playwright infra). The manual build re-run is the proof for now.
- Per-component AI calls (the old multi-call flow) — the batched text-contract design stays; it is more reliable than multi-call. The fix was the prompt + gate, not the architecture.

**Not yet done (future):**
- Re-seed the `cmsphba2y00064ldirgtf7bme` DB row and re-run a build to verify the engine emits good output end-to-end. Blocked on DB reconstruction (DB was deleted; `site.ts` survived on disk and is the source of truth). Tracked separately.
- Headless render verification (open built preview, assert hero text + product cards + FAQ items present). Separate plan.

**Research backing:** Firecrawl search + scrape of DigitalOcean (few-shot best practices), dev.to Teemu Piirainen 8-gate system (quality is a pipeline not a checkpoint; acceptance criteria are the contract; independent validator), Autonoma vibe-coding quality gate (catch what code review misses; five-layer stack). Artifacts in `.firecrawl/` (gitignored).
