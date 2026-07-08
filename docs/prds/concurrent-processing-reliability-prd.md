# PRD: Concurrent Processing Reliability Hardening

Status: active
Created: 2026-07-08
Updated: 2026-07-08
Owner: Surya
Scope: concurrent request reliability across project creation, AI moderation, rate limits, idempotency, builds, runtime preview, storage, and API error handling
Read when: changing project creation, generated app build/edit flows, AI provider calls, rate limiting, idempotency, API error envelopes, runtime start/stop, preview proxying, or multi-instance production readiness
Do not read for: unrelated marketing pages, legal pages, one-off UI copy polish, static component styling, or non-concurrent profile settings work
Current truth: source code + `docs/architecture.md` + `docs/deployment.md` + `docs/prds/generated-app-hardening-edge-cases-prd.md` + `docs/prds/isolated-project-runtime-prd.md`

## Status History

- 2026-07-08: Proposed after a real concurrent project creation failure where five same-user create requests produced a client-side `Unexpected end of JSON input` from a non-JSON/empty server error response.
- 2026-07-08: First hardening slice implemented: safe client API parsing, project create error envelopes, AI moderation timeout/failure mapping, create idempotency keys, stale build recovery at generate/edit entry, local runtime start single-flight, and route/unit tests.

## Problem Statement

UMKM Cepat must remain reliable when users perform overlapping actions: creating several projects, retrying after slow responses, clicking build/edit multiple times, opening multiple tabs, refreshing during build, cold-starting previews, or using the platform while provider services are slow. Today the most visible failure mode is that a concurrent project creation can surface as a runtime client crash: the UI calls `response.json()` unconditionally, while the server can throw from an upstream dependency such as AI moderation and return an empty or non-JSON 500 response.

From the user's perspective, this feels like the app randomly broke. The user does not care whether the cause was provider timeout, database pressure, rate limit configuration, duplicated submit, stale runtime process, or a malformed response. They need every action to either succeed once, safely continue in progress, or fail with a clear Indonesian message and a retry path.

From the maintainer perspective, concurrent processing crosses many seams: authentication, global and per-user rate limits, request parsing, AI moderation, provider failures, Prisma writes, idempotency, source snapshots, build attempts, artifact storage, deployment records, runtime supervisor processes, preview proxying, and UI parsing. The hardening goal is not just to fix one `response.json()` crash. The goal is to define reliability invariants so concurrent work cannot corrupt state, duplicate expensive side effects, hide the latest successful preview, or leave the user with an ambiguous blank/error state.

## Solution

UMKM Cepat will harden concurrent processing around these product-visible invariants:

1. Every API response consumed by product UI must be safe to parse or safe to handle as non-JSON.
2. Every API failure must produce a clear error envelope when the server can still respond.
3. Project creation must be idempotent from the user's perspective: retries and double submits should not create duplicate projects for the same intent.
4. Rate limits must be scoped intentionally: logged-in expensive actions by user, anonymous/global protection by IP, and production multi-instance enforcement through shared storage when needed.
5. AI/provider failures must be contained and mapped to retryable user-facing errors instead of escaping as raw 500s.
6. Per-project mutation flows must serialize or reject competing work clearly: create, generate, edit, build, publish, runtime start, and runtime stop.
7. Failed builds or edits must not overwrite the latest successful preview or published deployment.
8. Runtime cold starts must be idempotent: concurrent preview requests should not spawn duplicate runtime processes for the same deployment.
9. External side effects must be recoverable: if DB writes, artifact writes, provider calls, or runtime starts partially succeed, the system must expose a safe state and a cleanup/retry path.
10. Observability must let maintainers connect one user-visible failure to server logs, provider failures, rate-limit decisions, and request IDs.

The first implementation slice should fix the current root class: safe client JSON parsing, server-side error envelopes for project creation, moderation/provider timeout handling, and idempotent project creation keys. Later slices should extend the same reliability model to generated app builds, agent edits, runtime previews, and multi-instance production infrastructure.

## User Stories

