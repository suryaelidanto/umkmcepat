# Contract-Compiled Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace prompt-led generation for newly assigned projects with an accepted, versioned business contract and build plan whose topology, facts, candidates, and rendered output are mechanically qualified before selection.

**Architecture:** Keep `legacy-v1` unchanged and dispatch through sticky `Project.generationEngine`. For `contract-v1`, discussion produces a validated contract, a constrained planner produces an immutable handoff, the platform compiles protected topology, one builder writes allow-listed creative source, and every source mutation becomes an immutable candidate evaluated by the same source/build/browser gates. Roll out assignment independently from execution admission; preserve the selected last-known-good candidate throughout failures.

**Tech Stack:** Bun, TypeScript, Zod 4, Prisma/PostgreSQL, BullMQ/Redis, AI SDK 7, Vite, React 19, TanStack Router/Start, Tailwind CSS, Playwright Core, Vitest, S3/R2.

## Global Constraints

- Read `PRINCIPLES.md`, `DEV.md`, `PRODUCT.md`, `DESIGN.md`, and the design spec before each phase.
- Canonical design: `docs/superpowers/specs/2026-08-03-contract-compiled-generation-design.md`.
- Use Bun only; add no dependency unless an existing platform API cannot implement the requirement.
- Preserve all `legacy-v1` build, edit, retry, restore, preview, and publish behavior.
- Assign engines only at project creation; never infer or rewrite an existing project's engine.
- Keep user-facing copy in Indonesian and developer-facing code, tests, logs, prompts, and docs in English.
- Never turn invalid AI output into a fallback success.
- Keep generated execution behind the existing isolated-worker and separate-origin production prerequisites.
- One accepted fact keeps one provenance trail; one artifact has one writer.
- Every source mutation creates an immutable child snapshot and reruns all applicable gates.
- Do not enable visual auto-repair until the design spec's per-category calibration threshold is met.
- Do not run `bun run build` during ordinary implementation; run it only when a task changes build/deployment behavior.
- End each task with its focused tests and `bun run check`; never bypass a failing gate.

## Delivery Gates

1. Phase 0 must freeze a baseline/corpus/evaluator version before treatment behavior is enabled.
2. Tasks 2-7 may ship with assignment `off`; no contract-v1 project is created yet.
3. Tasks 8-12 must pass the visible corpus and security fixtures before `internal` assignment.
4. Task 13 remains shadow-only until human calibration passes.
5. `pilot` and `all` require the quantitative thresholds in the design spec, not implementation completion alone.

---

### Task 1: Freeze The Evaluation Contract

**Files:**
- Create: `src/lib/projects/generation-evaluation.ts`
- Create: `src/lib/projects/generation-evaluation.test.ts`
- Create: `scripts/run-generation-evaluation.ts`
- Create: `fixtures/generation-evaluation/visible-cases.json`
- Create: `fixtures/generation-evaluation/mutations.json`
- Modify: `package.json`

**Interfaces:**
- Produces: `EvaluationManifestV1`, `EvaluationTrialResultV1`, `scoreGenerationEvaluation(manifest, results)`.
- Produces: `bun run evaluate:generation -- --baseline-id <id> --mode baseline|treatment`.
- Hidden cases are loaded from an authorized private artifact reference; their briefs are never written to logs or tracked files.

- [ ] **Step 1: Write failing evaluator tests**

```ts
it("counts missing and infrastructure-error trials in release denominators", () => {
  const report = scoreGenerationEvaluation(manifestWithTwoTrials(), [
    passingTrial(),
    infrastructureErrorTrial(),
  ]);
  expect(report.firstPassHardGateSuccess).toBe(0.5);
  expect(report.operationalFailures).toBe(1);
});

it("fails a brief-level metric unless both frozen trials exist", () => {
  expect(() => scoreGenerationEvaluation(manifestWithTwoTrials(), [passingTrial()]))
    .toThrow("missing scheduled trial");
});
```

- [ ] **Step 2: Verify the tests fail**

Run: `bun run test -- src/lib/projects/generation-evaluation.test.ts`

Expected: FAIL because the evaluator module does not exist.

- [ ] **Step 3: Implement the frozen schemas and scorer**

```ts
export type EvaluationManifestV1 = {
  schemaVersion: 1;
  baselineId: string;
  corpusVersion: string;
  evaluatorVersion: string;
  scheduledTrials: Array<{ briefId: string; trial: 1 | 2 }>;
};

export function scoreGenerationEvaluation(
  manifest: EvaluationManifestV1,
  results: EvaluationTrialResultV1[],
): EvaluationReportV1;
```

Seed the four investigated project shapes plus positive/negative topology, claim, CTA, and layout-intent mutations. Add `"evaluate:generation": "bun scripts/run-generation-evaluation.ts"`.

- [ ] **Step 4: Run the focused test and freeze a baseline manifest**

Run: `bun run test -- src/lib/projects/generation-evaluation.test.ts`

Expected: PASS; report serialization is deterministic and excludes private brief content.

- [ ] **Step 5: Run the repository gate and commit**

Run: `bun run check`

```bash
git add package.json fixtures/generation-evaluation scripts/run-generation-evaluation.ts src/lib/projects/generation-evaluation.ts src/lib/projects/generation-evaluation.test.ts
git commit -m "test: freeze generation evaluation contract"
```

### Task 2: Add Contract, Plan, Review, And Hash Modules

**Files:**
- Create: `src/lib/projects/build-contract.ts`
- Create: `src/lib/projects/build-contract.test.ts`
- Create: `src/lib/projects/build-plan.ts`
- Create: `src/lib/projects/build-plan.test.ts`
- Create: `src/lib/projects/build-hash.ts`
- Create: `src/lib/projects/build-hash.test.ts`
- Modify: `src/lib/projects/brief-rich-fields.ts`

**Interfaces:**
- Produces: `BuildContractV1`, `ContractFactV1`, `BuildPlanV1`, `ReviewItemV1`.
- Produces: `parseBuildContract`, `parseBuildPlan`, `validatePlanAgainstContract`, `deriveReviewItems`.
- Produces: `hashBuildContract`, `hashBuildPlan`, `hashReviewItems`.

