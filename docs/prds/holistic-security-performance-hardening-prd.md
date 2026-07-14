# PRD: Holistic Security, Performance, And Resilience Hardening

Status: proposed
Created: 2026-07-10
Updated: 2026-07-10
Owner: Surya
Scope: control-plane security, generated-app isolation, API and database correctness, AI/build/runtime reliability, frontend performance and resilience, storage, deployment, dependencies, CI, observability, and maintainability
Read when: changing authentication or authorization, project APIs, generated source/build/runtime behavior, preview or publishing, storage, database lifecycle, rate limiting, workspace state, performance budgets, production configuration, CI, or observability
Do not read for: isolated copy changes, generated-site visual styling alone, legal-document wording, or a small component change that does not affect the audited boundaries
Current truth: source code + `AGENTS.md` + `PRINCIPLES.md` + `PRODUCT.md` + `DESIGN.md` + `DEV.md` + `docs/architecture.md` + `docs/deployment.md` + existing focused PRDs + this PRD

## Status History

- 2026-07-10: Created from a Graphify-backed repository audit and five independent read-only specialist reviews covering security, frontend/performance, backend/database, AI/build/runtime, and operations/deployment.

## Executive Decision

UMKM Cepat will harden the current product through measured, staged changes rather than a broad rewrite. Existing core behavior must remain recognizable: a user describes a business, completes Discuss, builds a real generated app, reviews the last successful preview, requests edits, and publishes explicitly. Reliability and security work must preserve durable user progress and must not replace unavailable AI output with dummy, deterministic, or fabricated results.

Security boundaries are the first release gate. In particular:

1. Generated or user-editable build configuration must not execute as an unconstrained host process.
2. Generated public JavaScript must not execute on the authenticated control-plane origin.
3. Canonical source and build artifacts must survive container recreation and have a proven restore path.
4. Every claimed build/edit/runtime operation must have a durable, recoverable lifecycle and guaranteed terminal cleanup.
5. Degraded-mode caches and runtime targets must never weaken tenant authorization or network boundaries.

Performance work follows evidence, not slogans. The program will establish browser, API, database, build, AI, runtime, storage, and infrastructure baselines; introduce budgets in report-only mode; optimize confirmed bottlenecks; and only then turn stable budgets into blocking gates. No task in this PRD may claim a “10x” improvement without a reproducible before/after benchmark.

## Problem Statement

UMKM Cepat already has a coherent generated-app platform, but several boundaries that are acceptable during local iteration are unsafe or unreliable for shared production use.

The highest-impact security issue is that generated `package.json` and build configuration can influence `bun run build`, while the build runs as a same-user child process on the application host. Path validation and a reduced child environment are useful controls, but they are not a filesystem, process, network, CPU, memory, or tenant boundary. A malicious authenticated user, compromised prompt, or unsafe generated configuration could read host-accessible data, probe internal services, consume resources, or affect other workspaces.

The second stop-ship issue is origin isolation. Published generated HTML and JavaScript are currently served under `/p/[slug]` on the same origin as authenticated project APIs. An iframe sandbox protects some private preview interactions, but it does not make directly visited public generated JavaScript safe. Same-origin generated code can act with a signed-in visitor's cookies and read or mutate control-plane APIs.

Durability and lifecycle correctness also have confirmed gaps. The documented production container persists uploads but not the default canonical `.data/project-artifacts` directory. Recreating the application container can therefore leave database references pointing to missing generated source or distribution artifacts. There is no demonstrated coordinated database/artifact restore drill. An exception after an edit claims a project but before it creates a `ProjectBuild` can leave the project permanently marked as in progress because stale-build recovery only knows how to repair an existing build row. Runtime start deduplication and capacity are process-local, runtime and health fetches do not have hard abort deadlines, and a database-outage cache can return project runtime state before ownership is re-established.

Several paths will become expensive or inconsistent as usage grows. Chat history, generated source, build output, artifacts, request bodies, and in-memory caches do not all have aggregate limits. Chat and visual-summary persistence use whole-document last-write-wins updates. Publishing lacks the database uniqueness needed for deterministic concurrent behavior. Public and preview asset requests can amplify database writes. Dominant filtered-and-ordered queries lack measured composite indexes. Process-local rate limits and caches are not durable production authorities.

The frontend preserves many good states, but the core workspace remains a very large client component. It hides server-provided content until hydration, eagerly loads complete source for ready projects before Code is opened, rescans and rerenders loaded chat during streaming, does not provide a true single-surface mobile workspace, and handles some network failures silently. Build streaming is not resumable, project pagination is unstable under deletion/update, dashboard thumbnails can leave many script-enabled iframes alive, and dynamic states are not consistently exposed to assistive technology.

Production operations have good foundations—Bun lockfile enforcement, non-root application execution, loopback production ports, Postgres health checks, and broad application CI—but canonical artifacts are not persisted by default, migration execution is coupled to app startup, production values can fall back to development defaults, some local infrastructure binds outside loopback with known credentials, mutable image tags remain, and there is no repository-backed restore, dependency scanning, container smoke, or complete observability privacy policy.

The result is not one isolated bug. It is a set of connected trust, state, resource, and operational boundaries. Fixing only the visible symptom can move the failure elsewhere. UMKM Cepat needs a holistic program with explicit invariants, deep module seams, release blockers, measurable budgets, compatibility rules, staged rollout, and rollback evidence.

## Goals

1. Eliminate confirmed paths from generated input to unconstrained control-plane host execution.
2. Separate generated-site execution from the authenticated control-plane origin and cookies.
3. Make project source, artifacts, builds, deployments, and published output durable and recoverable across restarts and container recreation.
4. Guarantee that claimed operations become succeeded, failed, canceled, or safely reclaimable; no project remains permanently stuck because a request threw early.
5. Preserve the last successful preview and explicit published deployment through every failed build, edit, network interruption, and migration.
6. Enforce tenant ownership during normal and degraded operation.
7. Bound request, AI context, source, artifact, log, process, network, cache, and database growth.
8. Make publish, pagination, chat persistence, build claims, runtime starts, and storage commits safe under concurrency and retries.
9. Improve mobile workspace usability, initial payload, hydration behavior, streaming render cost, offline recovery, accessibility, and dashboard memory without changing the product's visual language.
10. Add actionable, privacy-safe measurements for browser, API, database, AI, build, runtime, storage, deployment, and dependency health.
11. Make production configuration fail closed and make backup, restore, migration, deployment, and rollback procedures executable and testable.
12. Prefer deep, reusable policy modules over repeated route-specific checks.
13. Keep old projects and artifacts readable through compatibility paths while new writes adopt safer formats.
14. Turn proven performance and security budgets into CI/release gates gradually, after a representative baseline exists.

## Product And Data Invariants

These invariants are non-negotiable across every phase:

- Consumer-facing product copy remains friendly Indonesian and uses `aku/kamu`; developer-facing code, logs, docs, metrics, and internal errors remain English.
- No timeout, retry, queue, repair, or fallback may fabricate AI text, workspace cards, source, previews, or successful build state.
- Real partial progress remains visible when safe: streamed text, answered questions, accepted edits, source snapshots, and the last successful preview are not discarded by a later failure.
- An answered question cannot reappear solely because a provider, tool, stream, database write, or client reconciliation failed.
- A failed build or edit cannot replace the active successful preview.
- A new successful draft cannot replace public output until the owner explicitly publishes it.
- Public resolution selects only a valid committed published deployment.
- Private routes establish authentication and project ownership before returning private data, including stale or cached responses.
- Generated source and artifacts remain data. The control plane never imports or evaluates them.
- Every side-effecting operation has an idempotency identity, durable attempt state, and one authoritative terminal result.
- An older request, lease, or worker cannot clear or overwrite a newer claim.
- A timeout bounds stuck work; it does not prove the work failed. Reconciliation checks authoritative state before offering a destructive retry.
- Streaming and timeout remain separate controls: streaming communicates progress, while deadlines and finalization barriers bound work.
- Compatibility migrations use expand/contract, dual-read, or backfill patterns. Deploying safer storage or state must not make existing projects unreadable.
- Observability never requires raw credentials, cookies, authorization headers, full private source, or unrestricted customer prompts.

## Audit Method And Evidence

The audit combined:

- A refreshed Graphify atlas at commit `8b609507`: 1,202 nodes, 2,460 edges, and 74 communities.
- Canonical product, design, development, architecture, deployment, Lighthouse, schema, Docker, Compose, CI, route, runtime, storage, and existing PRD review.
- Five independent read-only specialist reports stored under `.pi-subagents/artifacts/outputs/1505e6b0-a9b6-4b55-9dc4-bb30884f7e91/audit/`.
- `bun audit`, which reported transitive advisories involving `uuid` and `dompurify`; remediation must verify the resolved dependency graph rather than blindly forcing a breaking version.
- Existing Lighthouse reports. Available public mobile samples are approximately 0.73–0.82 performance, 3.1–3.6 seconds LCP, and 446–617 milliseconds TBT. Accessibility, best-practices, and SEO results are stronger. These are audit baselines, not a production SLO measurement.
- Source-level inspection of authenticated ownership checks, generated path validation, package policy, build execution, runtime proxy/supervisor, artifact storage, project state transitions, chat persistence, workspace behavior, and production configuration.

