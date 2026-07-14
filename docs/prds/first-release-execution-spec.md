# Execution Spec: First Release Generated App Platform

Status: proposed
Created: 2026-07-07
Updated: 2026-07-07
Owner: Surya
Scope: engineer-ready execution plan for the first release generated app platform
Read when: implementing, reviewing, testing, splitting, or delegating the first release roadmap into agent-ready work
Do not read for: high-level product positioning, unrelated UI polish, auth-only work, legal pages, or provider-only maintenance
Current truth: source code + `docs/architecture.md` + `docs/deployment.md` + `docs/prds/first-release-generated-app-platform-prd.md` + `docs/prds/isolated-project-runtime-prd.md`

## Status History

- 2026-07-07: Created as the engineer-ready companion to the first release PRD. This document turns the roadmap into execution slices, state machines, API contracts, review fixtures, and quality gates.

## How To Use This Spec

This spec is written for a real engineer or implementation agent who needs to take UMKM Cepat from the current builder to a beta-ready first release.

Rules for implementation:

1. Work from `dev`.
2. Keep changes small and reviewable.
3. Implement phases in order unless a later phase explicitly says it can run in parallel.
4. Do not skip Phase 0. The current builder must be reliable before the generator becomes more powerful.
5. Prefer existing architecture seams from `docs/architecture.md`.
6. User-facing product copy is Indonesian.
7. Developer-facing docs, prompts, logs, errors, tests, and internal copy are English.
8. Do not import or evaluate generated project code in the control-plane app.
9. Do not give generated apps unrestricted backend or shell access.
10. Every phase must produce a review packet before it is considered done.

The roadmap PRD explains why the product exists. This execution spec defines how the work is done.

## Final Release Target

The first release is complete when this end-to-end flow works reliably for beta testers:

1. A user signs in.
2. A user creates a project with an Indonesian prompt.
3. The AI asks guided questions or accepts free-text answers.
4. The workspace shows a build-ready brief.
5. The user starts a build.
6. The workspace streams build progress.
7. The preview renders a business-specific generated website.
8. The user requests one content edit.
9. The user requests one visual edit.
10. The app rebuilds from a source snapshot.
11. A failed rebuild does not hide the latest successful preview.
12. The user publishes a successful build to a public URL.
13. A later failed draft rebuild does not change the public site.
14. The user refreshes the project and sees the same durable state.

The first release is not complete if a user can reach a blank preview, stale build recommendation, fake success state, broken public site after failed rebuild, or unsupported generated app that looks successful.

## MVP Scope Lock

### Required For First Beta

- Guided discussion with build-ready recommendation.
- Stable composer state after refresh.
- Build progress events visible in the workspace.
- Durable source snapshot records.
- Durable build attempt records.
- Durable preview deployment records.
- Runtime event records for build and preview lifecycle.
- Latest-successful preview resolution.
- Failed rebuild recovery while preserving last successful preview.
- Generated app contract validation.
- At least one source-edit loop after initial build.
- Package policy for generated apps.
- Build logs with sanitized display.
- Private preview with explicit failure UI.
- Public publish from successful build only.
- Basic public route for published sites.
- Review matrix across the beta fixture projects.
- Operator-visible limits for build and preview runtime.
- Full local quality gate passing before handoff.

### Allowed But Not Required For First Beta

- Basic custom domain database model.
- Basic custom domain docs.
- Visual comment capture prototype.
- Object storage adapter implementation.
- Separate long-running worker process if a worker-shaped module is enough for local beta.
- Next.js generated app profile if static React profile is already reliable.

### Explicitly Deferred

- Arbitrary user backend code.
- User-provided Dockerfiles.
- User-managed databases inside generated apps.
- FFmpeg or media processing workloads.
- Browser automation workloads such as Playwright/Puppeteer inside generated apps.
- Realtime multiplayer apps.
- Websocket backends generated per user.
- Long-running background workers.
- Native binary dependencies.
- Full code editor parity.
- Automatic payment collection.
- Multi-node runtime scheduling.
- Kubernetes.
- White-label reseller infrastructure.

## Core Architecture Invariants

- UMKM Cepat is one control-plane platform app.
- Each user project is a metadata record plus artifacts and deployments.
- Generated project source is untrusted data.
- Generated project build output is an artifact.
- Generated project runtime is supervised out-of-process when runtime behavior is needed.
- The control-plane app never imports generated source.
- The control-plane app never evaluates generated JavaScript.
- Production Docker socket access does not belong inside the control-plane app.
- Build attempts are append-only evidence of work.
- Failed build attempts are visible, recoverable, and non-destructive.
- Published sites move only through explicit promotion of successful builds.
- Preview can follow draft state, but it must prefer latest successful output by default.
- Public routes and private preview routes have different privacy and cache expectations.

## Primary Seams

Implementation should concentrate behavior behind these seams. Add new seams only when existing seams cannot hold the behavior cleanly.

### Project Workspace Flow

