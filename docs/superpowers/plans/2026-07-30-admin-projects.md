# Admin Projects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only `/admin/projects` tab that lists the 50 newest user projects globally.

**Architecture:** Put the project query in one small server-side helper so ordering and selected fields are testable without routing internals. The API route gates with existing `requireAdmin()` and returns that helper's DTO. The React route follows existing admin pages: `useQuery`, `fetchJson`, dark admin chrome, no mutations.

**Tech Stack:** TanStack Router/Start file routes, React Query, Prisma, Vitest, Bun.

## Global Constraints

- Tab label: `Proyek`.
- Page route: `/admin/projects`.
- API route: `GET /api/admin/projects`.
- Show the 50 most recently created projects globally, ordered by `createdAt` descending.
- Require existing admin auth gate; keep `401` unauthenticated and `403` non-admin behavior.
- Return only: project `id`, `title`, `status`, `buildStatus`, `createdAt`, `updatedAt`, owner `id`, owner `name`, owner `email`.
- Return no generated source, prompt, chat messages, build logs, artifacts, secrets, or runtime controls.
- UI is read-only: no stop, edit, delete, retry, publish, or other mutating action.
- Empty state copy: `Belum ada proyek.`
- Streamer mode masks project title, owner name, and owner email.
- No pagination, search/filter/sort controls, per-user drilldown, workspace links, or admin mutations.
- Run a focused behavior check and `bun run check` before handoff.

---

## File Structure

- Create `src/lib/admin-projects.ts`: owns the Prisma select, 50-row limit, newest-first ordering, and DTO serialization.
- Create `src/lib/admin-projects.test.ts`: tests newest-first behavior and the returned field shape using a tiny fake Prisma object.
- Create `src/routes/api.admin.projects.ts`: admin-authenticated read-only API wrapper around `listAdminProjects()`.
- Create `src/routes/_main.admin.projects.tsx`: read-only admin projects page.
- Modify `src/components/admin/AdminTabs.tsx`: add the `Proyek` tab.

---

### Task 1: Testable admin projects query

**Files:**
- Create: `src/lib/admin-projects.ts`
- Create: `src/lib/admin-projects.test.ts`

**Interfaces:**
- Consumes: `prisma.project.findMany(args)` shape from `@/lib/prisma`.
- Produces: `listAdminProjects(client?: AdminProjectsClient): Promise<AdminProjectsResponse>`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/admin-projects.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { listAdminProjects } from "./admin-projects";

const rows = [
  {
    buildStatus: "built",
    createdAt: new Date("2026-07-30T10:00:00.000Z"),
    id: "project-new",
    status: "draft",
    title: "Newest project",
    updatedAt: new Date("2026-07-30T10:30:00.000Z"),
    user: { email: "new@example.com", id: "user-new", name: "New Owner" },
  },
  {
    buildStatus: "failed",
    createdAt: new Date("2026-07-29T10:00:00.000Z"),
    id: "project-old",
    status: "draft",
    title: "Old project",
    updatedAt: new Date("2026-07-29T10:30:00.000Z"),
    user: { email: "old@example.com", id: "user-old", name: "Old Owner" },
  },
];

