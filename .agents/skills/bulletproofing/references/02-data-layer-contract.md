# 02 — The Data Layer Contract: The Triple-Threat Pattern

The canonical standard for client-server communication, schema validation, and cache synchronization.

---

## 1. The Core Problem with Ad-Hoc Fetching

In undisciplined codebases:
- API calls are made inline via raw `fetch()` inside arbitrary `useEffect` hooks.
- Payload types are hand-written and easily get out of sync with actual server responses.
- After a mutation succeeds (e.g. renaming a project), related lists fail to update because there is no standardized cache invalidation.
- Error handling is inconsistently caught, leaving UI spinners hanging indefinitely.

---

## 2. The Triple-Threat Pattern

Every data interaction (query or mutation) MUST be encapsulated as a cohesive triple:

```
┌────────────────────────────────────────────────────────┐
│ 1. Zod Contract (Validation & Inferred Types)          │
│    - Runtime boundary protection                       │
│    - Compile-time type inference                       │
└──────────────────────────┬─────────────────────────────┘
                           │ feeds
                           ▼
┌────────────────────────────────────────────────────────┐
│ 2. Pure Fetcher / Server Function                      │
│    - Framework-agnostic pure async function            │
│    - Directly testable without React test renderer     │
└──────────────────────────┬─────────────────────────────┘
                           │ wrapped by
                           ▼
┌────────────────────────────────────────────────────────┐
│ 3. TanStack Query Hook / Query Options                 │
│    - Standardized queryKey factory                     │
│    - Automatic cache invalidation on mutation success  │
└────────────────────────────────────────────────────────┘
```

---

## 3. Concrete Implementation: Queries

```typescript
// src/lib/projects/api/get-project.ts
import { queryOptions, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { apiClient } from "@/lib/api-client";

// 1. Zod Schema & Contract
export const projectSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(["draft", "building", "ready", "failed"]),
  updatedAt: z.string(),
});

export type ProjectSummary = z.infer<typeof projectSummarySchema>;

// 2. Pure Fetcher Function
export async function getProject(projectId: string): Promise<ProjectSummary> {
  const response = await apiClient.get(`/api/projects/${projectId}`);
  return projectSummarySchema.parse(response.data);
}

// 3. Query Options Factory & Hook
export function getProjectQueryOptions(projectId: string) {
  return queryOptions({
    queryKey: ["projects", projectId] as const,
    queryFn: () => getProject(projectId),
    staleTime: 1000 * 30, // 30 seconds
  });
}

export function useProject(projectId: string) {
  return useQuery(getProjectQueryOptions(projectId));
}
```

---

## 4. Concrete Implementation: Mutations with Automatic Invalidation

```typescript
// src/lib/projects/api/update-project-title.ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { apiClient } from "@/lib/api-client";
import { getProjectQueryOptions } from "./get-project";

// 1. Zod Mutation Contract
export const updateProjectTitleInputSchema = z.object({
  projectId: z.string(),
  title: z.string().trim().min(1, "Title cannot be empty").max(100),
});

export type UpdateProjectTitleInput = z.infer<typeof updateProjectTitleInputSchema>;

// 2. Pure Mutation Function
export async function updateProjectTitle(input: UpdateProjectTitleInput): Promise<{ success: boolean }> {
  const parsed = updateProjectTitleInputSchema.parse(input);
  const response = await apiClient.patch(`/api/projects/${parsed.projectId}/title`, {
    title: parsed.title,
  });
  return response.data;
}

// 3. Mutation Hook with Guaranteed Cache Sync
export function useUpdateProjectTitle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateProjectTitle,
    onSuccess: (_data, variables) => {
      // Invalidate the specific project cache immediately
      queryClient.invalidateQueries({
        queryKey: getProjectQueryOptions(variables.projectId).queryKey,
      });
      // Invalidate the general project lists
      queryClient.invalidateQueries({
        queryKey: ["projects", "list"],
      });
    },
  });
}
```

---

## 5. State Taxonomy Discipline: What Goes Where

Never mix state boundaries:

| State Type | Canonical Tool | Example | Anti-Pattern to Avoid |
|---|---|---|---|
| **Server Cache** | TanStack Query | Project details, user profiles, invoices | ❌ Copying fetched data into Zustand or Redux |
| **URL State** | TanStack Router search params | Tab selection (`?tab=code`), search filters, page number | ❌ Putting active filters in local `useState` (loses bookmarkability) |
| **Form State** | React Hook Form + Zod | Multi-step brief inputs, profile editor | ❌ Managing 15 input states with individual `useState` |
| **Local UI State** | `useState`, `useReducer` | Modal visibility, dropdown toggle, hover preview | ❌ Putting open/close flags in global app stores |
| **Global App State** | Zustand / Context | Active workspace session, notification toasts, theme | ❌ Storing domain business collections globally |
