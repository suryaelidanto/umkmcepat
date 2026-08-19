# Feature Flags for Home Composer Uploads and Workspace Ubah Mode

Date: 2026-08-06
Status: Approved (pending spec review)
Author: brainstorming session

## Goal

Add two admin-toggleable feature flags on `/admin/settings` so the team can
disable (and later re-enable) two unstable or unscoped features without
deleting code or redeploying:

1. **`feature.composer_uploads_enabled`** — image uploads on the home page
   prompt form (`HomePromptForm`). Workspace chat uploads stay enabled
   because the AI build agent uses uploaded images per `briefToBuildPrompt`.
2. **`feature.direct_edit_enabled`** — the entire "Ubah" mode in the
   workspace (element-level `move-up | move-down | remove` actions and
   annotation markers).

Both default to **`true`** so the existing behavior is preserved when the
admin has not touched the toggle. Flipping off freezes the feature for end
users without removing code.

## Non-goals

- Per-user rollout, percentage bucketing, or env-var override. Pure DB boolean.
- A kill-switch for `POST /api/projects/:id/generate` (the discuss→build
  initial flow). Not requested, would block all project creation.
- Deletion of upload or Ubah-mode code. The user explicitly wants to keep
  the code alive behind the flag for potential future use.
- A flag for the AI model selectors on `/admin/settings` (`ai.*` keys). Not
  requested.

## Background

### Existing flag infrastructure

- `src/lib/app-settings-registry.ts` — `APP_SETTINGS: ConfigEntry[]` is the
  single source of truth. Adding an entry auto-renders a row on
  `/admin/settings`.
- `src/lib/app-settings.ts` — `getSetting(key, fallback)` (async) and
  `getSettingSync(key, fallback)` (module-scope). Server-only.
- `src/routes/_main.admin.settings.tsx` — settings UI; uses `groupByTier` +
  `CategorySection` to render rows.
- `src/routes/api.admin.settings.ts` — PUT handler, validates against the
  registry, writes JSONB to the `AppSetting` table, primes the cache.
- `prisma/schema.prisma:493–501` — `AppSetting` table (`key`, `category`,
  `value Json`, `updatedAt`, `updatedBy`). No migration needed for new keys.
- No client-side flag hook exists today. The admin settings UI consumes
  flags server-side; there is no `useFlag`.

### Existing upload surface (home page)

- `src/components/projects/HomePromptForm.tsx` renders
  `ComposerAttachButton` (line 316–356) for authenticated users and a
  `Paperclip` icon button (line 357–367) for unauthenticated users.
- The `createMutation` (line 118–178) appends `assetIds` to the FormData
  posted to `/api/projects`.
- The API handler is `src/routes/api.projects.ts` (POST).

### Existing Ubah (direct edit) surface

- `src/components/projects/WorkspaceShell.tsx:377` — `directEditMode` state.
- `src/components/projects/WorkspacePrimitives.tsx` — `directEditActive`,
  `directEditActions`, `directEditIntents` props; renders the "Ubah /
  Nonaktifkan ubah" toggle, the undo/redo/save/discard toolbar (line
  205–240), the element-action overlay (`move-up`, `move-down`, `remove`,
  line 732–798), and the annotation-marker selector hook.
- `src/lib/projects/direct-edit.ts` — pure helpers for layout mutations
  (`EditLayout`, `applyDirectEditIntent`).
- `src/lib/projects/runtime-proxy.ts:463` — postMessage channel between the
  iframe preview and the parent workspace; excludes annotation markers from
  click handling.
- No server endpoint backs Ubah mode — it is pure client-side state with
  optional build persistence via the existing project save path.

### Why a public `/api/flags` endpoint

The existing `GET /api/admin/settings` is admin-protected (per the
`api.admin.settings.ts` handler). Forcing it on the public site would leak
every other admin setting. A dedicated public endpoint returns only the
two booleans and is safe to expose to anonymous users.

## Design

### 1. Registry entries

Append to `APP_SETTINGS` in `src/lib/app-settings-registry.ts` after
`feature.streamer_mode` (line 81), inside the `feature_flag` section:

```ts
{
  key: "feature.composer_uploads_enabled",
  category: "feature_flag",
  tier: "basic",
  type: "boolean",
  label: "Home prompt image uploads",
  fallback: true,
},
{
  key: "feature.direct_edit_enabled",
  category: "feature_flag",
  tier: "basic",
  type: "boolean",
  label: "Workspace Ubah (element edit) mode",
  fallback: true,
},
```

Conventions matched: `feature.*` key, `category: "feature_flag"`,
`tier: "basic"` (renders expanded above the advanced disclosure), no `env`
(no env fallback — admin DB is the single source of truth), no
`requiresRestart` (consumers read at request time).

### 2. Public flag read path

#### `src/lib/feature-flags-keys.ts` (new)

```ts
export const PUBLIC_FEATURE_FLAGS = [
  "feature.composer_uploads_enabled",
  "feature.direct_edit_enabled",
] as const;
export type PublicFeatureFlag = (typeof PUBLIC_FEATURE_FLAGS)[number];
```

#### `src/lib/feature-flags.ts` (new)

```ts
import { getSetting } from "@/lib/config/app-settings";
import { PUBLIC_FEATURE_FLAGS, type PublicFeatureFlag } from "./feature-flags-keys";

export async function getPublicFlags(): Promise<Record<PublicFeatureFlag, boolean>> {
  const entries = await Promise.all(
    PUBLIC_FEATURE_FLAGS.map(
      async (key) => [key, await getSetting(key, true)] as const,
    ),
  );
  return Object.fromEntries(entries) as Record<PublicFeatureFlag, boolean>;
}
```

#### `src/lib/use-feature-flag.ts` (new)

```ts
import { useQuery } from "@tanstack/react-query";
import { getPublicFlags } from "@/lib/config/feature-flags";
import type { PublicFeatureFlag } from "@/lib/config/feature-flags-keys";

const FLAGS_KEY = ["public-flags"] as const;

export function usePublicFlags() {
  return useQuery({
    queryKey: FLAGS_KEY,
    queryFn: getPublicFlags,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

export function useFeatureFlag(key: PublicFeatureFlag): boolean {
  const { data } = usePublicFlags();
  return data?.[key] ?? true; // fail-open
}
```

#### `src/routes/api.flags.ts` (new)

```ts
import { createFileRoute } from "@tanstack/react-router";
import { getPublicFlags } from "@/lib/config/feature-flags";

export const Route = createFileRoute("/api/flags")({
  server: {
    handlers: {
      GET: async () => {
        const flags = await getPublicFlags();
        return Response.json(flags, {
          headers: { "Cache-Control": "public, max-age=30, s-maxage=30" },
        });
      },
    },
  },
});
```

### 3. Consumer changes — `feature.composer_uploads_enabled`

#### `src/components/projects/HomePromptForm.tsx`

- Import `useFeatureFlag` from `@/lib/config/use-feature-flag`.
- Inside the component: `const uploadsEnabled = useFeatureFlag("feature.composer_uploads_enabled");`
- Wrap the existing ternary at line 316–367
  (`status === "authenticated" ? <ComposerAttachButton .../> : <Paperclip .../>`)
  in `{uploadsEnabled ? (...) : null}`.

#### `src/routes/api.projects.ts`

- At the top of the POST handler, after auth and body parsing:
  - Read the flag: `const uploadsEnabled = await getSetting("feature.composer_uploads_enabled", true);`
  - If `!uploadsEnabled`, remove every `assetIds` entry from the FormData
    before passing to project creation.
  - Project is still created successfully — just without images.

#### Untouched (deliberate)

- `src/components/projects/WorkspaceShell.tsx` chat composer uploads —
  the AI build agent uses them per `briefToBuildPrompt`.
- `src/components/projects/WorkspacePrimitives.tsx` `image_upload` workspace
  card — same reason.
- `src/routes/_main.waitlist.tsx` upload — waitlist page is already
  gated separately.

### 4. Consumer changes — `feature.direct_edit_enabled`

There is no server endpoint for Ubah mode. The flag is a client-side UX
hide.

#### `src/components/projects/WorkspaceShell.tsx`

