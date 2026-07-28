# Admin Settings — DB-first config, full non-secret coverage

## Goal

Every non-secret configuration value in the app is editable at `/admin/settings`,
and the admin value always wins over `.env`. Today six registry keys silently
lose to env, and ~46 tunable knobs are not in the registry at all.

Resolution order becomes, without exception:

```
AppSetting (DB)  →  .env  →  hardcoded fallback
```

Secrets, credentials, and infrastructure topology stay env-only by design.

## Current state

| File | Role |
| --- | --- |
| `src/lib/app-settings-registry.ts` | `APP_SETTINGS` — 25 entries, 4 categories |
| `src/lib/app-settings.ts` | `getSetting` (async, DB-first), `getSettingSync` (cache-only), `envKeyFor`, 5s TTL cache |
| `src/routes/api.admin.settings.ts` | GET (effective values + source) / PUT (validate + upsert + invalidate) |
| `src/routes/_main.admin.settings.tsx` | Admin UI, one section per category |
| `prisma/schema.prisma:468` | `AppSetting { key, category, value, updatedAt, updatedBy }` |
| `src/start.ts` | Global request middleware — every request passes through |

## What is broken

### A. Registry keys that do not honor admin

| Key | Break site | Effect |
| --- | --- | --- |
| `ai.timeout.moderation_ms` | `ai-timeouts.ts:88` reads `getEnv` only | admin value ignored |
| `ai.timeout.discuss_ms` | same | admin value ignored |
| `ai.models_default` | `ai-models.ts:3` reads `process.env.AI_MODELS` | admin value ignored; env name does not even match the key |
| `feature.generated_build_execution` | `config.ts:24` uses `getSettingSync` | cold cache → env wins |
| `feature.generated_public_execution` | same | cold cache → env wins |
| `feature.streamer_mode` | `config.ts:58` sync variant | cold cache → fallback wins |

Root cause for the last three: `getSettingSync` (`app-settings.ts:134`) is
cache-only and the cache is never primed. On a cold process it returns the
fallback immediately, having consulted neither DB nor env. The code already
names this as a known ceiling at `app-settings.ts:130-133`.

### B. Tunable knobs absent from the registry

46 non-secret values read directly from `process.env` / `getEnv`, unreachable
from admin. Enumerated in "New registry entries" below.

### C. Infrastructure defects

1. **Two drifted env-name maps.** `app-settings.ts:29` `envKeyFor()` handles
   `ratelimit.*`; `api.admin.settings.ts:29` has its own three-key map that does
   not. The GET response therefore reports `source: "fallback"` for all ten
   `ratelimit.*` entries even when `RATE_LIMIT_*` is set — the admin UI lies
   about where the effective value came from.
2. **`envKeyFor` truncation bug.** Line 43 uses `.replace(".", "_")`, which
   replaces only the first occurrence. It works by luck for today's two-segment
   keys; any three-segment key added later silently produces a wrong env name.
3. **No clamp enforcement on write.** Consumers clamp on read
   (`ai-timeouts.ts`, `ai-agent-steps.ts`, `runtime-network.ts`,
   `generated-resource-budget.ts`, `preview-asset-token.ts`), but the PUT
   handler accepts any finite number. Opening ~60 knobs without write-side
   bounds is how an admin wedges production with a typo.

## Design

### 1. Registry schema

`ConfigEntry` gains four optional fields. `env` replaces string surgery with
data; `tier` drives the UI split; `min`/`max` drive write validation.

```ts
export type SettingTier = "basic" | "advanced";

export type ConfigEntry = {
  key: string;
  category: SettingCategory;
  type: SettingType;
  label: string;
  fallback: boolean | number | string;
  tier: SettingTier;
  env?: string;            // canonical env var name, or omitted when DB-only
  min?: number;            // inclusive, numbers only
  max?: number;            // inclusive, numbers only
  requiresRestart?: boolean;
};
```