- [ ] **Step 1: Write failing schema and hash-vector tests**

```ts
it("rejects a contact value under the other discriminator", () => {
  expect(() => parseBuildContract(contract({ facts: [otherFact("08123456789")] })))
    .toThrow("high-risk value requires a typed fact");
});

it("hashes semantic content without revision or contentHash", () => {
  expect(hashBuildContract(contract({ revision: 1, contentHash: "a" })))
    .toBe(hashBuildContract(contract({ revision: 9, contentHash: "b" })));
});

it("preserves page order but sorts set-like ids", () => {
  expect(hashBuildPlan(planWithReorderedFactIds())).toBe(hashBuildPlan(plan()));
  expect(hashBuildPlan(planWithReorderedPages())).not.toBe(hashBuildPlan(plan()));
});
```

- [ ] **Step 2: Verify the focused tests fail**

Run: `bun run test -- src/lib/projects/build-contract.test.ts src/lib/projects/build-plan.test.ts src/lib/projects/build-hash.test.ts`

Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement bounded Zod schemas and canonical JSON hashing**

```ts
export function hashBuildContract(contract: BuildContractV1): string {
  return sha256(`umkmcepat:build-contract:v1:${canonicalJson(contractHashInput(contract))}`);
}

export function hashBuildPlan(plan: BuildPlanV1): string {
  return sha256(`umkmcepat:build-plan:v1:${canonicalJson(planHashInput(plan))}`);
}
```

Use explicit projection functions, NFC normalization, `\n` line endings, recursive key sorting, stable-id sorting for contract sets, and preserved order for pages/sections/navigation. Enforce every size/count bound from the design spec and reject review overflow rather than truncating it.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `bun run test -- src/lib/projects/build-contract.test.ts src/lib/projects/build-plan.test.ts src/lib/projects/build-hash.test.ts && bun run typecheck`

Expected: PASS with fixed lowercase SHA-256 vectors on Linux and CI.

- [ ] **Step 5: Run the repository gate and commit**

Run: `bun run check`

```bash
git add src/lib/projects/brief-rich-fields.ts src/lib/projects/build-contract.ts src/lib/projects/build-contract.test.ts src/lib/projects/build-plan.ts src/lib/projects/build-plan.test.ts src/lib/projects/build-hash.ts src/lib/projects/build-hash.test.ts
git commit -m "feat: define contract compiled artifacts"
```

### Task 3: Persist Sticky Engines And Immutable Handoffs

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260803000000_contract_compiled_generation/migration.sql`
- Create: `src/lib/projects/generation-engine.ts`
- Create: `src/lib/projects/generation-engine.test.ts`
- Create: `src/lib/projects/build-handoffs.ts`
- Create: `src/lib/projects/build-handoffs.test.ts`
- Modify: `src/routes/api.projects.ts`
- Modify: `src/lib/app-settings-registry.ts`
- Modify: `src/lib/app-settings-registry.test.ts`

**Interfaces:**
- Produces: `resolveGenerationEngine({ rollout, admin, waitlistApproved }): "legacy-v1" | "contract-v1"`; project creation computes `admin` with `isAdminEmail(owner.email)` and approval with `isWaitlistApproved(owner.email) === true`.
- Produces: `createDraftHandoff`, `acceptHandoff`, `loadActiveHandoff`, `selectQualifiedHandoff`.
- Persists: `generationEngine`, `activeHandoffId`, immutable contract/plan/review JSON and hashes, and nullable `ProjectEditAttempt.handoffId`.

- [ ] **Step 1: Write failing migration and assignment tests**

```ts
it.each([
  ["off", true, true, "legacy-v1"],
  ["internal", true, false, "contract-v1"],
  ["internal", false, true, "legacy-v1"],
  ["pilot", true, false, "legacy-v1"],
  ["pilot", false, true, "contract-v1"],
  ["all", false, false, "contract-v1"],
])("assigns %s deterministically", (rollout, admin, approved, expected) => {
  expect(resolveGenerationEngine({ rollout, admin, waitlistApproved: approved })).toBe(expected);
});
```

Add integration assertions that existing projects become `legacy-v1`, equal hashes at a later revision create a distinct handoff, and a failed replacement does not update `activeHandoffId`.

- [ ] **Step 2: Verify tests fail before migration**

Run: `bun run test -- src/lib/projects/generation-engine.test.ts src/lib/projects/build-handoffs.test.ts`

Expected: FAIL because schema fields and modules are absent.

- [ ] **Step 3: Add the additive schema and transactional helpers**

```ts
export async function selectQualifiedHandoff(input: {
  projectId: string;
  handoffId: string;
  snapshotId: string;
  operationId: string;
}): Promise<void>;
```

Use only `draft | accepted | superseded | cancelled` for handoffs. Keep execution status on attempts/builds. In one transaction verify the lease, select the snapshot/deployment, update `activeHandoffId`, and supersede the prior active handoff. Add the DB setting `generation.contract_compiled_rollout` with default `off`.

- [ ] **Step 4: Apply migration locally and run focused tests**

Run: `bun run db:migrate && bun run test -- src/lib/projects/generation-engine.test.ts src/lib/projects/build-handoffs.test.ts src/lib/app-settings-registry.test.ts`

Expected: PASS; no existing row receives `contract-v1`.

- [ ] **Step 5: Run the repository gate and commit**

Run: `bun run check`

```bash
git add prisma src/routes/api.projects.ts src/lib/projects/generation-engine.ts src/lib/projects/generation-engine.test.ts src/lib/projects/build-handoffs.ts src/lib/projects/build-handoffs.test.ts src/lib/app-settings-registry.ts src/lib/app-settings-registry.test.ts
git commit -m "feat: persist generation handoffs"
```

### Task 4: Replace Model Confidence With A Decision Registry

**Files:**
- Create: `src/lib/projects/build-decisions.ts`
- Create: `src/lib/projects/build-decisions.test.ts`
- Create: `src/lib/projects/contract-readiness.ts`
- Create: `src/lib/projects/contract-readiness.test.ts`
- Modify: `src/lib/projects/brief-flow.ts`
- Modify: `src/lib/projects/brief-flow.test.ts`
- Modify: `src/lib/projects/discuss-tool.ts`
- Modify: `src/lib/projects/discuss-tool.test.ts`
- Modify: `src/lib/projects/prompts/discuss-system.md`
- Modify: `src/lib/projects/prompts/discuss-system.test.ts`

**Interfaces:**
- Produces: `BUILD_DECISIONS`, `selectNextBuildDecision`, `evaluateContractReadiness`.
- Consumes: normalized `BuildContractV1` from Task 2.
- Returns: `{ state: "needs_decision" | "ready_for_plan"; blockers; omissions; nextDecisionId }`.

- [ ] **Step 1: Write failing readiness-table tests**

```ts
it("requires a concrete CTA destination when the CTA kind needs one", () => {
  expect(evaluateContractReadiness(contractWithUnresolvedWhatsApp()).state)
    .toBe("needs_decision");
});

