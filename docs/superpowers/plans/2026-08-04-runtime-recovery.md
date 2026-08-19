# Runtime Recovery (Self-Heal + Owner Restart) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A preview whose on-disk serving copy (docroot) is deleted self-heals on the next page load by re-materializing the S3 dist, and the project owner can explicitly restart a preview from the UI.

**Architecture:** Two recovery layers share one primitive — `startDeployment`, which already re-materializes the S3 dist. (1) Fix the health check so a 404 on the health path marks the deployment stopped, which makes the proxy auto-restart on the next request (no user action, no cron). (2) Add an owner-only `POST /api/projects/:id/restart` endpoint and wire the existing `recoverPreviewRuntime` hook to call it. Security is enforced by `verifyProjectOwnership`; full AI rebuilds stay owner-only via the existing `/generate` gate.

**Tech Stack:** Bun, TypeScript, TanStack Start file routes, Vitest, Node's built-in `node:http` test server.

## Global Constraints

- Use Bun only; keep `bun.lock` as the canonical lockfile.
- Keep changes small, focused, and easy to review.
- User-facing product UI copy uses Indonesian; developer-facing docs/code/logs/errors use English.
- Do not add dependencies.
- Do not change the full-rebuild flow (`/api/projects/:id/generate`) or its owner gate.
- Do not spend AI credits on recovery; re-materialization only reads existing S3 artifacts.
- Before handoff, run `bun run check` explicitly.
- Docs are part of the change: update `DEV.md` and `2026-07-27-rustfs-local-s3-design.md` in the same diff.

---

## File Structure

- Modify: `src/lib/projects/runtime-supervisor.ts`
  - Change `isRuntimeReachable` to treat a 404 health response as unhealthy.
- Modify: `src/lib/projects/runtime-supervisor.test.ts`
  - Add a test: running deployment whose docroot is deleted → `getDeploymentStatus` returns `stopped`.
- Create: `src/routes/api.projects.$id.restart.ts`
  - Owner-only POST that stops then starts the active preview deployment.
- Create: `tests/routes/projects.id.restart.test.ts`
  - Tests for auth, ownership, and stop+start behavior.
- Modify: `src/components/projects/WorkspaceShell.tsx`
  - Change `recoverPreviewRuntime` to call `/restart` then reload runtime state.
- Modify: `src/components/projects/WorkspacePrimitives.tsx`
  - Add a "Mulai ulang tampilan" button to `PreviewIssueState`.
- Modify: `src/components/projects/WorkspacePrimitives.test.ts`
  - Add a copy test for the new button.
- Modify: `DEV.md`, `docs/superpowers/specs/2026-07-27-rustfs-local-s3-design.md`
  - Document the self-heal and manual-restart behavior.

---

### Task 1: Health check treats a 404 as unhealthy

**Files:**
- Modify: `src/lib/projects/runtime-supervisor.ts:454-461`
- Modify: `src/lib/projects/runtime-supervisor.test.ts`

**Interfaces:**
- Consumes: `fetchRuntime(url, { kind: "health" })` returns a `Response`.
- Produces: no exported signature change. Behavior change: `isRuntimeReachable` returns `false` for a `404` health response.

- [ ] **Step 1: Write the failing test**

In `src/lib/projects/runtime-supervisor.test.ts`, add this `it` block inside the existing `describe("noop runtime supervisor", ...)` (after the test `"starts and stops a generated dist artifact in a local runtime process"`, still inside that describe). It reuses the same `writeProjectDistArtifact`, `tempDir`, `prisma`, and `createLocalProcessRuntimeSupervisor` pattern already present in that test:

```ts
it("marks a running deployment stopped when its serving docroot is deleted (404 health)", async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "umkmcepat-runtime-"));
  const artifactRef = await writeProjectDistArtifact({
    artifactId: "build_404",
    files: [
      {
        content: "<h1>Runtime preview</h1>",
        contentType: "text/html; charset=utf-8",
        path: "index.html",
      },
    ],
  });
  let deployment = {
    build: { artifactRef },
    containerName: null as string | null,
    id: "deployment_404",
    internalUrl: null as string | null,
    projectId: "project_404",
    runtimeNodeId: null as string | null,
    status: "created",
  };
  const prisma = {
    projectDeployment: {
      findUnique: vi.fn(async () => deployment),
      update: vi.fn(async (input: unknown) => {
        const data = (input as { data: Partial<typeof deployment> }).data;
        deployment = { ...deployment, ...data };
        return deployment;
      }),
    },
    runtimeEvent: { create: vi.fn(async () => ({ id: "event_404" })) },
    runtimeNode: { upsert: vi.fn(async () => ({ id: "node_404" })) },
  };
  const supervisor = createLocalProcessRuntimeSupervisor({
    prisma,
    runtimeRootDir: path.join(tempDir, "runtime"),
  });

  try {
    await expect(supervisor.startDeployment("deployment_404")).resolves.toBe(
      "running",
    );
    expect(deployment.status).toBe("running");

    // Delete the docroot the static server reads, simulating a removed
    // project-runtimes directory.
    await rm(path.join(tempDir, "runtime", "deployment_404"), {
      force: true,
      recursive: true,
    });

    // The health probe now hits a 404 from an empty docroot, which must be
    // treated as unhealthy so the deployment is marked stopped.
    await expect(
      supervisor.getDeploymentStatus("deployment_404"),
    ).resolves.toBe("stopped");
    expect(deployment.status).toBe("stopped");
  } finally {
    await supervisor.stopDeployment("deployment_404").catch(() => "stopped");
  }
}, 30_000);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/lib/projects/runtime-supervisor.test.ts`
Expected: the new test FAILS — `getDeploymentStatus` resolves to `"running"` (the 404 is treated as healthy) instead of `"stopped"`.

