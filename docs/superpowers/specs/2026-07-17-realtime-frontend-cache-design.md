# Realtime Frontend Cache Consistency

Date: 2026-07-17
Status: Draft
Scope: Frontend cache + mutation flow

## Problem

The homepage's two over-limit banners and the project list show stale data after any in-app mutation, because the page reads `projectCount`, `projectLimit`, `overProjectLimit` and the project entries from the route loader as one-shot props, and the existing TanStack Query mutations only invalidate the `queryKeys.projects` list key — not the embedded count fields, and not the per-project state (title, thumbnail, buildStatus) that other surfaces (workspace) mutate directly.

The fix is to enforce a single rule across every mutation in the app: **optimistic cache patch first, then `invalidateQueries` to reconcile, then rollback on error with a toast.** One helper, one rule, every mutation goes through it.

## Goal

- The two over-limit banners on the homepage disappear the moment the user deletes a project that drops them back under the limit. No reload, no refetch click, no stale flash.
- The project list card on the homepage reflects title, thumbnail, and build status changes made in the workspace, without requiring a full page reload or even a TanStack Query refetch round-trip.
- Every mutation in the app follows the same optimistic-then-reconcile flow. The next developer who adds a mutation has one obvious pattern to copy.
- `removeQueries` and `invalidateQueries` are not used interchangeably for the same purpose.

## Non-Goals

- Cross-tab synchronization via `BroadcastChannel`. Tab-B staleness resolves on focus via the existing `refetchOnWindowFocus: true` (default). Add only if a real user complaint appears.
- Client-side energy pre-flight on `HomePromptForm` submit. The server already returns a friendly 429 when energy is empty. Add only if wasted round-trips become a measured problem.
- A new dedicated `GET /api/projects/count` endpoint. The `GET /api/projects` response already returns `projectCount`, `projectLimit`, `overProjectLimit` on every page (`src/routes/api.projects.ts:87-99`).
- Changes to the AI / build / publish server flows.

## Design

### The rule

For every mutation in the app, in `onSuccess`:

1. **Optimistic patch** the relevant TanStack Query cache entry (e.g. decrement `projectCount` on page 0, swap the project's title on the first page that contains it).
2. **`invalidateQueries`** the relevant keys with `refetchType: "active"` so the server reconciles.
3. **On `onError`:** roll back the optimistic patch to the snapshot taken before step 1, then toast.

Every mutation in the app does these three steps. No exceptions. A small helper enforces it so each call site is one declarative object.

### Helper: `useCacheMutation` (new)

Location: `src/lib/query-client.ts` (adjacent to `createAppQueryClient`, `queryKeys`, `fetchJson`).

Signature:

```ts
type CachePatch = {
  queryKey: readonly unknown[];
  updater: (previous: unknown) => unknown;
};

type CacheMutationOptions<TData, TVariables> = {
  mutationFn: (variables: TVariables) => Promise<TData>;
  optimisticPatches?: CachePatch[];          // applied on mutate
  invalidateKeys?: readonly unknown[][];     // invalidated after success
  onSuccess?: (data: TData, variables: TVariables) => void | Promise<void>;
  onError?: (error: Error, variables: TVariables) => void;
  successMessage?: string;                   // toast on success
  errorMessage?: string;                     // toast on error (default)
};
```

Behavior:

- On `mutate`: snapshots the current value of every `optimisticPatches[*].queryKey` cache, then applies the updater. Snapshots are stored in a ref keyed by mutation instance.
- On `onSuccess`: runs `onSuccess` callback, then `invalidateQueries({ queryKey, refetchType: "active" })` for every `invalidateKeys` entry, then toasts `successMessage` if set.
- On `onError`: restores the snapshot for every `optimisticPatches[*].queryKey` cache, then runs `onError` callback (if provided) and toasts `errorMessage` (or a generic "Belum berhasil, coba lagi." if unset).

The helper is a thin wrapper over `useMutation` plus a `useQueryClient`. It does not invent a new cache layer; it composes with the existing `QueryClient` and the existing `queryKeys`.

### Hook: `useProjectLimit()` (new)

Location: `src/lib/projects/use-project-limit.ts`.

Reads the first page of `queryKeys.projects` from the cache and returns `{ count, limit, overLimit }`. If the cache is empty (first SSR paint before client hydration, or logged-out), falls back to the values from the route loader via `Route.useLoaderData()` so the first paint is consistent with the server.

```ts
type ProjectLimitInfo = {
  count: number;
  limit: number;
  overLimit: boolean;
};

export function useProjectLimit(): ProjectLimitInfo;
```

Both `ProjectList` and `HomePromptForm` consume this hook instead of the three current props (`projectCount`, `projectLimit`, `overProjectLimit`).

### Wire-up

**`ProjectList.tsx`** — drop the three props. Use `useProjectLimit()` for the banner. Convert the existing `deleteMutation` (lines 84-122) to `useCacheMutation`:

- `optimisticPatches`: one patch on `queryKeys.projects` that decrements `projectCount` on page 0 and recomputes `overProjectLimit` (if `count <= limit` → `overLimit: false`).
- `invalidateKeys`: `[[...queryKeys.projects]]`.
- `successMessage`: `"Website dihapus."` (keeps the existing toast at line 116).
- `errorMessage`: `"Website belum berhasil dihapus."`.

**`HomePromptForm.tsx`** — drop the `overProjectLimit` prop. Use `useProjectLimit()`. Convert the existing `createMutation` (lines 100-150):

- Replace `queryClient.removeQueries({ queryKey: queryKeys.projects })` at line 135 with `invalidateQueries({ queryKey: queryKeys.projects, refetchType: "active" })` (alignment with H1). Update the inline comment on the next line to read "Force a refetch so home sees the new project after create."
- Keep `invalidateQueries({ queryKey: queryKeys.energy })` at line 136.
- No `optimisticPatches` because we navigate away; no need to patch a cache we will not see.

**`WorkspaceShell.tsx`** — three more mutations need converting to `useCacheMutation`:

- `saveProjectTitle` (line 1525). After server returns new title: optimistic patch on `queryKeys.projects` — find the project entry on the first page and replace its `title` field. Reconcile via `invalidateQueries`.
- Build-done event (line 768). When `eventName === "done"`: optimistic patch on `queryKeys.projects` — find the project, set `buildStatus: "ready"`, and clear the previous `thumbnailBuildId`/`thumbnailRef` placeholder. Reconcile.
- Edit-done (line 1511). Same shape as build-done: optimistic patch `buildStatus: "ready"`, refresh thumbnail fields, reconcile.

Both workspace mutations continue to fire the existing `umkm:energy-changed` event and `invalidateQueries({ queryKey: queryKeys.energy })` for `EnergyDisplay`. No change to the energy flow.

**`_main.index.tsx`** — `HomePage` (lines 147-230) drops the three props it currently passes to `ProjectList` and `HomePromptForm`. The route loader (lines 60-64) still computes `projectCount`, `projectLimit`, `overProjectLimit` because the new `useProjectLimit()` hook falls back to them via `useLoaderData()` for first-paint SSR.

### Error handling

- Optimistic patch failure (network error, server 4xx/5xx): the snapshot is restored, the toast surfaces a friendly message. The UI returns to its pre-mutation state. The list re-renders from cached data.
- `invalidateQueries` failure: TanStack Query keeps the last-good cache. The optimistic patch stands. A subsequent `refetchOnWindowFocus` will reconcile. No new error UI.
- Empty `optimisticPatches` array: helper behaves like a vanilla `useMutation` with invalidation and toasts. The rule still holds — every mutation still goes through the helper, even mutations that don't patch a cache.

### Out of scope (deferred until measured)

- **Cross-tab `BroadcastChannel` sync.** When tab A mutates, tab B still catches up only on focus. The existing default `refetchOnWindowFocus: true` covers the common case. Add a `BroadcastChannel` invalidator only if multi-tab usage becomes a real friction point.
- **Energy pre-flight on `HomePromptForm` submit.** The submit button stays enabled regardless of `queryKeys.energy`. Server 429 already handles empty energy. Add a pre-flight gate only if wasted moderation round-trips become a measured cost.
- **Updating the route loader to also serve as a `staleTime` clock for `queryKeys.projects`.** `useInfiniteQuery` already has `staleTime: 0` (`ProjectList.tsx:81`); refetch fires on demand. Fine as is.

### Files to change

- `src/lib/query-client.ts` — add `useCacheMutation` (and supporting types). No new file: keep it next to the existing `createAppQueryClient` / `queryKeys`.
- `src/lib/projects/use-project-limit.ts` — new. Reads first page of `queryKeys.projects`, falls back to loader data.
- `src/lib/projects/use-project-limit.test.ts` — new unit test.
- `src/components/projects/ProjectList.tsx` — drop three props, use `useProjectLimit()`, convert `deleteMutation` to `useCacheMutation`.
- `src/components/projects/HomePromptForm.tsx` — drop `overProjectLimit` prop, use `useProjectLimit()`, convert `createMutation` to `useCacheMutation`, swap `removeQueries` for `invalidateQueries`.
- `src/components/projects/WorkspaceShell.tsx` — three mutation sites: `saveProjectTitle`, build-done, edit-done. Each uses `useCacheMutation` with optimistic patch on `queryKeys.projects` first page.
- `src/routes/_main.index.tsx` — `HomePage` no longer passes the three props to `ProjectList` / `HomePromptForm`. Loader unchanged.
- `tests/integration/*` — extend the homepage delete-over-limit test to assert both banners disappear without a reload.

## Test plan

- `useProjectLimit` unit test: cache present → returns cache values; cache empty → returns loader fallback; cache invalidates mid-render → returns refreshed values.
- `useCacheMutation` unit test: success path applies patch, invalidates, toasts; error path restores snapshot, toasts.
- Integration: open homepage with 6 projects (over limit). Click delete on one. Assert both banners disappear and `projectCount` shows 5 without a full page reload.
- Integration: open project workspace, rename project, navigate to homepage. Assert the list card shows the new title.
- Integration: build completes in workspace, navigate to homepage. Assert the card's `buildStatus` / thumbnail reflect the new state.
