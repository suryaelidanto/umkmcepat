# Admin Settings Full Client Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand settings-save invalidation so booster packs, project limit, energy limit, waitlist status, streamer mode, and the settings form all refresh without a full page reload.

**Architecture:** Single helper `settingsSaveInvalidateKeys()` lists all product-facing query keys. Settings mutation already invalidates that list. Expand list + tests only.

**Tech Stack:** TanStack Query, Vitest, Bun.

**Spec:** `docs/superpowers/specs/2026-08-03-admin-settings-client-sync-design.md`

## Global Constraints

- Surgical edit: helper + test + docs only (call site already correct).
- No router.refresh / full reload.
- Bun only. Atomic commits on `dev`.
- `bun run check` before handoff.

## File structure

| File | Role |
|------|------|
| `src/lib/admin-settings-sync.ts` | Expanded key list |
| `src/lib/admin-settings-sync.test.ts` | Assert full set |
| Docs under `docs/superpowers/` | Spec + this plan |

---

### Task 1: Expand invalidate keys (TDD)

**Files:**
- Modify: `src/lib/admin-settings-sync.ts`
- Modify: `src/lib/admin-settings-sync.test.ts`

**Interfaces:**
- Produces: `settingsSaveInvalidateKeys()` returns (order free, content required):
  ```ts
  ["admin", "settings"]
  queryKeys.adminStreamerMode
  queryKeys.boosterPacks
  queryKeys.projects
  queryKeys.energy
  queryKeys.waitlistStatus
  ```

- [ ] **Step 1: Write failing test expectations**

Replace/extend `src/lib/admin-settings-sync.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { settingsSaveInvalidateKeys } from "./admin-settings-sync";
import { queryKeys } from "./query-client";

describe("settingsSaveInvalidateKeys", () => {
  it("invalidates all product-facing settings-dependent client caches", () => {
    const keys = settingsSaveInvalidateKeys();
    expect(keys).toEqual(
      expect.arrayContaining([
        ["admin", "settings"],
        [...queryKeys.adminStreamerMode],
        [...queryKeys.boosterPacks],
        [...queryKeys.projects],
        [...queryKeys.energy],
        [...queryKeys.waitlistStatus],
      ]),
    );
    expect(keys).toHaveLength(6);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL** (length still 2)

```bash
bun test src/lib/admin-settings-sync.test.ts
```

- [ ] **Step 3: Implement helper**

```ts
import { queryKeys } from "@/lib/query-client";

/** Query keys to invalidate after a successful PUT /api/admin/settings. */
export function settingsSaveInvalidateKeys(): readonly (readonly string[])[] {
  return [
    ["admin", "settings"],
    queryKeys.adminStreamerMode,
    queryKeys.boosterPacks,
    queryKeys.projects,
    queryKeys.energy,
    queryKeys.waitlistStatus,
  ];
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
bun test src/lib/admin-settings-sync.test.ts
```

- [ ] **Step 5: Quality gate + commit**

```bash
bun run check
git add src/lib/admin-settings-sync.ts src/lib/admin-settings-sync.test.ts \
  docs/superpowers/specs/2026-08-03-admin-settings-client-sync-design.md \
  docs/superpowers/plans/2026-08-03-admin-settings-client-sync.md
git commit -m "fix(admin): invalidate all settings-dependent client queries on save"
```

---

## Self-review

| Spec requirement | Task |
|------------------|------|
| boosterPacks | Task 1 |
| projects | Task 1 |
| energy | Task 1 |
| waitlistStatus | Task 1 |
| keep settings + streamer | Task 1 |
| no call-site rewrite | already wired |

No placeholders.
