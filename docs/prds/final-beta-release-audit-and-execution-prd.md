# PRD: Final Beta Release Audit And Execution Plan

Status: active
Created: 2026-07-07
Updated: 2026-07-07
Owner: Surya
Scope: final audit, remaining first-release generated app platform work, beta readiness execution
Read when: resuming first-release work, auditing prior agent changes, planning Slice 08-19, verifying beta readiness, or deciding whether UMKM Cepat can ship to beta users
Do not read for: unrelated auth/profile/legal copy changes, isolated UI polish outside the generated app platform, or provider-only maintenance
Current truth: source code + `AGENTS.md` + `PRINCIPLES.md` + `DEV.md` + `DESIGN.md` + `docs/architecture.md` + `docs/deployment.md` + `docs/prds/isolated-project-runtime-prd.md` + `docs/prds/first-release-generated-app-platform-prd.md` + `docs/prds/first-release-execution-spec.md` + this PRD

## Status History

- 2026-07-07: Created as the final focused PRD after auditing the previous agent handoff, current dirty worktree, targeted slice tests, and first-release execution spec.

## Problem Statement

UMKM Cepat has a working generated website builder spine, but it is not yet safe to call beta-ready. Prior agents already implemented or partially implemented the early reliability slices, but their changes are still in a dirty worktree with untracked files. The product still needs a full audit, a precise remaining-work plan, and then implementation through the remaining slices before release.

From the user's perspective, the risk is simple: they can create a website, but the platform may still feel templated, may not support review edits end to end, may not clearly recover from failed builds/runtime issues, or may accidentally let a failed draft affect preview/public output.

From the operator's perspective, the risk is that build/runtime/publish behavior may work in happy-path demos but lack enough audit evidence, tests, fixture coverage, logs, and operational docs for a small VPS beta release.

The immediate problem is not to write more code blindly. The immediate problem is to finish a full audit and then execute the remaining release slices in a way that preserves prior agent work, proves each invariant with tests/browser evidence, and produces a final beta readiness packet.

## Solution

UMKM Cepat will treat this PRD as the final release-focus document for the current beta push.

The work proceeds in two modes:

1. Audit mode: map the current worktree, previous slices, tests, and spec acceptance criteria before changing behavior.
2. Execution mode: finish the remaining slices in order, starting with Slice 08, with tests first and browser/fixture evidence at the end.

The beta release is ready only when:

- Slices 08-19 are complete or explicitly deferred by the first-release spec.
- Earlier slices 01-07 are audited and still passing.
- Generated app output across the 7 beta fixtures is business-specific, responsive, and not fake.
- The edit loop works from the review state.
- Failed builds never hide latest successful preview.
- Public output only changes through explicit publish/promotion of successful builds.
- Build/runtime failures are visible, actionable, and logged safely.
- Operator docs cover local/VPS beta operation.
- `bun run check` passes.
- Required browser review and fixture review evidence exists.

## Current Audit Snapshot

Audit performed before this PRD:

- Current branch command was run; worktree is dirty and must not be reset.
- Graphify was previously refreshed successfully.
- Required docs and PRDs were read.
- Targeted slice tests for project-domain seams passed under Vitest project runner.
- Running route tests directly with `bun test ... --project unit` failed because Bun's test runner does not provide `vi.hoisted`; the correct repo test command is Vitest via `bun run test` or `vitest run --project unit`.
- `bun run test` passed: 38 files, 141 tests.

Current tracked modified files from prior work:

- Architecture docs.
- Private preview asset route.
- Generate route.
- Private preview proxy route.
- Publish route.
- Runtime status route.
- Source route.
- Public published route.
- Workspace shell.
- Generated source tests.
- Generated source generator.
- Workspace sync tests.
- Workspace sync logic.

Current untracked files from prior work:

- First-release execution spec.
- First-release generated app platform PRD.
- Private preview route tests.
- Publish route tests.
- Runtime route tests.
- Source route tests.
- Agent tool runner implementation and tests.
- Deployment resolution policy implementation and tests.
- Generated app manifest implementation and tests.
- Generated package policy implementation and tests.

Audit interpretation:

- Prior work is real and has passing tests under the correct test runner.
- Prior work is not yet integrated into a clean committed state.
- Slice 08 is partial: generator currently has only a smaller set of variants and does not yet satisfy the user's requested 7 exact fixture businesses.
- Slices 09-19 remain unimplemented or unaudited for completion.

## Release-Seam Strategy

Use the highest existing seams possible. Do not introduce new seams unless a slice cannot be tested or operated through an existing seam.

Primary seam:

1. Project workspace flow: create project, discuss, build, review preview, edit, rebuild, publish, revisit.

