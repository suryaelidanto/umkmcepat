# Canonical Brief and Build Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make one canonical brief, one readiness preflight, and one immutable accepted handoff govern discussion, build cards, API acceptance, and generated-site inputs.

**Architecture:** AI tool payloads remain permissive at the trust boundary but normalize immediately into `ProjectBriefV2`. A pure `evaluateBuildReadiness()` function authorizes handoff preparation; successful handoffs freeze the canonical brief and hashes. Contract builds require that handoff at UI, API, and worker boundaries, and generation derives every factual projection from the accepted snapshot rather than the mutable project row.

**Tech Stack:** Bun, TypeScript, Zod, Prisma/PostgreSQL, TanStack Start/React, Vitest.

## Global Constraints

- Use Bun only; `bun.lock` remains canonical.
- Work and commit directly on local `dev`, as requested; do not push unless requested later.
- Write a failing focused test before each production behavior change and observe the expected failure.
- Make one atomic conventional commit per task.
- User-facing copy is Indonesian; developer code, tests, logs, and docs are English.
- Do not log owner values, contacts, addresses, raw briefs, secrets, screenshots, or generated private data.
- AI confidence never authorizes or blocks a build.
- A blocked preflight creates no attempt and charges no Energy.
- `contract-v1` never falls back because handoff fields are absent.
- Accepted build inputs are immutable and hash-linked; later project-brief changes do not affect an existing attempt.
- Preserve historical accepted handoffs; draft/stale cards may be invalidated.
- Do not invent missing owner facts during migration.

---

### Task 1: Canonical Brief V2 and Legacy Migration

**Files:**
- Create: `src/lib/projects/canonical-brief.ts`
- Create: `src/lib/projects/canonical-brief.test.ts`
- Modify: `src/lib/projects/brief.ts`

**Interfaces:**
- Produces: `ProjectBriefV2`, `CanonicalPrimaryAction`, `createInitialCanonicalBrief(prompt)`, `parseCanonicalBrief(value, prompt)`, `migrateLegacyBrief(value, prompt)`, `hashCanonicalBrief(brief)`.
- Legacy input conversion prefers typed rich values and only uses legacy summary fields when rich values are absent.

- [ ] **Step 1: Write migration tests**

Cover:

```ts
it("promotes a legacy offer when productOrService is missing", () => {
  const brief = parseCanonicalBrief({
    businessName: "HP Surya",
    businessType: "retail",
    offer: "HP bekas semua merek",
    productOrService: null,
    contactOrCta: "Lihat stok & harga",
    contact: null,
  });
  expect(brief.offers).toEqual([
    { name: "HP bekas semua merek", isPrimary: true },
  ]);
  expect(brief.primaryAction).toEqual({
    kind: "browse",
    label: "Lihat stok & harga",
    target: null,
  });
});

it("prefers rich typed values over conflicting legacy summaries", () => {
  const brief = parseCanonicalBrief({
    offer: "Wrong summary",
    productOrService: [{ name: "iPhone 13", isPrimary: true }],
    contactOrCta: "Wrong action",
    contact: { channel: "whatsapp", value: "08123456789", label: "Chat stok" },
  });
  expect(brief.offers[0]?.name).toBe("iPhone 13");
  expect(brief.primaryAction).toMatchObject({
    kind: "whatsapp",
    label: "Chat stok",
    target: "08123456789",
  });
});
```

Also verify V2 round-trip, invalid rich items are dropped, no contact target is inferred from a legacy label, and equal canonical briefs hash equally.

- [ ] **Step 2: Run RED**

Run: `bunx vitest run src/lib/projects/canonical-brief.test.ts`

Expected: FAIL because `canonical-brief.ts` does not exist.

- [ ] **Step 3: Implement the canonical types and parser**

Use the exact persisted shape from the approved spec. Reuse leaf types from `brief-rich-fields.ts`. Normalize strings, arrays, primary offer, contact channels, content arrays, assets, field state, and provenance. Hash with existing `canonicalJson()` plus a versioned prefix.

The legacy contact conversion is exact:

```ts
function legacyPrimaryAction(input: LegacyBriefLike): CanonicalPrimaryAction | null {
  const contact = parseContact(input.contact);
  if (contact) {
    return {
      kind: contact.channel,
      label: contact.label?.trim() || defaultContactLabel(contact.channel),
      target: contact.value,
    };
  }
  const label = cleanOptionalText(input.contactOrCta);
  return label ? { kind: "browse", label, target: null } : null;
}
```

