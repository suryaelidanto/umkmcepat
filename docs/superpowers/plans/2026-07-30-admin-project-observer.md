# Admin Project Observer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins open `/projects/:id` for another user's project in read-only observer mode.

**Architecture:** Extract access and observer data loading into a small server helper so owner/admin/non-owner behavior is testable without route internals. The existing `/projects/:id` route keeps `WorkspaceShell` for owners only and renders a new static observer component for admin non-owners. The admin projects list links to the existing project URL.

**Tech Stack:** TanStack Router/Start file routes, React, Prisma, Vitest, Bun.

## Global Constraints

- Project owner: render the existing normal workspace unchanged.
- Admin who is not the owner: render a read-only observer view.
- Any other non-owner: keep the existing not-found behavior.
- Admins use the same shared project URL: `/projects/:id`.
- Observer may show only: project id, project title, owner id/name/email, project status, build status, created/updated dates, initial prompt, persisted chat history, persisted workspace card, persisted brief summary.
- Observer view must not mount `WorkspaceShell`.
- Observer view must not render or trigger: chat composer, `useChat`, generate/build buttons, retry buttons, stop/cancel buttons, edit or visual annotation controls, publish buttons, preview iframe, runtime polling, source-code fetches, POST/PUT/PATCH/DELETE requests.
- Admin projects list rows link to `/projects/:id`.
- Indonesian UI copy.
- Before handoff, run the focused test and `bun run check`.

---

## File Structure

- Create `src/lib/admin-project-observer.ts`: owns access-mode decision and read-only project observer DTO serialization.
- Create `src/lib/admin-project-observer.test.ts`: tests owner/admin/non-owner access and safe read-only field shape.
- Create `src/components/projects/AdminProjectObserver.tsx`: static read-only renderer for admin non-owner project detail.
- Modify `src/routes/_main.projects.$id.tsx`: use helper; owner renders `WorkspaceShell`, admin observer renders `AdminProjectObserver`, non-owner throws `notFound()`.
- Modify `src/routes/_main.admin.projects.tsx`: wrap each row title with a link to `/projects/:id`.

---

### Task 1: Access-mode and observer data helper

**Files:**
- Create: `src/lib/admin-project-observer.ts`
- Create: `src/lib/admin-project-observer.test.ts`

**Interfaces:**
- Consumes: `parseProjectBrief`, `parseWorkspaceCard`, `parseProjectChatMessages`, `getProjectChatPage`, `isAdminEmail`.
- Produces: `loadProjectForViewer({ client, projectId, viewer }): Promise<ProjectViewerLoad>`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/admin-project-observer.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { loadProjectForViewer } from "./admin-project-observer";

const baseProject = {
  brief: { businessName: "Kopi Ibu", offer: "Kopi susu", version: 1 },
  buildStatus: "ready",
  chatMessages: [
    { id: "m1", role: "user", parts: [{ type: "text", text: "buat website kopi" }] },
    { id: "m2", role: "assistant", parts: [{ type: "text", text: "baik" }] },
  ],
  createdAt: new Date("2026-07-30T08:00:00.000Z"),
  id: "project-1",
  model: "model-a",
  prompt: "Buat website kopi",
  status: "ready",
  title: "Website Kopi Ibu",
  updatedAt: new Date("2026-07-30T09:00:00.000Z"),
  userId: "owner-1",
  user: { email: "owner@example.com", id: "owner-1", name: "Owner" },
  workspaceCard: { type: "build_recommendation", title: "Siap build", summary: ["Kopi susu"] },
};

function clientReturning(project: typeof baseProject | null) {
  const calls: unknown[] = [];
  return {
    calls,
    project: {
      findUnique: async (args: unknown) => {
        calls.push(args);
        return project;
      },
    },
  };
}