Supporting seams:

2. Deployment resolution policy: chooses active preview/source/runtime/publish build without letting failed attempts win.
3. Generated app contract: manifest and package policy validate generated source before build.
4. Agent tool runner: constrains source edits after preview.
5. Build worker: owns source snapshot to build artifact lifecycle.
6. Runtime supervisor: starts/stops/checks deployments and supports recovery/idle cleanup.
7. Public route resolver: serves only explicit published deployments without private metadata.
8. Fixture harness: repeatably reviews the 7 beta businesses.

Testing should prefer the project workspace flow when behavior crosses UI/API/runtime boundaries. Unit tests are appropriate for policy/validator/worker helpers. Route tests are appropriate for ownership, preview/source/publish selection, public route behavior, and safe responses.

## User Stories

1. As a new UMKM owner, I want to describe my business in Indonesian, so that I can start a website without knowing technical terms.
2. As a signed-in user, I want guided questions only when needed, so that I can reach a build-ready brief quickly.
3. As a signed-in user, I want the workspace to remember whether I am discussing, building, reviewing, or editing, so that refreshes do not confuse me.
4. As a signed-in user, I want a build recommendation to be stable, so that I do not lose the next action after a refresh.
5. As a signed-in user, I want the normal chat composer hidden when the app is asking me to build, so that the primary action is clear.
6. As a signed-in user, I want to continue discussion from a recommendation, so that I can clarify before building.
7. As a signed-in user, I want build progress to show meaningful steps, so that I know the app is working.
8. As a signed-in user, I want the generated preview to appear inside the workspace, so that I can review before publishing.
9. As a signed-in user, I want an actionable preview failure panel, so that I never stare at a blank white iframe.
10. As a signed-in user, I want the preview to retry safely when the runtime is stale, so that temporary runtime failures can recover.
11. As a signed-in user, I want the last successful preview to remain visible after a failed rebuild, so that failed experiments do not destroy working output.
12. As a signed-in user, I want build failures to explain what happened in Indonesian, so that I know what to do next.
13. As a developer/operator, I want internal build logs in English, so that debugging remains consistent.
14. As a developer/operator, I want logs sanitized, so that secrets never leak through failure output.
15. As a signed-in user, I want generated websites to feel specific to my business, so that UMKM Cepat does not feel like a generic template tool.
16. As an angkringan owner, I want a warm food-stall layout, so that my website matches nighttime food and drink buying behavior.
17. As a laundry owner, I want a clean service-focused layout, so that customers understand service types and booking quickly.
18. As a coffee shop owner, I want a menu/ambience layout, so that customers understand the place, drinks, and visit intent.
19. As a barber shop owner, I want a bold booking-focused layout, so that customers can pick a service and book confidently.
20. As a fashion shop owner, I want a catalog/editorial layout, so that customers can browse collections and style direction.
21. As a tutoring provider, I want a trust-and-outcome layout, so that parents understand subjects, process, and credibility.
22. As a home food seller, I want an order-intent food layout, so that buyers understand menu, freshness, and how to order.
23. As a signed-in user, I want generated apps to avoid fake checkout/payment/backend claims, so that my customers are not misled.
24. As a signed-in user, I want generated apps to pass the platform contract before build, so that broken source is rejected early.
25. As a signed-in user, I want generated apps to avoid blocked heavy dependencies, so that builds stay cheap and safe.
26. As a signed-in user, I want to request a copy edit after preview, so that I can correct the website without starting over.
27. As a signed-in user, I want to request a visual edit after preview, so that the design can match my taste.
28. As a signed-in user, I want edits to start from the latest successful preview source, so that failed attempts do not become the base for future work.
29. As a signed-in user, I want every edit to create a new source snapshot, so that changes are recoverable and auditable.
30. As a signed-in user, I want every edit to create a new build attempt, so that success and failure are visible.
31. As a signed-in user, I want a failed edit build to preserve the old working preview, so that I can continue safely.
32. As a signed-in user, I want only successful builds to become publishable, so that broken output cannot go public.
33. As a signed-in user, I want publishing to be explicit, so that a draft rebuild does not unexpectedly change my public site.
34. As a signed-in user, I want the workspace to show when my draft is newer than the published site, so that I know what visitors see.
35. As a visitor, I want a public URL to load only the website the owner published, so that draft failures do not affect me.
36. As a visitor, I want a friendly 404 for missing/unpublished sites, so that the product does not expose internal details.
37. As a visitor, I want public pages to avoid private metadata, so that project/user internals stay hidden.
38. As an operator, I want build work behind a worker-shaped interface, so that request handling is not the long-term build owner.
39. As an operator, I want build concurrency bounded, so that one user cannot exhaust the VPS.
40. As an operator, I want stale/crashed builds detected, so that stuck attempts can become visible failures.
41. As an operator, I want idle preview runtimes stopped, so that preview cost stays low.
42. As an operator, I want recently requested previews to stay alive, so that active users are not interrupted.
43. As an operator, I want runtime events recorded, so that recovery/debugging does not require process memory.
44. As an operator, I want commands to inspect builds/deployments/runtime events, so that beta incidents can be diagnosed.
45. As an operator, I want artifact and runtime storage documented, so that restarts do not destroy previewability.
46. As a future product owner, I want custom domain data modeled separately from drafts, so that domain routing can attach to published output safely.
47. As a future product owner, I want domain verification status separate from publish status, so that DNS ownership and content publishing are not conflated.
48. As a QA reviewer, I want a repeatable fixture harness, so that the 7 business review matrix can be run without inventing prompts.
49. As a QA reviewer, I want content edit and visual edit requests per fixture, so that post-preview iteration is tested consistently.
50. As a maintainer, I want a final beta readiness packet, so that release decisions are based on evidence, not vibes.

