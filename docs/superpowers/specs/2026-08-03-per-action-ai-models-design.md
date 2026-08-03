# Per-Action AI Models Design

## Problem

Almost every AI call in UMKM Cepat used one model id — historically `default-combo`, now `default-combo` — via `getDefaultAiModel()` / `ai.models_default` / `AI_MODELS`. Only the build pipeline had a partial escape hatch (`getGenerationModel()` → env `AI_GENERATION_MODEL` only; no admin setting).

That forces one 9Router combo (cost, latency, vision, tool-call skill) onto jobs that need different profiles:

| Job | Needs |
|-----|--------|
| Moderation | Cheap, fast, vision for image gates, temp 0 |
| Discuss | Mid, tool-call reliable, low reasoning |
| Build + edit | Strong coding + vision |
| Compaction | Cheap summarizer (same band as moderation) |

Admin `/admin/settings` only offers free-text for `ai.models_default`. Ops must type combo ids by hand; no live list from 9Router.

## Goal

1. **Three task models + one global default**, all configurable via admin settings (DB-first) and env, with hard fallback `default-combo`.
2. **Call sites use the correct getter** for their product job (not “everything uses default”).
3. **Admin UI selects model ids from 9Router** (`GET {NINE_ROUTER_BASE_URL}/models`) as a dropdown — not free text for those keys.
4. **Empty task settings keep today’s behavior** (fall through to default → hardcode).

## Non-goals

- Creating or tuning 9Router combo *contents* (ops owns that in 9Router dashboard).
- Separate model knobs for discuss-repair, build-spec vs build-gen, subagents, or edit-only (edit shares **build**).
- User-facing model picker.
- OpenRouter `/models` for this dropdown (wrong gateway for *our* combo labels).
- Changing timeouts, agent max-steps, pricing math, or credit ledger shape.
- Multi-select / weighted routing inside the app (9Router owns fallback bands).

## Decisions (locked)

| Decision | Choice |
|----------|--------|
| How many task knobs? | **3:** moderation, discuss, build |
| Edit (Ubah) model? | **Share build** (`getGenerationModel()`) |
| Chat compaction model? | **Share moderation** |
| Discuss repairs? | **Inherit discuss** (already pass `model` / `modelName`) |
| Hardcoded last resort? | **`default-combo`** (`DEFAULT_AI_MODEL`) |
| Default setting role? | **Global fallback only** — not a fourth product job |
| Admin UX for model keys? | **Dropdown from 9Router `/models`** |
| Empty task value? | Fall through (not “use empty string as model id”) |
| Free-text escape hatch? | **No** for happy path; if current value missing from list, still show it as selected + warn |

## Model map

| Knob | Setting key | Env | Getter | Call sites |
|------|-------------|-----|--------|------------|
| **Default** | `ai.models_default` (exists) | `AI_MODELS` | `getDefaultAiModel()` | Fallback only; first entry if comma-list |
| **Moderation** | `ai.model.moderation` | `AI_MODEL_MODERATION` | `getModerationModel()` | `ai-moderation.ts`; `chat-compaction.ts` |
| **Discuss** | `ai.model.discuss` | `AI_MODEL_DISCUSS` | `getDiscussModel()` | `discuss-turn-worker.ts` (and preview discuss path that sets `modelName`); repairs inherit |
| **Build** | `ai.model.build` | `AI_MODEL_BUILD` | `getGenerationModel()` | `build-attempt-worker.ts`, `custom-source-generator.ts`, `source-edit-agent.ts`, `edit-attempt-worker.ts` |

**Build env aliases:** prefer `AI_MODEL_BUILD`; keep reading `AI_GENERATION_MODEL` as a second env alias for backward compatibility (either non-empty wins in documented order: setting → `AI_MODEL_BUILD` → `AI_GENERATION_MODEL` → default).

**Suggested 9Router label names** (ops creates; not required as app fallbacks):

- `default-combo`
- `moderation-combo`
- `discuss-combo`
- `build-combo`

App does not require these strings to exist until ops creates them. Day-one ship with empty task settings → everyone uses default → hardcode.

## Resolve order

For each **task** getter:

```text
task setting (DB via getSettingSync) → task env → getDefaultAiModel()
```

For **default**:

```text
ai.models_default (DB) → AI_MODELS → "default-combo"
```

`getDefaultAiModel` keeps existing behavior: comma-separated list → **first** non-empty trimmed id. Task knobs are **single** ids (trim; empty/whitespace → treat as unset and fall through).

```text
moderation ──┐
discuss    ──┼── empty? ──► default ── empty? ──► default-combo
build      ──┘
```

## Registry

Add three `ConfigEntry` rows (`category: "ai"`, `tier: "advanced"`, `type: "string"`, `fallback: ""`):

| key | env | label |
|-----|-----|--------|
| `ai.model.moderation` | `AI_MODEL_MODERATION` | AI — moderation model id |
| `ai.model.discuss` | `AI_MODEL_DISCUSS` | AI — discuss model id |
| `ai.model.build` | `AI_MODEL_BUILD` | AI — build/edit model id |

Extend registry so model pickers can declare a live options source:

```ts
// on ConfigEntry
optionsSource?: "nine_router_models";
```

Apply `optionsSource: "nine_router_models"` to:

- `ai.models_default`
- `ai.model.moderation`
- `ai.model.discuss`
- `ai.model.build`

`fallback` for default stays `"default-combo"`. Task fallbacks stay `""` (inherit).

No secrets in registry. `NINE_ROUTER_BASE_URL` / `NINE_ROUTER_API_KEY` remain env-only.

## 9Router model list

9Router (decolua/9router) is OpenAI-compatible:

```http
GET {NINE_ROUTER_BASE_URL}/models
Authorization: Bearer {NINE_ROUTER_API_KEY}
```

With `NINE_ROUTER_BASE_URL=http://…/v1`, path is `/v1/models`. Response shape (OpenAI list):

```json
{ "data": [ { "id": "default-combo", "object": "model", ... }, ... ] }
```

Docs: returns models **and** combos.

### App helper

`src/lib/nine-router-models.ts` (name may match repo style):

- `listNineRouterModels(): Promise<string[]>`
- Uses `getEnv("NINE_ROUTER_BASE_URL")` + `getEnv("NINE_ROUTER_API_KEY")` (same as `getAiModel`)
- `fetch` with short timeout (e.g. 8s); parse `data[].id`; filter non-empty strings; sort; dedupe
- In-process TTL cache (~60s) so admin page re-renders do not hammer 9Router
- On missing env / non-OK / parse failure: return `[]` (do not throw to admin UI crash)

Do **not** use `nineRouterFetch` chat-completion defect repair for this GET unless required; plain `fetch` is enough for `/models`.

### Admin API

```http
GET /api/admin/ai-models
```

- `requireAdmin()`
- Body: `{ models: string[] }` (possibly empty)
- Optional: `{ models, error?: string }` only if useful for admin toast; prefer silent empty + UI copy “Daftar model 9Router kosong / gagal dimuat”

No write endpoints for models. Creating combos stays in 9Router.

## Admin UI (`/admin/settings`)

Today: `boolean` toggle, `number` input, else free-text `string` (`_main.admin.settings.tsx`).

For entries with `optionsSource === "nine_router_models"`:

1. React Query loads `GET /api/admin/ai-models` once per settings page (key e.g. `["admin", "ai-models"]`).
2. Render `<select>`:
   - Task knobs: first option value `""` label e.g. `(pakai default)`
   - Default knob: options are model ids; if list empty, still show current effective value + hardcode option `default-combo` if missing
3. If `effectiveValue` / draft not in list: include an extra `<option>` for that value so save is not forced; show small warning text “Tidak ada di daftar 9Router”.
4. No free-text field required for these four keys.
5. Optional “Muat ulang daftar” invalidates the query (nice-to-have; not required for v1 if refetch on focus exists).

API GET `/api/admin/settings` must surface `optionsSource` on each entry (or client maps from a shared registry import if the client already has registry — prefer server includes it so UI stays data-driven from GET payload).

**Validation on PUT:** model keys remain `type: "string"`. Do **not** require value ∈ live list (stale combo / offline 9Router must still save). Empty string allowed for task keys.

## Call-site rewires

| File | Change |
|------|--------|
| `src/lib/ai-models.ts` | resolve helper + task getters; build reads DB + dual env |
| `src/lib/ai-moderation.ts` | `getModerationModel()` for model + logs + usage fallback id |
| `src/lib/projects/chat-compaction.ts` | `getAiModel(getModerationModel())` |
| `src/lib/projects/discuss-turn-worker.ts` | `getDiscussModel()` as `modelName` |
| `src/routes/api.projects.preview.ts` | discuss `modelName` via `getDiscussModel()`; moderation fallback ids via moderation/default getters |
| `src/lib/projects/source-edit-agent.ts` | default model → `getGenerationModel()` |
| `src/lib/projects/edit-attempt-worker.ts` | `getGenerationModel()` |
| Build workers / generator | already `getGenerationModel()` — getter body only |
| Routes hardcoding `"default-combo"` as `modelId` fallback | use `getModerationModel()` / `getDefaultAiModel()` / `DEFAULT_AI_MODEL` — no new magic strings |

**Unchanged:** `discuss-turn-shared` repair helpers (receive parent model). Pricing/credits still use `response.modelId` when present.

## Telemetry / logs

Pass the **requested** model id (getter result) into existing `getAiTelemetry` / `devLog` metadata. Served child model remains `response.modelId` when 9Router resolves a combo member — unchanged for energy charging.

## Tests

- `ai-models.test.ts`: task resolve order DB > env > default > hardcode; empty task → default; empty default → `default-combo`; build aliases `AI_MODEL_BUILD` / `AI_GENERATION_MODEL`; default comma-list first entry.
- `app-settings-registry.test.ts`: env maps for three new keys; `optionsSource` present on four model keys.
- `nine-router-models` unit: parse sample JSON; empty on error; cache TTL behavior if easy.
- Admin AI models route: 401/403 non-admin; 200 + models for admin (mock list helper).
- Call-site tests/mocks that stub only `getDefaultAiModel` updated where the site now calls a task getter.

## Docs

- Short note in `DEV.md` (or admin settings section): three task knobs + default, fallthrough, dropdown from 9Router `/models`, suggested combo names.
- This design is the canonical product/ops contract for model selection.

## Rollout

1. Ship app with empty task settings → behavior matches today.
2. Ops creates combos in 9Router: `default-combo`, `moderation-combo`, `discuss-combo`, `build-combo` (rename or alias away from legacy `default-combo`).
3. Set moderation first (cheap + vision), then discuss, then build.

## Success criteria

- [ ] Moderation, discuss, and build/edit can use different model ids without code change.
- [ ] Empty overrides → single-model behavior as today.
- [ ] `/admin/settings` shows dropdowns populated from 9Router when available.
- [ ] Hard last resort remains `default-combo`.
- [ ] No secrets in tracked settings; no fake pricing for combo labels beyond existing pricing rules.

## Out of scope / later

- Split edit from build if cost metrics demand it.
- Split build-spec vs source-gen.
- Dedicated discuss-repair model.
- Filtering dropdown to “combo only” vs raw upstream models (show full `/models` list v1).
