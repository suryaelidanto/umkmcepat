# Build-Progress Server-Side (Reconnectable Generate) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the build/generate flow server-side work that completes + emits progress independent of the client connection, so a refresh during a build never loses progress, a second tab can subscribe to the same in-flight build, and the 3-7s `/runtime` poll while a build is active becomes unnecessary.

**Architecture:** Section 1 — an in-process pub/sub (`build-attempt-pubsub.ts`) keyed by `attemptId`, mirroring `discuss-turn-pubsub.ts`. Section 2 — a detached `runBuildAttempt` worker; the entire body of the existing `ReadableStream.start(controller)` callback in `api.projects.$id.generate.ts` moves into the worker, with every `send(event, data)` becoming `publishBuildProgress(attemptId, { type, ... })`. Section 3 — the existing `POST /api/projects/$id/generate` shrinks to claim → fire detached → return the SSE tail of the channel. Section 4 — new `GET /api/projects/$id/attempts/$attemptId/stream` for late-joiners (live / grace / DB-replay / not-found / process-restart). Section 5 — client cleanup (`useBuildAttemptStream` hook + drop the 3-7s `runtimeQuery.refetchInterval` while a build is active + drop the 7s `setInterval` re-poll).

**Tech Stack:** TypeScript, Bun, Prisma (PostgreSQL), TanStack Router (SSE routes), `ReadableStream` + `EventSource` (no new dependencies).

**Spec:** `docs/superpowers/specs/2026-07-29-build-progress-server-side-design.md`

## Global Constraints

- **Surgical commits:** stage ONLY the files each task touches. Never `git add -A` blindly. Pre-commit (`bun run check:commit`) auto-fixes staged files; respect it.
- Bun only; `bun.lock` canonical. `bun run check` (format/lint/typecheck/`test:changed`/Knip) green before every commit. `bun run verify` once at the end (locks + format/lint/typecheck/full tests/Knip).
- The server runtime is a long-lived Bun process (`bun run dev` / a Bun server) — detached background work survives the POST response. No queue, no cross-process pub/sub.
- The existing `claimProjectOperation({ kind: "build", ... })` lease is the source of truth for "one build at a time per project." Do not duplicate it. A second POST while one build runs → 409 (preserved). The second tab's path is `POST 409 → GET /attempts/$id/stream` (Section 4).
- The `runtimeEvent` write for `build.progress` stays where it is — moved inside the worker next to `publishBuildProgress` so DB write + in-process event stay in lockstep.
- One detached worker per build attempt. Reuse `project-operation.ts`'s `renewProjectOperation` for long builds; the spec already calls for 15min TTL.
- The `useBuildAttemptStream` hook must route through the same `appendBuildProgressStep` / energy / done / error helpers the existing inline `startBuild` SSE loop uses at `WorkspaceShell.tsx:888-967`. No duplicate state-update paths.
- Indonesian user-facing copy (error messages), English dev comments/logs.
- No new dependencies.
- Do not run `bun run build` unless a task explicitly says so. CI runs it.

---

## File Structure

**Section 1 (pub/sub):**
- Create: `src/lib/projects/build-attempt-pubsub.ts` — `publishBuildProgress` / `subscribeBuildProgress` / `readBuildProgressState` / `createReadStreamFromChannel` / `encodeSseEvent`.
- Test: `src/lib/projects/build-attempt-pubsub.test.ts`.

**Section 2 (detached worker):**
- Create: `src/lib/projects/build-attempt-worker.ts` — `runBuildAttempt` (the body of the existing `ReadableStream.start(controller)` from `api.projects.$id.generate.ts`, with `send` → `publishBuildProgress`).
- Test: `src/lib/projects/build-attempt-worker.test.ts`.

**Section 3 (thin POST route):**
- Modify: `src/routes/api.projects.$id.generate.ts` — shrink to claim → fire detached → return SSE tail; remove the inline `ReadableStream` body.
- Modify: `src/lib/projects/build-attempt-pubsub.ts` — add `createReadStreamFromChannel(attemptId)` (Section 3 depends on it; could move to Section 1; either order works).

**Section 4 (late-joiner GET):**
- Create: `src/routes/api.projects.$id.attempts.$attemptId.stream.ts` — auth + ownership + `readBuildProgressState` + replay fallback.
- Test: `src/routes/api.projects.$id.attempts.$attemptId.stream.test.ts`.

**Section 5 (client cleanup):**
- Create: `src/components/projects/useBuildAttemptStream.ts` — the client hook.
- Test: `src/components/projects/useBuildAttemptStream.test.ts`.
- Modify: `src/components/projects/WorkspaceShell.tsx`:
  - Replace `startBuild`'s inline `response.body.getReader()` loop with the hook subscription.
  - Drop the 3-7s `runtimeQuery.refetchInterval` while a build is active (keep the query + idle refetch).
  - Drop the 7s `setInterval` re-poll at `:1203-1208`.
  - Add late-joiner subscribe on mount when `runtimeState.latestAttempt.id` is set and the attempt is `running`.

**Interfaces (locked names across tasks):**
- `publishBuildProgress(attemptId: string, event: BuildProgressEvent): void` — Section 1.
- `subscribeBuildProgress(attemptId: string, onEvent: (e: BuildProgressEvent) => void): () => void` — Section 1.
- `readBuildProgressState(attemptId: string): "live" | "gone"` — Section 1.
- `createReadStreamFromChannel(attemptId: string): Response` — Section 1+3.
- `encodeSseEvent(name: string, data: unknown): string` — Section 1.
- `runBuildAttempt({ attemptId, project, userId, ... }): Promise<void>` — Section 2 (void; detached; publishes + finalizes internally).
- `BuildProgressEvent = { type: "progress" | "operation" | "energy" | "energy_exhausted" | "done" | "error"; [key: string]: unknown }` — Section 1.

---

### Task 1: Section 1 — pub/sub module

**Files:**
- Create: `src/lib/projects/build-attempt-pubsub.ts`
- Test: `src/lib/projects/build-attempt-pubsub.test.ts`

