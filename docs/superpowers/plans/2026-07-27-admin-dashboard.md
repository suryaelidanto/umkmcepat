# Admin Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a tabbed admin dashboard at `/admin` with DB-driven runtime config (overrides `.env`, no rebuild), user/waitlist/transaction management, and a simple analytics overview.

**Architecture:** Single `AppSetting` table (DB-first, env-fallback, 5s in-process cache) feeds a typed config registry. The existing `_main.admin.tsx` becomes a layout shell with 5 sub-routes. Admin detection stays `ADMIN_EMAILS` env-allowlist (no role column). Secrets stay env-only.

**Tech Stack:** TanStack Start (file routes, `createServerFn`), Prisma + PostgreSQL, TanStack Query, sonner (toasts), vitest.

## Global Constraints

- Bun only; `bun.lock` canonical.
- Work from `dev`; atomic commits (one logical unit per commit) to `dev`.
- Surgical edits; match surrounding style; clean up only your own mess.
- User-facing UI copy: Indonesian. Dev docs/code/logs/errors: English.
- Never write secrets to tracked files. Env blocks use empty `""` values.
- Never echo `process.env` values to terminal/logs — print name + set/unset boolean only.
- TDD: failing test → implement → pass → commit, per task.
- `bun run check` is the fast gate (format/lint/typecheck/`test:changed`/Knip). Run after each task before commit. Pre-commit runs `bun run check:commit` (lockfile guard + prettier/eslint on staged only).
- New reusable UI → Storybook (same change or first).
- Behavior-preserving config migration: env still works when no DB row exists.

---

## File Structure

**New files:**
- `prisma/migrations/<timestamp>_add_app_setting/migration.sql` — AppSetting table.
- `prisma/migrations/<timestamp>_add_user_banned_at/migration.sql` — User.bannedAt.
- `src/lib/app-settings-registry.ts` — typed config key registry (source of truth).
- `src/lib/app-settings.ts` — `getSetting` (async, DB→env→fallback, 5s cache) + `getSettingSync` (cache-only) + `invalidateSettingCache`.
- `src/lib/app-settings.test.ts` — read-layer tests.
- `src/lib/app-settings-registry.test.ts` — registry invariant tests.
- `src/routes/api.admin.overview.ts` — analytics counts.
- `src/routes/api.admin.users.ts` — list/search.
- `src/routes/api.admin.users.$id.ts` — detail + ban/unban.
- `src/routes/api.admin.transactions.ts` — list/filter.
- `src/routes/api.admin.transactions.$orderId.verify.ts` — Pakasir verify.
- `src/routes/api.admin.settings.ts` — GET/PUT config.
- `src/routes/_main.admin.index.tsx` — Overview tab.
- `src/routes/_main.admin.users.tsx` — Users tab.
- `src/routes/_main.admin.waitlist.tsx` — Waitlist tab (relocated from `_main.admin.tsx`).
- `src/routes/_main.admin.transactions.tsx` — Transactions tab.
- `src/routes/_main.admin.settings.tsx` — Settings tab.
- `src/components/admin/AdminTabs.tsx` — shared tab nav.

**Modified files:**
- `prisma/schema.prisma` — add `AppSetting` model + `User.bannedAt`.
- `src/lib/waitlist-enabled.ts` — `isWaitlistEnabled` → async, reads `getSetting`.
- `src/routes/api.user.waitlist.ts` — `await isWaitlistEnabled()`.
- `src/lib/pakasir.ts` — add `getBoosterPack(id)` async resolver (keeps `BOOSTER_PACKS` const as fallback).
- `src/routes/api.payment.create.ts` — use `getBoosterPack` for amount/energy.
- `src/lib/rate-limit.ts` — `getRateLimitConfig` reads `getSetting` (async).
- `src/lib/config.ts` — capability flags read `getSetting` (async).
- `src/lib/auth.ts` — `auth()` rejects banned users (`bannedAt` set).
- `src/routes/_main.admin.tsx` — becomes layout shell (tabs + `<Outlet/>`), sonner `<Toaster/>`.
- `docs/architecture.md` — record admin dashboard + AppSetting boundary.

---

### Task 1: AppSetting table + Prisma migration

**Files:**
- Modify: `prisma/schema.prisma` (append `AppSetting` model)
- Create: `prisma/migrations/20260727100000_add_app_setting/migration.sql`

**Interfaces:**
- Produces: `prisma.appSetting` client access (`{ key, category, value: Json, updatedAt, updatedBy }`).

- [ ] **Step 1: Add the model to schema.prisma**

Append after the `WaitlistEntry` model:

```prisma
/// Runtime-overridable non-secret config. DB row wins; read layer falls back
/// to process.env then hardcoded default. Secrets NEVER live here.
model AppSetting {
  key       String   @id @db.VarChar(160)
  category  String   @db.VarChar(32)
  value     Json
  updatedAt DateTime @updatedAt
  updatedBy String?  @db.VarChar(160)

  @@index([category])
}
```

- [ ] **Step 2: Create the migration SQL**

Create `prisma/migrations/20260727100000_add_app_setting/migration.sql`:

```sql
-- CreateTable
CREATE TABLE "AppSetting" (
    "key" VARCHAR(160) NOT NULL,
    "category" VARCHAR(32) NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" VARCHAR(160),

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "AppSetting_category_idx" ON "AppSetting"("category");
```

- [ ] **Step 3: Generate the client + apply migration**

Run:
```bash
bunx prisma generate
bun run db:migrate
```
Expected: migration applied; `prisma.appSetting` typed.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260727100000_add_app_setting/migration.sql
git commit -m "feat(config): add AppSetting table for DB-driven runtime config"
```

---

### Task 2: Config registry

**Files:**
- Create: `src/lib/app-settings-registry.ts`
- Test: `src/lib/app-settings-registry.test.ts`

**Interfaces:**
- Produces: `APP_SETTINGS: ConfigEntry[]`, `type ConfigEntry`, `type SettingType`, `type SettingCategory`.
- Consumes: nothing (source of truth).

- [ ] **Step 1: Write the failing test**

`src/lib/app-settings-registry.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  APP_SETTINGS,
  type ConfigEntry,
} from "@/lib/config/app-settings-registry";

