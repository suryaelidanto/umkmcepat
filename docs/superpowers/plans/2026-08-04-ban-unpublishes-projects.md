# Ban Unpublishes Published Projects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Banning a user takes all their published sites offline (410 Gone) and drops them from the sitemap; unbanning restores them. Nothing is deleted.

**Architecture:** A single serve-time gate in the public `p/$slug` route — the route already resolves the active published deployment and proxies it, so extend its query to reach the deploying owner's `User.bannedAt` and return 410 when set. This one change gives the takedown, the deindex signal (410), and the reversible unban (the gate is a live DB read). Ban-side container stops and a sitemap filter are hygiene on top; no schema change, no deletion.

**Tech Stack:** Bun, TypeScript, TanStack Start file routes, Vitest, Prisma.

## Global Constraints

- Use Bun only; keep `bun.lock` as the canonical lockfile.
- Keep changes small, focused, and easy to review.
- User-facing product UI copy uses Indonesian; developer-facing docs/code/logs/errors use English.
- Do not add dependencies.
- Do not change the schema (`prisma/schema.prisma`) — reuse `User.bannedAt`.
- Do not delete project rows, artifacts, snapshots, or builds on ban. This is reversible unpublish, not teardown.
- Before handoff, run `bun run check` explicitly.
- Docs are part of the change: update `DEV.md` in the same diff.

---

## File Structure

- Modify: `src/routes/p.$slug.$.ts`
  - Extend the published-deployment query to select the owner's `bannedAt`, and return 410 Gone when the owner is banned.
- Modify: `tests/routes/p.slug.splat.test.ts`
  - Add: banned owner → 410 with `noindex`/`no-store` and no proxy call. Active owner → 200 (regression).
- Modify: `src/routes/api.admin.users.$id.ts`
  - In `action=ban`, stop the user's published deployments best-effort.
- Modify: `src/routes/-api.admin.users.$id.test.ts`
  - Add: ban stops published deployments. (Note: repo names test files with a leading dash so TanStack Start does not treat them as routes.)
- Modify: `src/routes/sitemap[.]xml.ts`
  - Add the same nested owner select and exclude deployments whose owner is banned.
- Create: `tests/routes/sitemap.test.ts`
  - Banned owner's deployment excluded; active owner's included.
- Modify: `DEV.md`
  - Document ban → unpublish behavior.

---

### Task 1: Serve-time ban gate in `p/$slug`

**Files:**
- Modify: `src/routes/p.$slug.$.ts:71-100` (deployment query) and `:100-108` (post-resolution gate)
- Test: `tests/routes/p.slug.splat.test.ts`

**Interfaces:**
- Consumes: `prisma.projectDeployment.findMany` (already mocked in the test), `selectActivePublishedDeployment`, `createPublicIssueResponse` (already exported in the file).
- Produces: behavior — a deployment whose `build.snapshot.project.user.bannedAt` is set returns HTTP 410 with `X-Robots-Tag: noindex` and `Cache-Control: no-store`, and never calls `proxyDeploymentRequest`.

- [ ] **Step 1: Write the failing test**

In `tests/routes/p.slug.splat.test.ts`, inside the existing `describe("published generated route", ...)`, after the test `"passes publicAssetRewrite through to proxyDeploymentRequest"` (line 128), add these two tests. The mock shape mirrors the existing published-deployment mock (line 89), extended with the nested `snapshot.project.user.bannedAt`:

