# Realtime Frontend Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the homepage's over-limit banners and project list reflect server state instantly after any in-app mutation, by routing every mutation through one helper that does optimistic cache patch → invalidate → rollback on error.

**Architecture:** Add a `useCacheMutation` hook to `src/lib/query-client.ts` that wraps `useMutation` with snapshot/rollback semantics. Add a `useProjectLimit` hook to `src/lib/projects/use-project-limit.ts` that reads the existing `queryKeys.projects` cache. Convert the existing five mutations (`ProjectList.deleteMutation`, `HomePromptForm.createMutation`, `WorkspaceShell.saveProjectTitle`, build-done, edit-done) to use the new helper. Drop the three stale `projectCount`/`projectLimit`/`overProjectLimit` props from `_main.index.tsx` and have both banners read from the new hook.

**Tech Stack:** TanStack Query 5.101.2, TanStack Router 1.170.18, React 19.2.7, sonner toasts, Vitest 4.1.9 (node env).

## Global Constraints

- Bun 1.3.9, `bun.lock` only — never install npm/yarn/pnpm lockfiles.
- TypeScript strict — no `any`, no `@ts-ignore`. Use `unknown` and narrow.
- React 19: hooks must be called inside function components or other hooks.
- `vitest` unit project runs in `node` environment; do not import DOM-only APIs (`document`, `window`) in unit tests.
- Use the `@/` import alias (resolves to `src/`).
- All code in Indonesian for user-facing strings, English for code identifiers.
- Conventional commits via `bun run commit` (commitlint enforced). Conventional commit subject under 72 chars.
- `bun run check` must pass before pushing: `check:locks` → `routes:generate` → `format` → `lint` → `typecheck` → `test` → `knip`.
- `queryKeys` already exports: `energy`, `verification`, `projects`, `projectRuntime(id)`, `projectWorkspace(id)`, `projectSource(id)`, `projectChat(id)` (`src/lib/query-client.ts:5-16`).
- `createAppQueryClient()` already sets `staleTime: 10_000`, `gcTime: 5*60_000`, `retry: 1`, `refetchOnWindowFocus: true`, mutation `retry: 0` (`src/lib/query-client.ts:18-32`).
- `fetchJson<T>(input, init?)` already wraps `fetch` + `parseApiResponse` (`src/lib/query-client.ts:34-54`).

---

## File Structure

| File | Role |
|------|------|
| `src/lib/query-client.ts` (modify) | Add `useCacheMutation` hook and its types. |
| `src/lib/projects/use-project-limit.ts` (create) | Pure helper `readProjectLimitFromCache(cache)` + `useProjectLimit()` hook. |
| `src/lib/projects/use-project-limit.test.ts` (create) | Unit test for the pure read function. |
| `src/lib/query-client.test.ts` (create) | Unit test for the `useCacheMutation` snapshot/rollback logic via a pure reducer. |
| `src/components/projects/ProjectList.tsx` (modify) | Drop three props, use `useProjectLimit`, convert `deleteMutation` to `useCacheMutation`. |
| `src/components/projects/HomePromptForm.tsx` (modify) | Drop `overProjectLimit` prop, use `useProjectLimit`, convert `createMutation` to `useCacheMutation`, swap `removeQueries` → `invalidateQueries`. |
| `src/components/projects/WorkspaceShell.tsx` (modify) | Three mutation sites: `saveProjectTitle`, build-done, edit-done. Each uses `useCacheMutation` with optimistic patch on `queryKeys.projects`. |
| `src/routes/_main.index.tsx` (modify) | Stop passing the three props to `ProjectList` and `HomePromptForm`. Loader unchanged. |
| `tests/integration/homepage-cache.test.ts` (create) | Integration: with a fake `QueryClient`, exercise the optimistic patch + invalidate + rollback flow. |

---

## Task 1: `useCacheMutation` helper in `query-client.ts`

**Files:**
- Modify: `src/lib/query-client.ts`
- Test: `src/lib/query-client.test.ts` (new)

