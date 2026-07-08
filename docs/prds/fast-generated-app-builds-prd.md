# PRD: Fast Generated App Builds and Near-Instant Preview Feedback

Status: proposed
Created: 2026-07-08
Updated: 2026-07-08
Owner: Surya
Scope: generated app build performance, persistent local build workspaces, dependency install caching, preview feedback speed, runtime prewarming
Read when: changing generated source builds, project build workers, generated app manifests, generated package policy, preview runtime startup, build progress UI, or local/single-node generated app performance
Do not read for: marketing-only landing page copy, auth UI polish, profile settings, legal pages, unrelated Storybook components, or production multi-node runtime supervisor work
Current truth: source code + `docs/architecture.md` + `docs/deployment.md` + `docs/prds/isolated-project-runtime-prd.md` + `docs/prds/concurrent-processing-reliability-prd.md`

## Status History

- 2026-07-08: Proposed after holistic Graphify-backed audit of the current generated app build path and research on fast Vite/React build strategies.

## Problem Statement

UMKM Cepat is not only a landing page generator. The product direction is an AI-generated custom application platform for Indonesian small businesses. Generated projects should be able to grow into real app-like experiences with routes, client state, server-state fetching, forms, dashboards, queues, bookings, attendance, catalog/order flows, lead CRM, and later platform-owned backend modules. The generated frontend stack therefore intentionally uses Vite, React, TanStack Router, TanStack Query, TypeScript, Bun, and constrained package policies. Performance work must not collapse the product back into a landing-only/static-only template system.

The current build path is correct but too cold. Every generated build writes a fresh temporary project directory, writes all files, runs `bun install`, runs the generated `bun run build` command, collects `dist`, writes artifacts, then deletes the temporary directory. This preserves artifact-backed preview correctness, but it discards `node_modules`, install state, filesystem warmth, and any build-adjacent cache on every edit. Users experience this as unnecessary waiting after AI edits files. They see source changes and operation traces, but the iframe preview only updates after a slow build cycle.

From the user's perspective, edits should feel alive. When AI changes app code, the user should quickly see the result in the preview. The product should feel closer to an interactive app builder than a batch job. From the maintainer perspective, the solution must preserve existing safety and architecture invariants: generated code is never imported or evaluated inside the Next.js control plane, preview and publish continue to come from built artifacts, generated package policy remains constrained, and one bad project cannot corrupt another project or the platform.

The goal is to make repeat builds dramatically faster without changing the generated app stack or weakening correctness. The primary target is not true HMR as the canonical path. The primary target is a cached production-build path: persistent local build workspaces, dependency signatures, install skipping, exact source syncing, timing instrumentation, and better preview progress states.

## Solution

UMKM Cepat will keep the existing artifact-backed generated app architecture and optimize the local/single-node build plane.

The optimized flow should become:

```text
AI writes/edits generated files
→ Code/source state updates immediately in the workspace
→ build source is synced into a persistent per-project build workspace
→ dependency signature is checked
→ dependency install is skipped when package/profile inputs are unchanged
→ generated app is built from the warm workspace
→ dist artifact is written as the canonical preview/publish output
→ preview runtime is prewarmed or refreshed after successful build
```

The current flow:

```text
AI writes/edits generated files
→ new temp folder
→ write all files
→ bun install
→ bun run build
→ collect dist
→ delete temp folder
→ preview runtime cold-starts on request
```

The architecture remains:

```text
source snapshot → build attempt → dist artifact → preview deployment → runtime/proxy
```

The performance change is local to how build attempts execute. It should not change generated app capabilities, TanStack usage, source snapshot records, build records, deployment records, artifact refs, preview authorization, or public publish semantics.

Expected conservative impact:

| Case                           | Current |    Optimized target |          Expected gain |
| ------------------------------ | ------: | ------------------: | ---------------------: |
| First project build            |   4–25s |               4–20s |                  0–25% |
| Repeat edit build              |   4–25s |                1–6s |                 50–90% |
| Small edit best case           |    3–8s |            0.8–2.5s |                 60–90% |
| Dependency unchanged install   |   2–15s |         0ms skipped | 100% for install phase |
| Preview cold start after build |  0.2–2s | 0.1–1s if prewarmed |                 25–75% |

These are conservative ranges. Actual numbers must be measured on the target local/VPS environment.

## User Stories

