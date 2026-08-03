# Per-Action AI Models Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route moderation, discuss, and build/edit through separate configurable 9Router model ids (admin dropdown + env), with global default and hard fallback `default-combo`.

**Architecture:** Extend `ai-models.ts` with task getters that resolve setting → env → default → hardcode. Register three new AI settings plus `optionsSource: "nine_router_models"` on all four model keys. Fetch combo/model ids via OpenAI-compatible `GET {NINE_ROUTER_BASE_URL}/models` for admin-only dropdowns on `/admin/settings`. Rewire call sites to the correct getter; edit shares build; compaction shares moderation.

**Tech Stack:** Bun, Vitest, TanStack Router API routes, TanStack Query, existing `app-settings` / `getSettingSync`, 9Router OpenAI-compatible API.

**Spec:** `docs/superpowers/specs/2026-08-03-per-action-ai-models-design.md`

## Global Constraints

- User-facing UI copy Indonesian; code/docs/logs English.
- Surgical edits only; no unrelated refactors.
- No new npm dependencies.
- Secrets (`NINE_ROUTER_API_KEY`, etc.) stay env-only — never in `APP_SETTINGS`.
- Empty task setting/env = fall through (never send `""` as model id).
- PUT validation must NOT require value ∈ live 9Router list (offline/stale save OK).
- Bun only. Pre-commit: `bun run check:commit`. Before handoff: `bun run check`.
- Do not commit unless asked.

## File structure

| File | Role |
|------|------|
| `src/lib/ai-models.ts` | Resolve helper + `getModerationModel` / `getDiscussModel` / improved `getGenerationModel` |
| `src/lib/ai-models.test.ts` | Resolve-order tests |
| `src/lib/app-settings-registry.ts` | Three new settings + `optionsSource` on four model keys |
| `src/lib/app-settings-registry.test.ts` | Env maps + optionsSource assertions |
| `src/lib/nine-router-models.ts` | `listNineRouterModels()` + TTL cache |
| `src/lib/nine-router-models.test.ts` | Parse / empty-on-error / cache tests |
| `src/routes/api.admin.ai-models.ts` | Admin GET list |
| `src/routes/-api.admin.ai-models.test.ts` | Auth + response shape (if route tests exist nearby) |
| `src/routes/api.admin.settings.ts` | Include `optionsSource` on GET entries |
| `src/routes/-_main.admin.settings.helpers.ts` | `SettingEntry.optionsSource` type |
| `src/routes/_main.admin.settings.tsx` | Dropdown UI for model keys |
| Call sites | moderation, discuss, compaction, edit → correct getters |
| `DEV.md` | Short ops note |

---

### Task 1: Registry — model settings + optionsSource

**Files:**
- Modify: `src/lib/app-settings-registry.ts`
- Modify: `src/lib/app-settings-registry.test.ts`

**Interfaces:**
- Produces on `ConfigEntry`:
  ```ts
  optionsSource?: "nine_router_models";
  ```
- Produces keys:
  - `ai.model.moderation` → env `AI_MODEL_MODERATION`, fallback `""`
  - `ai.model.discuss` → env `AI_MODEL_DISCUSS`, fallback `""`
  - `ai.model.build` → env `AI_MODEL_BUILD`, fallback `""`
- Marks `optionsSource: "nine_router_models"` on those three plus existing `ai.models_default`

- [ ] **Step 1: Write failing registry tests**

```ts
// append to src/lib/app-settings-registry.test.ts
it("maps ai.model.moderation to AI_MODEL_MODERATION", () => {
  expect(APP_SETTINGS.find((e) => e.key === "ai.model.moderation")?.env).toBe(
    "AI_MODEL_MODERATION",
  );
});

it("maps ai.model.discuss to AI_MODEL_DISCUSS", () => {
  expect(APP_SETTINGS.find((e) => e.key === "ai.model.discuss")?.env).toBe(
    "AI_MODEL_DISCUSS",
  );
});

it("maps ai.model.build to AI_MODEL_BUILD", () => {
  expect(APP_SETTINGS.find((e) => e.key === "ai.model.build")?.env).toBe(
    "AI_MODEL_BUILD",
  );
});

it("marks four model keys with nine_router_models optionsSource", () => {
  for (const key of [
    "ai.models_default",
    "ai.model.moderation",
    "ai.model.discuss",
    "ai.model.build",
  ]) {
    expect(APP_SETTINGS.find((e) => e.key === key)?.optionsSource).toBe(
      "nine_router_models",
    );
  }
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
bun test src/lib/app-settings-registry.test.ts
```