The highest behavior seam. It covers discussion, build recommendation, build start, progress, preview, edit, rebuild, and publish.

Use for:

- Browser tests.
- Integration tests.
- Release review.
- User-visible acceptance criteria.

### Deployment Resolution Policy

Selects which build/deployment powers preview, source inspection, runtime status, and publish.

Use for:

- Unit tests.
- API behavior tests.
- Phase 0 stabilization.

### Generated App Contract

Validates that generated source has the metadata, routes, build command, runtime profile, and capability flags required by the platform.

Use for:

- Unit tests.
- Build preflight.
- Agent tool output checks.

### Agent Tool Runner

Controls AI source edits through narrow tools.

Use for:

- Source editing.
- Package policy enforcement.
- Path boundary enforcement.
- App check discipline.

### Build Worker

Turns source snapshots into build artifacts.

Use for:

- Build queue.
- Logs.
- Timeouts.
- Artifact writing.
- Retry and cancellation.

### Runtime Supervisor

Starts, stops, checks, and resolves generated app deployments.

Use for:

- Preview runtime.
- Public runtime.
- Scale-to-zero.
- Future local process, container, or external sandbox adapters.

## Phase Dependency Graph

```text
P0 Stabilize current builder spine
  -> P1 Generated app contract
  -> P2 Agent tool loop
  -> P3 Build worker
  -> P4 Runtime and preview hardening
  -> P5 Publishing and custom domain foundation
  -> P6 Visual iteration and beta operating loop
```

Allowed parallel work:

- P1 generated app contract can begin after the P0 resolver policy is written, even before all P0 UI polish is complete.
- P5 custom domain data-model planning can run in parallel with P4, but public publish behavior must wait for P4 preview resolution stability.
- P6 visual comment planning can run in parallel with P2, but comment-driven edits must wait for the agent tool loop.

Do not parallelize:

- P2 before P1 contract validation exists.
- P3 before P0 latest-successful behavior exists.
- P5 publish behavior before P0 failed rebuild recovery exists.

## State Machines

### Workspace Composer State

The workspace composer decides whether the user should answer, build, review, or recover.

States:

```text
empty_project
discussing
build_recommended
recommendation_held_for_discussion
build_starting
building
review_ready
editing_with_chat
build_failed_with_last_good
build_failed_without_last_good
preview_failed_with_retry
published_review
```

Transitions:

```text
empty_project -> discussing
discussing -> build_recommended
build_recommended -> build_starting
build_recommended -> recommendation_held_for_discussion
recommendation_held_for_discussion -> discussing
recommendation_held_for_discussion -> build_recommended
build_starting -> building
building -> review_ready
building -> build_failed_with_last_good
building -> build_failed_without_last_good
review_ready -> editing_with_chat
editing_with_chat -> build_recommended
review_ready -> build_starting
review_ready -> published_review
published_review -> editing_with_chat
preview_failed_with_retry -> review_ready
preview_failed_with_retry -> build_failed_with_last_good
```

Rules:

- `build_recommended` hides the normal text composer and shows the build decision UI.
- `recommendation_held_for_discussion` restores chat input for the same recommendation content.
- Refresh preserves `recommendation_held_for_discussion` only while the recommendation content is unchanged.
- Any successful build moves the composer away from `build_recommended` into `review_ready`.
- A failed build with any previous successful preview moves to `build_failed_with_last_good`.
- A failed build with no previous successful preview moves to `build_failed_without_last_good`.
- A preview runtime failure after a successful build moves to `preview_failed_with_retry`, not generic build failure.

### Build Attempt State

States:

```text
queued
running
succeeded
failed
canceled
stale
```

Transitions:

```text
queued -> running
queued -> canceled
running -> succeeded
running -> failed
running -> canceled
running -> stale
stale -> failed
```

Rules:

- `queued` means a build record exists and is waiting for capacity.
- `running` means the build worker owns execution.
- `succeeded` requires an artifact reference and completed timestamp.
- `failed` requires a failure reason safe for display.
- `canceled` means user or system intentionally stopped work.
- `stale` means ownership was lost, usually after worker crash or timeout.
- Only `succeeded` builds can become preview or published deployments.
- A failed attempt can be displayed as latest attempt, but cannot be selected as active preview.

### Deployment State

States:

```text
created
stopped
starting
running
failed
superseded
deleted
```

Transitions:

```text
created -> stopped
created -> starting
stopped -> starting
starting -> running
starting -> failed
running -> stopped
running -> failed
running -> superseded
stopped -> superseded
failed -> starting
failed -> superseded
superseded -> deleted
```

Rules:

- Preview deployments may be superseded by newer successful preview deployments.
- Published deployments are not superseded automatically by draft builds.
- `running` must have runtime target information or serve directly through artifact proxy.
- `failed` must preserve failure detail and not erase the build artifact.
- `deleted` is reserved for explicit cleanup after retention policy.

### Runtime State

States:

```text
not_needed
stopped
starting
running
stale
stopping
failed
disabled
```