```ts
it("returns 410 for a published deployment whose owner is banned, without proxying", async () => {
  vi.stubEnv("GENERATED_PUBLIC_EXECUTION_ENABLED", "true");
  prismaProjectDeploymentFindManyMock.mockResolvedValueOnce([
    {
      build: {
        artifactRef: "project-artifact:local:dist:abc",
        createdAt: new Date(),
        id: "build_banned",
        snapshotId: "snapshot_banned",
        snapshot: {
          project: {
            title: "Warung",
            user: { bannedAt: new Date("2026-08-01") },
          },
        },
        status: "succeeded",
        updatedAt: new Date(),
      },
      buildId: "build_banned",
      createdAt: new Date(),
      id: "deployment_banned",
      kind: "published",
      snapshotId: "snapshot_banned",
      status: "running",
      updatedAt: new Date(),
    },
  ]);

  const response = await GET(
    new Request("https://sites.example.net/p/warung/"),
    { slug: "warung" },
  );

  expect(response.status).toBe(410);
  expect(response.headers.get("X-Robots-Tag")).toBe("noindex");
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(proxyDeploymentRequestMock).not.toHaveBeenCalled();
});

it("still proxies for an active (non-banned) owner", async () => {
  vi.stubEnv("GENERATED_PUBLIC_EXECUTION_ENABLED", "true");
  prismaProjectDeploymentFindManyMock.mockResolvedValueOnce([
    {
      build: {
        artifactRef: "project-artifact:local:dist:abc",
        createdAt: new Date(),
        id: "build_2",
        snapshotId: "snapshot_2",
        snapshot: {
          project: { title: "Warung", user: { bannedAt: null } },
        },
        status: "succeeded",
        updatedAt: new Date(),
      },
      buildId: "build_2",
      createdAt: new Date(),
      id: "deployment_2",
      kind: "published",
      snapshotId: "snapshot_2",
      status: "running",
      updatedAt: new Date(),
    },
  ]);
  proxyDeploymentRequestMock.mockResolvedValueOnce(
    new Response("<html></html>", {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    }),
  );

  const response = await GET(
    new Request("https://sites.example.net/p/warung/"),
    { slug: "warung" },
  );

  expect(response.status).toBe(200);
  expect(proxyDeploymentRequestMock).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test tests/routes/p.slug.splat.test.ts`
Expected: the new banned-owner test FAILS — the response is 200 (or 503), not 410, and `proxyDeploymentRequest` is called.

- [ ] **Step 3: Extend the query select to include the owner's `bannedAt`**

In `src/routes/p.$slug.$.ts`, in the deployment `findMany` select, the `build.snapshot.project` select currently only picks `title` (line 83). Add a `user: { select: { bannedAt: true } }` to that same `project` select:

```ts
build: {
  select: {
    artifactRef: true,
    createdAt: true,
    id: true,
    snapshot: {
      select: {
        project: {
          select: {
            title: true,
            user: { select: { bannedAt: true } },
          },
        },
      },
    },
    snapshotId: true,
    status: true,
    updatedAt: true,
  },
},
```

- [ ] **Step 4: Add the ban gate after resolution**

In `src/routes/p.$slug.$.ts`, after the `selectActivePublishedDeployment(deployments)` call (line 100) and before the `if (!deployment?.build?.artifactRef)` block (line 102), insert this block:

```ts
if (deployment?.build?.snapshot?.project?.user?.bannedAt) {
  return createPublicIssueResponse({
    detail:
      "Website ini tidak lagi tersedia. Jika kamu pemiliknya, hubungi dukungan.",
    headers: {
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
    status: 410,
    title: "Website tidak tersedia",
  });
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `bun test tests/routes/p.slug.splat.test.ts`
Expected: all tests PASS, including the two new ones.

- [ ] **Step 6: Commit**

```bash
git add src/routes/p.$slug.$.ts tests/routes/p.slug.splat.test.ts
git commit -m "feat(projects): serve 410 for published sites of banned owners"
```

---

### Task 2: Stop published containers on ban

**Files:**
- Modify: `src/routes/api.admin.users.$id.ts:56-72` (ban branch)
- Test: `src/routes/api.admin.users.$id.test.ts`

**Interfaces:**
- Consumes: `requireAdmin()` (already used), `prisma.user` / `prisma.projectDeployment` (via `@/lib/prisma`), `getRuntimeSupervisor()` (from `@/lib/projects/runtime-supervisor`), dynamic import pattern.
- Produces: `action=ban` additionally stops the user's published deployments best-effort (non-fatal). Response shape unchanged: `{ status: "banned" }`.

- [ ] **Step 1: Write the failing test**

Replace the contents of `src/routes/api.admin.users.$id.test.ts` (currently only tests `parseAdminEnergyGrant`) with:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireAdminMock,
  prismaUserFindUniqueMock,
  prismaUserUpdateMock,
  prismaProjectDeploymentFindManyMock,
  stopDeploymentMock,
} = vi.hoisted(() => ({
  requireAdminMock: vi.fn(async () => ({ ok: true })),
  prismaUserFindUniqueMock: vi.fn(),
  prismaUserUpdateMock: vi.fn(),
  prismaProjectDeploymentFindManyMock: vi.fn(),
  stopDeploymentMock: vi.fn(async () => "stopped" as const),
}));

vi.mock("@/lib/auth-admin", () => ({ requireAdmin: requireAdminMock }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    projectDeployment: { findMany: prismaProjectDeploymentFindManyMock },
    user: {
      findUnique: prismaUserFindUniqueMock,
      update: prismaUserUpdateMock,
    },
  },
}));
vi.mock("@/lib/email/templates", () => ({
  sendBannedNotification: vi.fn(async () => undefined),
  sendUnbannedNotification: vi.fn(async () => undefined),
}));
vi.mock("@/lib/projects/runtime-supervisor", () => ({
  getRuntimeSupervisor: () => ({ stopDeployment: stopDeploymentMock }),
}));

import { getHandler } from "../../tests/routes/_handler";

import { Route } from "@/routes/api.admin.users.$id";

const POST = getHandler(Route, "POST");

describe("admin user ban action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminMock.mockResolvedValue({ ok: true });
  });

  it("stops the user's published deployments when banning", async () => {
    prismaUserFindUniqueMock.mockResolvedValue({
      email: "user@example.com",
      name: "Budi",
    });
    prismaProjectDeploymentFindManyMock.mockResolvedValue([
      { id: "deployment_a" },
      { id: "deployment_b" },
    ]);

    const res = await POST(
      new Request("http://localhost/api/admin/users/user_1?action=ban"),
      { id: "user_1" },
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ status: "banned" });
    expect(prismaUserUpdateMock).toHaveBeenCalledWith({
      where: { id: "user_1" },
      data: { bannedAt: expect.any(Date) },
    });
    expect(stopDeploymentMock).toHaveBeenCalledWith("deployment_a");
    expect(stopDeploymentMock).toHaveBeenCalledWith("deployment_b");
  });

  it("still bans when there are no published deployments", async () => {
    prismaUserFindUniqueMock.mockResolvedValue({ email: null, name: null });
    prismaProjectDeploymentFindManyMock.mockResolvedValue([]);

    const res = await POST(
      new Request("http://localhost/api/admin/users/user_1?action=ban"),
      { id: "user_1" },
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ status: "banned" });
    expect(stopDeploymentMock).not.toHaveBeenCalled();
  });

  it("bans even if stopping a deployment fails", async () => {
    prismaUserFindUniqueMock.mockResolvedValue({ email: null, name: null });
    prismaProjectDeploymentFindManyMock.mockResolvedValue([{ id: "deployment_a" }]);
    stopDeploymentMock.mockRejectedValueOnce(new Error("boom"));

    const res = await POST(
      new Request("http://localhost/api/admin/users/user_1?action=ban"),
      { id: "user_1" },
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ status: "banned" });
  });
});
```