- [ ] **Step 4: Run GREEN and nearby brief tests**

Run: `bunx vitest run src/lib/projects/canonical-brief.test.ts src/lib/projects/brief.test.ts src/lib/projects/brief-rich-fields.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/projects/canonical-brief.ts src/lib/projects/canonical-brief.test.ts src/lib/projects/brief.ts
git commit -m "feat(brief): add canonical brief v2 migration"
```

### Task 2: One Build Readiness Authority

**Files:**
- Create: `src/lib/projects/build-readiness.ts`
- Create: `src/lib/projects/build-readiness.test.ts`
- Modify: `src/lib/projects/discuss-readiness-ui.ts`

**Interfaces:**
- Consumes: `ProjectBriefV2` from Task 1.
- Produces: `evaluateBuildReadiness(brief): BuildReadiness`, `BuildReadinessBlocker`, and `createReadinessQuestion(blocker)`.

- [ ] **Step 1: Write readiness tests**

Test each core blocker (`business.name`, `offers`, `primaryOffer`, `audience`, `primaryAction`, `visualDirection`), target-required action validation, explicit browse action acceptance, category-specific unresolved fields, answered/declined/explicitly-empty resolution, and deterministic blocker ordering.

```ts
expect(evaluateBuildReadiness(incomplete)).toMatchObject({
  state: "blocked",
  blockers: [{ field: "offers" }],
  nextQuestion: { id: "offers" },
});
```

- [ ] **Step 2: Run RED**

Run: `bunx vitest run src/lib/projects/build-readiness.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the pure evaluator**

Core order is business name, offers, primary offer, audience, primary action, visual direction, then applicable structural fields. Values are resolved from canonical fields and `fieldState`; AI confidence is not an input.

- [ ] **Step 4: Adapt Indonesian readiness questions**

Replace `DiscussReadinessBlocker` use in `discuss-readiness-ui.ts` with canonical blocker fields and keep one-question-per-turn behavior.

- [ ] **Step 5: Run GREEN**

Run: `bunx vitest run src/lib/projects/build-readiness.test.ts src/lib/projects/discuss-readiness.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/projects/build-readiness.ts src/lib/projects/build-readiness.test.ts src/lib/projects/discuss-readiness-ui.ts
git commit -m "feat(brief): centralize build readiness"
```

### Task 3: Enforce Readiness Before Any Build Recommendation

**Files:**
- Modify: `src/lib/projects/brief-flow.ts`
- Modify: `src/lib/projects/discuss-turn-worker.ts`
- Modify: `src/lib/projects/brief-flow.test.ts`
- Modify: `src/lib/projects/discuss-turn-worker.test.ts`

**Interfaces:**
- Consumes: `parseCanonicalBrief()` and `evaluateBuildReadiness()`.
- Produces: contract discussion turns that either contain the next required question or a handoff-backed recommendation—never an unprepared recommendation.

- [ ] **Step 1: Add the HP Surya regression**

A normalized tool result containing a proposed build card plus legacy `offer` but unresolved required canonical fields must become the next readiness question. Add a worker test where `prepareBuildHandoff()` returns `state: "failed"`; assert the persisted card is not `build_recommendation`.

- [ ] **Step 2: Run RED**

Run: `bunx vitest run src/lib/projects/brief-flow.test.ts src/lib/projects/discuss-turn-worker.test.ts`

Expected: FAIL because contract projects currently bypass the rich readiness gate and preserve the card after handoff failure.

- [ ] **Step 3: Normalize at the discussion boundary**

Convert persisted V1 or AI patch output into canonical V2 before readiness. AI `readyForBuild`, confidence, and proposed card type are advisory only.

- [ ] **Step 4: Gate all engines and handle preparation failure**

For a blocked brief, call `createReadinessQuestion()` and discard model summary text. For a ready contract brief, call handoff preparation. Only `state: "ready"` produces a recommendation. Structured preparation failure becomes an error/retry state, not a build card.

- [ ] **Step 5: Run GREEN**

Run: `bunx vitest run src/lib/projects/brief-flow.test.ts src/lib/projects/discuss-turn-worker.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/projects/brief-flow.ts src/lib/projects/discuss-turn-worker.ts src/lib/projects/brief-flow.test.ts src/lib/projects/discuss-turn-worker.test.ts
git commit -m "fix(discuss): block recommendations until handoff is ready"
```

### Task 4: Freeze Canonical Briefs in Handoffs

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260813100000_add_handoff_brief_snapshot/migration.sql`
- Modify: `src/lib/projects/build-handoffs.ts`
- Modify: `src/lib/projects/build-planner.ts`
- Modify: `src/lib/projects/build-handoffs.test.ts`
- Modify: `src/lib/projects/build-planner.test.ts`