it("allows a registry-approved safe omission without inflating confidence", () => {
  const result = evaluateContractReadiness(contractWithSafeHoursOmission());
  expect(result.state).toBe("ready_for_plan");
  expect(result.omissions).toContainEqual(expect.objectContaining({ decisionId: "location_operations" }));
});
```

- [ ] **Step 2: Verify tests fail**

Run: `bun run test -- src/lib/projects/build-decisions.test.ts src/lib/projects/contract-readiness.test.ts src/lib/projects/brief-flow.test.ts src/lib/projects/discuss-tool.test.ts src/lib/projects/prompts/discuss-system.test.ts`

Expected: FAIL on missing registry/readiness behavior.

- [ ] **Step 3: Implement the closed registry and prompt contract**

```ts
export type ContractReadiness =
  | { state: "needs_decision"; blockers: ContractBlocker[]; nextDecisionId: string }
  | { state: "ready_for_plan"; blockers: []; omissions: ContractOmission[] };
```

Encode applicability and skip predicates as server functions, preserve one semantic question per turn, parse volunteered facts, and remove instructions that promote model confidence or force early success.

- [ ] **Step 4: Run focused tests**

Run: `bun run test -- src/lib/projects/build-decisions.test.ts src/lib/projects/contract-readiness.test.ts src/lib/projects/brief-flow.test.ts src/lib/projects/discuss-tool.test.ts src/lib/projects/prompts/discuss-system.test.ts`

Expected: PASS for local, catalog, transactional, image-led, and regulated fixtures.

- [ ] **Step 5: Run the repository gate and commit**

Run: `bun run check`

```bash
git add src/lib/projects/build-decisions.ts src/lib/projects/build-decisions.test.ts src/lib/projects/contract-readiness.ts src/lib/projects/contract-readiness.test.ts src/lib/projects/brief-flow.ts src/lib/projects/brief-flow.test.ts src/lib/projects/discuss-tool.ts src/lib/projects/discuss-tool.test.ts src/lib/projects/prompts/discuss-system.md src/lib/projects/prompts/discuss-system.test.ts
git commit -m "feat: add deterministic contract readiness"
```

### Task 5: Prepare And Persist The Pre-Build Plan

**Files:**
- Create: `src/lib/projects/build-planner.ts`
- Create: `src/lib/projects/build-planner.test.ts`
- Modify: `src/lib/projects/discuss-turn-worker.ts`
- Modify: `src/lib/projects/discuss-turn-worker.test.ts`
- Modify: `src/lib/projects/brief.ts`
- Modify: `src/lib/projects/brief.test.ts`
- Modify: `src/lib/projects/workspace.ts`
- Modify: `src/lib/projects/workspace.test.ts`

**Interfaces:**
- Produces: `prepareBuildHandoff({ projectId, userId, contract }): Promise<{ state: "ready"; handoffId: string } | { state: "superseded" | "failed" }>`.
- Uses: `getGenerationModel()`, one primary plan call and one bounded retry.
- Persists: exact contract, plan, review items, hashes, revisions, planner cost proof, and `build_recommendation` card payload.

- [ ] **Step 1: Write failing planner lifecycle tests**

```ts
it("does not show a build card until the exact plan validates", async () => {
  plannerMock.mockResolvedValueOnce(invalidPlan()).mockResolvedValueOnce(validPlan());
  await runDiscussTurn(readyContractInput());
  expect(savedCard()).toMatchObject({ type: "build_recommendation", handoffId: expect.any(String) });
  expect(plannerMock).toHaveBeenCalledTimes(2);
});

it("discards a plan whose contract draft was superseded", async () => {
  await expect(prepareWithConcurrentContractChange()).resolves.toEqual({ state: "superseded" });
  expect(savedBuildCards()).toHaveLength(0);
});
```

- [ ] **Step 2: Verify tests fail**

Run: `bun run test -- src/lib/projects/build-planner.test.ts src/lib/projects/discuss-turn-worker.test.ts src/lib/projects/brief.test.ts src/lib/projects/workspace.test.ts`

Expected: FAIL because planning still occurs after build acceptance.

- [ ] **Step 3: Implement constrained planning and CAS persistence**

```ts
export async function prepareBuildHandoff(input: {
  projectId: string;
  userId: string;
  contract: BuildContractV1;
}): Promise<{ state: "ready"; handoffId: string } | { state: "superseded" | "failed" }>;
```

Cache by contract hash, charge only new plan calls, emit `Menyusun rencana halaman`, persist no fallback plan, and emit recoverable Indonesian failure copy after both model attempts fail.

- [ ] **Step 4: Run focused tests**

Run: `bun run test -- src/lib/projects/build-planner.test.ts src/lib/projects/discuss-turn-worker.test.ts src/lib/projects/brief.test.ts src/lib/projects/workspace.test.ts`

Expected: PASS; unchanged contract hashes reuse a valid plan without another model call or charge.

- [ ] **Step 5: Run the repository gate and commit**

Run: `bun run check`

```bash
git add src/lib/projects/build-planner.ts src/lib/projects/build-planner.test.ts src/lib/projects/discuss-turn-worker.ts src/lib/projects/discuss-turn-worker.test.ts src/lib/projects/brief.ts src/lib/projects/brief.test.ts src/lib/projects/workspace.ts src/lib/projects/workspace.test.ts
git commit -m "feat: prepare validated build handoffs"
```

### Task 6: Accept Handoffs Idempotently At Generate

**Files:**
- Modify: `src/routes/api.projects.$id.generate.ts`
- Create: `src/routes/-api.projects.$id.generate.contract.test.ts`
- Modify: `src/lib/projects/project-operation.ts`
- Modify: `src/lib/projects/project-operation.test.ts`
- Modify: `src/lib/projects/attempt-queue.ts`
- Modify: `src/lib/projects/attempt-queue.test.ts`

**Interfaces:**
- Input: `{ handoffId: string; reviewHash: string; idempotencyKey: string }` for contract-v1.
- Produces: one accepted handoff and one attempt per idempotency key.
- Explicit retry creates a new charged attempt against the same accepted handoff.

- [ ] **Step 1: Write failing route transaction tests**

```ts
it("rejects a stale review hash before claiming a build", async () => {
  const response = await postGenerate({ handoffId, reviewHash: "stale", idempotencyKey: "r1" });
  expect(response.status).toBe(409);
  expect(await attemptCount()).toBe(0);
});

