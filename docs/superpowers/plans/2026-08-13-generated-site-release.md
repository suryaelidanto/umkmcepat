# Generated Site Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make contract-v1 generation deterministic enough to qualify the accepted Aisyah Collection landing once, prove every release metric, then push `dev` and merge/push `main`.

**Architecture:** Keep one deterministic contract route for accepted contract-v1 landings; apply small normalizers before source gates. Use source gate → Vite build → mobile/desktop browser gates → advisory visual critic only for AI-generated routes → persisted artifacts. Release only from a fresh terminal success.

**Tech Stack:** Bun, TypeScript, Vitest, Prisma/Postgres, BullMQ/Redis, Vite/TanStack React generated runtime, Playwright browser gates, GitHub Actions.

## Global Constraints

- Use Bun only; `bun.lock` remains canonical.
- Customer-facing copy is Indonesian; system prompts and code comments are English.
- Accepted handoff facts are immutable; WhatsApp target is `08123456789`.
- Composer uploads are disabled; generated customer output contains no placeholder images.
- Contract mode emits only `src/routes/index.tsx`; never hand-edit generated snapshots/artifacts.
- No `any`, `as any`, `ts-ignore`, or unrequested abstractions.
- One fresh rebuild after final code changes; no unbounded retry.
- Deterministic contract routes skip advisory visual-critic sampling after source/browser gates pass.
- Do not run `bun run build` unless requested; generated Vite build is part of the project E2E gate.
- Do not push `main` until local checks and `dev` CI are green.

---

### Task 1: Preserve the release record

**Files:**
- Create: `docs/superpowers/specs/2026-08-13-generated-site-release-design.md`
- Create: `docs/superpowers/plans/2026-08-13-generated-site-release.md`

**Interfaces:**
- Produces the accepted scope, hard metrics, bounds, evidence fields, and execution order used by Tasks 2–5.

- [x] **Step 1: Write the design spec**

Record the accepted handoff, deterministic fixes, qualification layers, failure policy, and numeric acceptance metrics. Keep out of scope: authenticated UI impersonation, new dependencies, platform redesign, generated-artifact edits.

- [x] **Step 2: Self-review the spec**

Run:

```bash
rg -n "TBD|TODO|later|appropriate|handle edge|similar to|\\bshould\\b" docs/superpowers/specs/2026-08-13-generated-site-release-design.md

git diff --check
```

Expected: no placeholder matches; zero diff errors.

- [x] **Step 3: Write this implementation plan**

Keep tasks bounded to contract generation, deterministic normalization, verification, and release. Do not add a new architecture.

---

### Task 2: Lock deterministic contract behavior with tests

**Files:**
- Modify: `src/lib/projects/generated-site-recipes.test.ts`
- Modify: `src/lib/projects/generated-site-gates.test.ts`
- Modify: `src/lib/projects/generated-site-contract.test.ts`

**Interfaces:**
- Consumes: `selectGeneratedSiteRecipe`, `normalizeBatchedSiteAnchors`, `compileGeneratedSiteContract`.
- Produces: regression coverage proving retail selects `retail-catalog`, empty hash CTAs become the accepted WhatsApp link, wrong preview-ready imports canonicalize, and internal source facts do not become customer copy.

- [x] **Step 1: Add the retail recipe regression**

Test:

```ts
it("keeps retail on the catalog recipe instead of the generic fallback", () => {
  expect(selectGeneratedSiteRecipe("retail").id).toBe("retail-catalog");
});
```

- [x] **Step 2: Run the focused test and verify the old behavior fails**

Run:

```bash
bunx vitest run --project unit src/lib/projects/generated-site-recipes.test.ts
```

Expected before implementation: failure showing `retail` resolves to `generic`.

- [x] **Step 3: Add the empty-hash and import-normalization regressions**

Test the input `<a href="#">{site.primaryCta}</a>` against `https://wa.me/628123456789?text=Halo`, and test `@/lib/use-preview-ready` against `@/lib/preview-ready`.

- [x] **Step 4: Run the focused gate test and verify the old behavior fails**

Run:

```bash
bunx vitest run --project unit src/lib/projects/generated-site-gates.test.ts
```

Expected before implementation: empty-hash and wrong-import tests fail; existing tests remain green.

- [x] **Step 5: Add public-copy regression expectations**

Keep the existing contract test expectations for stable iPhone copy, and add coverage that internal phrases such as `Produk utama katalog` are replaced by customer-facing benefit copy.

- [x] **Step 6: Run all affected tests**

Run:

```bash
bunx vitest run --project unit src/lib/projects/generated-site-recipes.test.ts src/lib/projects/generated-site-gates.test.ts src/lib/projects/generated-site-contract.test.ts
```

Expected after implementation: all affected tests pass.

---

### Task 3: Implement the minimum deterministic fixes

**Files:**
- Modify: `src/lib/projects/generated-site-recipes.ts`
- Modify: `src/lib/projects/generated-site-gates.ts`
- Modify: `src/lib/projects/generated-site-contract.ts`
- Modify: `src/lib/projects/batched-prompt.ts`
- Modify: `src/lib/projects/batched-generator.ts`
- Modify: `src/lib/projects/site-generation.ts`
- Modify: matching tests from Task 2 and existing generator tests

**Interfaces:**
- Consumes: accepted contract/recipe data; staged generated files.
- Produces: compact contract writer prompt; normalized `GeneratedProjectFile[]`; public `GeneratedSiteContractV1`; bounded gate diagnostics.

- [x] **Step 1: Map the current failure path before edits**

Confirm the prior terminal errors:

```bash
bun -e 'import { prisma } from "./src/lib/prisma.ts"; const a=await prisma.projectEditAttempt.findMany({where:{projectId:"cmsr7u7jw00054lo6y7b0t5k7"},orderBy:{createdAt:"desc"},take:3,select:{id:true,status:true,errorMessage:true}}); console.log(a); await prisma.$disconnect();'
```

Expected: earlier failures include wrong recipe, missing/incorrect imports, and failed qualification.

- [x] **Step 2: Route `retail` to `retail-catalog`**

Remove `retail` from the generic recipe compatibility list; retain it in the retail-catalog compatibility list. The recipe map must resolve `selectGeneratedSiteRecipe("retail").id` to `retail-catalog`.

- [x] **Step 3: Normalize generated route imports**

In `normalizeBatchedSiteAnchors`, replace only the known wrong import string:

```ts
content = content.replaceAll(
  "@/lib/use-preview-ready",
  "@/lib/preview-ready",
);
```

Do not create alias files or accept platform-owned file emission.

- [x] **Step 4: Normalize empty/hash CTAs only when the contract has a target**

Use the existing WhatsApp normalization. Match `href="#"` as well as named hash anchors. Preserve hash anchors when no target exists. Keep `min-h-11` touch-target enforcement.

- [x] **Step 5: Keep contract writer output compact**

For `contract` mode, emit a short prompt containing the immutable contract, exact design plan, one route file, seeded imports, semantic Tailwind rules, visible-field requirements, and exact output tags. Do not include the full scaffold manifest or gold example source in the contract prompt.

- [x] **Step 6: Keep repair responses contract-safe**

Pass `contract` and `requireDesignPlan` into targeted repair. Require the exact design plan first and only the implicated editable files. Reject/ignore platform-owned and out-of-scope repair files.

- [x] **Step 7: Derive public copy without internal notes**

Keep accepted facts unchanged. Replace internal descriptions/taglines matching `katalog jadi hero`, `produk utama katalog`, `info jelas`, `online murni`, or `tujuan utama` with concise Indonesian benefit copy. Do not invent phone, price, address, stock, awards, or guarantees.

- [x] **Step 8: Run affected checks**

Run:

```bash
bunx prettier --write src/lib/projects/batched-prompt.ts src/lib/projects/batched-generator.ts src/lib/projects/generated-site-contract.ts src/lib/projects/generated-site-gates.ts src/lib/projects/generated-site-recipes.ts src/lib/projects/*.test.ts
bunx vitest run --project unit src/lib/projects/batched-generator.test.ts src/lib/projects/generated-site-contract.test.ts src/lib/projects/generated-site-gates.test.ts src/lib/projects/generated-site-recipes.test.ts
```

Expected: exit 0 and all listed tests pass.

---

### Task 4: Run local verification and one fresh E2E build

**Files:**
- No additional source files; inspect generated evidence only.
- Do not commit `.data`, `.env`, logs, screenshots, or temporary scripts.

**Interfaces:**
- Consumes: code from Task 3, accepted handoff `cmsrakg2f00014lq8t0tplmvb`, project `cmsr7u7jw00054lo6y7b0t5k7`.
- Produces: one terminal `ProjectEditAttempt`, source snapshot, dist artifact, browser evidence, preview/thumbnail evidence, and numeric release scoreboard.

- [x] **Step 1: Run the full local gate**

Run:

```bash
bun run check
```

Expected: format, lint, typecheck, test, Knip, and docs each report success.