**Interfaces:**
- Consumes: `useMutation`, `useQueryClient` from `@tanstack/react-query`; `toast` from `sonner`.
- Produces:
  - `CachePatch = { queryKey: readonly unknown[]; updater: (previous: unknown) => unknown }`
  - `useCacheMutation<TData, TVariables>(options: CacheMutationOptions<TData, TVariables>)` returning a `UseMutationResult` whose `mutate(variables)` first snapshots every `optimisticPatches[*].queryKey` cache entry, applies the updaters, then runs `mutationFn`; on `onSuccess` invalidates every `invalidateKeys` entry with `refetchType: "active"`; on `onError` restores snapshots and toasts `errorMessage`.
  - Pure helper `applyPatches<T>(snapshot: T, patches: CachePatch[]): T` and `restoreSnapshots(snapshots: Map<string, unknown>, client: QueryClient): void` — both exported for testing.

- [ ] **Step 1: Write the failing test for the pure patch + restore helpers**

Create `src/lib/query-client.test.ts`:

```ts
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { applyPatches, restoreSnapshots, type CachePatch } from "./query-client";

describe("useCacheMutation helpers", () => {
  it("applies patches in order and returns a new reference", () => {
    const initial = { count: 6, limit: 5, overLimit: true };
    const patches: CachePatch[] = [
      {
        queryKey: ["projects"],
        updater: (previous: unknown) => {
          const data = previous as { count: number; limit: number; overLimit: boolean };
          return { ...data, count: data.count - 1, overLimit: data.count - 1 > data.limit };
        },
      },
    ];

    const next = applyPatches(initial, patches);

    expect(next).toEqual({ count: 5, limit: 5, overLimit: false });
    expect(next).not.toBe(initial);
  });

  it("restores snapshots by writing the captured value back to the cache", () => {
    const client = new QueryClient();
    const key = ["projects"];
    const original = { count: 6, limit: 5, overLimit: true };
    client.setQueryData(key, original);

    const snapshots = new Map<string, unknown>([[JSON.stringify(key), original]]);
    client.setQueryData(key, { count: 5, limit: 5, overLimit: false });

    restoreSnapshots(snapshots, client);

    expect(client.getQueryData(key)).toEqual(original);
  });
});
```

- [ ] **Step 2: Run test, expect it to fail (imports not yet defined)**

Run: `bun run test -- src/lib/query-client.test.ts`
Expected: FAIL — module `./query-client` does not export `applyPatches`, `restoreSnapshots`, or `CachePatch`.

- [ ] **Step 3: Add the helpers to `src/lib/query-client.ts`**

Append to the end of the file:

```ts
import {
  useMutation,
  useQueryClient,
  type QueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import { useRef } from "react";
import { toast } from "sonner";

export type CachePatch = {
  queryKey: readonly unknown[];
  updater: (previous: unknown) => unknown;
};

export type CacheMutationOptions<TData, TVariables> = {
  errorMessage?: string;
  invalidateKeys?: readonly (readonly unknown[])[];
  mutationFn: (variables: TVariables) => Promise<TData>;
  onError?: (error: Error, variables: TVariables) => void;
  onSuccess?: (data: TData, variables: TVariables) => void | Promise<void>;
  optimisticPatches?: readonly CachePatch[];
  successMessage?: string;
};

export function applyPatches<T>(previous: T, patches: readonly CachePatch[]): T {
  return patches.reduce(
    (current, patch) => patch.updater(current) as T,
    previous,
  );
}

export function restoreSnapshots(
  snapshots: Map<string, unknown>,
  client: QueryClient,
): void {
  for (const [serialized, value] of snapshots) {
    const queryKey = JSON.parse(serialized) as readonly unknown[];
    client.setQueryData(queryKey, value);
  }
}

function snapshotKey(queryKey: readonly unknown[]): string {
  return JSON.stringify(queryKey);
}

export function useCacheMutation<TData, TVariables>(
  options: CacheMutationOptions<TData, TVariables>,
): UseMutationResult<TData, Error, TVariables> {
  const queryClient = useQueryClient();
  const snapshotsRef = useRef<Map<string, unknown> | null>(null);

  return useMutation<TData, Error, TVariables>({
    mutationFn: options.mutationFn,
    onMutate: async (variables) => {
      const patches = options.optimisticPatches ?? [];
      const snapshots = new Map<string, unknown>();

      for (const patch of patches) {
        const key = snapshotKey(patch.queryKey);
        snapshots.set(key, queryClient.getQueryData(patch.queryKey));
        queryClient.setQueryData(
          patch.queryKey,
          (previous: unknown) => patch.updater(previous),
        );
      }

      snapshotsRef.current = snapshots;
      return variables;
    },
    onSuccess: async (data, variables) => {
      if (options.invalidateKeys) {
        await Promise.all(
          options.invalidateKeys.map((key) =>
            queryClient.invalidateQueries({
              queryKey: key as readonly unknown[],
              refetchType: "active",
            }),
          ),
        );
      }

      if (options.successMessage) {
        toast.success(options.successMessage);
      }

      await options.onSuccess?.(data, variables);
    },
    onError: (error, variables) => {
      const snapshots = snapshotsRef.current;

      if (snapshots) {
        restoreSnapshots(snapshots, queryClient);
      }

      toast.error(
        options.errorMessage ?? "Belum berhasil, coba lagi sebentar.",
      );
      options.onError?.(error, variables);
      snapshotsRef.current = null;
    },
    onSettled: () => {
      snapshotsRef.current = null;
    },
  });
}
```