it("returns the same attempt when the request is replayed", async () => {
  const first = await postGenerate(validRequest("r1"));
  const second = await postGenerate(validRequest("r1"));
  expect(second.attemptId).toBe(first.attemptId);
});
```

- [ ] **Step 2: Verify tests fail**

Run: `bun run test -- src/routes/-api.projects.$id.generate.contract.test.ts src/lib/projects/project-operation.test.ts src/lib/projects/attempt-queue.test.ts`

Expected: FAIL because generate does not consume handoff identity/review proof.

- [ ] **Step 3: Implement the acceptance transaction and enqueue boundary**

```ts
type ContractGenerateRequest = {
  handoffId: string;
  reviewHash: string;
  idempotencyKey: string;
};
```

Lock project/handoff, verify owner/engine/revisions/hashes/review/current state, CAS `draft` to `accepted`, create attempt/placeholder snapshot/build, commit, then enqueue by attempt id. Mark only the attempt failed on enqueue failure; leave the handoff accepted.

- [ ] **Step 4: Run focused tests**

Run: `bun run test -- src/routes/-api.projects.$id.generate.contract.test.ts src/lib/projects/project-operation.test.ts src/lib/projects/attempt-queue.test.ts`

Expected: PASS for stale, cancelled, superseded, replayed, enqueue-failed, and explicit-retry cases.

- [ ] **Step 5: Run the repository gate and commit**

Run: `bun run check`

```bash
git add src/routes/api.projects.$id.generate.ts src/routes/-api.projects.$id.generate.contract.test.ts src/lib/projects/project-operation.ts src/lib/projects/project-operation.test.ts src/lib/projects/attempt-queue.ts src/lib/projects/attempt-queue.test.ts
git commit -m "feat: accept immutable generation handoffs"
```

### Task 7: Compile Protected Topology From The Plan

**Files:**
- Create: `src/lib/projects/topology-compiler.ts`
- Create: `src/lib/projects/topology-compiler.test.ts`
- Modify: `src/lib/projects/scaffold/vite-tanstack-shadcn-starter.ts`
- Modify: `src/lib/projects/scaffold/scaffold.test.ts`
- Modify: `src/lib/projects/generated-app-manifest.ts`
- Modify: `src/lib/projects/generated-app-manifest.test.ts`
- Modify: `src/lib/projects/generated-build-policy.ts`
- Modify: `src/lib/projects/generated-build-policy.test.ts`

**Interfaces:**
- Produces: `compileGeneratedTopology(contract, plan): CompiledTopology`.
- `CompiledTopology` contains protected files, exact AI allow-list, route patterns, representative paths, and manifest.

- [ ] **Step 1: Write failing topology parity tests**

```ts
it("compiles one root shell, hash history, every planned route, and 404", () => {
  const output = compileGeneratedTopology(contract(), multiPagePlan());
  expect(output.routePatterns).toEqual(["/", "/katalog", "/tentang"]);
  expect(output.files["src/router.tsx"]).toContain("createHashHistory");
  expect(output.files["src/routes/__root.tsx"]).toContain("<SiteShell><Outlet /></SiteShell>");
});

it("rejects duplicate, missing-root, unsafe, and unrepresentable routes", () => {
  expect(() => compileGeneratedTopology(contract(), invalidRoutePlan())).toThrow();
});
```

- [ ] **Step 2: Verify tests fail**

Run: `bun run test -- src/lib/projects/topology-compiler.test.ts src/lib/projects/scaffold/scaffold.test.ts src/lib/projects/generated-app-manifest.test.ts src/lib/projects/generated-build-policy.test.ts`

Expected: FAIL because topology is still builder-owned or defaulted.

- [ ] **Step 3: Implement compiler-owned files and exact parity checks**

```ts
export type CompiledTopology = {
  protectedFiles: Record<string, string>;
  aiWritablePaths: string[];
  routePatterns: string[];
  representativePaths: string[];
  manifest: GeneratedAppManifest;
};
```

Generate `main`, router, root, 404, preview bridge, contract content, manifest, index CSS, route stubs, `PRODUCT.md`, `DESIGN.md`, and `AGENTS.md` from one plan. Remove the silent one-route manifest default for contract-v1 only.

- [ ] **Step 4: Run focused tests**

Run: `bun run test -- src/lib/projects/topology-compiler.test.ts src/lib/projects/scaffold/scaffold.test.ts src/lib/projects/generated-app-manifest.test.ts src/lib/projects/generated-build-policy.test.ts`

Expected: PASS, including regression fixtures for duplicate chrome and missing hash history.

- [ ] **Step 5: Run the repository gate and commit**

Run: `bun run check`

```bash
git add src/lib/projects/topology-compiler.ts src/lib/projects/topology-compiler.test.ts src/lib/projects/scaffold/vite-tanstack-shadcn-starter.ts src/lib/projects/scaffold/scaffold.test.ts src/lib/projects/generated-app-manifest.ts src/lib/projects/generated-app-manifest.test.ts src/lib/projects/generated-build-policy.ts src/lib/projects/generated-build-policy.test.ts
git commit -m "feat: compile protected generated topology"
```

### Task 8: Enforce Fact And Claim Conformance

**Files:**
- Create: `src/lib/projects/high-risk-claims.ts`
- Create: `src/lib/projects/high-risk-claims.test.ts`
- Create: `src/lib/projects/generated-contract-content.ts`
- Create: `src/lib/projects/generated-contract-content.test.ts`
- Modify: `src/lib/projects/agent-tool-runner.ts`
- Modify: `src/lib/projects/agent-tool-runner.test.ts`
- Modify: `src/lib/projects/custom-source-generator.ts`
- Modify: `src/lib/projects/custom-source-generator.test.ts`

**Interfaces:**
- Produces: `scanSourceClaims`, `scanRenderedClaims`, `validateRenderedFactMarkers`.
- Produces protected generated primitives: `ContractFact`, `ContractAction`, `MediaAsset`.
- Consumes the compiler's exact `aiWritablePaths`; rejects all other writes.

- [ ] **Step 1: Write failing seeded grammar and write-policy tests**

```ts
it.each([
  ["<a href='https://wa.me/628123456789'>Chat</a>", "contact"],
  ["Harga Rp 25.000", "price"],
  ["Buka Senin 08.00-17.00", "hours"],
  ["Rating 4.9/5", "proof"],
])("blocks raw high-risk source: %s", (source, category) => {
  expect(scanSourceClaims(source)).toContainEqual(expect.objectContaining({ category }));
});

