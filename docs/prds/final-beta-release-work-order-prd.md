# PRD: Final Beta Release Work Order

Status: active
Created: 2026-07-07
Updated: 2026-07-07
Owner: Surya
Scope: audited remaining work order for UMKM Cepat first beta generated app platform
Read when: assigning AI agents to finish the first beta release, verifying which slices are done/partial/missing, or continuing implementation after the current audit-only pass
Do not read for: unrelated auth/profile/legal work, routine visual cleanup, or production deployment execution
Current truth: source code + `docs/prds/final-beta-release-audit-and-execution-prd.md` + `docs/prds/first-release-execution-spec.md` + `docs/prds/first-release-generated-app-platform-prd.md` + `docs/prds/isolated-project-runtime-prd.md` + `docs/architecture.md` + `docs/deployment.md`

## Status History

- 2026-07-07: Created after full audit pass with parent agent, reviewer subagent, scout subagent, targeted tests, and `bun run check` attempt.

## Problem Statement

UMKM Cepat is close to a first beta generated app platform, but it is not ready to release. The current repository contains a dirty worktree from previous agent slices. Some early slices have strong unit-test evidence, some are only partially integrated, and the remaining slices are not implemented.

The user needs a single final work order that future AI agents can execute without redoing the audit or guessing which work is already reliable. This work order must separate audited evidence from claimed status, identify blockers, and define the order of remaining implementation until the repo is beta-ready for deploy preparation.

This PRD is not a deployment plan. It prepares the repo, tests, docs, browser evidence, fixture evidence, and operator notes so a human/operator can deploy safely later.

## Solution

Use this PRD as the final implementation queue for the beta release push.

Future agents should:

1. Preserve the dirty worktree.
2. Do not reset, delete, or overwrite previous slice files without intent.
3. Start with the slice audit table below.
4. Fix only the first incomplete/highest-priority slice unless explicitly assigned a later slice.
5. Keep all behavior behind existing seams.
6. Add tests first for behavior changes.
7. Run targeted tests, then final quality gates.
8. Record browser and fixture evidence before claiming release readiness.

## Current Audit Evidence

### Commands And Results

- `bun run graph:update`: passed earlier; generated `graphify-out/`, do not commit.
- Targeted project-domain tests: passed.
  - Deployment resolution.
  - Workspace sync.
  - Generated app manifest.
  - Generated package policy.
  - Agent tool runner.
  - Generated source.
- `bun run test`: passed.
  - 38 test files.
  - 141 tests.
- Direct `bun test ... --project unit` for route tests: failed because direct Bun test runner does not provide Vitest API `vi.hoisted`.
  - This is a command misuse caveat, not proof that route tests fail under the project test runner.
  - Use `bun run test`, `bun run check`, or `vitest run --project unit`.
- `bun run check`: failed at Prettier because local subagent artifacts under `.pi-subagents/` were included by the format glob.
  - Failure files were generated audit artifacts, not product source.
  - This is now a tooling/artifact hygiene blocker: `.pi-subagents/` must be removed before checks or added to `.prettierignore`/ignored if the project wants subagent artifacts to be local-only.

### Dirty Worktree

Tracked modified files from prior agents:

- `docs/architecture.md`
- `src/app/api/projects/[id]/assets/[[...path]]/route.ts`
- `src/app/api/projects/[id]/generate/route.ts`
- `src/app/api/projects/[id]/preview/[[...path]]/route.ts`
- `src/app/api/projects/[id]/publish/route.ts`
- `src/app/api/projects/[id]/runtime/route.ts`
- `src/app/api/projects/[id]/source/route.ts`
- `src/app/p/[slug]/[[...path]]/route.ts`
- `src/components/projects/WorkspaceShell.tsx`
- `src/lib/projects/generated-source.test.ts`
- `src/lib/projects/generated-source.ts`
- `src/lib/projects/workspace-sync.test.ts`
- `src/lib/projects/workspace-sync.ts`

Untracked files from prior agents:

- `docs/prds/first-release-execution-spec.md`
- `docs/prds/first-release-generated-app-platform-prd.md`
- `src/app/api/projects/[id]/preview/[[...path]]/route.test.ts`
- `src/app/api/projects/[id]/publish/route.test.ts`
- `src/app/api/projects/[id]/runtime/route.test.ts`
- `src/app/api/projects/[id]/source/route.test.ts`
- `src/lib/projects/agent-tool-runner.test.ts`
- `src/lib/projects/agent-tool-runner.ts`
- `src/lib/projects/deployment-resolution.test.ts`
- `src/lib/projects/deployment-resolution.ts`
- `src/lib/projects/generated-app-manifest.test.ts`
- `src/lib/projects/generated-app-manifest.ts`
- `src/lib/projects/generated-package-policy.test.ts`
- `src/lib/projects/generated-package-policy.ts`

New audit PRDs added by this audit pass:

- `docs/prds/final-beta-release-audit-and-execution-prd.md`
- `docs/prds/final-beta-release-work-order-prd.md`

Generated local artifacts from audit:

- `.pi-subagents/` exists and caused `bun run check` Prettier failure. Do not commit it.

## Slice Audit Table

| Slice                               | Status       | Evidence                                                                                                                                   | Risk                                                                                                                                                                      | Next Action                                                                                   |
| ----------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 00 Baseline                         | Partial      | Route tests exist for preview/source/runtime/publish; workspace tests cover last-good behavior; `bun run test` passes.                     | Browser repro packet not found; baseline review notes incomplete.                                                                                                         | Add or locate baseline review packet; confirm route tests via Vitest if needed.               |
| 01 Deployment Resolution            | Partial-pass | `deployment-resolution.ts` exists; used by preview/source/runtime/publish/public/assets; unit tests pass.                                  | Legacy-only fallback and route matrix need stronger evidence.                                                                                                             | Add/verify route tests for legacy fallback and latest-successful selection.                   |
| 02 Workspace Composer               | Partial-pass | `workspace-sync.ts` and tests pass for held recommendation, post-build, failed-with-last-good. UI wired in `WorkspaceShell`.               | Browser evidence missing; names do not exactly mirror full spec state machine.                                                                                            | Browser review desktop/mobile after implementation.                                           |
| 03 Preview Failure Panels           | Partial-pass | Safe issue helper exists; private preview route emits actionable Indonesian HTML panel.                                                    | Route/browser matrix incomplete; blank iframe scenarios not manually proven.                                                                                              | Add/verify preview route tests and browser failure review.                                    |
| 04 Manifest Validator               | Done         | `generated-app-manifest.ts`; tests pass for missing manifest, runtime profile, capabilities, routes; build preflight uses it.              | None seen.                                                                                                                                                                | Keep covered in final `bun run check`.                                                        |
| 05 Package Policy                   | Done         | `generated-package-policy.ts`; tests pass for allowed deps, server/browser/native/media/unknown/lifecycle blocks; build preflight uses it. | Strict allowlist may need intentional updates only.                                                                                                                       | Keep covered in final `bun run check`.                                                        |
| 06 Source Snapshot Contract         | Partial-pass | Snapshot metadata includes manifest/origin/summary; source route selects active preview snapshot; source artifacts supported.              | Source route coverage and artifact inspection not fully evidenced.                                                                                                        | Verify source route tests under Vitest; inspect source artifact after a build.                |
| 07 Agent Tool Runner V1             | Partial      | Tool runner exists; tests pass for read/list/search/write/replace/check, path safety, package policy, must-check.                          | Not integrated into edit loop; slice acceptance asked for one edit-loop integration.                                                                                      | Finish Slice 09 integration; then mark Slice 07 fully done.                                   |
| 08 Initial Custom Generator Upgrade | Partial      | Generator has variant-based output and tests for several domains.                                                                          | User-required 7 exact fixtures not covered; visual/browser fixture review absent; current variants include non-requested bengkel/toko/jasa instead of exact fixture list. | Implement 7 exact fixtures and generator variants.                                            |
| 09 Edit Loop From Review State      | Missing      | Agent tool runner exists, post-build chat UI exists.                                                                                       | No API/UI path found invoking tool runner to create edited snapshot/build.                                                                                                | Implement edit request flow from latest successful preview source.                            |
| 10 Build Worker Shape               | Partial      | Generate route creates build records queued -> running -> succeeded/failed inline.                                                         | No worker interface, bounded concurrency, stale/crash detection, or independent ownership.                                                                                | Extract worker-shaped module; add lifecycle/concurrency/stale tests.                          |
| 11 Build Logs And Failure Reasons   | Partial      | Logs exist; generated source truncates build logs; manifest/package failures have preflight strings.                                       | No safe failure classifier, no sanitizer tests, no Indonesian UI summary mapping.                                                                                         | Add failure classifier, sanitizer, display summary tests.                                     |
| 12 Runtime Health And Recovery      | Partial      | Runtime supervisor/proxy/idle modules exist; local supervisor checks reachability and starts/stops process.                                | Retry-once behavior and manual kill/browser evidence not proven.                                                                                                          | Add recovery tests and manual stale runtime review.                                           |
| 13 Idle Cleanup                     | Partial-pass | `runtime-idle.ts`, runner, package script exist; tests listed in repo and covered by `bun run test`.                                       | Operator scheduler docs not fully audited.                                                                                                                                | Update/verify deployment docs for scheduler command.                                          |
| 14 Publish Promotion Policy         | Partial-pass | Publish route selects latest successful build; public route resolves published deployment; tests exist.                                    | Draft-newer-than-published workspace state and public unchanged failure evidence missing.                                                                                 | Add tests/browser review for draft rebuild success/failure not changing public until publish. |
| 15 Public Route Hardening           | Partial      | Public route is unauthenticated and uses published deployment resolver.                                                                    | Header/privacy/friendly 404 matrix incomplete.                                                                                                                            | Add public route tests for missing/unpublished, metadata leaks, headers.                      |
| 16 Custom Domain Foundation         | Missing      | No Prisma model/resolver/docs found.                                                                                                       | Required by execution spec unless explicitly deferred.                                                                                                                    | Add model/resolver/docs or record explicit deferral.                                          |
| 17 Beta Fixture Harness             | Missing      | Fixture prompts exist only in execution spec.                                                                                              | Release review unreproducible.                                                                                                                                            | Add fixture harness/checklist docs/scripts; execute at least 2, ideally 7.                    |
| 18 Operator Readiness               | Partial      | Architecture/deployment docs exist; runtime idle script exists.                                                                            | Complete VPS/local beta runbook and inspection commands not verified.                                                                                                     | Update operator docs and run operator checklist.                                              |
| 19 Release Quality Pass             | Missing      | `bun run test` passes; `bun run check` blocked by `.pi-subagents/` artifacts.                                                              | No browser matrix, fixture matrix, build pass, readiness packet.                                                                                                          | Clean/ignore artifacts; run full gates; perform browser and fixture review.                   |