The audit was static. It did not perform a live exploit, production load test, OAuth test, external port scan, multi-process supervisor test, populated-database `EXPLAIN`, R2 failure injection, browser assistive-technology review, container escape test, or backup restore. Every corresponding conclusion must therefore be validated dynamically before its release gate is considered satisfied.

## Existing Controls To Preserve

The hardening program must retain and extend these correct foundations:

- Reviewed private project routes normally scope project access by both project ID and authenticated user.
- Project creation has a database idempotency key and handles the ordinary unique-key race.
- Generated path, artifact path, upload key, and static-server path normalization reject traversal and unsafe locations.
- Generated package names are allowlisted and install lifecycle scripts are rejected.
- Build duration and some concurrency are bounded in current local paths, even though the boundary is not sufficient yet.
- Newer build-worker logs are sanitized and truncated.
- Private previews are authenticated, noindex, and iframe-sandboxed without same-origin privilege.
- Monaco is dynamically loaded rather than included in the initial workspace bundle.
- Runtime polling deduplicates requests, observes `Retry-After`, and clears intervals.
- Chat history, runtime events, project listing, and build history have initial count bounds.
- Build progress is visible and supports stop/retry actions.
- Public motion respects reduced-motion preferences and the root font uses swap behavior.
- Production application and 9Router ports are loopback-bound; Postgres is not published in production.
- The application container runs non-root; Bun and `bun.lock` are canonical; Docker install ignores dependency scripts.
- Sentry and Langfuse initialization are environment-gated.
- CI already runs migrations, repository checks, Storybook build/tests, and a production Next build.

## Priority Definitions

- **P0 — stop-ship:** confirmed confidentiality, integrity, durability, or irreversible lifecycle issue. The affected capability must remain disabled, contained, or non-public until its gate passes.
- **P1 — next hardening milestone:** high user or operational impact, likely under normal retries/concurrency/growth, or required to make a P0 control reliably operable.
- **P2 — scheduled hardening:** meaningful defense-in-depth, scaling, accessibility, or operations work that follows the primary boundaries.
- **P3 — measured optimization:** lower-risk maintainability or efficiency improvement. Implement only with evidence and without delaying P0/P1 work.

## Prioritized Audit Matrix

### P0 — Release Blockers

| ID      | Domain                   | Confirmed finding                                                                                                                                                                            | Required outcome and release gate                                                                                                                                                                                                                                                                                                                          |
| ------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HSP-001 | Generated build security | Generated/user-editable `package.json` build scripts and Vite configuration reach a host `bun run build` child without a filesystem, process, network, CPU, memory, PID, or tenant boundary. | Immediately reject changes to executable build/config files and use a platform-owned exact build command. Before shared production execution, run builds in a disposable isolated worker with no control-plane secrets or host mounts, default-deny network, and enforced resource budgets. Adversarial isolation tests must fail 100% of escape attempts. |
| HSP-002 | Origin isolation         | Published generated JavaScript is served under the authenticated platform origin at `/p/[slug]`.                                                                                             | Serve generated sites from a separate cookie-free origin, preferably a separate registrable domain. Control-plane cookies must be host-only and never sent there. Until verified by a browser security test, arbitrary generated JavaScript publishing remains disabled.                                                                                   |
| HSP-003 | Artifact durability      | Production mounts uploads but not the default canonical `.data/project-artifacts` path.                                                                                                      | Persist the exact canonical artifact path or require R2 in production. Startup must fail if a configured local canonical path is not writable and persistent. Container-recreate validation must preserve preview, public output, edit base, and checksums.                                                                                                |
| HSP-004 | Recovery operations      | There is no demonstrated coordinated database/artifact backup, restore, or migration rollback procedure; migrations run during every app startup.                                            | Establish encrypted off-host backups, retention, RPO/RTO, artifact-manifest integrity, a single migration release job, and an isolated restore drill. No production data migration proceeds without a same-recovery-point database/artifact rollback plan.                                                                                                 |
| HSP-005 | Project lifecycle        | Edit can claim a project before a durable build exists; an early exception can leave the project permanently in progress.                                                                    | Create a durable attempt at claim time, use a claim/lease token, and finalize in a guarded `finally`/worker boundary. A fault after every stage must leave the project retryable or actively leased, never orphaned.                                                                                                                                       |
| HSP-006 | Degraded authorization   | Runtime stale-cache fallback is keyed only by project ID and can be returned when ownership lookup fails during database unavailability.                                                     | Bind cache entries to immutable owner ID plus project ID, bound and expire them, exclude sensitive logs, and fail closed unless ownership was established. Cross-tenant outage tests must return no cached body.                                                                                                                                           |
| HSP-007 | Runtime authority        | Runtime start deduplication/capacity is process-local, `maxContainers` is not enforced, health/proxy fetches lack hard aborts, and stale PID recovery can target the wrong process.          | Use a supervisor-owned lease/fencing identity, atomically enforce capacity, isolate runtime resources, pass a minimal environment, verify process/container identity, and abort health/proxy requests. Multi-supervisor and stale-PID tests must pass.                                                                                                     |
| HSP-008 | Terminal recovery        | Build, edit, publish, and runtime transport loss can be mistaken for domain failure or leave contradictory states.                                                                           | Separate job state from transport state, make progress resumable/reconcilable, and guarantee terminal cleanup. No client disconnect may start a duplicate operation or replace last-good preview/public output.                                                                                                                                            |

### P1 — High-Priority Hardening