1. As a signed-in user, I want project creation to either succeed or show a clear message, so that I never see a raw runtime crash.
2. As a signed-in user, I want creating five projects quickly to produce five successful projects or five clear outcomes, so that concurrent work feels predictable.
3. As a signed-in user, I want double-clicking submit to create only one project for the same draft, so that I do not have to clean up duplicates.
4. As a signed-in user, I want refreshing after a slow create request to recover the created project if it already succeeded, so that I do not lose progress.
5. As a signed-in user, I want retrying after a network error to return the same project when the first attempt actually succeeded, so that retries are safe.
6. As a signed-in user, I want login auto-continue and manual submit not to race, so that one draft creates one project.
7. As a signed-in user, I want multiple browser tabs with the same draft not to create surprise duplicates, so that tab usage is safe.
8. As a signed-in user, I want rate-limit errors to say when I can retry, so that I understand the next action.
9. As a signed-in user, I want provider outage errors to say the AI service is busy/down, so that I know retrying later is reasonable.
10. As a signed-in user, I want invalid prompts to fail immediately with a clear message, so that I can fix the input.
11. As a signed-in user, I want AI moderation failures to be retryable and non-destructive, so that a provider hiccup does not break project creation permanently.
12. As a signed-in user, I want AI moderation blocks to be explicit, so that safety blocks are distinguishable from outages.
13. As a signed-in user, I want browser offline or aborted request states to show a useful message, so that I can retry when connected.
14. As a signed-in user, I want project creation to stay responsive even when another project is building, so that independent work is not blocked unnecessarily.
15. As a project owner, I want only one build/edit mutation per project at a time, so that competing AI jobs do not corrupt my generated source.
16. As a project owner, I want a second build click while a build is running to show the existing in-progress build, so that I do not start duplicate jobs.
17. As a project owner, I want a failed build to preserve the last successful preview, so that experimentation is safe.
18. As a project owner, I want a failed edit to preserve the last successful source and preview, so that chat edits cannot destroy working output.
19. As a project owner, I want stale builds to be marked failed or stopped after a safe timeout, so that the workspace does not stay stuck forever.
20. As a project owner, I want build retries to start from the right source snapshot, so that retry behavior is predictable.
21. As a project owner, I want publishing to be protected from stale build races, so that an old build cannot overwrite the public site after a newer build exists.
22. As a project owner, I want preview cold starts to work if I open several preview paths quickly, so that the runtime starts once and serves all requests.
23. As a project owner, I want preview reload to recover from a dead runtime process, so that I do not need to rebuild unnecessarily.
24. As a project owner, I want runtime stop and runtime start not to race into a broken state, so that scale-to-zero remains safe.
25. As another user, I want per-user rate limits to not consume my quota because someone else is active, so that shared usage is fair.
26. As an anonymous visitor, I want global IP limits to protect the service from abuse, so that the platform stays available.
27. As a maintainer, I want every product API to return a consistent error envelope, so that clients do not need custom parsing for each route.
28. As a maintainer, I want client fetch helpers to handle JSON, non-JSON, empty body, aborted request, and network failure, so that UI errors are consistent.
29. As a maintainer, I want project creation tests to simulate non-JSON 500 responses, so that the original crash cannot regress.
30. As a maintainer, I want project creation tests to simulate provider timeout, provider 429, provider 500, and missing AI config, so that upstream failures stay contained.
31. As a maintainer, I want idempotency keys stored server-side, so that retry safety is enforced even if the browser misbehaves.
32. As a maintainer, I want idempotency keys scoped by user and action, so that keys cannot leak results across users or workflows.
33. As a maintainer, I want concurrent same-key project creation to return one canonical result, so that race conditions do not create duplicates.
34. As a maintainer, I want concurrent different-key project creation to proceed within limits, so that legitimate parallel work is allowed.
35. As a maintainer, I want rate-limit implementation to document single-process memory limitations, so that production scaling does not rely on false safety.
36. As a maintainer, I want Redis or another shared atomic rate-limit provider before multi-instance production, so that limits work across instances.
37. As a maintainer, I want invalid rate-limit configuration to fail in an intentional way, so that misconfiguration does not produce mysterious empty responses.
38. As a maintainer, I want AI provider calls to have explicit timeouts, so that requests do not hang indefinitely.
39. As a maintainer, I want request IDs on API errors and logs, so that a user screenshot can be traced to server behavior.
40. As a maintainer, I want structured logs for create phases, so that auth, rate limit, validation, moderation, and DB failures are distinguishable.
41. As a maintainer, I want prompts redacted or truncated in logs, so that debugging does not leak user content.
42. As a maintainer, I want DB connection errors mapped to retryable 503 responses, so that temporary database pressure is clear.
43. As a maintainer, I want Prisma known errors mapped to stable codes, so that client behavior is not tied to raw exception text.
44. As a maintainer, I want multi-row generated lifecycle changes wrapped in transactions where possible, so that partial DB state is minimized.
45. As a maintainer, I want artifact writes to be reconciled with DB state, so that orphan artifacts and missing artifacts are detectable.
46. As a maintainer, I want build worker concurrency to be enforced by durable state, not only memory, so that multiple app instances cannot exceed limits.
47. As a maintainer, I want per-project build locks to be durable, so that process restarts do not leave hidden active jobs.
48. As a maintainer, I want stale build reconciliation to run safely at route time or worker time, so that crashed jobs recover.
49. As a maintainer, I want runtime start locks to be durable, so that concurrent preview requests do not spawn duplicate processes.
50. As a maintainer, I want runtime status reconciliation to detect dead processes, so that stale `running` records do not break previews.
51. As a maintainer, I want idle stopping to avoid stopping active requests, so that scale-to-zero does not race with user traffic.
52. As a maintainer, I want storage writes to be atomic where practical, so that readers do not observe half-written artifacts.
53. As a maintainer, I want disk-full and permission errors surfaced clearly, so that local/VPS storage problems are diagnosable.
54. As a maintainer, I want local-only state documented as single-node only, so that future multi-node work knows what must move to shared services.
55. As a maintainer, I want generated source export to be safe during rebuilds, so that exported files correspond to a known snapshot/build.
56. As a maintainer, I want chat/workspace streams to ignore stale responses, so that older AI responses cannot overwrite newer workspace state.
57. As a maintainer, I want stream aborts to be visible and recoverable, so that half-finished AI turns do not confuse users.
58. As a maintainer, I want queue/backpressure decisions to be explicit, so that expensive work is rejected, delayed, or deduplicated intentionally.
59. As a platform operator, I want provider outages to degrade gracefully, so that the app remains usable for existing projects.
60. As a platform operator, I want no user action to require manual database repair after ordinary retries, so that support load stays low.
61. As a platform operator, I want abuse protection to avoid punishing unrelated users behind the same NAT more than necessary, so that rate limits are fair.
62. As a platform operator, I want dashboards or logs for provider error rate, moderation latency, project create failures, build queue depth, and runtime start failures, so that reliability can be measured.
63. As a developer, I want the highest possible test seam for concurrent create, so that implementation details can change without losing coverage.
64. As a developer, I want focused low-level tests only for trust boundaries and race-prone helpers, so that the test suite remains maintainable.
65. As a developer, I want no new infrastructure unless an existing platform or installed dependency cannot satisfy the reliability invariant, so that hardening stays lean.