- [ ] **Step 3: Implement the minimal fix**

In `src/lib/projects/runtime-supervisor.ts`, change `isRuntimeReachable`:

```ts
async function isRuntimeReachable(internalUrl: string) {
  try {
    const response = await fetchRuntime(internalUrl, { kind: "health" });
    // A healthy preview never 404s its own root: the static server always
    // resolves "/" to index.html. A 404 here means the serving docroot is
    // gone (e.g. the project-runtimes dir was removed), so treat it as
    // unhealthy so the deployment is marked stopped and re-materialized.
    return response.status < 500 && response.status !== 404;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/lib/projects/runtime-supervisor.test.ts`
Expected: all tests PASS, including the new 404 test.

- [ ] **Step 5: Commit**

```bash
git add src/lib/projects/runtime-supervisor.ts src/lib/projects/runtime-supervisor.test.ts
git commit -m "fix(runtime): treat 404 health probe as unhealthy so deleted docroots self-heal"
```

---

### Task 2: Owner-only restart endpoint

**Files:**
- Create: `src/routes/api.projects.$id.restart.ts`
- Create: `tests/routes/projects.id.restart.test.ts`

**Interfaces:**
- Consumes: `auth()` (from `@/lib/auth/auth`), `verifyProjectOwnership(id, userId)` (from `@/middleware/ownership`), `getRuntimeSupervisor()` (from `@/lib/projects/runtime-supervisor`), `prisma` (from `@/lib/prisma`).
- Produces: `POST /api/projects/:id/restart` → `{ ok: true }` (200), `{ message }` (401/404).

- [ ] **Step 1: Write the failing route test**

Create `tests/routes/projects.id.restart.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authMock,
  prismaProjectDeploymentFindFirstMock,
  prismaProjectFindFirstMock,
  startDeploymentMock,
  stopDeploymentMock,
} = vi.hoisted(() => ({
  authMock: vi.fn<() => Promise<unknown>>(),
  prismaProjectDeploymentFindFirstMock: vi.fn(),
  prismaProjectFindFirstMock: vi.fn(),
  startDeploymentMock: vi.fn(async () => "running" as const),
  stopDeploymentMock: vi.fn(async () => "stopped" as const),
}));

vi.mock("@/lib/auth/auth", () => ({ auth: authMock }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: { findFirst: prismaProjectFindFirstMock },
    projectDeployment: { findFirst: prismaProjectDeploymentFindFirstMock },
  },
}));
vi.mock("@/lib/projects/runtime-supervisor", () => ({
  getRuntimeSupervisor: () => ({
    startDeployment: startDeploymentMock,
    stopDeployment: stopDeploymentMock,
  }),
}));

import { getHandler } from "./_handler";

import { Route } from "@/routes/api.projects.$id.restart";

const POST = getHandler(Route, "POST");

describe("project restart route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: "user_1" } });
  });

  it("returns 401 without a session", async () => {
    authMock.mockResolvedValue(null);
    const res = await POST(undefined, { id: "project_1" });
    expect(res.status).toBe(401);
    expect(startDeploymentMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the caller is not the owner", async () => {
    prismaProjectFindFirstMock.mockResolvedValue(null);
    const res = await POST(undefined, { id: "project_1" });
    expect(res.status).toBe(404);
    expect(startDeploymentMock).not.toHaveBeenCalled();
  });

  it("returns 404 when there is no active preview deployment", async () => {
    prismaProjectFindFirstMock.mockResolvedValue({ id: "project_1" });
    prismaProjectDeploymentFindFirstMock.mockResolvedValue(null);
    const res = await POST(undefined, { id: "project_1" });
    expect(res.status).toBe(404);
    expect(stopDeploymentMock).not.toHaveBeenCalled();
  });

  it("stops then starts the active preview deployment for the owner", async () => {
    prismaProjectFindFirstMock.mockResolvedValue({ id: "project_1" });
    prismaProjectDeploymentFindFirstMock.mockResolvedValue({
      id: "deployment_1",
    });
    const res = await POST(undefined, { id: "project_1" });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(stopDeploymentMock).toHaveBeenCalledWith("deployment_1");
    expect(startDeploymentMock).toHaveBeenCalledWith("deployment_1");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test tests/routes/projects.id.restart.test.ts`