- [ ] **Step 3: Extend ConfigEntry + APP_SETTINGS**

In `ConfigEntry` type, add optional:

```ts
// When set, /admin/settings renders a select populated from this source
// instead of a free-text input. Values remain plain strings in DB.
optionsSource?: "nine_router_models";
```

Update existing `ai.models_default` entry to include `optionsSource: "nine_router_models"`.

After `ai.models_default` (or in the `ai` block), add:

```ts
{
  key: "ai.model.moderation",
  category: "ai",
  tier: "advanced",
  type: "string",
  label: "AI — moderation model id",
  fallback: "",
  env: "AI_MODEL_MODERATION",
  optionsSource: "nine_router_models",
},
{
  key: "ai.model.discuss",
  category: "ai",
  tier: "advanced",
  type: "string",
  label: "AI — discuss model id",
  fallback: "",
  env: "AI_MODEL_DISCUSS",
  optionsSource: "nine_router_models",
},
{
  key: "ai.model.build",
  category: "ai",
  tier: "advanced",
  type: "string",
  label: "AI — build/edit model id",
  fallback: "",
  env: "AI_MODEL_BUILD",
  optionsSource: "nine_router_models",
},
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
bun test src/lib/app-settings-registry.test.ts
```

- [ ] **Step 5: Commit** (only if user asked)

```bash
git add src/lib/app-settings-registry.ts src/lib/app-settings-registry.test.ts
git commit -m "feat(ai): register per-action model settings"
```

---

### Task 2: Task model resolvers (`ai-models.ts`)

**Files:**
- Modify: `src/lib/ai-models.ts`
- Modify: `src/lib/ai-models.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const DEFAULT_AI_MODEL = "default-combo";
  export function getDefaultAiModel(rawModels?: string): string;
  export function getModerationModel(): string;
  export function getDiscussModel(): string;
  export function getGenerationModel(): string; // build + edit
  ```
- Resolve order (task): setting → env(s) → `getDefaultAiModel()`
- Resolve order (default): setting / `AI_MODELS` → `DEFAULT_AI_MODEL`
- Empty/whitespace task values = unset

- [ ] **Step 1: Write failing tests**

Extend `src/lib/ai-models.test.ts` (reuse existing prisma mock + cache prime pattern from `getDefaultAiModel DB-first`):

```ts
import {
  DEFAULT_AI_MODEL,
  getDefaultAiModel,
  getDiscussModel,
  getGenerationModel,
  getModerationModel,
} from "./ai-models";

describe("task model getters", () => {
  afterEach(async () => {
    invalidateSettingCache();
    delete process.env.AI_MODELS;
    delete process.env.AI_MODEL_MODERATION;
    delete process.env.AI_MODEL_DISCUSS;
    delete process.env.AI_MODEL_BUILD;
    delete process.env.AI_GENERATION_MODEL;
    const { prisma } = await import("@/lib/prisma");
    for (const key of [
      "ai.models_default",
      "ai.model.moderation",
      "ai.model.discuss",
      "ai.model.build",
    ]) {
      await prisma.appSetting.delete({ where: { key } }).catch(() => {});
    }
  });

  it("falls through empty task to default then hardcode", async () => {
    invalidateSettingCache();
    const { primeSettingCache } = await import("@/lib/app-settings");
    await primeSettingCache();
    expect(getModerationModel()).toBe(DEFAULT_AI_MODEL);
    expect(getDiscussModel()).toBe(DEFAULT_AI_MODEL);
    expect(getGenerationModel()).toBe(DEFAULT_AI_MODEL);
  });

  it("prefers task env over default", async () => {
    process.env.AI_MODELS = "default-combo";
    process.env.AI_MODEL_MODERATION = "mod-combo";
    invalidateSettingCache();
    const { primeSettingCache } = await import("@/lib/app-settings");
    await primeSettingCache();
    expect(getModerationModel()).toBe("mod-combo");
    expect(getDiscussModel()).toBe("default-combo");
  });

  it("prefers task DB over task env", async () => {
    const { prisma } = await import("@/lib/prisma");
    await prisma.appSetting.upsert({
      where: { key: "ai.model.discuss" },
      create: {
        key: "ai.model.discuss",
        category: "ai",
        value: "discuss-db",
      },
      update: { value: "discuss-db" },
    });
    process.env.AI_MODEL_DISCUSS = "discuss-env";
    invalidateSettingCache();
    const { primeSettingCache } = await import("@/lib/app-settings");
    await primeSettingCache();
    expect(getDiscussModel()).toBe("discuss-db");
  });

  it("build prefers AI_MODEL_BUILD then AI_GENERATION_MODEL", async () => {
    process.env.AI_GENERATION_MODEL = "legacy-gen";
    invalidateSettingCache();
    const { primeSettingCache } = await import("@/lib/app-settings");
    await primeSettingCache();
    expect(getGenerationModel()).toBe("legacy-gen");

    process.env.AI_MODEL_BUILD = "build-new";
    expect(getGenerationModel()).toBe("build-new");
  });

  it("treats whitespace task value as unset", async () => {
    process.env.AI_MODEL_MODERATION = "   ";
    process.env.AI_MODELS = "default-combo";
    invalidateSettingCache();
    const { primeSettingCache } = await import("@/lib/app-settings");
    await primeSettingCache();
    expect(getModerationModel()).toBe("default-combo");
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
bun test src/lib/ai-models.test.ts
```