1. As a project owner, I want AI edits to appear in the code view immediately, so that I can see progress before the preview finishes rebuilding.
2. As a project owner, I want the preview to update quickly after a small edit, so that the builder feels interactive.
3. As a project owner, I want repeat edits to skip unnecessary dependency installs, so that I do not wait for the same packages again.
4. As a project owner, I want the previous successful preview to remain visible while a new build runs, so that the workspace never feels blank or broken.
5. As a project owner, I want failed builds to preserve the last successful preview, so that fast rebuilds do not make experimentation unsafe.
6. As a project owner, I want build progress labels to explain what is happening, so that I know whether the system is installing, building, starting preview, or blocked.
7. As a project owner, I want the system to show when dependency install was skipped, so that the speed improvement feels visible and trustworthy.
8. As a project owner, I want a rebuild to recover automatically from a corrupt local cache, so that I do not need to understand build internals.
9. As a project owner, I want a project with many routes to remain supported, so that speed work does not reduce app capability.
10. As a project owner, I want TanStack Router to remain available, so that generated apps can have real navigation.
11. As a project owner, I want TanStack Query to remain available, so that generated apps can later integrate with platform-owned backend modules.
12. As a project owner, I want dashboards, queues, booking flows, attendance flows, catalog/order flows, and other app-like structures to remain possible, so that UMKM Cepat is not limited to landing pages.
13. As a project owner, I want preview output to match what can be published, so that I do not approve something that behaves differently after publish.
14. As a project owner, I want refreshes during build to recover the correct latest state, so that the build cache does not create confusion.
15. As a project owner, I want edits to build from the latest intended source snapshot, so that stale workspaces cannot resurrect deleted files.
16. As a project owner, I want removed files to really disappear from the next build, so that cached workspaces cannot keep ghost routes or components.
17. As a project owner, I want dependency changes to be handled safely, so that adding or removing allowed dependencies does not break future builds.
18. As a project owner, I want unsupported generated dependencies to remain blocked, so that speed does not come from unsafe package freedom.
19. As a project owner, I want a slow first build to become faster on later edits, so that app creation gets smoother over time.
20. As a project owner, I want multiple quick edits to avoid unnecessary duplicate work, so that the preview catches up efficiently.
21. As a project owner, I want build failures to include clear Indonesian messages, so that I know whether to retry or change the instruction.
22. As a beta tester, I want visible timing/progress states, so that I can report whether install, build, artifact write, or runtime start was slow.
23. As a beta tester, I want the preview iframe to refresh only after a successful artifact is ready, so that failed builds do not cause white screens.
24. As a maintainer, I want measured build phase timings, so that optimization decisions are based on evidence.
25. As a maintainer, I want to know how much time was spent in preflight, workspace sync, dependency install, build, dist collection, artifact write, runtime start, and preview-ready wait, so that bottlenecks are visible.
26. As a maintainer, I want install skipping to be tied to a deterministic dependency signature, so that stale dependencies do not corrupt builds.
27. As a maintainer, I want the dependency signature to include package contents, runtime profile, template version, package manager, Bun version, and any lock/profile version that affects install output, so that cache hits are safe.
28. As a maintainer, I want source sync to be exact, so that files removed from a snapshot are removed from the workspace.
29. As a maintainer, I want source sync to preserve only approved cache directories such as `node_modules` and internal build metadata, so that user source cannot leak across builds.
30. As a maintainer, I want generated path safety to run before workspace writes, so that persistent workspaces cannot be used for path traversal.
31. As a maintainer, I want generated package policy to run before install, so that unsafe packages never reach the workspace.
32. As a maintainer, I want manifest validation to run before workspace selection, so that unsupported profiles cannot write arbitrary cache paths.
33. As a maintainer, I want corrupt workspaces to be deleted and retried once, so that transient cache issues self-heal.
34. As a maintainer, I want repeated corrupt workspace failures to surface as failed builds, so that infinite retries do not hide real bugs.
35. As a maintainer, I want build logs to record cache hits and misses, so that support can diagnose slow rebuilds.
36. As a maintainer, I want build cache directories to remain local artifacts ignored by Git, so that generated workspaces are never committed.
37. As a maintainer, I want `.data/project-build-workspaces` documented, so that local/VPS deployments know whether to persist or clean it.
38. As a maintainer, I want cleanup guidance for old workspaces, so that local disk usage does not grow forever.
39. As a maintainer, I want build concurrency to remain bounded, so that multiple expensive builds do not make every preview slower.
40. As a maintainer, I want the build worker to queue or reject cleanly when concurrency is full, so that speed work does not create resource contention.
41. As a maintainer, I want first-build optimizations to be separate from repeat-edit optimizations, so that expectations stay realistic.
42. As a maintainer, I want the generated app stack to remain app-capable, so that performance work does not remove TanStack Router or TanStack Query.
43. As a maintainer, I want optional future fast preview commands to be explicit in the manifest, so that preview and publish semantics are auditable.
44. As a maintainer, I want `vite build`-only preview mode to be considered only after install caching metrics prove TypeScript checking is the remaining bottleneck.
45. As a maintainer, I want any preview-vs-publish build split to be visibly documented and tested, so that users are not misled.
46. As a maintainer, I want a successful preflight build inside the AI repair loop to be reusable when source files have not changed, so that generation does not build the same files twice.
47. As a maintainer, I want file hashes to prove preflight and final source equality before reusing build output, so that stale artifacts are not promoted.
48. As a maintainer, I want runtime prewarming to happen only for active workspace previews, so that the platform does not start runtimes nobody will view.
49. As a maintainer, I want runtime prewarming failures to be non-destructive, so that a good build remains usable even if preview startup is slow.
50. As a maintainer, I want dev server/HMR mode to remain out of the canonical path, so that generated preview remains artifact-backed and publish-equivalent.
51. As a maintainer, I want any future dev server mode to be local-only, opt-in, capped, and clearly non-authoritative, so that it cannot replace build validation by accident.
52. As a platform operator, I want the optimized build cache to work on a single-node local/VPS deployment, so that current infrastructure can get the speed gain.
53. As a platform operator, I want build workspace persistence to be documented separately from source/dist artifact persistence, so that caches can be rebuilt if needed.
54. As a platform operator, I want cache misses and install retries to be observable, so that disk, package, or Bun issues are diagnosable.
55. As a platform operator, I want no generated app build to mount or access platform secrets, so that persistent workspaces do not weaken isolation.
56. As a platform operator, I want build cache cleanup to avoid deleting active workspaces, so that cleanup does not race with builds.
57. As a developer, I want the public `buildGeneratedProject(files)` contract to stay stable initially, so that routes and workers can adopt caching without broad rewrites.
58. As a developer, I want tests for install skipping, package invalidation, exact sync, unsafe path rejection, corrupt cache retry, and dist collection, so that cache correctness is locked down.
59. As a developer, I want existing generated source, package policy, manifest, build worker, runtime artifact, generate route, and edit route tests to keep passing, so that performance work does not break safety.
60. As a developer, I want the PRD to reject landing-only simplifications, so that future agents do not remove app-capable dependencies for speed.
61. As a developer, I want Graphify/source-confirmed seams documented, so that future work starts from the right modules.
62. As a developer, I want the first implementation slice to be small enough to review, so that the optimization does not become a risky rewrite.
63. As a future maintainer, I want residual production/multi-node limitations documented, so that local cache assumptions are not mistaken for distributed build infrastructure.
64. As a future maintainer, I want a clear path to Vite/Rolldown upgrades, so that stack-level build speed can improve without changing product behavior.
65. As a future maintainer, I want an esbuild-only profile treated as a later specialized option, so that the default app-capable Vite/TanStack stack remains intact.