- [ ] **Step 4: Run test, expect it to pass**

Run: `bun run test -- src/lib/query-client.test.ts`
Expected: PASS — 2 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/query-client.ts src/lib/query-client.test.ts
git run commit
```

Commit message: `feat(query-client): add useCacheMutation helper`

---

## Task 2: `useProjectLimit` hook + pure read function

**Files:**
- Create: `src/lib/projects/use-project-limit.ts`
- Create: `src/lib/projects/use-project-limit.test.ts`

**Interfaces:**
- Consumes: `useQueryClient` from `@tanstack/react-query`; `queryKeys` from `@/lib/query-client`; `Route` from `@/routes/_main.index` (used via `Route.useLoaderData`).
- Produces:
  - `readProjectLimitFromCache(cache: { pages: Array<{ projectCount?: number; projectLimit?: number; overProjectLimit?: boolean }> } | undefined): { count: number; limit: number; overLimit: boolean } | null` — returns the first page's triplet, or `null` when cache is empty.
  - `useProjectLimit(): { count: number; limit: number; overLimit: boolean }` — reads cache via `useQueryClient().getQueryCache().find(...)`, falls back to `Route.useLoaderData()` for first-paint SSR.

- [ ] **Step 1: Write the failing test for the pure read function**

Create `src/lib/projects/use-project-limit.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { readProjectLimitFromCache } from "./use-project-limit";