| ID      | Domain                       | Finding                                                                                                                                                  | Target outcome                                                                                                                                                                                       |
| ------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HSP-101 | Build architecture           | Generation can compile twice, run inside an HTTP/SSE request, exceed route budgets, bypass the local global worker guard, and continue after disconnect. | Enqueue a durable attempt, compile once, propagate one cancellation/deadline, enforce global/per-user concurrency, and stream resumable events by attempt ID.                                        |
| HSP-102 | Runtime/publish              | Republishing can orphan an already-running process and published static deployments do not scale to zero.                                                | Publish immutable revisions, atomically switch routing, drain old revisions, and serve static public artifacts without a persistent per-project process where possible.                              |
| HSP-103 | Resource budgets             | Request bodies, chat parts, commands, source files, build logs, dist files, artifacts, and in-memory materialization lack complete aggregate budgets.    | Enforce limits before expensive work and continuously while streaming/writing; handle binary assets safely; return actionable 400/413/422 responses.                                                 |
| HSP-104 | Storage commit               | Database snapshots and object-store writes are multi-step and can leave partial/orphaned state.                                                          | Use immutable/content-addressed artifact IDs, staged upload, checksums, an atomic commit manifest, idempotent DB finalization, and reconciliation/GC.                                                |
| HSP-105 | Publishing correctness       | Publish is find-then-create/update without unique project/kind or unique published slug guarantees.                                                      | Add measured uniqueness constraints and transactional idempotent promotion with collision retry and deterministic resolution.                                                                        |
| HSP-106 | Chat concurrency             | Whole-document read/modify/write can lose concurrent turns, cards, briefs, summaries, or compaction state.                                               | Persist turns append-only with unique client turn IDs, or use a revision/CAS merge until normalized storage lands. One new client turn is accepted per request; client history is not authoritative. |
| HSP-107 | Build recovery               | Stale recovery is request-driven, lacks worker heartbeat/lease semantics, and performs build/project repair separately.                                  | Add leases/heartbeats, a scheduled sweeper, status-guarded transactional finalization, and inconsistent-state metrics.                                                                               |
| HSP-108 | Database access              | Dominant filtered/ordered queries lack representative composite indexes; public slug lookup is not indexed uniquely.                                     | Capture production-like plans, add only validated indexes using safe rollout, and verify p95 query/read/write cost and index overhead.                                                               |
| HSP-109 | Database write amplification | Public and preview HTML/assets repeatedly update deployment activity and traffic-mutated `updatedAt` can affect ordering.                                | Coalesce activity touches, move traffic activity away from content precedence, and cap writes per page view.                                                                                         |
| HSP-110 | Production config            | Production secrets, URLs, database credentials, and provider configuration can fall back to development placeholders.                                    | Add a typed fail-closed production schema and preflight; production Compose must not render/start with placeholders or invalid combinations.                                                         |
| HSP-111 | Auth consent                 | Consent and Turnstile are client gates and are not bound to OAuth or persisted with policy version.                                                      | Exchange verification for a signed, expiring, single-use proof bound to OAuth state and persist consent version/time/provenance.                                                                     |
| HSP-112 | AI cost boundary             | Anonymous moderation uses a broad limiter and forwarded IPs are trusted without a canonical ingress contract.                                            | Require auth or a server-bound challenge, use the AI budget, normalize trusted ingress headers, enforce shared rate/concurrency/provider-spend ceilings, and reject before provider work.            |
| HSP-113 | Rate/caching authority       | Rate limits and several caches are per-process, unbounded or incompletely evicted, and multiply across replicas.                                         | Introduce a shared atomic production provider, layered global/IP/user/project budgets, bounded TTL/cardinality, and explicit fail-open/fail-closed policy by endpoint cost/risk.                     |
| HSP-114 | Workspace mobile             | Preview mode always uses horizontal resizable panels and crowded non-wrapping controls.                                                                  | Below the approved breakpoint, show one active surface at a time with an accessible switch and a compact secondary-action menu, preserving draft, focus, scroll, annotation, and iframe state.       |
| HSP-115 | Source delivery              | Ready workspaces fetch all source, logs, and summaries before Code is opened.                                                                            | Keep preview readiness in lightweight workspace/runtime metadata; load a source manifest and selected file only after Code opens, cached by immutable snapshot ID.                                   |
| HSP-116 | Workspace hydration          | A 2,800+ line client shell hides server-provided title/history behind a full-screen hydration spinner.                                                   | Render a stable server-readable shell and progressively hydrate composer, streaming, panels, annotations, and Code. Extract deep state modules behind behavioral tests, not a visual rewrite.        |
| HSP-117 | Chat render cost             | Streaming repeatedly deduplicates/scans all history and maps an unbounded mounted message list.                                                          | Normalize at ingestion, memoize derived state, isolate the streaming turn, and window/cap mounted history while preserving anchors and accessible order.                                             |
| HSP-118 | Network resilience           | Runtime, workspace, source, pagination, annotation, and rename requests have inconsistent abort, retry, offline, stale, and visible-error behavior.      | Centralize abortable request policy, pause GET polling hidden/offline, reconcile on reconnect, preserve input, and use idempotency keys for mutation retries.                                        |
| HSP-119 | Build stream                 | Build SSE parsing is component-owned, not resumable, and can report transport loss as build failure.                                                     | Emit attempt/event IDs, persist bounded events, reconnect from last event, reconcile authoritative state, distinguish navigation from explicit stop, and abort client readers on unmount.            |
| HSP-120 | Pagination                   | Project listing orders by mutable `updatedAt` with an ID cursor; deleting the current cursor can break load-more.                                        | Use an opaque `(updatedAt,id)` keyset cursor with deterministic ordering and a compatible cursor transition.                                                                                         |
| HSP-121 | Health/readiness             | App, 9Router, and Headroom lack a complete readiness/liveness and dependency health contract.                                                            | Add cheap liveness, bounded readiness, Compose/image health checks, traffic draining, dependency-degradation rules, and alerts. Langfuse remains non-critical.                                       |
| HSP-122 | Supply chain                 | Mutable images/packages/actions, missing dependency automation, and no SBOM/container/secret scan make builds non-reproducible.                          | Pin reviewed identities, automate small updates, generate SBOM/provenance, scan Bun/Python/container inputs, and define severity exceptions with expiry.                                             |
| HSP-123 | Production image/CI          | Runtime image includes the full development dependency tree and CI does not build/smoke the deployment image.                                            | Move runtime dependencies correctly, prune or use standalone output, build/scan/smoke the exact non-root image in CI, and promote one signed digest.                                                 |
| HSP-124 | Local infrastructure         | Credentialed development services bind beyond loopback and documented Langfuse overrides are not consistently interpolated.                              | Bind local services to `127.0.0.1`, expose only needed ports, wire all documented secrets, and separate local-only defaults from shareable deployment config.                                        |

### P2 — Scheduled Hardening

| ID      | Domain                | Finding                                                                                                                                        | Target outcome                                                                                                                                                                                                                                                                                                                                                   |
| ------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HSP-201 | Security headers      | No repository-enforced route-aware CSP, frame, referrer, permissions, or production HSTS policy.                                               | Centralize and test separate control-plane, API, private-preview, and generated-origin policies.                                                                                                                                                                                                                                                                 |
| HSP-202 | Mutation boundary     | Product mutations rely mostly on cookie defaults rather than an explicit same-origin/Fetch Metadata policy.                                    | Add a centralized same-origin check while retaining secure, host-only, HttpOnly, SameSite cookies and documented exceptions.                                                                                                                                                                                                                                     |
| HSP-203 | Preview tokens        | Preview asset tokens have no expiry/audience/version and can fall back to a public development secret.                                         | Require a production secret; sign versioned audience/project/deployment/expiry claims; support rotation; never log query tokens.                                                                                                                                                                                                                                 |
| HSP-204 | Runtime target policy | Runtime URLs are currently internal, but the proxy has no independently enforced destination allowlist or network egress boundary.             | Validate supervisor-issued targets against explicit scheme/host/port/node identity and block private/control-plane drift from compromised state.                                                                                                                                                                                                                 |
| HSP-205 | Observability privacy | Langfuse/Sentry metadata, retention, redaction, sampling, flushing, access, and release correlation are incomplete.                            | Pseudonymize identities, minimize content, add canary-secret tests, define retention/access, instrument client/server/edge releases, and alert on exporter failure.                                                                                                                                                                                              |
| HSP-206 | Retention             | Runtime events, attempts, builds, snapshots, deployments, idempotency rows, and artifacts grow without a modeled lifecycle.                    | Define product/legal retention, preserve active/latest-successful/published dependencies, and batch archive/delete only expired unreferenced data.                                                                                                                                                                                                               |
| HSP-207 | CI governance         | CI lacks explicit least-privilege permissions, migration/Compose checks, immutable-image promotion, failure artifacts, and rollback rehearsal. | Add least privilege, migration safety, deployment checks, protected promotion, bounded diagnostics, and previous-digest rollback.                                                                                                                                                                                                                                |
| HSP-208 | Dashboard thumbnails  | Project cards scale script-enabled preview iframes and can retain many JS realms.                                                              | Create private versioned screenshots/images keyed by successful build, keep at most one on-demand live iframe, and cap memory/network.                                                                                                                                                                                                                           |
| HSP-209 | Home TTFB             | A cold GitHub contributor request can gate an ancillary community section and initial response.                                                | Put the section behind Suspense, use a strict timeout and stale cache, and stream the hero/prompt independently.                                                                                                                                                                                                                                                 |
| HSP-210 | Accessibility         | Dynamic progress/errors and selected preview/question controls lack consistent live-region and selection semantics.                            | Add restrained phase announcements, correct tab/radio/pressed semantics, focus recovery, keyboard completion, and 200% zoom validation.                                                                                                                                                                                                                          |
| HSP-211 | Async races           | Rename and some GET/mutation flows can overlap, reject silently, or set stale state after unmount.                                             | Use request/version tokens, latest-intent-wins semantics, confirmed-value rollback, visible error, and cleanup aborts.                                                                                                                                                                                                                                           |
| HSP-212 | Build UI duplication  | Up to three build progress panels can each own an elapsed-time timer and animated tree.                                                        | Keep one workspace clock and one full progress surface with compact mirrors; pause when hidden/terminal.                                                                                                                                                                                                                                                         |
| HSP-213 | Session hydration     | App-wide `SessionProvider` may duplicate server auth and add client work to routes that do not need reactive session state.                    | Measure first, then scope or hydrate it from the server without breaking OAuth return/sign-out behavior.                                                                                                                                                                                                                                                         |
| HSP-214 | Artifact transfer     | R2 calls lack a unified abort/retry policy and object transfer is not bounded/parallelized consistently.                                       | Apply explicit deadlines, bounded concurrency, checksums, idempotent retries, and partial-upload cleanup.                                                                                                                                                                                                                                                        |
| HSP-215 | AI retry policy       | Some AI calls disable retries, some inherit SDK defaults, and local timeout races may not abort provider/tool work.                            | Define an explicit operation matrix; propagate abort; avoid automatic retry for side-effecting tools; cap idempotent retry amplification.                                                                                                                                                                                                                        |
| HSP-216 | Moderation policy     | Availability-first moderation behavior is inconsistent with a specialist recommendation to fail closed at every high-risk boundary.            | Preserve the already-approved current behavior—explicit `BLOCK` and `CLARIFY` are authoritative; malformed/empty/provider failure remains observable and availability-first—until a separate product/safety decision changes it. Do not silently reverse it in a security refactor. Add abuse, cost, policy-version, and decision telemetry around the boundary. |

### P3 — Measured Maintainability And Efficiency