## Implementation Decisions

- The immediate reliability seam is project creation from the home prompt form through the project creation API. This seam should cover client parsing, server validation, AI moderation, rate limiting, database creation, and navigation outcome.
- Product API clients should use a shared safe response parser that handles JSON success, JSON error, empty body, HTML/non-JSON body, network failure, and aborts. It should produce a small typed result instead of throwing raw parse errors into React render/event paths.
- Server routes that feed product UI should return a consistent error envelope with at least a stable code, Indonesian user-facing message, optional retry-after seconds, and optional request ID.
- Project creation should catch AI moderation/provider errors and map them to retryable service-unavailable responses. Safety blocks remain normal validation-style failures, while provider failures are distinct from user mistakes.
- AI moderation for project creation should have an explicit timeout. If provider reliability remains a bottleneck, moderation can be moved later in the workflow or made a guarded pre-build step, but unsafe content must still be blocked before generation/publishing.
- Project creation should use idempotency keys. The key should be generated by the client for a draft/create intent and sent with the request. The server should scope the key to the authenticated user and action, then return the canonical existing result for retries.
- Same idempotency key and same user should not create more than one project. Different keys can create different projects within rate limits.
- Login auto-continue should reuse the same draft idempotency key so that authentication transitions do not duplicate projects.
- Client-side submit locking should use a ref or equivalent immediate guard in addition to React state, because state updates are not a concurrency primitive.
- Rate limits should remain per-user for authenticated expensive actions and per-IP for anonymous/global abuse protection. Current memory-backed limits are acceptable for local/single-process development but are not sufficient for multi-instance production.
- A shared atomic rate-limit provider should be required before scaling the app horizontally. The existing provider registry can remain the boundary, but unimplemented providers must not silently behave like memory limits.
- Invalid rate-limit configuration or unimplemented provider configuration should be surfaced as intentional operational errors, not empty 500s.
- Build, edit, and generate mutations should use a per-project concurrency guard. A competing request should return the existing in-progress state or a clear conflict response rather than starting another mutation.
- Build worker concurrency should eventually move from process memory to durable queue/lock state before multi-instance production.
- Stale running/queued/building records should be reconciled by a route-time helper, worker, or scheduled command. Recovery must not overwrite the latest successful preview.
- Runtime start/stop should become idempotent under concurrency. Concurrent starts for the same deployment should converge on one running target. Concurrent stop/start should have deterministic precedence or a clear retry response.
- Local runtime process maps are single-process state. Production isolation should use the runtime supervisor boundary documented in architecture/deployment docs.
- Artifact writes should prefer atomic temp-write-then-rename semantics for local storage where practical. Database state should record failed artifact writes clearly.
- Public publish should use compare-and-set semantics or equivalent stale build protection so an older build cannot publish over a newer intended build.
- API observability should include request IDs and structured phase logs. Logs must avoid secrets and avoid full user prompts unless explicitly truncated/redacted.
- User-facing messages remain Indonesian. Internal codes, logs, tests, and docs remain English.
- Avoid adding a new dependency for ZIP/client export or response parsing. Use platform APIs unless scale or correctness requires a package.
- Avoid introducing a broad queue system in the first slice. Start with idempotency, error envelopes, safe parsing, timeouts, and per-project guards. Add queues only when existing route/DB seams cannot uphold the invariant.