describe("loadProjectForViewer", () => {
  it("returns owner mode for the project owner", async () => {
    const client = clientReturning(baseProject);

    const result = await loadProjectForViewer({
      client,
      projectId: "project-1",
      viewer: { email: "owner@example.com", id: "owner-1" },
    });

    expect(result.mode).toBe("owner");
    expect(result.project?.projectId).toBe("project-1");
  });

  it("returns observer mode for an admin who is not the owner", async () => {
    const client = clientReturning(baseProject);

    const result = await loadProjectForViewer({
      client,
      isAdminEmail: (email) => email === "admin@example.com",
      projectId: "project-1",
      viewer: { email: "admin@example.com", id: "admin-1" },
    });

    expect(result.mode).toBe("observer");
    expect(result.project).toMatchObject({
      buildStatus: "ready",
      createdAt: "2026-07-30T08:00:00.000Z",
      initialPrompt: "Buat website kopi",
      owner: { email: "owner@example.com", id: "owner-1", name: "Owner" },
      projectId: "project-1",
      status: "ready",
      title: "Website Kopi Ibu",
      updatedAt: "2026-07-30T09:00:00.000Z",
    });
    expect(result.project?.initialChatPage.messages).toHaveLength(2);
    expect(JSON.stringify(result.project)).not.toContain("sourceFiles");
    expect(JSON.stringify(result.project)).not.toContain("buildLog");
  });

  it("denies a non-admin who is not the owner", async () => {
    const client = clientReturning(baseProject);

    const result = await loadProjectForViewer({
      client,
      isAdminEmail: () => false,
      projectId: "project-1",
      viewer: { email: "other@example.com", id: "other-1" },
    });

    expect(result).toEqual({ mode: "denied", project: null });
  });

  it("selects only read-only observer fields", async () => {
    const client = clientReturning(baseProject);

    await loadProjectForViewer({
      client,
      projectId: "project-1",
      viewer: { email: "owner@example.com", id: "owner-1" },
    });

    expect(client.calls).toEqual([
      {
        select: {
          brief: true,
          buildStatus: true,
          chatMessages: true,
          createdAt: true,
          id: true,
          model: true,
          prompt: true,
          status: true,
          title: true,
          updatedAt: true,
          userId: true,
          user: { select: { email: true, id: true, name: true } },
          workspaceCard: true,
        },
        where: { id: "project-1" },
      },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/lib/admin-project-observer.test.ts`

Expected: FAIL because `src/lib/admin-project-observer.ts` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/admin-project-observer.ts`:

```ts
import type { UIMessage } from "ai";

import type { ProjectBrief, WorkspaceCard } from "@/lib/projects/brief";

import { prisma } from "./prisma";
import { isAdminEmail as defaultIsAdminEmail } from "./waitlist";
import { parseWorkspaceCard } from "./projects/brief-flow";
import { parseProjectBrief } from "./projects/brief";
import {
  getProjectChatPage,
  parseProjectChatMessages,
} from "./projects/chat-memory";

type ProjectViewerRow = {
  brief: unknown;
  buildStatus: string;
  chatMessages: unknown;
  createdAt: Date;
  id: string;
  model: string;
  prompt: string;
  status: string;
  title: string;
  updatedAt: Date;
  userId: string;
  user: { email: string | null; id: string; name: string | null };
  workspaceCard: unknown;
};

type ProjectViewerClient = {
  project: {
    findUnique(args: {
      select: {
        brief: true;
        buildStatus: true;
        chatMessages: true;
        createdAt: true;
        id: true;
        model: true;
        prompt: true;
        status: true;
        title: true;
        updatedAt: true;
        userId: true;
        user: { select: { email: true; id: true; name: true } };
        workspaceCard: true;
      };
      where: { id: string };
    }): Promise<ProjectViewerRow | null>;
  };
};

export type ProjectViewerData = {
  buildStatus: string;
  createdAt: string;
  initialBrief: ProjectBrief;
  initialChatPage: {
    hasMore: boolean;
    messages: UIMessage[];
    nextCursor: number | null;
  };
  initialPrompt: string;
  initialWorkspaceCard: WorkspaceCard;
  model: string;
  owner: { email: string | null; id: string; name: string | null };
  projectId: string;
  status: string;
  title: string;
  updatedAt: string;
};

export type ProjectViewerLoad =
  | { mode: "owner"; project: ProjectViewerData }
  | { mode: "observer"; project: ProjectViewerData }
  | { mode: "denied"; project: null };

export async function loadProjectForViewer({
  client = prisma,
  isAdminEmail = defaultIsAdminEmail,
  projectId,
  viewer,
}: {
  client?: ProjectViewerClient;
  isAdminEmail?: (email: string) => boolean;
  projectId: string;
  viewer: { email?: string | null; id: string };
}): Promise<ProjectViewerLoad> {
  const project = await client.project.findUnique({
    select: {
      brief: true,
      buildStatus: true,
      chatMessages: true,
      createdAt: true,
      id: true,
      model: true,
      prompt: true,
      status: true,
      title: true,
      updatedAt: true,
      userId: true,
      user: { select: { email: true, id: true, name: true } },
      workspaceCard: true,
    },
    where: { id: projectId },
  });

  if (!project) {
    return { mode: "denied", project: null };
  }

  const data = toProjectViewerData(project);

  if (project.userId === viewer.id) {
    return { mode: "owner", project: data };
  }

  if (viewer.email && isAdminEmail(viewer.email)) {
    return { mode: "observer", project: data };
  }

  return { mode: "denied", project: null };
}

function toProjectViewerData(project: ProjectViewerRow): ProjectViewerData {
  const initialBrief = parseProjectBrief(project.brief, project.prompt);
  return {
    buildStatus: project.buildStatus,
    createdAt: project.createdAt.toISOString(),
    initialBrief,
    initialChatPage: getProjectChatPage(
      parseProjectChatMessages(project.chatMessages),
      null,
      4,
    ),
    initialPrompt: project.prompt,
    initialWorkspaceCard: parseWorkspaceCard(project.workspaceCard, initialBrief),
    model: project.model,
    owner: project.user,
    projectId: project.id,
    status: project.status,
    title: project.title,
    updatedAt: project.updatedAt.toISOString(),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/lib/admin-project-observer.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin-project-observer.ts src/lib/admin-project-observer.test.ts
git commit -m "feat(admin): add project observer access loader" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: Static observer component and route switch

**Files:**
- Create: `src/components/projects/AdminProjectObserver.tsx`
- Modify: `src/routes/_main.projects.$id.tsx`

**Interfaces:**
- Consumes: `ProjectViewerData` and `loadProjectForViewer()` from `src/lib/admin-project-observer.ts`.
- Produces: owner-normal and admin-observer rendering on `/projects/:id`.

- [ ] **Step 1: Create static observer component**

Create `src/components/projects/AdminProjectObserver.tsx`:

```tsx
import type { UIMessage } from "ai";

import type { ProjectViewerData } from "@/lib/admin/admin-project-observer";

import { getTextFromUIMessage } from "@/lib/projects/chat-memory";

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function messageLabel(message: UIMessage) {
  if (message.role === "user") {
    return "Pengguna";
  }
  if (message.role === "assistant") {
    return "AI";
  }
  return "Sistem";
}

export function AdminProjectObserver({ project }: { project: ProjectViewerData }) {
  const messages = project.initialChatPage.messages;
  const card = project.initialWorkspaceCard;
  const brief = project.initialBrief;
  const briefItems = [
    ["Nama usaha", brief.businessName],
    ["Jenis usaha", brief.businessType],
    ["Penawaran", brief.offer],
    ["Target pelanggan", brief.targetCustomer],
    ["CTA/kontak", brief.contactOrCta],
    ["Gaya", brief.stylePreference],
  ].filter(([, value]) => value);

  return (
    <main className="min-h-dvh bg-[#151515] px-spacing-4 py-spacing-6 text-surface-warm-white">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-spacing-5">
        <div className="rounded-radius-lg border border-surface-warm-white/14 bg-surface-warm-white/8 p-spacing-4 text-sm text-surface-warm-white/82">
          Mode admin baca-saja. Tidak ada aksi yang dikirim ke proyek pengguna.
        </div>

        <section className="rounded-radius-2xl border border-surface-warm-white/12 bg-surface-warm-white/5 p-spacing-5">
          <div className="flex flex-col gap-spacing-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm text-surface-warm-white/58">Proyek pengguna</p>
              <h1 className="mt-spacing-1 text-2xl font-semibold text-surface-warm-white">
                {project.title}
              </h1>
              <p className="mt-spacing-2 text-sm text-surface-warm-white/70">
                {project.owner.name ?? "Tanpa nama"} · {project.owner.email ?? "Tanpa email"}
              </p>
            </div>
            <div className="flex flex-wrap gap-spacing-2 text-xs text-surface-warm-white/70">
              <span className="rounded-radius-sm border border-surface-warm-white/12 px-spacing-2 py-spacing-1">
                {project.status}
              </span>
              <span className="rounded-radius-sm border border-surface-warm-white/12 px-spacing-2 py-spacing-1">
                Build: {project.buildStatus}
              </span>
            </div>
          </div>
          <dl className="mt-spacing-4 grid gap-spacing-3 text-sm text-surface-warm-white/70 sm:grid-cols-2">
            <div>
              <dt className="text-surface-warm-white/48">Dibuat</dt>
              <dd>{formatDate(project.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-surface-warm-white/48">Diperbarui</dt>
              <dd>{formatDate(project.updatedAt)}</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-radius-2xl border border-surface-warm-white/12 bg-surface-warm-white/5 p-spacing-5">
          <h2 className="text-lg font-semibold">Prompt awal</h2>
          <p className="mt-spacing-3 whitespace-pre-wrap text-sm leading-6 text-surface-warm-white/78">
            {project.initialPrompt || "Tidak ada prompt awal."}
          </p>
        </section>

        <section className="rounded-radius-2xl border border-surface-warm-white/12 bg-surface-warm-white/5 p-spacing-5">
          <h2 className="text-lg font-semibold">Ringkasan rancangan</h2>
          {card.type === "build_recommendation" ? (
            <div className="mt-spacing-3">
              <p className="font-medium">{card.title}</p>
              <ul className="mt-spacing-2 list-disc space-y-spacing-1 pl-spacing-5 text-sm text-surface-warm-white/72">
                {card.summary.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : card.type === "question" ? (
            <p className="mt-spacing-3 text-sm text-surface-warm-white/72">
              Pertanyaan aktif: {card.question.question}
            </p>
          ) : briefItems.length ? (
            <dl className="mt-spacing-3 grid gap-spacing-3 text-sm sm:grid-cols-2">
              {briefItems.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-surface-warm-white/48">{label}</dt>
                  <dd className="text-surface-warm-white/78">{value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="mt-spacing-3 text-sm text-surface-warm-white/60">
              Belum ada ringkasan rancangan.
            </p>
          )}
        </section>

        <section className="rounded-radius-2xl border border-surface-warm-white/12 bg-surface-warm-white/5 p-spacing-5">
          <h2 className="text-lg font-semibold">Chat proyek</h2>
          {project.initialChatPage.hasMore ? (
            <p className="mt-spacing-1 text-xs text-surface-warm-white/52">
              Menampilkan pesan terbaru.
            </p>
          ) : null}
          {messages.length ? (
            <div className="mt-spacing-4 flex flex-col gap-spacing-3">
              {messages.map((message) => (
                <article
                  className="rounded-[18px] border border-surface-warm-white/10 bg-[#242421] p-spacing-4 text-sm text-surface-warm-white/78"
                  key={message.id}
                >
                  <p className="mb-spacing-2 text-xs font-medium text-surface-warm-white/48">
                    {messageLabel(message)}
                  </p>
                  <p className="whitespace-pre-wrap leading-6">
                    {getTextFromUIMessage(message) || "[pesan non-teks]"}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <p className="mt-spacing-3 text-sm text-surface-warm-white/60">
              Belum ada chat tersimpan.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Modify `/projects/:id` route to switch by access mode**

Replace `src/routes/_main.projects.$id.tsx` with:

```tsx
import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

import type { ProjectBrief, WorkspaceCard } from "@/lib/projects/brief";
import type { UIMessage } from "ai";

import { AdminProjectObserver } from "@/components/projects/AdminProjectObserver";
import { ClearProjectDraft } from "@/components/projects/dashboard/ClearProjectDraft";
import { WorkspaceShell } from "@/components/projects/workspace/WorkspaceShell";
import { auth } from "@/lib/auth/auth";
import { loadProjectForViewer } from "@/lib/admin/admin-project-observer";

const loadProject = createServerFn({ method: "GET" })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const session = await auth();

    if (!session?.user?.id) {
      throw redirect({ to: "/" });
    }

    const result = await loadProjectForViewer({
      projectId: data.id,
      viewer: { email: session.user.email, id: session.user.id },
    });

    if (result.mode === "denied") {
      throw notFound();
    }

    return {
      mode: result.mode,
      projectJson: JSON.stringify(result.project),
    };
  });

export const Route = createFileRoute("/_main/projects/$id")({
  loader: ({ params }) => loadProject({ data: { id: params.id } }),
  component: ProjectPage,
});

function ProjectPage() {
  const data = Route.useLoaderData();
  const project = JSON.parse(data.projectJson);

  if (data.mode === "observer") {
    return <AdminProjectObserver project={project} />;
  }

  const initialMessages = project.initialChatPage.messages as UIMessage[];
  const initialWorkspaceCard = project.initialWorkspaceCard as WorkspaceCard;
  const initialBrief = project.initialBrief as ProjectBrief;

  return (
    <>
      <ClearProjectDraft />
      <WorkspaceShell
        projectId={project.projectId}
        initialTitle={project.title}
        initialPrompt={project.initialPrompt}
        initialStatus={project.status}
        initialMessages={initialMessages}
        initialChatCursor={project.initialChatPage.nextCursor}
        initialChatHasMore={project.initialChatPage.hasMore}
        initialWorkspaceCard={initialWorkspaceCard}
        initialBrief={initialBrief}
      />
    </>
  );
}
```

- [ ] **Step 3: Run focused test and typecheck**

Run: `bun test src/lib/admin-project-observer.test.ts && bun run typecheck`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/projects/AdminProjectObserver.tsx src/routes/_main.projects.$id.tsx
git commit -m "feat(admin): render project observer for non-owner admins" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: Link admin project rows to project detail

**Files:**
- Modify: `src/routes/_main.admin.projects.tsx`

**Interfaces:**
- Consumes: `/projects/:id` observer behavior from Task 2.
- Produces: clickable project titles on `/admin/projects`.

- [ ] **Step 1: Add links to project titles**

Modify the `h2` title block in `src/routes/_main.admin.projects.tsx` from plain text to a link:

```tsx
<h2 className="truncate font-medium text-surface-warm-white">
  <a className="underline-offset-2 hover:underline" href={`/projects/${project.id}`}>
    {streamerMode ? (
      <SensitiveText kind="name" value={project.title} />
    ) : (
      project.title
    )}
  </a>
</h2>
```

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/routes/_main.admin.projects.tsx
git commit -m "feat(admin): link project list to observer view" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: Final verification

**Files:**
- No new files expected.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: verified handoff.

- [ ] **Step 1: Run focused behavior checks**

Run: `bun test src/lib/admin-project-observer.test.ts src/lib/admin-projects.test.ts`

Expected: PASS.

- [ ] **Step 2: Run full local gate**

Run: `bun run check`

Expected: PASS.

- [ ] **Step 3: Inspect working tree**

Run: `git status --short --untracked-files=all`

Expected: only unrelated pre-existing files remain unstaged if any. Do not stage unrelated files.

- [ ] **Step 4: Report result**

Report:

```text
Implemented read-only admin observer on `/projects/:id` for non-owner admins.
Checks: focused observer tests PASS; `bun run check` PASS.
```

---

## Self-Review

- Spec coverage: shared `/projects/:id` access, owner unchanged, admin observer, denied non-owner, static read-only UI, no `WorkspaceShell` in observer path, admin projects row links, focused test, and full gate all map to tasks above.
- Placeholder scan: no placeholders, TBDs, or vague implementation steps remain.
- Type consistency: `ProjectViewerData`, `ProjectViewerLoad`, and `loadProjectForViewer()` match across tasks.