`envKeyFor()` is deleted. Its two callers read `entry.env` from the registry
instead, which removes defect C1 and C2 at the root: one source of truth, no
string transformation.

### 2. Categories and tiers

Seven categories, rendered in this order. Basic sections render expanded;
advanced sections collapse behind a single disclosure.

| Category | Tier | Keys | Rationale |
| --- | --- | --- | --- |
| `feature_flag` | basic | 5 | daily toggles |
| `economics` | basic | 7 | pricing and limits — highest business value |
| `booster` | basic | 8 | already DB-first, already touched |
| `ai` | advanced | 15 | timeouts, step budgets, model selection |
| `rate_limit` | advanced | 10 | abuse tuning, rarely changed |
| `runtime` | advanced | 7 | build/thumbnail/preview capacity |
| `limits` | advanced | 6 | generated source/dist byte budgets |

Total: 58 entries (25 existing + 33 new).

### 3. New registry entries

Fallbacks are taken from the **code** default, not `.env.example`, wherever the
two disagree — see "Known drift" below.

#### `economics` (new category, basic)

Source: `src/lib/user-credits.ts:19-31`.

| Key | Env | Fallback | Min | Max |
| --- | --- | --- | --- | --- |
| `economics.project_limit` | `PROJECT_LIMIT` | 5 | 1 | 100 |
| `economics.daily_energy_limit` | — | 250000 | 10000 | 5000000 |
| `economics.min_energy_discuss` | — | 5000 | 0 | 100000 |
| `economics.min_energy_build` | — | 40000 | 0 | 500000 |
| `economics.min_energy_edit` | — | 10000 | 0 | 200000 |
| `economics.min_energy_moderation` | — | 500 | 0 | 50000 |
| `economics.micro_usd_per_energy` | — | 1000000 | 1000 | 100000000 |

#### `ai` (12 added to the 3 existing)

Source: `src/lib/ai-timeouts.ts:27-84`, `src/lib/ai-agent-steps.ts:12-30`,
`src/lib/ai-models.ts:16`. Min/max copied verbatim from each config block.

| Key | Env | Fallback | Min | Max |
| --- | --- | --- | --- | --- |
| `ai.timeout.discuss_card_ms` | `AI_TIMEOUT_DISCUSS_CARD_MS` | 45000 | 3000 | 120000 |
| `ai.timeout.discuss_one_call_ms` | `AI_TIMEOUT_DISCUSS_ONE_CALL_MS` | 120000 | 30000 | 240000 |
| `ai.timeout.discuss_tool_settle_ms` | `AI_TIMEOUT_DISCUSS_TOOL_SETTLE_MS` | 30000 | 30000 | 60000 |
| `ai.timeout.chat_compaction_ms` | `AI_TIMEOUT_CHAT_COMPACTION_MS` | 60000 | 30000 | 120000 |
| `ai.timeout.build_spec_ms` | `AI_TIMEOUT_BUILD_SPEC_MS` | 120000 | 30000 | 240000 |
| `ai.timeout.source_generation_ms` | `AI_TIMEOUT_SOURCE_GENERATION_MS` | 600000 | 120000 | 600000 |
| `ai.timeout.edit_ms` | `AI_TIMEOUT_EDIT_MS` | 600000 | 60000 | 600000 |
| `ai.timeout.edit_repair_ms` | `AI_TIMEOUT_EDIT_REPAIR_MS` | 300000 | 60000 | 600000 |
| `ai.agent.generate_max_steps` | `AI_AGENT_GENERATE_MAX_STEPS` | 30 | 15 | 60 |
| `ai.agent.repair_max_steps` | `AI_AGENT_REPAIR_MAX_STEPS` | 12 | 4 | 40 |
| `ai.agent.subagent_max_steps` | `AI_AGENT_SUBAGENT_MAX_STEPS` | 8 | 2 | 15 |
| `ai.generation_model` | `AI_GENERATION_MODEL` | `""` | — | — |

