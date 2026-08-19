# Admin Settings DB-First Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every non-secret config value editable at `/admin/settings`, with `AppSetting` (DB) always winning over `.env`.

**Architecture:** Extend `ConfigEntry` with `tier`/`env`/`min`/`max`/`requiresRestart`; add a no-TTL snapshot layer to `app-settings.ts` primed once per boot from `src/start.ts` middleware; rewire ten config modules from `getEnv` to `getSettingSync` while keeping their synchronous signatures and read-side clamps; enforce min/max on write in the PUT handler; split the admin UI into a basic tier and a collapsed advanced tier.

**Tech Stack:** TypeScript, TanStack Start (file routes + middleware), Prisma/Postgres, TanStack Query, Vitest, Tailwind (design tokens), Storybook.

**Spec:** `docs/superpowers/specs/2026-07-28-admin-settings-db-first-design.md`

## Global Constraints

- Bun only; `bun.lock` is the canonical lockfile. Never `npm`/`yarn`/`pnpm`.
- Work on branch `dev`. Commit each task separately as it finishes; never batch.
- Conventional Commits. Pre-commit runs `bun run check:commit` (prettier + eslint on staged files).
- User-facing product UI copy is **Indonesian**; developer-facing docs, code, logs, and errors are **English**.
- Setting keys, env var names, and code identifiers stay verbatim in all languages.
- Never add a new dependency. Reuse what is installed.
- Never write a secret into a tracked file. This repo is public.
- Never `console.log` an env value. Log the variable *name* plus a set/unset boolean only.
- Surgical edits: touch only what the task requires. Do not refactor adjacent code.
- **Other agents are working on `dev` concurrently.** Stage only the exact files your task's commit step names. Never `git add -A`, `git add .`, or `git commit -a`. The working tree contains unrelated in-flight changes that are not yours.
- Read-side clamps stay the last word: DB/env values are always clamped by the consumer's existing `Math.min(max, Math.max(min, ...))` logic.
- New reusable UI must land in Storybook in the same change.
- Do not run `bun run build` unless a task says to.
- Run `bun run check` before the final handoff.

## Reference: resolution contract

```
getSetting (async)    : TTL cache → DB → snapshot → env → fallback
getSettingSync        : TTL cache → snapshot → fallback
```

The snapshot has **no TTL** and is replaced wholesale by `primeSettingCache()`.
This is what makes `getSettingSync` trustworthy and lets consumers stay
synchronous.

---

### Task 1: Registry schema fields

**Files:**
- Modify: `src/lib/app-settings-registry.ts:1-13`
- Test: `src/lib/app-settings-registry.test.ts`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: `SettingTier = "basic" | "advanced"`; `SettingCategory` widened to `"feature_flag" | "economics" | "booster" | "ai" | "rate_limit" | "runtime" | "limits"`; `ConfigEntry` with required `tier` and optional `env?: string`, `min?: number`, `max?: number`, `requiresRestart?: boolean`; `CATEGORY_ORDER: readonly SettingCategory[]`; `CATEGORY_TIER: Record<SettingCategory, SettingTier>`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/app-settings-registry.test.ts`:

```ts
import {
  APP_SETTINGS,
  CATEGORY_ORDER,
  CATEGORY_TIER,
} from "@/lib/config/app-settings-registry";

