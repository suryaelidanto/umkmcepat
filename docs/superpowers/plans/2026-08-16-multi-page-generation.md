# Contract-driven multi-page generation implementation plan

> **For the next agent:** Required execution skill: follow this plan in order, keep the tests as the executable decision trail, and stop at a failing gate instead of weakening it.

**Goal:** Complete the live contract-v1/V2 multi-page generation loop and prove it through a fresh authenticated HTTP build.

**Design:** Carry an explicit bounded `visitorJobs` list through the legacy/canonical brief and discussion tool, derive all pages deterministically from accepted jobs, make the V2 writer emit every accepted route plus a shared shell, compile the platform-owned router from the plan, and make source/correction/parser gates route-aware. Keep the unapproved professional V3 release path unchanged.

**Stack:** TypeScript, Bun, Vitest, Zod, TanStack Router, existing generated-site contract/pipeline.

## Execution rules

- Use TDD for each behavior: add a focused failing test, run it, implement the smallest change, run the focused test, then run the nearest lint/typecheck.
- Do not edit generated source, database evidence, screenshots, or `.data/project-*` artifacts by hand.
- Do not add secrets or print environment values.
- Preserve the existing single-route behavior and all current quality thresholds.
- Do not approve `config/professional-site-quality-release.json`.

## 1. Add the visitor-job model to both brief representations

Files:

- `src/lib/projects/brief.ts`
- `src/lib/projects/canonical-brief.ts`
- `src/lib/projects/brief.test.ts`
- `src/lib/projects/canonical-brief.test.ts`
- `src/lib/projects/canonical-brief-architecture.test.ts` if the canonical shape assertions require it

Changes:

1. Define the shared `VisitorJob` shape with `id`, `goal`, and `priority` (`primary` or `secondary`); add optional `visitorJobs` to `ProjectBrief` and the required normalized array to `ProjectBriefV2`.
2. Add a server-side normalizer that trims values, slug-normalizes ids, deduplicates ids, bounds goals, preserves order, requires one primary when an explicit list is supplied, and rejects more than one primary or more than two secondary jobs.
3. Include visitor jobs in initial brief values, legacy parsing, canonical migration, V2 parsing, canonical-to-legacy projection, and canonical hashing.
4. Extend `applyAiBriefPatch` and legacy patch merging so an explicitly supplied list replaces the normalized list; an empty list clears it and lets the planner use its single-job default.

Tests first:

- legacy and canonical round trips preserve two distinct jobs;
- normalization removes malformed entries and duplicate ids;
- multiple primaries and over-limit secondary jobs are rejected or ignored at the trust boundary according to the chosen result type;
- canonical hash changes when visitor jobs change;
- absent jobs retain the existing single-job default behavior.

Commands:

```bash
bunx vitest run src/lib/projects/brief.test.ts src/lib/projects/canonical-brief.test.ts src/lib/projects/canonical-brief-architecture.test.ts
bunx eslint src/lib/projects/brief.ts src/lib/projects/canonical-brief.ts
```

## 2. Make discussion output carry visitor jobs

Files:

- `src/lib/projects/brief-flow.ts`
- `src/lib/projects/discuss-tool.ts`
- `src/lib/projects/prompts/discuss-system.ts`
- `src/lib/projects/brief-flow.test.ts`

Changes:

1. Add the structured `visitorJobs` patch to `WorkspaceTurnToolInput`, the Zod tool schema, and `applyBriefPatch`.
2. Normalize the patch through the shared brief helper; preserve a valid existing list if a malformed patch arrives rather than silently inventing a page.
3. Update the internal discuss prompt to say that the model may record one primary and up to two secondary jobs only when the owner explicitly describes distinct outcomes; it must ask a clarifying question when the distinction affects structure and must not infer jobs from words like “menu” or “katalog”.
4. Add a focused test proving a structured multi-job patch survives normalization and a malformed patch does not create a job.

Commands:

```bash
bunx vitest run src/lib/projects/brief-flow.test.ts
bunx eslint src/lib/projects/brief-flow.ts src/lib/projects/discuss-tool.ts src/lib/projects/prompts/discuss-system.ts
```

## 3. Derive the plan from accepted jobs

Files:

- `src/lib/projects/build-planner.ts`
- `src/lib/projects/build-planner.test.ts`
- `src/lib/projects/build-plan.ts` only if the live route limit needs a shared validation constant

Changes:

1. Replace the hard-coded visitor job in `buildContractFromBrief` with the normalized explicit list, falling back to one primary job only when the brief has no list.
2. Make invalid explicit jobs fail closed before the handoff is persisted.
3. Rewrite `buildPlanFromContract` so the root page owns the primary job and each secondary job deterministically yields one additional page. Remove keyword-only `/katalog` creation.
4. Use stable route classification for catalog/browse, location/operations, and order/contact jobs, then safe-slug unknown goals with collision suffixes. Keep all required fact ids contract-backed.
5. Derive navigation and capabilities from the resulting pages. Keep one job exactly one page; cap the live plan at three routes and reject over-limit contracts rather than collapsing them.
6. Keep `validatePlanAgainstContract` as the final mechanical check and add coverage for page/job correspondence.

Tests first:

- one-job brief -> one contract job and one page;
- two distinct jobs -> root plus a deterministic second route with the secondary job id;
- one job whose goal mentions a catalog -> still one page;
- unsafe/colliding/over-limit cases fail closed or receive a safe deterministic suffix;
- the existing contract hash/provenance tests remain green.

Commands:

```bash
bunx vitest run src/lib/projects/build-planner.test.ts
bunx eslint src/lib/projects/build-planner.ts src/lib/projects/build-plan.ts
```

## 4. Compile a reusable platform-owned route tree

Files:

- `src/lib/projects/professional-site-router.ts` or a new adjacent route-compiler module if the existing V3 type is too specific
- `src/lib/projects/professional-site-router.test.ts`
- `src/lib/projects/scaffold/route-compiler.test.ts` if a new module is selected

Changes:

1. Reuse the existing route-tree compiler where possible; keep V3 output byte-for-byte equivalent for its current tests.
2. Expose a route-binding input containing only path, file path, and component export for the V2 path, or add a small generic compiler beneath the existing professional wrapper.
3. Validate one-to-three routes, root-first order, safe static paths, exact `src/routes/<slug>.tsx` mapping, unique paths/variables, and safe export names.
4. Emit imports for every route, a 404 catch-all, hash history, the route tree, and the TanStack module declaration.

Tests first:

- `/` and `/katalog` both import and appear in `rootRoute.addChildren`;
- the root maps to `HomeRouteComponent`;
- duplicate, dynamic, wildcard, unsafe, mismatched, and over-limit bindings fail.

Commands:

```bash
bunx vitest run src/lib/projects/professional-site-router.test.ts src/lib/projects/scaffold/route-compiler.test.ts
```

## 5. Make the V2 writer and parser route-aware

Files:

- `src/lib/projects/batched-prompt.ts`
- `src/lib/projects/batched-generator.ts`
- `src/lib/projects/batched-prompt.test.ts`
- `src/lib/projects/batched-generator.test.ts`
- `src/lib/projects/generated-site-contract.ts` only if route metadata needs a small typed helper

Changes:

1. Derive V2 writable paths from `contract.obligations.routes`: root file, each additional route file, and `src/components/site/generated-shell.tsx` for multi-route contracts.
2. Instruct the writer to emit every required route and shared shell, use exact accepted routes/CTA/data, export the expected component names, and call `usePreviewReady()` on every route. Do not permit router/content/theme/runtime files.
3. Pass `requiredFilePaths` and `stopAfterRequiredFilePaths` to the V2 parser so a response cannot finish after only the root route. Preserve the existing design-plan protocol.
4. Use a 32 KiB editable limit for one route and a 48 KiB limit for multi-route output. Apply the same bound to the shared correction.
5. Add route-file name/export validation before merge and reject missing, duplicate, protected, or unexpected editable paths.
6. Compile the platform router after the writer output is merged and before source/build gates. Keep router source platform-owned and persist it as part of the candidate output.
7. Ensure anchor/theme normalization applies to every generated route; keep route-specific home normalization only where it is semantically required.

Tests first:

- single-route prompt remains root-only and retains the 32 KiB rule;
- multi-route prompt lists all route paths and the shared shell;
- parser requires all multi-route files and stops only after the final required path;
- unexpected route/protected file and missing route fail;
- compiled router is present in the final candidate and cannot be model-overwritten.

Commands:

```bash
bunx vitest run src/lib/projects/batched-prompt.test.ts src/lib/projects/batched-generator.test.ts src/lib/projects/professional-site-router.test.ts
bunx eslint src/lib/projects/batched-prompt.ts src/lib/projects/batched-generator.ts src/lib/projects/generated-site-contract.ts
```

## 6. Harden source gates, browser correction scope, and integration wiring

Files:

- `src/lib/projects/generated-site-gates.ts`
- `src/lib/projects/generated-site-gates.test.ts`
- `src/lib/projects/generated-site-shadow.ts`
- `src/lib/projects/generated-site-pipeline.ts` only if candidate finalization needs the compiled router
- `src/lib/projects/build-attempt-worker.ts` only if the V2 finalization seam does not already receive the compiled router
- `src/lib/projects/generated-site-browser-runner.ts` only if route result assertions need a bounded route list change

Changes:

1. Make `inspectReferenceCalibratedSiteSource` require every accepted route file, expected export, preview hook, and route registration while keeping the single-route diagnostics unchanged.
2. Evaluate populated `site.*` content over the combined route source so multi-page output may distribute content without bypassing the contract.
3. Make correction scope include all accepted editable route files and the shared shell for multi-route candidates; continue rejecting protected paths and unrelated files.
4. Preserve route-aware browser execution through `contract.page.routes`; fail if a route is missing from the browser report rather than treating the root pass as sufficient.
5. Add focused source/correction tests for missing route files, missing hooks, and unregistered routes.

Commands:

```bash
bunx vitest run src/lib/projects/generated-site-gates.test.ts src/lib/projects/generated-site-gates.array-method.test.ts src/lib/projects/batched-generator.test.ts
bunx eslint src/lib/projects/generated-site-gates.ts src/lib/projects/generated-site-shadow.ts src/lib/projects/generated-site-pipeline.ts src/lib/projects/build-attempt-worker.ts src/lib/projects/generated-site-browser-runner.ts
```

## 7. Run the complete local gate and repair regressions

Commands, in order:

```bash
bunx vitest run
bun run check
```

If a check fails, use the failing log and the systematic-debugging workflow. Do not relax assertions, thresholds, route limits, or parser requirements. Update the canonical docs if implementation details differ from the spec.

## 8. Prove the real authenticated HTTP loop

Private/ignored diagnostics may be used under `.data/diagnostics/`; no tracked source or evidence may be hand-edited.

1. Start or verify the minimal/full local infrastructure using the repo-owned commands only; do not kill processes by pattern.
2. Start the app through the normal dev command and verify the owner/session path with a fresh valid local account/session. Keep the cookie/signing secret process-local and never print it.
3. Use the real discussion HTTP endpoint with an owner message that explicitly states two distinct customer jobs, then follow the actual build confirmation flow. Do not update the brief, handoff, attempt, source, or evidence tables directly to manufacture proof.
4. Capture only non-secret identifiers and statuses: project id, turn id, handoff id, attempt id, contract/plan route list, generated file paths, browser status per route, preview/media/thumbnail/admin status, and evidence refs.
5. Confirm the persisted brief/contract/plan contains the explicit jobs, the generated source contains every route, the compiled router registers them, and HTTP preview responds for `/` and the extra route.
6. If the first real run fails, read `dev.log` by project/turn/attempt id and the relevant Docker logs, fix the causal issue, then run a new fresh proof. Do not reuse a failed project as success evidence.

## 9. Release through dev and main

Before release, read and follow:

- `.agents/skills/verification-before-completion/SKILL.md`
- `.agents/skills/requesting-code-review/SKILL.md`
- `.agents/skills/push-dev/SKILL.md`
- `.agents/skills/push-main/SKILL.md`

1. Verify the worktree contains only intentional changes and the branch is `dev`.
2. Run `bun run check` again immediately before commit/push.
3. Commit implementation/docs with a Conventional Commit message. Do not include `.env`, logs, screenshots, generated runtime artifacts, or secrets.
4. Push `dev`, inspect the real CI checks/logs, and repair any failure using the CI skill before proceeding.
5. Request/review the implementation against the handoff checklist.
6. Release the completed dev commit to `main` using the release skill; wait for green main CI.
7. Synchronize local `dev` with `origin/dev`, verify `git status --short --branch` is clean, and report the exact evidence.

## Done checklist

- [ ] Explicit visitor jobs survive discussion, legacy brief, canonical brief, contract, and plan.
- [ ] Single job produces one page; distinct jobs produce multiple pages; keyword-only split is gone.
- [ ] V2 writer emits all route files and a shared shell only when needed.
- [ ] Platform router registers every accepted route and the 404 route.
- [ ] Parser, source gates, correction scope, browser gates, and byte limits are route-aware.
- [ ] Full Vitest and `bun run check` pass.
- [ ] Fresh authenticated HTTP proof includes DB/source/routes/screenshots/media/thumbnail/admin evidence.
- [ ] `dev` CI and `main` CI are green; local `dev` is clean and synchronized.