- [ ] **Step 2: Restart only the repo-owned attempt worker with current code**

Stop the exact standalone worker PID after the current stale attempt reaches terminal state. Start the worker with:

```bash
nohup bun -e 'import { startAttemptQueueWorker } from "./src/lib/projects/attempt-queue.ts"; startAttemptQueueWorker(); setInterval(() => {}, 60_000);' >/tmp/umkmcepat-attempt-worker.log 2>&1 &
```

Do not use `pkill -f`; do not start duplicate workers.

- [ ] **Step 3: Enqueue exactly one fresh build**

Run the existing owner-checked `/tmp/rebuild-aisyah.ts` only after the worker imports current source. Record its `attemptId`, `buildId`, and `snapshotId`.

- [ ] **Step 4: Poll terminal state with a hard limit**

Poll the attempt/build every 20 seconds for at most 8 minutes. Stop on `succeeded` or `failed`. Record the exact `errorMessage` on failure; do not enqueue another attempt.

- [ ] **Step 5: Verify source/build/browser evidence**

For a successful attempt, verify:

```text
Project.status = ready
Project.buildStatus = passed/ready
ProjectEditAttempt.status = succeeded
ProjectBuild.status = succeeded
snapshot sourceRef is non-empty
build artifactRef is non-empty
qualityProof.outcome = pass
qualityProof.browserGateStatus = pass
```

Read both gate reports from S3. Count 12 assertions per viewport: required-content-visible, primary-cta, internal-links, overflow, heading-overflow, image-health, media-policy, contrast, focus, touch-target, route-load, console-clean. Required total: `24/24`.

- [ ] **Step 6: Verify preview and thumbnail**

Fetch the project preview endpoint and inspect the thumbnail/build refs. Expected: HTTP 200, visible Indonesian content, no raw `site.ts` source, and a non-empty thumbnail ref.

---

### Task 5: Commit, push `dev`, merge/push `main`, and return to `dev`

**Files:**
- Modify only tracked implementation files and the two docs from Tasks 1–3.

**Interfaces:**
- Consumes: fresh local gate and E2E evidence from Task 4.
- Produces: clean `dev` commit, green `dev` CI, merged/pushed `main`, green `main` CI, local branch `dev`.

- [ ] **Step 1: Inspect tracked changes**

Run:

```bash
git status --short
git diff --check
git diff --stat
```

Expected: only the 10 implementation/test files plus the spec and plan; no secrets, generated artifacts, lockfile pollution, or temp scripts.

- [ ] **Step 2: Re-run local verification before commit**

Run:

```bash
bun run check
```

Expected: 6/6 local checks pass.

- [ ] **Step 3: Commit on `dev`**

Stage only the reviewed files and commit:

```bash
git add docs/superpowers/specs/2026-08-13-generated-site-release-design.md docs/superpowers/plans/2026-08-13-generated-site-release.md src/lib/projects/batched-generator.test.ts src/lib/projects/batched-generator.ts src/lib/projects/batched-prompt.ts src/lib/projects/generated-site-contract.test.ts src/lib/projects/generated-site-contract.ts src/lib/projects/generated-site-gates.test.ts src/lib/projects/generated-site-gates.ts src/lib/projects/generated-site-recipes.test.ts src/lib/projects/generated-site-recipes.ts src/lib/projects/site-generation.ts
git commit -m "fix(generation): harden contract landing builds

Co-Authored-By: Claude <noreply@anthropic.com>"
```

- [ ] **Step 4: Push `dev` and block on CI**

Run:

```bash
git push origin dev
RUN_ID=$(gh run list --branch dev --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch "$RUN_ID" --exit-status
```

Expected: CI exits 0. If not, read failed logs and apply the repository CI-fix workflow before continuing.

- [ ] **Step 5: Merge and verify `main`**

Run:

```bash
git checkout main
git pull origin main
git merge dev --no-edit
bun run check
git push origin main
```

Expected: merge clean, local checks pass, push succeeds.

- [ ] **Step 6: Block on `main` CI and return to `dev`**

Run:

```bash
RUN_ID=$(gh run list --branch main --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch "$RUN_ID" --exit-status
git checkout dev
git status --short
```

Expected: main CI exits 0; current branch is `dev`; worktree clean.

- [ ] **Step 7: Produce the evidence report**

Report exact IDs, `24/24` browser result, `6/6` local checks, artifact refs, preview/thumbnail status, commit SHA, dev/main CI run IDs, and any explicitly unperformed authenticated UI test. Do not claim completion without fresh output for every hard metric.