describe("APP_SETTINGS registry", () => {
  it("has no duplicate keys", () => {
    const keys = APP_SETTINGS.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every entry has a non-empty label and valid type", () => {
    for (const entry of APP_SETTINGS) {
      expect(entry.label.length).toBeGreaterThan(0);
      expect(["boolean", "number", "string"]).toContain(entry.type);
    }
  });

  it("every category is one of the known set", () => {
    const valid = ["feature_flag", "booster", "rate_limit", "ai"];
    for (const entry of APP_SETTINGS) {
      expect(valid).toContain(entry.category);
    }
  });

  it("includes the waitlist flag with fail-safe default true", () => {
    const e = APP_SETTINGS.find((x) => x.key === "feature.waitlist_enabled");
    expect(e).toBeDefined();
    expect(e?.type).toBe("boolean");
    expect(e?.fallback).toBe(true);
  });

  it("includes all four booster packs with amount+energy", () => {
    for (const id of ["pocket", "starter", "popular", "max"]) {
      expect(
        APP_SETTINGS.find((x) => x.key === `booster.${id}.amount`),
      ).toBeDefined();
      expect(
        APP_SETTINGS.find((x) => x.key === `booster.${id}.energy`),
      ).toBeDefined();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run --project unit src/lib/app-settings-registry.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the registry**

`src/lib/app-settings-registry.ts`:

```ts
export type SettingType = "boolean" | "number" | "string";
export type SettingCategory = "feature_flag" | "booster" | "rate_limit" | "ai";

export type ConfigEntry = {
  key: string;
  category: SettingCategory;
  type: SettingType;
  label: string;
  fallback: boolean | number | string;
};

// Source of truth for DB-overridable, non-secret config. Adding a setting
// later = one entry here; it auto-appears in the admin Settings UI. Secrets
// (API keys, credentials) NEVER appear here — they stay in .env.
export const APP_SETTINGS: ConfigEntry[] = [
  // feature_flag
  {
    key: "feature.waitlist_enabled",
    category: "feature_flag",
    type: "boolean",
    label: "Waitlist onboarding gate",
    fallback: true,
  },
  {
    key: "feature.generated_build_execution",
    category: "feature_flag",
    type: "boolean",
    label: "Generated build execution",
    fallback: false,
  },
  {
    key: "feature.generated_public_execution",
    category: "feature_flag",
    type: "boolean",
    label: "Generated public execution",
    fallback: false,
  },
  // booster (fallbacks mirror BOOSTER_PACKS in pakasir.ts)
  {
    key: "booster.pocket.amount",
    category: "booster",
    type: "number",
    label: "Pocket — amount (Rp)",
    fallback: 2900,
  },
  {
    key: "booster.pocket.energy",
    category: "booster",
    type: "number",
    label: "Pocket — energy",
    fallback: 50000,
  },
  {
    key: "booster.starter.amount",
    category: "booster",
    type: "number",
    label: "Starter — amount (Rp)",
    fallback: 8900,
  },
  {
    key: "booster.starter.energy",
    category: "booster",
    type: "number",
    label: "Starter — energy",
    fallback: 200000,
  },
  {
    key: "booster.popular.amount",
    category: "booster",
    type: "number",
    label: "Popular — amount (Rp)",
    fallback: 24900,
  },
  {
    key: "booster.popular.energy",
    category: "booster",
    type: "number",
    label: "Popular — energy",
    fallback: 600000,
  },
  {
    key: "booster.max.amount",
    category: "booster",
    type: "number",
    label: "Max — amount (Rp)",
    fallback: 59900,
  },
  {
    key: "booster.max.energy",
    category: "booster",
    type: "number",
    label: "Max — energy",
    fallback: 1500000,
  },
  // rate_limit (fallbacks mirror rate-limit.ts defaults)
  {
    key: "ratelimit.global_ip.requests",
    category: "rate_limit",
    type: "number",
    label: "Global IP — requests",
    fallback: 300,
  },
  {
    key: "ratelimit.global_ip.window_seconds",
    category: "rate_limit",
    type: "number",
    label: "Global IP — window (s)",
    fallback: 60,
  },
  {
    key: "ratelimit.ai_user.requests",
    category: "rate_limit",
    type: "number",
    label: "AI user — requests",
    fallback: 60,
  },
  {
    key: "ratelimit.ai_user.window_seconds",
    category: "rate_limit",
    type: "number",
    label: "AI user — window (s)",
    fallback: 600,
  },
  {
    key: "ratelimit.ai_ip.requests",
    category: "rate_limit",
    type: "number",
    label: "AI IP — requests",
    fallback: 20,
  },
  {
    key: "ratelimit.ai_ip.window_seconds",
    category: "rate_limit",
    type: "number",
    label: "AI IP — window (s)",
    fallback: 600,
  },
  {
    key: "ratelimit.build_user.requests",
    category: "rate_limit",
    type: "number",
    label: "Build user — requests",
    fallback: 10,
  },
  {
    key: "ratelimit.build_user.window_seconds",
    category: "rate_limit",
    type: "number",
    label: "Build user — window (s)",
    fallback: 3600,
  },
  {
    key: "ratelimit.build_ip.requests",
    category: "rate_limit",
    type: "number",
    label: "Build IP — requests",
    fallback: 5,
  },
  {
    key: "ratelimit.build_ip.window_seconds",
    category: "rate_limit",
    type: "number",
    label: "Build IP — window (s)",
    fallback: 3600,
  },
  // ai (optional — tunable live)
  {
    key: "ai.timeout.moderation_ms",
    category: "ai",
    type: "number",
    label: "AI — moderation timeout (ms)",
    fallback: 30000,
  },
  {
    key: "ai.timeout.discuss_ms",
    category: "ai",
    type: "number",
    label: "AI — discuss timeout (ms)",
    fallback: 90000,
  },
  {
    key: "ai.models_default",
    category: "ai",
    type: "string",
    label: "AI — default model id",
    fallback: "default-combo",
  },
];

export function findConfigEntry(key: string): ConfigEntry | undefined {
  return APP_SETTINGS.find((e) => e.key === key);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run --project unit src/lib/app-settings-registry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/app-settings-registry.ts src/lib/app-settings-registry.test.ts
git commit -m "feat(config): typed AppSetting registry (feature/booster/rate_limit/ai)"
```

---

### Task 3: Read layer (`getSetting` + cache)

**Files:**
- Create: `src/lib/app-settings.ts`
- Test: `src/lib/app-settings.test.ts`

**Interfaces:**
- Produces: `getSetting<T>(key, fallback): Promise<T>`, `getSettingSync<T>(key, fallback): T`, `invalidateSettingCache(key?): void`.
- Consumes: `prisma.appSetting` (Task 1), `findConfigEntry` (Task 2).

- [ ] **Step 1: Write the failing test**

`src/lib/app-settings.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { invalidateSettingCache, getSettingSync } from "@/lib/config/app-settings";

// getSetting is async + hits prisma; mock the client.
vi.mock("@/lib/prisma", () => {
  const store = new Map<string, unknown>();
  return {
    prisma: {
      appSetting: {
        findUnique: vi.fn(async ({ where }: { where: { key: string } }) =>
          store.has(where.key) ? { value: store.get(where.key) } : null,
        ),
        upsert: vi.fn(async (args: { where: { key: string }; create: { value: unknown } }) => {
          store.set(args.where.key, args.create.value);
          return { value: args.create.value };
        }),
        delete: vi.fn(async ({ where }: { where: { key: string } }) => {
          store.delete(where.key);
          return null;
        }),
      },
    },
  };
});

describe("getSetting", () => {
  beforeEach(() => {
    invalidateSettingCache();
    delete process.env.FEATURE_DUMMY;
    delete process.env.WAITLIST_ENABLED;
  });

  it("returns the DB row value when present and valid", async () => {
    const { prisma } = await import("@/lib/prisma");
    await prisma.appSetting.upsert({
      where: { key: "feature.waitlist_enabled" },
      create: { key: "feature.waitlist_enabled", category: "feature_flag", value: false },
      update: { value: false },
    });
    const { getSetting } = await import("@/lib/config/app-settings");
    invalidateSettingCache();
    const v = await getSetting<boolean>("feature.waitlist_enabled", true);
    expect(v).toBe(false);
  });

  it("falls back to env when no DB row", async () => {
    process.env.WAITLIST_ENABLED = "false";
    const { getSetting } = await import("@/lib/config/app-settings");
    invalidateSettingCache();
    const v = await getSetting<boolean>("feature.waitlist_enabled", true);
    expect(v).toBe(false);
  });

  it("falls back to hardcoded default when no DB row and no env", async () => {
    const { getSetting } = await import("@/lib/config/app-settings");
    invalidateSettingCache();
    const v = await getSetting<boolean>("feature.waitlist_enabled", true);
    expect(v).toBe(true);
  });

  it("falls back gracefully when DB row has wrong type", async () => {
    const { prisma } = await import("@/lib/prisma");
    await prisma.appSetting.upsert({
      where: { key: "feature.waitlist_enabled" },
      create: { key: "feature.waitlist_enabled", category: "feature_flag", value: "not-a-bool" },
      update: { value: "not-a-bool" },
    });
    const { getSetting } = await import("@/lib/config/app-settings");
    invalidateSettingCache();
    const v = await getSetting<boolean>("feature.waitlist_enabled", true);
    expect(v).toBe(true);
  });
});

describe("getSettingSync", () => {
  it("returns fallback when cache cold", () => {
    invalidateSettingCache();
    expect(getSettingSync("feature.waitlist_enabled", true)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run --project unit src/lib/app-settings.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the read layer**

`src/lib/app-settings.ts`:

```ts
import { prisma } from "@/lib/prisma";

import { findConfigEntry, type SettingType } from "./app-settings-registry";

type CacheEntry = { value: unknown; expiresAt: number };
const TTL_MS = 5_000;
const cache = new Map<string, CacheEntry>();

export function invalidateSettingCache(key?: string): void {
  if (key) {
    cache.delete(key);
    return;
  }
  cache.clear();
}

function envKeyFor(settingKey: string): string | null {
  // feature.waitlist_enabled → WAITLIST_ENABLED (special case: env predates DB config)
  if (settingKey === "feature.waitlist_enabled") return "WAITLIST_ENABLED";
  if (settingKey === "feature.generated_build_execution")
    return "GENERATED_BUILD_EXECUTION_ENABLED";
  if (settingKey === "feature.generated_public_execution")
    return "GENERATED_PUBLIC_EXECUTION_ENABLED";
  // ratelimit.global_ip.requests → RATE_LIMIT_GLOBAL_IP_REQUESTS
  if (settingKey.startsWith("ratelimit.")) {
    return settingKey
      .replace("ratelimit.", "RATE_LIMIT_")
      .replace(".", "_")
      .toUpperCase();
  }
  // booster.* and ai.* have no env equivalent (hardcoded only)
  return null;
}

function parseEnvValue(
  raw: string,
  type: SettingType,
): boolean | number | string | null {
  if (type === "boolean") {
    const lower = raw.trim().toLowerCase();
    if (lower === "true") return true;
    if (lower === "false") return false;
    return null; // invalid → fall through
  }
  if (type === "number") {
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    return n;
  }
  return raw;
}

function coerce(
  value: unknown,
  type: SettingType,
): boolean | number | string | null {
  if (type === "boolean") {
    return typeof value === "boolean" ? value : null;
  }
  if (type === "number") {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }
  return typeof value === "string" ? value : null;
}

export async function getSetting<T extends boolean | number | string>(
  key: string,
  fallback: T,
): Promise<T> {
  const entry = findConfigEntry(key);
  const type = entry?.type ?? typeof fallback;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return (coerce(cached.value, type as SettingType) as T) ?? fallback;
  }
  // DB-first
  try {
    const row = await prisma.appSetting.findUnique({
      where: { key },
      select: { value: true },
    });
    if (row) {
      const dbValue = coerce(row.value, type as SettingType);
      if (dbValue !== null) {
        cache.set(key, { value: dbValue, expiresAt: Date.now() + TTL_MS });
        return dbValue as T;
      }
    }
  } catch {
    // DB error → degrade to env/fallback. Never let a config read crash the app.
  }
  // env fallback
  const envName = envKeyFor(key);
  if (envName) {
    const raw = process.env[envName];
    if (raw) {
      const parsed = parseEnvValue(raw, type as SettingType);
      if (parsed !== null) {
        cache.set(key, { value: parsed, expiresAt: Date.now() + TTL_MS });
        return parsed as T;
      }
    }
  }
  return fallback;
}

// Cache-only read for sync call-sites (module scope, capability checks that
// can't await). Returns fallback when cache cold — DB overrides apply within
// TTL of the next async read. ponytail: ceiling = sync call-sites read stale
// until primed; upgrade path = prime the cache at server boot.
export function getSettingSync<T extends boolean | number | string>(
  key: string,
  fallback: T,
): T {
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    const entry = findConfigEntry(key);
    const type = entry?.type ?? typeof fallback;
    return (coerce(cached.value, type as SettingType) as T) ?? fallback;
  }
  return fallback;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run --project unit src/lib/app-settings.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/app-settings.ts src/lib/app-settings.test.ts
git commit -m "feat(config): getSetting read layer — DB-first, env-fallback, 5s cache"
```

---

### Task 4: Migrate waitlist-enabled to DB-config

**Files:**
- Modify: `src/lib/waitlist-enabled.ts`
- Modify: `src/lib/waitlist-enabled.test.ts`
- Modify: `src/routes/api.user.waitlist.ts:52`

**Interfaces:**
- Produces: `isWaitlistEnabled(): Promise<boolean>` (async now).
- Consumes: `getSetting` (Task 3).

- [ ] **Step 1: Update the test for async**

`src/lib/waitlist-enabled.test.ts` — replace the body with:

```ts
import { afterEach, describe, expect, it } from "vitest";

import { invalidateSettingCache } from "@/lib/config/app-settings";
import { isWaitlistEnabled } from "@/lib/waitlist/waitlist-enabled";

// Mock prisma so getSetting's DB read returns nothing → env/fallback path.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    appSetting: {
      findUnique: vi.fn(async () => null),
    },
  },
}));

