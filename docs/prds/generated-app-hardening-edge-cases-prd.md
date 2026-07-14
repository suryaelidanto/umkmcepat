# PRD: Generated App Hardening and Edge Case Coverage

Status: active
Created: 2026-07-07
Updated: 2026-07-07
Owner: Surya
Scope: generated app builder reliability, security, source generation, build/runtime recovery, preview safety, operation trace hardening
Read when: changing generated app generation, agent tools, build workers, source snapshots, preview/runtime routes, publish flow, operation timeline, or generated app package policy
Do not read for: unrelated landing pages, auth UI polish, profile settings, legal pages, marketing copy, or production server deployment work
Current truth: source code + `docs/architecture.md` + `docs/deployment.md` + `docs/prds/custom-vite-tanstack-generated-app-prd.md` + `docs/prds/dyad-inspired-agentic-file-operations-prd.md` + `docs/prds/first-release-generated-app-platform-prd.md` + `docs/prds/isolated-project-runtime-prd.md`

## Status History

- 2026-07-07: Proposed after edge-case audit of the agentic generated app builder, operation trace workflow, Vite/TanStack generated source, build worker, preview runtime, and publish safety boundaries.
- 2026-07-07: First hardening slices implemented: generated path policy, package specifier policy, tool output/operation caps, generate/edit concurrency guards, edit trace parity metadata, stale build recovery, and related tests.

## Problem Statement

UMKM Cepat now has a generated app builder that can create Vite React TypeScript TanStack source, run a constrained AI coding agent over project files, emit visible operation steps, build generated artifacts, and serve previews. The core path is much stronger than the earlier template generator, but users still need the product to feel reliable under messy real-world conditions: auth expiration, repeated clicks, failed AI calls, malformed generated source, unsafe paths, provider outages, build crashes, runtime failures, stale previews, and public publishing boundaries.

From the user's perspective, a generated website builder must not feel fragile. If AI generation fails, the user should not lose a working preview. If the agent writes bad code, the system should repair it or clearly fall back. If a build gets interrupted, the workspace should recover. If the user refreshes during build, the app should still show what happened. If a project is published, only explicit publish/promote actions should affect the public site. The user should see progress and errors in clear Indonesian while the platform keeps source, artifacts, and runtime state safe.

From the maintainer perspective, the generated app platform now has many moving parts: auth, project ownership, rate limits, site schema generation, agent file tools, operation trace events, package policy, manifest validation, source snapshots, build attempts, artifact storage, runtime deployments, private previews, public publishing, and edit loops. Most pieces have tests, but edge cases cut across modules. The hardening work should focus on the highest seams where failures become user-visible instead of scattering shallow checks everywhere.

The goal is to make the generated app builder robust enough for beta usage: safe to retry, safe to fail, safe to inspect, safe to preview, and hard to accidentally break across auth, AI, build, runtime, and publish boundaries.

## Solution

UMKM Cepat will harden the generated app workflow around a few first-class invariants:

1. A failed build must not hide or overwrite the latest successful preview.
2. Generated source is untrusted data and never executes inside the control-plane runtime.
3. Every private project route must re-check authentication and ownership.
4. Agent tools must be bounded, path-safe, package-policy-safe, and check-gated.
5. Operation traces must be useful but capped so they cannot bloat payloads or metadata.
6. Concurrent builds/edits for the same project must not corrupt source, builds, deployments, or statuses.
7. Stuck `building` or `running` states must be recoverable.
8. Public publishing must change only through explicit publish/promote actions.
9. User-facing failure states must be clear, recoverable, and written in Indonesian.
10. Tests should cover the highest behavior seams instead of private implementation details.

The primary seam should be the generated project lifecycle: authenticated project owner starts generation or edit, the system produces a source snapshot, build attempt, operation trace, deployment state, and preview/public behavior. Unit tests should still cover low-level trust boundaries such as path safety, package policy, and precise replacement semantics, but the hardening confidence should come from route/workflow tests that exercise externally visible behavior.

The implementation should be incremental. Start with data-loss and security blockers, then resource/cost limits, then recovery, then UI clarity, then metrics and documentation. Avoid adding broad new infrastructure unless an existing seam cannot express the invariant.

## User Stories

