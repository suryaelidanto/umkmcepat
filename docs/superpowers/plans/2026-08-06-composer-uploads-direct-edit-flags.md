# Feature Flags Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two admin-toggleable boolean feature flags on `/admin/settings` — `feature.composer_uploads_enabled` (gates home page image uploads) and `feature.direct_edit_enabled` (gates workspace Ubah/element-edit mode). Both default ON so behavior is unchanged until an admin flips them.

**Architecture:** Two `ConfigEntry` rows in the existing registry, a tiny public `GET /api/flags` endpoint, a `useFeatureFlag(key)` React Query hook, and consumer wiring on the home form + workspace. Server-side guards in `api.projects.ts` and `api.projects.$id.edit.ts` enforce independently of client state.

**Tech Stack:** Bun, React, TanStack Router (`createFileRoute`), TanStack Query (`useQuery`), Prisma, vitest. Same as the rest of the repo.

## Global Constraints

- Bun only; `bun.lock` is the canonical lockfile. No new dependencies.
- User-facing product UI copy stays Indonesian; developer-facing code/logs/errors use English.
- Default values for both new flags: `true`.
- Registry key format: `feature.<name>` (snake_case in the name segment). Tier: `basic`. Category: `feature_flag`.
- No new Prisma migration; `AppSetting` stores JSONB.
- No client-side `useFlag` already exists — build a small one alongside the feature.
- Public `/api/flags` returns only the two boolean keys; never expose admin-only data on it.
- Server-side guards MUST be independent of client state (defense in depth).
- Surgical edits: touch only what the task requires. Match surrounding style. Don't refactor adjacent code.
- No comments unless they explain a non-obvious gotcha. No `TODO`/`TBD` placeholders.
- Run `bun run check` before handoff.

---

## File Structure

**New files:**
| File | Purpose |
|---|---|
| `src/lib/feature-flags-keys.ts` | `PUBLIC_FEATURE_FLAGS` tuple + `PublicFeatureFlag` union |
| `src/lib/feature-flags.ts` | `getPublicFlags()` server helper using `getSetting` |
| `src/lib/use-feature-flag.ts` | `usePublicFlags()` + `useFeatureFlag(key)` React Query hooks |
| `src/routes/api.flags.ts` | Public `GET /api/flags` endpoint |
| `tests/lib/feature-flags.test.ts` | Tests for `getPublicFlags` |
| `tests/routes/api.flags.test.ts` | Tests for `GET /api/flags` |

**Modified files:**
| File | Why |
|---|---|
| `src/lib/app-settings-registry.ts` | Add 2 `ConfigEntry` rows |
| `src/components/projects/HomePromptForm.tsx` | Wrap attach button ternary in `{useFeatureFlag("feature.composer_uploads_enabled") ? ... : null}` |
| `src/routes/api.projects.ts` | Strip `assetIds` from FormData when flag off |
| `src/components/projects/WorkspaceShell.tsx` | Derive `effectiveDirectEditMode`; gate Ubah props |
| `src/components/projects/WorkspacePrimitives.tsx` | Add `directEditFlagEnabled` prop; gate Ubah UI |
| `tests/routes/projects.id.edit.test.ts` | +1 case: 404 when flag off |

**Tests added in step order;** total ~3 new files, 2 modified source, 2 modified tests.

---

## Task 1: Registry entries

**Files:**
- Modify: `src/lib/app-settings-registry.ts:81` (after `feature.streamer_mode`)

**Interfaces:**
- Consumes: existing `ConfigEntry` type at the same file:1–58
- Produces: two new entries discoverable by `findConfigEntry(key)`

- [ ] **Step 1: Add two entries**

Insert directly after the `feature.streamer_mode` entry (line 81, the closing `},` of that block). Match the surrounding comma + indentation exactly:

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

- [ ] **Step 2: Verify the registry loads without throwing**

Run: `bun -e 'import("./src/lib/app-settings-registry.ts").then(m => { const found = m.APP_SETTINGS.filter(e => e.key.startsWith("feature.") && ["feature.composer_uploads_enabled","feature.direct_edit_enabled"].includes(e.key)); console.log(JSON.stringify(found.map(({key, type, fallback}) => ({key, type, fallback})))); })'`

Expected: prints a 2-element array with `key`, `type: "boolean"`, `fallback: true` for both entries.

- [ ] **Step 3: Commit**

```bash
git add src/lib/app-settings-registry.ts
git commit -m "feat(admin): register composer_uploads and direct_edit feature flags"
```