## User Stories

1. As a beta user, I want my failed rebuild to preserve the last good preview, so that experimentation is safe.
2. As a beta user, I want generated websites to look business-specific, so that the product does not feel like a template generator.
3. As an angkringan owner, I want warm food-stall sections and CTAs, so that customers understand menu, location, and WhatsApp intent.
4. As a laundry owner, I want clean service/package sections, so that customers quickly understand booking and pickup options.
5. As a coffee shop owner, I want ambience/menu/visit sections, so that customers understand why to come and what to order.
6. As a barber shop owner, I want a bold service-and-booking layout, so that customers know services and how to book.
7. As a fashion shop owner, I want catalog/editorial sections, so that customers can browse collection style and order intent.
8. As a tutoring provider, I want trust/outcome/process sections, so that parents understand subjects and next steps.
9. As a home food seller, I want menu/freshness/order-intent sections, so that buyers understand what is available and how to order.
10. As a beta user, I want to ask for content edits after preview, so that I can fix copy without starting over.
11. As a beta user, I want to ask for visual edits after preview, so that I can adjust style without losing the site.
12. As a beta user, I want edit attempts to build from the last successful source, so that failed attempts do not poison future work.
13. As a beta user, I want failed edits to show a clear failure state, so that I know what happened.
14. As a beta user, I want build logs summarized in Indonesian, so that I can recover without reading developer logs.
15. As an operator, I want internal logs in English and sanitized, so that debugging is useful and safe.
16. As an operator, I want builds behind a worker-shaped interface, so that request lifecycles do not own long work.
17. As an operator, I want concurrency limits, so that one user cannot exhaust the VPS.
18. As an operator, I want stale build detection, so that crashed builds become visible failures.
19. As an operator, I want stale runtime detection and safe retry, so that previews recover from dead local processes.
20. As an operator, I want idle preview cleanup, so that VPS resources stay bounded.
21. As a site owner, I want publishing to be explicit, so that visitors only see output I approved.
22. As a site visitor, I want public pages to show only published content, so that draft failures never affect me.
23. As a site visitor, I want missing public pages to return a friendly 404, so that internals stay hidden.
24. As a future site owner, I want custom domains to attach to published output, so that DNS does not follow broken drafts.
25. As a QA reviewer, I want a repeatable fixture harness, so that release review can be rerun by any agent.
26. As a maintainer, I want a final readiness packet, so that release decisions are based on evidence.