Rules:

- Static artifact serving may use `not_needed`.
- Local process preview uses `stopped`, `starting`, `running`, `stale`, `stopping`, and `failed`.
- Test/safe environments may use `disabled`.
- `stale` means the database says running but health check fails.
- A request to a stale runtime should try one recovery start before asking the user to retry.

### Publish State

States:

```text
unpublished
published_live
draft_newer_than_published
publish_failed
domain_pending
domain_live
domain_failed
```

Rules:

- Publishing requires a successful build.
- Publishing is an explicit user action.
- Successful draft builds do not automatically update published output.
- Failed draft builds never update published output.
- Custom domain state is separate from published deployment state.

## Deployment Resolution Policy

### Terms

- Latest attempt: newest build attempt for the project by creation time.
- Latest successful build: newest build with status `succeeded` and artifact reference present.
- Latest failed attempt: newest build with status `failed`, `canceled`, or `stale`.
- Active preview deployment: newest preview deployment attached to a successful build with a valid artifact.
- Active published deployment: published deployment selected by explicit publish or promote action.
- Legacy fallback: transitional `Project` fields used only when no first-class artifact-backed records exist.

### Private Preview

Default selection:

1. Select active preview deployment from successful builds.
2. If none exists, select legacy successful `Project` artifact fallback.
3. If none exists, show build-not-ready UI.
4. If latest attempt failed, display the failure as a notice while keeping the active preview if available.

Never:

- Select a failed build as the preview source.
- Replace active preview with a failed latest attempt.
- Show a blank iframe when the system knows there is no valid artifact.

### Source Inspection

Default selection:

1. Select source snapshot for active preview deployment.
2. If user explicitly opens latest attempt details, show latest attempt source and failure state.
3. If no snapshot exists, show no-source state.

Rules:

- User-facing "current website source" means source for latest successful preview.
- "Latest attempt source" is a separate advanced/debug concept.

### Runtime Status

Response should include both current and latest information:

```ts
type ProjectRuntimeSummary = {
  latestAttempt: BuildAttemptSummary | null;
  latestSuccessfulBuild: BuildSummary | null;
  activePreviewDeployment: DeploymentSummary | null;
  activePublishedDeployment: DeploymentSummary | null;
  runtime: RuntimeSummary | null;
  userFacingState:
    | "not_built"
    | "building"
    | "ready"
    | "ready_with_failed_latest_attempt"
    | "preview_starting"
    | "preview_failed"
    | "build_failed_without_last_good";
};
```

### Publish

Default behavior:

1. Publish only latest successful build unless user explicitly selects an older successful build.
2. Create or update published deployment.
3. Do not publish if only failed attempts exist.
4. Do not change published deployment on draft rebuild.

### Legacy Fallback

Legacy fallback exists only to preserve existing projects while migration completes.

Rules:

- Prefer first-class artifact-backed records whenever they exist.
- Use legacy fields only when no valid snapshot/build/deployment record exists.
- Do not write new behavior that depends on legacy fields as the primary source of truth.
- Add tests proving first-class records win over legacy fields.

## API Contracts

The exact file structure may change. These API contracts define behavior, not implementation location.

### Generate Or Rebuild Project

Endpoint shape:

```text
POST /api/projects/:projectId/generate
```

Request:

```ts
type GenerateProjectRequest = {
  mode: "initial" | "rebuild" | "edit";
  acceptedBriefId?: string;
  userInstruction?: string;
  targetBuildId?: string;
  forceWithAssumptions?: boolean;
};
```

Server behavior:

- Authenticate user.
- Authorize project ownership.
- Check build rate limit.
- Validate brief or explicit assumptions.
- Create source snapshot intent.
- Create build attempt.
- Stream progress events.
- Preserve latest successful deployment on failure.
- Return final build summary.

Progress events:

```ts
type BuildProgressEvent =
  | { type: "queued"; buildId: string }
  | { type: "planning"; message: string }
  | { type: "writing_source"; filesChanged?: number }
  | { type: "validating_contract"; message: string }
  | { type: "installing"; message: string }
  | { type: "building"; message: string }
  | { type: "checking_preview"; message: string }
  | { type: "succeeded"; buildId: string; deploymentId: string }
  | {
      type: "failed";
      buildId: string;
      reason: string;
      lastGoodDeploymentId?: string;
    };
```

Acceptance:

- Failed response includes safe reason and last good preview metadata when available.
- Successful response includes build and preview deployment metadata.
- UI can render progress without parsing prose.

### Runtime Summary

Endpoint shape:

```text
GET /api/projects/:projectId/runtime
```

Response:

```ts
type RuntimeSummaryResponse = {
  projectId: string;
  latestAttempt: BuildAttemptSummary | null;
  latestSuccessfulBuild: BuildSummary | null;
  activePreviewDeployment: DeploymentSummary | null;
  activePublishedDeployment: DeploymentSummary | null;
  userFacingState: string;
  canPreview: boolean;
  canPublish: boolean;
  canRetry: boolean;
  message: string;
};
```