## Implementation Decisions

- The generated app stack must remain app-capable. Do not remove TanStack Router, TanStack Query, TypeScript, Vite, React, or Bun to chase landing-page-only speed.
- The canonical preview and publish path remains built static artifacts served out-of-process. Generated code must not be imported or evaluated inside the Next.js control plane.
- The first optimization target is the build execution strategy, not the generated app architecture. The existing public build function should initially keep the same input/output contract so callers do not need broad rewrites.
- Add build timing instrumentation before or alongside caching. Timings should include preflight validation, workspace selection, source sync, dependency signature check, install, build command, dist collection, artifact write, runtime prewarm/start, and total time.
- Add a local persistent build workspace root. Default should be `.data/project-build-workspaces` or a clearly named env-backed equivalent. The directory must be ignored by Git and treated as rebuildable cache, not canonical source of truth.
- Workspace keys should be derived from validated generated app metadata, not raw user input. At minimum, key by manifest project ID and runtime profile. If future multi-profile or backend-capable profiles exist, include those dimensions.
- Validate generated file paths, manifest, and package policy before syncing or installing in a persistent workspace. Caching must not bypass any current safety gate.
- Source sync must be exact. The workspace source tree should match the generated file list after every build, except for explicitly preserved cache/install directories and internal build metadata. Removed files must be deleted.
- Workspace sync should write changed files only when possible. Content comparison or hashing should prevent needless rewrites while preserving correctness.
- Dependency install should run only when the dependency signature changes or `node_modules` is missing/corrupt. The dependency signature should include normalized `package.json`, runtime profile, template ID/version, package manager, Bun version, and any future lock/profile version that affects dependency output.
- Store build cache metadata inside the workspace under a platform-owned path such as `.umkmcepat/build-cache.json`. Generated agents may own `.umkmcepat/project.json`, but cache metadata should be internal and either excluded from source snapshots or overwritten by the platform.
- If a workspace appears corrupt, the builder should delete the workspace and retry once. A second failure should become a normal failed build with sanitized logs.
- The build log or build metadata should state whether install was skipped, dependency signature changed, cache was hit, cache was reset, and how long each phase took.
- Build concurrency should not be raised until per-build cost is reduced. More simultaneous Vite builds can make user-perceived latency worse on local machines.
- Keep `PROJECT_BUILD_CONCURRENCY` bounded. Later work can replace immediate failure with a local queue/in-progress state, but the first speed slice should focus on reducing repeat build cost.
- Runtime prewarming is allowed after a successful build for the active workspace. It should not change artifact correctness, publish state, or auth rules. Failure to prewarm should not mark the build failed.
- Do not make Vite dev server the default preview mode. Dev server/HMR can be considered later as local-only opt-in debug/experimental mode, capped to one or two active projects, never authoritative for publish.
- Do not switch package managers. Bun is required by project policy and generated manifest policy. The bottleneck is repeated cold installs, not Bun itself.
- Do not add pnpm/npm lockfiles. `bun.lock` remains the canonical platform lockfile, and generated package policy continues to require Bun for generated apps.
- Do not weaken package policy for speed. Allowlisted dependencies and semver-only specifiers remain required.
- Do not change source snapshot, build, deployment, or runtime data model for the first slice unless metrics require storing timing metadata in an existing JSON/log field. Local workspace cache should be an implementation detail.
- If a future manifest supports separate `previewBuildCommand`, it must be explicit, validated, and tested. It should not silently change `buildCommand` semantics.
- Skipping `tsc -b` for preview is not part of the first slice. It may be considered after timing proves TypeScript checking is the remaining bottleneck and after a strict background/publish check policy is designed.
- Reusing a successful build from AI repair/preflight is allowed only if final source file hashes match exactly. Otherwise the route must build again.
- Local build workspaces are single-node optimization. They are not a replacement for future remote build workers, shared artifact storage, or distributed cache infrastructure.
- Documentation must state that build workspaces are rebuildable cache. Source snapshots and dist artifacts remain canonical.
- Generated apps may later call platform-owned backend modules through TanStack Query. This PRD does not implement backend modules, arbitrary generated backend code, or per-project databases.