## Implementation Decisions

- Preserve previous agent work. Do not reset the dirty worktree.
- Keep using Bun and the existing repo scripts.
- Use Vitest/repo scripts for tests, not direct Bun test runner for files using Vitest APIs.
- Use existing seams before adding new ones: deployment resolution, generated app contract, agent tool runner, build worker, runtime supervisor, public route resolver, and workspace flow.
- Implement Slice 08 next unless a maintainer asks to fix check artifact hygiene first.
- Add `.pi-subagents/` to ignored local artifact handling or remove local artifacts before final check. Do not commit `.pi-subagents/`.
- Do not add new dependencies for generator variety. Use deterministic React/CSS generation from existing brief/site schema.
- Do not add fake checkout/payment/backend behavior to generated sites.
- Treat worker-shaped local in-process build as acceptable for beta only if it has explicit interface, lifecycle, concurrency, and stale detection.
- Treat custom domain UI as deferrable only if model/resolver/docs are implemented or an explicit deferral is recorded.

## Testing Decisions

- Good tests assert user-visible or policy-visible behavior, not private implementation details.
- Unit tests are appropriate for deployment resolution, workspace state helpers, manifest/package validators, agent tool runner, build failure classifier, runtime idle policy, and domain resolver.
- Route tests are appropriate for preview/source/runtime/publish/public ownership and selection behavior.
- Browser review is mandatory for composer states, build progress, preview failure panel, desktop/mobile preview, edit chat, publish, and public URL behavior.
- Fixture review is mandatory for the 7 beta businesses. Unit tests can assert deterministic source/contract; browser/manual review must assess visual distinctiveness and no fake functionality.
- Final quality gate must run after removing/ignoring local subagent artifacts.

## Required Remaining Work Order

1. Clean audit artifact hygiene for checks.
   - Remove `.pi-subagents/` before final gates or add appropriate ignore config if the project intentionally permits local subagent artifacts.
   - Re-run `bun run check` after actual implementation, not during audit-only mode.
2. Finish Slice 08.
   - Add 7 exact fixture tests.
   - Upgrade generator variants.
   - Verify manifest/package policy.
   - Build a representative subset.
3. Finish Slice 09.
   - Wire review-state edit request to agent tool runner.
   - Load latest successful preview source.
   - Create edited snapshot/build.
   - Preserve last good preview on failure.
4. Finish Slice 10.
   - Extract build worker seam.
   - Add concurrency and stale detection.
5. Finish Slice 11.
   - Add safe failure classifier, sanitizer, and Indonesian summaries.
6. Finish Slice 12.
   - Prove stale runtime recovery and retry/failure events.
7. Finish Slice 13.
   - Verify idle cleanup and operator scheduler docs.
8. Finish Slice 14.
   - Prove explicit publish only and draft newer/unpublished state.
9. Finish Slice 15.
   - Harden public route tests, headers, 404, privacy.
10. Finish Slice 16.

- Add custom domain foundation or explicit deferral.

11. Finish Slice 17.

- Add fixture harness and run at least 2, preferably all 7.

12. Finish Slice 18.

- Complete operator readiness docs.

13. Finish Slice 19.

- Run final gates, browser matrix, fixture matrix, readiness packet.

## Out of Scope

- Actual production/VPS deployment.
- Committing or pushing changes.
- DNS changes.
- Real secret setup.
- Public traffic cutover.
- Arbitrary generated backend code.
- Generated Dockerfiles or native workloads.
- Full custom domain UI if foundation is enough for the beta work order.

## Further Notes

- This PRD is intentionally stricter than prior handoff claims. A slice is only `done` when evidence exists.
- The fastest safe path is not a huge rewrite. Finish the missing seams and evidence in order.
- The immediate implementation after this audit should be Slice 08, unless the maintainer wants the `.pi-subagents/` check blocker handled first.