**Interfaces:**
- `ProjectBuildHandoff` gains `briefSnapshot`, `briefHash`, and `briefRevision` for new handoffs.
- `prepareBuildHandoff()` consumes canonical brief and returns a complete recommendation payload.
- `loadAcceptedHandoffForAttempt()` returns `briefSnapshot`, contract, plan, and all hashes.

- [ ] **Step 1: Write persistence and loading tests**

Assert new handoffs freeze V2, store matching hash/revision, and return the snapshot from the accepted-attempt loader. Assert later project brief mutation does not change loaded handoff data. Assert historical accepted rows without snapshots remain readable only as historical metadata and cannot start a new attempt.

- [ ] **Step 2: Run RED**

Run: `bunx vitest run src/lib/projects/build-handoffs.test.ts src/lib/projects/build-planner.test.ts`

Expected: FAIL because handoffs do not store brief snapshots.

- [ ] **Step 3: Add the migration**

Add nullable DB columns for historical compatibility:

```sql
ALTER TABLE "ProjectBuildHandoff"
  ADD COLUMN "briefSnapshot" JSONB,
  ADD COLUMN "briefHash" VARCHAR(64),
  ADD COLUMN "briefRevision" INTEGER;
```

New application writes require all three. Existing accepted rows remain immutable historical records; stale drafts without snapshots are superseded.

- [ ] **Step 4: Freeze and hash during preparation**

Run canonical readiness first, store snapshot/hash/revision with contract/plan in one transaction, and derive review items from the frozen data.

- [ ] **Step 5: Validate during loading**

For new attempts, verify ownership, accepted status, snapshot parsing, brief hash, contract hash, plan hash, and plan-against-contract. Return a specific integrity failure when any proof differs.

- [ ] **Step 6: Run Prisma generation and GREEN**

Run:

```bash
bunx prisma generate
bunx vitest run src/lib/projects/build-handoffs.test.ts src/lib/projects/build-planner.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260813100000_add_handoff_brief_snapshot/migration.sql src/lib/projects/build-handoffs.ts src/lib/projects/build-planner.ts src/lib/projects/build-handoffs.test.ts src/lib/projects/build-planner.test.ts
git commit -m "feat(handoff): freeze canonical brief snapshots"
```

### Task 5: Make Contract Build Cards Proof-Carrying

**Files:**
- Modify: `src/lib/projects/brief.ts`
- Modify: `src/lib/projects/brief-flow.ts`
- Modify: `src/components/projects/WorkspaceShell.tsx`
- Modify: `src/components/projects/WorkspacePrimitives.tsx`
- Modify: `src/components/projects/WorkspaceShell.test.ts`
- Modify: `src/lib/projects/brief-flow.test.ts`

**Interfaces:**
- Produces discriminated contract recommendation cards with required `handoffId`, `reviewHash`, and `reviewItems`.
- `canStartBuild(card, generationEngine)` requires valid proof for `contract-v1`.

- [ ] **Step 1: Write card and UI tests**

Verify a contract recommendation cannot parse without handoff proof, `canStartBuild()` returns false for missing proof, and a valid proof-carrying card enables build. Verify stale cards are not rendered as actionable recommendations.

- [ ] **Step 2: Run RED**

Run: `bunx vitest run src/components/projects/WorkspaceShell.test.ts src/lib/projects/brief-flow.test.ts`

Expected: FAIL because handoff fields are optional and `canStartBuild()` always returns true for a non-null brief.

- [ ] **Step 3: Introduce the discriminated card type**

Use `engine: "contract-v1"` with required proof fields. Keep an explicit `engine: "legacy-v1"` compatibility card until Task 9; do not infer engine from missing fields.

- [ ] **Step 4: Derive card copy from review items**

Ignore model title/summary for the final contract card. Build Indonesian title and summary from server-owned review items.

- [ ] **Step 5: Replace the UI gate**

`canStartBuild()` consumes the active card and engine. Remove the misleading brief-only comment and implementation. The click body always sends proof for contract cards.

- [ ] **Step 6: Run GREEN**