it("allows a stable fact-id reference without embedding its literal", () => {
  expect(scanSourceClaims('<ContractAction factId="contact-primary" />')).toEqual([]);
});
```

- [ ] **Step 2: Verify tests fail**

Run: `bun run test -- src/lib/projects/high-risk-claims.test.ts src/lib/projects/generated-contract-content.test.ts src/lib/projects/agent-tool-runner.test.ts src/lib/projects/custom-source-generator.test.ts`

Expected: FAIL because the common claim grammar/primitives are absent.

- [ ] **Step 3: Implement versioned source/DOM matchers and primitives**

```ts
export type ClaimMatch = {
  category: HighRiskClaimCategory;
  normalizedValue: string;
  location: { file?: string; route?: string; selector?: string };
};

export function validateRenderedFactMarkers(
  matches: ClaimMatch[],
  contract: BuildContractV1,
): ClaimValidationReport;
```

Cover every grammar category in the spec with positive, negative, boundary, Indonesian-variant, JSX-expression, and rendered-DOM fixtures. Permit values only through protected contract primitives. Keep qualitative prose advisory unless it matches a blocking grammar.

- [ ] **Step 4: Run focused tests**

Run: `bun run test -- src/lib/projects/high-risk-claims.test.ts src/lib/projects/generated-contract-content.test.ts src/lib/projects/agent-tool-runner.test.ts src/lib/projects/custom-source-generator.test.ts`

Expected: PASS with zero unsupported seeded high-risk claims.

- [ ] **Step 5: Run the repository gate and commit**

Run: `bun run check`

```bash
git add src/lib/projects/high-risk-claims.ts src/lib/projects/high-risk-claims.test.ts src/lib/projects/generated-contract-content.ts src/lib/projects/generated-contract-content.test.ts src/lib/projects/agent-tool-runner.ts src/lib/projects/agent-tool-runner.test.ts src/lib/projects/custom-source-generator.ts src/lib/projects/custom-source-generator.test.ts
git commit -m "feat: enforce generated claim provenance"
```

### Task 9: Make Qualification Runs And Candidates Immutable

**Files:**
- Create: `src/lib/projects/candidate-qualification.ts`
- Create: `src/lib/projects/candidate-qualification.test.ts`
- Modify: `src/lib/projects/snapshots.ts`
- Modify: `src/lib/projects/snapshots.test.ts`
- Modify: `src/lib/projects/build-attempt-worker.ts`
- Modify: `src/lib/projects/build-worker.test.ts`
- Modify: `src/lib/projects/build-repair-planner.ts`
- Modify: `src/lib/projects/build-repair-planner.test.ts`

**Interfaces:**
- Produces: `QualificationRunBudget`, `createCandidateChild`, `recordGateReport`, `selectQualifiedCandidate`.
- Every automatic child records `rootAttemptId`, `parentSnapshotId`, handoff hashes/revisions, and gate-report version.

- [ ] **Step 1: Write failing immutability and budget tests**

```ts
it("creates a child snapshot for every source mutation", async () => {
  const child = await createCandidateChild({ parentSnapshotId: "a", rootAttemptId: "run-1", files });
  expect(child.parentSnapshotId).toBe("a");
  expect(await snapshotSource("a")).toEqual(originalFiles);
});