## Testing Decisions

- Good tests should assert external build behavior and cache correctness: first build installs, repeat build skips install, dependency changes invalidate install, removed files are deleted, unsafe paths are rejected, corrupt workspace retries once, and dist output still matches built artifacts.
- Avoid tests that couple to private helper names unless the helper encodes a safety boundary such as dependency signature or exact source sync.
- Unit tests should cover dependency signature stability. Reordering JSON keys should not change the signature; changing dependencies, devDependencies, runtime profile, template version, package manager, or Bun version should change it.
- Unit tests should cover source sync. Added files should be written, changed files should be updated, unchanged files should not be rewritten when measurable, and removed files should be deleted.
- Unit tests should cover preserved directories. `node_modules` and platform-owned cache metadata may survive sync; generated source files that disappear from the snapshot must not survive.
- Unit tests should cover unsafe paths through the same generated file path policy used today. Persistent workspaces must reject traversal, absolute paths, hidden files outside allowed `.umkmcepat` paths, reserved Windows basenames, `node_modules`, `.data`, `.next`, `.pi`, and `.browser` paths.
- Unit tests should cover install skipping. With same dependency signature and existing `node_modules`, the builder should not call install. With changed signature or missing `node_modules`, it should call install.
- Unit tests should cover corrupt workspace recovery. If build/install fails in a way classified as cache/workspace corruption, the workspace is deleted and retried once. If retry fails, the build fails normally.
- Unit tests should cover timing metadata shape. Timings should be present, numeric, non-negative, and include `installSkipped` or equivalent cache-hit fields.
- Integration-style tests should stub command execution so they can assert command order without running real Bun installs for every test.
- Existing generated source tests must continue to cover manifest missing, package policy failure, unsafe generated paths, build failure, and successful dist collection.
- Existing build worker tests must continue to verify concurrency limit behavior and artifact write failures.
- Existing runtime artifact tests must continue to verify source/dist artifact read/write/materialization and failed-write cleanup.
- Existing generate/edit route tests must continue to verify failed builds do not replace latest successful preview state.
- Add a benchmark or diagnostic command only if it stays lightweight and does not require AI/provider calls. It should build a representative fixture and report phase timing medians.
- Manual QA should include: first generated app build, second edit build with unchanged dependencies, edit that removes a route/component, edit that changes package.json within allowlist, intentionally corrupt workspace then rebuild, and preview refresh after successful build.
- Manual QA should record before/after ranges on the maintainer's local machine. The PRD's target is conservative; actual reported numbers should update docs or implementation notes after measurement.
- Storybook is not required for the build engine itself. UI progress changes should use existing workspace primitives or add stories only if new reusable visual states are introduced.

