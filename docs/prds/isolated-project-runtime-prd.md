# PRD: Isolated Generated Project Runtime

Status: active
Created: 2026-07-06
Updated: 2026-07-06
Owner: Surya
Scope: generated project source snapshots, build records, deployment records, runtime nodes, runtime supervisor seam, preview/public runtime direction
Read when: changing project generation, generated source/build, preview, publishing, runtime supervision, artifact storage, proxying, Docker/container deployment, or scale-to-zero behavior
Do not read for: routine UI cleanup, auth/profile, legal pages, provider copy, or unrelated Storybook work
Current truth: source code + `docs/architecture.md` + `docs/deployment.md` + this PRD

## Status History

- 2026-07-06: Marked active. Phase 1 runtime foundation began: first-class snapshot/build/deployment/runtime tables, runtime policy helpers, and runtime supervisor interface. The legacy schema/static preview path remains the working preview fallback.
- 2026-07-06: Implemented the first end-to-end runtime slice: local artifact storage, queued/running build lifecycle, local out-of-process static runtime supervisor, preview cold-start proxy, idle-stop runner, published deployment route, runtime status/event APIs, and workspace runtime controls.

## Problem

UMKM Cepat currently generates a schema, turns it into a hardcoded Vite React source tree, builds in a temporary directory, stores source/dist files on `Project`, and serves private preview files directly from Postgres. This proved the workspace and build loop, but it is not the long-term engine for real generated apps.

The platform needs a production-shaped path where generated project code becomes source snapshots, build attempts become auditable records, deployments can run out-of-process, and idle runtimes can stop to save VPS resources. Future generated apps may need runtime processes, but the control-plane Next app must not import generated code or own container orchestration directly in production.

## Target Architecture

UMKM Cepat keeps one platform control plane and introduces separate runtime concepts:

```text
Control Plane  = Next app, auth, workspace, metadata, billing later
Build Plane    = async builders turn source snapshots into artifacts/images
Runtime Plane  = supervisor starts/stops isolated project deployments
Proxy Plane    = preview/public traffic routes to active deployments
Storage Plane  = Postgres metadata + object storage artifacts
```

Core direction:

- The Next app remains the control plane, not a generated-project host.
- Generated source, build, deployment, runtime node, and runtime event are separate concepts.
- Generated project code must run out-of-process when it needs a runtime.
- The platform must never import or evaluate generated project code in the Next.js runtime.
- Per-project runtime containers are allowed only through the build/deployment/runtime-supervisor architecture.
- The web app must not own the Docker socket in production.
- Runtime supervision must sit behind an interface so one VPS can become many runtime nodes later.
- Scale-to-zero is core: idle deployments stop, and traffic can cold-start them later.
- The existing schema renderer and DB-served static preview are legacy/fallback paths while the isolated runtime engine is built.

## Phase 1 Acceptance

Phase 1 is an architecture foundation, not Docker runtime integration.

Required outcome:

1. This PRD is active.
2. `docs/architecture.md` describes the isolated runtime direction without repeating the old "no project containers ever" rule.
3. `docs/deployment.md` documents the current production shape and future supervisor/proxy/container-runtime needs.
4. Prisma has first-class runtime foundation models:
   - `ProjectSnapshot`
   - `ProjectBuild`
   - `ProjectDeployment`
   - `RuntimeNode`
   - `RuntimeEvent`
5. Domain code defines runtime statuses, deployment kinds, node statuses, runtime policy helpers, and a runtime supervisor interface.
6. Existing `/api/projects/[id]/generate` still updates legacy `Project.sourceFiles`, `Project.distFiles`, `Project.buildStatus`, and `Project.buildLog`.
7. Private preview serves artifact-backed deployments through the proxy when available and falls back to legacy `distFiles` only for older projects.
8. The build route creates snapshot/build/deployment/event records and source/dist artifact refs.
9. Runtime policy tests cover idle-stop and node-capacity behavior without Docker.
10. `bun run check` passes.

## Implemented Runtime Design

`ProjectSnapshot` represents source at a point in time. The current implementation keeps inline files for transition and writes `sourceRef` to a local artifact under `PROJECT_ARTIFACT_DIR`.

`ProjectBuild` represents a build attempt for a snapshot. Builds are created as `queued`, moved to `running`, and then finalized as `succeeded`, `failed`, or `canceled`. Successful builds write `artifactRef` to a local dist artifact. The legacy `Project.distFiles` field still stores build output as compatibility fallback.

`ProjectDeployment` represents a preview or published deployment. Preview traffic goes through `/api/projects/[id]/preview/[[...path]]`; published traffic goes through `/p/[slug]/[[...path]]`. Both routes cold-start stopped deployments and proxy to the active runtime target.

`RuntimeNode` represents capacity. The first adapter upserts one `local-process-runtime` node. Multiple nodes can be added later without changing project/build/deployment identity.

`RuntimeEvent` is append-only lifecycle evidence. It records source snapshot creation, build start/success/failure/cancel, deployment creation, runtime start/stop, and deployment failure.

`RuntimeSupervisor` is the runtime boundary. The current adapter materializes a dist artifact to `PROJECT_RUNTIME_DIR` and starts `scripts/runtime-static-server.mjs` as an out-of-process local server. Generated code is never imported into the Next.js control plane.

`bun run runtime:idle-stop` is the scale-to-zero entrypoint. It stops running preview deployments whose `lastRequestAt` is older than the configured idle timeout.

## Remaining Production Work

The implemented adapter proves the product flow, but production should still move container/runtime authority out of the Next app process:

1. Move build execution to a separate worker queue.
2. Move runtime supervision to a sidecar/service if Docker or another container runtime is used.
3. Replace local artifacts with object storage before multi-node runtime work.
4. Add a durable long-running idle worker or scheduler instead of manual/cron invocation.
5. Add custom-domain routing on top of the existing published deployment model.
6. Measure cold start time, RAM, disk, and failure modes on the target VPS.

## Safety Rules

- Generated source is data until built/run by the build or runtime plane.
- Generated code is never imported into the control-plane Next app.
- Runtime containers must be started/stopped through a supervisor boundary.
- Preview/public traffic must be scoped to the owning project/deployment.
- Docker socket, Postgres, Headroom, provider keys, and object storage credentials must not be publicly exposed.
- Failed builds and failed deployments must be visible, retryable, and safe to stop.
- Runtime state must be observable through records and events, not hidden process state.