The two existing `ai.timeout.*` entries gain `env` + min/max from the same
source (`moderation`: 30000/60000; `discuss`: 30000/180000). `ai.models_default`
gains `env: "AI_MODELS"` — the mapping that was missing.

`ai.generation_model` empty string means "fall through to the default model",
matching `ai-models.ts:16`'s `||` semantics.

#### `runtime` (new category, advanced)

| Key | Env | Fallback | Min | Max | Restart |
| --- | --- | --- | --- | --- | --- |
| `runtime.build_concurrency` | `PROJECT_BUILD_CONCURRENCY` | 1 | 1 | 16 | yes |
| `runtime.max_containers` | `PROJECT_RUNTIME_MAX_CONTAINERS` | 8 | 1 | 64 | yes |
| `runtime.health_timeout_ms` | `PROJECT_RUNTIME_HEALTH_TIMEOUT_MS` | 2000 | 500 | 5000 | no |
| `runtime.proxy_timeout_ms` | `PROJECT_RUNTIME_PROXY_TIMEOUT_MS` | 15000 | 1000 | 30000 | no |
| `runtime.preview_token_ttl_seconds` | `PREVIEW_ASSET_TOKEN_TTL_SECONDS` | 300 | 60 | 900 | no |
| `runtime.thumbnail_concurrency` | `PROJECT_THUMBNAIL_CONCURRENCY` | 1 | 1 | 8 | no |
| `runtime.thumbnail_timeout_ms` | `PROJECT_THUMBNAIL_TIMEOUT_MS` | 15000 | 1000 | 120000 | no |

#### `limits` (new category, advanced)

Source: `src/lib/projects/generated-resource-budget.ts:6-46`, verbatim bounds.

| Key | Env | Fallback | Min | Max |
| --- | --- | --- | --- | --- |
| `limits.source.max_files` | `PROJECT_SOURCE_MAX_FILES` | 100 | 10 | 500 |
| `limits.source.max_file_bytes` | `PROJECT_SOURCE_MAX_FILE_BYTES` | 262144 | 16384 | 1048576 |
| `limits.source.max_total_bytes` | `PROJECT_SOURCE_MAX_TOTAL_BYTES` | 5242880 | 262144 | 20971520 |
| `limits.dist.max_files` | `PROJECT_DIST_MAX_FILES` | 500 | 10 | 2000 |
| `limits.dist.max_file_bytes` | `PROJECT_DIST_MAX_FILE_BYTES` | 10485760 | 65536 | 26214400 |
| `limits.dist.max_total_bytes` | `PROJECT_DIST_MAX_TOTAL_BYTES` | 52428800 | 1048576 | 209715200 |

#### `feature_flag` (1 added)

| Key | Env | Fallback |
| --- | --- | --- |
| `feature.thumbnail_capture_enabled` | `PROJECT_THUMBNAIL_CAPTURE_ENABLED` | true |

### 4. Env vars that stay env-only

Deliberately excluded. Three grounds:

**Secrets and credentials** — a web form is the wrong custody boundary, and the
repo is public so these must never round-trip through a rendered value:
`NEXTAUTH_SECRET`, `AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`NINE_ROUTER_API_KEY`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`,
`S3_ACCOUNT_ID`, `RUSTFS_ROOT_USER`, `RUSTFS_ROOT_PASSWORD`,
`POSTGRES_USER`, `POSTGRES_PASSWORD`, `TURNSTILE_SECRET_KEY`, `GITHUB_TOKEN`,
`RESEND_API_KEY`, `OTP_SPACE_API_KEY`, `PAKASIR_API_KEY`,
`PREVIEW_ASSET_TOKEN_SECRETS`, `UMAMI_ADMIN_PASSWORD`, `UMAMI_APP_SECRET`,
`CLOUDFLARE_TUNNEL_TOKEN`, `CHROMATIC_PROJECT_TOKEN`, `DATABASE_URL`.

**Security boundaries** — admin-editable would be privilege escalation:
`ADMIN_EMAILS` (an admin could grant themselves permanence, or lock everyone
out), `PROJECT_RUNTIME_ALLOWED_HOSTS` (SSRF allowlist).