---

## Task 2: Public flag key union

**Files:**
- Create: `src/lib/feature-flags-keys.ts`

**Interfaces:**
- Consumes: the two string literals added in Task 1
- Produces: `PUBLIC_FEATURE_FLAGS` tuple + `PublicFeatureFlag` union used by `feature-flags.ts` and `use-feature-flag.ts`

- [ ] **Step 1: Create the file**

```ts
export const PUBLIC_FEATURE_FLAGS = [
  "feature.composer_uploads_enabled",
  "feature.direct_edit_enabled",
] as const;

export type PublicFeatureFlag = (typeof PUBLIC_FEATURE_FLAGS)[number];
```

- [ ] **Step 2: Type-check**

Run: `bun run typecheck`

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/feature-flags-keys.ts
git commit -m "feat(admin): public feature flag key union"
```

---

## Task 3: Server helper `getPublicFlags`

**Files:**
- Create: `src/lib/feature-flags.ts`
- Create: `tests/lib/feature-flags.test.ts`

**Interfaces:**
- Consumes: `getSetting(key, fallback)` from `@/lib/app-settings`; `PUBLIC_FEATURE_FLAGS` from Task 2
- Produces: `getPublicFlags(): Promise<Record<PublicFeatureFlag, boolean>>`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/feature-flags.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

const { getSettingMock } = vi.hoisted(() => ({
  getSettingMock: vi.fn(),
}));

vi.mock("@/lib/app-settings", () => ({
  getSetting: getSettingMock,
}));

import { getPublicFlags } from "@/lib/feature-flags";

describe("getPublicFlags", () => {
  afterEach(() => {
    getSettingMock.mockReset();
  });

  it("returns both flags with stored values when getSetting resolves", async () => {
    getSettingMock.mockImplementation(async (key: string, fallback: boolean) => {
      if (key === "feature.composer_uploads_enabled") return false;
      if (key === "feature.direct_edit_enabled") return true;
      return fallback;
    });

    const flags = await getPublicFlags();

    expect(flags).toEqual({
      "feature.composer_uploads_enabled": false,
      "feature.direct_edit_enabled": true,
    });
  });

  it("falls back to true for every key when getSetting rejects", async () => {
    getSettingMock.mockRejectedValue(new Error("db down"));

    const flags = await getPublicFlags();

    expect(flags).toEqual({
      "feature.composer_uploads_enabled": true,
      "feature.direct_edit_enabled": true,
    });
  });

  it("calls getSetting exactly once per public flag", async () => {
    getSettingMock.mockResolvedValue(true);

    await getPublicFlags();

    expect(getSettingMock).toHaveBeenCalledTimes(2);
    expect(getSettingMock).toHaveBeenCalledWith(
      "feature.composer_uploads_enabled",
      true,
    );
    expect(getSettingMock).toHaveBeenCalledWith(
      "feature.direct_edit_enabled",
      true,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- tests/lib/feature-flags.test.ts`

Expected: FAIL — module not found (`@/lib/feature-flags`).

- [ ] **Step 3: Implement `getPublicFlags`**

Create `src/lib/feature-flags.ts`:

```ts
import { getSetting } from "@/lib/app-settings";

import {
  PUBLIC_FEATURE_FLAGS,
  type PublicFeatureFlag,
} from "./feature-flags-keys";

export async function getPublicFlags(): Promise<
  Record<PublicFeatureFlag, boolean>
> {
  const entries = await Promise.all(
    PUBLIC_FEATURE_FLAGS.map(async (key) => {
      try {
        return [key, await getSetting(key, true)] as const;
      } catch {
        return [key, true] as const;
      }
    }),
  );
  return Object.fromEntries(entries) as Record<PublicFeatureFlag, boolean>;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- tests/lib/feature-flags.test.ts`

Expected: 3 passing tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/feature-flags.ts tests/lib/feature-flags.test.ts
git commit -m "feat(admin): getPublicFlags server helper with tests"
```

---

## Task 4: React Query hook

**Files:**
- Create: `src/lib/use-feature-flag.ts`

**Interfaces:**
- Consumes: `getPublicFlags` from Task 3; `@tanstack/react-query`
- Produces: `usePublicFlags()` and `useFeatureFlag(key: PublicFeatureFlag): boolean` (fail-open: `true` while loading or on error)

- [ ] **Step 1: Create the file**

```ts
import { useQuery } from "@tanstack/react-query";