import { vi } from "vitest";

describe("isWaitlistEnabled", () => {
  const original = process.env.WAITLIST_ENABLED;
  afterEach(() => {
    if (original === undefined) {
      delete process.env.WAITLIST_ENABLED;
    } else {
      process.env.WAITLIST_ENABLED = original;
    }
    invalidateSettingCache();
  });

  it("returns true when set to 'true'", async () => {
    process.env.WAITLIST_ENABLED = "true";
    expect(await isWaitlistEnabled()).toBe(true);
  });

  it("returns false only when set to 'false' (case-insensitive)", async () => {
    process.env.WAITLIST_ENABLED = "false";
    expect(await isWaitlistEnabled()).toBe(false);
    process.env.WAITLIST_ENABLED = "FALSE";
    expect(await isWaitlistEnabled()).toBe(false);
  });

  it("defaults true (fail-safe) when unset or invalid", async () => {
    delete process.env.WAITLIST_ENABLED;
    expect(await isWaitlistEnabled()).toBe(true);
    process.env.WAITLIST_ENABLED = "";
    expect(await isWaitlistEnabled()).toBe(true);
    process.env.WAITLIST_ENABLED = "nope";
    expect(await isWaitlistEnabled()).toBe(true);
  });
});
```

Move the `vi` import to the top of the file (before the `vi.mock` call). Final imports:
```ts
import { afterEach, describe, expect, it, vi } from "vitest";
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run --project unit src/lib/waitlist-enabled.test.ts`
Expected: FAIL — `isWaitlistEnabled` returns a Promise, not boolean.

- [ ] **Step 3: Make isWaitlistEnabled async**

`src/lib/waitlist-enabled.ts`:

```ts
import { getSetting } from "@/lib/config/app-settings";

// Waitlist onboarding gate. false = pass-through (signed-in users skip the
// gate). Unset/invalid defaults true (fail-safe: over-gate rather than
// accidentally let everyone through). DB-overridable via AppSetting; falls
// back to WAITLIST_ENABLED env then hardcoded true.
export async function isWaitlistEnabled(): Promise<boolean> {
  const value = await getSetting<boolean>("feature.waitlist_enabled", true);
  // Fail-safe: any non-false value is treated as true (matches old env semantics).
  return value !== false;
}
```

- [ ] **Step 4: Update the call-site to await**

`src/routes/api.user.waitlist.ts:52` — change:
```ts
const waitlistEnabled = isWaitlistEnabled();
```
to:
```ts
const waitlistEnabled = await isWaitlistEnabled();
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bunx vitest run --project unit src/lib/waitlist-enabled.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the fast gate**

Run: `bun run check`
Expected: PASS (format/lint/typecheck/changed-tests/Knip).

- [ ] **Step 7: Commit**

```bash
git add src/lib/waitlist-enabled.ts src/lib/waitlist-enabled.test.ts src/routes/api.user.waitlist.ts
git commit -m "feat(config): waitlist gate reads AppSetting (DB-first, env-fallback)"
```

---

### Task 5: Migrate rate-limit config to DB-config

**Files:**
- Modify: `src/lib/rate-limit.ts` (`getRateLimitConfig` → async)
- Modify: `src/lib/rate-limit.test.ts` (only if `getRateLimitConfig` is called synchronously in tests — check first)

**Interfaces:**
- Produces: `getRateLimitConfig(type, subject): Promise<RateLimitConfig>`.
- Consumes: `getSetting` (Task 3).

- [ ] **Step 1: Check call-sites of getRateLimitConfig**

Run: `grep -rn "getRateLimitConfig" src/ --include="*.ts" | grep -v ".test.ts"`
Expected: only `src/lib/rate-limit.ts` (internal, called by `checkRateLimit` which is already async).

- [ ] **Step 2: Make getRateLimitConfig async**

In `src/lib/rate-limit.ts`, replace `getRateLimitConfig` (lines ~94-107) with:

```ts
export async function getRateLimitConfig(
  type: RateLimitType,
  subject: RateLimitSubject,
): Promise<RateLimitConfig> {
  const fallback = defaults[type][subject];
  const names = envNames[type][subject];
  const { getSetting } = await import("@/lib/config/app-settings");
  const limit = await getSetting<number>(
    `ratelimit.${type === "global" ? "global_ip" : `${type}_${subject}`}.requests`,
    fallback.limit,
  );
  const windowSeconds = await getSetting<number>(
    `ratelimit.${type === "global" ? "global_ip" : `${type}_${subject}`}.window_seconds`,
    fallback.windowMs / 1000,
  );
  return { limit, windowMs: windowSeconds * 1000 };
}
```

Note: the registry keys use `global_ip` (global has only ip subject in the registry for simplicity; user subject falls back to the ip value). Update `checkRateLimit` to `await` the config: change `const config = getRateLimitConfig(...)` to `const config = await getRateLimitConfig(type, subject)`.

- [ ] **Step 3: Run the fast gate**

Run: `bun run check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/rate-limit.ts
git commit -m "feat(config): rate-limit reads AppSetting (DB-first, env-fallback)"
```

---

### Task 6: Migrate capability flags to DB-config (sync, cache-only)

**Files:**
- Modify: `src/lib/config.ts` (`isGeneratedBuildExecutionEnabled`, `isGeneratedPublicExecutionEnabled`)
- Modify: `src/lib/config.test.ts` (if it exists — check)

**Interfaces:**
- Produces: same sync signatures, now read `getSettingSync` (cache-only; falls to env when cold).

- [ ] **Step 1: Check for config.test.ts**

Run: `ls src/lib/config.test.ts 2>/dev/null && echo exists || echo none`

- [ ] **Step 2: Update the capability functions**

In `src/lib/config.ts`, replace `getCapabilityFlag` body and the two callers. The functions stay sync; they read `getSettingSync`:

```ts
import { getSettingSync } from "@/lib/config/app-settings";

export function isGeneratedBuildExecutionEnabled() {
  return getCapabilityFlag("feature.generated_build_execution");
}

export function isGeneratedPublicExecutionEnabled() {
  return getCapabilityFlag("feature.generated_public_execution");
}

function getCapabilityFlag(key: string) {
  const dbValue = getSettingSync<boolean | undefined>(key, undefined);
  if (typeof dbValue === "boolean") {
    return dbValue;
  }
  // env-fallback semantics (preserves old behavior): unset → dev-true/prod-false.
  const envName =
    key === "feature.generated_build_execution"
      ? "GENERATED_BUILD_EXECUTION_ENABLED"
      : "GENERATED_PUBLIC_EXECUTION_ENABLED";
  const raw = getEnv(envName).trim().toLowerCase();
  if (!raw) {
    return process.env.NODE_ENV !== "production";
  }
  if (raw === "true") return true;
  if (raw === "false") return false;
  throw new Error(`${envName} must be true or false.`);
}
```

Note: `getCapabilityFlag` no longer takes a generic name; it's keyed by the setting key. Update the two `isGenerated*` callers to pass the setting key (already done above).

- [ ] **Step 3: Run the fast gate**

Run: `bun run check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/config.ts
git commit -m "feat(config): capability flags read AppSetting cache (sync, env-fallback)"
```

---

### Task 7: Booster pack DB-override resolver

**Files:**
- Modify: `src/lib/pakasir.ts` (add `getBoosterPack`)
- Modify: `src/routes/api.payment.create.ts` (use resolver)

**Interfaces:**
- Produces: `getBoosterPack(id: BoosterPackId): Promise<{amount, energy, name}>`.
- Consumes: `getSetting` (Task 3), `BOOSTER_PACKS` const (fallback).

- [ ] **Step 1: Add the resolver to pakasir.ts**

Append to `src/lib/pakasir.ts` (after `BOOSTER_PACKS`):

```ts
import { getSetting } from "@/lib/config/app-settings";

// Resolves a booster pack's amount/energy from AppSetting (DB-first),
// falling back to the hardcoded BOOSTER_PACKS const. Used at payment-creation
// (server, async). The client EnergyBoosterModal still reads the const for
// display — DB overrides apply only at actual transaction creation.
export async function getBoosterPack(id: BoosterPackId) {
  const fallback = BOOSTER_PACKS[id];
  const [amount, energy] = await Promise.all([
    getSetting<number>(`booster.${id}.amount`, fallback.amount),
    getSetting<number>(`booster.${id}.energy`, fallback.energy),
  ]);
  return { amount, energy, name: fallback.name };
}
```

- [ ] **Step 2: Use the resolver in api.payment.create.ts**

In `src/routes/api.payment.create.ts`, replace `const pack = BOOSTER_PACKS[packageId];` (line ~34) with:

```ts
const fallbackPack = BOOSTER_PACKS[packageId];
if (!fallbackPack) {
  return Response.json(
    { message: "Invalid package selection." },
    { status: 400 },
  );
}
const pack = await getBoosterPack(packageId);
```

Update the import line to add `getBoosterPack`:
```ts
import {
  createPakasirTransaction,
  getBoosterPack,
  type PakasirPaymentMethod,
  BOOSTER_PACKS,
  type BoosterPackId,
} from "@/lib/pakasir";
```

- [ ] **Step 3: Run the fast gate**

Run: `bun run check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/pakasir.ts src/routes/api.payment.create.ts
git commit -m "feat(config): booster pack prices/energy DB-overridable at payment time"
```

---

### Task 8: User.bannedAt column + ban enforcement

**Files:**
- Modify: `prisma/schema.prisma` (add `bannedAt` to `User`)
- Create: `prisma/migrations/20260727110000_add_user_banned_at/migration.sql`
- Modify: `src/lib/auth.ts` (`auth()` rejects banned users)
- Test: `src/lib/auth.test.ts` (extend if exists — check first)

**Interfaces:**
- Produces: `User.bannedAt: DateTime?`.
- Consumes: `prisma.user`.

- [ ] **Step 1: Add the column to schema.prisma**

In the `User` model, add after `otpLockedUntil`:
```prisma
  bannedAt      DateTime?
```

- [ ] **Step 2: Create the migration**

`prisma/migrations/20260727110000_add_user_banned_at/migration.sql`:

```sql
-- AlterTable
ALTER TABLE "User" ADD COLUMN "bannedAt" TIMESTAMP(3);
```

- [ ] **Step 3: Generate + migrate**

Run:
```bash
bunx prisma generate
bun run db:migrate
```

- [ ] **Step 4: Add ban enforcement to auth()**

In `src/lib/auth.ts`, after `return data as Session;` (the success path), add a banned check. The session object's `user.id` is available; query the user's `bannedAt`:

Replace:
```ts
  return data as Session;
}
```
with:
```ts
  const session = data as Session;
  if (session.user?.id) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { bannedAt: true },
    });
    if (user?.bannedAt) {
      return null;
    }
  }
  return session;
}
```

Add the import at the top of `src/lib/auth.ts`:
```ts
import { prisma } from "@/lib/prisma";
```

- [ ] **Step 5: Run the fast gate**

Run: `bun run check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260727110000_add_user_banned_at/migration.sql src/lib/auth.ts
git commit -m "feat(admin): User.bannedAt column + auth() ban enforcement"
```

---

### Task 9: Admin tabbed shell

**Files:**
- Modify: `src/routes/_main.admin.tsx` (becomes layout shell)
- Create: `src/components/admin/AdminTabs.tsx`
- Create: `src/routes/_main.admin.index.tsx` (placeholder for now, filled in Task 10)

**Interfaces:**
- Produces: `/admin` layout with `<Outlet/>` + 5 tabs.
- Consumes: `requireAdmin` (existing).

- [ ] **Step 1: Create the AdminTabs component**

`src/components/admin/AdminTabs.tsx`:

```tsx
import { Link, useRouterState } from "@tanstack/react-router";

const TABS = [
  { label: "Ringkasan", to: "/admin" },
  { label: "Pengguna", to: "/admin/users" },
  { label: "Antrean", to: "/admin/waitlist" },
  { label: "Transaksi", to: "/admin/transactions" },
  { label: "Pengaturan", to: "/admin/settings" },
] as const;

export function AdminTabs() {
  const { location } = useRouterState();
  return (
    <nav
      aria-label="Navigasi admin"
      className="sticky top-0 z-10 flex gap-spacing-1 overflow-x-auto border-b border-surface-warm-white/10 bg-surface-warm-white/5 px-spacing-2 py-spacing-2"
    >
      {TABS.map((tab) => {
        const active =
          tab.to === "/admin"
            ? location.pathname === "/admin"
            : location.pathname.startsWith(tab.to);
        return (
          <Link
            active={active}
            className={
              active
                ? "rounded-radius-md bg-surface-warm-white/15 px-spacing-3 py-spacing-2 text-sm font-medium"
                : "rounded-radius-md px-spacing-3 py-spacing-2 text-sm text-surface-warm-white/60"
            }
            key={tab.to}
            to={tab.to}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 2: Rewrite _main.admin.tsx as the shell**

Replace the entire contents of `src/routes/_main.admin.tsx` with:

```tsx
import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { Toaster } from "sonner";

import { AdminTabs } from "@/components/admin/AdminTabs";
import { requireAdmin } from "@/lib/auth/auth-admin";

const loadAdmin = createServerFn({ method: "GET" }).handler(async () => {
  const admin = await requireAdmin();
  if (!admin.ok) {
    throw redirect({ to: "/" });
  }
  return { ok: true };
});

export const Route = createFileRoute("/_main/admin")({
  loader: () => loadAdmin(),
  component: AdminShell,
});

function AdminShell() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col px-spacing-4 pb-24 pt-spacing-4">
      <h1 className="mb-spacing-3 text-2xl font-semibold">Admin</h1>
      <AdminTabs />
      <div className="mt-spacing-4">
        <Outlet />
      </div>
      <Toaster richColors position="top-center" />
    </main>
  );
}
```

- [ ] **Step 3: Create a placeholder index route**

`src/routes/_main.admin.index.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_main/admin/index")({
  component: () => <p className="text-surface-warm-white/60">Memuat…</p>,
});
```

- [ ] **Step 4: Regenerate the route tree + run the fast gate**

Run:
```bash
bunx tsr generate
bun run check
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/_main.admin.tsx src/routes/_main.admin.index.tsx src/components/admin/AdminTabs.tsx src/routeTree.gen.ts
git commit -m "feat(admin): tabbed shell at /admin (5 tabs, sonner toaster)"
```

---

### Task 10: Overview tab (analytics)

**Files:**
- Create: `src/routes/api.admin.overview.ts`
- Modify: `src/routes/_main.admin.index.tsx`

**Interfaces:**
- Produces: `GET /api/admin/overview` → `{ stats, recentWaitlist, recentTransactions }`.
- Consumes: `requireAdmin`, `prisma`.

- [ ] **Step 1: Create the overview API**

`src/routes/api.admin.overview.ts`:

```ts
import { createFileRoute } from "@tanstack/react-router";