- Import `useFeatureFlag`.
- Add `const editModeEnabled = useFeatureFlag("feature.direct_edit_enabled");`
  near the existing composable hooks.
- Line 377 — derive a single
  `effectiveDirectEditMode = directEditMode && editModeEnabled` near the
  top of the component. Pass `effectiveDirectEditMode` to all children
  instead of the raw `directEditMode` state. No `useEffect` reset
  required; the derived value flips immediately when the flag changes.
- Line 3682, 3684, 3738, 3743 — gate the `directEditActive` /
  `directEditActions` prop values on the children: when flag is off, pass
  `directEditActive={false}` and `directEditActions={undefined}`.
- Hide any "Ubah / Nonaktifkan ubah" toggle button (rendered inside
  `WorkspacePrimitives` via the `directEditActive` prop) by gating the
  toggle in `WorkspacePrimitives` itself.

#### `src/components/projects/WorkspacePrimitives.tsx`

- Line 83, 97 — accept a new optional prop `directEditFlagEnabled?: boolean`
  on the component(s) that currently render the Ubah toolbar / toggle
  button. **Default `true`** so existing tests and callers that don't
  pass the prop keep working.
- Line 176–183 — render the "Ubah / Nonaktifkan ubah" toggle button only
  when `directEditFlagEnabled`.
- Line 205–240 — render the toolbar (`undo`/`redo`/`save`/`discard`) only
  when `directEditFlagEnabled && directEditActive`.
- Line 309–316 — same as 176–183 for the alternate layout breakpoint.
- Line 685–695, 732–798 — gate the action overlay (move-up/down/remove)
  and the annotation hover markers when `!directEditFlagEnabled`.

#### `src/lib/projects/runtime-proxy.ts`

- Line 463 — when `directEditFlagEnabled` is off, the build's annotation
  markers are not injected (because `WorkspacePrimitives` no longer
  triggers the marker render), so this branch becomes a no-op naturally.
  No code change required.

### 5. Failure / cache behavior

- `useFeatureFlag` returns `true` (fail-open) while `useQuery` is loading
  or when the query errors. Rationale: a flag-off that briefly shows the
  Paperclip on a network blip is preferable to a flag-off that breaks the
  home form on first paint.
- `getSetting` reads through a 5 s in-memory cache (`app-settings.ts:5–7`).
  When an admin toggles off and a user is mid-session, the change is
  visible within ≤ 5 s, or on next page load, whichever comes first.
- For `direct_edit_enabled` specifically, the change is also reflected on
  React Query refetch (the `useQuery` has `refetchOnWindowFocus: true`).

## Safety analysis

**Server-side guards are independent of any client behavior.** The
client-side `useFeatureFlag` is a UX hide; the server-side `getSetting`
call inside each API handler is the actual enforcement.

Scenarios:

| Scenario | Outcome |
|---|---|
| Regular user, flag on | Works exactly as today |
| Regular user, flag off, uses UI | Button not rendered; user can't trigger the gated path |
| User flips client JS state, calls API directly | Server `getSetting` still returns `false`; assetIds stripped or `/edit` returns 404 |
| Malicious user POSTs to `/api/projects` with `assetIds` and flag off | Server strips `assetIds`; project created without images |
| Scraper reads `/api/flags` | Receives only the two booleans; no PII, no admin values |
| Logged-in admin disables flag, uploads via devtools | Server still strips/404s. Admin could just flip the flag back on; not in scope. |

**Public `/api/flags` exposure is safe**: returns only two booleans, no
PII, no admin-only values. Worst case: a scraper learns "uploads are
temporarily disabled" — useless information.

**No new attack surface**: the existing `assetIds` flow already validates
file type, size, and signed-URL expiry server-side. The flag removes a
code path; it does not introduce one.

## Testing

### New tests

1. **`tests/lib/feature-flags.test.ts`** (~30 lines)
   - `getPublicFlags()` returns an object with both expected keys.
   - When `getSetting` returns a stored value, that value wins over the
     `fallback: true` default.
   - When `getSetting` rejects, both keys fall back to `true` (fail-open).