import { getPublicFlags } from "@/lib/feature-flags";
import type { PublicFeatureFlag } from "@/lib/feature-flags-keys";

const FLAGS_KEY = ["public-flags"] as const;

export function usePublicFlags() {
  return useQuery({
    queryFn: getPublicFlags,
    queryKey: FLAGS_KEY,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });
}

export function useFeatureFlag(key: PublicFeatureFlag): boolean {
  const { data } = usePublicFlags();
  return data?.[key] ?? true;
}
```

- [ ] **Step 2: Type-check**

Run: `bun run typecheck`

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/use-feature-flag.ts
git commit -m "feat(admin): useFeatureFlag react query hook"
```

> Note: the codebase has no existing React Query hook tests, so we skip a dedicated test for this file. Behavior is covered by manual smoke (Task 9) and the type check above. Add a vitest + `QueryClientProvider` harness later if you want it.

---

## Task 5: Public `GET /api/flags` endpoint

**Files:**
- Create: `src/routes/api.flags.ts`
- Create: `tests/routes/api.flags.test.ts`

**Interfaces:**
- Consumes: `getPublicFlags` from Task 3; `createFileRoute` (same pattern as `api.admin.settings.ts:2,52`)
- Produces: `GET /api/flags` returning `Record<PublicFeatureFlag, boolean>` with `Cache-Control: public, max-age=30`

- [ ] **Step 1: Write the failing test**

Create `tests/routes/api.flags.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

const { getPublicFlagsMock } = vi.hoisted(() => ({
  getPublicFlagsMock: vi.fn(),
}));

vi.mock("@/lib/feature-flags", () => ({
  getPublicFlags: getPublicFlagsMock,
}));

import { Route } from "@/routes/api.flags";
import { getHandler } from "./_handler";

const GET = getHandler(Route, "GET");

describe("GET /api/flags", () => {
  afterEach(() => {
    getPublicFlagsMock.mockReset();
  });

  it("returns 200 with both flags and a public cache header", async () => {
    getPublicFlagsMock.mockResolvedValue({
      "feature.composer_uploads_enabled": true,
      "feature.direct_edit_enabled": false,
    });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(
      "public, max-age=30, s-maxage=30",
    );

    const body = await response.json();
    expect(body).toEqual({
      "feature.composer_uploads_enabled": true,
      "feature.direct_edit_enabled": false,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- tests/routes/api.flags.test.ts`

Expected: FAIL — module `@/routes/api.flags` not found.

- [ ] **Step 3: Implement the route**

Create `src/routes/api.flags.ts`:

```ts
import { createFileRoute } from "@tanstack/react-router";

import { getPublicFlags } from "@/lib/feature-flags";

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

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- tests/routes/api.flags.test.ts`

Expected: 1 passing test.

- [ ] **Step 5: Regenerate the route tree**

Run: `bun run routes:generate`

Expected: prints success; `src/routeTree.gen.ts` (gitignored) gains a `Route as ApiFlagsRouteImport` entry and matching `addChildren` / type additions (same pattern as the existing `api.admin.settings`). The regenerated file is **not** committed (gitignored).

- [ ] **Step 6: Commit**

```bash
git add src/routes/api.flags.ts tests/routes/api.flags.test.ts
git commit -m "feat(admin): public GET /api/flags endpoint"
```

(`src/routeTree.gen.ts` is gitignored and regenerated locally; do not commit it.)

---

## Task 6: Wire `HomePromptForm` to the upload flag

**Files:**
- Modify: `src/components/projects/HomePromptForm.tsx:14–18, 316–367`

**Interfaces:**
- Consumes: `useFeatureFlag("feature.composer_uploads_enabled")` from Task 4
- Produces: when flag is off, neither `ComposerAttachButton` nor the `Paperclip` fallback button renders; the form still submits without images

- [ ] **Step 1: Add the import and the flag read**

In `src/components/projects/HomePromptForm.tsx`, add to the import block at line 14–18 (alphabetical order, matching surrounding style):

```ts
import { useFeatureFlag } from "@/lib/use-feature-flag";
```

Inside the `HomePromptForm` component body, add a new line directly after the `attachments` state declaration (line 74, after `const [attachments, setAttachments] = useState<PendingAttachment[]>([]);`):

```ts
  const uploadsEnabled = useFeatureFlag("feature.composer_uploads_enabled");
```

- [ ] **Step 2: Wrap the attach button ternary**

Find the existing JSX at line 316–367:

```tsx
            {status === "authenticated" ? (
              <ComposerAttachButton
                attachments={attachments}
                onAdd={(next, rejected) => {
                  /* …unchanged… */
                }}
              />
            ) : (
              <button
                type="button"
                aria-label="Lampirkan gambar"
                /* …unchanged… */
              >
                <Paperclip className="size-4" />
              </button>
            )}
```

Replace the outer ternary with a single guard that returns `null` when uploads are disabled:

```tsx
            {uploadsEnabled ? (
              status === "authenticated" ? (
                <ComposerAttachButton
                  attachments={attachments}
                  onAdd={(next, rejected) => {
                    /* …unchanged… */
                  }}
                />
              ) : (
                <button
                  type="button"
                  aria-label="Lampirkan gambar"
                  /* …unchanged… */
                >
                  <Paperclip className="size-4" />
                </button>
              )
            ) : null}
```

Do not delete the `ComposerAttachments` render block at line 296–305 (it is harmless when `attachments` is empty; the existing `attachments.length > 0` check handles that).

- [ ] **Step 3: Type-check**

Run: `bun run typecheck`

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/projects/HomePromptForm.tsx
git commit -m "feat(home): gate paperclip uploads behind feature flag"
```

---

## Task 7: Server-side guard in `POST /api/projects`

**Files:**
- Modify: `src/routes/api.projects.ts:115–181` (POST handler)

**Interfaces:**
- Consumes: `getSetting(key, fallback)` from `@/lib/app-settings`
- Produces: when `feature.composer_uploads_enabled` is off, `assetIds` and `files` FormData entries are dropped before project creation; the project is still created successfully

- [ ] **Step 1: Read the flag and zero out uploads**

In `src/routes/api.projects.ts`, line 12 currently imports `getSettingSync`. Add `getSetting` alongside it (do not delete the existing import — `getSettingSync` is still used on line 484 inside `resolveEngineForOwner`):

```ts
import { getSetting, getSettingSync } from "@/lib/app-settings";
```

Inside the `POST` handler, directly after the existing `if (!form) { … return … }` block (line 157–162), insert:

```ts
        const uploadsEnabled = await getSetting(
          "feature.composer_uploads_enabled",
          true,
        );
        if (!uploadsEnabled) {
          for (const key of Array.from(form.keys())) {
            if (key === "assetIds" || key === "files") {
              form.delete(key);
            }
          }
        }
```

This drops `assetIds` and `files` FormData entries when the flag is off, before moderation/project creation runs.

- [ ] **Step 2: Type-check**

Run: `bun run typecheck`

Expected: no errors. Confirm `getSettingSync` is still used on line 484 (or update the import accordingly).

- [ ] **Step 3: Commit**

```bash
git add src/routes/api.projects.ts
git commit -m "feat(server): strip asset uploads when composer flag is off"
```

---

## Task 8: Server-side guard in `POST /api/projects/$id/edit`

**Files:**
- Modify: `src/routes/api.projects.$id.edit.ts:42–50` (top of `handleEditPost`)
- Modify: `tests/routes/projects.id.edit.test.ts` (add 1 test case)

**Interfaces:**
- Consumes: `getSetting(key, fallback)` from `@/lib/app-settings`
- Produces: when `feature.direct_edit_enabled` is off, the handler returns `404` before any side effects

- [ ] **Step 1: Add the flag import + guard**

In `src/routes/api.projects.$id.edit.ts`, add this import (next to the existing imports near line 1–25; alphabetical order):

```ts
import { getSetting } from "@/lib/app-settings";
```

At the very top of `handleEditPost` (line 42), directly after the existing `if (!session?.user?.id) { … return … }` block (currently lines 45–50), insert:

```ts
  const directEditEnabled = await getSetting(
    "feature.direct_edit_enabled",
    true,
  );
  if (!directEditEnabled) {
    return new Response("Not Found", { status: 404 });
  }
```

This goes before rate-limit + energy checks so a stale client cannot burn budget on a kill-switch-disabled feature.

- [ ] **Step 2: Write the failing test case**

In `tests/routes/projects.id.edit.test.ts`, find the existing `vi.mock("@/lib/app-settings", …)` block (or add one if missing). Add a hoisted mock at the top of the file alongside the other hoisted mocks (line 27–51):

```ts
  getSettingMock: vi.fn(async (_key: string, fallback: boolean) => fallback),