describe("listAdminProjects", () => {
  it("asks Prisma for the 50 newest projects and returns only read-only display fields", async () => {
    const calls: unknown[] = [];
    const client = {
      project: {
        findMany: async (args: unknown) => {
          calls.push(args);
          return rows;
        },
      },
    };

    const result = await listAdminProjects(client);

    expect(calls).toEqual([
      {
        orderBy: { createdAt: "desc" },
        select: {
          buildStatus: true,
          createdAt: true,
          id: true,
          status: true,
          title: true,
          updatedAt: true,
          user: { select: { email: true, id: true, name: true } },
        },
        take: 50,
      },
    ]);
    expect(result).toEqual({
      projects: [
        {
          buildStatus: "built",
          createdAt: "2026-07-30T10:00:00.000Z",
          id: "project-new",
          owner: { email: "new@example.com", id: "user-new", name: "New Owner" },
          status: "draft",
          title: "Newest project",
          updatedAt: "2026-07-30T10:30:00.000Z",
        },
        {
          buildStatus: "failed",
          createdAt: "2026-07-29T10:00:00.000Z",
          id: "project-old",
          owner: { email: "old@example.com", id: "user-old", name: "Old Owner" },
          status: "draft",
          title: "Old project",
          updatedAt: "2026-07-29T10:30:00.000Z",
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain("buildLog");
    expect(JSON.stringify(result)).not.toContain("sourceFiles");
    expect(JSON.stringify(result)).not.toContain("prompt");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/lib/admin-projects.test.ts`

Expected: FAIL because `src/lib/admin-projects.ts` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/admin-projects.ts`:

```ts
import { prisma } from "./prisma";

type AdminProjectRow = {
  buildStatus: string;
  createdAt: Date;
  id: string;
  status: string;
  title: string;
  updatedAt: Date;
  user: {
    email: string | null;
    id: string;
    name: string | null;
  };
};

type AdminProjectsClient = {
  project: {
    findMany(args: {
      orderBy: { createdAt: "desc" };
      select: {
        buildStatus: true;
        createdAt: true;
        id: true;
        status: true;
        title: true;
        updatedAt: true;
        user: { select: { email: true; id: true; name: true } };
      };
      take: 50;
    }): Promise<AdminProjectRow[]>;
  };
};

export type AdminProject = {
  buildStatus: string;
  createdAt: string;
  id: string;
  owner: {
    email: string | null;
    id: string;
    name: string | null;
  };
  status: string;
  title: string;
  updatedAt: string;
};

export type AdminProjectsResponse = {
  projects: AdminProject[];
};

export async function listAdminProjects(
  client: AdminProjectsClient = prisma,
): Promise<AdminProjectsResponse> {
  const projects = await client.project.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      buildStatus: true,
      createdAt: true,
      id: true,
      status: true,
      title: true,
      updatedAt: true,
      user: { select: { email: true, id: true, name: true } },
    },
    take: 50,
  });

  return {
    projects: projects.map((project) => ({
      buildStatus: project.buildStatus,
      createdAt: project.createdAt.toISOString(),
      id: project.id,
      owner: project.user,
      status: project.status,
      title: project.title,
      updatedAt: project.updatedAt.toISOString(),
    })),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/lib/admin-projects.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin-projects.ts src/lib/admin-projects.test.ts
git commit -m "feat(admin): add read-only project listing query" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: Admin projects API route

**Files:**
- Create: `src/routes/api.admin.projects.ts`

**Interfaces:**
- Consumes: `listAdminProjects(): Promise<AdminProjectsResponse>` from `src/lib/admin-projects.ts`.
- Produces: `GET /api/admin/projects` JSON response for the UI.

- [ ] **Step 1: Create API route**

Create `src/routes/api.admin.projects.ts`:

```ts
import { createFileRoute } from "@tanstack/react-router";

import { listAdminProjects } from "@/lib/admin-projects";
import { requireAdmin } from "@/lib/auth-admin";

export const Route = createFileRoute("/api/admin/projects")({
  server: {
    handlers: {
      GET: async () => {
        const admin = await requireAdmin();
        if (!admin.ok) {
          return Response.json(
            { message: admin.message },
            { status: admin.status },
          );
        }

        return Response.json(await listAdminProjects());
      },
    },
  },
});
```

- [ ] **Step 2: Run typecheck for the new route**

Run: `bun run typecheck`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/routes/api.admin.projects.ts
git commit -m "feat(admin): expose read-only projects API" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: Admin projects tab and page

**Files:**
- Modify: `src/components/admin/AdminTabs.tsx`
- Create: `src/routes/_main.admin.projects.tsx`

**Interfaces:**
- Consumes: `GET /api/admin/projects` returning `AdminProjectsResponse`.
- Produces: `/admin/projects` read-only UI.

- [ ] **Step 1: Add the tab**

Modify the `TABS` array in `src/components/admin/AdminTabs.tsx` to include `Proyek` after `Pengguna`:

```ts
const TABS = [
  { label: "Ringkasan", to: "/admin" },
  { label: "Pengguna", to: "/admin/users" },
  { label: "Proyek", to: "/admin/projects" },
  { label: "Antrean", to: "/admin/waitlist" },
  { label: "Tiket", to: "/admin/tickets" },
  { label: "Transaksi", to: "/admin/transactions" },
  { label: "Pengaturan", to: "/admin/settings" },
] as const;
```

- [ ] **Step 2: Create projects page**

Create `src/routes/_main.admin.projects.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { SensitiveText } from "@/components/admin/streamer-mode/SensitiveText";
import { useStreamerMode } from "@/components/admin/streamer-mode/streamer-mode-context";
import { fetchJson } from "@/lib/query-client";

type AdminProject = {
  buildStatus: string;
  createdAt: string;
  id: string;
  owner: {
    email: string | null;
    id: string;
    name: string | null;
  };
  status: string;
  title: string;
  updatedAt: string;
};

type ProjectsResponse = {
  projects: AdminProject[];
};

export const Route = createFileRoute("/_main/admin/projects")({
  component: ProjectsPage,
});

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function ProjectsPage() {
  const streamerMode = useStreamerMode();
  const { data } = useQuery({
    queryFn: () => fetchJson<ProjectsResponse>("/api/admin/projects"),
    queryKey: ["admin", "projects"],
  });
  const projects = data?.projects ?? [];

  if (projects.length === 0) {
    return <p className="text-surface-warm-white/70">Belum ada proyek.</p>;
  }

  return (
    <div className="flex flex-col gap-spacing-2">
      {projects.map((project) => (
        <article
          className="rounded-radius-md border border-surface-warm-white/12 bg-surface-warm-white/5 p-spacing-3 text-sm"
          key={project.id}
        >
          <div className="flex flex-col gap-spacing-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h2 className="truncate font-medium text-surface-warm-white">
                {streamerMode ? (
                  <SensitiveText kind="name" value={project.title} />
                ) : (
                  project.title
                )}
              </h2>
              <p className="mt-spacing-1 text-surface-warm-white/70">
                {streamerMode && project.owner.name ? (
                  <SensitiveText kind="name" value={project.owner.name} />
                ) : (
                  (project.owner.name ?? "Tanpa nama")
                )}
                {" · "}
                {streamerMode && project.owner.email ? (
                  <SensitiveText kind="email" value={project.owner.email} />
                ) : (
                  (project.owner.email ?? "Tanpa email")
                )}
              </p>
            </div>
            <div className="flex flex-wrap gap-spacing-2 text-xs text-surface-warm-white/70 sm:justify-end">
              <span className="rounded-radius-sm border border-surface-warm-white/12 px-spacing-2 py-spacing-1">
                {project.status}
              </span>
              <span className="rounded-radius-sm border border-surface-warm-white/12 px-spacing-2 py-spacing-1">
                Build: {project.buildStatus}
              </span>
            </div>
          </div>
          <dl className="mt-spacing-3 grid gap-spacing-2 text-xs text-surface-warm-white/70 sm:grid-cols-2">
            <div>
              <dt className="sr-only">Dibuat</dt>
              <dd>Dibuat {formatDate(project.createdAt)}</dd>
            </div>
            <div>
              <dt className="sr-only">Diperbarui</dt>
              <dd>Diperbarui {formatDate(project.updatedAt)}</dd>
            </div>
          </dl>
        </article>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Run route generation and typecheck**

Run: `bun run routes:generate && bun run typecheck`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/AdminTabs.tsx src/routes/_main.admin.projects.tsx src/routeTree.gen.ts
git commit -m "feat(admin): add read-only projects page" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: Final verification

**Files:**
- No new files expected.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: verified handoff.

- [ ] **Step 1: Run focused behavior check**

Run: `bun test src/lib/admin-projects.test.ts`

Expected: PASS.

- [ ] **Step 2: Run full local gate**

Run: `bun run check`

Expected: PASS.

- [ ] **Step 3: Inspect working tree**

Run: `git status --short --untracked-files=all`

Expected: clean, unless `graphify-out/` appears from discovery and remains untracked/ignored. Do not commit local artifacts.

- [ ] **Step 4: Report result**

Report:

```text
Implemented `/admin/projects`: newest 50 projects, read-only, streamer-mode masked.
Checks: `bun test src/lib/admin-projects.test.ts` PASS; `bun run check` PASS.
```

---

## Self-Review

- Spec coverage: API route, page route, tab, newest-first order, 50-row limit, safe selected fields, empty state, streamer masking, no mutation controls, focused test, and `bun run check` all map to tasks above.
- Placeholder scan: no placeholders, TBDs, or vague test steps remain.
- Type consistency: `AdminProject`, `AdminProjectsResponse`, and `listAdminProjects()` names match across tasks.