import { requireAdmin } from "@/lib/auth/auth-admin";
import { prisma } from "@/lib/prisma";

export const Route = createFileRoute("/api/admin/overview")({
  server: {
    handlers: {
      GET: async () => {
        const admin = await requireAdmin();
        if (!admin.ok) {
          return Response.json(
            { message: admin.message },
            { status: admin.status },
          );
        }

        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

        const [
          users,
          waitlistPending,
          projects,
          paymentsThisMonth,
          revenueAgg,
          recentWaitlist,
          recentTransactions,
        ] = await Promise.all([
          prisma.user.count(),
          prisma.waitlistEntry.count({ where: { status: "pending" } }),
          prisma.project.count(),
          prisma.payment.count({
            where: { status: "COMPLETED", createdAt: { gte: monthStart } },
          }),
          prisma.payment.aggregate({
            _sum: { amount: true },
            where: { status: "COMPLETED", createdAt: { gte: monthStart } },
          }),
          prisma.waitlistEntry.findMany({
            orderBy: { submittedAt: "desc" },
            take: 5,
            where: { status: "pending" },
            select: {
              businessName: true,
              id: true,
              submittedAt: true,
            },
          }),
          prisma.payment.findMany({
            orderBy: { createdAt: "desc" },
            take: 5,
            select: {
              amount: true,
              createdAt: true,
              orderId: true,
              status: true,
            },
          }),
        ]);

        return Response.json({
          recentTransactions,
          recentWaitlist: recentWaitlist.map((e) => ({
            businessName: e.businessName,
            id: e.id,
            submittedAt: e.submittedAt.toISOString(),
          })),
          stats: {
            paymentsThisMonth,
            projects,
            revenueThisMonth: revenueAgg._sum.amount ?? 0,
            users,
            waitlistPending,
          },
        });
      },
    },
  },
});
```

- [ ] **Step 2: Build the Overview UI**

Replace `src/routes/_main.admin.index.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { fetchJson } from "@/lib/query-client";

type Overview = {
  stats: {
    paymentsThisMonth: number;
    projects: number;
    revenueThisMonth: number;
    users: number;
    waitlistPending: number;
  };
  recentWaitlist: { businessName: string; id: string; submittedAt: string }[];
  recentTransactions: {
    amount: number;
    createdAt: string;
    orderId: string;
    status: string;
  }[];
};

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export const Route = createFileRoute("/_main/admin/index")({
  component: OverviewPage,
});