- [ ] **Step 3: Implement resolvers**

Replace `src/lib/ai-models.ts` with:

```ts
import { getSettingSync } from "@/lib/app-settings";

export const DEFAULT_AI_MODEL = "default-combo";

function readSettingString(key: string): string | undefined {
  const raw = (
    getSettingSync as unknown as (
      k: string,
      fallback: undefined,
    ) => string | undefined
  )(key, undefined);
  if (typeof raw !== "string") {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed ? trimmed : undefined;
}

function firstCsvModel(raw: string | undefined): string | undefined {
  if (!raw) {
    return undefined;
  }
  const models = raw
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);
  return models[0];
}

export function getDefaultAiModel(
  rawModels = readSettingString("ai.models_default") || process.env.AI_MODELS,
) {
  return firstCsvModel(rawModels) || DEFAULT_AI_MODEL;
}

function resolveTaskModel(settingKey: string, envKeys: string[]): string {
  const fromSetting = readSettingString(settingKey);
  if (fromSetting) {
    return fromSetting;
  }
  for (const envKey of envKeys) {
    const fromEnv = process.env[envKey]?.trim();
    if (fromEnv) {
      return fromEnv;
    }
  }
  return getDefaultAiModel();
}

export function getModerationModel() {
  return resolveTaskModel("ai.model.moderation", ["AI_MODEL_MODERATION"]);
}

export function getDiscussModel() {
  return resolveTaskModel("ai.model.discuss", ["AI_MODEL_DISCUSS"]);
}

/** Build pipeline + edit agent. */
export function getGenerationModel() {
  return resolveTaskModel("ai.model.build", [
    "AI_MODEL_BUILD",
    "AI_GENERATION_MODEL",
  ]);
}
```

Keep the cast pattern for `getSettingSync` consistent with existing file if `getSettingSync` typing differs — match surrounding app-settings usage.

- [ ] **Step 4: Run tests — expect PASS**

```bash
bun test src/lib/ai-models.test.ts
```

- [ ] **Step 5: Commit** (if asked)

```bash
git add src/lib/ai-models.ts src/lib/ai-models.test.ts
git commit -m "feat(ai): per-action model resolvers"
```

---

### Task 3: List 9Router models helper

**Files:**
- Create: `src/lib/nine-router-models.ts`
- Create: `src/lib/nine-router-models.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function listNineRouterModels(): Promise<string[]>;
  export function resetNineRouterModelsCacheForTests(): void; // test only
  ```

- [ ] **Step 1: Write failing tests**

```ts
// src/lib/nine-router-models.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  listNineRouterModels,
  resetNineRouterModelsCacheForTests,
} from "./nine-router-models";

describe("listNineRouterModels", () => {
  afterEach(() => {
    resetNineRouterModelsCacheForTests();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.NINE_ROUTER_BASE_URL;
    delete process.env.NINE_ROUTER_API_KEY;
  });

  it("returns sorted unique ids from OpenAI-style list", async () => {
    process.env.NINE_ROUTER_BASE_URL = "http://9router.test/v1";
    process.env.NINE_ROUTER_API_KEY = "key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          data: [
            { id: "z-model" },
            { id: "a-combo" },
            { id: "a-combo" },
            { id: "  " },
            {},
          ],
        }),
      ),
    );
    await expect(listNineRouterModels()).resolves.toEqual([
      "a-combo",
      "z-model",
    ]);
    expect(fetch).toHaveBeenCalledWith(
      "http://9router.test/v1/models",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer key",
        }),
      }),
    );
  });

  it("returns empty array when env missing or fetch fails", async () => {
    await expect(listNineRouterModels()).resolves.toEqual([]);
    process.env.NINE_ROUTER_BASE_URL = "http://9router.test/v1";
    process.env.NINE_ROUTER_API_KEY = "key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 500 })),
    );
    await expect(listNineRouterModels()).resolves.toEqual([]);
  });

  it("caches results within TTL", async () => {
    process.env.NINE_ROUTER_BASE_URL = "http://9router.test/v1";
    process.env.NINE_ROUTER_API_KEY = "key";
    const fetchMock = vi.fn(async () =>
      Response.json({ data: [{ id: "one" }] }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await listNineRouterModels();
    await listNineRouterModels();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
bun test src/lib/nine-router-models.test.ts
```

