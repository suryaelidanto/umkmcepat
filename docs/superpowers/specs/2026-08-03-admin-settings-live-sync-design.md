# Admin Settings Live Sync (Streamer Mode)

## Problem

On `/admin/settings`, saving `feature.streamer_mode` (ON ↔ OFF) persists correctly on the server, and the settings form refetches via React Query (`["admin", "settings"]`). But the rest of the admin shell (Streamer pill, `SensitiveText` masks, `AuthButton` name/email) does **not** update until a full browser reload.

Root cause: streamer mode is **not** a React Query value. It is one-shot route loader data on `/_main/admin`, frozen into `StreamerModeProvider` for the session:

```ts
// src/routes/_main.admin.tsx
loader → { streamerMode }
AdminRoute → <StreamerModeProvider value={streamerMode}>
```

Settings save only invalidates `["admin", "settings"]`. That does not re-run the admin layout loader, so context stays stale.

Other settings mostly need no client live-sync: server code re-reads `getSetting` per request. Optional client caches (`booster-packs`, `projects`, waitlist) are out of scope for this bug.

## Goal

After a successful settings save that changes `feature.streamer_mode`, all admin consumers of `useStreamerMode()` update **without** a full page reload and **without** `router.refresh()` / `router.invalidate()`.

Match existing app mutation pattern: **mutate → `invalidateQueries` → active queries refetch → UI updates**.

## Non-goals

- No `window.location.reload`, no `router.refresh()`, no `router.invalidate()`.
- No context setter one-off (option B) — inconsistent with other admin mutations.
- No SSR HTML re-strip of raw PII mid-session (existing design: APIs still return raw; client masks).
- No live-sync of booster packs / project limit / waitlist from settings (YAGNI unless a follow-up).
- No multi-tab broadcast.
- No new API route; reuse the existing server function that already loads the flag.

## Design

### Source of truth (unchanged)

- DB `AppSetting` key `feature.streamer_mode` via `APP_SETTINGS` registry.
- Server helpers: `isStreamerModeEnabled()` / `getSetting(...)`.
- PUT `/api/admin/settings` still `invalidateSettingCache()` + `primeSettingCache()`.

### Client: React Query owns the live flag

1. **Query key** (add to `queryKeys` in `src/lib/query-client.ts`):

   ```ts
   adminStreamerMode: ["admin", "streamer-mode"] as const,
   ```

2. **Query fn**: existing `loadStreamerMode` `createServerFn` in `src/routes/_main.admin.tsx`, **exported** so the provider can call it from the client (same pattern as other server fns).

3. **`StreamerModeProvider`** switches from a pure prop passthrough to:

   - `useQuery({ queryKey: queryKeys.adminStreamerMode, queryFn: () => loadStreamerMode(), initialData })`
   - `initialData` = loader value (avoids flash on first paint / SSR hydrate)
   - Context value = `data` from the query (fallback to `initialData` / `false`)

4. **Admin route** still runs the loader for auth + initial seed; passes seed as `initialData` only (not the sole lifetime source).

5. **Settings save** (`src/routes/_main.admin.settings.tsx` mutation `onSuccess`):

   ```ts
   await Promise.all([
     queryClient.invalidateQueries({ queryKey: ["admin", "settings"] }),
     queryClient.invalidateQueries({ queryKey: queryKeys.adminStreamerMode }),
   ]);
   setDraft({});
   toast.success("Pengaturan disimpan.");
   ```

   No special-case branch required for other keys in this change. Invalidating `adminStreamerMode` on every settings save is fine: refetch is one cheap server fn; if the flag did not change, UI is a no-op re-render.

### Consumers (no change)

`useStreamerMode()` stays `boolean`. All call sites (`SensitiveText`, `AdminShell` pill, tables, `AuthButton`) keep working.

### Flow after change

```text
Admin toggles streamer → Simpan feature_flag
  → PUT /api/admin/settings (server cache busted)
  → invalidate ["admin", "settings"]     → form shows saved values
  → invalidate ["admin", "streamer-mode"] → provider refetches loadStreamerMode
  → context updates → pill + masks flip without full reload
```

## Files

| File | Change |
|------|--------|
| `src/lib/query-client.ts` | Add `queryKeys.adminStreamerMode` |
| `src/routes/_main.admin.tsx` | Export `loadStreamerMode`; pass loader value as provider `initialData` |
| `src/components/admin/streamer-mode-context.tsx` | Provider uses `useQuery` seeded by `initialData` |
| `src/routes/_main.admin.settings.tsx` | Invalidate streamer-mode query on save success |
| Tests | Cover invalidate helper or query key wiring (see plan) |

## Verification

Manual:

1. Open `/admin` with streamer ON — PII masked, pill ON.
2. `/admin/settings` → turn streamer OFF → Simpan.
3. Pill becomes OFF; navigate to users/waitlist/transactions — raw PII, no hard refresh.
4. Turn ON again → masks return immediately.
5. Settings form still shows correct ON/OFF after save.

Automated: unit test for save-side invalidation keys (or QueryClient mock). `bun run check` green.

## Out of scope follow-ups

- Invalidate `queryKeys.boosterPacks` / `queryKeys.projects` / waitlist after economics/booster saves.
- Drop admin loader streamer read entirely once query-only is trusted everywhere.