function OverviewPage() {
  const { data } = useQuery({
    queryFn: () => fetchJson<Overview>("/api/admin/overview"),
    queryKey: ["admin", "overview"],
  });

  const stats = data?.stats;
  const tiles = stats
    ? [
        { label: "Pengguna", value: String(stats.users) },
        { label: "Antrean menunggu", value: String(stats.waitlistPending) },
        { label: "Proyek", value: String(stats.projects) },
        { label: "Pembayaran bulan ini", value: String(stats.paymentsThisMonth) },
        {
          label: "Pendapatan bulan ini",
          value: formatRupiah(stats.revenueThisMonth),
        },
      ]
    : [];

  return (
    <div className="flex flex-col gap-spacing-4">
      <div className="grid grid-cols-2 gap-spacing-3 sm:grid-cols-3">
        {tiles.map((tile) => (
          <div
            className="rounded-radius-lg border border-surface-warm-white/10 bg-surface-warm-white/5 p-spacing-4"
            key={tile.label}
          >
            <p className="text-sm text-surface-warm-white/60">{tile.label}</p>
            <p className="mt-spacing-1 text-xl font-semibold">{tile.value}</p>
          </div>
        ))}
      </div>
      <section>
        <h2 className="mb-spacing-2 text-lg font-semibold">Pendaftar terbaru</h2>
        {data?.recentWaitlist.length ? (
          <ul className="flex flex-col gap-spacing-2">
            {data.recentWaitlist.map((e) => (
              <li
                className="rounded-radius-md border border-surface-warm-white/10 bg-surface-warm-white/5 p-spacing-3 text-sm"
                key={e.id}
              >
                <span className="font-medium">{e.businessName}</span>
                <span className="text-surface-warm-white/50">
                  {" · "}
                  {new Date(e.submittedAt).toLocaleDateString("id-ID")}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-surface-warm-white/60">
            Belum ada pendaftar menunggu.
          </p>
        )}
      </section>
      <section>
        <h2 className="mb-spacing-2 text-lg font-semibold">Transaksi terbaru</h2>
        {data?.recentTransactions.length ? (
          <ul className="flex flex-col gap-spacing-2">
            {data.recentTransactions.map((t) => (
              <li
                className="flex items-center justify-between rounded-radius-md border border-surface-warm-white/10 bg-surface-warm-white/5 p-spacing-3 text-sm"
                key={t.orderId}
              >
                <span className="font-mono">{t.orderId}</span>
                <span className="text-surface-warm-white/80">
                  {formatRupiah(t.amount)} · {t.status}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-surface-warm-white/60">
            Belum ada transaksi.
          </p>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Regenerate routes + run the fast gate**

Run:
```bash
bunx tsr generate
bun run check
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/routes/api.admin.overview.ts src/routes/_main.admin.index.tsx src/routeTree.gen.ts
git commit -m "feat(admin): overview tab — 5 stat tiles + recent waitlist/transactions"
```

---

### Task 11: Waitlist tab (relocate existing UI)

**Files:**
- Create: `src/routes/_main.admin.waitlist.tsx` (move queue UI from old `_main.admin.tsx`)

**Interfaces:**
- Produces: `/admin/waitlist` with the existing approve/decline queue, now using sonner toasts.

- [ ] **Step 1: Create the waitlist tab route**

`src/routes/_main.admin.waitlist.tsx` — port the old `_main.admin.tsx` `AdminPage` body, swap `window.alert`/`window.prompt` for sonner:

```tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { requireAdmin } from "@/lib/auth/auth-admin";
import { fetchJson } from "@/lib/query-client";
import { listPendingWaitlist } from "@/lib/waitlist/waitlist";

type PendingEntry = {
  businessName: string;
  businessType: string | null;
  id: string;
  imageRef: string | null;
  phone: string | null;
  status: string;
  story: string;
  submittedAt: string;
};

const loadAdminWaitlist = createServerFn({ method: "GET" }).handler(
  async () => {
    const admin = await requireAdmin();
    if (!admin.ok) {
      throw redirect({ to: "/" });
    }
    const entries = await listPendingWaitlist();
    return {
      entries: entries.map((entry) => ({
        businessName: entry.businessName,
        businessType: entry.businessType,
        id: entry.id,
        imageRef: entry.imageRef,
        phone: entry.phone,
        status: entry.status,
        story: entry.story,
        submittedAt: entry.submittedAt.toISOString(),
      })),
    };
  },
);

export const Route = createFileRoute("/_main/admin/waitlist")({
  loader: () => loadAdminWaitlist(),
  component: WaitlistPage,
});

function WaitlistPage() {
  const queryClient = useQueryClient();
  const initial = Route.useLoaderData() as unknown as {
    entries: PendingEntry[];
  };
  const { data } = useQuery({
    queryFn: () =>
      fetchJson<{ entries: PendingEntry[] }>("/api/admin/waitlist"),
    queryKey: ["admin", "waitlist"],
    initialData: { entries: initial.entries },
  });

  const act = useMutation({
    mutationFn: async (vars: {
      action: "approve" | "reject";
      entryId: string;
      reason?: string;
    }) =>
      fetchJson("/api/admin/waitlist", {
        body: JSON.stringify(vars),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "waitlist"] });
      toast.success(vars.action === "approve" ? "Disetujui." : "Ditolak.");
    },
    onError: () => toast.error("Gagal memproses. Coba lagi."),
  });

  const entries = data?.entries ?? [];

  return (
    <div className="flex flex-col gap-spacing-3">
      {entries.length === 0 ? (
        <p className="text-surface-warm-white/60">
          Belum ada pendaftar menunggu.
        </p>
      ) : (
        entries.map((entry) => (
          <div
            className="rounded-radius-lg border border-surface-warm-white/10 bg-surface-warm-white/5 p-spacing-4"
            key={entry.id}
          >
            <div className="flex items-start justify-between gap-spacing-3">
              <div>
                <p className="font-medium">{entry.businessName}</p>
                {entry.businessType ? (
                  <p className="text-sm text-surface-warm-white/60">
                    {entry.businessType}
                  </p>
                ) : null}
                {entry.phone ? (
                  <p className="text-sm text-surface-warm-white/60">
                    {entry.phone}
                  </p>
                ) : null}
              </div>
            </div>
            <p className="mt-spacing-2 line-clamp-4 text-sm text-surface-warm-white/80">
              {entry.story}
            </p>
            {entry.imageRef ? (
              <img
                alt={entry.businessName}
                className="mt-spacing-2 max-h-48 rounded-radius-md border border-surface-warm-white/10"
                src={`/api/admin/waitlist/image/${entry.id}`}
              />
            ) : null}
            <div className="mt-spacing-3 flex gap-spacing-2">
              <button
                className="rounded-radius-md bg-emerald-600 px-spacing-3 py-spacing-2 text-sm text-white"
                onClick={() => act.mutate({ action: "approve", entryId: entry.id })}
                type="button"
              >
                Setujui
              </button>
              <button
                className="rounded-radius-md border border-surface-warm-white/15 px-spacing-3 py-spacing-2 text-sm"
                onClick={() => {
                  const reason = window.prompt("Alasan penolakan (opsional)?") ?? "";
                  act.mutate({ action: "reject", entryId: entry.id, reason });
                }}
                type="button"
              >
                Tolak
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
```

Add `redirect` to the TanStack router import (the loader uses it).

- [ ] **Step 2: Regenerate routes + run the fast gate**

Run:
```bash
bunx tsr generate
bun run check
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/routes/_main.admin.waitlist.tsx src/routeTree.gen.ts
git commit -m "feat(admin): waitlist tab (relocated queue UI, sonner toasts)"
```

---

### Task 12: Users tab (list + ban/unban)

**Files:**
- Create: `src/routes/api.admin.users.ts`
- Create: `src/routes/api.admin.users.$id.ts`
- Create: `src/routes/_main.admin.users.tsx`

**Interfaces:**
- Produces: `GET /api/admin/users?q=&page=`, `POST /api/admin/users/:id/ban`, `POST /api/admin/users/:id/unban`.
- Consumes: `requireAdmin`, `prisma`.

- [ ] **Step 1: Create the users list API**

`src/routes/api.admin.users.ts`:

```ts
import { createFileRoute } from "@tanstack/react-router";

import { requireAdmin } from "@/lib/auth/auth-admin";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 20;

export const Route = createFileRoute("/api/admin/users")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const admin = await requireAdmin();
        if (!admin.ok) {
          return Response.json(
            { message: admin.message },
            { status: admin.status },
          );
        }
        const url = new URL(request.url);
        const q = url.searchParams.get("q")?.trim() ?? "";
        const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
        const where = q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" as const } },
                { email: { contains: q, mode: "insensitive" as const } },
              ],
            }
          : {};
        const [users, total] = await Promise.all([
          prisma.user.findMany({
            orderBy: { createdAt: "desc" },
            take: PAGE_SIZE,
            skip: (page - 1) * PAGE_SIZE,
            where,
            select: {
              bannedAt: true,
              createdAt: true,
              email: true,
              id: true,
              name: true,
              phone: true,
              verifiedAt: true,
              _count: { select: { projects: true } },
            },
          }),
          prisma.user.count({ where }),
        ]);
        return Response.json({
          users: users.map((u) => ({
            bannedAt: u.bannedAt?.toISOString() ?? null,
            createdAt: u.createdAt.toISOString(),
            email: u.email,
            id: u.id,
            name: u.name,
            phone: u.phone,
            projectsCount: u._count.projects,
            verified: Boolean(u.verifiedAt),
          })),
          page,
          total,
          totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
        });
      },
    },
  },
});
```

- [ ] **Step 2: Create the ban/unban API**

`src/routes/api.admin.users.$id.ts`:

```ts
import { createFileRoute } from "@tanstack/react-router";

import { requireAdmin } from "@/lib/auth/auth-admin";
import { prisma } from "@/lib/prisma";

export const Route = createFileRoute("/api/admin/users/$id")({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        const admin = await requireAdmin();
        if (!admin.ok) {
          return Response.json(
            { message: admin.message },
            { status: admin.status },
          );
        }
        const action = new URL(request.url).searchParams.get("action");
        const id = params.id;
        if (action === "ban") {
          await prisma.user.update({
            where: { id },
            data: { bannedAt: new Date() },
          });
          return Response.json({ status: "banned" });
        }
        if (action === "unban") {
          await prisma.user.update({
            where: { id },
            data: { bannedAt: null },
          });
          return Response.json({ status: "unbanned" });
        }
        return Response.json(
          { message: "action harus ban atau unban." },
          { status: 400 },
        );
      },
    },
  },
});
```

- [ ] **Step 3: Build the Users UI**

`src/routes/_main.admin.users.tsx`:

```tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { useState } from "react";

import { fetchJson } from "@/lib/query-client";

type AdminUser = {
  bannedAt: string | null;
  createdAt: string;
  email: string | null;
  id: string;
  name: string | null;
  phone: string | null;
  projectsCount: number;
  verified: boolean;
};

type UsersResponse = {
  page: number;
  total: number;
  totalPages: number;
  users: AdminUser[];
};

export const Route = createFileRoute("/_main/admin/users")({
  component: UsersPage,
});

function UsersPage() {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryFn: () =>
      fetchJson<UsersResponse>(
        `/api/admin/users?q=${encodeURIComponent(q)}&page=${page}`,
      ),
    queryKey: ["admin", "users", q, page],
  });

  const ban = useMutation({
    mutationFn: (vars: { action: "ban" | "unban"; id: string }) =>
      fetchJson(`/api/admin/users/${vars.id}?action=${vars.action}`, {
        method: "POST",
      }),
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      toast.success(vars.action === "ban" ? "Pengguna diblokir." : "Blokir dibatalkan.");
    },
    onError: () => toast.error("Gagal. Coba lagi."),
  });

  const users = data?.users ?? [];
  return (
    <div className="flex flex-col gap-spacing-3">
      <input
        className="rounded-radius-md border border-surface-warm-white/15 bg-surface-warm-white/5 px-spacing-3 py-spacing-2 text-sm"
        onChange={(e) => {
          setQ(e.target.value);
          setPage(1);
        }}
        placeholder="Cari nama atau email…"
        value={q}
      />
      {users.length === 0 ? (
        <p className="text-surface-warm-white/60">Tidak ada pengguna.</p>
      ) : (
        users.map((u) => (
          <div
            className="flex items-center justify-between rounded-radius-md border border-surface-warm-white/10 bg-surface-warm-white/5 p-spacing-3 text-sm"
            key={u.id}
          >
            <div>
              <p className="font-medium">{u.name ?? "Tanpa nama"}</p>
              <p className="text-surface-warm-white/60">{u.email}</p>
              <p className="text-surface-warm-white/40">
                {u.projectsCount} proyek · {u.verified ? "Terverifikasi" : "Belum verifikasi"}
                {u.bannedAt ? " · Diblokir" : ""}
              </p>
            </div>
            <button
              className="rounded-radius-md border border-surface-warm-white/15 px-spacing-3 py-spacing-2 text-sm"
              onClick={() =>
                ban.mutate({
                  action: u.bannedAt ? "unban" : "ban",
                  id: u.id,
                })
              }
              type="button"
            >
              {u.bannedAt ? "Buka blokir" : "Blokir"}
            </button>
          </div>
        ))
      )}
      {data && data.totalPages > 1 ? (
        <div className="flex gap-spacing-2">
          <button
            className="rounded-radius-md border border-surface-warm-white/15 px-spacing-3 py-spacing-2 text-sm disabled:opacity-40"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            type="button"
          >
            Sebelumnya
          </button>
          <span className="px-spacing-2 py-spacing-2 text-sm text-surface-warm-white/60">
            {page} / {data.totalPages}
          </span>
          <button
            className="rounded-radius-md border border-surface-warm-white/15 px-spacing-3 py-spacing-2 text-sm disabled:opacity-40"
            disabled={page >= data.totalPages}
            onClick={() => setPage((p) => p + 1)}
            type="button"
          >
            Berikutnya
          </button>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Regenerate routes + run the fast gate**

Run:
```bash
bunx tsr generate
bun run check
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/api.admin.users.ts src/routes/api.admin.users.\$id.ts src/routes/_main.admin.users.tsx src/routeTree.gen.ts
git commit -m "feat(admin): users tab — list/search + ban/unban"
```

---

### Task 13: Transactions tab (list + verify)

**Files:**
- Create: `src/routes/api.admin.transactions.ts`
- Create: `src/routes/api.admin.transactions.$orderId.verify.ts`
- Create: `src/routes/_main.admin.transactions.tsx`

**Interfaces:**
- Produces: `GET /api/admin/transactions?status=&range=&q=&page=`, `POST /api/admin/transactions/:orderId/verify`.
- Consumes: `requireAdmin`, `prisma`, `verifyPakasirTransaction`.

- [ ] **Step 1: Create the transactions list API**

`src/routes/api.admin.transactions.ts`:

```ts
import { createFileRoute } from "@tanstack/react-router";

import { requireAdmin } from "@/lib/auth/auth-admin";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 20;

export const Route = createFileRoute("/api/admin/transactions")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const admin = await requireAdmin();
        if (!admin.ok) {
          return Response.json(
            { message: admin.message },
            { status: admin.status },
          );
        }
        const url = new URL(request.url);
        const status = url.searchParams.get("status") ?? "ALL";
        const q = url.searchParams.get("q")?.trim() ?? "";
        const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
        const where: { status?: string; OR?: unknown[] } = {};
        if (status !== "ALL") where.status = status;
        if (q) {
          where.OR = [
            { orderId: { contains: q, mode: "insensitive" as const } },
            { user: { email: { contains: q, mode: "insensitive" as const } } },
          ];
        }
        const [payments, total] = await Promise.all([
          prisma.payment.findMany({
            orderBy: { createdAt: "desc" },
            take: PAGE_SIZE,
            skip: (page - 1) * PAGE_SIZE,
            where,
            select: {
              amount: true,
              createdAt: true,
              energyGranted: true,
              orderId: true,
              paymentMethod: true,
              paymentNumber: true,
              status: true,
              updatedAt: true,
              user: { select: { email: true } },
            },
          }),
          prisma.payment.count({ where }),
        ]);
        return Response.json({
          payments: payments.map((p) => ({
            amount: p.amount,
            createdAt: p.createdAt.toISOString(),
            email: p.user.email,
            energyGranted: p.energyGranted,
            orderId: p.orderId,
            paymentMethod: p.paymentMethod,
            paymentNumber: p.paymentNumber,
            status: p.status,
            updatedAt: p.updatedAt.toISOString(),
          })),
          page,
          total,
          totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
        });
      },
    },
  },
});
```

- [ ] **Step 2: Create the verify API**

`src/routes/api.admin.transactions.$orderId.verify.ts`:

```ts
import { createFileRoute } from "@tanstack/react-router";

import { requireAdmin } from "@/lib/auth/auth-admin";
import { prisma } from "@/lib/prisma";
import { verifyPakasirTransaction } from "@/lib/pakasir";

export const Route = createFileRoute("/api/admin/transactions/$orderId/verify")({
  server: {
    handlers: {
      POST: async ({ params }) => {
        const admin = await requireAdmin();
        if (!admin.ok) {
          return Response.json(
            { message: admin.message },
            { status: admin.status },
          );
        }
        const payment = await prisma.payment.findUnique({
          where: { orderId: params.orderId },
          select: { amount: true, status: true },
        });
        if (!payment) {
          return Response.json(
            { message: "Transaksi tidak ditemukan." },
            { status: 404 },
          );
        }
        if (payment.status !== "PENDING") {
          return Response.json({
            status: payment.status,
            message: "Hanya transaksi pending yang bisa diverifikasi.",
          });
        }
        try {
          const detail = await verifyPakasirTransaction({
            orderId: params.orderId,
            amount: payment.amount,
          });
          const newStatus = detail.status.toUpperCase();
          await prisma.payment.update({
            where: { orderId: params.orderId },
            data: { status: newStatus },
          });
          return Response.json({ status: newStatus });
        } catch {
          return Response.json(
            { message: "Gagal verifikasi via Pakasir." },
            { status: 502 },
          );
        }
      },
    },
  },
});
```

- [ ] **Step 3: Build the Transactions UI**

`src/routes/_main.admin.transactions.tsx`:

```tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { useState } from "react";

import { fetchJson } from "@/lib/query-client";

type Tx = {
  amount: number;
  createdAt: string;
  email: string | null;
  energyGranted: number;
  orderId: string;
  paymentMethod: string | null;
  paymentNumber: string | null;
  status: string;
  updatedAt: string;
};
type TxResponse = {
  page: number;
  total: number;
  totalPages: number;
  payments: Tx[];
};

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export const Route = createFileRoute("/_main/admin/transactions")({
  component: TransactionsPage,
});

function TransactionsPage() {
  const [status, setStatus] = useState("ALL");
  const [q, setQ] = useState("");
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryFn: () =>
      fetchJson<TxResponse>(
        `/api/admin/transactions?status=${status}&q=${encodeURIComponent(q)}`,
      ),
    queryKey: ["admin", "transactions", status, q],
  });

  const verify = useMutation({
    mutationFn: (orderId: string) =>
      fetchJson(`/api/admin/transactions/${orderId}/verify`, {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "transactions"] });
      toast.success("Status disinkronkan.");
    },
    onError: () => toast.error("Gagal verifikasi."),
  });

  const txs = data?.payments ?? [];
  return (
    <div className="flex flex-col gap-spacing-3">
      <div className="flex gap-spacing-2">
        {["ALL", "PENDING", "COMPLETED", "FAILED"].map((s) => (
          <button
            className={
              status === s
                ? "rounded-radius-md bg-surface-warm-white/15 px-spacing-3 py-spacing-2 text-sm"
                : "rounded-radius-md border border-surface-warm-white/15 px-spacing-3 py-spacing-2 text-sm"
            }
            key={s}
            onClick={() => setStatus(s)}
            type="button"
          >
            {s === "ALL" ? "Semua" : s}
          </button>
        ))}
      </div>
      <input
        className="rounded-radius-md border border-surface-warm-white/15 bg-surface-warm-white/5 px-spacing-3 py-spacing-2 text-sm"
        onChange={(e) => setQ(e.target.value)}
        placeholder="Cari order id atau email…"
        value={q}
      />
      {txs.length === 0 ? (
        <p className="text-surface-warm-white/60">Tidak ada transaksi.</p>
      ) : (
        txs.map((t) => (
          <div
            className="rounded-radius-md border border-surface-warm-white/10 bg-surface-warm-white/5 p-spacing-3 text-sm"
            key={t.orderId}
          >
            <div className="flex items-center justify-between">
              <span className="font-mono">{t.orderId}</span>
              <span
                className={
                  t.status === "COMPLETED"
                    ? "text-emerald-400"
                    : t.status === "PENDING"
                      ? "text-amber-400"
                      : "text-red-400"
                }
              >
                {t.status}
              </span>
            </div>
            <p className="text-surface-warm-white/60">
              {formatRupiah(t.amount)} · {t.energyGranted} energi · {t.email ?? "—"}
            </p>
            {t.paymentNumber ? (
              <p className="text-surface-warm-white/40">{t.paymentNumber}</p>
            ) : null}
            {t.status === "PENDING" ? (
              <button
                className="mt-spacing-2 rounded-radius-md border border-surface-warm-white/15 px-spacing-3 py-spacing-2 text-sm"
                onClick={() => verify.mutate(t.orderId)}
                type="button"
              >
                Verifikasi
              </button>
            ) : null}
          </div>
        ))
      )}
    </div>
  );
}
```

- [ ] **Step 4: Regenerate routes + run the fast gate**

Run:
```bash
bunx tsr generate
bun run check
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/api.admin.transactions.ts src/routes/api.admin.transactions.\$orderId.verify.ts src/routes/_main.admin.transactions.tsx src/routeTree.gen.ts
git commit -m "feat(admin): transactions tab — list/filter + Pakasir verify"
```

---

### Task 14: Settings tab (DB-config editor)

**Files:**
- Create: `src/routes/api.admin.settings.ts`
- Create: `src/routes/_main.admin.settings.tsx`

**Interfaces:**
- Produces: `GET /api/admin/settings`, `PUT /api/admin/settings`.
- Consumes: `requireAdmin`, `prisma.appSetting`, `APP_SETTINGS`, `invalidateSettingCache`.

- [ ] **Step 1: Create the settings API**

`src/routes/api.admin.settings.ts`:

```ts
import { createFileRoute } from "@tanstack/react-router";

import { requireAdmin } from "@/lib/auth/auth-admin";
import { invalidateSettingCache } from "@/lib/config/app-settings";
import {
  APP_SETTINGS,
  findConfigEntry,
  type SettingCategory,
} from "@/lib/config/app-settings-registry";
import { prisma } from "@/lib/prisma";

export const Route = createFileRoute("/api/admin/settings")({
  server: {
    handlers: {
      GET: async () => {
        const admin = await requireAdmin();
        if (!admin.ok) {
          return Response.json(
            { message: admin.message },
            { status: admin.status },
          );
        }
        const rows = await prisma.appSetting.findMany({
          select: { category: true, key: true, value: true },
        });
        const dbMap = new Map(rows.map((r) => [r.key, r.value]));
        const envValue = (key: string): unknown => {
          const envNames: Record<string, string> = {
            "feature.waitlist_enabled": "WAITLIST_ENABLED",
            "feature.generated_build_execution": "GENERATED_BUILD_EXECUTION_ENABLED",
            "feature.generated_public_execution": "GENERATED_PUBLIC_EXECUTION_ENABLED",
          };
          const name = envNames[key];
          if (!name) return undefined;
          const raw = process.env[name];
          if (!raw) return undefined;
          return raw.toLowerCase();
        };
        const entries = APP_SETTINGS.map((e) => {
          const db = dbMap.get(e.key);
          const env = envValue(e.key);
          const source = db !== undefined ? "db" : env !== undefined ? "env" : "fallback";
          return {
            category: e.category,
            dbValue: db ?? null,
            effectiveValue: db ?? env ?? e.fallback,
            fallback: e.fallback,
            key: e.key,
            label: e.label,
            source,
            type: e.type,
          };
        });
        return Response.json({ entries });
      },

      PUT: async ({ request }) => {
        const admin = await requireAdmin();
        if (!admin.ok) {
          return Response.json(
            { message: admin.message },
            { status: admin.status },
          );
        }
        const body = (await request.json().catch(() => ({}))) as {
          category?: string;
          values?: Record<string, unknown>;
        };
        const category = body.category as SettingCategory | undefined;
        const values = body.values ?? {};
        if (!category || !values) {
          return Response.json(
            { message: "category dan values wajib diisi." },
            { status: 400 },
          );
        }
        // Validate every value against the registry.
        for (const [key, value] of Object.entries(values)) {
          const entry = findConfigEntry(key);
          if (!entry || entry.category !== category) {
            return Response.json(
              { message: `Kunci tidak valid: ${key}` },
              { status: 400 },
            );
          }
          if (entry.type === "boolean" && typeof value !== "boolean") {
            return Response.json(
              { message: `${key} harus boolean.` },
              { status: 400 },
            );
          }
          if (entry.type === "number" && (typeof value !== "number" || !Number.isFinite(value))) {
            return Response.json(
              { message: `${key} harus angka.` },
              { status: 400 },
            );
          }
          if (entry.type === "string" && typeof value !== "string") {
            return Response.json(
              { message: `${key} harus string.` },
              { status: 400 },
            );
          }
        }
        await prisma.$transaction(
          Object.entries(values).map(([key, value]) =>
            prisma.appSetting.upsert({
              where: { key },
              create: { category, key, value, updatedBy: admin.admin.email },
              update: { value, updatedBy: admin.admin.email },
            }),
          ),
        );
        invalidateSettingCache();
        return Response.json({ ok: true });
      },
    },
  },
});
```

- [ ] **Step 2: Build the Settings UI**

`src/routes/_main.admin.settings.tsx`:

```tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { useState } from "react";

import { fetchJson } from "@/lib/query-client";

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

export const Route = createFileRoute("/_main/admin/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryFn: () =>
      fetchJson<{ entries: SettingEntry[] }>("/api/admin/settings"),
    queryKey: ["admin", "settings"],
  });
  const [draft, setDraft] = useState<Record<string, unknown>>({});

  const save = useMutation({
    mutationFn: (vars: { category: string; values: Record<string, unknown> }) =>
      fetchJson("/api/admin/settings", {
        body: JSON.stringify(vars),
        headers: { "Content-Type": "application/json" },
        method: "PUT",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "settings"] });
      setDraft({});
      toast.success("Pengaturan disimpan.");
    },
    onError: () => toast.error("Gagal menyimpan."),
  });

  const categories = ["feature_flag", "booster", "rate_limit", "ai"] as const;
  const byCat = (cat: string) => data?.entries.filter((e) => e.category === cat) ?? [];

  return (
    <div className="flex flex-col gap-spacing-6">
      {categories.map((cat) => (
        <section key={cat}>
          <h2 className="mb-spacing-3 text-lg font-semibold capitalize">{cat.replace("_", " ")}</h2>
          <div className="flex flex-col gap-spacing-3">
            {byCat(cat).map((entry) => {
              const value = draft[entry.key] ?? entry.effectiveValue;
              return (
                <div
                  className="flex items-center justify-between gap-spacing-3 rounded-radius-md border border-surface-warm-white/10 bg-surface-warm-white/5 p-spacing-3 text-sm"
                  key={entry.key}
                >
                  <div>
                    <p>{entry.label}</p>
                    <p className="text-surface-warm-white/40">
                      Sumber: {entry.source} · fallback: {String(entry.fallback)}
                    </p>
                  </div>
                  {entry.type === "boolean" ? (
                    <button
                      className={
                        value === true
                          ? "rounded-radius-md bg-emerald-600 px-spacing-3 py-spacing-2 text-white"
                          : "rounded-radius-md border border-surface-warm-white/15 px-spacing-3 py-spacing-2"
                      }
                      onClick={() =>
                        setDraft((d) => ({ ...d, [entry.key]: !value }))
                      }
                      type="button"
                    >
                      {value === true ? "ON" : "OFF"}
                    </button>
                  ) : (
                    <input
                      className="w-32 rounded-radius-md border border-surface-warm-white/15 bg-surface-warm-white/5 px-spacing-2 py-spacing-1 text-sm"
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          [entry.key]:
                            entry.type === "number" ? Number(e.target.value) : e.target.value,
                        }))
                      }
                      type={entry.type === "number" ? "number" : "text"}
                      value={String(value)}
                    />
                  )}
                </div>
              );
            })}
          </div>
          <button
            className="mt-spacing-3 rounded-radius-md bg-surface-warm-white/15 px-spacing-3 py-spacing-2 text-sm"
            onClick={() => save.mutate({ category: cat, values: draft })}
            type="button"
          >
            Simpan {cat.replace("_", " ")}
          </button>
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Regenerate routes + run the fast gate**