| ID      | Domain                    | Finding                                                                                                                             | Target outcome                                                                                                                                          |
| ------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HSP-301 | Runtime child env         | The repository-owned static server inherits the full platform environment.                                                          | Pass only the minimal explicit environment and run under the runtime isolation boundary.                                                                |
| HSP-302 | Preview messaging         | Annotation bridge uses wildcard `postMessage` and does not verify source/origin/nonce.                                              | Add a per-preview handshake nonce, source validation, schema/size limits, and replay rejection with a documented sandboxed-origin design.               |
| HSP-303 | Module depth              | Ownership, bounded parsing, errors, job claims, artifact resolution, runtime orchestration, and headers are repeated across routes. | Move policy into deep modules with small route adapters and behavior-first tests. Do not create generic abstractions without at least two real callers. |
| HSP-304 | Package metadata          | The application is marked publishable and dependency update ownership is ambiguous.                                                 | Set private unless publication is intentional and document update cadence, owners, lockfile review, and exception expiry.                               |
| HSP-305 | Runtime cleanup packaging | The documented idle-stop script is not demonstrably runnable from the production image.                                             | Package it as a supervised worker/entrypoint with singleton lease, metrics, and a tested manual fallback.                                               |
| HSP-306 | Static caching            | Public/generated immutable assets do not yet have a complete build-ID cache contract.                                               | Use immutable cache keys and long-lived caching for committed public assets while keeping private HTML/state correctly private/no-store.                |

## User Stories

### Business Owner And Visitor

1. As a business owner, I want to describe my business and receive real AI help, so that hardening does not turn the product into a static template generator.
2. As a business owner, I want my streamed Discuss text to remain visible after a structured-card failure, so that useful progress is not lost.
3. As a business owner, I want answered questions to stay answered after refresh, retry, or reconnect, so that the app does not make me repeat myself.
4. As a business owner, I want a clear Indonesian recovery action when AI, network, build, runtime, or storage work fails, so that I know whether to retry, reconnect, continue chatting, or wait.
5. As a business owner, I want slow operations to show honest progress and eventually stop or recover, so that I never face an infinite spinner.
6. As a business owner, I want a failed build or edit to preserve my last successful preview, so that experimentation is safe.
7. As a business owner, I want publishing to remain explicit, so that visitors never see an unfinished draft.
8. As a business owner, I want old projects to reopen after platform upgrades, so that security migrations do not strand my work.
9. As a business owner, I want projects to survive server/container replacement, so that deployment maintenance does not erase generated sites.
10. As a business owner, I want retrying a disconnected build to reconnect to the same attempt where possible, so that I do not pay for or wait on duplicate work.
11. As a business owner, I want a project that crashed during edit to become retryable automatically, so that it does not remain permanently “building.”
12. As a business owner, I want the workspace to work on a 320–390 px phone without clipped controls, so that I can build from the device I have.
13. As a business owner, I want chat and preview to switch cleanly on mobile without losing text, scroll, or preview state.
14. As a business owner, I want preview to open without downloading source code I did not ask to inspect, so that mobile data and time are not wasted.
15. As a business owner, I want long project history to remain responsive during streaming, so that older conversations do not make typing or scrolling lag.
16. As a business owner, I want offline and reconnecting states to be explicit, so that I do not confuse stale data with a successful action.
17. As a business owner, I want an optimistic rename or publish to tell me if it was not saved, so that local UI never lies about server state.
18. As a keyboard or screen-reader user, I want selected controls, progress phases, and errors announced correctly without token-by-token noise.
19. As a visitor, I want a published generated site to load quickly without gaining access to my UMKM Cepat session.
20. As a visitor, I want public URLs to resolve deterministically, so that retries or slug collisions cannot send me to another site or revision.
21. As a visitor, I want immutable site assets cached safely, so that repeat visits are fast while new publishes remain explicit.
22. As a user, I want consent and anti-bot verification enforced by the server and recorded with the policy version, so that account creation is trustworthy.
23. As a user, I want private generated source, prompts, annotations, and logs excluded from unrelated users and minimized in monitoring tools.
24. As a user, I want an oversized request rejected before costly work with an actionable message, so that one accidental upload does not freeze the product.

### Operator And Maintainer

25. As an operator, I want generated builds to execute in an isolated disposable environment, so that one project cannot read another project or the control plane.
26. As an operator, I want a fixed platform-owned build command and dependency set, so that generated package scripts cannot become shell access.
27. As an operator, I want build CPU, memory, disk, PID, network, output, and wall-time limits enforced by the runtime boundary, not just documented.
28. As an operator, I want a kill switch for generated build and public execution, so that I can contain an incident without deleting projects.
29. As an operator, I want generated public sites on a cookie-free origin, so that arbitrary frontend code cannot act as a signed-in control-plane user.
30. As an operator, I want every canonical artifact checksummed and referenced by an immutable manifest, so that corruption and partial uploads are detectable.
31. As an operator, I want a container-recreate and restore drill, so that persistence claims are demonstrated rather than assumed.
32. As an operator, I want database and artifact backups from the same recovery point, so that restored references do not point to missing bytes.
33. As an operator, I want RPO/RTO and retention written down and measured, so that incidents have a clear objective.
34. As an operator, I want migrations run once before rollout under expand/contract rules, so that old and new replicas remain compatible.
35. As an operator, I want every build/edit/runtime owner represented by a durable lease and fencing token, so that crashed or stale workers cannot corrupt newer work.
36. As an operator, I want runtime capacity enforced atomically across replicas, so that cold-start bursts cannot exceed the node budget.
37. As an operator, I want runtime health and proxy calls to have hard abort deadlines, so that hung targets do not consume request slots forever.
38. As an operator, I want published static sites to avoid permanent per-project processes, so that idle sites have near-zero runtime cost.
39. As an operator, I want shared atomic rate limiting and provider budgets, so that restarts or replicas do not multiply abuse capacity.
40. As an operator, I want trusted-proxy handling explicit, so that caller-controlled forwarding headers cannot choose their own limit bucket.
41. As an operator, I want app liveness and readiness to distinguish process, database, AI gateway, and optional observability failures.
42. As an operator, I want production startup to reject placeholder secrets, localhost public URLs, invalid provider sets, and non-persistent local artifact paths.
43. As an operator, I want local infrastructure bound to loopback by default, so that development credentials are not exposed on shared networks.
44. As an operator, I want dependency, container, SBOM, secret, and migration gates in CI, so that known production risks are caught before promotion.
45. As an operator, I want to deploy one signed immutable image digest and roll back to the previous compatible digest.
46. As an operator, I want alerts for error rate, latency, build/runtime failures, capacity, volume pressure, backup failure, migration failure, and telemetry export failure.
47. As an operator, I want Langfuse and Sentry retention, redaction, pseudonymization, sampling, release tags, and access control documented and tested.
48. As an operator, I want cleanup jobs for expired events, attempts, objects, and deployments that never delete the active preview or published dependency graph.
49. As an operator, I want database plans and write amplification measured before adding indexes or caches, so that optimization does not trade one bottleneck for another.
50. As an operator, I want a dashboard of queue wait, stage duration, AI latency/tokens/cost, build resources, runtime starts, DB query time, artifact I/O, and browser performance.

### Developer And Reviewer

51. As a developer, I want one owner-scoped project access module, so that normal and degraded responses cannot drift on authorization.
52. As a developer, I want one bounded request parser with endpoint schemas, so that byte/count limits are enforced before AI, DB, filesystem, or build work.
53. As a developer, I want one typed error envelope, so that the frontend can distinguish retryable, offline, conflict, limit, unauthorized, and terminal failures.
54. As a developer, I want one job lifecycle module, so that claim, heartbeat, cancel, finalize, reconcile, and stale recovery share invariants.
55. As a developer, I want route handlers to enqueue intent and stream/retrieve state rather than own long-running generated builds.
56. As a developer, I want one artifact-store interface with immutable commit semantics, so that local and R2 behavior remain compatible.
57. As a developer, I want one generated-build policy, so that executable files, dependencies, command, and sandbox budgets cannot drift by route.
58. As a developer, I want one runtime target validator and supervisor interface, so that proxy destinations and process identity are independently checked.
59. As a developer, I want append-only or CAS-protected chat turns, so that concurrent tabs cannot silently lose messages or cards.
60. As a developer, I want deterministic keyset pagination, so that deletes and equal timestamps do not duplicate or skip projects.
61. As a developer, I want source manifests and per-file retrieval, so that Code can load incrementally and cache immutable files.
62. As a developer, I want workspace orchestration decomposed behind tested state modules, so that performance changes do not alter visible behavior.
63. As a developer, I want resumable build events and authoritative reconciliation, so that transport and job state remain separate.
64. As a developer, I want GET requests to pause hidden/offline and mutations to use idempotency keys, so that reconnect cannot create retry storms.
65. As a developer, I want all outbound AI, runtime, and object-storage calls to declare timeout, retry, cancellation, and idempotency behavior.
66. As a developer, I want security headers and mutation-origin policy tested per route class, so that control-plane and generated origins do not share unsafe defaults.
67. As a developer, I want preview tokens to be expiring, audience-bound, and rotatable, so that copied URLs do not remain valid indefinitely.
68. As a developer, I want representative PostgreSQL integration tests, so that concurrency and query plans are not inferred from mocks alone.
69. As a developer, I want black-box sandbox tests, so that security claims are validated outside the same code that enforces them.
70. As a developer, I want authenticated browser fixtures for mobile, offline, streaming, accessibility, and memory tests, so that the workspace is covered at its highest practical seam.
71. As a reviewer, I want each optimization PR to include baseline, hypothesis, trace/profile, after measurement, regression risk, and rollback.
72. As a reviewer, I want each schema/storage change to include compatibility reads, backfill/reconciliation, integrity queries, and rollback limits.
73. As a reviewer, I want all new repeated UI states represented in Storybook in the same change.
74. As a maintainer, I want canonical docs updated with every behavior, environment, provider, storage, deployment, or operations change.
75. As a maintainer, I want `bun run check` to remain the required local gate and Bun to remain the sole package/runtime workflow.