Run: `bunx vitest run src/components/projects/WorkspaceShell.test.ts src/lib/projects/brief-flow.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/projects/brief.ts src/lib/projects/brief-flow.ts src/components/projects/WorkspaceShell.tsx src/components/projects/WorkspacePrimitives.tsx src/components/projects/WorkspaceShell.test.ts src/lib/projects/brief-flow.test.ts
git commit -m "fix(workspace): require proof for contract build cards"
```

### Task 6: Reject Handoff-Less Contract Requests Before Attempt Creation

**Files:**
- Modify: `src/routes/api.projects.$id.generate.ts`
- Create: `src/routes/-api.projects.$id.generate.test.ts`
- Modify: `src/lib/projects/build-handoff-acceptance.ts`
- Modify: `src/lib/projects/build-handoff-acceptance.test.ts`

**Interfaces:**
- Contract request body requires handoff proof and idempotency.
- Produces 409 `{ code: "project_handoff_required", message: "Lengkapi diskusi dan tinjau brief sebelum mulai build." }` without operation, attempt, build, or debit.

- [ ] **Step 1: Write route boundary tests**

Test missing proof, stale proof, ownership mismatch, review-hash mismatch, and valid idempotent acceptance. Query row counts to prove blocked requests create no attempt/build/operation and do not debit Energy.

- [ ] **Step 2: Run RED**

Run the focused route and acceptance tests.

Expected: FAIL because absent proof enters the legacy creation branch.

- [ ] **Step 3: Dispatch by engine only**

For `contract-v1`, require proof before claiming a project operation. Use the existing atomic acceptance helper. Only `legacy-v1` may enter the legacy attempt branch during migration.

- [ ] **Step 4: Run GREEN**