**Boot-time topology and identity** — changing these mid-flight orphans data or
requires a redeploy anyway: `AI_PROVIDER`, `STORAGE_PROVIDER`,
`RATE_LIMIT_PROVIDER`, `PROJECT_RUNTIME_SUPERVISOR`, `NINE_ROUTER_BASE_URL`,
`S3_ENDPOINT`, `S3_REGION`, `S3_PUBLIC_BUCKET`, `S3_PRIVATE_BUCKET`,
`S3_PUBLIC_BASE_URL`, `RESEND_FROM_EMAIL`, `RESEND_BASE_URL`,
`PAKASIR_PROJECT_SLUG`, `PROJECT_RUNTIME_DIR`, `PROJECT_BUILD_WORKSPACE_DIR`,
`PROJECT_ARTIFACT_DIR`, `PROJECT_THUMBNAIL_BROWSER_PATH`,
`PROJECT_THUMBNAIL_NODE_PATH`, `PROJECT_BUILD_BUN_PATH`,
`GENERATED_PUBLIC_ORIGIN`, `NEXTAUTH_URL`, `NEXT_PUBLIC_*`, `UMAMI_BASE_URL`,
`APP_IMAGE_TAG`, `NODE_ENV`, `POSTGRES_DB`, `DEV_LOG_FILE`.

`WAITLIST_ENABLED`, `GENERATED_BUILD_EXECUTION_ENABLED`, and
`GENERATED_PUBLIC_EXECUTION_ENABLED` remain in `.env.example` as the boot-time
floor, but the DB overrides them — that is already their intended design.

### 5. Cache priming and the snapshot layer

`app-settings.ts` gains a second storage layer and one new export:

```ts
export async function primeSettingCache(): Promise<void>
```

**Why two layers.** The existing `cache` carries a 5s TTL. If priming wrote only
into it, every primed entry would expire five seconds after boot and
`getSettingSync` would silently resume returning the fallback — the exact defect
this spec exists to fix, merely delayed. So priming writes to a separate
`snapshot: Map<string, unknown>` that has **no TTL** and is replaced wholesale
on each prime.

Read order becomes:

| Function | Order |
| --- | --- |
| `getSetting` (async) | TTL cache → DB → snapshot → env → fallback |
| `getSettingSync` | TTL cache → snapshot → fallback |

`getSettingSync` deliberately does not consult env. The snapshot already holds
every DB row, and a key with no DB row should resolve through the async path
where env is read; adding an env read here would give sync and async callers
different answers for the same key.

`primeSettingCache` reads every `AppSetting` row in one query, coerces each
value against its registry entry's type, and skips mismatches rather than
caching them — a corrupt row must not poison a sync read.

Two properties make it safe:

- **Idempotent and single-flight.** A module-level promise guards concurrent
  callers; a second caller awaits the first's result rather than issuing a
  second query.
- **Never throws.** A DB failure leaves the snapshot at its previous contents
  (empty on first boot); every read still degrades to env → fallback exactly as
  today. Config reads must not be able to take the app down.

`invalidateSettingCache()` clears the TTL cache and marks the snapshot stale, so
the next request re-primes and admin edits take effect immediately.

**Where it runs:** `src/start.ts`'s global middleware, before the request
proceeds. Awaiting an already-resolved promise is free after the first request,
and middleware is the one place guaranteed to run in every deployment target
(dev, `bun .output/server/index.mjs`, Docker) without adding a new entrypoint.
The first request after boot pays one query.

### 6. Consumer rewiring

**Consumers stay synchronous.** With a no-TTL snapshot, `getSettingSync` is
trustworthy, so each module swaps `getEnv(name)` → `getSettingSync(key, default)`
and keeps its signature. This avoids an async cascade that would otherwise reach
`checkGeneratedApp` (`agent-tool-runner.ts:536`, sync by contract) and the
inline `timeout: getAiTimeoutMs("discussCard")` object-literal call sites in
`discuss-turn-shared.ts:161,256`.