## Out of Scope

- Removing TanStack Router, TanStack Query, TypeScript, Vite, React, or Bun from the default app-capable generated stack.
- Reducing UMKM Cepat to a landing-page-only generator.
- Arbitrary generated backend code execution.
- Per-project backend containers, per-project databases, or generated server migrations.
- Platform-owned backend modules such as queue, booking, attendance, catalog/order, lead CRM, upload, or notifications. Those are product direction, not part of this build-speed PRD.
- Making Vite dev server/HMR the default preview implementation.
- Public publish from a dev server.
- Importing generated source into the Next.js control plane.
- Evaluating generated JavaScript in the platform runtime.
- Switching to pnpm, npm, or another package manager.
- Adding broad distributed build infrastructure, remote cache, Redis queue, Docker build workers, or multi-node cache coherence in the first implementation.
- Allowing arbitrary packages or unsafe package specifiers for speed.
- Skipping build validation entirely.
- Skipping TypeScript checking for preview in the first slice.
- Replacing artifact-backed preview/publish architecture.
- Optimizing AI provider latency. This PRD only covers post-source build/preview latency.
- Long-term cache analytics dashboards beyond basic timing/log metadata.
- A full code editor/HMR collaboration environment.

## Further Notes

Graphify was refreshed before this PRD:

```bash
bun run graph:update
bun run graph:tree
```

Graphify output is local-only under `graphify-out/` and must not be committed.

Source-confirmed current bottleneck:

```text
buildGeneratedProject(files)
→ validate manifest/package policy
→ create fresh temp dir
→ write every generated file
→ bun install
→ bun run build
→ collect dist
→ delete temp dir
```

The strongest safe optimization is therefore:

```text
buildGeneratedProject(files)
→ validate manifest/package policy
→ resolve persistent workspace
→ exact sync generated files
→ skip install when dependency signature unchanged
→ bun run build
→ collect dist
→ keep workspace for next edit
```

Expected before/after, conservatively:

| Scenario                          | Before |    After |
| --------------------------------- | -----: | -------: |
| First build                       |  4–25s |    4–20s |
| Repeat edit build                 |  4–25s |     1–6s |
| Small edit best case              |   3–8s | 0.8–2.5s |
| Install phase when deps unchanged |  2–15s |      0ms |

The user-facing feeling should shift from:

```text
AI changed files → wait for install/build → preview changes
```

To:

```text
AI changed files → source visible instantly → install skipped → preview updates quickly
```

Recommended first implementation slice:

1. Add build phase timing instrumentation.
2. Add local persistent build workspace root and docs/env placeholder.
3. Add exact source sync preserving `node_modules` and platform cache metadata only.
4. Add dependency signature and install skip.
5. Add workspace corruption reset + retry once.
6. Add tests for signature, sync, install skip, invalidation, unsafe paths, and retry.
7. Add build progress UI text for install skipped/building/preview updating if surfaced by existing route events.
8. Add docs explaining build workspaces are rebuildable cache, not canonical artifacts.

Issue tracker publication was not performed because no issue tracker credentials or command contract were available in this session. Copy this PRD to the tracker with the `ready-for-agent` label when tracker access is available.