Run the same focused route and acceptance tests.

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add 'src/routes/api.projects.$id.generate.ts' src/routes/*generate*.test.ts src/lib/projects/build-handoff-acceptance.ts src/lib/projects/build-handoff-acceptance.test.ts
git commit -m "fix(generate): reject contract builds without handoff proof"
```

### Task 7: Build Only From the Accepted Snapshot

**Files:**
- Modify: `src/lib/projects/generated-site-contract.ts`
- Modify: `src/lib/projects/generated-site-contract.test.ts`
- Modify: `src/lib/projects/site-schema.ts`
- Modify: `src/lib/projects/site-schema.test.ts`
- Modify: `src/lib/projects/brief-admission.ts`
- Modify: `src/lib/projects/brief-admission.test.ts`
- Modify: `src/lib/projects/batched-generator.ts`
- Modify: `src/lib/projects/build-attempt-worker.ts`
- Modify: `src/lib/projects/build-attempt-worker.batched.test.ts`

**Interfaces:**
- `compileGeneratedSiteContract()` consumes accepted `briefSnapshot`, contract, plan, photo policy, and recipe.
- `createProjectSiteSchemaFromGeneratedContract()` becomes the contract-path schema projection.
- Batched admission consumes validated handoff proof for contract mode.

- [ ] **Step 1: Write immutability tests**

Create an accepted handoff snapshot, mutate the current project brief to conflicting values, run the worker dependency boundary, and assert writer contract/schema/build prompt retain the accepted values and hashes. Test every rich owner field used by generation.

- [ ] **Step 2: Run RED**

Run generated contract, schema, admission, and worker batched tests.

Expected: FAIL because the worker and compiler use the mutable brief.

- [ ] **Step 3: Change contract compilation input**

Replace the live brief with the frozen snapshot. Keep contract and plan as deterministic semantic projections. Include `briefHash` in the generated contract and quality proof.

- [ ] **Step 4: Derive site schema from generated contract**

For contract mode, generate `ProjectSiteSchema` from `GeneratedSiteContractV1`. Do not call `createProjectSiteSchemaFromBrief()`.

- [ ] **Step 5: Change admission and writer inputs**

Contract mode validates accepted handoff integrity and generated contract completeness, not legacy `offer` or `readyForBuild`. Legacy admission remains explicitly isolated until Task 9.

- [ ] **Step 6: Run GREEN**

Run:

```bash
bunx vitest run src/lib/projects/generated-site-contract.test.ts src/lib/projects/site-schema.test.ts src/lib/projects/brief-admission.test.ts src/lib/projects/build-attempt-worker.batched.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/projects/generated-site-contract.ts src/lib/projects/generated-site-contract.test.ts src/lib/projects/site-schema.ts src/lib/projects/site-schema.test.ts src/lib/projects/brief-admission.ts src/lib/projects/brief-admission.test.ts src/lib/projects/batched-generator.ts src/lib/projects/build-attempt-worker.ts src/lib/projects/build-attempt-worker.batched.test.ts
git commit -m "refactor(generation): use accepted brief snapshots"
```

### Task 8: Persist Canonical Brief V2 Throughout Discussion and UI Reads

**Files:**
- Modify: `src/lib/projects/discuss-tool.ts`
- Modify: `src/lib/projects/brief-flow.ts`
- Modify: `src/lib/projects/discuss-turn-worker.ts`
- Modify: `src/lib/projects/discuss-turn-shared.ts`
- Modify: `src/lib/projects/discuss-queue-worker.ts`
- Modify: `src/routes/api.projects.$id.workspace.ts`
- Modify: `src/routes/api.projects.preview.ts`
- Modify: `src/lib/admin-project-observer.ts`
- Modify: `src/lib/projects/discuss-tool.test.ts`
- Modify: `src/lib/projects/brief-flow.test.ts`
- Modify: `src/lib/projects/discuss-turn-worker.test.ts`
- Modify: `src/lib/admin-project-observer.test.ts`
- Modify: `src/routes/-api.projects.preview.discuss.test.ts`

**Interfaces:**
- AI payload remains permissive legacy-shaped input.
- `applyAiBriefPatch(canonicalBrief, payload)` converts it immediately into canonical fields.
- Every persisted `Project.brief` write stores `version: 2` only.
- Every workspace/admin read parses canonical V2 and migrates V1 in memory.

- [ ] **Step 1: Write trust-boundary and persistence tests**

Verify legacy model patches update canonical offers/actions, canonical patches round-trip, persisted rows contain no `offer`, `productOrService`, `contactOrCta`, `contact`, `readyForBuild`, `confidence`, or `openQuestions` top-level aliases, and V1 project reads remain safe.

- [ ] **Step 2: Run RED**

Run focused discuss tool/flow/worker/workspace/admin tests.

Expected: FAIL because current persistence stores both field sets.

- [ ] **Step 3: Adapt permissive AI input once**

Keep the tool schema tolerant, but map output into V2 in one function. Do not expose legacy aliases beyond this trust-boundary adapter.

- [ ] **Step 4: Switch persistence and reads**

All writes serialize V2. All reads call `parseCanonicalBrief()`. UI projections use selectors such as `getPrimaryOfferName()` and `getPrimaryActionLabel()` rather than aliases.

- [ ] **Step 5: Run GREEN and typecheck**

Run focused tests and `bun run typecheck`.

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/projects/discuss-tool.ts src/lib/projects/brief-flow.ts src/lib/projects/discuss-turn-worker.ts src/lib/projects/discuss-turn-shared.ts src/lib/projects/discuss-queue-worker.ts 'src/routes/api.projects.$id.workspace.ts' src/routes/api.projects.preview.ts src/lib/admin-project-observer.ts src/lib/projects/*.test.ts src/routes/*workspace*.test.ts src/routes/*preview*.test.ts
git commit -m "refactor(brief): persist canonical v2 data"
```

### Task 9: Remove Competing Readiness and Legacy Fact Authorities

**Files:**
- Delete: `src/lib/projects/discuss-readiness.ts`
- Delete or reduce to contract-only integrity: `src/lib/projects/brief-admission.ts`
- Modify: `src/lib/projects/brief.ts`
- Modify: `src/lib/projects/brief-flow.ts`
- Modify: `src/lib/projects/build-planner.ts`
- Modify: `src/lib/projects/site-schema.ts`
- Modify: `src/lib/projects/implementation-spec.ts`
- Modify: all remaining `ProjectBrief` consumers returned by `rg`
- Modify/delete corresponding obsolete tests

**Interfaces:**
- `ProjectBrief` becomes an alias of `ProjectBriefV2` only during call-site migration, then callers import `ProjectBriefV2` directly.
- `evaluateBuildReadiness()` is the only brief-level readiness function.

- [ ] **Step 1: Add an architecture guard test**

Create `src/lib/projects/canonical-brief-architecture.test.ts` that scans project source and fails if retired symbols or writable legacy fields remain outside the migration adapter/tests:

```ts
const forbidden = [
  "hasMinimumBriefForBuild",
  "getBriefReadiness",
  "isBriefReadyForBuild",
  "REQUIRED_BRIEF_FIELDS",
  "readyForBuild:",
];
```

Also guard against contract generation reading `project.brief` after loading an accepted handoff.

- [ ] **Step 2: Run RED**

Run the architecture test.

Expected: FAIL and list remaining authorities.

- [ ] **Step 3: Remove obsolete fields and helpers**

Delete legacy aliases and validators, update prompts/selectors/renderers to canonical fields, and keep legacy names only inside `migrateLegacyBrief()` fixtures. Remove confidence-based authorization language.

- [ ] **Step 4: Remove contract fallback branches**

Delete absence-based legacy dispatch. Retain `legacy-v1` only where historical project behavior explicitly requires it; no contract call site may invoke it.

- [ ] **Step 5: Run architecture test, typecheck, and affected tests**

Run:

```bash
bunx vitest run src/lib/projects/canonical-brief-architecture.test.ts
bun run typecheck
bun run test:changed
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A src/lib/projects src/components/projects src/routes
git commit -m "refactor(brief): remove competing readiness authorities"
```

### Task 10: Migration Command, Integration Coverage, and Canonical Docs

**Files:**
- Create: `scripts/migrate-canonical-briefs.ts`
- Create: `scripts/migrate-canonical-briefs.test.ts`
- Modify: `package.json`
- Modify: `tests/integration/discussion-readiness.test.ts`
- Modify: `DEV.md`
- Modify: `docs/superpowers/specs/2026-08-13-canonical-brief-build-readiness-design.md`

**Interfaces:**
- `bun run brief:migrate` previews counts and blockers.
- `bun run brief:migrate --apply` writes V2 briefs, supersedes stale drafts/cards, and is idempotent.

- [ ] **Step 1: Write migration command tests**

Use fixture rows to verify preview has no writes, apply stores V2, rerun changes zero rows, accepted historical handoffs remain untouched, stale draft handoffs/cards are invalidated, and ambiguous projects become blocked without inferred facts.

- [ ] **Step 2: Run RED**

Run: `bunx vitest run scripts/migrate-canonical-briefs.test.ts`

Expected: FAIL because the command does not exist.

- [ ] **Step 3: Implement preview/apply command**

Print counts and field identifiers only. Never print owner values. Use bounded batches and a transaction per batch.

- [ ] **Step 4: Add discussion-to-handoff integration regression**

Start from an incomplete HP retail prompt, provide required answers one turn at a time, assert no early recommendation, accept the proof-carrying recommendation, and assert the attempt's snapshot/hash match the displayed review.

- [ ] **Step 5: Update docs and status**

Document migration commands and debugging flow in `DEV.md`. Mark the design `Implemented` only after all checks pass.

- [ ] **Step 6: Run focused tests and full gate**

Run:

```bash
bunx vitest run scripts/migrate-canonical-briefs.test.ts tests/integration/discussion-readiness.test.ts
bun run check
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add scripts/migrate-canonical-briefs.ts scripts/migrate-canonical-briefs.test.ts package.json tests/integration/discussion-readiness.test.ts DEV.md docs/superpowers/specs/2026-08-13-canonical-brief-build-readiness-design.md
git commit -m "feat(brief): migrate projects to canonical readiness"
```

### Task 11: Final Validation and Real Flow

**Files:**
- No tracked changes unless validation exposes a defect; any defect starts a focused RED/GREEN cycle and separate `fix(...)` commit.

- [ ] **Step 1: Verify clean repository and commit sequence**

Run: `git status --short && git log --oneline --decorate -15`

Expected: clean tree and one atomic commit per task.

- [ ] **Step 2: Run full verification**

Run: `bun run check`

Expected: PASS for format, lint, typecheck, affected tests, Knip, and docs.

- [ ] **Step 3: Apply local migration in preview then apply mode**

Run:

```bash
bun run brief:migrate
bun run brief:migrate --apply
bun run brief:migrate
```

Expected: first preview reports candidates without writes; apply succeeds; second preview reports zero pending writes.

- [ ] **Step 4: Run one real discussion → handoff → build flow**

Use a dedicated local E2E owner. Confirm the build card appears only after all required fields resolve, carries handoff proof, creates one attempt, and generation uses the accepted `briefHash`. Inspect the generated source and browser result.

- [ ] **Step 5: Restore safe settings**

Restore generated-site rollout to `off` and photo feature to `false` after E2E.

- [ ] **Step 6: Commit validation-only fixes atomically if needed**

Each discovered defect must have its own focused failing test, fix, focused verification, and conventional commit. If no defects are found, do not create an empty commit.