- [ ] **Step 3: Implement helper**

```ts
// src/lib/nine-router-models.ts
import { getEnv } from "@/lib/config";

const CACHE_TTL_MS = 60_000;
const FETCH_TIMEOUT_MS = 8_000;

let cache: { expiresAt: number; models: string[] } | null = null;

export function resetNineRouterModelsCacheForTests() {
  cache = null;
}

export async function listNineRouterModels(): Promise<string[]> {
  if (cache && cache.expiresAt > Date.now()) {
    return cache.models;
  }

  const baseURL = getEnv("NINE_ROUTER_BASE_URL").replace(/\/+$/, "");
  const apiKey = getEnv("NINE_ROUTER_API_KEY");
  if (!baseURL || !apiKey) {
    return [];
  }

  const url = `${baseURL}/models`;
  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      return [];
    }
    const body = (await response.json()) as {
      data?: Array<{ id?: unknown }>;
    };
    const models = [
      ...new Set(
        (body.data ?? [])
          .map((row) => (typeof row.id === "string" ? row.id.trim() : ""))
          .filter(Boolean),
      ),
    ].sort((a, b) => a.localeCompare(b));

    cache = { models, expiresAt: Date.now() + CACHE_TTL_MS };
    return models;
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
bun test src/lib/nine-router-models.test.ts
```

- [ ] **Step 5: Commit** (if asked)

```bash
git add src/lib/nine-router-models.ts src/lib/nine-router-models.test.ts
git commit -m "feat(ai): list models from 9Router /models"
```

---

### Task 4: Admin API `GET /api/admin/ai-models`

**Files:**
- Create: `src/routes/api.admin.ai-models.ts`
- Create or extend: `src/routes/-api.admin.ai-models.test.ts` (mirror nearby admin route tests)

**Interfaces:**
- `GET` → `{ models: string[] }` after `requireAdmin()`
- Non-admin → same status/message pattern as `api.admin.settings.ts`

- [ ] **Step 1: Implement route**

```ts
// src/routes/api.admin.ai-models.ts
import { createFileRoute } from "@tanstack/react-router";

import { requireAdmin } from "@/lib/auth-admin";
import { listNineRouterModels } from "@/lib/nine-router-models";

export const Route = createFileRoute("/api/admin/ai-models")({
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
        const models = await listNineRouterModels();
        return Response.json({ models });
      },
    },
  },
});
```

After adding the route file, regenerate route tree if the project requires it (`bun run` script that `verify` uses — typically automatic on dev/verify). Do not invent a new regen command; use whatever `package.json` already uses (often part of `bun run verify` or a `tsr` script).

- [ ] **Step 2: Add a focused test** if admin API tests mock `requireAdmin` nearby — copy that pattern; assert 401/403 path and 200 `{ models: [...] }` with `listNineRouterModels` mocked. If no clean pattern, skip route test and rely on helper unit tests + manual smoke.

- [ ] **Step 3: Commit** (if asked)

```bash
git add src/routes/api.admin.ai-models.ts src/routes/-api.admin.ai-models.test.ts src/routeTree.gen.ts
git commit -m "feat(admin): GET /api/admin/ai-models"
```

---

### Task 5: Settings API + admin UI dropdown

**Files:**
- Modify: `src/routes/api.admin.settings.ts` — include `optionsSource` on GET entries
- Modify: `src/routes/-_main.admin.settings.helpers.ts` — type field
- Modify: `src/routes/_main.admin.settings.tsx` — select UI + fetch models

**Interfaces:**
- GET entry gains `optionsSource: "nine_router_models" | null`
- UI: for those entries, `<select>` not free text

- [ ] **Step 1: Pass optionsSource from settings GET**