describe("readProjectLimitFromCache", () => {
  it("returns null when the cache is undefined", () => {
    expect(readProjectLimitFromCache(undefined)).toBeNull();
  });

  it("returns the first page's triplet when present", () => {
    const cache = {
      pages: [
        { projectCount: 6, projectLimit: 5, overProjectLimit: true },
        { projectCount: 6, projectLimit: 5, overProjectLimit: true },
      ],
      pageParams: [null],
    };

    expect(readProjectLimitFromCache(cache)).toEqual({
      count: 6,
      limit: 5,
      overLimit: true,
    });
  });

  it("returns null when the first page is missing the triplet", () => {
    const cache = { pages: [{}], pageParams: [null] };
    expect(readProjectLimitFromCache(cache)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test, expect it to fail**

Run: `bun run test -- src/lib/projects/use-project-limit.test.ts`
Expected: FAIL — module `./use-project-limit` does not export `readProjectLimitFromCache`.

- [ ] **Step 3: Implement the hook**

Create `src/lib/projects/use-project-limit.ts`:

```ts
import { useQueryClient } from "@tanstack/react-query";

import { Route as HomeRoute } from "@/routes/_main.index";
import { queryKeys } from "@/lib/query-client";

type ProjectsCache = {
  pages: Array<{
    projectCount?: number;
    projectLimit?: number;
    overProjectLimit?: boolean;
  }>;
  pageParams: unknown[];
};

export type ProjectLimitInfo = {
  count: number;
  limit: number;
  overLimit: boolean;
};

export function readProjectLimitFromCache(
  cache: ProjectsCache | undefined,
): ProjectLimitInfo | null {
  const firstPage = cache?.pages[0];

  if (
    !cache ||
    !firstPage ||
    typeof firstPage.projectCount !== "number" ||
    typeof firstPage.projectLimit !== "number" ||
    typeof firstPage.overProjectLimit !== "boolean"
  ) {
    return null;
  }

  return {
    count: firstPage.projectCount,
    limit: firstPage.projectLimit,
    overLimit: firstPage.overProjectLimit,
  };
}

export function useProjectLimit(): ProjectLimitInfo {
  const queryClient = useQueryClient();
  const cache = queryClient.getQueryData<ProjectsCache>(queryKeys.projects);
  const fromCache = readProjectLimitFromCache(cache);

  if (fromCache) {
    return fromCache;
  }

  const loader = HomeRoute.useLoaderData() as {
    overProjectLimit: boolean;
    projectCount: number;
    projectLimit: number;
  };

  return {
    count: loader.projectCount,
    limit: loader.projectLimit,
    overLimit: loader.overProjectLimit,
  };
}
```

- [ ] **Step 4: Run test, expect it to pass**

Run: `bun run test -- src/lib/projects/use-project-limit.test.ts`
Expected: PASS — 3 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/projects/use-project-limit.ts src/lib/projects/use-project-limit.test.ts
bun run commit
```

Commit message: `feat(projects): add useProjectLimit hook`

---

## Task 3: `ProjectList` consumes `useProjectLimit` and uses `useCacheMutation` for delete

**Files:**
- Modify: `src/components/projects/ProjectList.tsx`

**Interfaces:**
- Consumes: `useProjectLimit` from `@/lib/projects/use-project-limit`; `useCacheMutation`, `queryKeys` from `@/lib/query-client`; `createProjectMark` from `./project-mark`.
- Produces: Same public component, but with `projectCount`, `projectLimit`, `overProjectLimit` props removed.

- [ ] **Step 1: Update the imports and prop type**

In `src/components/projects/ProjectList.tsx`:

Replace the top imports block (lines 1-23) with:

```tsx
"use client";

import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { createProjectMark } from "./project-mark";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Image } from "@/components/ui/image";
import { Link } from "@/components/ui/link";
import { fetchJson, queryKeys, useCacheMutation } from "@/lib/query-client";
import { useProjectLimit } from "@/lib/projects/use-project-limit";
```

- [ ] **Step 2: Drop the three props from the type and the function signature**

In `src/components/projects/ProjectList.tsx`, replace the `ProjectListProps` type (lines 34-41) with:

```tsx
type ProjectListProps = {
  initialProjects: Project[];
  initialNextCursor: string | null;
  deleteProject: (formData: FormData) => Promise<void>;
};
```

Replace the function signature (lines 48-55) with:

```tsx
export function ProjectList({
  initialProjects,
  initialNextCursor,
  deleteProject,
}: ProjectListProps) {
  const queryClient = useQueryClient();
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const { count, limit, overLimit } = useProjectLimit();
```

- [ ] **Step 3: Replace the `deleteMutation` with `useCacheMutation`**

In `src/components/projects/ProjectList.tsx`, replace the `deleteMutation` block (lines 84-122) with:

```tsx
  const deleteMutation = useCacheMutation<string, string>({
    mutationFn: async (projectId) => {
      const formData = new FormData();
      formData.set("projectId", projectId);
      await deleteProject(formData);
      return projectId;
    },
    optimisticPatches: [
      {
        queryKey: queryKeys.projects,
        updater: (previous) => {
          const data = previous as
            | {
                pages: Array<{
                  projectCount?: number;
                  projectLimit?: number;
                  overProjectLimit?: boolean;
                  projects: Project[];
                }>;
                pageParams: unknown[];
              }
            | undefined;

          if (!data) {
            return data;
          }

          return {
            ...data,
            pages: data.pages.map((page) => {
              if (page.projectCount === undefined) {
                return page;
              }
              const nextCount = Math.max(0, page.projectCount - 1);
              const projectLimit = page.projectLimit ?? nextCount;
              return {
                ...page,
                projectCount: nextCount,
                projects: page.projects.filter(
                  (project) => project.id !== selectedProject?.id,
                ),
                overProjectLimit: nextCount > projectLimit,
              };
            }),
          };
        },
      },
    ],
    invalidateKeys: [queryKeys.projects],
    successMessage: "Website dihapus.",
    errorMessage: "Website belum berhasil dihapus.",
    onSuccess: () => {
      setSelectedProject(null);
    },
  });
```

- [ ] **Step 4: Use `useProjectLimit` values for the over-limit banner**

In `src/components/projects/ProjectList.tsx`, replace the banner JSX (lines 168-184) with:

```tsx
      {overLimit ? (
        <div className="mb-spacing-6 flex items-start gap-spacing-3 rounded-radius-xl border border-yellow-500/24 bg-yellow-500/[0.06] px-spacing-5 py-spacing-4">
          <span className="mt-0.5 text-yellow-400" aria-hidden>
            ⚠️
          </span>
          <div className="text-sm leading-6 text-surface-warm-white/78">
            Kamu punya{" "}
            <strong className="font-semibold text-surface-warm-white">
              {count} website
            </strong>
            , melebihi batas {limit}. Kamu masih bisa menggunakannya semua,
            tapi sebaiknya hapus yang tidak terpakai agar mudah dikelola.
          </div>
        </div>
      ) : null}
```

- [ ] **Step 5: Run typecheck and unit tests**

Run: `bun run typecheck`
Expected: 0 errors. (The unused `useQueryClient` import may surface as a lint warning — keep it; `ProjectList` still calls `useQueryClient` for the `useInfiniteQuery` cache. Confirm it is not flagged as unused.)

Run: `bun run test -- src/components/projects/ProjectList.test.ts` (or omit `.test.ts` if it does not exist; the file currently has no dedicated test.)
Expected: PASS (existing tests unaffected).

- [ ] **Step 6: Commit**

```bash
git add src/components/projects/ProjectList.tsx
bun run commit
```

Commit message: `feat(projects): live project limit + optimistic delete in ProjectList`

---

## Task 4: `HomePromptForm` consumes `useProjectLimit` and uses `useCacheMutation` for create

**Files:**
- Modify: `src/components/projects/HomePromptForm.tsx`

**Interfaces:**
- Consumes: `useProjectLimit` from `@/lib/projects/use-project-limit`; `useCacheMutation`, `queryKeys` from `@/lib/query-client`.
- Produces: Same public component, but with the `overProjectLimit` prop removed.

- [ ] **Step 1: Update imports**

In `src/components/projects/HomePromptForm.tsx`, replace line 28:

```ts
import { queryKeys } from "@/lib/query-client";
```

with:

```ts
import { queryKeys, useCacheMutation } from "@/lib/query-client";
import { useProjectLimit } from "@/lib/projects/use-project-limit";
```

- [ ] **Step 2: Drop the `overProjectLimit` prop and use the hook**

In `src/components/projects/HomePromptForm.tsx`, replace lines 52-56:

```tsx
export function HomePromptForm({
  overProjectLimit = false,
}: {
  overProjectLimit?: boolean;
}) {
```

with:

```tsx
export function HomePromptForm() {
  const { overLimit } = useProjectLimit();
```

- [ ] **Step 3: Replace the `createMutation` with `useCacheMutation` and switch `removeQueries` to `invalidateQueries`**

In `src/components/projects/HomePromptForm.tsx`, replace the `createMutation` block (lines 100-150) with:

```tsx
  const createMutation = useCacheMutation<
    { id: string; path: string },
    string
  >({
    mutationFn: async (value) => {
      const idempotencyKey = getProjectCreateIdempotencyKey(value);
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({ prompt: value }),
      });
      const result = (await response.json().catch(() => null)) as {
        id?: string;
        message?: string;
        path?: string;
      } | null;

      if (!response.ok || !result?.id || !result?.path) {
        throw new Error(result?.message || "Gagal membuat website.");
      }

      return { id: result.id, path: result.path };
    },
    invalidateKeys: [queryKeys.projects, queryKeys.energy],
    onSuccess: async (data) => {
      // Force a refetch so home sees the new project after create.
      window.localStorage.removeItem(PROJECT_DRAFT_STORAGE_KEY);
      router.push(data.path);
    },
  });
```

- [ ] **Step 4: Use `overLimit` for the banner**

In `src/components/projects/HomePromptForm.tsx`, replace line 230:

```tsx
  if (overProjectLimit) {
```

with:

```tsx
  if (overLimit) {
```

- [ ] **Step 5: Typecheck**

Run: `bun run typecheck`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/projects/HomePromptForm.tsx
bun run commit
```

Commit message: `feat(prompt): live project limit + optimistic create invalidation`

---

## Task 5: `_main.index.tsx` stops passing the three props

**Files:**
- Modify: `src/routes/_main.index.tsx`

**Interfaces:**
- Consumes: existing route loader.
- Produces: `ProjectList` and `HomePromptForm` no longer receive `projectCount`, `projectLimit`, `overProjectLimit`.

- [ ] **Step 1: Drop the props from `ProjectList`**

In `src/routes/_main.index.tsx`, replace the `<ProjectList>` invocation (lines 214-221) with:

```tsx
                <div className="mt-spacing-10">
                  <ProjectList
                    initialProjects={initialProjects}
                    initialNextCursor={initialNextCursor}
                    deleteProject={deleteProject}
                  />
                </div>
```

- [ ] **Step 2: Drop the prop from `HomePromptForm`**

In `src/routes/_main.index.tsx`, replace line 192:

```tsx
          <HeroMotionItem className="w-full">
            <HomePromptForm overProjectLimit={overProjectLimit} />
          </HeroMotionItem>
```

with:

```tsx
          <HeroMotionItem className="w-full">
            <HomePromptForm />
          </HeroMotionItem>
```

- [ ] **Step 3: Typecheck and lint**

Run: `bun run typecheck && bun run lint`
Expected: 0 errors, 0 warnings.

- [ ] **Step 4: Commit**

```bash
git add src/routes/_main.index.tsx
bun run commit
```

Commit message: `refactor(home): drop limit props from ProjectList and HomePromptForm`

---

## Task 6: `WorkspaceShell` — `saveProjectTitle` uses `useCacheMutation` and patches the list

**Files:**
- Modify: `src/components/projects/WorkspaceShell.tsx`

**Interfaces:**
- Consumes: `useCacheMutation`, `queryKeys` from `@/lib/query-client`; existing `projectId`, `projectTitle`, `setProjectTitle`, `setDraftTitle`, `setIsRenaming`.
- Produces: A mutation that, on success, patches the matching project entry in `queryKeys.projects` page 0 (`title` field) and invalidates the key.

- [ ] **Step 1: Add imports**

In `src/components/projects/WorkspaceShell.tsx`, add the import at the top of the third-party import block:

```ts
import { useCacheMutation, queryKeys } from "@/lib/query-client";
```

- [ ] **Step 2: Replace the title-save call with `useCacheMutation`**

In `src/components/projects/WorkspaceShell.tsx`, replace the `saveProjectTitle` function (lines 1525-1554) with:

```tsx
  const saveTitleMutation = useCacheMutation<
    { title: string },
    { title: string }
  >({
    mutationFn: async ({ title }) => {
      const response = await fetch(`/api/projects/${projectId}/title`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const result = (await response.json().catch(() => null)) as {
        title?: string;
      } | null;

      if (!response.ok || !result?.title) {
        throw new Error("Judul belum berhasil disimpan.");
      }

      return { title: result.title };
    },
    optimisticPatches: [
      {
        queryKey: queryKeys.projects,
        updater: (previous) => {
          const data = previous as
            | {
                pages: Array<{
                  projects: Array<{ id: string; title: string }>;
                }>;
                pageParams: unknown[];
              }
            | undefined;

          if (!data) {
            return data;
          }

          return {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              projects: page.projects.map((project) =>
                project.id === projectId
                  ? { ...project, title: draftTitle.trim() }
                  : project,
              ),
            })),
          };
        },
      },
    ],
    invalidateKeys: [queryKeys.projects],
    onSuccess: ({ title }) => {
      setProjectTitle(title);
      setDraftTitle(title);
    },
  });

  async function saveProjectTitle() {
    const title = draftTitle.trim();

    if (!title || title === projectTitle) {
      setIsRenaming(false);
      setDraftTitle(projectTitle);
      return;
    }

    setProjectTitle(title);
    setDraftTitle(title);

    try {
      await saveTitleMutation.mutateAsync({ title });
    } catch {
      setProjectTitle(projectTitle);
      setDraftTitle(projectTitle);
    } finally {
      setIsRenaming(false);
    }
  }
```

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/projects/WorkspaceShell.tsx
bun run commit
```

Commit message: `feat(workspace): optimistic title patch on saveProjectTitle`

---

## Task 7: `WorkspaceShell` — build-done and edit-done patch the list

**Files:**
- Modify: `src/components/projects/WorkspaceShell.tsx`

**Interfaces:**
- Consumes: existing build-done handler at line 768 and edit-done at line 1511.
- Produces: A shared pure helper `patchProjectInList(client, projectId, patch)` that the two handlers call after success, plus `invalidateQueries` to reconcile.

- [ ] **Step 1: Add a shared helper near the top of the component**

After the existing `useQueryClient` declaration (search for the existing `useQueryClient()` call in the file), add:

```tsx
  function patchProjectInList(
    projectPatch: Partial<{
      buildStatus: string | null;
      thumbnailBuildId: string | null;
      thumbnailRef: string | null;
      title: string;
    }>,
  ) {
    queryClient.setQueryData(
      queryKeys.projects,
      (previous) => {
        const data = previous as
          | {
              pages: Array<{
                projects: Array<{ id: string; title: string }>;
              }>;
              pageParams: unknown[];
            }
          | undefined;

        if (!data) {
          return data;
        }

        return {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            projects: page.projects.map((project) =>
              project.id === projectId
                ? { ...project, ...projectPatch }
                : project,
            ),
          })),
        };
      },
    );
  }
```

- [ ] **Step 2: Call `patchProjectInList` on build-done**

In `src/components/projects/WorkspaceShell.tsx`, inside the `if (eventName === "done")` block (around line 768), insert this call directly after `setBuildStatus("ready")`:

```tsx
            patchProjectInList({ buildStatus: "ready" });
            void loadRuntimeState();
            window.dispatchEvent(new Event("umkm:energy-changed"));
            void queryClient.invalidateQueries({ queryKey: queryKeys.projects, refetchType: "active" });
            void queryClient.invalidateQueries({ queryKey: queryKeys.energy });
```

(The lines after `setBuildStatus("ready")` in the existing file already include `void loadRuntimeState();` and the energy event/invalidation. Add the two new lines after them; do not duplicate.)

- [ ] **Step 3: Call `patchProjectInList` on edit-done**

In `src/components/projects/WorkspaceShell.tsx`, inside the edit-done success path (around line 1511), insert this call directly after `setBuildStatus("ready")`:

```tsx
            patchProjectInList({ buildStatus: "ready" });
            void loadRuntimeState();
            window.dispatchEvent(new Event("umkm:energy-changed"));
            void queryClient.invalidateQueries({ queryKey: queryKeys.projects, refetchType: "active" });
            void queryClient.invalidateQueries({ queryKey: queryKeys.energy });
```

(The lines after `setBuildStatus("ready")` in the existing file already include `setBuildProgress(...)`, `setActiveTab("preview")`, `setPreviewCollapsed(false)`, `void loadRuntimeState()`, the energy event, and the energy invalidation. Add the two new lines after them; do not duplicate.)

- [ ] **Step 4: Typecheck and lint**

Run: `bun run typecheck && bun run lint`
Expected: 0 errors, 0 warnings.

- [ ] **Step 5: Commit**

```bash
git add src/components/projects/WorkspaceShell.tsx
bun run commit
```

Commit message: `feat(workspace): patch list cache on build-done and edit-done`

---

## Task 8: Integration test for the optimistic + invalidate + rollback flow

**Files:**
- Create: `tests/integration/homepage-cache.test.ts`

**Interfaces:**
- Consumes: `useCacheMutation`, `applyPatches`, `restoreSnapshots` from `@/lib/query-client`; `QueryClient` from `@tanstack/react-query`.
- Produces: A node-env Vitest test that exercises the patch + invalidate + rollback flow against an in-memory `QueryClient` with a fake mutation function.

- [ ] **Step 1: Write the test**

Create `tests/integration/homepage-cache.test.ts`:

```ts
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import {
  applyPatches,
  fetchJson,
  queryKeys,
  restoreSnapshots,
  type CachePatch,
} from "@/lib/query-client";
import { readProjectLimitFromCache } from "@/lib/projects/use-project-limit";

type ProjectsPage = {
  projectCount: number;
  projectLimit: number;
  overProjectLimit: boolean;
  projects: Array<{ id: string; title: string }>;
};

function seedCache(client: QueryClient, firstPage: ProjectsPage): void {
  client.setQueryData(queryKeys.projects, {
    pages: [firstPage],
    pageParams: [null],
  });
}

function buildDeletePatch(deletedId: string): CachePatch {
  return {
    queryKey: queryKeys.projects,
    updater: (previous) => {
      const data = previous as
        | {
            pages: ProjectsPage[];
            pageParams: unknown[];
          }
        | undefined;

      if (!data) {
        return data;
      }

      return {
        ...data,
        pages: data.pages.map((page) => {
          const nextCount = Math.max(0, page.projectCount - 1);
          return {
            ...page,
            projectCount: nextCount,
            overProjectLimit: nextCount > page.projectLimit,
            projects: page.projects.filter(
              (project) => project.id !== deletedId,
            ),
          };
        }),
      };
    },
  };
}

describe("homepage cache consistency", () => {
  it("optimistic delete drops count and clears the over-limit banner", () => {
    const client = new QueryClient();
    seedCache(client, {
      projectCount: 6,
      projectLimit: 5,
      overProjectLimit: true,
      projects: [{ id: "p1", title: "Toko A" }],
    });

    const snapshot = client.getQueryData(queryKeys.projects);
    const next = applyPatches(snapshot, [buildDeletePatch("p1")]);
    client.setQueryData(queryKeys.projects, next);

    expect(readProjectLimitFromCache(next)).toEqual({
      count: 5,
      limit: 5,
      overLimit: false,
    });
  });

  it("rollback restores the original cache entry on error", () => {
    const client = new QueryClient();
    const original = {
      projectCount: 6,
      projectLimit: 5,
      overProjectLimit: true,
      projects: [{ id: "p1", title: "Toko A" }],
    } satisfies ProjectsPage;
    seedCache(client, original);

    const snapshotMap = new Map<string, unknown>([
      [JSON.stringify(queryKeys.projects), client.getQueryData(queryKeys.projects)],
    ]);
    client.setQueryData(queryKeys.projects, {
      pages: [
        {
          ...original,
          projectCount: 5,
          overProjectLimit: false,
          projects: [],
        },
      ],
      pageParams: [null],
    });

    restoreSnapshots(snapshotMap, client);

    expect(readProjectLimitFromCache(client.getQueryData(queryKeys.projects))).toEqual({
      count: 6,
      limit: 5,
      overLimit: true,
    });
  });

  it("fetchJson handles 401 by throwing a parseable error", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ message: "no" }), { status: 401 })) as typeof fetch;

    try {
      await expect(fetchJson("/api/projects")).rejects.toThrow();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
```

- [ ] **Step 2: Run the test, expect it to pass**

Run: `bun run test -- tests/integration/homepage-cache.test.ts`
Expected: PASS — 3 tests green.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/homepage-cache.test.ts
bun run commit
```

Commit message: `test(cache): integration coverage for homepage cache consistency`

---

## Task 9: Full repo check

**Files:** none modified.

- [ ] **Step 1: Run `bun run check`**

Run: `bun run check`
Expected: 0 errors across `check:locks`, `routes:generate`, `format`, `lint`, `typecheck`, `test`, `knip`.

- [ ] **Step 2: Manual smoke**

Run `bun run dev`. Open `http://localhost:3000`. Log in. Click delete on a project while over the limit. Confirm both banners disappear without a full reload. Rename a project in the workspace, navigate to `/`, confirm the list card shows the new title.

- [ ] **Step 3: Final commit if any formatting fix-ups were needed**

```bash
git add -A
bun run commit
```

Commit message: `chore: format fix-ups from bun run check`

---

## Self-Review Notes

1. **Spec coverage:** A1 (banner) → Task 3 + Task 5. A2 (create invalidates) → Task 4. A3 (rename) → Task 6. A4 (build/edit-done) → Task 7. H1 (`removeQueries` → `invalidateQueries`) → Task 4. Deferred items (cross-tab, pre-flight) explicitly excluded by the user's "just must-fix" decision.
2. **Placeholder scan:** No TBD/TODO. Every step has the exact code to paste.
3. **Type consistency:** `CachePatch`, `useCacheMutation`, `useProjectLimit`, `readProjectLimitFromCache`, `applyPatches`, `restoreSnapshots` defined in Task 1 + Task 2, used unchanged in Tasks 3-8. `queryKeys.projects` referenced in all tasks. `queryClient` is the same one from `useQueryClient` everywhere.
4. **One subtle point to flag:** Task 3's optimistic patch reads `selectedProject?.id` from the closure. Because `useCacheMutation` is called from inside the component, the `selectedProject` ref is captured at render time. The `mutate(selectedProject.id)` call in `handleDelete` only runs after the user clicks Hapus, and by that time `selectedProject` is the right one. Verified by reading `ProjectList.tsx:145-151`.