1. As a project owner, I want a failed generation to preserve my latest working preview, so that I do not lose a usable website.
2. As a project owner, I want a failed edit to preserve my latest working preview, so that experimenting is safe.
3. As a project owner, I want to see when fallback was used, so that I understand why a result may be less custom.
4. As a project owner, I want to retry failed generation, so that transient AI or build issues do not block me.
5. As a project owner, I want the workspace to recover after refresh during build, so that I can leave and come back.
6. As a project owner, I want build progress to show file operations and errors, so that I understand what the AI did.
7. As a project owner, I want operation details to be readable and not overwhelming, so that the timeline stays useful.
8. As a project owner, I want preview failure states to explain what I can do next, so that a blank iframe is never the only signal.
9. As a project owner, I want public publishing to happen only when I click publish, so that unfinished previews never leak publicly.
10. As a project owner, I want private previews to stay private, so that other users cannot inspect my generated site.
11. As a project owner, I want source files to stay private, so that other users cannot read my generated code.
12. As a project owner, I want build logs to avoid secrets, so that sensitive text is not exposed accidentally.
13. As a project owner, I want unsupported requests such as fake checkout or fake auth to be blocked, so that customers are not misled.
14. As a project owner, I want AI failures to show a friendly Indonesian message, so that I know whether to retry or clarify.
15. As a project owner, I want the app to prevent double-click duplicate builds, so that I do not accidentally start competing jobs.
16. As a project owner, I want edits to start from the latest successful source, so that I do not keep building on broken output.
17. As a project owner, I want the code tab to keep showing source even when preview fails, so that I can inspect what happened.
18. As a project owner, I want preview reload to recover stale runtime issues, so that I do not need to rebuild unnecessarily.
19. As a project owner, I want generated websites to serve nested routes correctly, so that links like menu or layanan work after refresh.
20. As a project owner, I want mobile preview to stay usable, so that I can review generated sites on small screens.
21. As another user, I want project ownership to be enforced, so that I cannot accidentally or maliciously access someone else's project.
22. As a beta tester, I want degraded states such as fallback or repair to be visible, so that I can report quality issues accurately.
23. As a beta tester, I want operation traces to prove the agent did real work, so that I can distinguish custom generation from template fallback.
24. As a maintainer, I want every generated app tool call to validate paths, so that host files cannot be read or written.
25. As a maintainer, I want hidden and secret-like generated paths blocked, so that agents cannot create `.env` or similar files.
26. As a maintainer, I want Windows path edge cases handled, so that local development and CI do not behave differently.
27. As a maintainer, I want precise replacement to require a unique target, so that accidental mass edits are impossible.
28. As a maintainer, I want line reads and list/search outputs capped, so that prompts and responses stay bounded.
29. As a maintainer, I want operation traces capped and summarized, so that snapshot metadata does not bloat the database.
30. As a maintainer, I want package specs constrained beyond package names, so that local `file:` or unsafe specifiers cannot bypass intent.
31. As a maintainer, I want lifecycle scripts blocked, so that dependency install cannot run arbitrary generated commands.
32. As a maintainer, I want package policy to block backend, native, browser automation, media processing, and payment packages by default, so that generated apps stay static and safe.
33. As a maintainer, I want generated source checks required after writes, so that agents cannot claim success after unchecked mutations.
34. As a maintainer, I want build logs capped and redacted, so that logs remain safe and cheap to store.
35. As a maintainer, I want build temp directories cleaned up, so that repeated builds do not leak disk space.
36. As a maintainer, I want stuck build statuses detected and recoverable, so that crashes do not leave projects permanently building.
37. As a maintainer, I want concurrent build requests serialized per project, so that source snapshots and deployments do not race.
38. As a maintainer, I want edit and generate routes to share safety semantics, so that one path is not weaker than the other.
39. As a maintainer, I want route tests for authenticated ownership, so that authorization regressions are caught.
40. As a maintainer, I want route tests for generated lifecycle behavior, so that snapshot/build/deployment invariants stay stable.
41. As a maintainer, I want runtime event creation failures not to destroy primary build state, so that observability failures are non-fatal.
42. As a maintainer, I want artifact write failures to produce clear failed builds, so that partial state is visible.
43. As a maintainer, I want orphan artifact risk documented, so that future cleanup jobs can handle it.
44. As a maintainer, I want preview routes to validate asset paths and tokens, so that traversal and unauthorized asset access are blocked.
45. As a maintainer, I want public routes to serve only published artifacts, so that preview artifacts are not implicitly public.
46. As a maintainer, I want runtime cold-start failures to show actionable UI, so that users are not left with blank preview.
47. As a maintainer, I want generated app ready-signal behavior tested, so that iframe load issues are distinguishable from build issues.
48. As a maintainer, I want metrics for fallback rate, repair rate, build success rate, and operation counts, so that quality can improve from data.
49. As a maintainer, I want edge-case hardening documented in architecture, so that future agents know which invariants matter.
50. As a platform operator, I want user and IP build rate limits enforced, so that expensive generation cannot be abused.
51. As a platform operator, I want AI provider outages handled gracefully, so that one provider failure does not corrupt project state.
52. As a platform operator, I want resource limits around builds, so that memory, disk, and time remain bounded.
53. As a platform operator, I want runtime supervisor failures isolated, so that one bad project cannot break the platform.
54. As a platform operator, I want local artifact storage errors surfaced, so that deployment issues are diagnosable.
55. As a platform operator, I want no generated app to access the Docker socket or host secrets, so that production stays safe.
56. As a developer, I want the highest seam possible for tests, so that implementation refactors do not break tests unnecessarily.
57. As a developer, I want low-level tests only at trust boundaries, so that the suite stays focused and maintainable.
58. As a developer, I want deterministic fixtures for malformed AI output and failed builds, so that edge cases are repeatable.
59. As a developer, I want no reliance on a real Google account in automated tests, so that CI and local testing are safe.
60. As a developer, I want manual logged-in browser review separated from automated hardening, so that security rules around credentials stay intact.