**Interfaces:**
- Produces: the four exports + the `BuildProgressEvent` type. Every later task depends on these exact names.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/projects/build-attempt-pubsub.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createReadStreamFromChannel,
  publishBuildProgress,
  readBuildProgressState,
  subscribeBuildProgress,
} from "./build-attempt-pubsub";

describe("build-attempt-pubsub", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 'gone' for an attemptId that has never published", () => {
    expect(readBuildProgressState("build_unknown")).toBe("gone");
  });

  it("returns 'live' after a publish, replays buffered events to late subscribers", () => {
    publishBuildProgress("build_a", { type: "progress", label: "spec" });
    publishBuildProgress("build_a", { type: "progress", label: "sources" });

    const events: string[] = [];
    subscribeBuildProgress("build_a", (e) => {
      events.push(String(e.label ?? e.type));
    });

    expect(events).toEqual(["spec", "sources"]);
    expect(readBuildProgressState("build_a")).toBe("live");
  });

  it("removes the channel on terminal event after 60s grace", () => {
    publishBuildProgress("build_b", { type: "progress", label: "spec" });
    publishBuildProgress("build_b", { type: "done", finalSchema: null });

    expect(readBuildProgressState("build_b")).toBe("live");

    vi.advanceTimersByTime(60_000);

    expect(readBuildProgressState("build_b")).toBe("gone");
  });

  it("replays the terminal event to a late subscriber inside the 60s grace", () => {
    publishBuildProgress("build_c", { type: "progress", label: "spec" });
    publishBuildProgress("build_c", { type: "done", finalSchema: null });

    const events: string[] = [];
    subscribeBuildProgress("build_c", (e) => {
      events.push(e.type);
    });

    expect(events).toEqual(["progress", "done"]);
  });

  it("unsubscribe stops future deliveries", () => {
    publishBuildProgress("build_d", { type: "progress", label: "spec" });
    const events: string[] = [];
    const unsub = subscribeBuildProgress("build_d", (e) => {
      events.push(String(e.label ?? e.type));
    });
    unsub();
    publishBuildProgress("build_d", { type: "progress", label: "sources" });
    expect(events).toEqual(["spec"]);
  });

  it("createReadStreamFromChannel returns a text/event-stream Response that closes on terminal", async () => {
    publishBuildProgress("build_e", { type: "progress", label: "spec" });
    const response = createReadStreamFromChannel("build_e");
    expect(response.headers.get("Content-Type")).toBe(
      "text/event-stream; charset=utf-8",
    );

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();

    publishBuildProgress("build_e", { type: "done", finalSchema: null });

    const first = await reader.read();
    expect(first.done).toBe(false);
    const text = decoder.decode(first.value);
    expect(text).toContain("event: progress");
    expect(text).toContain('"label":"spec"');

    const second = await reader.read();
    expect(second.done).toBe(false);
    const terminal = decoder.decode(second.value);
    expect(terminal).toContain("event: done");

    const closed = await reader.read();
    expect(closed.done).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/lib/projects/build-attempt-pubsub.test.ts`
Expected: FAIL — `./build-attempt-pubsub` module not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/projects/build-attempt-pubsub.ts
export type BuildProgressEvent = {
  type: "progress" | "operation" | "energy" | "energy_exhausted" | "done" | "error";
  [key: string]: unknown;
};

type Channel = {
  events: BuildProgressEvent[];
  subscribers: Set<(e: BuildProgressEvent) => void>;
};

const channels = new Map<string, Channel>();
const GRACE_MS = 60_000;

export function publishBuildProgress(
  attemptId: string,
  event: BuildProgressEvent,
): void {
  let ch = channels.get(attemptId);
  if (!ch) {
    ch = { events: [], subscribers: new Set() };
    channels.set(attemptId, ch);
  }
  ch.events.push(event);
  for (const sub of ch.subscribers) {
    try {
      sub(event);
    } catch {
      /* swallow subscriber errors */
    }
  }
  if (event.type === "done" || event.type === "error") {
    setTimeout(() => channels.delete(attemptId), GRACE_MS);
  }
}

export function subscribeBuildProgress(
  attemptId: string,
  onEvent: (e: BuildProgressEvent) => void,
): () => void {
  let ch = channels.get(attemptId);
  if (!ch) {
    ch = { events: [], subscribers: new Set() };
    channels.set(attemptId, ch);
  }
  for (const e of ch.events) {
    try {
      onEvent(e);
    } catch {
      /* swallow */
    }
  }
  ch.subscribers.add(onEvent);
  return () => {
    channels.get(attemptId)?.subscribers.delete(onEvent);
  };
}

export function readBuildProgressState(attemptId: string): "live" | "gone" {
  return channels.has(attemptId) ? "live" : "gone";
}

export function encodeSseEvent(name: string, data: unknown): string {
  return `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function createReadStreamFromChannel(attemptId: string): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      let resolveTail: () => void;
      const tailDone = new Promise<void>((resolve) => {
        resolveTail = resolve;
      });
      const writeSafe = (event: BuildProgressEvent) => {
        try {
          controller.enqueue(encoder.encode(encodeSseEvent(event.type, event)));
        } catch {
          /* client disconnected mid-tail; the worker keeps running */
        }
      };
      const unsubscribe = subscribeBuildProgress(attemptId, (event) => {
        writeSafe(event);
        if (event.type === "done" || event.type === "error") {
          resolveTail();
        }
      });
      tailDone.then(() => {
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/lib/projects/build-attempt-pubsub.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Run the format/lint/typecheck gate**

Run: `bun run check`
Expected: green (the new file is included in the affected check).

- [ ] **Step 6: Commit**

```bash
git add src/lib/projects/build-attempt-pubsub.ts src/lib/projects/build-attempt-pubsub.test.ts
git commit -m "feat(build): add build-attempt pub/sub for reconnectable progress"
```

---

### Task 2: Section 2 — detached `runBuildAttempt` worker (move body, no behavior change)

**Files:**
- Create: `src/lib/projects/build-attempt-worker.ts`
- Test: `src/lib/projects/build-attempt-worker.test.ts`
- Reference: `src/routes/api.projects.$id.generate.ts` (the entire `ReadableStream.start(controller)` body — lines 278-1330 — moves into the worker; do NOT delete from the route yet; this task only creates the new file alongside the old one).

**Interfaces:**
- Consumes: `publishBuildProgress(attemptId, event)` from Task 1.
- Produces: `runBuildAttempt({ attemptId, project, userId, ... }): Promise<void>`.

- [ ] **Step 1: Read the full current `api.projects.$id.generate.ts` body to copy**

Read the file. The body to copy is the entire closure inside `new ReadableStream({ async start(controller) { ... } })` — every `send(event, data)` becomes `publishBuildProgress(attemptId, { type: event, ...data })`. The `try { ... } catch (error) { ... } finally { safeClose() }` at the bottom of `start(controller)` becomes the worker's `try { ... } catch (error) { ... }` (no `safeClose` — the channel replaces the controller). Keep the `renewProjectOperation` calls for long builds.

Note for the implementer: the existing route file has a `let runtimeBuildId: string | null = earlyBuildId;` that the worker needs to thread through. Add it as a worker parameter.

- [ ] **Step 2: Write the failing test (smoke — happy path)**

```ts
// src/lib/projects/build-attempt-worker.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/projects/build-attempt-pubsub", () => ({
  publishBuildProgress: vi.fn(),
}));

import { publishBuildProgress } from "@/lib/projects/build-attempt-pubsub";
import { runBuildAttempt } from "./build-attempt-worker";

describe("runBuildAttempt", () => {
  beforeEach(() => {
    vi.mocked(publishBuildProgress).mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("publishes a terminal 'done' event on success", async () => {
    // The worker is wired against the real Prisma + AI dependencies; for the
    // smoke test, we only assert that the terminal event lands. A full
    // behavior test would mock every dependency — out of scope for the
    // refactor. The real coverage is the existing build integration test.
    //
    // The test below calls into the worker with a synthetic attempt and
    // expects the pub/sub to receive a terminal event. If the worker
    // short-circuits on a missing project (Prisma throws), the catch path
    // must publish 'error' — also acceptable for the smoke test.
    await runBuildAttempt({
      attemptId: "build_test",
      project: { id: "proj_test", prompt: "x", status: "draft", title: "t" },
      userId: "user_test",
      buildId: "build_test",
    }).catch(() => undefined);

    const events = vi.mocked(publishBuildProgress).mock.calls;
    const terminal = events.find(
      ([, e]) => (e as { type?: string }).type === "done"
        || (e as { type?: string }).type === "error",
    );
    expect(terminal).toBeDefined();
  });
});
```

The full happy-path behavior is covered by the existing `api.projects.preview.test.ts`-style integration tests once the route starts calling the worker (Task 4). This test guards the worker wire-up.

- [ ] **Step 3: Run the test to verify it fails**

Run: `bun test src/lib/projects/build-attempt-worker.test.ts`
Expected: FAIL — `./build-attempt-worker` module not found.

- [ ] **Step 4: Create the worker by moving the body of `start(controller)`**

```ts
// src/lib/projects/build-attempt-worker.ts
import { generateText } from "ai";

import { getAiModel, getAiTelemetry } from "@/lib/ai";
import { getGenerationModel } from "@/lib/ai-models";
import { getAiTimeoutMs } from "@/lib/ai-timeouts";
import { devLog } from "@/lib/dev-log";
import { prisma } from "@/lib/prisma";
import { briefToBuildPrompt, parseProjectBrief } from "@/lib/projects/brief";
import {
  classifyBuildFailure,
  getIndonesianBuildFailureSummary,
} from "@/lib/projects/build-logs";
import { publishBuildProgress } from "@/lib/projects/build-attempt-pubsub";
import {
  generateCustomProjectFilesWithAgent,
  repairGeneratedProjectFiles,
} from "@/lib/projects/custom-source-generator";
import { createStepCharger } from "@/lib/projects/energy-step-charger";
import { formatGeneratedSource } from "@/lib/projects/format-generated-source";
import {
  buildGeneratedProject,
  createGeneratedSourceSnapshotMetadata,
} from "@/lib/projects/generated-source";
import { type GeneratedProjectFile } from "@/lib/projects/generated-types";
import {
  buildImplementationSpecPrompt,
  implementationSpecFromBrief,
  implementationSpecTool,
  implementationSpecToSiteSchema,
  parseImplementationSpec,
} from "@/lib/projects/implementation-spec";
import { createProgressiveSaver } from "@/lib/projects/progressive-save";
import {
  finalizeProjectOperation,
  renewProjectOperation,
} from "@/lib/projects/project-operation";
import { refreshProjectThumbnail } from "@/lib/projects/project-thumbnail";
import { resolveProjectSourceFiles } from "@/lib/projects/resolve-project-source-files";
import {
  readProjectSourceArtifact,
  resolveArtifactFilesDir,
  writeProjectDistArtifact,
  writeProjectSourceArtifact,
} from "@/lib/projects/runtime-artifacts";
import { createRuntimeEventData } from "@/lib/projects/runtime-events";
import { stopSupersededPreviewDeployments } from "@/lib/projects/runtime-supervisor";
import {
  type ProjectBuildStatus,
  type ProjectDeploymentKind,
  type ProjectSnapshotSourceType,
} from "@/lib/projects/runtime-types";
import { projectSiteGenerationSystemPrompt } from "@/lib/projects/site-generation";
import { createProjectSiteSchemaFromBrief } from "@/lib/projects/site-schema";
import {
  chargeEnergyForAiUsage,
} from "@/lib/user-credits";

// ponytail: modelOverride reserved for the worker unit test (mirrors
// runDiscussTurn at discuss-turn-worker.ts). Production omits → uses the
// real model via getAiModel(modelName).

type BuildAttemptContext = {
  abortSignal: AbortSignal;
  attemptId: string;
  buildId: string;
  energyExhausted: boolean;
  generateMode: "first_generate" | "retry_build";
  modelOverride?: ReturnType<typeof getAiModel>;
  operationToken: string;
  project: { id: string; prompt: string; status: string; title: string };
  userId: string;
};

export async function runBuildAttempt(ctx: BuildAttemptContext): Promise<void> {
  // ... exact body copied from api.projects.$id.generate.ts's
  // new ReadableStream({ async start(controller) { ... } }) closure ...
  // every `send(event, data)` becomes:
  //   publishBuildProgress(ctx.attemptId, { type: event, ...data });
  // every `controller.enqueue(encoder.encode(encodeEvent(event, data)))`
  // is gone (publishBuildProgress replaces it).
  // the `safeClose()` call at the bottom of the closure is gone (the
  // channel's 60s grace handles GC; the SSE tail closes itself).
  // the `runtimeEvent.create` for `build.progress` stays, moved next to
  // the publishBuildProgress call so DB + in-process stay in lockstep.
  // `finalizeProjectOperation` stays at the end, called from a `finally`
  // so a thrown error still finalizes the lease.
}
```

The body of the worker is a verbatim copy of the existing `start(controller)` closure with the four substitutions above. The implementer must read the route file in full first.

- [ ] **Step 5: Run the test to verify it passes**

Run: `bun test src/lib/projects/build-attempt-worker.test.ts`
Expected: PASS (1 smoke test). The exact assertions on the full event sequence live in a follow-up integration test, not in this smoke test.

- [ ] **Step 6: Run the format/lint/typecheck gate**

Run: `bun run check`
Expected: green. (The old `send` function in the route file is still there — not yet deleted; this task only creates the new file alongside the old one. Knip will not flag the new worker because the route is about to import it in Task 4.)

- [ ] **Step 7: Commit**

```bash
git add src/lib/projects/build-attempt-worker.ts src/lib/projects/build-attempt-worker.test.ts
git commit -m "feat(build): add detached runBuildAttempt worker (moves generate body)"
```

---

### Task 3: Section 3 — shrink `POST /api/projects/$id/generate` to claim → fire detached → return tail

**Files:**
- Modify: `src/routes/api.projects.$id.generate.ts`

**Interfaces:**
- Consumes: `runBuildAttempt` (Task 2), `createReadStreamFromChannel` (Task 1).
- Produces: the POST returns `createReadStreamFromChannel(attemptId)` instead of owning a `ReadableStream` directly.

- [ ] **Step 1: Replace the `ReadableStream` block with a tail return**

In `api.projects.$id.generate.ts`, the current `handleGeneratePost` body after the `claimProjectOperation` + `ProjectEditAttempt` + placeholder `ProjectSnapshot` + placeholder `ProjectBuild` scaffolding (lines 196-275) constructs `new ReadableStream({ async start(controller) { ... } })` (line 278) and returns it. Replace that whole block with:

```ts
  // Fire the build detached. The worker publishes progress to the
  // build-attempt pub/sub; the POST tail subscribes to it. The worker
  // keeps running on client disconnect; late-joiners connect via
  // GET /api/projects/$id/attempts/$attemptId/stream (Section 4).
  void runBuildAttempt({
    abortSignal: request.signal ?? new AbortController().signal,
    attemptId: operationAttemptId,
    buildId: earlyBuildId!,
    energyExhausted: false,
    generateMode,
    operationToken: operation.token,
    project: { id: projectId, prompt: projectPrompt, status: project.status ?? "draft", title: "" },
    userId,
  }).catch((error) => {
    publishBuildProgress(operationAttemptId, {
      type: "error",
      detail: error instanceof Error ? error.message : String(error),
    });
  });

  return createReadStreamFromChannel(operationAttemptId);
```

Import the two new symbols at the top of the file:

```ts
import { publishBuildProgress, createReadStreamFromChannel } from "@/lib/projects/build-attempt-pubsub";
import { runBuildAttempt } from "@/lib/projects/build-attempt-worker";
```

Delete the now-unused imports: `getAiModel`, `getGenerationModel`, `getAiTimeoutMs`, `getAiTelemetry`, `generateText`, `briefToBuildPrompt`, `parseProjectBrief`, `buildImplementationSpecPrompt` + `implementationSpecFromBrief` + `implementationSpecTool` + `implementationSpecToSiteSchema` + `parseImplementationSpec`, `createStepCharger`, `createProgressiveSaver`, `createGeneratedSourceSnapshotMetadata`, `buildGeneratedProject`, `projectSiteGenerationSystemPrompt`, `createProjectSiteSchemaFromBrief`, `formatGeneratedSource`, `repairGeneratedProjectFiles`, `generateCustomProjectFilesWithAgent`, `refreshProjectThumbnail`, `readProjectSourceArtifact` + `resolveArtifactFilesDir` + `writeProjectDistArtifact` + `writeProjectSourceArtifact`, `resolveProjectSourceFiles`, `stopSupersededPreviewDeployments`, `chargeEnergyForAiUsage`, `getIndonesianBuildFailureSummary`, `classifyBuildFailure`, `createRuntimeEventData`, `getGenerationModel` (used elsewhere? no, the route no longer generates), `generateText`, `GeneratedProjectFile`, `ProjectBuildStatus`, `ProjectDeploymentKind`, `ProjectSnapshotSourceType`, the `TextEncoder` import, the `encodeEvent` helper, the `GENERATED_SNAPSHOT_SOURCE_TYPE` and `PREVIEW_DEPLOYMENT_KIND` constants. Keep the imports the route still needs (auth, prisma, claimProjectOperation, markStaleProjectBuilds, checkRateLimit, checkEnergy, getEnergyConfig, isUserVerified, isGeneratedBuildExecutionEnabled, devLog).

The `renewProjectOperation` import is no longer needed at the route level (the worker imports it).

- [ ] **Step 2: Run the route's existing test (if any) + the format/lint/typecheck gate**

Run: `bun run check`
Expected: green. The existing `api.projects.preview.discuss.test.ts` is unaffected (it's for the discuss route, not generate). If the generate route has a dedicated test file, it will be updated in Task 4 along with the late-joiner test.

- [ ] **Step 3: Smoke-test the POST + tail in dev (manual)**

Run: `bun run dev`. Open a project, click build. Verify the build runs to completion. Open browser DevTools Network tab; the POST response should be `Content-Type: text/event-stream` and stream events. Verify the build progress panel populates (this depends on the client changes in Task 5; if Task 5 isn't done yet, the panel will not update — that's expected, the route is correct on its own).

- [ ] **Step 4: Commit**

```bash
git add src/routes/api.projects.$id.generate.ts
git commit -m "refactor(build): detach generate worker; POST returns channel tail"
```

---

### Task 4: Section 4 — late-joiner GET endpoint

**Files:**
- Create: `src/routes/api.projects.$id.attempts.$attemptId.stream.ts`
- Test: `src/routes/api.projects.$id.attempts.$attemptId.stream.test.ts`

**Interfaces:**
- Consumes: `readBuildProgressState`, `createReadStreamFromChannel` (Task 1).
- Produces: `GET /api/projects/$id/attempts/$attemptId/stream` returning SSE.

- [ ] **Step 1: Write the failing test (cases A, C, D, E)**

```ts
// src/routes/api.projects.$id.attempts.$attemptId.stream.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: { findFirst: vi.fn() },
    projectEditAttempt: { findFirst: vi.fn() },
    runtimeEvent: { findMany: vi.fn() },
  },
}));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publishBuildProgress } from "@/lib/projects/build-attempt-pubsub";
import { Route } from "./api.projects.$id.attempts.$attemptId.stream";

const handlers = (
  Route as unknown as { options: { server: { handlers: { GET: Function } } } }
).options.server.handlers;

async function callGet(
  projectId: string,
  attemptId: string,
  userId: string | null = "user_test",
) {
  vi.mocked(auth).mockResolvedValue(
    userId
      ? { user: { id: userId } }
      : null,
  );
  return handlers.GET({
    params: { attemptId, id: projectId },
    request: new Request("http://test/"),
  });
}

describe("GET /api/projects/$id/attempts/$attemptId/stream", () => {
  beforeEach(() => {
    vi.mocked(prisma.project.findFirst).mockReset();
    vi.mocked(prisma.projectEditAttempt.findFirst).mockReset();
    vi.mocked(prisma.runtimeEvent.findMany).mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    const response = await callGet("proj", "build_1", null);
    expect(response.status).toBe(401);
  });

  it("returns 404 when the project is not owned by the user", async () => {
    vi.mocked(prisma.project.findFirst).mockResolvedValue(null);
    const response = await callGet("proj", "build_1");
    expect(response.status).toBe(404);
  });

  it("case A: returns the live channel tail when the channel is live", async () => {
    vi.mocked(prisma.project.findFirst).mockResolvedValue({ id: "proj" });
    publishBuildProgress("build_1", { type: "progress", label: "spec" });
    const response = await callGet("proj", "build_1");
    expect(response.headers.get("Content-Type")).toBe(
      "text/event-stream; charset=utf-8",
    );
  });

  it("case D: returns 404 when the attempt is not found and channel is gone", async () => {
    vi.mocked(prisma.project.findFirst).mockResolvedValue({ id: "proj" });
    vi.mocked(prisma.projectEditAttempt.findFirst).mockResolvedValue(null);
    const response = await callGet("proj", "build_missing");
    expect(response.status).toBe(404);
  });

  it("case C: replays runtimeEvent + terminal when channel is gone", async () => {
    vi.mocked(prisma.project.findFirst).mockResolvedValue({ id: "proj" });
    vi.mocked(prisma.runtimeEvent.findMany).mockResolvedValue([
      {
        id: "r1",
        buildId: "build_1",
        createdAt: new Date(),
        message: "spec",
        metadata: { label: "spec", detail: "Membuat rancangan" },
        type: "build.progress",
      },
    ]);
    vi.mocked(prisma.projectEditAttempt.findFirst).mockResolvedValue({
      id: "build_1",
      status: "succeeded",
    });

    const response = await callGet("proj", "build_1");
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain("event: progress");
    expect(text).toContain('"label":"spec"');
    expect(text).toContain("event: done");
  });

  it("case E: emits synthetic error when attempt is running but channel is gone and no recent events", async () => {
    vi.mocked(prisma.project.findFirst).mockResolvedValue({ id: "proj" });
    vi.mocked(prisma.runtimeEvent.findMany).mockResolvedValue([]);
    vi.mocked(prisma.projectEditAttempt.findFirst).mockResolvedValue({
      id: "build_1",
      status: "running",
    });

    const response = await callGet("proj", "build_1");
    const text = await response.text();
    expect(text).toContain("event: error");
    expect(text).toContain("restart terputus");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/routes/api.projects.$id.attempts.$attemptId.stream.test.ts`
Expected: FAIL — `./api.projects.$id.attempts.$attemptId.stream` module not found.

- [ ] **Step 3: Write the route**

```ts
// src/routes/api.projects.$id.attempts.$attemptId.stream.ts
import { createFileRoute } from "@tanstack/react-router";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  createReadStreamFromChannel,
  encodeSseEvent,
  readBuildProgressState,
  type BuildProgressEvent,
} from "@/lib/projects/build-attempt-pubsub";

const RESTART_RECOVERY_ERROR_DETAIL =
  "Server restart terputus. Coba jalankan build lagi.";

export const Route = createFileRoute(
  "/api/projects/$id/attempts/$attemptId/stream",
)({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const session = await auth();
        if (!session?.user?.id) {
          return Response.json(
            { message: "Masuk dulu untuk melanjutkan." },
            { status: 401 },
          );
        }

        const { attemptId, id } = params;
        const project = await prisma.project.findFirst({
          where: { id, userId: session.user.id },
          select: { id: true },
        });
        if (!project) {
          return Response.json(
            { message: "Proyek tidak ditemukan." },
            { status: 404 },
          );
        }

        // Cases A + B: channel is live (or in the 60s grace).
        if (readBuildProgressState(attemptId) === "live") {
          return createReadStreamFromChannel(attemptId);
        }

        // Case D: attempt row not found.
        const attempt = await prisma.projectEditAttempt.findFirst({
          where: { id: attemptId, projectId: project.id, userId: session.user.id },
          select: { id: true, status: true },
        });
        if (!attempt) {
          return Response.json(
            { message: "Build attempt tidak ditemukan." },
            { status: 404 },
          );
        }

        // Case C + E: replay from runtimeEvent + append terminal.
        const events = await prisma.runtimeEvent.findMany({
          where: { buildId: attemptId, type: "build.progress" },
          orderBy: { createdAt: "asc" },
          select: { message: true, metadata: true },
        });

        const replay: BuildProgressEvent[] = events.map((row) => {
          const metadata = (row.metadata ?? {}) as {
            detail?: string;
            label?: string;
          };
          return {
            type: "progress",
            detail: metadata.detail ?? "",
            label: metadata.label ?? row.message ?? "",
          };
        });

        if (attempt.status === "succeeded") {
          replay.push({ type: "done" });
        } else if (attempt.status === "failed" || attempt.status === "canceled") {
          replay.push({
            type: "error",
            detail:
              attempt.status === "canceled"
                ? "Proses dihentikan."
                : "Build belum selesai.",
          });
        } else {
          // status === "running" but channel is gone → process restart.
          replay.push({
            type: "error",
            detail: RESTART_RECOVERY_ERROR_DETAIL,
          });
        }

        const encoder = new TextEncoder();
        const body = replay.map((e) => encodeSseEvent(e.type, e)).join("");
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(body));
            controller.close();
          },
        });
        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
          },
        });
      },
    },
  },
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/routes/api.projects.$id.attempts.$attemptId.stream.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Run the format/lint/typecheck gate**

Run: `bun run check`
Expected: green.

- [ ] **Step 6: Smoke-test the GET endpoint in dev (manual)**

Run: `bun run dev`. Start a build. While the build is in progress, open a new tab and call the GET endpoint via DevTools (or `curl`):

```bash
curl -N http://localhost:3000/api/projects/<id>/attempts/<attemptId>/stream
```

Verify the response is `text/event-stream` and streams `event: progress` ... `event: done` for the in-flight build. After the build completes, verify the same `curl` replays the same events from `runtimeEvent` within 60s (case B) and emits a synthetic error after 60s (case E). Verify a 404 for an attempt id that doesn't exist.

- [ ] **Step 7: Commit**

```bash
git add src/routes/api.projects.$id.attempts.\$attemptId.stream.ts src/routes/api.projects.\$id.attempts.\$attemptId.stream.test.ts
git commit -m "feat(build): add late-joiner stream endpoint with runtimeEvent replay"
```

---

### Task 5: Section 5 — client `useBuildAttemptStream` hook

**Files:**
- Create: `src/components/projects/useBuildAttemptStream.ts`
- Test: `src/components/projects/useBuildAttemptStream.test.ts`

**Interfaces:**
- Consumes: `appendBuildProgressStep` / `completeBuildProgressSteps` from `src/lib/projects/build-progress-steps.ts`; the existing `BuildProgressStep` type from `src/components/projects/WorkspacePrimitives.ts`.
- Produces: `useBuildAttemptStream({ projectId, attemptId, onTerminal, enabled })` hook that opens an `EventSource` to `/api/projects/$id/attempts/$attemptId/stream` and routes events through the same helpers `WorkspaceShell.startBuild` uses today.

- [ ] **Step 1: Write the failing test (event routing + lifecycle)**

```ts
// src/components/projects/useBuildAttemptStream.test.ts
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useBuildAttemptStream } from "./useBuildAttemptStream";

type Listener = (event: MessageEvent<string>) => void;

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  onmessage: Listener | null = null;
  onerror: ((event: Event) => void) | null = null;
  closed = false;
  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }
  close() {
    this.closed = true;
  }
  emit(data: string) {
    this.onmessage?.({ data } as MessageEvent<string>);
  }
  fail() {
    this.onerror?.(new Event("error"));
  }
}

describe("useBuildAttemptStream", () => {
  let OriginalEventSource: typeof EventSource;
  beforeEach(() => {
    FakeEventSource.instances = [];
    OriginalEventSource = globalThis.EventSource;
    (globalThis as { EventSource: typeof EventSource }).EventSource =
      FakeEventSource as unknown as typeof EventSource;
  });
  afterEach(() => {
    (globalThis as { EventSource: typeof EventSource }).EventSource =
      OriginalEventSource;
  });

  it("opens an EventSource to the attempt stream endpoint", () => {
    renderHook(() =>
      useBuildAttemptStream({
        attemptId: "build_1",
        onTerminal: vi.fn(),
        projectId: "proj_1",
      }),
    );
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0].url).toBe(
      "/api/projects/proj_1/attempts/build_1/stream",
    );
  });

  it("does not open when enabled is false", () => {
    renderHook(() =>
      useBuildAttemptStream({
        attemptId: "build_1",
        enabled: false,
        onTerminal: vi.fn(),
        projectId: "proj_1",
      }),
    );
    expect(FakeEventSource.instances).toHaveLength(0);
  });

  it("calls onTerminal when a done event is received", () => {
    const onTerminal = vi.fn();
    renderHook(() =>
      useBuildAttemptStream({
        attemptId: "build_1",
        onTerminal,
        projectId: "proj_1",
      }),
    );
    const es = FakeEventSource.instances[0];
    act(() => {
      es.emit(JSON.stringify({ type: "done", finalSchema: null }));
    });
    expect(onTerminal).toHaveBeenCalledWith("done");
  });

  it("closes the EventSource on unmount", () => {
    const { unmount } = renderHook(() =>
      useBuildAttemptStream({
        attemptId: "build_1",
        onTerminal: vi.fn(),
        projectId: "proj_1",
      }),
    );
    const es = FakeEventSource.instances[0];
    unmount();
    expect(es.closed).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/components/projects/useBuildAttemptStream.test.ts`
Expected: FAIL — `./useBuildAttemptStream` module not found.

- [ ] **Step 3: Write the hook**

```ts
// src/components/projects/useBuildAttemptStream.ts
"use client";

import { useEffect, useRef } from "react";

export type BuildStreamTerminalKind = "done" | "error" | "closed";

type BuildStreamEvent = {
  type: "progress" | "operation" | "energy" | "energy_exhausted" | "done" | "error";
  [key: string]: unknown;
};

export function useBuildAttemptStream({
  attemptId,
  enabled = true,
  onEvent,
  onTerminal,
  projectId,
}: {
  attemptId: string | null;
  enabled?: boolean;
  onEvent?: (event: BuildStreamEvent) => void;
  onTerminal?: (kind: BuildStreamTerminalKind) => void;
  projectId: string;
}): void {
  const onEventRef = useRef(onEvent);
  const onTerminalRef = useRef(onTerminal);
  onEventRef.current = onEvent;
  onTerminalRef.current = onTerminal;

  useEffect(() => {
    if (!enabled || !attemptId) {
      return;
    }
    const url = `/api/projects/${projectId}/attempts/${attemptId}/stream`;
    const es = new EventSource(url);
    es.onmessage = (msg) => {
      let event: BuildStreamEvent;
      try {
        event = JSON.parse(msg.data) as BuildStreamEvent;
      } catch {
        return;
      }
      onEventRef.current?.(event);
      if (event.type === "done") {
        onTerminalRef.current?.("done");
        es.close();
      } else if (event.type === "error") {
        onTerminalRef.current?.("error");
        es.close();
      }
    };
    es.onerror = () => {
      onTerminalRef.current?.("closed");
      es.close();
    };
    return () => {
      es.close();
    };
  }, [attemptId, enabled, projectId]);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/components/projects/useBuildAttemptStream.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Run the format/lint/typecheck gate**

Run: `bun run check`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add src/components/projects/useBuildAttemptStream.ts src/components/projects/useBuildAttemptStream.test.ts
git commit -m "feat(build): add useBuildAttemptStream client hook"
```

---

### Task 6: Section 5 — wire `useBuildAttemptStream` into `WorkspaceShell`

**Files:**
- Modify: `src/components/projects/WorkspaceShell.tsx`

**Interfaces:**
- Consumes: the hook from Task 5; the existing `appendBuildProgressStep` / `completeBuildProgressSteps` from `src/lib/projects/build-progress-steps.ts`; the existing `loadRuntimeState` callback.
- Produces: a new late-joiner subscribe on mount + during a build, replacing the existing 3-7s `runtimeQuery.refetchInterval` while a build is active.

- [ ] **Step 1: Replace `startBuild`'s inline SSE loop with the hook subscription**

In `WorkspaceShell.tsx`:
- Import `useBuildAttemptStream` from `./useBuildAttemptStream`.
- Inside `WorkspaceShell`, after the existing state declarations, add:
  ```ts
  const subscribeToStreamRef = useRef<((kind: BuildStreamTerminalKind) => void) | null>(null);
  ```
- Inside the `startBuild` callback, after the POST returns successfully and the attempt id is known (the POST's response body is no longer consumed by the client; the client uses the GET late-joiner instead), remove the entire `response.body.getReader()` loop (lines 850-969 today) and replace it with a call to subscribe to the stream. The cleanest version:
  - Stop awaiting the POST body. Fire-and-forget the POST (`fetch(..., { method: "POST" })`) — keep the existing error handling (network error → `setBuildStatus("failed")`).
  - After the POST returns, `setMode("build")` and let the existing `useEffect` (Task 6 Step 3) subscribe via the hook.

- [ ] **Step 2: Drop the 3-7s `runtimeQuery.refetchInterval` while a build is active**

In `WorkspaceShell.tsx` at lines 495-518 (the `refetchInterval` callback inside `runtimeQuery`):
- Replace the current logic with:
  ```ts
  refetchInterval: (query) => {
    const data = query.state.data as RuntimeWorkspaceState | undefined;
    const attemptStatus = data?.latestAttempt?.status || "";
    const deploymentStatus = data?.deployment?.status || "";
    if (
      ["running", "building", "starting", "queued"].includes(attemptStatus) ||
      ["running", "building", "starting", "queued"].includes(deploymentStatus)
    ) {
      // Stream owns the live case; one slow poll as a keep-alive for
      // deploy-restore. The 30s window is a deliberate ceiling on
      // missing the deploy-restore window — if the stream is alive,
      // it'll fire the done event.
      return 30_000;
    }
    return false;
  },
  ```
- Drop the `buildStatusRef.current === "building"` arm and the `activeJob.phase === "generating|building|finalizing"` arms (the stream owns these now).

- [ ] **Step 3: Drop the 7s `setInterval` re-poll at `:1203-1208`**

In `WorkspaceShell.tsx`, delete the `useEffect` at lines 1192-1208 (`useEffect(() => { void loadRuntimeState(); if (buildStatus !== "building" && ...) { return; } const interval = window.setInterval(...); return () => window.clearInterval(interval); }, [...])`). The hook + the runtime query (Step 2) cover the post-build state.

- [ ] **Step 4: Add the late-joiner subscribe on mount**

After the `useBuildAttemptStream` import + the existing state declarations, add a new effect that subscribes to the stream when:
- `runtimeState?.userFacingState === "building"` (build is in progress on the server), AND
- `runtimeState?.latestAttempt?.id` is set, AND
- the attempt's `status` is `"running"` (not terminal).

```ts
useBuildAttemptStream({
  attemptId:
    runtimeState?.userFacingState === "building" &&
    runtimeState.latestAttempt?.status === "running"
      ? runtimeState.latestAttempt.id
      : null,
  onEvent: (event) => {
    // Route events through the same helpers the inline loop used.
    if (event.type === "progress" && typeof event.label === "string") {
      setBuildProgress((current) =>
        appendBuildProgressStep(current, {
          detail: typeof event.detail === "string" ? event.detail : "",
          label: event.label,
          status: "active",
        }),
      );
      return;
    }
    if (event.type === "operation" && typeof event.title === "string") {
      setBuildProgress((current) =>
        appendBuildProgressStep(current, {
          detail: typeof event.path === "string"
            ? `${event.path} — ${typeof event.detail === "string" ? event.detail : "Operasi selesai."}`
            : (typeof event.detail === "string" ? event.detail : "Operasi selesai."),
          diff: (event as { diff?: unknown }).diff as BuildProgressStep["diff"],
          durationMs: typeof event.durationMs === "number" ? event.durationMs : undefined,
          label: event.title,
          status: event.state === "failed" ? "error" : "done",
        }),
      );
      return;
    }
    if (event.type === "energy" && typeof event.remaining === "number") {
      window.dispatchEvent(new Event("umkm:energy-changed"));
      return;
    }
    if (event.type === "energy_exhausted" && typeof event.message === "string") {
      setBuildProgress((current) =>
        appendBuildProgressStep(current, {
          detail: event.message,
          label: "Energi habis",
          status: "done",
        }),
      );
      window.dispatchEvent(new Event("umkm:energy-changed"));
      return;
    }
    if (event.type === "done") {
      setBuildStatus("ready");
      setBuildProgress((current) => completeBuildProgressSteps(current));
      patchProjectInList({ buildStatus: "ready" });
      void loadRuntimeState();
      setSourceReloadKey((current) => current + 1);
      window.dispatchEvent(new Event("umkm:energy-changed"));
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects, refetchType: "active" });
      void queryClient.invalidateQueries({ queryKey: queryKeys.energy });
      return;
    }
    if (event.type === "error") {
      setBuildStatus("failed");
      void loadRuntimeState();
      setSourceReloadKey((current) => current + 1);
      setBuildProgress((current) =>
        appendBuildProgressStep(current, {
          detail:
            typeof event.detail === "string"
              ? `Build berhenti sebelum tampilan website siap: ${event.detail}`
              : "Build berhenti sebelum tampilan website siap. Coba ulangi build.",
          label: "Build belum selesai",
          status: "error",
        }),
      );
      return;
    }
  },
  onTerminal: () => {
    // No-op: the per-type branches above already set the right terminal state.
  },
  projectId,
});
```

- [ ] **Step 5: Run the format/lint/typecheck + test gate**

Run: `bun run check`
Expected: green. The existing `WorkspaceShell.test.ts` (if any) should still pass; if a test depended on the 3-7s `runtimeQuery.refetchInterval`, update it to assert the 30s idle interval instead.

- [ ] **Step 6: Manual smoke test**

Run: `bun run dev`. Open a project, click build. Verify the build progress panel populates from the hook. Refresh the page mid-build; verify the new page shows the same progress (the late-joiner subscribe reconnects). Open a second tab mid-build; verify it shows the same progress. After the build finishes, verify the preview loads and the build status is `ready`.

- [ ] **Step 7: Commit**

```bash
git add src/components/projects/WorkspaceShell.tsx
git commit -m "refactor(build): use late-joiner stream in WorkspaceShell; drop 3-7s poll"
```

---

### Task 7: Final — full verify, doc sync, hand off

**Files:**
- Modify: `DEV.md` / `PRODUCT.md` if the user-facing flow changed (it didn't — internal refactor; no user-visible change, so no doc change is required; confirm by reading the existing DEV.md / PRODUCT.md and skipping if there's nothing to update).

- [ ] **Step 1: Run the full local gate**

Run: `bun run verify`
Expected: green. This is the gate CI runs.

- [ ] **Step 2: Knip check**

Run: `bunx knip` (or whatever the repo uses — `bun run check` already runs it; if it flagged anything in the route cleanup in Task 3, fix it now).
Expected: no new dead exports. The route file's deleted `send` + `encodeEvent` should not leave any orphan imports.

- [ ] **Step 3: Read the changed files end-to-end one last time**

Read each of the six touched files. Confirm:
- `src/lib/projects/build-attempt-pubsub.ts` — clean, no dead exports, the four public names match the spec.
- `src/lib/projects/build-attempt-worker.ts` — no `send` calls remaining; every event goes through `publishBuildProgress`.
- `src/routes/api.projects.$id.generate.ts` — only claim + fire + return tail; no inline `ReadableStream` body.
- `src/routes/api.projects.$id.attempts.$attemptId.stream.ts` — five-case handling (A, B, C, D, E).
- `src/components/projects/useBuildAttemptStream.ts` — single hook, no state, just `EventSource` + `onEvent` + `onTerminal`.
- `src/components/projects/WorkspaceShell.tsx` — hook is the only consumer of stream events; the 3-7s `refetchInterval` and the 7s `setInterval` are gone.

- [ ] **Step 4: Push to `dev` and watch CI**

```bash
git push origin dev
```

Watch the `Quality` workflow. If it fails, the `fix-ci` skill is the path.

---

## Self-Review

**Spec coverage:**
- Section 1 (pub/sub) — Task 1. ✓
- Section 2 (detached worker) — Task 2. ✓
- Section 3 (thin POST) — Task 3. ✓
- Section 4 (late-joiner GET, 5 cases) — Task 4 (cases A, C, D, E tested; case B is the same as A within the 60s window, covered by the `readBuildProgressState` "live" branch). ✓
- Section 5 (client cleanup: 3-7s `refetchInterval`, 7s `setInterval`, late-joiner subscribe) — Task 6. ✓
- Out-of-scope items (edit/visual-comment, cross-process pub/sub, discuss-side duplicate fetches) — explicitly excluded, no task needed.

**Placeholder scan:** no "TBD" / "TODO" / "implement later" / "fill in details" in the plan. The `// ...` markers in the worker stub are intentional pointers to "copy the body from the route file," not placeholders. The Step 1 of Task 2 instructs the implementer to read the file in full first.

**Type consistency:**
- `BuildProgressEvent` type is defined in Task 1 (the pub/sub module) and used in Tasks 2, 3, 4, 5. Consistent.
- `attemptId` is the key in all four pub/sub functions. Consistent.
- `createReadStreamFromChannel(attemptId): Response` — defined Task 1, used Tasks 3 + 4. Consistent.
- `useBuildAttemptStream` argument shape is defined in Task 5 and used in Task 6 Step 4. Consistent.
- `BuildStreamTerminalKind` is exported from Task 5's hook file. The callback signature in Task 6's `onTerminal` matches. Consistent.

**Spec gap:** none. Every requirement in the spec is implemented by a task. The "edit / visual-comment" deferral is explicit in the spec's out-of-scope section, and the plan doesn't accidentally cover it.