describe("registry schema", () => {
  it("every entry declares a valid tier", () => {
    for (const entry of APP_SETTINGS) {
      expect(["basic", "advanced"]).toContain(entry.tier);
    }
  });

  it("every entry's tier matches its category tier", () => {
    for (const entry of APP_SETTINGS) {
      expect(entry.tier).toBe(CATEGORY_TIER[entry.category]);
    }
  });

  it("CATEGORY_ORDER covers every category used by an entry", () => {
    for (const entry of APP_SETTINGS) {
      expect(CATEGORY_ORDER).toContain(entry.category);
    }
  });

  it("no two entries share an env var name", () => {
    const envs = APP_SETTINGS.map((e) => e.env).filter(Boolean);
    expect(new Set(envs).size).toBe(envs.length);
  });

  it("numeric bounds are coherent: min <= fallback <= max", () => {
    for (const entry of APP_SETTINGS) {
      if (entry.type !== "number") {
        continue;
      }
      if (entry.min !== undefined) {
        expect(entry.fallback).toBeGreaterThanOrEqual(entry.min);
      }
      if (entry.max !== undefined) {
        expect(entry.fallback).toBeLessThanOrEqual(entry.max);
      }
      if (entry.min !== undefined && entry.max !== undefined) {
        expect(entry.min).toBeLessThanOrEqual(entry.max);
      }
    }
  });
});
```

Also replace the existing `"every category is one of the known set"` test body's `valid` array with `CATEGORY_ORDER`:

```ts
  it("every category is one of the known set", () => {
    for (const entry of APP_SETTINGS) {
      expect(CATEGORY_ORDER).toContain(entry.category);
    }
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/lib/app-settings-registry.test.ts`
Expected: FAIL — `CATEGORY_ORDER` / `CATEGORY_TIER` are not exported.

- [ ] **Step 3: Write minimal implementation**

Replace `src/lib/app-settings-registry.ts:1-13` with:

```ts
export type SettingType = "boolean" | "number" | "string";
export type SettingTier = "basic" | "advanced";
export type SettingCategory =
  | "feature_flag"
  | "economics"
  | "booster"
  | "ai"
  | "rate_limit"
  | "runtime"
  | "limits";

// Render order on /admin/settings. Basic categories render expanded; advanced
// collapse behind a single disclosure.
export const CATEGORY_ORDER = [
  "feature_flag",
  "economics",
  "booster",
  "ai",
  "rate_limit",
  "runtime",
  "limits",
] as const satisfies readonly SettingCategory[];

export const CATEGORY_TIER: Record<SettingCategory, SettingTier> = {
  feature_flag: "basic",
  economics: "basic",
  booster: "basic",
  ai: "advanced",
  rate_limit: "advanced",
  runtime: "advanced",
  limits: "advanced",
};

export type ConfigEntry = {
  key: string;
  category: SettingCategory;
  type: SettingType;
  label: string;
  fallback: boolean | number | string;
  tier: SettingTier;
  // Canonical env var name. Omitted when the setting has no env equivalent.
  // This is the single source of truth for key→env mapping; nothing derives
  // an env name by string transformation.
  env?: string;
  // Inclusive bounds, numbers only. Enforced on write by the admin PUT handler
  // and mirrored by the consumer's own read-side clamp.
  min?: number;
  max?: number;
  // True when the value is read once at process start, so a change needs a
  // restart to take effect. Surfaced as a badge in the admin UI.
  requiresRestart?: boolean;
};
```

Then add `tier: "basic"` to each of the four existing `feature_flag` entries and each of the eight `booster` entries, and `tier: "advanced"` to each of the ten `rate_limit` entries and the three `ai` entries.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test src/lib/app-settings-registry.test.ts`
Expected: PASS

- [ ] **Step 5: Typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/app-settings-registry.ts src/lib/app-settings-registry.test.ts
git commit -m "feat(settings): add tier/env/min/max fields to config registry"
```

---

### Task 2: Registry env + bounds for existing entries

**Files:**
- Modify: `src/lib/app-settings-registry.ts`
- Test: `src/lib/app-settings-registry.test.ts`

**Interfaces:**
- Consumes: `ConfigEntry` with `env`/`min`/`max` from Task 1
- Produces: all 25 existing entries carry an `env` where one exists, and `min`/`max` for every numeric entry

- [ ] **Step 1: Write the failing test**

Append to `src/lib/app-settings-registry.test.ts`:

```ts
describe("existing entries carry env + bounds", () => {
  it("maps the three feature flags to their env vars", () => {
    const expected: Record<string, string> = {
      "feature.waitlist_enabled": "WAITLIST_ENABLED",
      "feature.generated_build_execution": "GENERATED_BUILD_EXECUTION_ENABLED",
      "feature.generated_public_execution":
        "GENERATED_PUBLIC_EXECUTION_ENABLED",
    };
    for (const [key, env] of Object.entries(expected)) {
      expect(APP_SETTINGS.find((e) => e.key === key)?.env).toBe(env);
    }
  });

  it("maps every rate_limit key to its RATE_LIMIT_* env var", () => {
    const rateLimits = APP_SETTINGS.filter(
      (e) => e.category === "rate_limit",
    );
    expect(rateLimits).toHaveLength(10);
    for (const entry of rateLimits) {
      expect(entry.env).toMatch(/^RATE_LIMIT_[A-Z_]+$/);
    }
  });

  it("maps ai.models_default to AI_MODELS", () => {
    expect(
      APP_SETTINGS.find((e) => e.key === "ai.models_default")?.env,
    ).toBe("AI_MODELS");
  });

  it("streamer_mode has no env var (DB-only)", () => {
    expect(
      APP_SETTINGS.find((e) => e.key === "feature.streamer_mode")?.env,
    ).toBeUndefined();
  });

  it("every numeric entry declares min and max", () => {
    for (const entry of APP_SETTINGS) {
      if (entry.type === "number") {
        expect(entry.min).toBeDefined();
        expect(entry.max).toBeDefined();
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/lib/app-settings-registry.test.ts`
Expected: FAIL — `env` is `undefined` on every entry.

- [ ] **Step 3: Write minimal implementation**

Add `env` to the three feature flags:

| key | env |
| --- | --- |
| `feature.waitlist_enabled` | `WAITLIST_ENABLED` |
| `feature.generated_build_execution` | `GENERATED_BUILD_EXECUTION_ENABLED` |
| `feature.generated_public_execution` | `GENERATED_PUBLIC_EXECUTION_ENABLED` |

Leave `feature.streamer_mode` without an `env`.

Add `env` + `min`/`max` to the ten `rate_limit` entries:

| key | env | min | max |
| --- | --- | --- | --- |
| `ratelimit.global_ip.requests` | `RATE_LIMIT_GLOBAL_IP_REQUESTS` | 1 | 100000 |
| `ratelimit.global_ip.window_seconds` | `RATE_LIMIT_GLOBAL_IP_WINDOW_SECONDS` | 1 | 86400 |
| `ratelimit.ai_user.requests` | `RATE_LIMIT_AI_USER_REQUESTS` | 1 | 100000 |
| `ratelimit.ai_user.window_seconds` | `RATE_LIMIT_AI_USER_WINDOW_SECONDS` | 1 | 86400 |
| `ratelimit.ai_ip.requests` | `RATE_LIMIT_AI_IP_REQUESTS` | 1 | 100000 |
| `ratelimit.ai_ip.window_seconds` | `RATE_LIMIT_AI_IP_WINDOW_SECONDS` | 1 | 86400 |
| `ratelimit.build_user.requests` | `RATE_LIMIT_BUILD_USER_REQUESTS` | 1 | 100000 |
| `ratelimit.build_user.window_seconds` | `RATE_LIMIT_BUILD_USER_WINDOW_SECONDS` | 1 | 86400 |
| `ratelimit.build_ip.requests` | `RATE_LIMIT_BUILD_IP_REQUESTS` | 1 | 100000 |
| `ratelimit.build_ip.window_seconds` | `RATE_LIMIT_BUILD_IP_WINDOW_SECONDS` | 1 | 86400 |

Add `env` + bounds to the eight `booster` entries — `env: undefined` (no env
equivalent exists), `min: 0`, `max: 100_000_000` for `.amount`; `min: 0`,
`max: 100_000_000` for `.energy`.

Add `env` + bounds to the three `ai` entries:

| key | env | min | max |
| --- | --- | --- | --- |
| `ai.timeout.moderation_ms` | `AI_TIMEOUT_MODERATION_MS` | 30000 | 60000 |
| `ai.timeout.discuss_ms` | `AI_TIMEOUT_DISCUSS_MS` | 30000 | 180000 |
| `ai.models_default` | `AI_MODELS` | — | — |

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test src/lib/app-settings-registry.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/app-settings-registry.ts src/lib/app-settings-registry.test.ts
git commit -m "feat(settings): declare env names and numeric bounds on existing entries"
```

---

### Task 3: Snapshot layer + `primeSettingCache`

**Files:**
- Modify: `src/lib/app-settings.ts:29-49` (delete `envKeyFor`), `:88-145`
- Test: `src/lib/app-settings.test.ts`

**Interfaces:**
- Consumes: `ConfigEntry.env` from Task 2; existing `findConfigEntry`
- Produces: `primeSettingCache(): Promise<void>`; `getSettingSync` reads the snapshot; `envKeyFor` no longer exists

- [ ] **Step 1: Write the failing test**

Append to `src/lib/app-settings.test.ts`:

```ts
import {
  getSetting,
  getSettingSync,
  invalidateSettingCache,
  primeSettingCache,
} from "@/lib/config/app-settings";

describe("primeSettingCache", () => {
  beforeEach(() => {
    invalidateSettingCache();
    vi.useRealTimers();
  });

  it("makes getSettingSync return the DB value", async () => {
    const { prisma } = await import("@/lib/prisma");
    await prisma.appSetting.upsert({
      where: { key: "feature.streamer_mode" },
      create: { value: false },
      update: { value: false },
    });
    invalidateSettingCache();

    expect(getSettingSync("feature.streamer_mode", true)).toBe(true);
    await primeSettingCache();
    expect(getSettingSync("feature.streamer_mode", true)).toBe(false);
  });

  it("snapshot survives past the 5s TTL", async () => {
    const { prisma } = await import("@/lib/prisma");
    await prisma.appSetting.upsert({
      where: { key: "feature.streamer_mode" },
      create: { value: false },
      update: { value: false },
    });
    invalidateSettingCache();
    await primeSettingCache();

    vi.useFakeTimers();
    vi.advanceTimersByTime(60_000);
    expect(getSettingSync("feature.streamer_mode", true)).toBe(false);
    vi.useRealTimers();
  });

  it("does not throw when the DB read fails", async () => {
    const { prisma } = await import("@/lib/prisma");
    const spy = vi
      .spyOn(prisma.appSetting, "findMany")
      .mockRejectedValueOnce(new Error("db down"));

    await expect(primeSettingCache()).resolves.toBeUndefined();
    expect(getSettingSync("feature.streamer_mode", true)).toBe(true);
    spy.mockRestore();
  });

  it("skips rows whose type does not match the registry", async () => {
    const { prisma } = await import("@/lib/prisma");
    await prisma.appSetting.upsert({
      where: { key: "feature.streamer_mode" },
      create: { value: "not-a-boolean" },
      update: { value: "not-a-boolean" },
    });
    invalidateSettingCache();
    await primeSettingCache();

    expect(getSettingSync("feature.streamer_mode", true)).toBe(true);
  });

  it("is single-flight across concurrent callers", async () => {
    const { prisma } = await import("@/lib/prisma");
    invalidateSettingCache();
    const spy = vi.spyOn(prisma.appSetting, "findMany");

    await Promise.all([
      primeSettingCache(),
      primeSettingCache(),
      primeSettingCache(),
    ]);

    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("re-primes after invalidateSettingCache", async () => {
    const { prisma } = await import("@/lib/prisma");
    await primeSettingCache();
    const spy = vi.spyOn(prisma.appSetting, "findMany");

    invalidateSettingCache();
    await primeSettingCache();

    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
```

Extend the existing prisma mock in `src/lib/app-settings.test.ts:6-29` with a
`findMany` that returns every row in the closure `Map`:

```ts
        findMany: vi.fn(async () =>
          [...store.entries()].map(([key, value]) => ({ key, value })),
        ),
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/lib/app-settings.test.ts`
Expected: FAIL — `primeSettingCache` is not exported.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/app-settings.ts`, delete `envKeyFor` (lines 29-49) and add the
snapshot layer:

```ts
// No-TTL snapshot of every AppSetting row, replaced wholesale by
// primeSettingCache(). The TTL cache above expires after 5s; if priming wrote
// only there, getSettingSync would silently resume returning fallbacks five
// seconds after boot. The snapshot is what makes sync reads trustworthy.
let snapshot = new Map<string, unknown>();
let primePromise: Promise<void> | null = null;

export function invalidateSettingCache(key?: string): void {
  if (key) {
    cache.delete(key);
    return;
  }
  cache.clear();
  primePromise = null;
}

export function primeSettingCache(): Promise<void> {
  primePromise ??= (async () => {
    try {
      const appSetting = await getDb();
      const rows = await appSetting.findMany({
        select: { key: true, value: true },
      });
      const next = new Map<string, unknown>();
      for (const row of rows) {
        const entry = findConfigEntry(row.key);
        if (!entry) {
          continue;
        }
        const value = coerce(row.value, entry.type);
        if (value !== null) {
          next.set(row.key, value);
        }
      }
      snapshot = next;
    } catch {
      // Never let a config read take the app down. Leaves the previous
      // snapshot (empty on first boot); reads degrade to env → fallback.
    }
  })();
  return primePromise;
}
```

Rewrite `getSettingSync` to consult the snapshot:

```ts
export function getSettingSync<T extends boolean | number | string>(
  key: string,
  fallback: T,
): T {
  const entry = findConfigEntry(key);
  const type = (entry?.type ?? typeof fallback) as SettingType;

  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return (coerce(cached.value, type) as T) ?? fallback;
  }
  if (snapshot.has(key)) {
    return (coerce(snapshot.get(key), type) as T) ?? fallback;
  }
  return fallback;
}
```

In `getSetting`, replace the `envKeyFor(key)` call with the registry lookup and
insert the snapshot between DB and env:

```ts
  if (snapshot.has(key)) {
    const snapValue = coerce(snapshot.get(key), type as SettingType);
    if (snapValue !== null) {
      return snapValue as T;
    }
  }
  // env fallback
  const envName = entry?.env;
  if (envName) {
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test src/lib/app-settings.test.ts`
Expected: PASS

- [ ] **Step 5: Typecheck**

Run: `bun run typecheck`
Expected: FAIL — `api.admin.settings.ts` still imports nothing from `envKeyFor`, but `app-settings.test.ts` may reference it. If any file imports `envKeyFor`, that is Task 5's job; confirm the only breakage is there and proceed.

- [ ] **Step 6: Commit**

```bash
git add src/lib/app-settings.ts src/lib/app-settings.test.ts
git commit -m "feat(settings): add no-TTL snapshot layer and primeSettingCache"
```

---

### Task 4: Prime the cache in server middleware

**Files:**
- Modify: `src/start.ts:32` (inside `securityMiddleware`)
- Test: `src/lib/app-settings.test.ts` (already covers priming; no new test)

**Interfaces:**
- Consumes: `primeSettingCache()` from Task 3
- Produces: a warm snapshot before any route handler runs

- [ ] **Step 1: Add the prime call**

In `src/start.ts`, import and await priming as the first statement of the
middleware body:

```ts
import { primeSettingCache } from "@/lib/config/app-settings";
```

```ts
const securityMiddleware = createMiddleware().server(async ({ next }) => {
  // Warm the AppSetting snapshot before any handler runs, so getSettingSync
  // call sites resolve DB values instead of falling back to env. Idempotent
  // and single-flight — after the first request this awaits a resolved promise.
  await primeSettingCache();

  const nonce = generateNonce();
```

- [ ] **Step 2: Verify the app boots and settings resolve**

Run: `bun run dev`
Then, in a second shell, confirm the server responds:
`curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/`
Expected: `200`

Stop the dev server.

- [ ] **Step 3: Run the full unit suite**

Run: `bun run test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/start.ts
git commit -m "feat(settings): prime AppSetting snapshot in global middleware"
```

---

### Task 5: Unify the admin env map + bounds validation

**Files:**
- Modify: `src/routes/api.admin.settings.ts:28-45` (delete local `envNames`), `:94-115` (add bounds)
- Create: `src/routes/api.admin.settings.test.ts`

**Interfaces:**
- Consumes: `ConfigEntry.env`/`min`/`max` from Task 2
- Produces: GET entries include `tier`, `min`, `max`, `requiresRestart`; PUT rejects out-of-range numbers with 400

- [ ] **Step 1: Write the failing test**

Create `src/routes/api.admin.settings.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { validateSettingValue } from "@/routes/api.admin.settings";

describe("validateSettingValue", () => {
  it("accepts an in-range number", () => {
    expect(
      validateSettingValue("ratelimit.ai_ip.requests", 20, "rate_limit"),
    ).toBeNull();
  });

  it("rejects a number below min", () => {
    expect(
      validateSettingValue("ratelimit.ai_ip.requests", 0, "rate_limit"),
    ).toMatch(/harus antara/);
  });

  it("rejects a number above max", () => {
    expect(
      validateSettingValue("ratelimit.ai_ip.requests", 999_999, "rate_limit"),
    ).toMatch(/harus antara/);
  });

  it("rejects a key from the wrong category", () => {
    expect(
      validateSettingValue("ratelimit.ai_ip.requests", 20, "ai"),
    ).toMatch(/tidak valid/);
  });

  it("rejects an unknown key", () => {
    expect(validateSettingValue("nope.nope", 1, "ai")).toMatch(
      /tidak valid/,
    );
  });

  it("rejects a wrong-typed value", () => {
    expect(
      validateSettingValue("feature.streamer_mode", 1, "feature_flag"),
    ).toMatch(/harus boolean/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/routes/api.admin.settings.test.ts`
Expected: FAIL — `validateSettingValue` is not exported.

- [ ] **Step 3: Write minimal implementation**

In `src/routes/api.admin.settings.ts`, extract validation into an exported pure
function above the route definition:

```ts
// Returns an Indonesian error message, or null when the value is acceptable.
// Bounds come from the registry, so a value that reaches the DB is already
// in-range — the consumer's read-side clamp is a second net for legacy values.
export function validateSettingValue(
  key: string,
  value: unknown,
  category: SettingCategory,
): string | null {
  const entry = findConfigEntry(key);
  if (!entry || entry.category !== category) {
    return `Kunci tidak valid: ${key}`;
  }
  if (entry.type === "boolean" && typeof value !== "boolean") {
    return `${key} harus boolean.`;
  }
  if (entry.type === "string" && typeof value !== "string") {
    return `${key} harus teks.`;
  }
  if (entry.type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return `${key} harus angka.`;
    }
    const { min, max } = entry;
    if (
      (min !== undefined && value < min) ||
      (max !== undefined && value > max)
    ) {
      return `${key} harus antara ${min} dan ${max}.`;
    }
  }
  return null;
}
```

Replace the inline validation loop (`:86-115`) with:

```ts
        for (const [key, value] of Object.entries(values)) {
          const error = validateSettingValue(key, value, category);
          if (error) {
            return Response.json({ message: error }, { status: 400 });
          }
        }
```

Delete the local `envNames` map (`:29-35`) and read the registry instead:

```ts
        const envValue = (entry: ConfigEntry): unknown => {
          if (!entry.env) {
            return undefined;
          }
          const raw = process.env[entry.env];
          if (!raw) {
            return undefined;
          }
          return entry.type === "boolean" ? raw.toLowerCase() : raw;
        };
```

Update the `entries` map to call `envValue(e)` and expose the new fields:

```ts
        const entries = APP_SETTINGS.map((e) => {
          const db = dbMap.get(e.key);
          const env = envValue(e);
          const source =
            db !== undefined ? "db" : env !== undefined ? "env" : "fallback";
          return {
            category: e.category,
            dbValue: db ?? null,
            effectiveValue: db ?? env ?? e.fallback,
            env: e.env ?? null,
            fallback: e.fallback,
            key: e.key,
            label: e.label,
            max: e.max ?? null,
            min: e.min ?? null,
            requiresRestart: e.requiresRestart ?? false,
            source,
            tier: e.tier,
            type: e.type,
          };
        });
```

Add `type ConfigEntry` to the existing import from `@/lib/config/app-settings-registry`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test src/routes/api.admin.settings.test.ts`
Expected: PASS

- [ ] **Step 5: Typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/routes/api.admin.settings.ts src/routes/api.admin.settings.test.ts
git commit -m "fix(settings): read env names from registry and enforce bounds on write"
```

---

### Task 6: `ai` category — 12 new entries + rewire consumers

**Files:**
- Modify: `src/lib/app-settings-registry.ts`, `src/lib/ai-timeouts.ts:27-101`, `src/lib/ai-agent-steps.ts:12-49`, `src/lib/ai-models.ts:1-17`
- Test: `src/lib/ai-timeouts.test.ts`, `src/lib/ai-agent-steps.test.ts`, `src/lib/ai-models.test.ts`

**Interfaces:**
- Consumes: `getSettingSync` from Task 3
- Produces: `getAiTimeoutMs(key)` and `getAgentMaxSteps(key)` keep their sync signatures but resolve DB-first; `getDefaultAiModel()` and `getGenerationModel()` unchanged signatures, DB-first

- [ ] **Step 1: Write the failing test**

Append to `src/lib/ai-timeouts.test.ts`:

```ts
import { invalidateSettingCache } from "@/lib/config/app-settings";
import { getAiTimeoutMs } from "@/lib/ai/ai-timeouts";

describe("getAiTimeoutMs DB-first", () => {
  afterEach(() => {
    invalidateSettingCache();
    delete process.env.AI_TIMEOUT_DISCUSS_MS;
  });

  it("prefers the DB value over env", async () => {
    const { prisma } = await import("@/lib/prisma");
    await prisma.appSetting.upsert({
      where: { key: "ai.timeout.discuss_ms" },
      create: { value: 45_000 },
      update: { value: 45_000 },
    });
    process.env.AI_TIMEOUT_DISCUSS_MS = "120000";
    invalidateSettingCache();
    const { primeSettingCache } = await import("@/lib/config/app-settings");
    await primeSettingCache();

    expect(getAiTimeoutMs("discuss")).toBe(45_000);
  });

  it("clamps an out-of-range DB value", async () => {
    const { prisma } = await import("@/lib/prisma");
    await prisma.appSetting.upsert({
      where: { key: "ai.timeout.discuss_ms" },
      create: { value: 999_999 },
      update: { value: 999_999 },
    });
    invalidateSettingCache();
    const { primeSettingCache } = await import("@/lib/config/app-settings");
    await primeSettingCache();

    expect(getAiTimeoutMs("discuss")).toBe(180_000);
  });

  it("falls back to the default when neither DB nor env is set", () => {
    invalidateSettingCache();
    expect(getAiTimeoutMs("discuss")).toBe(90_000);
  });
});
```

Write the equivalent three tests in `src/lib/ai-agent-steps.test.ts` for
`getAgentMaxSteps("generate")` (setting key `ai.agent.generate_max_steps`,
default 30, max 60) and in `src/lib/ai-models.test.ts` for
`getDefaultAiModel()` (setting key `ai.models_default`).

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/lib/ai-timeouts.test.ts src/lib/ai-agent-steps.test.ts src/lib/ai-models.test.ts`
Expected: FAIL — env still wins.

- [ ] **Step 3: Add the 12 registry entries**

Append to `APP_SETTINGS` in the `ai` block, every entry `category: "ai", tier: "advanced"`:

| key | env | type | fallback | min | max | label |
| --- | --- | --- | --- | --- | --- | --- |
| `ai.timeout.discuss_card_ms` | `AI_TIMEOUT_DISCUSS_CARD_MS` | number | 45000 | 3000 | 120000 | AI — discuss card timeout (ms) |
| `ai.timeout.discuss_one_call_ms` | `AI_TIMEOUT_DISCUSS_ONE_CALL_MS` | number | 120000 | 30000 | 240000 | AI — discuss one-call timeout (ms) |
| `ai.timeout.discuss_tool_settle_ms` | `AI_TIMEOUT_DISCUSS_TOOL_SETTLE_MS` | number | 30000 | 30000 | 60000 | AI — discuss tool settle timeout (ms) |
| `ai.timeout.chat_compaction_ms` | `AI_TIMEOUT_CHAT_COMPACTION_MS` | number | 60000 | 30000 | 120000 | AI — chat compaction timeout (ms) |
| `ai.timeout.build_spec_ms` | `AI_TIMEOUT_BUILD_SPEC_MS` | number | 120000 | 30000 | 240000 | AI — build spec timeout (ms) |
| `ai.timeout.source_generation_ms` | `AI_TIMEOUT_SOURCE_GENERATION_MS` | number | 600000 | 120000 | 600000 | AI — source generation timeout (ms) |
| `ai.timeout.edit_ms` | `AI_TIMEOUT_EDIT_MS` | number | 600000 | 60000 | 600000 | AI — edit timeout (ms) |
| `ai.timeout.edit_repair_ms` | `AI_TIMEOUT_EDIT_REPAIR_MS` | number | 300000 | 60000 | 600000 | AI — edit repair timeout (ms) |
| `ai.agent.generate_max_steps` | `AI_AGENT_GENERATE_MAX_STEPS` | number | 30 | 15 | 60 | AI — generate agent max steps |
| `ai.agent.repair_max_steps` | `AI_AGENT_REPAIR_MAX_STEPS` | number | 12 | 4 | 40 | AI — repair agent max steps |
| `ai.agent.subagent_max_steps` | `AI_AGENT_SUBAGENT_MAX_STEPS` | number | 8 | 2 | 15 | AI — subagent max steps |
| `ai.generation_model` | `AI_GENERATION_MODEL` | string | `""` | — | — | AI — build pipeline model id |

- [ ] **Step 4: Rewire `ai-timeouts.ts`**

Add a `key` field to every entry in the `AI_TIMEOUTS` block, matching the table
above (`moderation` → `ai.timeout.moderation_ms`, `discuss` →
`ai.timeout.discuss_ms`, `discussCard` → `ai.timeout.discuss_card_ms`, and so
on). Widen `AiTimeoutConfig` with `key: string`.

Replace the body of `getAiTimeoutMs`:

```ts
export function getAiTimeoutMs(key: AiTimeoutKey) {
  const config = AI_TIMEOUTS[key];
  const parsed = getSettingSync(config.key, config.defaultMs);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return config.defaultMs;
  }

  return Math.min(config.maxMs, Math.max(config.minMs, Math.round(parsed)));
}
```

Swap the import: `import { getSettingSync } from "@/lib/config/app-settings";` replaces
`import { getEnv } from "@/lib/config/config";`.

Leave `withAiTimeout` unchanged — `getAiTimeoutMs` stays synchronous, so the
default parameter still works.

- [ ] **Step 5: Rewire `ai-agent-steps.ts`**

Same shape: add `key` to each `AI_AGENT_STEPS` entry, widen `AiAgentStepConfig`
with `key: string`, and replace the `getEnv` read:

```ts
export function getAgentMaxSteps(key: AiAgentStepKey): number {
  const config = AI_AGENT_STEPS[key];
  const parsed = getSettingSync(config.key, config.defaultSteps);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return config.defaultSteps;
  }

  return Math.min(
    config.maxSteps,
    Math.max(config.minSteps, Math.round(parsed)),
  );
}
```

- [ ] **Step 6: Rewire `ai-models.ts`**

```ts
import { getSettingSync } from "@/lib/config/app-settings";

export const DEFAULT_AI_MODEL = "default-combo";

export function getDefaultAiModel(
  rawModels = getSettingSync("ai.models_default", "") ||
    process.env.AI_MODELS,
) {
  const models = rawModels
    ?.split(",")
    .map((model) => model.trim())
    .filter(Boolean);

  return models?.length ? models[0] : DEFAULT_AI_MODEL;
}

// Model for the build pipeline (spec + source generation). An empty value
// falls through to the default model, so admins can clear the override.
export function getGenerationModel() {
  return (
    getSettingSync("ai.generation_model", "") ||
    process.env.AI_GENERATION_MODEL ||
    getDefaultAiModel()
  );
}
```

The `rawModels` default parameter is preserved so existing tests that inject a
value keep working.

- [ ] **Step 7: Run tests to verify they pass**

Run: `bun run test src/lib/ai-timeouts.test.ts src/lib/ai-agent-steps.test.ts src/lib/ai-models.test.ts src/lib/app-settings-registry.test.ts`
Expected: PASS

- [ ] **Step 8: Run the affected downstream suites**

Run: `bun run test src/lib/projects/custom-source-generator.test.ts src/lib/ai-moderation.test.ts`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/lib/app-settings-registry.ts src/lib/ai-timeouts.ts src/lib/ai-agent-steps.ts src/lib/ai-models.ts src/lib/ai-timeouts.test.ts src/lib/ai-agent-steps.test.ts src/lib/ai-models.test.ts
git commit -m "feat(settings): make AI timeouts, step budgets, and model ids DB-first"
```

---

### Task 7: `economics` category — 7 new entries + rewire `user-credits.ts`

**Files:**
- Modify: `src/lib/app-settings-registry.ts`, `src/lib/user-credits.ts:19-52`
- Modify (callers): `src/routes/api.moderation.project-request.ts:10,40`, `src/routes/api.projects.$id.edit.ts:50,105`, `src/routes/api.projects.$id.generate.ts:66,123`, `src/routes/api.projects.moderate.ts:10,34`, `src/routes/api.projects.preview.ts:46,127`, `src/routes/api.projects.ts:29,131`
- Test: `src/lib/user-credits.test.ts`

**Interfaces:**
- Consumes: `getSettingSync` from Task 3
- Produces: `getProjectLimit(): number` (unchanged signature, DB-first); `getEnergyConfig(): { dailyLimit: number; microUsdPerEnergy: number; minDiscuss: number; minBuild: number; minEdit: number; minModeration: number }` replacing the six exported constants

- [ ] **Step 1: Write the failing test**

Append to `src/lib/user-credits.test.ts`:

```ts
import { invalidateSettingCache, primeSettingCache } from "@/lib/config/app-settings";
import { getEnergyConfig, getProjectLimit } from "@/lib/payment/user-credits";

describe("economics settings are DB-first", () => {
  afterEach(() => {
    invalidateSettingCache();
    delete process.env.PROJECT_LIMIT;
  });

  it("getProjectLimit prefers DB over env", async () => {
    const { prisma } = await import("@/lib/prisma");
    await prisma.appSetting.upsert({
      where: { key: "economics.project_limit" },
      create: { value: 12 },
      update: { value: 12 },
    });
    process.env.PROJECT_LIMIT = "3";
    invalidateSettingCache();
    await primeSettingCache();

    expect(getProjectLimit()).toBe(12);
  });

  it("getProjectLimit falls back to the code default", () => {
    invalidateSettingCache();
    expect(getProjectLimit()).toBe(5);
  });

  it("getEnergyConfig reads the daily limit from the DB", async () => {
    const { prisma } = await import("@/lib/prisma");
    await prisma.appSetting.upsert({
      where: { key: "economics.daily_energy_limit" },
      create: { value: 500_000 },
      update: { value: 500_000 },
    });
    invalidateSettingCache();
    await primeSettingCache();

    expect(getEnergyConfig().dailyLimit).toBe(500_000);
  });

  it("getEnergyConfig returns code defaults with an empty DB", () => {
    invalidateSettingCache();
    const config = getEnergyConfig();
    expect(config.dailyLimit).toBe(250_000);
    expect(config.minDiscuss).toBe(5_000);
    expect(config.minBuild).toBe(40_000);
    expect(config.minEdit).toBe(10_000);
    expect(config.minModeration).toBe(500);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/lib/user-credits.test.ts`
Expected: FAIL — `getEnergyConfig` is not exported.

- [ ] **Step 3: Add the 7 registry entries**

Append to `APP_SETTINGS`, every entry `category: "economics", tier: "basic", type: "number"`:

| key | env | fallback | min | max | label |
| --- | --- | --- | --- | --- | --- |
| `economics.project_limit` | `PROJECT_LIMIT` | 5 | 1 | 100 | Batas proyek per pengguna |
| `economics.daily_energy_limit` | — | 250000 | 10000 | 5000000 | Energi harian gratis |
| `economics.min_energy_discuss` | — | 5000 | 0 | 100000 | Energi minimum — diskusi |
| `economics.min_energy_build` | — | 40000 | 0 | 500000 | Energi minimum — build |
| `economics.min_energy_edit` | — | 10000 | 0 | 200000 | Energi minimum — edit |
| `economics.min_energy_moderation` | — | 500 | 0 | 50000 | Energi minimum — moderasi |
| `economics.micro_usd_per_energy` | — | 1000000 | 1000 | 100000000 | Micro-USD per energi |

- [ ] **Step 4: Rewire `user-credits.ts`**

Replace lines 19-31 (the six exported constants and `PROJECT_LIMIT_DEFAULT`)
with defaults plus an accessor. Keep the existing explanatory comment block
above them.

```ts
import { getSettingSync } from "@/lib/config/app-settings";

const DEFAULT_MICRO_USD_PER_ENERGY = 1_000_000;
const DEFAULT_DAILY_ENERGY_LIMIT = 250_000;
const DEFAULT_MIN_ENERGY_DISCUSS = 5_000;
const DEFAULT_MIN_ENERGY_BUILD = 40_000;
const DEFAULT_MIN_ENERGY_EDIT = 10_000;
const DEFAULT_MIN_ENERGY_MODERATION = 500;

export const PROJECT_LIMIT_DEFAULT = 5;

// Read as a function, not module-scope constants: the AppSetting snapshot is
// primed per-request in middleware, so a module-evaluation-time read would
// capture the fallback before priming ever runs.
export function getEnergyConfig() {
  return {
    dailyLimit: getSettingSync(
      "economics.daily_energy_limit",
      DEFAULT_DAILY_ENERGY_LIMIT,
    ),
    microUsdPerEnergy: getSettingSync(
      "economics.micro_usd_per_energy",
      DEFAULT_MICRO_USD_PER_ENERGY,
    ),
    minBuild: getSettingSync(
      "economics.min_energy_build",
      DEFAULT_MIN_ENERGY_BUILD,
    ),
    minDiscuss: getSettingSync(
      "economics.min_energy_discuss",
      DEFAULT_MIN_ENERGY_DISCUSS,
    ),
    minEdit: getSettingSync(
      "economics.min_energy_edit",
      DEFAULT_MIN_ENERGY_EDIT,
    ),
    minModeration: getSettingSync(
      "economics.min_energy_moderation",
      DEFAULT_MIN_ENERGY_MODERATION,
    ),
  };
}

export function getProjectLimit(): number {
  const raw = getSettingSync(
    "economics.project_limit",
    Number(process.env.PROJECT_LIMIT) || PROJECT_LIMIT_DEFAULT,
  );
  return Number.isFinite(raw) && raw >= 1
    ? Math.floor(raw)
    : PROJECT_LIMIT_DEFAULT;
}
```

Update the three in-file readers: `calculateEnergyCost` (line 34) uses
`getEnergyConfig().microUsdPerEnergy`; lines 129 and 312 use
`getEnergyConfig().dailyLimit`. The `checkEnergy` default parameter at line 78
becomes `cost?: number`, resolved inside the body via
`cost ?? getEnergyConfig().minDiscuss`.

- [ ] **Step 5: Update the six route callers**

Each import changes from a constant to `getEnergyConfig`, and each usage becomes
a property read. All six sites are inside `async` handlers, so no signature
changes are needed.

`src/routes/api.moderation.project-request.ts` and
`src/routes/api.projects.moderate.ts` and `src/routes/api.projects.ts`:
`MIN_ENERGY_MODERATION` → `getEnergyConfig().minModeration`

`src/routes/api.projects.$id.edit.ts`: `MIN_ENERGY_EDIT` → `getEnergyConfig().minEdit`

`src/routes/api.projects.$id.generate.ts`: `MIN_ENERGY_BUILD` → `getEnergyConfig().minBuild`

`src/routes/api.projects.preview.ts`: `MIN_ENERGY_DISCUSS` → `getEnergyConfig().minDiscuss`

- [ ] **Step 6: Run tests to verify they pass**

Run: `bun run test src/lib/user-credits.test.ts src/lib/app-settings-registry.test.ts`
Expected: PASS

- [ ] **Step 7: Typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/lib/app-settings-registry.ts src/lib/user-credits.ts src/lib/user-credits.test.ts src/routes/api.moderation.project-request.ts src/routes/api.projects.moderate.ts src/routes/api.projects.ts src/routes/api.projects.\$id.edit.ts src/routes/api.projects.\$id.generate.ts src/routes/api.projects.preview.ts
git commit -m "feat(settings): add economics category and make energy limits DB-first"
```

---

### Task 8: `runtime` + `limits` categories — 13 new entries + rewire consumers

**Files:**
- Modify: `src/lib/app-settings-registry.ts`, `src/lib/projects/runtime-network.ts:12-35`, `src/lib/projects/generated-resource-budget.ts:100-112`, `src/lib/projects/preview-asset-token.ts:121-131`, `src/lib/projects/project-thumbnail.ts:111,180,348-356`, `src/lib/projects/build-worker.ts:124-128`, `src/lib/projects/runtime-supervisor.ts:196`
- Test: `src/lib/projects/runtime-network.test.ts`, `src/lib/projects/generated-resource-budget.test.ts`

**Interfaces:**
- Consumes: `getSettingSync` from Task 3
- Produces: all seven modules resolve DB-first; every signature unchanged

- [ ] **Step 1: Write the failing test**

Append to `src/lib/projects/runtime-network.test.ts`:

```ts
import { invalidateSettingCache, primeSettingCache } from "@/lib/config/app-settings";
import { getRuntimeFetchTimeoutMs } from "@/lib/projects/runtime-network";

describe("runtime timeouts are DB-first", () => {
  afterEach(() => {
    invalidateSettingCache();
    delete process.env.PROJECT_RUNTIME_PROXY_TIMEOUT_MS;
  });

  it("prefers the DB value over env", async () => {
    const { prisma } = await import("@/lib/prisma");
    await prisma.appSetting.upsert({
      where: { key: "runtime.proxy_timeout_ms" },
      create: { value: 5_000 },
      update: { value: 5_000 },
    });
    process.env.PROJECT_RUNTIME_PROXY_TIMEOUT_MS = "20000";
    invalidateSettingCache();
    await primeSettingCache();

    expect(getRuntimeFetchTimeoutMs("proxy")).toBe(5_000);
  });

  it("clamps an out-of-range DB value to the policy max", async () => {
    const { prisma } = await import("@/lib/prisma");
    await prisma.appSetting.upsert({
      where: { key: "runtime.proxy_timeout_ms" },
      create: { value: 999_999 },
      update: { value: 999_999 },
    });
    invalidateSettingCache();
    await primeSettingCache();

    expect(getRuntimeFetchTimeoutMs("proxy")).toBe(30_000);
  });
});
```

Append the equivalent pair to `src/lib/projects/generated-resource-budget.test.ts`
for `getGeneratedResourceBudget("source").maxFiles` (setting key
`limits.source.max_files`, default 100, max 500).

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/lib/projects/runtime-network.test.ts src/lib/projects/generated-resource-budget.test.ts`
Expected: FAIL — env still wins.

- [ ] **Step 3: Add the 13 registry entries**

`runtime` block, every entry `category: "runtime", tier: "advanced"`:

| key | env | type | fallback | min | max | restart | label |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `runtime.build_concurrency` | `PROJECT_BUILD_CONCURRENCY` | number | 1 | 1 | 16 | yes | Runtime — build concurrency |
| `runtime.max_containers` | `PROJECT_RUNTIME_MAX_CONTAINERS` | number | 8 | 1 | 64 | yes | Runtime — max containers |
| `runtime.health_timeout_ms` | `PROJECT_RUNTIME_HEALTH_TIMEOUT_MS` | number | 2000 | 500 | 5000 | no | Runtime — health timeout (ms) |
| `runtime.proxy_timeout_ms` | `PROJECT_RUNTIME_PROXY_TIMEOUT_MS` | number | 15000 | 1000 | 30000 | no | Runtime — proxy timeout (ms) |
| `runtime.preview_token_ttl_seconds` | `PREVIEW_ASSET_TOKEN_TTL_SECONDS` | number | 300 | 60 | 900 | no | Runtime — preview token TTL (s) |
| `runtime.thumbnail_concurrency` | `PROJECT_THUMBNAIL_CONCURRENCY` | number | 1 | 1 | 8 | no | Runtime — thumbnail concurrency |
| `runtime.thumbnail_timeout_ms` | `PROJECT_THUMBNAIL_TIMEOUT_MS` | number | 15000 | 1000 | 120000 | no | Runtime — thumbnail timeout (ms) |

`limits` block, every entry `category: "limits", tier: "advanced", type: "number"`:

| key | env | fallback | min | max | label |
| --- | --- | --- | --- | --- | --- |
| `limits.source.max_files` | `PROJECT_SOURCE_MAX_FILES` | 100 | 10 | 500 | Limit — source max files |
| `limits.source.max_file_bytes` | `PROJECT_SOURCE_MAX_FILE_BYTES` | 262144 | 16384 | 1048576 | Limit — source max file bytes |
| `limits.source.max_total_bytes` | `PROJECT_SOURCE_MAX_TOTAL_BYTES` | 5242880 | 262144 | 20971520 | Limit — source max total bytes |
| `limits.dist.max_files` | `PROJECT_DIST_MAX_FILES` | 500 | 10 | 2000 | Limit — dist max files |
| `limits.dist.max_file_bytes` | `PROJECT_DIST_MAX_FILE_BYTES` | 10485760 | 65536 | 26214400 | Limit — dist max file bytes |
| `limits.dist.max_total_bytes` | `PROJECT_DIST_MAX_TOTAL_BYTES` | 52428800 | 1048576 | 209715200 | Limit — dist max total bytes |

Add one entry to the `feature_flag` block, `tier: "basic"`:

| key | env | type | fallback | label |
| --- | --- | --- | --- | --- |
| `feature.thumbnail_capture_enabled` | `PROJECT_THUMBNAIL_CAPTURE_ENABLED` | boolean | true | Thumbnail capture |

- [ ] **Step 4: Rewire `runtime-network.ts`**

Add `key` to both `RUNTIME_FETCH_POLICIES` entries (`health` →
`runtime.health_timeout_ms`, `proxy` → `runtime.proxy_timeout_ms`), widen
`RuntimeFetchPolicy` with `key: string`, and replace the read:

```ts
export function getRuntimeFetchTimeoutMs(kind: RuntimeFetchKind) {
  const policy = RUNTIME_FETCH_POLICIES[kind];
  const parsed = getSettingSync(policy.key, policy.defaultMs);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return policy.defaultMs;
  }

  return Math.min(policy.maxMs, Math.max(policy.minMs, Math.round(parsed)));
}
```

- [ ] **Step 5: Rewire `generated-resource-budget.ts`**

Add a `key` field to all six budget config blocks (e.g. `maxFiles` under
`source` gets `key: "limits.source.max_files"`), then replace
`resolveBudgetValue`:

```ts
function resolveBudgetValue(config: {
  defaultValue: number;
  key: string;
  maximum: number;
  minimum: number;
}) {
  const parsed = getSettingSync(config.key, config.defaultValue);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return config.defaultValue;
  }

  return Math.min(config.maximum, Math.max(config.minimum, Math.round(parsed)));
}
```

The `env` field stays on each config block for documentation; only the read
changes.

- [ ] **Step 6: Rewire the remaining four modules**

`preview-asset-token.ts:122`:
```ts
  const parsed = getSettingSync(
    "runtime.preview_token_ttl_seconds",
    DEFAULT_TTL_SECONDS,
  );
```

`project-thumbnail.ts` — three sites:
```ts
// line 111
  if (activeCaptures >= getSettingSync("runtime.thumbnail_concurrency", 1)) {

// line 180
    getSettingSync("runtime.thumbnail_timeout_ms", 15_000),

// isCaptureEnabled
function isCaptureEnabled() {
  return getSettingSync("feature.thumbnail_capture_enabled", true);
}
```

`build-worker.ts:124`:
```ts
function getBuildConcurrencyLimit() {
  const parsed = getSettingSync("runtime.build_concurrency", 1);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}
```

`runtime-supervisor.ts:196`: replace
`process.env.PROJECT_RUNTIME_MAX_CONTAINERS || DEFAULT_MAX_CONTAINERS` with
`getSettingSync("runtime.max_containers", DEFAULT_MAX_CONTAINERS)`.

- [ ] **Step 7: Run tests to verify they pass**

Run: `bun run test src/lib/projects/runtime-network.test.ts src/lib/projects/generated-resource-budget.test.ts src/lib/app-settings-registry.test.ts`
Expected: PASS

- [ ] **Step 8: Run the broader projects suite**

Run: `bun run test src/lib/projects`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/lib/app-settings-registry.ts src/lib/projects/
git commit -m "feat(settings): add runtime and limits categories, wire DB-first reads"
```

---

### Task 9: Admin UI — tier split, disclosure, restart badge

**Files:**
- Modify: `src/routes/_main.admin.settings.tsx`
- Modify: `src/routes/-_main.admin.settings.helpers.ts` (exists — holds `getDirtyKeys`/`isDirtyEntry` from the shipped dirty-save feature)
- Modify: `src/routes/-_main.admin.settings.helpers.test.ts` (exists)
- Create: `src/components/admin/AdvancedSettingsDisclosure.tsx`
- Create: `src/components/admin/AdvancedSettingsDisclosure.stories.tsx`

**Interfaces:**
- Consumes: GET response fields `tier`, `min`, `max`, `requiresRestart` from Task 5; `CATEGORY_ORDER`, `CATEGORY_TIER` from Task 1
- Produces: `groupByTier(entries): { basic: CategoryGroup[]; advanced: CategoryGroup[] }` where `CategoryGroup = { category: SettingCategory; entries: SettingEntry[] }`

**CRITICAL — this file already exists and is in use.** The leading `-` is
TanStack Router's convention for excluding a file from route generation; keep
it. `src/routes/_main.admin.settings.tsx:7-9` already imports `getDirtyKeys`
from it, and that dirty-save behaviour must keep working. You are **extending**
this file and its existing `SettingEntry` type — do not create a second
`SettingEntry`, and do not create an unprefixed `_main.admin.settings.helpers.ts`.

- [ ] **Step 1: Write the failing test**

Append to the existing `src/routes/-_main.admin.settings.helpers.test.ts`
(keep the existing `getDirtyKeys` tests untouched):

```ts
import { groupByTier } from "./-_main.admin.settings.helpers";

import type { SettingEntry } from "./-_main.admin.settings.helpers";

const entry = (
  key: string,
  category: SettingEntry["category"],
  tier: SettingEntry["tier"],
): SettingEntry => ({
  category,
  dbValue: null,
  effectiveValue: 1,
  env: null,
  fallback: 1,
  key,
  label: key,
  max: null,
  min: null,
  requiresRestart: false,
  source: "fallback",
  tier,
  type: "number",
});

describe("groupByTier", () => {
  it("splits entries into basic and advanced buckets", () => {
    const result = groupByTier([
      entry("a", "ai", "advanced"),
      entry("b", "feature_flag", "basic"),
    ]);
    expect(result.basic.map((g) => g.category)).toEqual(["feature_flag"]);
    expect(result.advanced.map((g) => g.category)).toEqual(["ai"]);
  });

  it("orders categories by CATEGORY_ORDER, not input order", () => {
    const result = groupByTier([
      entry("a", "booster", "basic"),
      entry("b", "feature_flag", "basic"),
      entry("c", "economics", "basic"),
    ]);
    expect(result.basic.map((g) => g.category)).toEqual([
      "feature_flag",
      "economics",
      "booster",
    ]);
  });

  it("omits categories that have no entries", () => {
    const result = groupByTier([entry("a", "ai", "advanced")]);
    expect(result.basic).toEqual([]);
    expect(result.advanced).toHaveLength(1);
  });

  it("returns empty buckets for empty input", () => {
    expect(groupByTier([])).toEqual({ advanced: [], basic: [] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/routes/-_main.admin.settings.helpers.test.ts`
Expected: FAIL — `groupByTier` is not exported.

- [ ] **Step 3: Extend the helper**

In the existing `src/routes/-_main.admin.settings.helpers.ts`, widen the
`SettingEntry` type already declared there (do not add a second one) and append
`groupByTier`. `getDirtyKeys` and `isDirtyEntry` stay exactly as they are —
widening `SettingEntry` does not change their behaviour.

```ts
import {
  CATEGORY_ORDER,
  type SettingCategory,
  type SettingTier,
  type SettingType,
} from "@/lib/config/app-settings-registry";

export type SettingEntry = {
  category: SettingCategory;
  dbValue: unknown;
  effectiveValue: unknown;
  env: null | string;
  fallback: boolean | number | string;
  key: string;
  label: string;
  max: null | number;
  min: null | number;
  requiresRestart: boolean;
  source: string;
  tier: SettingTier;
  type: SettingType;
};

export type CategoryGroup = {
  category: SettingCategory;
  entries: SettingEntry[];
};

export function groupByTier(entries: SettingEntry[]): {
  advanced: CategoryGroup[];
  basic: CategoryGroup[];
} {
  const build = (tier: SettingTier): CategoryGroup[] =>
    CATEGORY_ORDER.map((category) => ({
      category,
      entries: entries.filter(
        (e) => e.category === category && e.tier === tier,
      ),
    })).filter((group) => group.entries.length > 0);

  return { advanced: build("advanced"), basic: build("basic") };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test src/routes/-_main.admin.settings.helpers.test.ts`
Expected: PASS — both the pre-existing `getDirtyKeys` tests and the new
`groupByTier` tests.

- [ ] **Step 5: Build the disclosure component**

Create `src/components/admin/AdvancedSettingsDisclosure.tsx`:

```tsx
import { useState, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  count: number;
};

// Collapsed on every load, deliberately not persisted: an admin opening this
// page to flip a feature flag should see a short page.
export function AdvancedSettingsDisclosure({ children, count }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <section>
      <button
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-radius-md border border-surface-warm-white/12 bg-surface-warm-white/5 p-spacing-3 text-sm text-surface-warm-white"
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        <span>Konfigurasi lanjutan ({count} pengaturan)</span>
        <span aria-hidden="true">{open ? "Sembunyikan" : "Tampilkan"}</span>
      </button>
      {open ? (
        <div className="mt-spacing-4 flex flex-col gap-spacing-6">
          {children}
        </div>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 6: Write the Storybook story**

Create `src/components/admin/AdvancedSettingsDisclosure.stories.tsx`:

```tsx
import { AdvancedSettingsDisclosure } from "./AdvancedSettingsDisclosure";

import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  component: AdvancedSettingsDisclosure,
  title: "Admin/AdvancedSettingsDisclosure",
} satisfies Meta<typeof AdvancedSettingsDisclosure>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Collapsed: Story = {
  args: {
    children: <p className="text-sm text-surface-warm-white">Isi lanjutan.</p>,
    count: 38,
  },
};
```

- [ ] **Step 7: Wire the settings page**

In `src/routes/_main.admin.settings.tsx`: delete the `categories` array and add
`groupByTier` to the existing import from `./-_main.admin.settings.helpers`
(the file already imports `getDirtyKeys` from there — extend that import, do not
add a second one). Extract the existing per-category `<section>` JSX into a
local `CategorySection` component taking `{ group, draft, setDraft, onSave }`,
preserving the current dirty-aware Save and per-category Reset behaviour, then
render:

```tsx
  const groups = groupByTier(data?.entries ?? []);
  const advancedCount = groups.advanced.reduce(
    (sum, g) => sum + g.entries.length,
    0,
  );

  return (
    <div className="flex flex-col gap-spacing-6">
      {groups.basic.map((group) => (
        <CategorySection key={group.category} group={group} /* … */ />
      ))}
      {advancedCount > 0 ? (
        <AdvancedSettingsDisclosure count={advancedCount}>
          {groups.advanced.map((group) => (
            <CategorySection key={group.category} group={group} /* … */ />
          ))}
        </AdvancedSettingsDisclosure>
      ) : null}
    </div>
  );
```

In the per-entry row, add the restart badge next to the label and bounds to the
numeric input:

```tsx
                    <p>
                      {entry.label}
                      {entry.requiresRestart ? (
                        <span className="ml-spacing-2 rounded-radius-sm bg-surface-warm-white/15 px-spacing-2 py-spacing-1 text-xs text-surface-warm-white/80">
                          perlu restart
                        </span>
                      ) : null}
                    </p>
```

```tsx
                      max={entry.max ?? undefined}
                      min={entry.min ?? undefined}
```

- [ ] **Step 8: Verify in the browser**

Run: `bun run dev`
Open `http://localhost:3000/admin/settings` as an allowlisted admin.
Expected: three expanded basic sections (`feature_flag`, `economics`,
`booster`); one collapsed "Konfigurasi lanjutan (38 pengaturan)" row; expanding
it reveals `ai`, `rate_limit`, `runtime`, `limits`; `runtime.build_concurrency`
shows a `perlu restart` badge.

Stop the dev server.

- [ ] **Step 9: Run Storybook tests**

Run: `bun run test:storybook`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add src/routes/_main.admin.settings.tsx src/routes/-_main.admin.settings.helpers.ts src/routes/-_main.admin.settings.helpers.test.ts src/components/admin/AdvancedSettingsDisclosure.tsx src/components/admin/AdvancedSettingsDisclosure.stories.tsx
git commit -m "feat(settings): split admin settings into basic and advanced tiers"
```

---

### Task 10: Docs, env drift, and final gate

**Files:**
- Modify: `.env.example:100,105`
- Modify: `docs/architecture.md`

**Interfaces:**
- Consumes: everything above
- Produces: a clean `bun run check`

- [ ] **Step 1: Fix the two drifted defaults**

In `.env.example`, change `AI_AGENT_GENERATE_MAX_STEPS="12"` to `"30"` and
`PROJECT_LIMIT="3"` to `"5"`, matching the code defaults that actually run when
the vars are unset (`ai-agent-steps.ts:14`, `user-credits.ts:31`).

Add a note above the `RATE_LIMIT_*` block:

```
# Values below are also editable at /admin/settings. The DB value wins; these
# are the boot-time floor used when no AppSetting row exists.
```

- [ ] **Step 2: Document the contract in `docs/architecture.md`**

Add a subsection under the configuration/boundaries area:

```markdown
### Configuration resolution

Non-secret config resolves DB-first:

    getSetting (async)  : TTL cache → AppSetting → snapshot → .env → fallback
    getSettingSync      : TTL cache → snapshot → fallback

`src/lib/app-settings-registry.ts` is the single source of truth: each entry
declares its `key`, `env` name, type, bounds, and tier. Nothing derives an env
name by string transformation.

`primeSettingCache()` loads every `AppSetting` row into a **no-TTL snapshot**,
awaited in `src/start.ts` middleware before any handler runs. This is what lets
consumers stay synchronous while still honouring admin edits — without it, the
5s TTL would expire and sync reads would silently revert to `.env`.

Bounds are enforced twice: on write by `validateSettingValue` in
`src/routes/api.admin.settings.ts`, and on read by each consumer's existing
clamp.

Secrets, security boundaries (`ADMIN_EMAILS`, `PROJECT_RUNTIME_ALLOWED_HOSTS`),
and boot-time topology (providers, paths, endpoints) stay `.env`-only and are
deliberately absent from the registry.
```

- [ ] **Step 3: Run the full gate**

Run: `bun run check`
Expected: PASS — format, lint, typecheck, affected tests, Knip all clean.

If Knip flags `PROJECT_LIMIT_DEFAULT` or any now-unused export, delete the
export rather than suppressing the warning.

- [ ] **Step 4: Verify the end-to-end override**

Run: `bun run dev`, open `/admin/settings`, set **Batas proyek per pengguna** to
`7`, save, then reload the homepage and confirm the project limit reflects `7`
while `.env` still says `PROJECT_LIMIT="5"`.

Expected: the DB value wins. This is the single behaviour the whole plan exists
to guarantee.

Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add .env.example docs/architecture.md
git commit -m "docs(settings): document DB-first resolution and align env defaults"
```

---

## Verification checklist

Before declaring the work complete, confirm each with actual command output:

- [ ] `bun run check` passes
- [ ] `bun run test` passes in full
- [ ] `bun run test:storybook` passes
- [ ] `/admin/settings` renders three basic sections plus a collapsed advanced disclosure
- [ ] A DB value set through the UI beats the corresponding `.env` value after a reload
- [ ] An out-of-range value is rejected with an Indonesian 400 message
- [ ] No secret appears in any tracked file or log line

## Known follow-ups (out of scope)

- `2026-07-28-admin-settings-dirty-sync-design.md` — dirty-aware save, still unimplemented.
- `DISCUSS_ONE_CALL_TOOLS` (`.env.example:111`) has no consumer in `src/`; dead var, left in place.
- `EnergyBoosterModal` displays hardcoded `BOOSTER_PACKS` prices rather than DB-effective ones (`pakasir.ts:13-15` documents this).