## Implementation Decisions

- The highest testing seam is the generated project lifecycle. Tests should start from an authenticated project owner action and assert source snapshot, build, deployment, operation trace, runtime state, and preview/public behavior where possible.
- Authenticated route tests should use test doubles or safe local session helpers, not a real Google account. Private credentials should never be handled by agents or committed to tests.
- Per-project generation/build/edit should be guarded against concurrent mutation. A lightweight project-level lock or state precondition should prevent two builds from mutating the same project at the same time.
- Failed builds must create failed build records but must not promote failed artifacts into latest successful preview resolution.
- Project compatibility fields may be updated for backward compatibility, but preview resolution should prefer the latest successful deployment/build artifact, not the latest failed attempt.
- Operation traces should be capped by event count and string length. Store summaries, paths, action names, state, and small details; do not store full file contents in operation metadata.
- Tool outputs should be capped. Bounded line reads, list output caps, and search result caps should return truncation markers so the agent can narrow the request.
- Generated path policy should explicitly block path traversal, absolute paths, hidden files, `.env`-like files, lockfiles not owned by the build process, local upload paths, runtime paths, browser artifacts, and reserved Windows names.
- Replacement semantics should remain unique-target only. If a target appears zero or multiple times, the tool should fail and explain why.
- Package policy should validate dependency names and specifiers. Unknown packages, lifecycle scripts, native packages, browser automation, backend frameworks, media processors, payment SDKs, and local/path/git specifiers should fail unless explicitly approved by profile policy.
- Build logs should be sanitized and capped before storage or display. Existing log sanitization should be reused and expanded if needed.
- Build temp workspace cleanup should be best-effort in finally blocks. Cleanup failures should be logged internally without hiding the primary build result.
- Build repair should stay bounded to one repair attempt for now. More retries are out of scope until cost and quality metrics justify them.
- Stuck states should be recoverable. A maintenance helper or route-time reconciliation should mark stale `building` or `running` builds failed/canceled after a safe timeout.
- Runtime event writes should not be required for primary state transitions to succeed. Observability should be best effort where losing an event is less harmful than losing project state.
- Snapshot/build/deployment creation should prefer transaction-like ordering where Prisma supports it, while external artifact writes remain explicit failure points with clear state updates.
- Private preview and source routes must continue to check auth and ownership on every request.
- Public publish must remain explicit. Preview builds should never update public routes unless publish/promote is called.
- Edit flow should reuse the same tool safety, package policy, operation trace, and build preservation semantics as initial generation.
- UI should distinguish failed build from latest successful preview. If old preview is still visible, copy should make it clear that the new build failed but the previous preview is preserved.
- User-facing labels and error messages should be Indonesian. Internal logs, tests, metadata keys, and developer docs should remain English.
- Do not add arbitrary generated backend execution. Backend-like features should remain platform-owned modules.
- Do not add real account E2E automation with private credentials. Manual browser review with the owner's account remains human-owned.
- Update architecture docs when hardening changes source generation, build, runtime, preview, or publish invariants.