it("shares repair budgets across categories within a run", () => {
  const budget = budgetAfter({ compile: 2, browser: 1, visual: 0 });
  expect(() => budget.consume("compile")).toThrow("repair budget exhausted");
});
```

- [ ] **Step 2: Verify tests fail**

Run: `bun run test -- src/lib/projects/candidate-qualification.test.ts src/lib/projects/snapshots.test.ts src/lib/projects/build-worker.test.ts src/lib/projects/build-repair-planner.test.ts`

Expected: FAIL because repair may mutate the current candidate and has no run identity.

- [ ] **Step 3: Implement immutable candidate orchestration**

```ts
export type QualificationRunBudget = {
  initial: 1;
  compileRepairsRemaining: 0 | 1 | 2;
  browserRepairsRemaining: 0 | 1;
  visualRepairsRemaining: 0 | 1;
  candidatesCreated: number;
};
```

Keep infrastructure retries on the same snapshot. Start fresh bounded budgets only for explicit charged user attempts. Select/deploy only after all required gates pass and the operation lease still matches.

- [ ] **Step 4: Run focused tests**

Run: `bun run test -- src/lib/projects/candidate-qualification.test.ts src/lib/projects/snapshots.test.ts src/lib/projects/build-worker.test.ts src/lib/projects/build-repair-planner.test.ts`

Expected: PASS; failed children preserve prior snapshots and selected deployment.

- [ ] **Step 5: Run the repository gate and commit**

Run: `bun run check`

```bash
git add src/lib/projects/candidate-qualification.ts src/lib/projects/candidate-qualification.test.ts src/lib/projects/snapshots.ts src/lib/projects/snapshots.test.ts src/lib/projects/build-attempt-worker.ts src/lib/projects/build-worker.test.ts src/lib/projects/build-repair-planner.ts src/lib/projects/build-repair-planner.test.ts
git commit -m "feat: qualify immutable generation candidates"
```

### Task 10: Add Actual-Preview Browser Gates And Private Evidence

**Files:**
- Create: `src/lib/projects/browser-gates.ts`
- Create: `src/lib/projects/browser-gates.test.ts`
- Create: `src/lib/projects/gate-evidence.ts`
- Create: `src/lib/projects/gate-evidence.test.ts`
- Modify: `scripts/self-verify-preview.ts`
- Modify: `scripts/capture-project-thumbnail.cjs`
- Modify: `src/lib/object-storage.ts`
- Modify: `src/lib/object-storage.test.ts`
- Modify: `src/lib/projects/project-cleanup.ts`
- Modify: `src/lib/projects/project-cleanup.test.ts`

**Interfaces:**
- Produces: `runBrowserGates({ previewUrl, plan, contract, candidateId }): BrowserGateReport`.
- Produces: `storeGateEvidence`, `readGateEvidence`, `deleteExpiredGateEvidence`.
- Returns exactly `pass | fail | infrastructure_error`.

- [ ] **Step 1: Write failing browser-report and storage-policy tests**

```ts
it("does not convert a navigation timeout into a passing report", async () => {
  expect(await runWithTimedOutPage()).toMatchObject({ status: "infrastructure_error" });
});

it("checks unknown routes without requiring business CTA or media", async () => {
  const report = await runUnknownRouteFixture();
  expect(report.assertions).toContainEqual(expect.objectContaining({ name: "safe-home-link", status: "pass" }));
  expect(report.assertions.some((item) => item.name === "primary-cta")).toBe(false);
});
```

- [ ] **Step 2: Verify tests fail**

Run: `bun run test -- src/lib/projects/browser-gates.test.ts src/lib/projects/gate-evidence.test.ts src/lib/object-storage.test.ts src/lib/projects/project-cleanup.test.ts`

Expected: FAIL because browser qualification and private evidence storage are absent.

- [ ] **Step 3: Implement bounded route/viewport checks**

```ts
export type BrowserGateReport = {
  version: 1;
  status: "pass" | "fail" | "infrastructure_error";
  routes: BrowserRouteReport[];
  evidenceIds: string[];
  overheadMs: number;
};
```

Test six route patterns maximum at 360px and 1440px, two contexts, ten-second navigation timeout, one infrastructure retry, plan/manifest/router parity, links, CTA target, media, overflow, shell count, landmarks, title/heading, keyboard navigation, axe serious/critical results, layout intent, and one unknown route. Store private screenshots under owner/project/candidate scope and expire gate evidence after 30 days.

- [ ] **Step 4: Run focused tests and the local preview fixture**

Run: `bun run test -- src/lib/projects/browser-gates.test.ts src/lib/projects/gate-evidence.test.ts src/lib/object-storage.test.ts src/lib/projects/project-cleanup.test.ts`

Expected: PASS; fixture reports distinguish product failures from infrastructure failures.

- [ ] **Step 5: Run the repository gate and commit**

Run: `bun run check`

```bash
git add scripts/self-verify-preview.ts scripts/capture-project-thumbnail.cjs src/lib/projects/browser-gates.ts src/lib/projects/browser-gates.test.ts src/lib/projects/gate-evidence.ts src/lib/projects/gate-evidence.test.ts src/lib/object-storage.ts src/lib/object-storage.test.ts src/lib/projects/project-cleanup.ts src/lib/projects/project-cleanup.test.ts
git commit -m "feat: gate generated previews in browser"
```

### Task 11: Render And Accept The Complete Review Card

**Files:**
- Modify: `src/components/projects/WorkspaceShell.tsx`
- Modify: `src/components/projects/WorkspaceShell.test.ts`
- Modify: `src/components/projects/WorkspacePrimitives.tsx`
- Modify: `src/components/projects/WorkspacePrimitives.test.ts`
- Create: `src/components/projects/ContractBuildRecommendation.stories.tsx`
- Modify: `src/lib/projects/workspace-sync.test.ts`

**Interfaces:**
- Consumes persisted `{ handoffId, reviewHash, reviewItems }` only.
- Posts `{ handoffId, reviewHash, idempotencyKey }`.
- Shows grouped facts, AI drafts, CTA, omissions, pages, and assets without truncation.

- [ ] **Step 1: Write failing UI-state tests and stories**

```tsx
it("submits the exact persisted handoff and review hash", async () => {
  renderWorkspace(buildRecommendationFixture());
  await user.click(screen.getByRole("button", { name: "Mulai build" }));
  expect(generateRequest()).toMatchObject({ handoffId: "handoff-1", reviewHash: "review-1" });
});