```

(If a `@/lib/app-settings` mock block already exists, merge the new mock into it instead of duplicating.)

Add the `vi.mock("@/lib/app-settings", () => ({ getSetting: getSettingMock }))` line at the same place as the other `vi.mock` calls (line 53 onward). Then inside the existing `describe` block, add a new test:

```ts
  it("returns 404 when feature.direct_edit_enabled is off", async () => {
    getSettingMock.mockResolvedValueOnce(false);

    const response = await POST(
      new Request("http://localhost/api/projects/project_1/edit", {
        method: "POST",
        body: JSON.stringify({ instruction: "test" }),
      }),
      { id: "project_1" },
    );

    expect(response.status).toBe(404);
  });
```

(Adapt the `POST` invocation to match the existing test conventions in the file; the surrounding tests on lines 144+ already show the exact `Request` shape, `session` mock, and call pattern.)

- [ ] **Step 3: Run the test file to verify it fails (red)**

Run: `bun run test -- tests/routes/projects.id.edit.test.ts`

Expected: new test fails (handler currently doesn't check the flag).

- [ ] **Step 4: Verify the test passes after Step 1's edit**

Re-run: `bun run test -- tests/routes/projects.id.edit.test.ts`

Expected: new test passes; existing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/routes/api.projects.$id.edit.ts tests/routes/projects.id.edit.test.ts
git commit -m "feat(server): 404 /edit when direct_edit flag is off"
```

---

## Task 9: Wire workspace `directEditMode` to the flag

**Files:**
- Modify: `src/components/projects/WorkspaceShell.tsx:1–60 (imports), 377 (state), 3682, 3684, 3738, 3743 (props)`

**Interfaces:**
- Consumes: `useFeatureFlag("feature.direct_edit_enabled")` from Task 4
- Produces: when flag is off, `effectiveDirectEditMode = false`; `directEditActive` and `directEditActions` props on rendered children become falsy

- [ ] **Step 1: Add the import**

In `src/components/projects/WorkspaceShell.tsx`, find the existing `@/lib/...` imports near the top (lines 1–60). Add, matching the surrounding alphabetical / block order:

```ts
import { useFeatureFlag } from "@/lib/use-feature-flag";
```

- [ ] **Step 2: Read the flag and derive `effectiveDirectEditMode`**

Inside the `WorkspaceShell` component (or whichever function component currently owns the `directEditMode` state at line 377), add near the other hook calls:

```ts
  const directEditFlagEnabled = useFeatureFlag("feature.direct_edit_enabled");
  const effectiveDirectEditMode = directEditMode && directEditFlagEnabled;
```

- [ ] **Step 3: Pass `effectiveDirectEditMode` to children**

Find every place `directEditMode` (or `directEditActive` derived from it) is currently read or passed as a prop at lines 3682, 3684, 3738, 3743, and replace the read site with `effectiveDirectEditMode`. Specifically:

- Line 3682 (`directEditActive={directEditMode}` or similar) → `directEditActive={effectiveDirectEditMode}`
- Line 3684 (any `directEditActions={…}` that depends on `directEditMode`) → gate on `effectiveDirectEditMode`, e.g. spread `effectiveDirectEditMode ? directEditActions : undefined`
- Line 3738 (`directEditActive={directEditMode}`) → `directEditActive={effectiveDirectEditMode}`
- Line 3743 (`onDirectEditAction={…}` or related) → unchanged; the child component (Task 10) hides its UI when the prop is absent

Do not delete the `setDirectEditMode` setter or the toggle UI button itself — Task 10 hides the button, not the state. (If the toggle button is rendered inline at line 377 area, leave it; Task 10 owns the visual hide.)

- [ ] **Step 4: Type-check**

Run: `bun run typecheck`

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/projects/WorkspaceShell.tsx
git commit -m "feat(workspace): derive effective direct edit mode from flag"
```

---

## Task 10: Wire workspace primitives to the flag

**Files:**
- Modify: `src/components/projects/WorkspacePrimitives.tsx` (props + 4 render sites)

**Interfaces:**
- Consumes: existing `directEditActive` / `directEditActions` / `directEditIntents` props
- Produces: a new optional `directEditFlagEnabled?: boolean` prop (default `true`) on the relevant component(s); when `false`, the toggle button + toolbar + action overlay + annotation markers all hide

- [ ] **Step 1: Add the new prop with a `true` default**

In `src/components/projects/WorkspacePrimitives.tsx`, find the component props type at line 83 (and any other component that takes `directEditActive` / `directEditActions` — likely line 473). Add an optional boolean field on the props type, and default it to `true` via destructuring at the function signature. For the component at line 83, add the field:

```ts
  directEditFlagEnabled?: boolean;
