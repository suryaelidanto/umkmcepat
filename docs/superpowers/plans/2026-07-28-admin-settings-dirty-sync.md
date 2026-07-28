# /admin/settings Dirty Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Disable each category's Save button until at least one field in that category is dirty, and persist only the dirty keys.

**Architecture:** Track the originally-loaded `entries` as `baseline`; compute `dirty[key]` by comparing `draft[key]` to `baseline.effectiveValue`. Per-field Reset button drops the key from the draft. Save PUT body contains only dirty keys for the clicked category. Server route is untouched — it already accepts a partial values map.

**Tech Stack:** Bun, React 18, TanStack Router, TanStack Query, Prisma. No new dependencies.

## Global Constraints

- All UI copy in Indonesian. Code, comments, commit messages in English.
- One logical commit per task. Conventional Commits (`feat:`, `fix:`, `chore:`).
- Server route `src/routes/api.admin.settings.ts` MUST NOT be modified — it already handles partial `values` correctly.
- No new runtime dependencies.
- Match existing surrounding code style (`useState`, `fetchJson`, Sonner toasts).
- Save button stays `type="button"`; per-field Reset stays `type="button"`.

---

## File Structure

| File | Change | Purpose |
| --- | --- | --- |
| `src/routes/_main.admin.settings.helpers.ts` | create | Pure helper: `getDirtyKeys(entries, draft)` + `isDirtyEntry` |
| `src/routes/_main.admin.settings.helpers.test.ts` | create | Unit tests for the helper |
| `src/routes/_main.admin.settings.tsx` | modify | Use helper, baseline state, per-field Reset, disabled Save, narrowed PUT body |

No other files change.

---

## Task 1: Pure helper + unit tests

**Files:**
- Create: `src/routes/_main.admin.settings.helpers.ts`
- Create: `src/routes/_main.admin.settings.helpers.test.ts`

**Interfaces (consumed by Task 2):**
- `SettingEntry` — `{ category: string; dbValue: unknown; effectiveValue: unknown; fallback: boolean | number | string; key: string; label: string; source: string; type: "boolean" | "number" | "string" }`
- `isDirtyEntry(entry: SettingEntry, draftValue: unknown): boolean` — true iff `draftValue !== undefined` AND `draftValue !== effectiveValue`
- `getDirtyKeys(entries: SettingEntry[], draft: Record<string, unknown>): Set<string>` — set of keys where `isDirtyEntry` is true

- [ ] **Step 1: Write the failing test file**

Create `src/routes/_main.admin.settings.helpers.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import { getDirtyKeys, isDirtyEntry } from "./_main.admin.settings.helpers";
import type { SettingEntry } from "./_main.admin.settings";

const baseEntry = (
  overrides: Partial<SettingEntry> = {},
): SettingEntry => ({
  category: "feature_flag",
  dbValue: null,
  effectiveValue: false,
  fallback: false,
  key: "feature.test",
  label: "Test",
  source: "fallback",
  type: "boolean",
  ...overrides,
});

describe("isDirtyEntry", () => {
  test("returns false when no draft value", () => {
    expect(isDirtyEntry(baseEntry(), undefined)).toBe(false);
  });

  test("returns false when draft equals effective", () => {
    expect(isDirtyEntry(baseEntry(), false)).toBe(false);
  });

  test("returns true when boolean flips", () => {
    expect(isDirtyEntry(baseEntry({ effectiveValue: false }), true)).toBe(
      true,
    );
  });

  test("returns true when number changes", () => {
    expect(
      isDirtyEntry(
        baseEntry({ type: "number", effectiveValue: 100 }),
        200,
      ),
    ).toBe(true);
  });

  test("returns false when number reverted to baseline", () => {
    expect(
      isDirtyEntry(
        baseEntry({ type: "number", effectiveValue: 100 }),
        100,
      ),
    ).toBe(false);
  });

  test("returns true when string changes", () => {
    expect(
      isDirtyEntry(
        baseEntry({ type: "string", effectiveValue: "a" }),
        "b",
      ),
    ).toBe(true);
  });
});

describe("getDirtyKeys", () => {
  test("returns empty set when no drafts", () => {
    const entries = [baseEntry({ key: "a" }), baseEntry({ key: "b" })];
    expect(getDirtyKeys(entries, {})).toEqual(new Set());
  });

  test("returns only keys whose draft differs from baseline", () => {
    const entries = [
      baseEntry({ key: "a", effectiveValue: false }),
      baseEntry({ key: "b", effectiveValue: false }),
    ];
    const dirty = getDirtyKeys(entries, { a: true, b: false });
    expect(dirty).toEqual(new Set(["a"]));
  });

  test("skips keys whose draft is undefined", () => {
    const entries = [baseEntry({ key: "a", effectiveValue: false })];
    const dirty = getDirtyKeys(entries, { a: undefined });
    expect(dirty).toEqual(new Set());
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/routes/_main.admin.settings.helpers.test.ts`
Expected: FAIL — module `./_main.admin.settings.helpers` not found.