it("keeps all review groups discoverable at the 96-item bound", () => {
  renderWorkspace(maximumReviewFixture());
  expect(screen.getAllByRole("listitem")).toHaveLength(96);
});
```

- [ ] **Step 2: Verify tests fail**

Run: `bun run test -- src/components/projects/WorkspaceShell.test.ts src/components/projects/WorkspacePrimitives.test.ts src/lib/projects/workspace-sync.test.ts`

Expected: FAIL because the card does not carry review proof or full grouped content.

- [ ] **Step 3: Implement grouped review, stale conflict, and retry states**

Use existing workspace primitives and design tokens. Keep `Mulai build` as the only pre-build start action. On 409, invalidate workspace state and show plain Indonesian refresh guidance. An accepted handoff retry uses the normal retry affordance and does not ask for reapproval.

- [ ] **Step 4: Run component and Storybook tests**

Run: `bun run test -- src/components/projects/WorkspaceShell.test.ts src/components/projects/WorkspacePrimitives.test.ts src/lib/projects/workspace-sync.test.ts && bun run test:storybook`

Expected: PASS at mobile/desktop stories with keyboard-reachable groups and action.

- [ ] **Step 5: Run the repository gate and commit**

Run: `bun run check`

```bash
git add src/components/projects/WorkspaceShell.tsx src/components/projects/WorkspaceShell.test.ts src/components/projects/WorkspacePrimitives.tsx src/components/projects/WorkspacePrimitives.test.ts src/components/projects/ContractBuildRecommendation.stories.tsx src/lib/projects/workspace-sync.test.ts
git commit -m "feat: review immutable build handoffs"
```

### Task 12: Route Edits And Restores Through Active Handoffs

**Files:**
- Create: `src/lib/projects/edit-structure.ts`
- Create: `src/lib/projects/edit-structure.test.ts`
- Modify: `src/lib/projects/edit-attempt-worker.ts`
- Modify: `src/lib/projects/edit-validation.test.ts`
- Modify: `src/lib/projects/edit-build-queue-worker.ts`
- Modify: `src/routes/api.projects.$id.edit.ts`
- Modify: `src/routes/api.projects.$id.snapshots.$snapshotId.restore.ts`
- Create: `src/routes/-api.projects.$id.restore.contract.test.ts`

**Interfaces:**
- Produces: `classifyEditStructure(request): "non_structural" | "structural"`.
- Non-structural operations load contract/plan from `Project.activeHandoffId`.
- Structural operations create and require acceptance of a replacement handoff before source mutation.

- [ ] **Step 1: Write failing edit/restore boundary tests**

```ts
it("prevents the edit agent from changing route topology", async () => {
  await expect(runNonStructuralEdit("add a catalog page")).rejects.toThrow("structural handoff required");
});

it("requires matching active hashes for direct restore", async () => {
  const response = await restoreSnapshot(snapshotFromOlderHandoff());
  expect(response.status).toBe(409);
  expect(await activeHandoffId()).toBe("current-handoff");
});
```

- [ ] **Step 2: Verify tests fail**

Run: `bun run test -- src/lib/projects/edit-structure.test.ts src/lib/projects/edit-validation.test.ts src/routes/-api.projects.$id.restore.contract.test.ts`

Expected: FAIL because edits/restores are not active-handoff aware.

- [ ] **Step 3: Implement dispatch and replacement-handshake behavior**

```ts
export type EditStructureDecision = {
  kind: "non_structural" | "structural";
  reasons: Array<"page_set" | "route_path" | "primary_cta" | "capability">;
};
```

Non-structural edits use the current allow-list and full qualification pipeline. Structural edits return to contract/plan preparation and owner review. Same-handoff restore creates a child and reruns gates; mismatched restore creates no active source change.

- [ ] **Step 4: Run focused tests**

Run: `bun run test -- src/lib/projects/edit-structure.test.ts src/lib/projects/edit-validation.test.ts src/routes/-api.projects.$id.restore.contract.test.ts`

Expected: PASS for legacy dispatch, contract non-structural edit, structural edit, matching restore, mismatched restore, and failed-child preservation.

- [ ] **Step 5: Run the repository gate and commit**

Run: `bun run check`

```bash
git add src/lib/projects/edit-structure.ts src/lib/projects/edit-structure.test.ts src/lib/projects/edit-attempt-worker.ts src/lib/projects/edit-validation.test.ts src/lib/projects/edit-build-queue-worker.ts src/routes/api.projects.$id.edit.ts src/routes/api.projects.$id.snapshots.$snapshotId.restore.ts src/routes/-api.projects.$id.restore.contract.test.ts
git commit -m "feat: preserve contract edit boundaries"
```

### Task 13: Add A Read-Only Visual Critic In Shadow Mode

**Files:**
- Create: `src/lib/projects/visual-critic.ts`
- Create: `src/lib/projects/visual-critic.test.ts`
- Create: `src/lib/projects/critic-calibration.ts`
- Create: `src/lib/projects/critic-calibration.test.ts`
- Modify: `src/lib/projects/candidate-qualification.ts`
- Modify: `src/lib/projects/candidate-qualification.test.ts`
- Modify: `src/lib/app-settings-registry.ts`
- Modify: `src/lib/app-settings-registry.test.ts`

**Interfaces:**
- Produces: `runVisualCritic(input): Promise<VisualCriticReport>` with no tools/write access.
- Produces: `evaluateCriticCalibration(labels): CalibrationDecision` per category.
- Setting defaults to `shadow`; provider approval is required before screenshots leave platform storage.

- [ ] **Step 1: Write failing authority and calibration tests**

```ts
it("cannot block or mutate a hard-gate-passing candidate in shadow mode", async () => {
  const result = await qualifyWithCritic({ mode: "shadow", findings: [criticalFinding()] });
  expect(result.hardGateStatus).toBe("pass");
  expect(result.childrenCreatedByCritic).toBe(0);
});