## Implementation Decisions

- Preserve the current one-control-plane architecture. Generated source stays untrusted data and must not be imported or evaluated by the Next.js control-plane runtime.
- Treat previous agent changes as work in progress, not disposable changes. Do not reset, delete, or overwrite dirty worktree files unless intentionally editing that slice.
- Use the first-release execution spec as the implementation contract. This PRD narrows focus and adds current audit status, but it does not replace the existing architecture invariants.
- Complete work in slice order from the first incomplete slice unless an audit finds an earlier slice incomplete enough to block later work.
- Start real implementation at Slice 08 after baseline audit, because Slices 01-07 currently have passing targeted tests under the repo's Vitest runner.
- Upgrade the initial generator by deterministic source generation from structured brief data, not by adding a new AI call or a new dependency.
- Keep the generated app profile `static-react-v1` for the beta release unless a later slice explicitly requires a worker/runtime change.
- Generated app output must include a stable manifest, allowed packages, static React build command, output directory, routes, capabilities, and preview-ready signal.
- Generated app output must avoid unsupported fake functionality. Static intent blocks are allowed; fake checkout, fake payment processing, fake auth, fake backend, fake inventory state, or fake booking persistence are not.
- The 7 beta business fixtures are mandatory for generator and release review: angkringan, laundry, coffee shop, barber shop, fashion shop, tutoring service, and home food business.
- The edit loop must load source from the active latest successful preview selection, not from a newer failed build or failed snapshot.
- The edit loop must use the constrained agent tool runner and must create a new source snapshot plus new build attempt for user-visible changes.
- Build execution must move behind a worker-shaped interface. Local beta may run in process, but the API should create intent and the worker seam should own execution semantics.
- Build attempts must preserve queued, running, succeeded, failed, canceled, and stale semantics. Failed attempts remain evidence and cannot become active preview/published output.
- Build logs must be sanitized and truncated before display. Failure reasons must distinguish manifest failure, package policy failure, compile error, timeout, artifact write failure, stale/crash, and unknown failure.
- Runtime supervisor behavior must detect stale runtime targets, retry safely once when appropriate, and record lifecycle events.
- Idle cleanup must remain operator-friendly for single-node VPS. A scheduler command is acceptable for beta.
- Publish promotion must only select successful builds. Draft rebuild success must not alter public output until explicit publish/promote. Draft rebuild failure must never alter public output.
- Public route behavior must be separate from private preview behavior. Public routes do not require auth, must not leak private metadata, and must serve only explicit published deployments.
- Custom domain foundation may be data/resolver/docs first. Domain mapping must attach to published deployment concepts, not mutable draft state. Verification status is separate from publish status.
- Operator docs must cover local beta and VPS operation, artifact persistence, restart recovery, idle cleanup, inspection commands, and expected environment defaults.

## Slice Plan

### Phase A: Full Baseline Audit

Goal: verify what prior agents changed before implementing more.

Tasks:

1. Capture branch and full dirty worktree.
2. Categorize modified and untracked files by slice.
3. Compare Slices 00-07 acceptance criteria against current tests and implementation.
4. Run targeted domain tests with the correct Vitest runner.
5. Run `bun run test` to confirm current unit test baseline.
6. Record any route-test runner caveat.
7. Mark each prior slice as audited pass, partial, or blocked.

Current evidence:

- Targeted project-domain tests passed: deployment resolution, workspace sync, generated app manifest, package policy, agent tool runner, generated source.
- `bun run test` passed.
- Direct `bun test` of route tests failed because that command invokes Bun's test runner, not Vitest; use repo scripts/Vitest for tests using `vi.hoisted`.

### Phase B: Slice 08 Initial Custom Generator Upgrade

Tasks:

1. Replace current 5-fixture expectation with 7 exact beta fixtures.
2. Assert each fixture gets distinctive structure, content emphasis, and visual system.
3. Assert generated source includes real brief-specific words.
4. Assert manifest validation passes.
5. Assert package policy passes.
6. Assert unsupported fake functionality is absent.
7. Keep generated app static React and preview-ready.
8. Build at least a representative subset during automated tests or fixture harness.

Done when:

- All 7 generator fixture tests pass.
- Generated source remains within manifest/package policy.
- No new dependency is added.

### Phase C: Slice 09 Edit Loop From Review State

Tasks:

1. Add route/domain tests for selecting latest successful source as edit base.
2. Add edit-loop test for content edit.
3. Add edit-loop test for visual edit.
4. Wire review-state chat/edit request to agent tool runner.
5. Create new source snapshot from edited source.
6. Create a new build attempt from the edited snapshot.
7. Preserve previous successful preview when edit/build fails.

Done when:

- Successful edit updates preview.
- Failed edit/build preserves latest successful preview.
- Browser review proves edit chat from review state.

### Phase D: Slice 10 Build Worker Shape

Tasks:

1. Define worker interface around build attempts.
2. Move build execution out of route-owned long-running logic into worker-shaped module.
3. Keep local beta in-process if necessary.
4. Implement lifecycle transitions.
5. Add concurrency bound.
6. Add stale/crash detection.
7. Add tests for success, failure, timeout, stale ownership.

Done when:

- Build records move queued to running to terminal status correctly.
- Stuck builds become recoverable visible failures.
- The web request is not the semantic owner of build execution.

### Phase E: Slice 11 Build Logs And Failure Reasons

Tasks:

1. Add safe failure reason classification.
2. Sanitize logs for secrets and environment-like tokens.
3. Truncate stored/display logs as required.
4. Map internal reason to Indonesian UI summary.
5. Add failure injection tests.

Done when:

- Missing manifest, blocked package, compile error, timeout, artifact write failure, and stale/crash have distinct safe reasons.
- No known secret-shaped value appears in display logs.

### Phase F: Slice 12 Runtime Health And Recovery

Tasks:

1. Detect stale runtime target before proxying.
2. Retry runtime start once when safe.
3. Record runtime events for stale detection, retry, success, and failure.
4. Ensure preview failure panel is actionable.
5. Test stale recovery and failed recovery.

Done when:

- A stale running deployment can recover on request.
- A failed recovery returns actionable preview UI, not blank iframe.

### Phase G: Slice 13 Idle Cleanup

Tasks:

1. Verify idle-stop policy and default timeout.
2. Ensure recently requested preview deployments stay alive.
3. Ensure idle preview runtimes stop safely.
4. Record runtime events.
5. Document scheduler/operator command.

Done when:

- Idle cleanup tests pass.
- VPS/local docs tell an operator how to schedule cleanup.

### Phase H: Slice 14 Publish Promotion Policy

Tasks:

1. Ensure publish only selects successful build artifacts.
2. Ensure draft successful rebuild does not auto-change public output.
3. Ensure failed draft rebuild does not change public output.
4. Surface draft newer than published in workspace.
5. Add tests and browser review.

Done when:

- Public output changes only through explicit publish/promotion.

### Phase I: Slice 15 Public Route Hardening

Tasks:

1. Ensure public route needs no auth.
2. Ensure public route returns user-friendly 404 for unpublished/missing site.
3. Ensure public route does not expose project/user/private metadata.
4. Ensure public route serves only explicit published deployment.
5. Ensure headers match public behavior.

Done when:

- Public URL behavior is verified by tests and browser review.

### Phase J: Slice 16 Custom Domain Foundation

Tasks:

1. Add domain mapping model/resolver if not already present.
2. Attach domain mapping to published deployment concept.
3. Keep verification status separate from publish status.
4. Add resolver tests.
5. Update architecture/deployment docs.

Done when:

- Verified domain resolution can target published output without tracking mutable draft state.
- UI may remain deferred if documented.

### Phase K: Slice 17 Beta Fixture Harness

Tasks:

1. Store fixture prompts for all 7 businesses.
2. Store expected brief checks.
3. Store content edit request per fixture.
4. Store visual edit request per fixture.
5. Store checklist for first build, desktop preview, mobile preview, edits, failed rebuild, publish, failed draft public unchanged.
6. Execute at least 2 fixtures before marking the slice done.
7. Prefer executing all 7 for final release.

