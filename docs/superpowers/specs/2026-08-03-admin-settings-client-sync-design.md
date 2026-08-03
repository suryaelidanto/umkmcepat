# Admin Settings Full Client Sync

## Problem

After saving settings on `/admin/settings`, some product UI stayed stale until hard refresh or natural poll:

- Booster pack prices/energy (`EnergyBoosterModal`, `queryKeys.boosterPacks`, `staleTime: 30s`)
- Project limit chip / list (`queryKeys.projects` embeds `projectLimit`)
- Energy daily limit display (`queryKeys.energy` → `/api/user/credits`)
- Waitlist gate chip (`queryKeys.waitlistStatus`)

Streamer mode already live-syncs via `queryKeys.adminStreamerMode` (see `2026-08-03-admin-settings-live-sync-design.md`). Server AppSetting cache is already busted on PUT. Gap is **client React Query only**.

## Goal

Any successful PUT `/api/admin/settings` invalidates every product-facing query key that can embed or display configurable settings values, so open or next-opened UI shows the new values without a full browser reload.

## Non-goals

- No `router.refresh()` / full page reload.
- No category-selective invalidation map (YAGNI — invalidate-all client surfaces is cheaper than wrong selective lists).
- No multi-tab broadcast.
- No change to server `getSetting` / process-level `requiresRestart` semantics.
- No new API routes.

## Design

### Single helper (already exists)

`settingsSaveInvalidateKeys()` in `src/lib/admin-settings-sync.ts` is the sole list of keys settings save must invalidate.

### Keys after this change

| Key | Why |
|-----|-----|
| `["admin", "settings"]` | Settings form baseline |
| `queryKeys.adminStreamerMode` | Admin PII mask + Streamer pill |
| `queryKeys.boosterPacks` | Booster modal amounts/energy |
| `queryKeys.projects` | `projectLimit` / `overProjectLimit` on homepage list |
| `queryKeys.energy` | Daily energy `limit` in header |
| `queryKeys.waitlistStatus` | Waitlist gate status chip |

Only **active** queries refetch immediately; inactive ones refetch on next mount (correct for booster modal `enabled: open`).

### Server-only settings (no client key)

AI timeouts, rate limits, runtime/containers, source/dist limits, thumbnail flags, min-energy enforcement on API: next request already sees primed cache. No extra client work.

### Call site

`src/routes/_main.admin.settings.tsx` mutation `onSuccess` already maps `settingsSaveInvalidateKeys()` → `invalidateQueries`. No call-site shape change — only expand the helper + tests.

## Files

| File | Change |
|------|--------|
| `src/lib/admin-settings-sync.ts` | Expand return list |
| `src/lib/admin-settings-sync.test.ts` | Assert all keys present |
| Spec/plan docs | This design + plan |

## Verification

1. Change booster amount → open energy booster modal → new Rp/energy without hard refresh.
2. Change project limit → homepage list/limit reflects new limit after invalidate (projects query active or remount).
3. Change daily energy limit → header energy `limit` updates (energy query active).
4. Toggle streamer mode still flips immediately.
5. `bun test src/lib/admin-settings-sync.test.ts` + `bun run check` green.

## Out of scope follow-ups

- Homepage loader-only `projectLimit` when projects query never mounted (rare; invalidate covers normal SPA use).
- Waitlist route gates mid-navigation without remount (next server gate read is enough).
