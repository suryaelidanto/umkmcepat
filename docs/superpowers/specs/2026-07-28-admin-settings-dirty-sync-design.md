# /admin/settings — dirty-aware save

## Goal

`/admin/settings` must reflect the DB. The Save button is disabled until at least one field in its category is dirty, and only dirty keys are persisted.

## Current state

- `src/routes/_main.admin.settings.tsx` — admin UI
- `src/routes/api.admin.settings.ts` — GET + PUT, upserts to `appSetting` table, invalidates cache
- `src/lib/app-settings-registry.ts` — single source of truth for `APP_SETTINGS` entries (~25 keys across `feature_flag`, `booster`, `rate_limit`, `ai`)
- `src/lib/app-settings.ts` — server-side reader + `invalidateSettingCache()`
- Prisma model `appSetting` exists with `(key, category, value, updatedBy, updatedAt)`

## What works today

- Server upsert to DB already correct. Returns `{ ok: true }`. Already invalidates cache. Already validates per-key type. Already accepts partial `values` map (only upserts keys in the body).

## What is broken

- Save button is always enabled — clicking with no changes still sends an empty `values` map (or stale entries) and round-trips to the server.
- Save sends the whole category draft, including untouched keys — a second admin's concurrent edit on a different field in the same category can be silently overwritten.

## Design

### Behavior

- Each row tracks dirty state by comparing the current `draft[key]` to the originally-loaded `effectiveValue`.
- Dirty = `draft[key] !== undefined` AND `draft[key]` does not shallow-equal the baseline `effectiveValue`.
- For boolean: `draft[key] !== effectiveValue` (`true` vs `false`, never both undefined).
- For number: `draft[key] !== effectiveValue` (empty input → `Number("")` = `0`; if baseline is `0` and user clears, dirty=false; if baseline is non-zero, dirty=true).
- For string: `draft[key] !== effectiveValue`.

### UI

- Save button per category:
  - `disabled` when zero dirty keys in that category.
  - Visual: same styling as today, add `disabled:opacity-50 disabled:cursor-not-allowed`.
  - On click: PUT body = `{ category, values: pick(draft, dirtyKeysInCategory) }`.
- Per-field Reset button (small text, next to each control):
  - Visible only when `isDirty(entry.key) === true`.
  - On click: drop key from draft. Display reverts to baseline `effectiveValue`.

### Data flow

```
GET /api/admin/settings  →  entries[]
                              ↓
                         baseline state (set once on load)
                              ↓
            user edits  →  draft[key] = newValue
                              ↓
            isDirty(key) = draft[key] !== undefined && !shallowEqual(draft[key], baseline[key].effectiveValue)
                              ↓
            Save enabled iff at least one dirty key in category
            on click: PUT only dirty keys for that category
            on success: invalidateQueries → entries refetched → baseline re-derived
            on error: toast, leave draft intact
```

### Server

- `src/routes/api.admin.settings.ts` — no change. Already accepts a partial `values` map and only upserts keys in the body. Type validation still applies per key.

### Pure helper

- `getDirtyKeys(entries, draft): Set<string>` — exported from the route file (or co-located `src/routes/_main.admin.settings.helpers.ts` if file grows). Tested in isolation.

## Files

| File | Change |
| --- | --- |
| `src/routes/_main.admin.settings.tsx` | Add baseline state, dirty computation, per-field Reset, conditional Save enabled, narrowed PUT body |
| `src/routes/_main.admin.settings.helpers.ts` (new) | `getDirtyKeys(entries, draft): Set<string>` + equality helper |
| `src/routes/_main.admin.settings.helpers.test.ts` (new) | Unit tests for the helper |
| `src/routes/api.admin.settings.ts` | No change |
| `src/lib/app-settings-registry.ts` | No change |

## YAGNI

- No per-category "Discard all" button — per-field Reset covers the common case; full reload reverts everything.
- No undo stack — single-level Reset is enough.
- No debounce on Save — clicks are explicit.
- No optimistic update — server round-trip is fast and the toast confirms.
- No form library — current `useState` + custom helper is the minimal change matching surrounding style.
- No new dependency.

## Out of scope

- Adding new settings to the registry.
- Cache invalidation outside `app-settings.ts`.
- Audit log / per-field change history (already covered by `updatedBy` column if we want it later).
- Server-side validation hardening (already sufficient).