Run:
```bash
bunx tsr generate
bun run check
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/routes/api.admin.settings.ts src/routes/_main.admin.settings.tsx src/routeTree.gen.ts
git commit -m "feat(admin): settings tab — typed DB-config editor per category"
```

---

### Task 15: Admin nav visibility + architecture doc

**Files:**
- Modify: `src/components/common/Header.tsx` (add `/admin` link for admins)
- Modify: `src/components/common/MobileNav.tsx` (same)
- Modify: `docs/architecture.md` (record the new boundary)

**Interfaces:**
- Consumes: `isAdminEmail` (existing), session.

- [ ] **Step 1: Add the admin link to Header + MobileNav**

In `src/components/common/Header.tsx` and `src/components/common/MobileNav.tsx`, read the session; if `isAdminEmail(user.email)`, render a link to `/admin` labeled "Admin". Follow the existing pattern in those files for auth-gated links (import `isAdminEmail` from `@/lib/waitlist/waitlist`, read session via the same hook the file already uses). Match the surrounding link styling.

- [ ] **Step 2: Update docs/architecture.md**

Add a subsection under the boundaries list documenting the admin dashboard:
- `/admin` tabbed shell (`_main.admin.tsx` layout + 5 sub-routes).
- `AppSetting` table (DB-driven runtime config; secrets stay env-only).
- `src/lib/app-settings.ts` (DB-first, env-fallback, 5s cache).
- New `User.bannedAt` column + `auth()` ban enforcement.
- Admin APIs under `/api/admin/*` (overview, users, users/:id, transactions, transactions/:orderId/verify, settings) — all `requireAdmin()`-guarded.