it("requires point precision, Wilson lower bound, recall, sample sizes, and zero P0 regressions", () => {
  expect(evaluateCriticCalibration(insufficientLabels()).eligibleForRepair).toBe(false);
});
```

- [ ] **Step 2: Verify tests fail**

Run: `bun run test -- src/lib/projects/visual-critic.test.ts src/lib/projects/critic-calibration.test.ts src/lib/projects/candidate-qualification.test.ts src/lib/app-settings-registry.test.ts`

Expected: FAIL because no critic boundary exists.

- [ ] **Step 3: Implement shadow evaluation and persisted findings**

```ts
export type VisualCriticReport = {
  status: "complete" | "unknown" | "unavailable";
  modelId: string | null;
  mode: "shadow";
  findings: VisualFinding[];
};
```

Send only approved private evidence, contract, plan, DOM geometry, and hard-gate report. Persist findings and confidence; never let the critic alter contracts, plans, evaluators, thresholds, source, selection, deployment, or publication.

- [ ] **Step 4: Run focused tests**

Run: `bun run test -- src/lib/projects/visual-critic.test.ts src/lib/projects/critic-calibration.test.ts src/lib/projects/candidate-qualification.test.ts src/lib/app-settings-registry.test.ts`

Expected: PASS; unavailable critic leaves a hard-gate-passing candidate previewable.

- [ ] **Step 5: Run the repository gate and commit**

Run: `bun run check`

```bash
git add src/lib/projects/visual-critic.ts src/lib/projects/visual-critic.test.ts src/lib/projects/critic-calibration.ts src/lib/projects/critic-calibration.test.ts src/lib/projects/candidate-qualification.ts src/lib/projects/candidate-qualification.test.ts src/lib/app-settings-registry.ts src/lib/app-settings-registry.test.ts
git commit -m "feat: evaluate generated visuals in shadow mode"
```

### Task 14: Wire Observability, Rollback Admission, And Canary Gates

**Files:**
- Create: `src/lib/projects/contract-generation-admission.ts`
- Create: `src/lib/projects/contract-generation-admission.test.ts`
- Create: `src/lib/projects/generation-observability.ts`
- Create: `src/lib/projects/generation-observability.test.ts`
- Modify: `src/lib/projects/build-attempt-worker.ts`
- Modify: `src/lib/projects/build-worker.test.ts`
- Modify: `src/lib/app-settings-registry.ts`
- Modify: `src/lib/app-settings-registry.test.ts`
- Modify: `PRODUCT.md`
- Modify: `DEV.md`

**Interfaces:**
- Produces: `assertContractGenerationAdmitted(project, settingsSnapshot)`.
- Produces sanitized candidate/attempt metrics with ids, counts, categories, booleans, timings, and failure classes only.
- Supports assignment `off | internal | pilot | all` and execution admission `enabled | paused` without changing sticky engines.

- [ ] **Step 1: Write failing rollback and telemetry tests**

```ts
it("pauses new contract attempts without changing engine or selected deployment", async () => {
  await expect(startContractAttempt({ admission: "paused" })).rejects.toThrow("contract generation is paused");
  expect(await projectEngine()).toBe("contract-v1");
  expect(await selectedSnapshotId()).toBe("last-known-good");
});

it("never records full contract text, prompts, or screenshot URLs", () => {
  expect(serializedGenerationEvent()).not.toMatch(/owner text|https:\/\/private/);
});
```

- [ ] **Step 2: Verify tests fail**

Run: `bun run test -- src/lib/projects/contract-generation-admission.test.ts src/lib/projects/generation-observability.test.ts src/lib/projects/build-worker.test.ts src/lib/app-settings-registry.test.ts`

Expected: FAIL because execution admission and complete sanitized telemetry are absent.

- [ ] **Step 3: Implement admission, emergency stop, and canonical docs**

```ts
export function assertContractGenerationAdmitted(input: {
  generationEngine: "legacy-v1" | "contract-v1";
  admission: "enabled" | "paused";
}): void;
```

Check admission before creating a new contract attempt and again before worker mutation. Preserve accepted handoffs and active deployments while paused. Document exact operator sequence: assignment off, admission paused, cancel/expire leases, inspect last-known-good, repair, admission enabled. Document the contract-v1 user flow and privacy boundary.

- [ ] **Step 4: Run focused tests and evaluator treatment dry-run**

Run: `bun run test -- src/lib/projects/contract-generation-admission.test.ts src/lib/projects/generation-observability.test.ts src/lib/projects/build-worker.test.ts src/lib/app-settings-registry.test.ts && bun run evaluate:generation -- --baseline-id frozen --mode treatment`

Expected: tests PASS; dry-run either produces a complete versioned report or exits non-zero for missing scheduled evidence.

- [ ] **Step 5: Run full verification and commit**

Run: `bun run verify`

```bash
git add src/lib/projects/contract-generation-admission.ts src/lib/projects/contract-generation-admission.test.ts src/lib/projects/generation-observability.ts src/lib/projects/generation-observability.test.ts src/lib/projects/build-attempt-worker.ts src/lib/projects/build-worker.test.ts src/lib/app-settings-registry.ts src/lib/app-settings-registry.test.ts PRODUCT.md DEV.md
git commit -m "feat: gate contract generation rollout"
```

### Task 15: Execute Internal And Pilot Release Gates

**Files:**
- Modify: `fixtures/generation-evaluation/visible-cases.json` only when a real regression fixture is discovered
- Modify: `docs/superpowers/specs/2026-08-03-contract-compiled-generation-design.md` only when benchmark evidence changes a deferred decision
- Create: `docs/reports/contract-generation-internal-canary.md`
- Create: `docs/reports/contract-generation-pilot-canary.md`

**Interfaces:**
- Consumes frozen evaluator reports and sanitized production metrics.
- Produces a dated go/no-go record with every design-spec threshold, denominator, result, evidence id, and decision owner.

- [ ] **Step 1: Run the frozen visible and hidden evaluations twice per brief**

Run: `bun run evaluate:generation -- --baseline-id contract-v1-baseline-2026-08-03 --mode treatment`

Expected: complete versioned report; missing/timeout/infrastructure-error trials remain in denominators.

- [ ] **Step 2: Verify the hard no-go conditions**

Record explicit zero counts for secret exposure, cross-project access, origin escape, wrong CTA, unsupported high-risk claims, root/primary-route failure, last-known-good loss, and publication without owner action. Any non-zero result keeps rollout `off`.

- [ ] **Step 3: Enable internal assignment only after the report passes**

Set `generation.contract_compiled_rollout = internal` and keep execution admission enabled. Create fresh admin-owned projects; do not alter existing projects. Observe at least the predeclared internal sample before changing cohort.

- [ ] **Step 4: Enable pilot assignment only after internal canary passes**

Set `generation.contract_compiled_rollout = pilot`. Confirm each contract-v1 assignment has `isWaitlistApproved(owner.email) === true`; disabled waitlist mode, development bypass, and admin identity alone must not qualify.

- [ ] **Step 5: Run final verification and commit the evidence records**

Run: `bun run verify`

```bash
git add docs/reports/contract-generation-internal-canary.md docs/reports/contract-generation-pilot-canary.md
git commit -m "docs: record contract generation canary"
```

Do not set rollout to `all` until every quantitative threshold in the design spec passes on the frozen hidden corpus and pilot canary. Do not implement active visual repair until a separate evidence-backed change enables only calibrated categories and adds its own immutable-child regression tests.