Existing clamp logic is untouched — the clamp stays the last word on read, so a
legacy out-of-range env value behaves exactly as it does today.

| Module | Function | Change |
| --- | --- | --- |
| `ai-timeouts.ts` | `getAiTimeoutMs` | add `key` to each config block; `getEnv` → `getSettingSync` |
| `ai-agent-steps.ts` | `getAgentMaxSteps` | same shape |
| `ai-models.ts` | `getDefaultAiModel`, `getGenerationModel` | read `ai.models_default` / `ai.generation_model` |
| `user-credits.ts` | `getProjectLimit` | reads `economics.project_limit`; energy consts become `getEnergyConfig()` |
| `runtime-network.ts` | `getRuntimeFetchTimeoutMs` | `getSettingSync` |
| `generated-resource-budget.ts` | `resolveBudgetValue` | `getSettingSync` |
| `preview-asset-token.ts` | `getTokenTtlSeconds` | `getSettingSync` |
| `project-thumbnail.ts` | `isCaptureEnabled`, `positiveInt` sites | `getSettingSync` |
| `build-worker.ts` | `getBuildConcurrencyLimit` | `getSettingSync` |
| `runtime-supervisor.ts` | max-containers read | `getSettingSync` |
| `config.ts` | `getCapabilityFlag` | unchanged code; now correct because the snapshot is warm |

One consequence to accept deliberately: a value read via `getSettingSync` on the
very first request before priming completes returns the fallback rather than the
DB value. Priming is awaited in middleware ahead of route handling, so this
window does not occur for request-scoped reads. It does apply to any read at
module-evaluation time — `user-credits.ts`'s energy constants are therefore
converted from `export const` to a `getEnergyConfig()` function call, which is
why that conversion is in scope.

### 7. Write-side validation

The PUT handler gains a bounds check after the existing type check:

```
if entry.type === "number" and entry.min is defined and value < entry.min  → 400
if entry.type === "number" and entry.max is defined and value > entry.max  → 400
```

Error copy is Indonesian, matching the surrounding handler: `` `${key} harus
antara ${min} dan ${max}.` ``

This is what makes 58 open knobs safe: a value that reaches the DB is already
in-range, and the read-side clamp is a second net for values that predate this
change.

### 8. Admin UI

`_main.admin.settings.tsx` renders basic categories expanded, then a single
disclosure:

```
Konfigurasi lanjutan  (32 pengaturan)          [ Tampilkan ]
```

Collapsed by default on every load — no persistence. Rationale: an admin who
opens the page to flip a feature flag should see a short page, and the advanced
tier is by definition rarely touched.

Per-entry additions:
- Numeric inputs get `min`/`max` attributes from the registry, so the browser
  surfaces the bound before the round-trip.
- The `source` line already shows `db` / `env` / `fallback`; it becomes accurate
  for all entries once GET reads `entry.env` (defect C1).
- `requiresRestart` entries render a `perlu restart` chip next to the label.

Copy is Indonesian per the project convention; keys and env names stay verbatim.

### 9. Known drift, deliberately not "fixed"

`.env.example` disagrees with code defaults in two places:

| Var | `.env.example` | Code | Registry fallback |
| --- | --- | --- | --- |
| `PROJECT_LIMIT` | 3 | 5 (`user-credits.ts:31`) | 5 |
| `AI_AGENT_GENERATE_MAX_STEPS` | 12 | 30 (`ai-agent-steps.ts:14`) | 30 |

The registry takes the code value, because that is what runs when the var is
unset. `.env.example` is updated to match, and the change is called out in the
commit — silently altering an effective default would be a behavior change
smuggled inside a refactor.

Separately, `DISCUSS_ONE_CALL_TOOLS` (`.env.example:111`) has **no consumer in
`src/`** — it appears only in two 2026-07-18 plan documents. Flagged here, not
removed: deleting it is out of scope for this change.

## Testing