Acceptance:

- Failed latest attempt and active successful preview can both be represented.
- Response does not collapse project state into one ambiguous status string.

### Private Preview

Endpoint shape:

```text
GET /api/projects/:projectId/preview/:path*
```

Behavior:

- Authenticate user.
- Authorize project ownership.
- Resolve active preview deployment.
- Cold-start runtime if needed.
- Proxy runtime output or serve artifact output.
- Return noindex and sandbox-safe headers.
- Return useful preview error UI when resolution fails.

Acceptance:

- Latest failed build does not break preview.
- Missing artifact returns an actionable panel.
- Stale runtime gets one recovery attempt.

### Source Summary

Endpoint shape:

```text
GET /api/projects/:projectId/source
```

Response:

```ts
type SourceSummaryResponse = {
  currentPreviewSource: SourceSnapshotSummary | null;
  latestAttemptSource: SourceSnapshotSummary | null;
  currentBuild: BuildSummary | null;
  latestAttempt: BuildAttemptSummary | null;
  files?: Record<string, string>;
};
```

Acceptance:

- Current preview source remains available after failed rebuild.
- Latest failed attempt can be inspected separately.

### Publish

Endpoint shape:

```text
POST /api/projects/:projectId/publish
```

Request:

```ts
type PublishRequest = {
  buildId?: string;
  deploymentId?: string;
};
```

Behavior:

- Authenticate user.
- Authorize project ownership.
- Select latest successful build when no build is specified.
- Reject failed, running, canceled, or missing-artifact builds.
- Create or update published deployment.
- Return public URL and deployment metadata.

Acceptance:

- Later failed draft rebuild does not change the public URL output.

### Public Site

Endpoint shape:

```text
GET /p/:slug/:path*
```

Behavior:

- Resolve published deployment.
- Serve public output.
- Do not require project owner auth.
- Do not expose private project metadata.
- Return user-friendly 404 when unpublished or deleted.

Acceptance:

- Public route only serves explicit published deployment.

### Agent Edit

Endpoint shape:

```text
POST /api/projects/:projectId/edit
```

Request:

```ts
type EditRequest = {
  instruction: string;
  targetRoute?: string;
  targetElement?: {
    text?: string;
    role?: string;
    selectorHint?: string;
    boundingBox?: { x: number; y: number; width: number; height: number };
  };
};
```

Behavior:

- Authenticate user.
- Authorize project ownership.
- Load current preview source.
- Run agent tool loop.
- Create new source snapshot.
- Trigger build or queue build.
- Preserve previous successful preview until new build succeeds.

Acceptance:

- Agent edits current source, not stale failed-attempt source unless explicitly requested.

## Generated App Contract

Generated apps must include platform metadata. The recommended metadata path is:

```text
.umkmcepat/project.json
```

Schema:

```ts
type UmkmCepatProjectManifest = {
  schemaVersion: "1";
  projectId: string;
  templateId: string;
  templateVersion: string;
  runtimeProfile: "static-react-v1" | "next-light-v1";
  packageManager: "bun";
  installCommand: "bun install";
  buildCommand: string;
  outputDirectory: string;
  entrypoints: {
    preview?: string;
    public?: string;
  };
  routes: Array<{
    path: string;
    title: string;
    purpose: string;
  }>;
  capabilities: {
    staticPages: boolean;
    clientInteractivity: boolean;
    platformForms: boolean;
    platformCatalog: boolean;
    platformBooking: boolean;
    platformPayments: boolean;
    userBackendCode: false;
    nativeBinaries: false;
    backgroundJobs: false;
  };
  platformModules: Array<{
    type:
      | "whatsapp_cta"
      | "location_map"
      | "lead_form"
      | "catalog"
      | "booking_interest"
      | "payment_link_placeholder";
    id: string;
    displayName: string;
  }>;
};
```

### Static React Profile

Required for first beta.

Rules:

- Build output is static files.
- Client-side React is allowed.
- Browser APIs are allowed when safe.
- Node built-ins are not allowed in client source.
- Generated source may not call platform-private APIs directly.
- Platform modules are configured through generated metadata or public-safe config.
- Public site should not require a long-running project process when static artifact serving is enough.

Allowed base dependencies:

- `@vitejs/plugin-react`
- `vite`
- `typescript`
- `react`
- `react-dom`
- `lucide-react`
- `clsx`
- `tailwind-merge`
- `tailwindcss`
- `@tailwindcss/vite`

Conditionally allowed dependencies:

- Radix UI packages when a generated component needs accessible primitives.
- `framer-motion` only if motion is small and nonessential.
- `date-fns` for formatting only.
- Zod only for client-safe validation.

Blocked dependencies:

- `next` in static profile.
- `express`, `fastify`, or server frameworks in static profile.
- `puppeteer`, `playwright`, or browser automation.
- `ffmpeg`, `fluent-ffmpeg`, or media processing packages.
- `sharp` and native image processing packages.
- packages requiring native compilation.
- packages with install scripts not explicitly approved.
- database servers or embedded database engines.
- queue workers or cron packages.

### Next Light Profile

Deferred unless static profile is already reliable.

Rules:

- Must stay within Node.js serverless-style constraints.
- No long-running background jobs.
- No native binaries.
- No arbitrary shell access.
- Platform-owned modules remain preferred over generated backend code.
- Requires stronger runtime supervisor behavior before beta use.

## Operational Limits

Initial beta limits should be configurable through env but start with these defaults.

### User Limits

- Max projects per user: 20.
- Max AI messages per user: use existing AI rate limit defaults.
- Max builds per user per hour: 10.
- Max concurrent builds per user: 1.
- Max running preview deployments per user: 2.

### Global Limits On One VPS

- Max concurrent builds: 2.
- Max running preview deployments: 8.
- Max queued builds: 50.
- Preview idle timeout: 15 minutes.
- Stale build timeout: 5 minutes beyond max build duration.

### Build Limits

- Max build wall time: 180 seconds.
- Max install time: 120 seconds.
- Max app check time: 30 seconds.
- Max displayed log size: 100 KB.
- Max retained raw log size per build: 1 MB.
- Max source snapshot size: 5 MB.
- Max single source file size: 512 KB.
- Max generated source file count: 200.
- Max build artifact size: 25 MB.

### Runtime Limits

- Max static preview cold-start target: 5 seconds on warm disk.
- Max Node runtime cold-start target when introduced: 20 seconds.
- Max runtime memory per preview process: 512 MB target.
- Max CPU per runtime: best-effort local process now, cgroup/container later.
- Public static site should prefer direct artifact serving or cacheable proxy output.

### Failure Handling Limits

- Retry app preview start once per request.
- Do not retry AI generation automatically more than once for repair.
- Do not retry package install indefinitely.
- Do not expose raw build stack traces to consumer-facing UI.

## Work Slices

Each slice below should become one issue or one small group of tightly related issues. A slice is done only when its acceptance criteria and checks pass.

### Slice 00: Confirm Baseline And Add Missing Tests

Dependencies: none.

Scope:

- Confirm current failing states around latest failed build, preview reload, and stale build recommendation.
- Add tests that reproduce the most important known failures before implementation.

Acceptance:

- There is a failing test or documented reproduction for failed rebuild hiding last successful preview.
- There is a failing test or documented reproduction for runtime/source routes selecting failed latest attempt.
- There is a browser reproduction note for stale/blank preview behavior if automated test is not practical yet.

Checks:

- Targeted test command.
- No product behavior change unless needed to make reproduction stable.

### Slice 01: Implement Deployment Resolution Policy

Dependencies: Slice 00.

Scope:

- Create or consolidate policy functions that select latest successful build, active preview deployment, active published deployment, latest attempt, and legacy fallback.
- Use policy in preview, runtime summary, source summary, and publish behavior.

Acceptance:

- Latest failed build does not become active preview.
- Latest failed build does not become publish candidate.
- Legacy fallback works only when no first-class artifact-backed records exist.
- Tests cover first-class success, latest failure, no success, and legacy-only cases.

Checks:

- Unit tests for resolver policy.
- API behavior tests for preview/source/runtime/publish selection.

### Slice 02: Fix Workspace Composer State

Dependencies: Slice 01 can run in parallel after resolver policy shape is known.

Scope:

- Ensure build recommendation hides normal text composer.
- Ensure continue-discussion hold survives refresh for the same recommendation.
- Ensure completed build moves to review state.
- Ensure failed build with last good preview shows recovery state.

Acceptance:

- The user never sees both a primary build decision and an active normal composer unless they chose continue discussion.
- Refresh does not resurrect stale build recommendation after build completion.
- Review state offers preview, edit through chat, publish if eligible, and rebuild.

Checks:

- Component or integration tests for workspace state.
- Browser review at desktop and mobile widths.

### Slice 03: Preview Failure Panels

Dependencies: Slice 01.

Scope:

- Replace ambiguous blank preview states with actionable panels.
- Distinguish not built, building, build failed, preview starting, preview failed, missing artifact, and unauthorized states.

Acceptance:

- Known failure modes render Indonesian user-facing panels.
- Panels include retry action when retry is safe.
- Panels do not show raw stack traces.

Checks:

- Browser review for each state.
- API tests for response status and safe error shape.

### Slice 04: Generated App Manifest Validator

Dependencies: Slice 01.

Scope:

- Define manifest schema and validator.
- Validate generated source before build.
- Add useful failure messages.

Acceptance:

- Missing manifest fails preflight.
- Unsupported runtime profile fails preflight.
- Unsupported capability fails preflight.
- Invalid route metadata fails preflight.

Checks:

- Unit tests for valid and invalid manifests.
- Build preflight test.

### Slice 05: Package Policy

Dependencies: Slice 04.