## Solution Architecture And Deep Modules

Implementation should strengthen a small set of deep boundaries. Exact filenames may follow existing conventions, but ownership must remain clear.

### 1. Project Access And API Boundary

Create or deepen a server-only project access module that:

- authenticates once;
- loads by `{ projectId, userId }` or establishes a signed public capability;
- carries immutable owner identity into cache keys;
- distinguishes database unavailable from not found without leaking existence;
- never allows stale fallback before authorization is established;
- emits safe structured audit metadata.

Pair it with a bounded request module that owns content-length checks, streaming/unknown-length accounting, schema parsing, item and string limits, and typed 400/413/422 errors. Route handlers should declare a named budget rather than repeat ad hoc casts and trims.

Use one error envelope with a stable internal code, retryability, optional `Retry-After`, request/attempt ID, and friendly client mapping. Internal messages stay English; product copy remains Indonesian.

### 2. Durable Job Lifecycle

A build, edit, repair, publish promotion, runtime start/stop, and background compaction must follow the same lifecycle concepts:

1. Validate ownership, policy, idempotency key, and bounded input.
2. Create the durable attempt before setting the project claim.
3. Atomically claim with a unique lease/fencing token and expiry.
4. Append bounded progress events with monotonically increasing IDs.
5. Heartbeat while work remains active.
6. Commit domain output only if the lease token is still current.
7. Finalize exactly once as succeeded, failed, canceled, or stale/reclaimed.
8. Reconcile abandoned attempts with a scheduled sweeper.
9. Never let cleanup from an old lease clear a newer attempt.

The HTTP API should enqueue intent and return/stream the attempt ID quickly. The worker owns long-running work. Closing a stream detaches observation; it does not automatically cancel the job. Explicit stop creates a durable cancellation request, and every stage observes the same propagated abort signal/deadline.

### 3. Generated Build Boundary

Containment lands before the final sandbox:

- executable project files such as generated build scripts/config are platform-owned or immutable;
- the allowed profile determines a fixed command and approved dependency graph;
- browser clients submit user intent, not privileged file-tool command arrays;
- generated source validation rejects executable configuration drift before process creation.

The production build worker then runs an immutable source snapshot in an ephemeral isolated environment:

- distinct non-root identity;
- read-only base filesystem;
- one disposable writable workspace;
- no application source, `.env`, database socket, Docker socket, object credentials, or sibling workspace mounts;
- default-deny egress, with only a pinned package mirror if runtime installs remain necessary;
- platform-owned lockfile/template where practical;
- dropped capabilities and an approved seccomp profile;
- CPU, memory, disk, PID, file-descriptor, output, and wall-time limits;
- process-group/cgroup termination and verified descendant cleanup;
- structured result and committed artifact returned through a narrow worker interface.

Generated application runtime follows a separate but equivalent isolation profile. Static built artifacts should be served directly where possible rather than starting a process per public project.

### 4. Origin And Browser Security Boundary

Use separate policies for:

- authenticated control-plane pages and APIs;
- private sandbox previews;
- generated public sites on a separate origin.

Generated-site origin requirements:

- not the control-plane origin;
- preferably a separate registrable domain;
- no shared parent-domain authentication cookies;
- no control-plane credentials or implicit API access;
- restrictive response headers suitable for generated sites;
- explicit cross-origin integration only through narrow capability APIs, if ever needed.

Control-plane requirements include route-aware CSP, frame restrictions, Referrer-Policy, Permissions-Policy, `nosniff`, production HSTS at HTTPS ingress, host-only secure cookies, and same-origin/Fetch Metadata checks on product mutations. Private preview messaging uses a nonce/source/schema handshake rather than wildcard trust.

### 5. Artifact Store And Durability

The artifact interface owns:

- immutable artifact/build IDs;
- binary-safe objects;
- per-file and aggregate metadata;
- checksums and schema/profile versions;
- staged writes;
- commit manifest written only after all objects verify;
- idempotent lookup and commit;
- local and R2 implementations with the same semantics;
- bounded, abortable reads/writes;
- reconciliation and garbage collection.

Database rows reference only committed artifacts. Compatibility reads continue to support existing local references during migration. Backfills inventory current rows and objects before changing the writer. A startup preflight verifies local persistence or required R2 configuration.

### 6. Runtime Supervisor And Proxy

A supervisor-owned API must:

- issue opaque runtime identities, not trust bare PIDs;
- use database/shared leases and fencing across replicas;
- enforce per-node capacity atomically;
- validate deployment-to-artifact identity;
- pass a minimal environment;
- apply resource and request budgets;
- bind runtime listeners to the intended private interface;
- issue only allowlisted proxy targets;
- abort health checks and proxy fetches;
- cancel upstream streaming when the client disconnects;
- record lifecycle events and reconcile orphans;
- drain old immutable revisions on republish.

The route-side proxy independently validates scheme, host, port, node, deployment, and lease. Database compromise or stale state must not turn the proxy into an arbitrary network client.

### 7. Database Correctness And Scale

Use PostgreSQL-backed integration evidence before schema optimization.

- Replace whole-document chat authority with append-only turns when feasible. A transitional project revision/CAS is acceptable if it preserves all concurrent message IDs exactly once.
- Add unique constraints for logical singleton published deployments and non-null public slugs after auditing/backfilling duplicates.
- Move content precedence away from traffic-mutated timestamps.
- Coalesce activity writes to no more than one touch per configured interval.
- Use exact keyset tuples for project pagination.
- Add composite indexes only after representative `EXPLAIN (ANALYZE, BUFFERS)` evidence.
- Use concurrent/non-blocking index creation where production size requires it and document Prisma migration handling.
- Add leases, expiry, and retention fields through expand/contract migrations.
- Keep large source/dist/log objects out of hot project rows after compatibility migration.

### 8. AI Reliability, Safety, And Cost

Keep the central timeout registry and the established separation between streaming, tool settlement, and timeout. Extend it with an explicit operation matrix that defines model, maximum attempts, retryable classes, deadline, abort propagation, idempotency, token/input budget, output budget, and observability fields.

Rules:

- no automatic retry for side-effecting tool loops;
- at most one bounded jittered retry for approved idempotent structured calls, honoring `Retry-After`;
- a local timeout must abort upstream provider/tool work, not only reject a `Promise.race`;
- chat accepts one new user turn plus a server revision/turn ID, not arbitrary authoritative history;
- compaction is based on bytes/tokens as well as count and runs as idempotent background work;
- compaction failure never breaks visible chat;
- normal Discuss remains one streaming AI request with an explicit tool finalization barrier;
- retries and repairs remain separately observable;
- no deterministic or dummy output may masquerade as an AI success.

Moderation policy is a product/safety decision, not an accidental refactor. The currently approved behavior remains: explicit `BLOCK` blocks, explicit `CLARIFY` clarifies, and malformed/empty/provider-failure behavior is availability-first and observable. This PRD hardens authentication, rate/cost boundaries, policy versioning, and telemetry without silently changing that choice. Any future fail-closed policy requires an explicit product decision, user-facing recovery, availability SLO, and updated focused PRD/tests.

### 9. Frontend State And Performance

Do not rewrite `WorkspaceShell` in one change. First create browser and state-machine characterization tests. Then extract cohesive responsibilities:

- authoritative workspace/job reconciliation;
- chat normalization and pagination;
- network/offline request policy;
- preview/runtime lifecycle;
- source manifest/file loading;
- build event subscription;
- title/publish/edit mutations.

Render server-provided title, initial history, and last-known preview state without waiting for the entire client shell. Hydrate interactive regions progressively. Load annotations, Motion-heavy behavior, and Code/editor data only when used.

On compact viewports, preserve one mounted preview and one chat state but expose one primary surface at a time. The switch is keyboard accessible, preserves focus/scroll/draft, and never reloads the iframe merely because the user switched surfaces.

Normalize messages when received, isolate streaming state, and cap mounted nodes. Windowing must preserve prepend anchors, DOM reading order, and an accessible older-history action. Use one build clock and bounded progress history.

A shared frontend request policy owns abort, bounded GET backoff with jitter, visibility/offline pause, reconnect reconciliation, and explicit stale/error states. Mutations are never blindly retried; they use idempotency keys and preserve unacknowledged user input.

### 10. Production, Supply Chain, And Observability

Add a typed production configuration preflight covering required secrets, entropy/placeholder rejection, URLs, provider combinations, numeric bounds, storage persistence, trusted proxy configuration, public generated origin, and incompatible modes. Configuration errors fail before migration or traffic.