Done when:

- A future reviewer can run fixture review without inventing prompts.

### Phase L: Slice 18 Operator Readiness

Tasks:

1. Document local beta operation.
2. Document VPS deployment and restart process.
3. Document artifact/runtime persistence.
4. Document idle cleanup scheduling.
5. Document build/deployment/runtime event inspection.
6. Confirm env defaults match docs.

Done when:

- Operator can inspect and recover the beta without code archaeology.

### Phase M: Slice 19 Release Quality Pass

Tasks:

1. Run full fixture matrix.
2. Run `bun run check`.
3. Run `bun run build` if build/deploy/runtime/build docs changed.
4. If running build, stop dev server first, run build, delete `.next`, then restart dev server for browser review.
5. Run Storybook checks if reusable UI patterns changed.
6. Browser review: composer states, build recommendation, build progress, preview failure, desktop/mobile preview, edit chat, publish, public URL.
7. Write final beta readiness packet.

Done when:

- No release blocker remains.

## Testing Decisions

- Use `bun run test` or `vitest run --project unit` for repo unit tests. Do not use direct `bun test` for tests relying on Vitest-only APIs such as `vi.hoisted`.
- Test external behavior at the highest seam possible. Avoid testing private helper internals unless the helper is itself a policy seam.
- Deployment resolution should be unit-tested because it encodes non-destructive preview/source/publish selection.
- Workspace composer behavior should be reducer/helper-tested and browser-reviewed because it affects visible user state.
- Generated app contract should be unit-tested through manifest/package policy validation.
- Generated source should be fixture-tested across the 7 beta businesses.
- Agent edits should be tested through the agent tool runner and one route/workflow seam that proves a new snapshot/build is created.
- Build worker should be tested through lifecycle/failure injection, not by asserting implementation details of child processes.
- Build logs should be tested with secret-shaped sample strings and failure injection.
- Runtime recovery should be tested with stale/failing supervisor fakes and route-level preview responses.
- Publish/public route behavior should be route-tested and browser-reviewed.
- Fixture harness should include manual review notes because visual distinctiveness cannot be proven fully by unit tests.

## Final Quality Gates

Before claiming beta-ready:

1. `bun run check` passes.
2. `bun run build` passes if build/deploy/runtime behavior or build/deployment docs changed.
3. Storybook build/tests pass if reusable UI patterns changed.
4. Browser review evidence exists for composer states, build progress, preview failure, desktop preview, mobile preview, edit chat, publish, and public URL.
5. Fixture matrix evidence exists for all 7 businesses or the release is explicitly marked not done.
6. No generated/local artifacts are accidentally tracked.
7. No secrets are present in tracked files, logs, docs, or generated output.

## Release Blockers

Do not call the release done if any remain:

- A failed rebuild hides or replaces the latest successful preview.
- Published output changes because of a failed or unpromoted draft build.
- User can see a blank preview without actionable explanation.
- Generated output includes unsupported fake checkout, fake payment, fake backend, fake auth, or fake persistence.
- Generated app can use blocked heavy dependencies.
- Generated source can escape project file boundaries.
- Private preview or source routes lack ownership checks.
- Public route leaks private project/user metadata.
- Build logs expose secrets.
- Runtime supervisor controls or internals are publicly exposed.
- `bun run check` fails.
- Fixture review evidence is missing.

## Out of Scope

- Arbitrary generated backend code.
- User-provided Dockerfiles.
- User-managed databases for generated apps.
- Native binary dependencies.
- Browser automation workloads inside generated apps.
- Realtime/websocket generated backends.
- Long-running user jobs.
- Automatic payment collection.
- Full custom domain UI if the foundation/resolver/docs are enough for this beta slice.
- Multi-node runtime scheduling.
- Kubernetes or production-grade distributed runtime orchestration.
- Committing or pushing changes unless explicitly requested.

## Further Notes

- Bun-only remains mandatory. Keep `bun.lock` canonical.
- Product UI copy remains Indonesian. Internal docs, tests, logs, errors, prompts, and code identifiers remain English.
- Docs are part of the change. Update canonical docs when behavior, architecture, deployment, provider, storage, UI system, or product flow changes.
- Graphify is user-local only. Do not add it as a project dependency.
- Generated source is untrusted data. Validation, package policy, path safety, build worker boundaries, runtime supervisor boundaries, and proxy behavior are not optional.
- The next implementation step after this PRD is to continue audit classification for Slices 01-07, then finish Slice 08 with 7 exact fixture generator tests before changing runtime or publish behavior.