Note the import path `"../../tests/routes/_handler"` — from `src/routes/` up two levels to the repo-root `tests/routes/_handler.ts`. Verify it resolves when you run; if the repo uses a `@` alias for tests, adjust accordingly.

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/routes/api.admin.users.$id.test.ts`
Expected: FAIL — the ban handler does not call `projectDeployment.findMany` or `stopDeployment` yet.

- [ ] **Step 3: Implement the container stop in the ban branch**

In `src/routes/api.admin.users.$id.ts`, inside the `if (action === "ban")` block, after the `prisma.user.update` (line 61-64) and before the email block, add:

```ts
const deployments = await prisma.projectDeployment.findMany({
  where: { kind: "published", project: { userId: id } },
  select: { id: true },
});
if (deployments.length > 0) {
  const { getRuntimeSupervisor } = await import(
    "@/lib/projects/runtime-supervisor"
  );
  const supervisor = getRuntimeSupervisor();
  await Promise.all(
    deployments.map((deployment) =>
      supervisor.stopDeployment(deployment.id).catch(() => undefined),
    ),
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/routes/api.admin.users.$id.test.ts`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/api.admin.users.$id.ts src/routes/api.admin.users.$id.test.ts
git commit -m "feat(admin): stop published containers when banning a user"
```

---

### Task 3: Exclude banned owners from the sitemap

**Files:**
- Modify: `src/routes/sitemap[.]xml.ts:16-31`
- Create: `tests/routes/sitemap.test.ts`

**Interfaces:**
- Consumes: `prisma.projectDeployment.findMany` (mocked).
- Produces: sitemap omits any deployment whose `build.snapshot.project.user.bannedAt` is set.

- [ ] **Step 1: Write the failing test**

Create `tests/routes/sitemap.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

const { prismaProjectDeploymentFindManyMock } = vi.hoisted(() => ({
  prismaProjectDeploymentFindManyMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { projectDeployment: { findMany: prismaProjectDeploymentFindManyMock } },
}));

import { getHandler } from "./_handler";

import { Route } from "@/routes/sitemap[.]xml";

const GET = getHandler(Route, "GET");

describe("sitemap", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("excludes published deployments whose owner is banned", async () => {
    vi.stubEnv("GENERATED_PUBLIC_ORIGIN", "https://sites.example.net");
    prismaProjectDeploymentFindManyMock.mockResolvedValue([
      {
        slug: "warung",
        updatedAt: new Date("2026-08-01"),
        build: { snapshot: { project: { user: { bannedAt: new Date() } } } },
      },
      {
        slug: "kafe",
        updatedAt: new Date("2026-08-02"),
        build: { snapshot: { project: { user: { bannedAt: null } } } },
      },
    ]);

    const res = await GET();
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(body).toContain("/p/kafe");
    expect(body).not.toContain("/p/warung");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test tests/routes/sitemap.test.ts`
Expected: FAIL — the body contains `/p/warung` (banned deployment not filtered).

- [ ] **Step 3: Add the owner select and filter**

In `src/routes/sitemap[.]xml.ts`, replace the `findMany` select/where and the mapping so it selects the owner and filters banned owners:

```ts
const deployments = await prisma.projectDeployment
  .findMany({
    select: {
      slug: true,
      updatedAt: true,
      build: {
        select: {
          snapshot: {
            select: {
              project: {
                select: {
                  user: { select: { bannedAt: true } },
                },
              },
            },
          },
        },
      },
    },
    where: { kind: "published" },
  })
  .catch(() => []);

const published = (
  deployments as Array<{
    slug: string;
    updatedAt: Date;
    build: {
      snapshot: {
        project: { user: { bannedAt: Date | null } | null };
      } | null;
    } | null;
  }>
)
  .filter(
    (d) => !d.build?.snapshot?.project?.user?.bannedAt,
  )
  .map((d) => {
    const safeSlug = encodeURIComponent(d.slug);
    const lastmod = d.updatedAt.toISOString();
    return `  <url>\n    <loc>${origin}/p/${safeSlug}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n  </url>`;
  })
  .join("\n");
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test tests/routes/sitemap.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/sitemap\[.\]xml.ts tests/routes/sitemap.test.ts
git commit -m "feat(seo): drop banned owners' published sites from sitemap"
```

---

### Task 4: Docs

**Files:**
- Modify: `DEV.md`

**Interfaces:**
- Consumes: behavior from Tasks 1-3.

- [ ] **Step 1: Document ban → unpublish**

Find the admin/moderation section in `DEV.md` (search for "ban" or the admin dashboard section) and add:

```markdown
Banning a user (`Admin` → users → Blokir) also unpublishes their sites: every
`p/<slug>` for a banned owner returns 410 Gone (deindexed, `X-Robots-Tag:
noindex`) and their running published containers are stopped best-effort. The
sitemap omits banned owners. Unbanning restores everything — nothing is deleted,
sites come back online automatically since the gate is a live read of
`User.bannedAt`.
```

- [ ] **Step 2: Commit**

```bash
git add DEV.md
git commit -m "docs(admin): document ban unpublishes a user's sites"
```

---

### Task 5: Final verification

- [ ] **Step 1: Run the affected tests**

Run: `bun test tests/routes/p.slug.splat.test.ts src/routes/api.admin.users.$id.test.ts tests/routes/sitemap.test.ts`
Expected: all PASS.

- [ ] **Step 2: Run the local quality gate**

Run: `bun run check`
Expected: PASS (format, lint, typecheck, affected tests, Knip). Fix any failures before proceeding.

- [ ] **Step 3: Confirm no regression in related runtime flows**

Run: `bun test tests/routes/projects.id.preview.splat.test.ts src/lib/projects/runtime-proxy.test.ts`
Expected: PASS (existing preview and public-serving behavior unchanged for active owners).