2. **`tests/lib/use-feature-flag.test.tsx`** (~30 lines)
   - `useFeatureFlag(key)` returns `true` while loading.
   - Returns the resolved value once `useQuery` data is present.
   - `queryClient.invalidateQueries(["public-flags"])` causes a refetch.

3. **`tests/routes/api.flags.test.ts`** (~20 lines)
   - `GET /api/flags` returns 200 + JSON object with both keys.
   - Response includes `Cache-Control: public, max-age=30` header.

4. **Extend `tests/routes/api.projects.$id.edit.test.ts`** (+1 case)
   - When `getSetting("feature.direct_edit_enabled", true)` returns
     `false`, handler returns 404.
   - When flag is on, normal flow runs (existing tests cover this).

5. **Extend project creation tests** (where `POST /api/projects` is
   covered; +1 case)
   - When `feature.composer_uploads_enabled` is off and FormData has
     `assetIds`, those entries are stripped before project creation.
   - Project is still created successfully.

### Manual smoke

1. Open `/admin/settings` → confirm 2 new toggles render under the basic
   settings section, both defaulted ON.
2. Toggle "Home prompt image uploads" OFF → Save → refresh `/` → Paperclip
   gone. Curl `POST /api/projects` with `assetIds` → 200, no assets
   persisted. Verify in DB.
3. Toggle back ON → refresh `/` → Paperclip reappears.
4. Toggle "Workspace Ubah (element edit) mode" OFF → Save → open any
   project → "Ubah" toggle button gone. No element-action overlay on
   click. No annotation markers on hover.
5. Toggle back ON → full Ubah mode works.
6. `curl http://localhost:3000/api/flags` → JSON with both keys.

### Verification commands

```bash
bun run check      # format + lint + typecheck + affected tests + Knip + docs
bun run verify     # full pre-handoff check (lockfile + route regen + everything)
```

`bun run build` only if we want to confirm route-tree generation works;
`bun run verify` already regenerates it.

## Files touched

| Change | File | Notes |
|---|---|---|
| Modify | `src/lib/app-settings-registry.ts` | +12 lines (2 entries) |
| New | `src/lib/feature-flags-keys.ts` | Public flag key union |
| New | `src/lib/feature-flags.ts` | `getPublicFlags()` server helper |
| New | `src/lib/use-feature-flag.ts` | React Query hook + `useFeatureFlag` |
| New | `src/routes/api.flags.ts` | `GET /api/flags` public endpoint |
| Modify | `src/components/projects/HomePromptForm.tsx` | Wrap attach button ternary |
| Modify | `src/routes/api.projects.ts` | Strip `assetIds` when flag off |
| Modify | `src/components/projects/WorkspaceShell.tsx` | Gate Ubah state + props |
| Modify | `src/components/projects/WorkspacePrimitives.tsx` | Hide Ubah UI when flag off |
| New | `tests/lib/feature-flags.test.ts` | Server helper tests |
| New | `tests/lib/use-feature-flag.test.tsx` | Hook tests |
| New | `tests/routes/api.flags.test.ts` | Endpoint tests |
| Modify | `tests/routes/api.projects.$id.edit.test.ts` | +1 case for 404 |
| Modify | existing `POST /api/projects` test file | +1 case for assetIds strip |

5 new source files, 4 modified. 3 new test files, 2 modified. Net ~200
lines including tests.

## Risks and follow-ups

- **Cache staleness on toggle**: ≤ 5 s lag between admin PUT and client
  refetch. Acceptable for a UX-hide flag; documented in the spec.
- **No `requiresRestart`**: change is visible on next page load or within
  5 s cache TTL on the existing query. Documented.
- **Future per-user rollout**: if we later need per-user targeting, we
  replace `useFeatureFlag` with one that reads a user-id-keyed record.
  Server guards stay the same shape.
- **Annotation marker rendering**: relies on the build injecting markers
  only when Ubah mode renders them. If a future change injects markers
  unconditionally, revisit the runtime-proxy branch.

## Out of scope

- Deleting the upload or Ubah-mode code paths.
- A flag for `/api/projects/:id/generate` or other build endpoints.
- Per-user or percentage-based rollout.
- Env-var override of the new flags.
- A flag for the AI model selectors (`ai.*`) on `/admin/settings`.