Scope:

- Define package allowlist/blocklist per runtime profile.
- Inspect generated package manifest before install/build.
- Block dangerous dependencies and postinstall-heavy packages unless explicitly allowed.

Acceptance:

- Static profile blocks server frameworks, browser automation, native binaries, and media processing packages.
- Static profile allows approved base dependencies.
- Failure reason tells the user the app requested unsupported capability.

Checks:

- Unit tests for allowed, blocked, unknown, and conditional packages.

### Slice 06: Source Snapshot Contract

Dependencies: Slice 04.

Scope:

- Ensure generated source snapshots store manifest, files, summary, and origin.
- Ensure source route can return current preview source and latest attempt source separately.

Acceptance:

- A failed rebuild source can be inspected without replacing current preview source.
- Current source points to active preview deployment's snapshot.

Checks:

- API tests.
- Artifact inspection.

### Slice 07: Agent Tool Runner V1

Dependencies: Slices 04, 05, 06.

Scope:

- Implement constrained tools for read, list, search, write, replace, and check app.
- Enforce path boundaries.
- Record tool side effects.
- Prefer structured operations over parsing prose.

Acceptance:

- Agent can modify current preview source.
- Agent cannot write outside project source.
- Agent cannot add blocked packages.
- Agent must run app check or produce visible failure before claiming success.

Checks:

- Unit tests for path safety.
- Integration test for one edit loop.

### Slice 08: Initial Custom Generator Upgrade

Dependencies: Slices 04, 05, 06.

Scope:

- Reduce template feel by generating from brief into source files that satisfy the manifest contract.
- Keep first version constrained to static React profile.
- Preserve current builder behavior until new path is stable.

Acceptance:

- At least five fixture businesses produce noticeably different structure/content.
- Generated sites match brief and pass manifest/package policy.
- No unsupported fake features are present.

Checks:

- Fixture review.
- Build tests.
- Browser visual review.

### Slice 09: Edit Loop From Review State

Dependencies: Slice 07 and either current generator or Slice 08.

Scope:

- Let user request content or visual edits after preview.
- Load active preview source.
- Apply agent edits.
- Create new snapshot and build.

Acceptance:

- Edit request creates a new build attempt.
- Successful edit updates preview.
- Failed edit/build preserves last successful preview.

Checks:

- End-to-end test for one content edit and one visual edit.
- Browser review.

### Slice 10: Build Worker Shape

Dependencies: Slice 01.

Scope:

- Move build execution behind a worker interface.
- The API creates build intent and the worker processes it.
- In local beta, this can be in-process or worker-shaped as long as the interface and records are correct.

Acceptance:

- Build attempt lifecycle is queued -> running -> succeeded/failed.
- Worker crash/stale state can be detected.
- Build concurrency can be bounded.

Checks:

- Unit tests for lifecycle.
- Integration tests for success, failure, timeout.

### Slice 11: Build Logs And Failure Reasons

Dependencies: Slice 10.

Scope:

- Store safe logs.
- Truncate display logs.
- Classify common failures.

Acceptance:

- Missing package, blocked package, compile error, timeout, manifest failure, and artifact write failure have distinct safe reasons.
- Consumer UI sees Indonesian summary.
- Developer logs remain English.

Checks:

- Failure injection tests.
- Log sanitization test.

### Slice 12: Runtime Health And Recovery

Dependencies: Slice 01.

Scope:

- Detect stale runtime processes.
- Retry runtime start once when safe.
- Record runtime events.

Acceptance:

- Stale runtime can recover on request.
- If recovery fails, preview shows retry panel.
- Runtime events explain what happened.

Checks:

- Runtime policy tests.
- Manual local process kill review.

### Slice 13: Idle Cleanup

Dependencies: Slice 12.

Scope:

- Ensure idle preview runtime cleanup works.
- Document scheduler expectation.
- Add operator check.

Acceptance:

- Running preview older than idle timeout stops.
- Recently requested preview stays running.
- Published behavior follows explicit policy.

Checks:

- Targeted runtime idle-stop tests.
- Local command review.

### Slice 14: Publish Promotion Policy

Dependencies: Slice 01.

Scope:

- Publish only successful builds.
- Keep published deployment stable across draft rebuilds.
- Show draft newer than published state.

Acceptance:

- Public URL serves selected successful deployment.
- Failed draft rebuild does not alter public output.
- Successful draft rebuild does not alter public output until promote/publish action.

Checks:

- API tests.
- Browser review.

### Slice 15: Public Route Hardening

Dependencies: Slice 14.

Scope:

- Harden public route behavior and headers.
- Ensure private data is not exposed.
- Ensure public route handles unpublished and missing deployment states.

Acceptance:

- Public route works without auth.
- Public route never exposes private preview metadata.
- Unpublished route returns user-friendly not found.

Checks:

- API route tests.
- Header inspection.

### Slice 16: Custom Domain Foundation

Dependencies: Slice 14.

Scope:

- Add or prepare domain mapping model and resolver policy.
- Document DNS and verification strategy.
- UI can be deferred if not ready for beta.

Acceptance:

- Domain maps to project/published deployment conceptually, not to draft state.
- Verification status is separate from publish status.
- No public DNS automation is required for first beta unless implemented safely.

Checks:

- Data model review.
- Architecture doc update if behavior changes.

### Slice 17: Beta Fixture Harness

Dependencies: Slices 08, 09, 14.

Scope:

- Create repeatable review fixtures for the sample matrix.
- Capture prompts, expected brief, edit requests, and review checklist.

Acceptance:

- An engineer can run or manually execute every fixture without inventing prompts.
- Failures are easy to record.

Checks:

- Fixture documentation review.
- At least two fixtures executed before marking slice done.

### Slice 18: Operator Readiness

Dependencies: Slices 10, 12, 13, 14.

Scope:

- Document deploy, restart, artifact persistence, idle cleanup, and common recovery actions.
- Ensure env defaults match docs.

Acceptance:

- Operator can run beta on one VPS with persistent local directories.
- Operator can identify current builds, deployments, runtime events, and published site.
- Operator can safely restart app and recover previews.

Checks:

- Docs review.
- Local restart review.

### Slice 19: Release Quality Pass

Dependencies: all required slices.

Scope:

- Execute full review matrix.
- Run full quality gate.
- Record beta readiness packet.

Acceptance:

- All blocking gates pass.
- Deferred items are explicitly listed.
- No known release blocker remains.

Checks:

- Full local quality gate.
- Browser evidence.
- Fixture matrix evidence.

## Review Fixtures

Use these exact prompts and expected checks for beta review. Copy them into manual QA notes or automated fixture scripts when those exist.

### Fixture 1: Angkringan

Initial prompt:

```text
Buatkan website untuk jualan angkringan yang punya warung fisik dan mau menerima pesanan lewat WhatsApp.
```

Expected brief:

- Business type: angkringan or local food stall.
- Goal: menu discovery, trust, WhatsApp order, location visit.
- Audience: students, workers, nearby residents.
- Required modules: menu/catalog, WhatsApp CTA, location map.
- Visual direction: warm, local, readable, not generic SaaS.

Required generated output:

- Home route.
- Menu section or page.
- Location/contact section.
- WhatsApp primary CTA.
- No fake online checkout.

Edit request:

```text
Tolong bikin nuansanya lebih merah gelap dan lebih terasa warung malam, tapi tetap mudah dibaca.
```

Failure check:

- Force a failed rebuild or blocked package request.
- Confirm previous angkringan preview remains active.

### Fixture 2: Laundry

Initial prompt:

```text
Buatkan website untuk laundry kiloan dengan layanan antar jemput dan harga yang jelas.
```

Expected brief:

- Business type: laundry.
- Goal: explain services, pricing, pickup intent.
- Audience: families, students, apartment residents.
- Required modules: service list, pricing, WhatsApp CTA, lead/contact form optional.
- Visual direction: clean, fresh, practical.

Required generated output:

- Service cards.
- Pricing table or list.
- Pickup CTA.
- Operating area info.
- No fake payment flow.

Edit request:

```text
Tambahkan bagian kenapa laundry ini aman untuk pakaian kerja dan pakaian bayi.
```

### Fixture 3: Coffee Shop

Initial prompt:

```text
Buat website untuk coffee shop kecil yang ingin menampilkan menu, suasana tempat, dan lokasi.
```

Expected brief:

- Business type: coffee shop.
- Goal: menu, ambience, location.
- Audience: students, remote workers, nearby visitors.
- Required modules: menu/catalog, gallery-like section, map/location, WhatsApp CTA.
- Visual direction: warm, calm, local cafe.

Required generated output:

- Hero with cafe-specific positioning.
- Menu highlights.
- Ambience section.
- Location CTA.

Edit request:

```text
Bikin tampilannya lebih premium tapi jangan terlalu mewah, masih cocok untuk coffee shop kecil.
```

### Fixture 4: Barber Shop

Initial prompt:

```text
Buatkan website untuk barber shop dengan daftar layanan, harga, dan booking lewat WhatsApp.
```

Expected brief:

- Business type: barber shop.
- Goal: services, pricing, WhatsApp booking.
- Audience: men around the area, repeat customers.
- Required modules: service list, price list, WhatsApp CTA, opening hours.
- Visual direction: sharp, confident, simple.

Required generated output:

- Services and prices.
- Booking CTA.
- Opening hours.
- Location/contact.

Edit request:

```text
Tolong bikin bagian harga lebih gampang discan dari HP.
```

### Fixture 5: Fashion Shop

Initial prompt:

```text
Buat website katalog untuk toko fashion lokal yang jual baju wanita dan menerima order lewat WhatsApp.
```

Expected brief:

- Business type: fashion retail.
- Goal: product browsing and WhatsApp order.
- Audience: local fashion buyers.
- Required modules: product catalog, category/filter feel, WhatsApp CTA, size guidance.
- Visual direction: stylish, clean, image-friendly.

Required generated output:

- Product grid.
- Category highlights.
- Size or order guidance.
- WhatsApp CTA.

Edit request:

```text
Bikin katalog produknya terasa lebih rapi dan tidak terlalu seperti template.
```

### Fixture 6: Tutoring Service

Initial prompt:

```text
Buat website untuk tempat les anak SD dan SMP dengan program belajar, jadwal, dan pendaftaran lewat WhatsApp.
```

Expected brief:

- Business type: tutoring service.
- Goal: explain programs, build parent trust, registration intent.
- Audience: parents.
- Required modules: program list, schedule info, trust proof, WhatsApp CTA.
- Visual direction: friendly, credible, organized.

Required generated output:

- Program sections.
- Benefit/trust section.
- Schedule or registration info.
- WhatsApp CTA.

Edit request:

```text
Tambahkan bagian yang bikin orang tua lebih percaya sebelum menghubungi.
```

### Fixture 7: Home Food Business

Initial prompt:

```text
Buat website untuk usaha makanan rumahan yang jual menu harian dan pesanan nasi box.
```

Expected brief:

- Business type: home food business.
- Goal: daily menu, catering/nasi box order, WhatsApp contact.
- Audience: office workers, families, event buyers.
- Required modules: daily menu, nasi box packages, WhatsApp CTA.
- Visual direction: appetizing, homey, trustworthy.

Required generated output:

- Daily menu area.
- Package section.
- Order guidance.
- WhatsApp CTA.

Edit request:

```text
Bikin bagian nasi box lebih menonjol karena itu yang paling menguntungkan.
```

## Phase Review Packet Template

Every phase handoff must include:

```md
## Scope

What changed and what did not change.

## User Impact

Which user-visible behavior is now better.

## Technical Impact

Which seams changed and why.

## Evidence

- Targeted tests:
- Full quality gate:
- Browser review:
- Runtime/build evidence:

## Known Risks

Any remaining risk, with owner and recommended next step.

## Deferred Items

Anything intentionally postponed.
```

## Release Blockers

These block beta release:

- A failed rebuild can hide or replace the latest successful preview.
- Published output can change because of a failed or unpromoted draft build.
- User can see a blank preview without actionable explanation.
- Generated output includes unsupported fake functionality.
- Generated app can use blocked heavy dependencies.
- Generated source can escape project file boundaries.
- Private preview or source route lacks ownership check.
- Build logs expose secrets.
- Runtime supervisor requires public access to internal controls.
- Full quality gate fails.
- No review evidence exists for the fixture matrix.

## Final Beta Checklist

Product:

- [ ] Guided discussion works in Indonesian.
- [ ] Build-ready recommendation is clear.
- [ ] Continue discussion flow works after recommendation.
- [ ] Build progress is visible.
- [ ] Review state appears after build.
- [ ] Edit through chat works at least once.
- [ ] Failed rebuild preserves latest successful preview.
- [ ] Publish works from successful build only.
- [ ] Public URL remains stable across failed draft rebuild.

Generated output:

- [ ] Seven fixtures generate business-specific output.
- [ ] Desktop preview passes manual review.
- [ ] Mobile preview passes manual review.
- [ ] Primary CTA works or points to a safe placeholder.
- [ ] No unsupported fake feature is shipped.
- [ ] No obvious generic filler remains.

Engineering:

- [ ] Resolver policy tests pass.
- [ ] Generated app contract tests pass.
- [ ] Package policy tests pass.
- [ ] Build lifecycle tests pass.
- [ ] Runtime recovery tests pass.
- [ ] Publish policy tests pass.
- [ ] Ownership tests pass.
- [ ] Full quality gate passes.

Operations:

- [ ] VPS deployment docs are current.
- [ ] Persistent local directories are documented.
- [ ] Idle cleanup command is documented.
- [ ] Common failure recovery is documented.
- [ ] Limits are configurable.
- [ ] Secrets are not in docs, logs, commits, screenshots, or client bundles.

## Expected Engineer Handoff

An engineer can start from this spec by doing the following:

1. Read `docs/architecture.md`.
2. Read `docs/deployment.md`.
3. Read `docs/prds/isolated-project-runtime-prd.md`.
4. Read `docs/prds/first-release-generated-app-platform-prd.md`.
5. Read this execution spec.
6. Pick the first incomplete slice.
7. Add or update behavior tests first when the slice changes behavior.
8. Implement the smallest complete change.
9. Run targeted checks.
10. Run full quality gate before handoff.
11. Attach the phase review packet.

No engineer should need this chat history to execute the work.

## Issue Tracker Note

This repo does not currently contain active `docs/agents` issue tracker configuration. Until that setup exists, this spec is the canonical in-repo execution contract. After issue tracker setup, each work slice should become a ready-for-agent issue with the slice acceptance criteria copied verbatim.