In `api.admin.settings.ts` entry map, add:

```ts
optionsSource: e.optionsSource ?? null,
```

- [ ] **Step 2: Widen `SettingEntry`**

```ts
// -_main.admin.settings.helpers.ts
optionsSource: "nine_router_models" | null;
```

- [ ] **Step 3: Settings page — load models + render select**

In `_main.admin.settings.tsx`:

1. Query models:

```ts
const modelsQuery = useQuery({
  queryKey: ["admin", "ai-models"],
  queryFn: () =>
    fetchJson<{ models: string[] }>("/api/admin/ai-models"),
  staleTime: 60_000,
});
const modelIds = modelsQuery.data?.models ?? [];
```

2. Replace the final `else` string branch with:

```tsx
) : entry.optionsSource === "nine_router_models" ? (
  <div className="flex flex-col items-end gap-spacing-1">
    <select
      className="max-w-xs rounded-radius-md border border-surface-warm-white/15 bg-surface-warm-white/5 px-spacing-2 py-spacing-1 text-sm text-surface-warm-white"
      disabled={isPending}
      onChange={(e) =>
        setDraft({ ...draft, [entry.key]: e.target.value })
      }
      value={String(value ?? "")}
    >
      {entry.key !== "ai.models_default" ? (
        <option value="">(pakai default)</option>
      ) : null}
      {(() => {
        const current = String(value ?? "");
        const ids = [...modelIds];
        if (current && !ids.includes(current)) {
          ids.unshift(current);
        }
        if (
          entry.key === "ai.models_default" &&
          !ids.includes("default-combo")
        ) {
          ids.push("default-combo");
        }
        return ids.map((id) => (
          <option key={id} value={id}>
            {id}
          </option>
        ));
      })()}
    </select>
    {String(value ?? "") &&
    modelIds.length > 0 &&
    !modelIds.includes(String(value)) ? (
      <p className="text-xs text-amber-200/90">
        Tidak ada di daftar 9Router
      </p>
    ) : null}
    {modelsQuery.isError ||
    (modelsQuery.isSuccess && modelIds.length === 0) ? (
      <p className="text-xs text-surface-warm-white/60">
        Daftar model 9Router kosong / gagal dimuat
      </p>
    ) : null}
  </div>
) : (
  // existing free-text input for other strings
  ...
)
```

Match existing class names / spacing tokens in the file; do not invent a new design language.

- [ ] **Step 4: Smoke-check types**

```bash
bun test src/lib/app-settings-registry.test.ts src/lib/ai-models.test.ts src/lib/nine-router-models.test.ts
```

- [ ] **Step 5: Commit** (if asked)

```bash
git add src/routes/api.admin.settings.ts src/routes/-_main.admin.settings.helpers.ts src/routes/_main.admin.settings.tsx
git commit -m "feat(admin): model dropdowns from 9Router"
```

---

### Task 6: Rewire AI call sites

**Files:**
- Modify: `src/lib/ai-moderation.ts` — `getModerationModel()`
- Modify: `src/lib/projects/chat-compaction.ts` — `getAiModel(getModerationModel())`
- Modify: `src/lib/projects/discuss-turn-worker.ts` — `getDiscussModel()`
- Modify: `src/routes/api.projects.preview.ts` — discuss `modelName` + moderation fallbacks
- Modify: `src/lib/projects/source-edit-agent.ts` — `getGenerationModel()`
- Modify: `src/lib/projects/edit-attempt-worker.ts` — `getGenerationModel()`
- Modify: `src/routes/api.moderation.project-request.ts` — drop hardcode fallback
- Modify: `src/routes/api.projects.moderate.ts` — drop hardcode fallback
- Modify: `src/routes/api.projects.ts` — moderation / any default model usage
- Update mocks in tests that break (`ai-moderation.test.ts`, discuss/edit mocks)

**Do not change:** `discuss-turn-shared` (inherits model); build workers already use `getGenerationModel()`.

- [ ] **Step 1: Moderation**

```ts
// ai-moderation.ts — replace getDefaultAiModel with getModerationModel
import { getModerationModel } from "@/lib/ai-models";
// devLog model, getAiModel(...), telemetry model, result fallback modelId
```

- [ ] **Step 2: Compaction**

```ts
import { getModerationModel } from "@/lib/ai-models";
// model: getAiModel(getModerationModel()),
```

- [ ] **Step 3: Discuss**

```ts
// discuss-turn-worker.ts
import { getDiscussModel } from "@/lib/ai-models";
const modelName = getDiscussModel();
```