## Testing Decisions

- Good tests should assert user-visible and system-boundary behavior: unauthorized routes reject, owner routes proceed, failed build preserves latest successful preview, operation traces are capped, unsafe tool operations fail, and fallback metadata is explicit.
- Avoid tests that assert private helper names or internal implementation order unless the order is itself a public safety invariant.
- Route-level tests should cover project ownership for generate, edit, source, preview, runtime, publish, workspace, assets, and stop routes where practical.
- Workflow tests should cover successful generation, agent fallback, build failure, repair success, repair failure, and stopped/canceled builds.
- Tool runner tests should cover path traversal, absolute paths, hidden/secret-like files, reserved names, bounded reads, capped list/search, unique replacement, missing replacement, duplicate replacement, package policy failure, lifecycle scripts, and check-required-after-write.
- Package policy tests should include unsafe specifiers such as local file paths, git URLs, workspace references, unknown packages, native packages, browser automation, backend frameworks, media processors, and payment SDKs.
- Build worker tests should cover manifest missing, package policy failure, install failure, TypeScript/build failure, log redaction, log caps, temp cleanup behavior, dist artifact shape, and `index.html` presence.
- Runtime/preview tests should cover latest successful preview preservation, failed deployment UI state, private preview auth, asset rewrite behavior, nested route fallback, public route unpublished 404, and public route published success.
- Concurrency tests should simulate duplicate build requests for the same project and assert only one mutating build proceeds or that later requests are cleanly rejected/queued.
- Stuck-state tests should simulate stale `building`/`running` records and assert recovery behavior marks them failed/canceled without affecting latest successful preview.
- UI/component tests should cover operation timeline rendering for pending/done/error states, fallback state, long path truncation, and build failed while previous preview remains visible.
- Manual browser review should be explicitly listed in release notes or handoff: logged-in Google flow, real prompt generation, preview visual quality, operation timeline readability, edit loop, publish, mobile preview.
- Existing prior art includes generated source tests, package policy tests, manifest tests, agent tool runner tests, custom source generator tests, build worker tests, build log tests, runtime proxy tests, runtime idle tests, source route tests, publish route tests, edit route tests, and Workspace primitives.

## Out of Scope

- Using a real user's Google account in automated tests.
- Storing or sharing user credentials, OAuth secrets, browser cookies, or private sessions.
- Production deployment, DNS, VPS changes, Docker socket changes, or secret rotation.
- Arbitrary generated backend code.
- Generated databases or arbitrary SQL execution.
- Real payment processing.
- Fake checkout, fake payment, fake auth, fake inventory persistence, or fake booking persistence.
- Unrestricted package installation.
- Native binary dependencies.
- Browser automation inside generated apps.
- MCP or arbitrary shell tools for generated app agents.
- Unlimited autonomous repair loops.
- Full code editor parity.
- Major workspace redesign beyond necessary hardening UI states.
- Visual quality approval for generated sites; that remains human-owned.
- Replacing the artifact-backed preview/publish architecture.

## Further Notes

The hardening priority should be:

1. Data-loss prevention: failed build/edit never hides latest successful preview or published site.
2. Trust boundaries: auth ownership, path safety, package policy, private preview/source protection.
3. Resource bounds: rate limits, tool output caps, operation trace caps, build time/log caps.
4. Recovery: stuck build reconciliation, build repair/fallback clarity, runtime restart/preview retry.
5. UX clarity: Indonesian failure states, visible fallback, visible previous-preview preservation.
6. Metrics and docs: fallback rate, repair rate, operation count, build success rate, architecture updates.

Suggested first implementation slice:

- Cap operation trace and tool outputs.
- Harden generated file path policy for hidden/secret/reserved paths.
- Validate package specifiers, not only package names.
- Add project-level build/edit concurrency guard.
- Add tests proving failed builds preserve latest successful preview.
- Add tests proving private source/preview/assets reject cross-user access.
- Add stale build recovery helper.

Issue tracker publication was not performed because no issue tracker credentials or command contract were available in this session. The PRD is saved in the repo and should be copied to the tracker with the `ready-for-agent` label when tracker access is available.