- [ ] **Step 3: Implement the helper**

Create `src/routes/_main.admin.settings.helpers.ts`:

```ts
type SettingEntry = {
  category: string;
  dbValue: unknown;
  effectiveValue: unknown;
  fallback: boolean | number | string;
  key: string;
  label: string;
  source: string;
  type: "boolean" | "number" | "string";
};

export function isDirtyEntry(
  entry: SettingEntry,
  draftValue: unknown,
): boolean {
  if (draftValue === undefined) {
    return false;
  }
  return draftValue !== entry.effectiveValue;
}

export function getDirtyKeys(
  entries: SettingEntry[],
  draft: Record<string, unknown>,
): Set<string> {
  const dirty = new Set<string>();
  for (const entry of entries) {
    if (entry.key in draft && isDirtyEntry(entry, draft[entry.key])) {
      dirty.add(entry.key);
    }
  }
  return dirty;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/routes/_main.admin.settings.helpers.test.ts`
Expected: PASS (all 9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/routes/_main.admin.settings.helpers.ts src/routes/_main.admin.settings.helpers.test.ts
git commit -m "feat(admin-settings): add dirty-key helper"
```

---

## Task 2: Wire helper into route

**Files:**
- Modify: `src/routes/_main.admin.settings.tsx`

**Consumes:**
- `isDirtyEntry`, `getDirtyKeys` from `./_main.admin.settings.helpers`
- The existing `SettingEntry` type already defined at the top of the route file

- [ ] **Step 1: Extract `SettingEntry` type and import the helper**

Replace the top of `src/routes/_main.admin.settings.tsx`:

```tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { fetchJson } from "@/lib/query-client";

import {
  getDirtyKeys,
  isDirtyEntry,
  type SettingEntry,
} from "./_main.admin.settings.helpers";

export const Route = createFileRoute("/_main/admin/settings")({
  component: SettingsPage,
});
```

Remove the inline `type SettingEntry = { … }` block (it now lives in the helpers file).

- [ ] **Step 2: Add baseline state and dirty map computation**

Inside `SettingsPage`, after the existing `const { data } = useQuery(...)`:

```tsx
const [baseline, setBaseline] = useState<SettingEntry[]>([]);
const [draft, setDraft] = useState<Record<string, unknown>>({});

// Reconcile baseline once data lands.
const entries = data?.entries ?? [];
if (data && baseline !== entries && draft === {}) {
  setBaseline(entries);
}

const dirtyByCategory = (cat: string): Set<string> =>
  getDirtyKeys(entries.filter((e) => e.category === cat), draft);
```

Note: the reconciliation block runs during render — it only mutates state when `baseline !== entries` AND `draft === {}` (initial load). `baseline !== entries` is reference-comparison; TanStack Query returns a stable reference until refetch. The `setBaseline` call after invalidation is the second arm below.

After `save.mutate(...)` succeeds, also re-sync baseline. Replace the `onSuccess` handler:

```tsx
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: ["admin", "settings"] });
  setDraft({});
  toast.success("Pengaturan disimpan.");
},
```

After the query refetches, we want `baseline` to follow the new server payload. Replace the reconciliation arm:

```tsx
const entries = data?.entries ?? [];
const dirtyKeys = new Set(Object.keys(draft));
if (data && baseline !== entries && dirtyKeys.size === 0) {
  setBaseline(entries);
}
```

This still gates initial-load baseline, but also lets future renders see updated `entries` from refetch — when the user has no dirty keys, baseline tracks server. When the user has dirty keys, baseline stays at last-known-server until they save and clear the draft.

- [ ] **Step 3: Render per-field Reset button**

In the row `<div>` for each entry, after the boolean toggle OR the input, add a Reset button:

```tsx
{isDirtyEntry(entry, draft[entry.key]) && (
  <button
    className="rounded-radius-md border border-surface-warm-white/15 px-spacing-2 py-spacing-1 text-xs text-surface-warm-white/80 hover:bg-surface-warm-white/10"
    onClick={() =>
      setDraft((d) => {
        const next = { ...d };
        delete next[entry.key];
        return next;
      })
    }
    type="button"
  >
    Reset
  </button>
)}
```

Place it just before the closing `</div>` of the row, after the existing control.

- [ ] **Step 4: Disable Save when category has no dirty keys; send only dirty keys**

Replace the Save `<button>` block:

```tsx
{(() => {
  const dirty = dirtyByCategory(cat);
  const hasDirty = dirty.size > 0;
  return (
    <button
      className="mt-spacing-3 rounded-radius-md bg-surface-warm-white/15 px-spacing-3 py-spacing-2 text-sm text-surface-warm-white disabled:cursor-not-allowed disabled:opacity-50"
      disabled={!hasDirty || save.isPending}
      onClick={() => {
        const values: Record<string, unknown> = {};
        for (const key of dirty) {
          values[key] = draft[key];
        }
        save.mutate({ category: cat, values });
      }}
      type="button"
    >
      {hasDirty
        ? `Simpan ${cat.replace("_", " ")} (${dirty.size})`
        : `Simpan ${cat.replace("_", " ")}`}
    </button>
  );
})()}
```

- [ ] **Step 5: Run the unit tests to confirm helper still passes**

Run: `bun test src/routes/_main.admin.settings.helpers.test.ts`
Expected: PASS.

- [ ] **Step 6: Run `bun run check`**

Run: `bun run check`
Expected: format/lint/typecheck all green. If prettier reformats anything, accept the change and re-run.

- [ ] **Step 7: Commit**

```bash
git add src/routes/_main.admin.settings.tsx
git commit -m "feat(admin-settings): disable save until dirty, send only dirty keys"
```

---

## Task 3: Manual smoke check + final verification

**Files:** none modified.

- [ ] **Step 1: Boot infra and dev server**

Run:
```bash
bun run infra
bun run dev
```

Expected: dev server on `http://localhost:3000`, Postgres reachable.

- [ ] **Step 2: Manual flow**

1. Visit `/admin/settings` (log in as admin first; default seed admin per `docs/architecture.md`).
2. Confirm Save buttons for all 4 categories show no count suffix and look disabled (opacity-50).
3. Flip a boolean toggle → Reset button appears on that row → Save count becomes `(1)` and Save is enabled.
4. Click Reset → row reverts, Save goes back to disabled.
5. Change a number input → Save count `(1)` → click Save → toast "Pengaturan disimpan." → Save reverts to disabled, draft cleared.
6. Reload page → change is still in place (DB persisted).
7. Edit two fields in one category, save only those two → third field untouched.

- [ ] **Step 3: Run full `bun run check`**

Run: `bun run check`
Expected: green.

- [ ] **Step 4: Done**

No commit in this task. Report the manual flow outcome.