## Testing Decisions

- A good test asserts external behavior: the user action receives a stable success/error result, duplicate actions do not duplicate side effects, and failed upstream dependencies produce recoverable responses. Tests should not assert private helper call order unless the order is a safety invariant.
- The highest priority regression test should exercise the project creation UI/client parser against an empty or non-JSON error response and assert that the user sees an error message instead of a thrown `Unexpected end of JSON input`.
- Project creation route tests should cover unauthenticated requests, invalid prompts, moderation block, moderation provider throw, moderation timeout, rate limit response, database create failure, successful create, and idempotent retry.
- Concurrent project creation tests should simulate multiple same-key requests and assert one canonical project result. They should also simulate multiple different keys and assert all are allowed within configured limits.
- Rate-limit tests should cover per-user authenticated keys, per-IP anonymous/global keys, retry-after response shape, environment override parsing, invalid config behavior, and provider-not-implemented behavior.
- Client fetch/parser tests should cover JSON success, JSON error, empty 500, HTML 500, 204/no content, aborted fetch, network rejection, and malformed JSON.
- AI moderation tests should cover allow, block, provider error, provider timeout, empty provider text, and provider rate limit mapping.
- Build/edit concurrency tests should simulate duplicate build/edit requests for the same project and assert only one mutation proceeds or the later request receives a conflict/in-progress response.
- Stale build tests should simulate old running records and assert they are marked failed/stopped without changing latest successful preview resolution.
- Runtime concurrency tests should simulate duplicate deployment starts and assert one target/process is used. Stop/start reconciliation should be tested where the current abstraction supports it.
- Storage/artifact tests should cover write failure, missing artifact read, partial write recovery if implemented, and local path safety.
- Publish tests should cover stale build publish attempts and ensure only the intended successful build becomes public.
- Workspace/chat tests should cover stale response suppression and stream failure display if those flows are modified.
- Manual browser review should include five rapid project creates from one account, double-submit, refresh-after-submit, provider-down simulation if available, build duplicate click, preview multi-refresh cold start, and mobile/offline retry behavior.
- Existing prior art includes project route tests, moderate route tests, rate-limit tests, config tests, generated source tests, build worker tests, runtime proxy tests, runtime supervisor tests, runtime idle tests, source route tests, publish route tests, edit route tests, and workspace sync tests.

## Out of Scope

- Full production queue infrastructure in the first implementation slice.
- Multi-region runtime orchestration.
- Arbitrary generated backend execution.
- Real payment processing or fake checkout/payment persistence.
- Replacing Auth.js or Google OAuth.
- Adding a new external dependency for simple client parsing or basic idempotency if database/platform primitives are enough.
- Solving all provider reliability issues through retries alone.
- Browser automation with private user credentials.
- Long-term analytics dashboards unless request IDs and structured logs first prove the useful metrics.
- Horizontal scaling without replacing memory-only rate limits, build counters, and runtime process maps.
- Visual redesign of workspace or home form beyond necessary reliability/error states.

## Further Notes

The current observed failure is best understood as two bugs layered together:

1. The server can throw during project creation, most likely from AI moderation/provider failure under concurrent requests.
2. The client assumes every response is JSON and crashes when the response body is empty or non-JSON.

Current rate-limit scoping is conceptually correct for local/single-process usage: authenticated AI actions are keyed by user, while global API protection is keyed by IP. Five same-user project creates should not hit default AI or global limits. The more likely failure path is concurrent AI moderation pressure causing an uncaught upstream error.

Recommended implementation order:

1. Add safe client response parsing for project creation.
2. Add JSON error envelopes and try/catch around project creation moderation and database writes.
3. Add AI moderation timeout and provider error mapping.
4. Add project create idempotency key from draft through authenticated submit.
5. Add route tests for empty/non-JSON responses, provider failures, and duplicate same-key creates.
6. Add per-project generate/build/edit concurrency guard.
7. Add durable stale build/runtime reconciliation.
8. Add shared atomic rate-limit provider before multi-instance production.

Issue tracker publication was not performed because no issue tracker credentials or command contract were available in this session. Copy this PRD to the tracker with the `ready-for-agent` label when tracker access is available.