In `api.projects.preview.ts`, any discuss path that still calls `getDefaultAiModel()` for the discuss turn must use `getDiscussModel()`. Moderation `modelId` fallbacks: `moderation.modelId || getModerationModel()`.

- [ ] **Step 4: Edit → build model**

```ts
// source-edit-agent.ts + edit-attempt-worker.ts
import { getGenerationModel } from "@/lib/ai-models";
// replace getDefaultAiModel() defaults with getGenerationModel()
```

- [ ] **Step 5: Hardcoded `"default-combo"` fallbacks in routes**

```ts
// api.moderation.project-request.ts, api.projects.moderate.ts, api.projects.ts
modelId: result.modelId || getModerationModel(),
// or DEFAULT_AI_MODEL if only a last-resort string is needed without importing getter
```

Prefer getters over reintroducing the magic string.

- [ ] **Step 6: Fix unit tests/mocks**

Update `src/lib/ai-moderation.test.ts` and any file that mocks `@/lib/ai-models` to export the new getters used by production code:

```ts
vi.mock("@/lib/ai-models", () => ({
  DEFAULT_AI_MODEL: "default-combo",
  getDefaultAiModel: vi.fn(() => "default-combo"),
  getModerationModel: vi.fn(() => "default-combo"),
  getDiscussModel: vi.fn(() => "default-combo"),
  getGenerationModel: vi.fn(() => "default-combo"),
}));
```

- [ ] **Step 7: Run focused tests**

```bash
bun test src/lib/ai-models.test.ts src/lib/ai-moderation.test.ts src/lib/projects/discuss-turn-worker.test.ts
```

Fix failures until green.

- [ ] **Step 8: Commit** (if asked)

```bash
git add src/lib/ai-moderation.ts src/lib/projects/chat-compaction.ts src/lib/projects/discuss-turn-worker.ts src/routes/api.projects.preview.ts src/lib/projects/source-edit-agent.ts src/lib/projects/edit-attempt-worker.ts src/routes/api.moderation.project-request.ts src/routes/api.projects.moderate.ts src/routes/api.projects.ts src/lib/ai-moderation.test.ts
git commit -m "feat(ai): wire call sites to per-action models"
```

---

### Task 7: Docs + quality gate

**Files:**
- Modify: `DEV.md` (short AI models subsection)

- [ ] **Step 1: Document ops contract in DEV.md**

Add a short subsection under AI / infra (English):

```markdown
### Per-action AI models

Task model ids (9Router labels) are configurable in `/admin/settings` (AI advanced) and env:

| Setting | Env | Used for |
|---------|-----|----------|
| `ai.models_default` | `AI_MODELS` | Global fallback (first CSV entry) |
| `ai.model.moderation` | `AI_MODEL_MODERATION` | Safety gate + chat compaction |
| `ai.model.discuss` | `AI_MODEL_DISCUSS` | Guided discuss (+ repairs inherit) |
| `ai.model.build` | `AI_MODEL_BUILD` (alias `AI_GENERATION_MODEL`) | Build pipeline + edit agent |

Empty task value → default → hardcode `default-combo`. Admin dropdown loads `GET /api/admin/ai-models` → 9Router `GET {NINE_ROUTER_BASE_URL}/models`. Create combos in 9Router; suggested names: `moderation-combo`, `discuss-combo`, `build-combo`.
```

- [ ] **Step 2: Run check**

```bash
bun run check
```

Fix format/lint/type/test/Knip issues introduced by this work only.

- [ ] **Step 3: Commit** (if asked)

```bash
git add DEV.md
git commit -m "docs: per-action AI model knobs"
```

---

## Self-review (plan vs spec)

| Spec requirement | Task |
|------------------|------|
| 3 task knobs + default configurable | 1, 2 |
| Hard fallback `default-combo` | 2 |
| Edit shares build | 6 |
| Compaction shares moderation | 6 |
| Discuss repairs inherit | 6 (no change to shared) |
| Admin dropdown from 9Router `/models` | 3, 4, 5 |
| Empty → fallthrough day-one safe | 2 |
| No list membership required on PUT | 5 (no validation change) |
| Docs / rollout note | 7 |
| Tests for resolve + list + registry | 1–3, 6 |

**Placeholder scan:** none intentional.

**Type consistency:** `optionsSource: "nine_router_models"` used in registry, GET payload, helpers, UI.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-03-per-action-ai-models.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — this session via executing-plans, batch with checkpoints  

**Which approach?**
