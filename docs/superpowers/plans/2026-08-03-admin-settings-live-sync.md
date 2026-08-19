# Admin Settings Live Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After saving `feature.streamer_mode` on `/admin/settings`, admin UI (pill, masks, AuthButton) updates without a full browser reload, using the same mutate → invalidateQueries pattern as other admin mutations.

**Architecture:** Move live streamer mode from frozen route-loader context into React Query (`queryKeys.adminStreamerMode`). Loader still seeds `initialData`. Settings save invalidates both `["admin", "settings"]` and `adminStreamerMode`. `useStreamerMode()` API unchanged.

**Tech Stack:** TanStack Query, TanStack Router `createServerFn`, existing React context wrapper, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-03-admin-settings-live-sync-design.md`

## Global Constraints

- User-facing UI copy Indonesian; code/docs/logs English.
- Surgical edits only; no unrelated refactors.
- No `router.refresh()` / `router.invalidate()` / `window.location.reload()`.
- No new dependencies.
- Bun only. Pre-commit: `bun run check:commit`. Before handoff: `bun run check`.
- Do not commit unless asked.

## File structure

| File | Role |
|------|------|
| `src/lib/query-client.ts` | Canonical `queryKeys.adminStreamerMode` |
| `src/lib/admin-settings-sync.ts` | Pure list of query keys to invalidate after settings save (testable) |
| `src/lib/admin-settings-sync.test.ts` | Unit tests for that list |
| `src/routes/_main.admin.tsx` | Export `loadStreamerMode`; seed provider |
| `src/components/admin/streamer-mode-context.tsx` | Provider reads React Query |
| `src/routes/_main.admin.settings.tsx` | Call invalidate helper on save success |

---

### Task 1: Query key + invalidate helper (TDD)

**Files:**
- Create: `src/lib/admin-settings-sync.ts`
- Create: `src/lib/admin-settings-sync.test.ts`
- Modify: `src/lib/query-client.ts`

**Interfaces:**
- Produces:
  ```ts
  // query-client.ts
  queryKeys.adminStreamerMode // ["admin", "streamer-mode"]

  // admin-settings-sync.ts
  export function settingsSaveInvalidateKeys(): readonly (readonly string[])[];
  // returns at least:
  //   ["admin", "settings"]
  //   queryKeys.adminStreamerMode
  ```

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/admin-settings-sync.test.ts
import { describe, expect, it } from "vitest";

import { settingsSaveInvalidateKeys } from "./admin-settings-sync";
import { queryKeys } from "./query-client";

describe("settingsSaveInvalidateKeys", () => {
  it("invalidates settings form and live streamer mode", () => {
    const keys = settingsSaveInvalidateKeys();
    expect(keys).toContainEqual(["admin", "settings"]);
    expect(keys).toContainEqual([...queryKeys.adminStreamerMode]);
  });
});
```

Note: Vitest has no `toContainEqual` for nested arrays by default — use:

```ts
expect(keys).toEqual(
  expect.arrayContaining([
    ["admin", "settings"],
    [...queryKeys.adminStreamerMode],
  ]),
);
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
bun test src/lib/admin-settings-sync.test.ts
```

Expected: module not found / export missing.

- [ ] **Step 3: Add query key + implement helper**

In `src/lib/query-client.ts`, inside `queryKeys`:

```ts
adminStreamerMode: ["admin", "streamer-mode"] as const,
```

Create `src/lib/admin-settings-sync.ts`:

```ts
import { queryKeys } from "@/lib/query-client";

/** Query keys to invalidate after a successful PUT /api/admin/settings. */
export function settingsSaveInvalidateKeys(): readonly (readonly string[])[] {
  return [["admin", "settings"], queryKeys.adminStreamerMode];
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
bun test src/lib/admin-settings-sync.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit** (only if user asked)

```bash
git add src/lib/query-client.ts src/lib/admin-settings-sync.ts src/lib/admin-settings-sync.test.ts
git commit -m "feat(admin): add settings save invalidate keys for streamer mode"
```

---

### Task 2: Provider reads React Query; export server fn

**Files:**
- Modify: `src/routes/_main.admin.tsx`
- Modify: `src/components/admin/streamer-mode-context.tsx`

**Interfaces:**
- Consumes: `queryKeys.adminStreamerMode`, `loadStreamerMode(): Promise<boolean>`
- Produces:
  ```ts
  // _main.admin.tsx
  export const loadStreamerMode = createServerFn({ method: "GET" }).handler(...)

  // streamer-mode-context.tsx
  StreamerModeProvider({ initialData: boolean, children })
  useStreamerMode(): boolean  // unchanged public API
  ```

- [ ] **Step 1: Export `loadStreamerMode` and seed provider**

In `src/routes/_main.admin.tsx`:

```ts
export const loadStreamerMode = createServerFn({ method: "GET" }).handler(
  async () => {
    return isStreamerModeEnabled();
  },
);