Run migrations as a single release step. Build, scan, sign, smoke, and promote the same immutable non-root image. Pin container/action/package identities as practical, automate small dependency updates, generate an SBOM/provenance, and maintain time-bounded vulnerability exceptions.

Observability must be useful without becoming a data leak. Pseudonymize stable user/project identifiers, default to metadata over raw content, redact cookies/auth/secrets/private source, define prompt/output capture by environment, set sampling and retention, verify exporter flush/failure, tag release/environment, and link alerts to runbooks.

## Initial Budgets And Service Objectives

These are initial targets. Phases 0–1 collect representative baselines and may adjust a target with documented evidence and owner approval. A target does not become blocking until measurement is stable.

### Security And Isolation Gates

- 100% of adversarial build canaries fail to read a control-plane sentinel, sibling workspace, process environment secret, or unapproved network destination.
- Generated-site browser tests show zero control-plane cookies sent and no readable authenticated control-plane response.
- 100% of private cached/stale responses require established owner identity.
- 100% of side-effecting routes reject over-budget input before AI, filesystem, storage, build, or mutation work.
- 100% of referenced committed artifacts pass manifest and checksum validation.
- No production startup with placeholder secrets, localhost public URLs, forgeable preview-token secret, or non-persistent configured local artifact path.

### Browser And UI

- Public Home mobile p75: LCP ≤2.5 s, INP ≤200 ms, CLS ≤0.1.
- Authenticated workspace mobile p75 after a representative fixture exists: LCP ≤2.5 s, INP ≤200 ms, CLS ≤0.1.
- Public Home initial route JavaScript ≤170 KB gzip.
- Workspace initial route JavaScript ≤250 KB gzip excluding the on-demand editor.
- Editor/Monaco code and source-file payload are not requested before Code opens.
- Preview open performs zero source-file artifact reads and transfers zero source-file bytes.
- Code manifest ≤50 KB compressed; initial selected text file ≤200 KB; explicit fallback for larger files.
- At 320, 360, and 390 CSS px: no horizontal document overflow, primary targets ≥44×44 CSS px, and no clipped primary control at 200% zoom.
- Axe serious/critical issues: zero on covered flows.
- Streaming with 500 stored messages: ≤100 mounted message nodes, p95 React commit ≤8 ms at 10 tokens/second on the agreed throttled profile, and heap growth ≤20 MB.
- Dashboard: at most one live iframe; versioned thumbnails ≤50 KB where feasible; heap growth ≤10 MB after 100 rows.
- One elapsed-time timer per active workspace and no timer while hidden or terminal.

### API, Network, And Database

- Lightweight authenticated reads, excluding runtime cold start and AI: server p95 ≤500 ms and p99 ≤1.5 s under the agreed beta load profile.
- Job enqueue API p95 ≤500 ms; first persisted progress event p95 ≤1 s.
- Every outbound AI, object-store, runtime health, and runtime proxy call has an explicit deadline and retry count.
- Runtime health deadline ≤2 s; end-to-end runtime proxy deadline ≤15 s.
- Stop background polling within 1 s of hidden/offline; issue one reconciliatory request on reconnect/visibility before resuming cadence.
- Automatic GET retry cadence is bounded around 3 s, 7 s, 15 s, then 30 s with jitter; mutations are not automatically replayed without idempotency.
- Project pagination produces zero duplicate/omitted IDs across 1,000 seeded rows with equal timestamps, concurrent updates, and cursor-row deletion.
- Concurrent publish results in exactly one logical published deployment and one unique slug.
- Twenty synchronized same-project chat completions preserve each unique turn exactly once.
- A page view with 50 assets produces at most one deployment activity write per coalescing interval.
- Representative dominant queries avoid unintended full-table scan/sort according to reviewed plans; index write/storage overhead is recorded.

### AI, Build, Runtime, And Storage

- Current AI timeout defaults remain centralized and environment-configurable; route/platform deadlines always exceed operation deadlines or work is moved to a worker.
- Discuss first visible frontend chunk: p75 ≤2.5 s and p95 ≤5 s under the agreed provider profile; browser Network chunks, not terminal logs alone, provide evidence.
- No post-timeout tool side effect after cancellation is acknowledged.
- Retry amplification ≤2 provider calls per approved idempotent logical operation and one for side-effecting tool loops.
- Initial build sandbox budget: 1 CPU, 1 GiB memory, 1 GiB writable disk, 64 PIDs, 180 s wall time, and terminate descendants within 5 s after cancellation/timeout.
- Warm generated build p95 ≤45 s; cold p95 ≤120 s; end-to-end p95 ≤150 s after durable worker rollout.
- Explicit cancellation observed ≤2 s; all descendant work stopped ≤5 s; no later artifact commit under the canceled lease.
- At most one live runtime per deployment under 100 concurrent cold-start requests across at least two supervisor instances.
- Static runtime cold start p95 ≤2 s; warm proxy overhead p95 ≤50 ms, measured separately from app response time.
- Suggested initial source budget: ≤100 files, ≤256 KiB per file, ≤5 MiB total.
- Suggested initial dist budget: ≤500 files, ≤10 MiB per file, ≤50 MiB total.
- Captured build log ≤1 MiB before final sanitizer/truncation.
- Artifact materialization memory overhead approaches bounded chunk size, not total artifact size; binary round-trip and checksum success 100%.
- Object-store operation p99 deadline ≤15 s with bounded concurrency.
- Interrupted/staged objects become unreadable as canonical artifacts and are reclaimed within 24 hours.
- Preview idle-stop lag p99 ≤2 minutes after configured TTL; public static artifacts require no persistent per-project process.

### Operations And Observability

- Beta availability target after measurement: ≥99.5% monthly for control-plane page/API requests excluding scheduled maintenance; generated public serving measured separately.
- Successful restore drill meets documented initial RPO ≤24 hours and RTO ≤4 hours; tighten only after repeatable evidence.
- Backup failure alerts within one scheduled interval; reaper/worker missed-run alerts within two intervals.
- Graceful telemetry flush ≤2 s where runtime lifecycle allows it.
- ≥99% export success for sampled completed AI traces, without blocking product requests.
- Automated canary scans find zero raw credentials, authorization headers, session cookies, or direct user IDs in exported traces/events.
- Default observability retention target ≤30 days unless legal/product requirements approve a different value.
- Previous compatible signed image digest and coordinated database/artifact recovery instructions are available for every production rollout.

## Implementation Phases, Gates, And Rollback

### Phase 0 — Baseline, Ownership, And Containment

Deliverables:

1. Record current feature flags, storage providers, artifact inventory, project/build/deployment consistency, database size/cardinality, and production topology.
2. Add operator kill switches for generated build execution, generated public execution, and new runtime starts. Kill switches preserve data and existing last-good output.
3. Prevent generated/client edits to executable build/config files and require an exact platform-owned command immediately.
4. Disable arbitrary generated JavaScript publishing until separate-origin verification exists.
5. Add measurements in report-only mode: route/browser bundle, Lighthouse, DB timing/plans, AI latency/tokens/cost, stage duration, build resources, runtime cold start, artifact I/O, cache/rate cardinality, and stuck-state counters.
6. Inventory and safely resolve existing duplicate published rows/slugs, orphaned attempts/artifacts, and project/build inconsistencies before constraints.
7. Resolve the reported `uuid` and `dompurify` advisories through dependency graph review, tests, and a normal lockfile update; do not use an unsafe forced upgrade.

Exit gate:

- P0 exploit paths are disabled or contained.
- Current data inventory and consistency queries are saved.
- Baselines are reproducible and do not capture private payloads.

Rollback:

- Re-enable only the previous non-public/local capability explicitly; never re-enable unsafe shared production execution as an emergency performance rollback.
- Kill switches do not delete source, attempts, or deployments.

### Phase 1 — Durability And Recoverability

Deliverables:

1. Persist canonical local artifacts at an explicit production path or require configured R2.
2. Add startup storage write/read/preflight and manifest integrity checks.
3. Create coordinated Postgres/artifact backup, retention, restore, and integrity runbooks.
4. Perform a container-recreate test and isolated restore drill before schema hardening.
5. Decouple migrations from application startup and document expand/contract and forward-fix/down-migration decisions.
6. Create durable attempt-at-claim, guarded finalization, lease token, heartbeat, and sweeper foundations.
7. Fix owner-bound degraded caches and bound their memory/age.

Exit gate:

- HSP-003 through HSP-006 dynamic tests pass.
- Sample restored projects support private preview, public serving where allowed, source/edit base, rebuild, and checksum validation.
- Fault injection after each claim stage leaves projects terminal or reclaimable.

Rollback:

- Retain the previous container/image, original artifact volume/object prefix, pre-migration database backup, and inventory.
- Dual-read old artifact references until reconciliation reaches 100%; do not remove old bytes during this phase.

### Phase 2 — Isolated Build And Runtime Authority

Deliverables:

1. Introduce the durable build queue/worker interface behind a feature flag.
2. Execute immutable snapshots in the isolated sandbox with enforced budgets and no control-plane secrets.
3. Compile once and commit an immutable checked artifact.
4. Propagate cancellation/deadline and terminate full process groups/cgroups.
5. Introduce runtime leases/fencing, atomic capacity, minimal environment, target validation, hard proxy/health deadlines, and orphan reconciliation.
6. Make publish revisions immutable; drain old runtimes; serve public static artifacts without persistent processes where possible.
7. Persist resumable progress events with bounded retention.

Exit gate:

- HSP-001, HSP-007, HSP-008, HSP-101, and HSP-102 adversarial/concurrency tests pass.
- Shadow worker results match current successful builds on representative fixtures before traffic switches.
- No duplicate compilation, runtime, artifact commit, or publish promotion under synchronized retries.

Rollout:

- Shadow validation → internal projects → small owner allowlist → percentage rollout → default.
- Compare artifacts/checksums and user-visible output at every step.

Rollback:

- Stop new isolated-worker claims and allow in-flight attempts to finish or cancel safely.
- Route new work to the contained fixed-command legacy path only if that path is permitted in the deployment environment.
- Never fall back to executing generated scripts on the control-plane host.

### Phase 3 — Separate Generated Origin And API Hardening

Deliverables:

1. Provision the generated-site origin and routing with host-only control-plane cookies.
2. Add separate response-header policies and browser isolation tests.
3. Add mutation same-origin policy, expiring preview capabilities, trusted-proxy configuration, and server-bound consent/Turnstile proof.
4. Add bounded request parsing, generated file/artifact/log budgets, and shared atomic rate/cost limits.
5. Add runtime target allowlisting and annotation-message handshake.
6. Migrate public links compatibly: old `/p/[slug]` responses redirect to the generated origin only after the target is committed and safe.

Exit gate:

- HSP-002 and browser cookie/API isolation tests pass.
- Route-level cross-tenant, cross-origin, oversized-input, expired-token, and spoofed-forwarding-header suites pass.
- Existing published links have a tested compatibility path.

Rollback:

- Stop redirects and public generated serving while preserving published deployment records.
- Do not serve generated JavaScript on the control-plane origin as fallback.

### Phase 4 — Database And Storage Correctness At Scale

Deliverables:

1. Add append-only/CAS-protected chat turns and background token-aware compaction.
2. Add publish uniqueness, deterministic slugs, stable pagination, and coalesced deployment activity.
3. Add representative-data indexes after plans are reviewed.
4. Add staged artifact commits, checksums, idempotent reconciliation, and orphan GC.
5. Migrate large source/dist/log content away from hot metadata rows with dual-read compatibility.
6. Define and implement safe retention rules.

Exit gate:

- Synchronized database-backed concurrency tests pass.
- Backfill integrity is 100%; old and new readers agree during compatibility window.
- Query/write budgets meet target without unacceptable index overhead.

Rollback:

- Keep compatibility columns/old objects until at least one stable release and a verified backup.
- Disable new writers while retaining dual reads if inconsistency exceeds the rollout threshold.
- Uniqueness migrations include preflight duplicate queries and explicit rollback/forward-fix rules.

### Phase 5 — Workspace Resilience, Accessibility, And Performance

Deliverables:

1. Add an authenticated browser fixture and characterization tests for current workspace behavior.
2. Implement compact single-surface mobile layout in Storybook and product UI.
3. Split source metadata/manifests/files and defer Code/editor loading.
4. Render a useful server shell before full hydration.
5. Normalize/window chat and isolate streaming renders.
6. Add shared abort/offline/visibility/reconnect policy and resumable build events.
7. Fix pagination, rename races, duplicated timers, dynamic semantics, and dashboard iframe usage.
8. Isolate the GitHub community section from hero TTFB.

Exit gate:

- Browser budgets pass at required widths, throttling, long histories, network loss, reconnect, 200% zoom, keyboard, reduced motion, and screen-reader manual script.
- Last-good preview, draft text, answered questions, and explicit publish invariants remain unchanged.
- Existing Storybook patterns are updated before or with reusable UI changes.

Rollback:

- Each extraction/layout change is independently flaggable or revertible.
- Preserve state contracts and API compatibility so UI rollback does not require data rollback.

### Phase 6 — Production And Supply-Chain Closure

Deliverables:

1. Typed fail-closed production configuration and Compose validation.
2. Loopback-only local infrastructure and correct Langfuse secret interpolation.
3. Liveness/readiness, health chains, draining, and packaged supervised workers.
4. Pruned/standalone non-root image, immutable digest promotion, SBOM/provenance, dependency/container/secret scanning, and automated updates.
5. Least-privilege CI, migration safety checks, smoke tests, protected environment approval, failure diagnostics, and rollback drill.
6. Complete Sentry client/server/edge release instrumentation and Langfuse privacy/retention/export controls.
7. Alert and runbook coverage for the defined SLOs.

Exit gate:

- Exact release image passes migration, startup, health, auth, static asset, worker, and restore smoke tests.
- Production config negative tests fail as expected.
- Synthetic server, edge, client, AI, backup, capacity, and exporter alerts reach the owner without canary-secret leakage.

Rollback:

- Promote the previous compatible signed digest.
- For schema/storage changes, follow the coordinated recovery plan rather than assuming image rollback is sufficient.
- Observability exporters can be disabled by secret/config without disabling local safe metrics and logs.

## Testing Decisions

### Highest Practical Seams

1. **Route-level behavior tests** for authentication, ownership, bounded parsing, error envelopes, idempotency, preview tokens, origin policy, retry/recovery contracts, and public/private response headers.
2. **PostgreSQL-backed integration tests** for claim/finalization, worker leases, publish uniqueness, chat concurrency, keyset pagination, stale sweeps, activity coalescing, retention, and migration/backfill invariants.
3. **Authenticated browser tests** for the full workspace: Discuss streaming, delayed tool settlement, build disconnect/reconnect, last-good preview, mobile surface switching, offline/online, source deferral, long chat, accessibility, and explicit publish.
4. **Black-box sandbox and runtime tests** from outside the worker implementation. Malicious fixtures attempt file/secret access, sibling access, network egress, fork/process exhaustion, disk/log flood, config/script execution, stale PID use, and cross-project interference.
5. **Storage failure-injection tests** around every DB/object step, including partial upload, checksum mismatch, DB outage after upload, duplicate retry, materialization interruption, and GC protection of active/published artifacts.
6. **Deployment drills** that build/smoke the exact image, recreate containers, restore coordinated backups, test invalid production config, and roll forward/back across compatible migrations.
7. **Performance tests** at route/browser/database/build/runtime boundaries with fixed fixtures, environment metadata, warm/cold separation, and before/after traces.

### Required Test Cases

Security:

- Reject malicious `scripts.build`, Vite config execution, shell operators, file reads, and network calls before process creation on any contained legacy path.
- In sandbox, prove control-plane sentinel, process environment, sibling workspace, Postgres/internal metadata, and unapproved egress are inaccessible.
- Prove generated-origin JavaScript receives no control-plane cookie and cannot read authenticated APIs.
- Warm an owner cache, force database unavailability, request as another user, and return no private body.
- Reject cross-site mutation origin/Fetch Metadata, while allowing valid same-origin flows and documented OAuth exceptions.
- Reject expired, wrong-audience, rotated-key, tampered, and missing-production-secret preview tokens.
- Reject wrong runtime target scheme/host/port/node/deployment and wrong annotation source/nonce/schema/size.
- Direct OAuth initiation without server proof fails; proof expires, is single-use, state-bound, and records consent version.

Lifecycle and concurrency:

- Throw after claim and before each subsequent stage; assert a durable failed/canceled/reclaimable attempt and retryable project.
- Synchronize two generate/edit/publish/chat/runtime-start requests across independent process instances.
- Assert old leases cannot finalize or clear new work.
- Disconnect browser transport while server work succeeds; reconnect without duplicate operation or events.
- Stop explicitly versus navigate away; only explicit stop requests domain cancellation.
- Crash worker, expire lease, reclaim once, and prevent duplicate artifact commit.
- Republish a running deployment repeatedly; one routed revision remains and old processes drain.

Data and storage:

- Max and max+1 body, message, part, command, file, aggregate source, dist, log, and artifact cases.
- Chunked/unknown-length request accounting, binary asset round-trip, corrupt manifest, partial upload, and log flood.
- Concurrent chat turns preserve every ID once and keep brief/card state consistent.
- Publish collisions and first-publish double submit resolve deterministically.
- Equal-timestamp pagination, deletion of first/middle/last cursor, concurrent update, retry, and old cursor transition.
- Retention deletes only expired unreferenced data and preserves active preview, latest successful source, published deployment, and audit minimums.
- Restore sampled old and new artifact formats and verify checksums plus rebuild/edit base.

Frontend:

- 320/360/390/768 px, landscape, long Indonesian title/status, 200% zoom, keyboard-only, reduced motion, and axe.
- Surface switching preserves unsent text, focus target, chat scroll, annotation state, and mounted preview.
- No `/source` file request on Preview; manifest/file loads only on Code and uses immutable cache/ETag.
- Hydration-disabled smoke shows title/history/last-known state; hydration has no mismatch.
- 100/500-message stream profiler, prepend anchor, duplicate/tool-only messages, and screen-reader order.
- Offline before/during Discuss, build, edit, annotation, publish, pagination, runtime, and source; reconnect reconciles rather than assumes failure.
- Malformed/multiline/duplicate SSE events, unmount cleanup, and server success after stream loss.
- At most one dashboard live iframe and one workspace build clock.

Operations:

- Production Compose/config refuses every missing/blank/placeholder/malformed/out-of-range required setting.
- Render Compose with sentinel Langfuse values and prove every service receives the intended override.
- External-interface scan sees no local development service except explicitly approved bindings.
- App/DB/9Router/Headroom/Langfuse failure injection produces the documented liveness/readiness behavior.
- Dependency scanner catches a known test advisory; exceptions include owner, reason, compensating control, and expiry.
- Exact image runs migration release step, app, and workers as intended non-root identities.
- Synthetic Sentry/Langfuse events carry release/environment, export successfully, and omit canary secrets/private identifiers.
- Backup/restore and previous-image rollback drills record actual RPO/RTO and integrity results.

### CI Gate Progression

1. Report-only metrics and audit artifacts.
2. Block confirmed security invariant failures, type/test/lint/format regressions, invalid production config, and missing migration compatibility metadata.
3. Block deterministic route, database, sandbox, storage, and browser correctness suites.
4. Add bundle, Lighthouse, query-plan, load, and resource budgets only after stable fixtures and low-flake measurement exist.
5. Allow temporary exceptions only with owner, reason, baseline, compensating control, expiry, and tracking issue.

`bun run check` remains required before handoff. Storybook build/test is required for reusable UI changes. Do not run a broad formatter in a shared worktree; format only claimed files. Do not run the production build unless requested or touching build/deployment behavior, consistent with `AGENTS.md`.

## Observability And Audit Events

Every logical operation should carry a safe request/attempt ID across API, DB, queue, worker, artifact store, runtime, and frontend events. Record:

- operation kind and stage;
- project/build/deployment identifiers in pseudonymous or access-controlled form;
- lease/attempt identity;
- duration, deadline, retry count, cancel source, and terminal class;
- AI model/function, input/output token counts, finish class, and cost where available;
- build CPU/memory/disk/PID/output high-water marks;
- artifact file count/bytes/checksum/commit state;
- runtime queue/start/health/proxy/idle durations and capacity state;
- database query name/duration/rows, not raw SQL parameters containing private text;
- frontend route, Web Vitals, bundle version, reconnect state, and safe error code;
- storage/provider/exporter failure class.

Never emit raw cookies, authorization headers, secret-bearing URLs, API keys, OAuth credentials, full private prompts/source, or unrestricted build output. Query strings containing preview tokens must be removed. Build logs remain sanitized and bounded on every build path.

Minimum dashboards:

1. Security and abuse: rejected origin/token/input/build-policy attempts, rate/provider budget, cross-tenant denial, sandbox canaries.
2. Project lifecycle: active/leased/stale attempts, projects in progress without active attempts, terminal rate, retry/reclaim/cancel.
3. AI: first chunk, completion, tool settlement, timeout, retry, tokens, cost, malformed moderation, compaction.
4. Build/artifact: queue, stage duration, resource saturation, sandbox termination, commit/checksum/orphan/GC.
5. Runtime/public: cold starts, duplicate-lease conflicts, capacity, proxy timeout, orphan process, publish revision, idle reaping.
6. Database: query p95/p99, lock waits, WAL/write amplification, row/object growth, duplicates/inconsistency.
7. Browser: CWV, route JS, source deferral, streaming commits, offline/reconnect, client errors, viewport/accessibility checks.
8. Operations: readiness, backup, restore age, migration, disk/volume, image/dependency status, Sentry/Langfuse export.

## Documentation Decisions

Docs are part of each implementation slice:

- `docs/architecture.md`: trust boundaries, worker/job lifecycle, origin split, artifact commit model, runtime authority, compatibility reads.
- `docs/deployment.md`: production config, persistent volumes/R2, migration release job, generated origin/DNS/TLS, backups/restores, workers/reapers, health, alerts, rollback.
- `DEV.md`: local commands, fixtures, sandbox/runtime development mode, targeted tests, profile/budget commands, safe dependency workflow.
- `.env.example`: every supported timeout, budget, provider, origin, proxy, storage, worker, rate-limit, observability, and kill-switch variable with safe local defaults and production notes.
- `PRODUCT.md` only if product behavior, moderation policy, or user journey changes.
- `DESIGN.md` and Storybook when reusable mobile/offline/reconnecting/error/accessibility patterns change.
- Focused PRDs remain authoritative for their narrow behavior unless explicitly superseded. This document coordinates them; it does not erase their historical decisions.

## Out Of Scope

- Replacing Next.js, React, Prisma, Bun, AI SDK, 9Router, Sentry, or Langfuse solely for perceived cleanliness.
- A broad microservice rewrite. Separate workers/supervisors are introduced only where a trust, durability, or scheduling boundary requires them.
- Executing arbitrary generated backend code.
- Giving generated sites control-plane cookies or direct private API access.
- Dummy AI text, deterministic fake cards, fabricated source, fake preview success, or silent fallback that claims AI succeeded.
- Reworking UMKM Cepat's product positioning or introducing a new visual language.
- A one-shot rewrite of `WorkspaceShell` or the project domain.
- Unmeasured cache layers, speculative database denormalization, or index additions without representative plans.
- Unlimited automatic retries.
- Deleting historical data before retention policy, dependency graphs, backups, and dry-run integrity evidence exist.
- Custom-domain product work beyond what is necessary to establish the safe generated-site origin.
- Tightening the approved moderation availability policy without a separate explicit product/safety decision.
- Promising a specific multiple of performance improvement without reproducible measurements.

## Definition Of Done

The holistic program is complete when:

1. Every P0 item has dynamic evidence and its affected capability is safely enabled or intentionally disabled.
2. Generated build and runtime code execute only within verified isolation/resource/network boundaries.
3. Generated public JavaScript is served only from the verified cookie-free generated origin.
4. Container recreation and coordinated restore preserve sampled project source, private preview, edit base, and published output.
5. Claimed operations are durable, leased, idempotent, terminal/reclaimable, and protected from stale-worker finalization.
6. Cross-tenant, cross-origin, runtime-target, preview-token, oversized-input, and sandbox adversarial tests pass.
7. Chat, publish, pagination, artifact commit, runtime start, and cleanup concurrency tests pass against PostgreSQL/shared infrastructure.
8. Last-good preview, answered questions, real partial progress, explicit publish, and no-fabrication invariants pass in browser tests.
9. Required browser/API/database/AI/build/runtime/storage budgets are measured; blocking gates meet their approved targets.
10. Production configuration fails closed; the exact immutable image passes health, migration, worker, security, and smoke gates.
11. Dependency/container advisories have fixes or current, owned, expiring exceptions.
12. Observability dashboards and alerts are actionable and pass canary privacy tests.
13. Canonical docs and runbooks match deployed behavior, including rollback and restore.
14. `bun run check` passes, and required Storybook/browser/deployment gates pass for the affected slices.

## Further Notes

The specialist reports intentionally used independent severity judgments. This PRD resolves them into one delivery order. For example, mobile workspace and eager source loading are severe product issues, but they do not take precedence over confirmed host execution, same-origin generated JavaScript, durability, and authorization failures. Conversely, security work is not considered complete if the resulting product becomes unusable on the primary mobile device class.

The moderation audit produced a direct conflict with an already-approved focused reliability decision. The current repository intentionally treats malformed or empty moderation output as availability-first while preserving explicit `BLOCK` and `CLARIFY`. This PRD records the security concern but does not silently reverse product policy. It does require a protected cost boundary, explicit metrics, policy versioning, and a future decision record if the behavior changes.

Streaming must be verified end to end. Provider/backend logs prove provider progress; only browser Network chunks prove backend-to-frontend streaming. If chunks arrive progressively but the UI stalls, profile client state/rendering. If chunks arrive only at completion, inspect route/proxy/gateway buffering.

Performance optimization remains hypothesis-driven:

1. establish a trace/profile/query plan;
2. state the bottleneck and expected change;
3. change the smallest deep boundary;
4. rerun the same fixture;
5. compare user-visible and resource results;
6. retain or revert based on evidence.

Graphify should be refreshed before large implementation phases and used to identify call sites and communities affected by changes to project state, runtime, artifact, auth, and workspace modules. It is a discovery tool, not a project dependency.

The safest path is staged containment, durable recovery, real isolation, origin separation, then measured scale and UX optimization. A feature remaining temporarily unavailable is preferable to reintroducing a known tenant, host, origin, or data-loss boundary.