Unit tests, colocated per the existing convention, `bun run test`:

1. `app-settings.test.ts` — extend: `primeSettingCache` seeds the snapshot;
   `getSettingSync` returns the DB value after priming; **the snapshot value
   survives past the 5s TTL** (the regression this design exists to prevent);
   priming survives a DB error without throwing; type-mismatched rows are
   skipped; concurrent primes issue one query;
   `invalidateSettingCache()` forces a re-prime.
2. `app-settings-registry.test.ts` — extend: every entry has a `tier`; every
   numeric entry with an `env` also declares `min` and `max`; no two entries
   share a `key` or an `env`; every `min <= fallback <= max`.
3. `api.admin.settings` bounds — a value below `min` and above `max` is
   rejected with 400; an in-range value is upserted.
4. Per-consumer: each rewired module returns the DB value when set, the env
   value when DB is empty, the fallback when neither, and clamps out-of-range.
5. `_main.admin.settings.helpers.test.ts` — `groupByTier(entries)` returns basic
   and advanced buckets in the declared category order.

Storybook: the advanced disclosure is a new repeated visual pattern; a story is
added in the same change per project rule.

## Files

| File | Change |
| --- | --- |
| `src/lib/app-settings-registry.ts` | `tier`/`env`/`min`/`max`/`requiresRestart` fields; 33 new entries; 4 new categories |
| `src/lib/app-settings.ts` | add `primeSettingCache` + no-TTL snapshot; delete `envKeyFor`; read `entry.env` |
| `src/start.ts` | await `primeSettingCache()` in global middleware |
| `src/routes/api.admin.settings.ts` | drop local env map; bounds validation; expose `tier`/`min`/`max`/`requiresRestart` in GET |
| `src/routes/_main.admin.settings.tsx` | tier split, disclosure, restart chip, input bounds |
| `src/routes/_main.admin.settings.helpers.ts` (new) | `groupByTier` |
| `src/lib/ai-timeouts.ts` | async, DB-first |
| `src/lib/ai-agent-steps.ts` | async, DB-first |
| `src/lib/ai-models.ts` | async, DB-first |
| `src/lib/user-credits.ts` | async `getProjectLimit`, `getEnergyConfig` |
| `src/lib/projects/runtime-network.ts` | async, DB-first |
| `src/lib/projects/generated-resource-budget.ts` | async, DB-first |
| `src/lib/projects/preview-asset-token.ts` | async, DB-first |
| `src/lib/projects/project-thumbnail.ts` | async, DB-first |
| `src/lib/projects/build-worker.ts` | `getSettingSync` |
| `src/lib/projects/runtime-supervisor.ts` | `getSettingSync` |
| `.env.example` | fix two drifted defaults; note DB-override precedence |
| `docs/architecture.md` | document the DB → env → fallback contract and the excluded set |

Because consumers keep their synchronous signatures, their call sites need no
change. The one exception is `user-credits.ts`: replacing the exported energy
constants with `getEnergyConfig()` touches every reader of `DAILY_ENERGY_LIMIT`
and `MIN_ENERGY_*`.

## YAGNI

- No new dependency.
- No settings-change audit log — `updatedBy`/`updatedAt` already exist on the row.
- No per-environment setting scopes (dev/staging/prod) — one deployment, one DB.
- No import/export of settings as a file.
- No live-reload of `requiresRestart` values — the badge is the honest answer.
- No search/filter box on the settings page — seven labelled sections and a
  collapsed advanced tier is navigable; add it if the page keeps growing.
- No persistence of the disclosure's open state.

## Out of scope

- `2026-07-28-admin-settings-dirty-sync-design.md` (dirty-aware save) — separate,
  still unimplemented; this spec does not touch save semantics.
- Removing the dead `DISCUSS_ONE_CALL_TOOLS` var.
- Making `EnergyBoosterModal` display DB-effective booster prices instead of the
  hardcoded const. Real bug (`pakasir.ts:13-15` documents it), separate change.
- Moving any secret into the DB.