// loader unchanged: still awaits loadStreamerMode() for seed

function AdminRoute() {
  const { streamerMode } = Route.useLoaderData();
  return (
    <StreamerModeProvider initialData={streamerMode}>
      <AdminShell>
        <Outlet />
      </AdminShell>
      <Toaster richColors position="top-center" />
    </StreamerModeProvider>
  );
}
```

- [ ] **Step 2: Wire provider to useQuery**

Replace body of `src/components/admin/streamer-mode-context.tsx` with:

```tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, type ReactNode } from "react";

import { loadStreamerMode } from "@/routes/_main.admin";
import { queryKeys } from "@/lib/query-client";

const StreamerModeContext = createContext<boolean>(false);

export function StreamerModeProvider({
  initialData,
  children,
}: {
  initialData: boolean;
  children: ReactNode;
}) {
  const { data } = useQuery({
    queryKey: queryKeys.adminStreamerMode,
    queryFn: () => loadStreamerMode(),
    initialData,
  });

  return (
    <StreamerModeContext.Provider value={data ?? initialData}>
      {children}
    </StreamerModeContext.Provider>
  );
}

export function useStreamerMode(): boolean {
  return useContext(StreamerModeContext);
}
```

**Import cycle check:** route file imports provider; provider imports `loadStreamerMode` from route. If bundler/typecheck complains about cycle, move `loadStreamerMode` to e.g. `src/lib/admin-streamer-mode.ts` (server fn only) and import from both route + provider. Prefer that extract if cycle fails typecheck/build.

Cycle-safe extract (use only if needed):

```ts
// src/lib/admin-streamer-mode.ts
import { createServerFn } from "@tanstack/react-start";
import { isStreamerModeEnabled } from "@/lib/config/config";

export const loadStreamerMode = createServerFn({ method: "GET" }).handler(
  async () => isStreamerModeEnabled(),
);
```

Then `_main.admin.tsx` and the provider both import from `@/lib/admin/admin-streamer-mode`.

- [ ] **Step 3: Grep for old prop**

```bash
rg "StreamerModeProvider|value=\{streamerMode\}" src
```

Expected: only `initialData={streamerMode}` at admin route; no `value=` on provider.

- [ ] **Step 4: Typecheck focused**

```bash
bun run typecheck
```

Expected: clean, or only pre-existing unrelated errors. Fix any errors from this change.

- [ ] **Step 5: Commit** (only if user asked)

```bash
git add src/routes/_main.admin.tsx src/components/admin/streamer-mode-context.tsx src/lib/admin-streamer-mode.ts
git commit -m "feat(admin): load streamer mode via React Query"
```

---

### Task 3: Settings save invalidates streamer query

**Files:**
- Modify: `src/routes/_main.admin.settings.tsx`

**Interfaces:**
- Consumes: `settingsSaveInvalidateKeys()` from Task 1

- [ ] **Step 1: Update mutation onSuccess**

In `SettingsPage` save mutation:

```ts
import { settingsSaveInvalidateKeys } from "@/lib/admin/admin-settings-sync";

// inside useMutation:
onSuccess: async () => {
  await Promise.all(
    settingsSaveInvalidateKeys().map((queryKey) =>
      queryClient.invalidateQueries({ queryKey: [...queryKey] }),
    ),
  );
  setDraft({});
  toast.success("Pengaturan disimpan.");
},
```

Keep existing `onError` toast. Do not call `useRouter().refresh()`.

- [ ] **Step 2: Run unit tests**

```bash
bun test src/lib/admin-settings-sync.test.ts
```

Expected: PASS.

- [ ] **Step 3: Manual smoke** (dev server)

1. `bun run dev`
2. `/admin/settings` — toggle streamer — Simpan
3. Pill + any open admin list with `SensitiveText` flip without hard refresh

- [ ] **Step 4: Quality gate**

```bash
bun run check
```

Expected: format/lint/typecheck/affected tests/Knip all green.

- [ ] **Step 5: Commit** (only if user asked)

```bash
git add src/routes/_main.admin.settings.tsx
git commit -m "fix(admin): invalidate streamer mode query after settings save"
```

---

## Self-review

| Spec requirement | Task |
|------------------|------|
| React Query owns live streamer flag | Task 2 |
| `queryKeys.adminStreamerMode` | Task 1 |
| Settings save invalidates settings + streamer | Task 1 helper + Task 3 |
| No router.refresh / full reload | Task 3 explicitly |
| `useStreamerMode()` unchanged | Task 2 |
| Loader still seeds | Task 2 `initialData` |
| Other settings live-sync out of scope | No tasks for booster/projects |

No placeholders. Types consistent: `initialData: boolean`, `loadStreamerMode(): Promise<boolean>`, keys as `readonly string[]`.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-03-admin-settings-live-sync.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — this session, executing-plans with checkpoints  

Which approach?