```

and at the function signature, destructure with default:

```ts
export function WorkspaceSurface({
  /* …existing props… */
  directEditActive = false,
  directEditFlagEnabled = true,
}: {
  /* …existing prop types… */
  directEditActive?: boolean;
  directEditFlagEnabled?: boolean;
}) {
  /* …existing body… */
}
```

(Adjust destructuring and prop-type names to match the actual component declarations. The intent: existing callers that don't pass `directEditFlagEnabled` keep working because the default is `true`.)

For the second component at line 473 (the one with `directEditActive` + `directEditIntents`), add the same `directEditFlagEnabled?: boolean` field and the same `= true` default.

- [ ] **Step 2: Gate the "Ubah / Nonaktifkan ubah" toggle button**

At lines 176–183 (desktop layout) and 309–316 (mobile layout), wrap the toggle button's render in a `directEditFlagEnabled` check:

```tsx
{directEditFlagEnabled ? (
  <button
    type="button"
    aria-pressed={directEditActive}
    /* …unchanged… */
  >
    {/* …unchanged… */}
  </button>
) : null}
```

- [ ] **Step 3: Gate the undo/redo/save/discard toolbar**

At lines 205–240, change the existing condition `directEditActive && directEditActions` to also require the flag:

```tsx
{directEditFlagEnabled && directEditActive && directEditActions ? (
  /* …unchanged toolbar… */
) : null}
```

- [ ] **Step 4: Gate the element-action overlay**

At lines 685–695 (the overlay container) and 732–798 (the move-up/move-down/remove buttons), gate the entire overlay render on `directEditFlagEnabled`. The simplest change:

```tsx
{directEditFlagEnabled ? (
  /* …existing overlay + buttons… */
) : null}
```

at the outermost JSX node of the overlay block.

- [ ] **Step 5: Pass the flag from `WorkspaceShell`**

In `src/components/projects/WorkspaceShell.tsx`, where the primitives components are rendered at lines 3682–3684 and 3738–3743, add the new prop alongside the existing `directEditActive={effectiveDirectEditMode}`:

```tsx
<…Primitives
  directEditActive={effectiveDirectEditMode}
  directEditFlagEnabled={directEditFlagEnabled}
  /* …other props… */
/>
```

- [ ] **Step 6: Type-check + lint**

Run: `bun run typecheck && bun run lint`

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/projects/WorkspaceShell.tsx src/components/projects/WorkspacePrimitives.tsx
git commit -m "feat(workspace): gate Ubah UI behind direct_edit flag"
```

---

## Task 11: Verify end-to-end

**Files:** none (verification only)

- [ ] **Step 1: Run the full manual gate**

Run: `bun run check`

Expected: format + lint + typecheck + affected tests + Knip + docs all pass. Fix any issues before continuing.

- [ ] **Step 2: Run the broader verify gate**

Run: `bun run verify`

Expected: docs check, route regeneration, format + lint + typecheck + full unit tests + Knip all pass. Fix any issues.

- [ ] **Step 3: Smoke test the new flags (manual)**

Boot dev infra (`bun run infra`, `bun run db:migrate`, `bun run dev`) and:

1. Open `/admin/settings` → confirm 2 new toggles render under the basic settings section, both defaulted ON.
2. Toggle "Home prompt image uploads" OFF → Save → refresh `/` → Paperclip button gone. Curl-test the server guard:
   ```bash
   curl -X POST http://localhost:3000/api/projects \
     -F "prompt=test" -F "mode=discuss" -F "idempotencyKey=$(uuidgen)" \
     -F "assetIds=does-not-matter"
   ```
   Expect a 200 with `assetIds: []` (the server dropped the value).
3. Toggle back ON → refresh `/` → Paperclip reappears.
4. Toggle "Workspace Ubah (element edit) mode" OFF → Save → open any project → "Ubah" toggle button is gone from the workspace toolbar. Clicking elements on the preview no longer reveals the move-up/move-down/remove overlay. Annotation hover markers no longer appear.
5. Toggle back ON → Ubah mode returns.
6. Verify the public endpoint:
   ```bash
   curl http://localhost:3000/api/flags
   ```
   Expect JSON with both keys and a `Cache-Control: public, max-age=30` header.

- [ ] **Step 4: Commit any verification artifacts (none expected)**

If everything is clean, no commit. If you discovered an unrelated bug while smoke-testing, file a separate PR per `AGENTS.md` ("don't fix unrelated bugs in this diff").