Expected: FAIL with "Route has no POST handler" (module missing).

- [ ] **Step 3: Implement the endpoint**

Create `src/routes/api.projects.$id.restart.ts`:

```ts
import { createFileRoute } from "@tanstack/react-router";

import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/prisma";
import { getRuntimeSupervisor } from "@/lib/projects/runtime-supervisor";
import { verifyProjectOwnership } from "@/middleware/ownership";

export const Route = createFileRoute("/api/projects/$id/restart")({
  server: {
    handlers: {
      POST: async ({ params }) => {
        const session = await auth();

        if (!session?.user?.id) {
          return Response.json(
            { message: "Masuk dulu untuk melanjutkan." },
            { status: 401 },
          );
        }

        const { id } = params;
        const isOwner = await verifyProjectOwnership(id, session.user.id);

        if (!isOwner) {
          return Response.json(
            { message: "Proyek tidak ditemukan." },
            { status: 404 },
          );
        }

        const deployment = await prisma.projectDeployment.findFirst({
          where: { kind: "preview", projectId: id },
          orderBy: { createdAt: "desc" },
          select: { id: true },
        });

        if (!deployment) {
          return Response.json(
            { message: "Jalankan build dulu untuk menampilkan website." },
            { status: 404 },
          );
        }

        const supervisor = getRuntimeSupervisor();
        await supervisor.stopDeployment(deployment.id);
        await supervisor.startDeployment(deployment.id);

        return Response.json({ ok: true });
      },
    },
  },
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test tests/routes/projects.id.restart.test.ts`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/api.projects.$id.restart.ts tests/routes/projects.id.restart.test.ts
git commit -m "feat(runtime): owner-only preview restart endpoint"
```

---

### Task 3: Wire restart into the recovery UI

**Files:**
- Modify: `src/components/projects/WorkspaceShell.tsx` (`recoverPreviewRuntime` around line 739)
- Modify: `src/components/projects/WorkspacePrimitives.tsx` (`PreviewIssueState` around line 847)
- Modify: `src/components/projects/WorkspacePrimitives.test.ts`

**Interfaces:**
- Consumes: `recoverPreviewRuntime` (already passed as `onRetry`/`onRecover` to preview components).
- Produces: `recoverPreviewRuntime` now calls `POST /api/projects/:id/restart` then reloads runtime state. `PreviewIssueState` gains an `onRestart?: () => void` prop rendering a "Mulai ulang tampilan" button.

- [ ] **Step 1: Write the failing UI copy test**

In `src/components/projects/WorkspacePrimitives.test.ts`, add a new describe block:

```ts
describe("PreviewIssueState restart button", () => {
  it("shows a restart button when onRestart is provided", () => {
    const markup = renderToStaticMarkup(
      createElement(PreviewIssueState, {
        detail: "Tampilan website belum bisa dimuat.",
        onRestart: vi.fn(),
        title: "Tampilan website belum bisa dimuat",
      }),
    );
    expect(markup).toContain("Mulai ulang tampilan");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/components/projects/WorkspacePrimitives.test.ts`
Expected: FAIL — markup does not contain "Mulai ulang tampilan" (prop not supported yet).

- [ ] **Step 3: Add the button to `PreviewIssueState`**

In `src/components/projects/WorkspacePrimitives.tsx`, change the `PreviewIssueState` signature and body. Replace the current `onRebuild?: () => void; onRetry?: () => void;` props block and the action-row render so it looks like this:

```tsx
export function PreviewIssueState({
  detail,
  onRebuild,
  onRestart,
  onRetry,
  title,
}: {
  detail: string;
  onRebuild?: () => void;
  onRestart?: () => void;
  onRetry?: () => void;
  title: string;
}) {
  return (
    <div className="grid min-h-full place-items-center bg-[#10100f] p-spacing-10 text-center">
      <div className="max-w-lg rounded-[24px] border border-[#ffb4a6]/20 bg-[#241d1a] px-spacing-7 py-spacing-7 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
        <div className="mx-auto grid size-11 place-items-center rounded-full border border-[#ffb4a6]/28 bg-[#ffb4a6]/10 text-[#ffb4a6]">
          <RefreshCw className="size-5" aria-hidden="true" />
        </div>
        <h2 className="mt-spacing-5 text-2xl font-semibold tracking-[-0.02em] text-surface-warm-white">
          {title}
        </h2>
        <p className="mx-auto mt-spacing-3 max-w-md text-sm leading-6 text-surface-warm-white/58">
          {detail}
        </p>
        {onRestart || onRetry || onRebuild ? (
          <div className="mt-spacing-5 flex flex-wrap justify-center gap-spacing-3">
            {onRetry ? (
              <Button type="button" onClick={onRetry}>
                Muat ulang tampilan
              </Button>
            ) : null}
            {onRestart ? (
              <Button type="button" variant="outline" onClick={onRestart}>
                Mulai ulang tampilan
              </Button>
            ) : null}
            {onRebuild ? (
              <Button type="button" variant="outline" onClick={onRebuild}>
                Coba lagi
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Wire `recoverPreviewRuntime` in `WorkspaceShell.tsx`**

In `src/components/projects/WorkspaceShell.tsx`, replace the current `recoverPreviewRuntime` callback (around line 739):

```tsx
const recoverPreviewRuntime = useCallback(async () => {
  try {
    const response = await fetch(`/api/projects/${projectId}/restart`, {
      method: "POST",
    });
    if (!response.ok) {
      setRuntimeError("Tampilan website belum bisa dimuat ulang.");
    }
  } catch {
    setRuntimeError("Tampilan website belum bisa dimuat ulang.");
  }
  setPreviewReloadKey((current) => current + 1);
  void loadRuntimeState();
}, [loadRuntimeState, projectId]);
```

Then pass `onRestart={recoverPreviewRuntime}` alongside the existing `onRebuild`/`onRetry` in the `PreviewIssueState` usage (around line 3246). Update the call:

```tsx
<PreviewIssueState
  detail={previewIssue.detail}
  onRebuild={readOnly ? undefined : () => void startBuild()}
  onRestart={readOnly ? undefined : () => void recoverPreviewRuntime()}
  onRetry={recoverPreviewRuntime}
  title={previewIssue.title}
/>
```

- [ ] **Step 5: Run the UI test to verify it passes**

Run: `bun test src/components/projects/WorkspacePrimitives.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the full affected test set**

Run: `bun test src/lib/projects/runtime-supervisor.test.ts tests/routes/projects.id.restart.test.ts src/components/projects/WorkspacePrimitives.test.ts`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/projects/WorkspaceShell.tsx src/components/projects/WorkspacePrimitives.tsx src/components/projects/WorkspacePrimitives.test.ts
git commit -m "feat(runtime): wire owner restart button into preview recovery UI"
```

---

### Task 4: Docs

**Files:**
- Modify: `DEV.md`
- Modify: `docs/superpowers/specs/2026-07-27-rustfs-local-s3-design.md`

**Interfaces:**
- Consumes: the behavior added in Tasks 1-3.

- [ ] **Step 1: Update `DEV.md` runtime section**

Find the "## Local runtime" section (around line 28) and its runtime-cleanup subsection (around line 170). Add a short paragraph describing recovery:

```markdown
Preview runtime self-heals: a deleted/removed serving docroot surfaces as a 404
on the health probe, which marks the deployment stopped and re-materializes the
S3 dist on the next page load. The owner can also restart a preview explicitly
via `POST /api/projects/:id/restart` (owner-only). Full AI rebuilds remain the
separate `POST /api/projects/:id/generate` path.
```

- [ ] **Step 2: Update `2026-07-27-rustfs-local-s3-design.md`**

Add to the section that discusses `PROJECT_RUNTIME_DIR`:

```markdown
Recovery: if the materialized runtime docroot is removed while the static server
is alive, the health probe receives a 404 and treats the deployment as stopped,
so the next preview request re-materializes the S3 dist (`materializeProjectDistArtifact`)
and restarts automatically. Owners may also force a restart via
`POST /api/projects/:id/restart` (owner-only). Neither path runs an AI rebuild.
```

- [ ] **Step 3: Commit**

```bash
git add DEV.md docs/superpowers/specs/2026-07-27-rustfs-local-s3-design.md
git commit -m "docs(runtime): document self-heal and manual preview restart"
```

---

### Task 5: Final verification

- [ ] **Step 1: Run the local quality gate**

Run: `bun run check`
Expected: PASS (format, lint, typecheck, affected tests, Knip). Fix any failures before proceeding.

- [ ] **Step 2: Confirm no regressions in runtime flows**

Run: `bun test tests/routes/projects.id.preview.splat.test.ts tests/routes/projects.id.runtime.test.ts`
Expected: PASS (existing preview and runtime route behavior unchanged).