- [ ] **Step 3: Run the fast gate**

Run: `bun run check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/common/Header.tsx src/components/common/MobileNav.tsx docs/architecture.md
git commit -m "feat(admin): nav visibility for admins + architecture doc"
```

---

## Self-Review

**1. Spec coverage:**
- DB-first `AppSetting` table → Task 1 ✓
- Config registry → Task 2 ✓
- Read layer (`getSetting`, cache, sync variant) → Task 3 ✓
- Call-site migrations (waitlist, rate-limit, capability flags, booster) → Tasks 4-7 ✓
- Admin tabbed shell → Task 9 ✓
- Overview analytics → Task 10 ✓
- Waitlist tab (relocated) → Task 11 ✓
- Users (list/search + ban/unban + `User.bannedAt`) → Tasks 8, 12 ✓
- Transactions (list/filter + verify) → Task 13 ✓
- Settings editor → Task 14 ✓
- Nav visibility + docs → Task 15 ✓

**2. Placeholder scan:** No TBD/TODO/FIXME. All code blocks contain complete code.

**3. Type consistency:**
- `getSetting<T>(key, fallback): Promise<T>` — consistent across Tasks 3, 4, 5, 7.
- `getSettingSync<T>(key, fallback): T` — consistent across Tasks 3, 6.
- `invalidateSettingCache(key?)` — Task 3 defines; Tasks 4 (test), 14 use.
- `getBoosterPack(id): Promise<{amount, energy, name}>` — Task 7 defines + uses.
- `BoosterPackId` — imported consistently from `@/lib/pakasir`.
- `SettingCategory` — Task 2 defines; Task 14 imports.
- `findConfigEntry` — Task 2 defines; Tasks 3, 14 use.

All consistent. Plan complete.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-27-admin-dashboard.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
