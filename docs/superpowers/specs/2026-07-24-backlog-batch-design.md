# Backlog Batch (2026-07-24) — Design

**Status:** autonomous execution (user mandate: spec → plan → build → polish, no questions)
**Branch:** `dev` (open PRs into `dev`)
**Parent context:** `docs/architecture.md`, `PRODUCT.md`, `DESIGN.md`, `PRINCIPLES.md`, `DEV.md`

## Purpose

Nine backlog items, plus a "handoff/agents problem" that turned out to be already-landed context. This spec turns them into one cohesive, phased build. Each phase is independently shippable. Phases are ordered so earlier work unlocks later work and so risk rises gradually.

The user's goal, restated in one line: **make the builder itself more capable, safer, and reachable on mobile, and open a controlled waitlist** — without destabilizing the locked generated-stack or the one-platform-app invariant.

---

## Phase 0 — Handoff fixes (ALREADY LANDED — context only, no work)

Commit `3e87980` on `dev` ("fix(generate): escalate stuck preview + block undeclared imports + tolerate double-encoded tool args") contains:

1. **Discuss double-encode tolerance** — `jsonObjectOrString` schema wrapper (`discuss-tool.ts`), `unstringifyJsonObject` server normalization (`brief-flow.ts`), prompt guidance. (`src/lib/projects/discuss-tool.test.ts`, `brief-flow.test.ts`)
2. **Undeclared-import build-policy gate** — `getUndeclaredImportIssues` in `generated-package-policy.ts` rejects any package import not declared in the generated `package.json`. This is the load-bearing fix that prevents the two-React-copy crash.
3. **`motion` allowlisted + scaffold-declared** — `ALLOWED_PACKAGES_BY_PROFILE["vite-react-tanstack-v1"]` + scaffold `package.json`.
4. **Bounded preview-loader recovery** — `previewReadyState` / `PREVIEW_STUCK_MAX_ATTEMPTS=3` in `workspace-sync.ts`; `GeneratedPreviewFrame` stops spinning and shows `PreviewIssueState`.

Verified clean working tree; `discuss-tool.test.ts` tracked; all markers grep-positive. **No action required.** This phase exists in the spec only so future agents do not re-litigate it. The two-React/undeclared-import gate (item 2 above) is directly reused by Phases 5 and 6: any new engine tool that could surface package imports or file paths must pass through the same boundary discipline.

**Retracted theory (do not revisit):** the old `PROJECT_RUNTIME_SUPERVISOR=noop` → 503-loop theory for the preview-loading-forever symptom. The real cause was undeclared `motion` → two React copies. Always confirm prod-compose vs tunneled-local before theorizing about the supervisor.

---

## Cross-cutting constraint: keep everything LOCAL for now (no API keys)

**User directive (2026-07-24):** for this batch, all storage and any websearch provider stay **local / self-hosted / unconfigured** — no external API keys, no paid third-party services wired in.

Concretely:
- **Storage** (`OBJECT_STORAGE_PROVIDER`): pinned to `local`. All upload paths (Phase 2, the waitlist image in Phase 7) write under `.data/uploads` on the local filesystem. The `r2` adapter stays as a future provider (its env placeholders already exist and intentionally throw until needed) — we do **not** implement or call R2 in this batch. No R2 credentials in `.env` or `.env.example` are filled.
- **Websearch** (Phase 5): `WEBSEARCH_PROVIDER` defaults to `none`. The `web_search` tool is **built and fully tested** (all guardrails: SSRF, allowlist, sanitize, rate-cap, fail-closed), but it ships **disabled by default** — `execute` returns a "web search unavailable" string and never errors the build. The Firecrawl adapter code is written behind the provider boundary so flipping `WEBSEARCH_PROVIDER=firecrawl` + pointing `FIRECRAWL_BASE_URL` at a **self-hosted** Firecrawl later is a one-env change. We do **not** call any hosted/paid Firecrawl endpoint and do not add a Firecrawl API key.
- **Auth/admin** (Phase 7): admin stays an env-driven email allowlist (`ADMIN_EMAILS`), no external IdP. Google OAuth + phone OTP are unchanged.
- **Graphify** (Phase 1): already local/no-API-cost (the report shows "0 input · 0 output"). Refreshing it stays free.

**Net effect:** the whole batch runs on the existing local infra (`bun run infra` = Postgres + 9Router + Headroom) with no new external dependencies or keys. External providers (R2, hosted Firecrawl) remain *implemented-behind-a-boundary but disabled* — the boundary exists so enabling them later is config, not code.

This constraint is reflected in the per-phase sections below (Phase 2 storage stays `local`; Phase 5 ships with `WEBSEARCH_PROVIDER=none` as the default).

---

## Cross-cutting decisions (apply to every phase)

These are the defaults I'm committing to under the autonomy mandate. Each can be corrected on review without rework.

| Topic | Decision | Rationale |
|---|---|---|
| Which "AI" gets search tools (#1, #7, #8) | The **source-generation agent** (`createAgentTools` in `custom-source-generator.ts`) and the **edit agent** (`source-edit-agent.ts`), not the discuss chat model | Those are the file-reading/writing agents that benefit from token-efficient search; the discuss model emits one card per turn and does not navigate code |
| Undo scope (#4) | **Generated source snapshots** — list/diff/restore `ProjectSnapshot` rows; not chat turns, not the brief | The version graph (`parentSnapshotId`) already exists and is populated on every generate/edit; chat turns are append-only by design (DB lease) and the brief is canonicalized server-side — neither needs undo |
| Upload reading (#9) | **Two distinct primitives**: (a) **builder asset upload** — owner uploads reference/business images that the AI can wire into the generated site; (b) **waitlist evidence image** (#6) reuses (a). Both go through one shared upload endpoint. Generated-project *end-user* uploads (e.g. a customer uploading a photo to a generated storefront) remain the "File upload" future platform module, explicitly out of scope per architecture.md | Avoids building the same storage path three times; respects the static-frontend constraint (no end-user persistence yet) |
| Websearch allowlist (#7) | **Fail-closed, curated allowlist** for the source agent's research; allow public reference/business-info domains, block private-network ranges and known-malicious categories; results are sanitized text returned to the model, **never auto-fetched into files or executed** | Architecture safety checklist item 3 (untrusted input validated) + item 4 (no generated-code eval in control plane); the AI researching a business's domain is safe, blindly fetching arbitrary URLs is not |
| Sub-agent write policy (#8) | **Read-only**. `spawn_subagent` produces a research summary string; it cannot mutate files. Parallelism comes from the SDK's native parallel tool calls within a step, not a bespoke dispatcher | Keeps the single-project sandbox invariant; the file-mutation authority stays with the one `write_file`/`replace_in_file` executor |
| Commit cadence | One conventional commit per phase (or per coherent sub-phase), each passing `bun run check` before commit; push via `/push-dev` only at natural breakpoints | Matches the ratified autonomy tier (commit→dev) and the pre-commit `check:commit` gate |
| Testing | TDD where there is logic (policies, normalization, schemas, tool executors); component + interaction tests where there is UI; `bun run check` green before every commit | Non-negotiable per DEV.md and the autonomy safety memory |
| Docs | Each phase that changes behavior/architecture/storage/auth/UI updates the canonical doc in the same diff | CLAUDE.md rule: docs are part of the change |

---

## Phase 1 — Dev navigation + token-efficient search (#2, #1)

### #2 Graphify for dev navigation (NOT an engine dependency)

`CLAUDE.md` rule: *"Use Graphify for non-trivial codebase discovery when available; do not add it as a project dependency."* `graphify-out/` exists but is stale (built from `2d0e0633`, HEAD is past `3e87980`).

**Decision:** refresh `graphify-out` to HEAD via `bunx graphify .` (no API cost) so I and future agents navigate via the graph instead of reading whole files. This is a **dev-workflow** action, not a product/engine feature. It is **not** embedded in the generation engine — generated projects are sandboxed static frontends for UMKM businesses; they do not need code-graphs. The user's "graphify inside for engine?" question is answered **no** for the engine, **yes** for my own navigation.

**Deliverable:** refreshed `graphify-out/GRAPH_REPORT.md` (gitignored, never committed). No code change. Note in this spec that the graph is the dev-navigation substrate.

### #1 Token-efficient AI search

The source agent already has `search_files` (substring match over the in-memory generated file set, `agent-tool-runner.ts`) plus `list_files` and `read_file`. The gap: `read_file` returns whole files, so the agent burns tokens reading 800-line files to find one function.

**Design:** extend the file-reading tools with bounded retrieval, matching how I (the dev agent) work:

- `read_file` gains optional `startLine`/`endLine` (1-indexed, clamped, capped at e.g. 200 lines per call) and optional `maxBytes`. Whole-file read remains the default only for small files.
- `search_files` gains optional `contextLines` (lines of context around each match, default 2, capped at 5) and returns match line numbers so a follow-up `read_file` with a range is cheap. Today it returns matching files; we add per-match line ranges.
- No new tool. Same surface, bounded.

**Why not a ripgrep tool:** the generated file set is small and in-memory; substring search over it is already O(files×size). The win is *range reads*, not a faster engine.

**Touch points:** `agent-tool-runner.ts` (`search_files`, `read_file` executor branches), mirrored in `source-edit-agent.ts` tool definitions. Tests: unit-test the line-clamping and context extraction logic.

---

## Phase 2 — Shared upload primitive / object-storage v2 (#9)

This is the shared foundation for #6 (waitlist image), #5 (mobile uploads), and future end-user uploads.

### Current state

`src/lib/object-storage.ts` enforces image-only keys: `normalizeObjectKey` rejects anything not matching `^[A-Za-z0-9/_-]+\.(png|jpg|jpeg|webp)$`. It supports `local` (`.data/uploads`) and `r2`. Ref format: `object:local:<key>` / `object:r2:<key>`. Currently wired only for project thumbnails and profile avatars (the latter auto-generated DiceBear, no upload UI).

### Design

Generalize without losing the image safety:

- New `putStoredObject` path accepts an **allowlisted content type + max size** (e.g. 5 MB images, 2 MB documents) instead of inferring from the extension only. Keep image allowlist as the default; add an explicit `allowedContentTypes` parameter for callers that need broader types.
- Owner-scoped keys: `<scope>/<ownerId>/<ulid>.<ext>` — e.g. `project-assets/<projectId>/<ulid>.webp`, `waitlist/<userId>/<ulid>.jpg`. ULID for unguessability + order. No user-controlled path components.
- Signed GET: extend the existing signed-asset route pattern (`api.projects.$id.assets.$` serves generated-site assets; we add a sibling `api.uploads.$.ts` that serves owner-scoped uploaded assets behind auth + ownership check + signed URL). Mirror the existing `getSignatureKey`/`hmac` machinery.
- Multipart POST route: `POST /api/projects/$id/assets` — auth + owner check + rate limit (reuse `RATE_LIMIT_*` buckets, new `upload` bucket) + content-type/size validation + store + return `{ ref, url }`. Inputs: `file` (multipart), `purpose` (string, allowlisted: `business-image` | `reference` | `logo`). Reject anything else.
- Virus/malicious-content guardrail: images are re-encoded server-side (decode → re-encode to strip EXIF/payloads) using the existing image pipeline if present, else `sharp` if already a dep; do NOT add a new image dep without checking. If re-encoding isn't available, at minimum strip metadata and enforce magic-byte validation (not just extension).

### Touch points

- `src/lib/object-storage.ts` (generalize, add allowlist param)
- `src/routes/api.projects.$id.assets.ts` (NEW, POST) + signed GET in `api.uploads.$.ts` (NEW) or extend the existing assets route
- `prisma/schema.prisma` — optional `ProjectAsset` model (`id`, `projectId`, `ownerId`, `ref`, `purpose`, `contentType`, `sizeBytes`, `createdAt`) so uploaded assets are queryable/cleanup-able alongside project delete (mirrors `project-cleanup.ts`). Without this, uploads orphan on delete.
- `src/lib/projects/project-cleanup.ts` — delete `ProjectAsset` refs on project delete (best-effort, like thumbnails)
- `docs/architecture.md` §Storage — document the generalized upload path
- `DESIGN.md` / Storybook — only if a reusable upload UI component is introduced (it should be: a `<FileUpload>` shadcn-style dropzone)

### Tests

Unit: key generation, content-type enforcement, size cap, magic-byte validation. Route: auth rejection, owner mismatch rejection, happy path (store + signed GET round-trip), oversized rejection. Cleanup: project delete removes assets.

---

## Phase 3 — Prettier + ESLint auto-fix (#3)

### Current state

Pre-commit runs `bun run check:commit` = lockfile guard + prettier + eslint on staged files. `check:fast`/`check` run format/lint/typecheck/test/knip in parallel. There is no `lint:fix`/`format:fix` auto-applied at commit.

### Design

The user wants "automatic" — the lowest-surprise interpretation that fits the existing gates: **make the pre-commit hook auto-fix staged files and re-stage the fixes**, so a developer never has to manually run prettier/eslint to land a commit.

- `check:commit` (or a new `check:commit:fix` it calls) runs `prettier --write` + `eslint --fix` on staged files, re-stages changed files, then runs the read-only prettier/eslint check. If the read-only check still fails (e.g. an eslint `error` that `--fix` can't resolve), the commit is blocked with the diff shown.
- Guard: auto-fix only touches **staged** files (never unstaged working-tree changes — avoids accidentally committing half-written edits). Use `git diff --cached --name-only --diff-filter=ACMR` to enumerate.
- Keep `check:fast`/`check` read-only (no `--write`) — they are feedback loops, not mutators.
- Document in `DEV.md` that the pre-commit auto-fixes staged files.

This is deliberately NOT "on-save editor formatting" (that's an editor config, out of repo scope) and NOT "auto-fix the generation engine's emitted code" (that's the build-policy gate from Phase 0, already in place).

### Touch points

- `package.json` scripts (`check:commit`, add `lint:fix`/`format:fix` helpers if absent)
- `.husky/pre-commit` (call the fixing gate)
- `DEV.md` (document)
- Verify eslint config supports `--fix` for the rule set (it does; no config change expected)

### Tests

Manual + a tiny shell test that a deliberately misformatted staged file gets fixed-and-committed cleanly. No unit test needed; this is wiring.

---

## Phase 4 — History / restore (#4)

### Current state

`ProjectSnapshot` (with `parentSnapshotId` self-relation, `files` JSON, `sourceRef` to artifact) is created on every `generate` and every `edit` attempt. `ProjectBuild` rows track per-build status/logs/artifacts. `ProjectEditAttempt` records instruction/validation/lease. **No API lists/restores snapshots; no UI exposes history.** `api.projects.$id.source` reads only the latest.

### Design

Surface the existing version graph as a first-class workspace history surface:

- `GET /api/projects/$id/snapshots` — list `ProjectSnapshot` rows for the project, newest first, with `id`, `createdAt`, `parentSnapshotId`, `buildStatus` (join latest `ProjectBuild`), `kind` (initial-generate | edit | repair), and a short diff summary (file count delta vs parent). Owner-scoped + auth.
- `GET /api/projects/$id/snapshots/$snapshotId/source?path=...` — read a file from a specific snapshot's `sourceRef` artifact (reuses the existing artifact read path). Enables diff/preview of a past version.
- `POST /api/projects/$id/snapshots/$snapshotId/restore` — create a **new** `ProjectSnapshot` whose `sourceRef` copies the target snapshot's files, set it as the project's active source, and (optionally, behind a confirm) kick a rebuild. Restoration is append-only: we never delete newer snapshots; restore = "branch from an old version." This preserves the audit graph.
- UI: a new **Riwayat** (History) entry in the workspace top-bar tablist (today: Tampilan/Kode), opening a drawer listing versions with timestamps, build status, and a "Lihat / Kembalikan" (View / Restore) action per row. Restore shows a confirm dialog ("Ini akan membuat versi baru dari snapshot lama. Versi saat ini tetap tersimpan.").

### Guardrails

- Restore never overwrites the active build silently; it stages a new snapshot and lets the user rebuild.
- Snapshots whose `sourceRef` artifact is missing (cleaned up) are shown as "tidak tersimpan" (not restorable) — list-only.
- Owner-scoped on every route.

### Touch points

- `src/routes/api.projects.$id.snapshots.ts` (NEW list), `...snapshots.$snapshotId.source.ts` (NEW read), `...snapshots.$snapshotId.restore.ts` (NEW POST)
- `src/lib/projects/snapshots.ts` (NEW, or extend `runtime-artifacts`/`generated-source`) — `listSnapshots`, `readSnapshotFile`, `restoreSnapshot`
- `src/components/projects/WorkspaceShell.tsx` + `WorkspacePrimitives.tsx` — Riwayat tab + drawer
- `docs/architecture.md` §Project workspace — document the restore-as-branch semantics
- Indonesian UI copy

### Tests

Unit: `restoreSnapshot` produces a new row with correct `parentSnapshotId` and copied `files`/`sourceRef` without mutating the target. Route: auth, owner, missing-artifact handling. Component: history drawer render + restore confirm.

---

## Phase 5 — Websearch tool (Firecrawl) + guardrails (#7)

### Current state

No websearch capability in the engine. The platform already uses Firecrawl as an MCP for *my* dev work; the user self-hosts Firecrawl. The source-generation agent (`createAgentTools`) has no research tool.

### Design

Add a **read-only `web_search` tool** to the source-generation agent (and optionally the discuss agent for business-domain clarification — but start with the source agent, gated behind a flag).

- New adapter `src/lib/websearch.ts` (or `src/lib/ai-websearch.ts`) behind a provider boundary mirroring `src/lib/ai.ts`: `getWebSearchProvider()` reads `WEBSEARCH_PROVIDER` env (`firecrawl` | `none`), `FIRECRAWL_BASE_URL`, `FIRECRAWL_API_KEY`. Fail-closed: if `none` or unconfigured, the tool's `execute` returns a fixed "web search unavailable" string and never errors the build.
- Tool: `web_search({ query: string, maxResults?: number })` → returns sanitized text snippets (title, url, excerpt) to the model. `maxResults` capped (e.g. 5). Results are **plain text returned to the model**; they are never written to files, never executed, never fetched into the build.
- Guardrails (the "really safe and strong" the user asked for):
  1. **SSRF/private-network block** — reject any URL resolving to private/loopback/link-local ranges (RFC 1918, 169.254/16, 127/8, ::1, fc00::/7). Validate before fetch.
  2. **Allowlist** — curated allowlist of public reference/business-info domains; deny by default. Configurable via env (`WEBSEARCH_ALLOWLIST`, comma-separated) with a sane default seed. A denylist (`WEBSEARCH_DENYLIST`) on top for known-malicious categories.
  3. **Content sanitize** — strip scripts/styles/iframe content from scraped HTML; return only sanitized text (reuse `dompurify` if it's already a platform dep — check first; do NOT add a new sanitize dep without justification). Truncate per-result to a token budget.
  4. **Rate limit** — per-project and per-turn call cap (e.g. max 3 searches/generate) on top of the existing `RATE_LIMIT_AI_USER_*` buckets. Fail-closed on cap.
  5. **devLog** — every `web_search` call logged (`websearch`, `search-start`/`search-finish`, query redacted to length + allowlist verdict).
  6. **No file side effects** — the tool's executor branch in `agent-tool-runner.ts` returns a `result` string and does **not** touch the in-memory file set.
- Integration into the build-policy gate: the Phase-0 undeclared-import gate already prevents the AI from importing a websearch SDK into generated source — `web_search` is a **platform-side** tool executed in the control plane, surfaced to the agent as text. The agent cannot import it.

### Touch points

- `src/lib/websearch.ts` (NEW adapter + guardrails)
- `src/lib/projects/agent-tool-runner.ts` — `web_search` command variant + executor branch
- `src/lib/projects/custom-source-generator.ts` `createAgentTools` — `web_search` tool definition (mirror in `source-edit-agent.ts` only if edit-time research is wanted; default: source-gen only)
- `src/lib/dev-log.ts` — new scope `websearch`
- `prisma/schema.prisma` — optional `WebSearchLog` model for auditability (query, verdict, result count, projectId, createdAt). Start with devLog file + this table is optional.
- `docs/architecture.md` §AI gateway + §Provider boundaries — new row in the provider table
- `.env.example` — `WEBSEARCH_PROVIDER`, `FIRECRAWL_BASE_URL`, `FIRECRAWL_API_KEY`, `WEBSEARCH_ALLOWLIST`, `WEBSEARCH_DENYLIST`, rate-limit env
- Tests: SSRF block (private IP rejected), allowlist deny-default, sanitization (scripts stripped), rate cap, fail-closed-when-unconfigured.

### Tests

Unit-heavy: every guardrail is a pure function with a failing test first. Route/integration: a generate flow with `WEBSEARCH_PROVIDER=none` completes without error; with `firecrawl` + a mock adapter, a search returns sanitized text and the agent can cite it without it landing in source.

---

## Phase 6 — Read-only sub-agent / parallel execution (#8)

### Current state

`ToolLoopAgent` (Vercel AI SDK) runs the source-gen agent with sequential tool calls per step; `getAgentMaxSteps` caps steps; `agent-loop-detector.ts` nudges/caps repetition. No sub-agent, no fan-out, no parallel-tool notion.

### Design

Add a **`spawn_subagent` tool** for research fan-out, and lean on the SDK's native parallel tool calls for concurrency. The sub-agent is **read-only**.

- `spawn_subagent({ goal: string, files?: string[], tools?: string[] })` → spawns a nested `ToolLoopAgent` with the **read-only subset** of tools (`list_files`, `read_file`, `search_files`, `web_search`, `check_app` — no `write_file`/`replace_in_file`). Bounded steps (`getAgentMaxSteps("subagent")`, new key, default ~8, clamp 2–15). Returns a summary string the parent consumes.
- Parallelism: the SDK already supports multiple tool calls in one step; the parent can call `spawn_subagent` 2–3× in one step and they run concurrently. We do **not** build a bespoke dispatcher. We document the pattern and ensure the executor is re-entrant (no shared mutable state across concurrent calls — the read-only subset is naturally stateless; the in-memory file set is read-only here).
- Guardrails: sub-agents share the parent's project boundary, step budget is deducted from a per-generate `subagent-step-pool` (so a parent can't spawn unbounded work), every spawn logged (`agent-loop`, `subagent-spawn`/`subagent-finish`, goal + steps used), loop-detector applies per sub-agent. A sub-agent may **not** spawn further sub-agents (one level of nesting).
- Why read-only: the single `write_file`/`replace_in_file` authority stays with the parent. A sub-agent that could write would race the parent and break the sandbox invariant. Research → summarize → parent decides → parent writes.

### Touch points

- `src/lib/ai-agent-steps.ts` — `getAgentMaxSteps("subagent")`
- `src/lib/projects/agent-tool-runner.ts` — `spawn_subagent` command + executor that constructs and runs the nested agent
- `src/lib/projects/custom-source-generator.ts` — `spawn_subagent` tool def; extract the read-only tool subset as a reusable `createReadOnlyAgentTools()`
- `src/lib/projects/agent-loop-detector.ts` — ensure per-subagent instances
- `src/lib/dev-log.ts` — `subagent` scope
- `docs/architecture.md` §Agent tool runner — document read-only sub-agents + the one-nesting-level rule
- Tests: sub-agent cannot write (write tools absent), step cap enforced, parallel spawns don't share state, subagent-cannot-spawn-subagent.

---

## Phase 7 — Waitlist / whitelist + business story + image (#6)

### Current state

Access is **open** post-verification (Google OAuth → phone OTP → product). Architecture already says "Pilot whitelist with admin approval (~10 UMKM)" but it's documented, not built. No `WaitlistEntry` model, no form, no approval flow. The Phase-2 upload primitive provides the image path.

### Design

A pre-auth waitlist capture with admin approval, mirroring the existing `/verify` phone-OTP gate pattern:

- `WaitlistEntry` Prisma model: `id`, `email String @unique`, `phone String?`, `businessName String`, `businessType String?`, `story String @db.Text` (the UMKM story), `imageRef String?` (uses Phase-2 upload), `status` (`pending` | `approved` | `rejected` | `waitlisted`), `submittedAt`, `reviewedAt`, `reviewerId?`, `rejectionReason?`, `linkedUserId?` (set when an approved entry's email signs up).
- Route `POST /api/waitlist` — accepts email + phone + businessName + businessType + story (required, min length) + optional image upload (multipart, reusing Phase-2 `api.uploads` with `purpose: waitlist-evidence`). Turnstile-guarded. Idempotent on email (re-submit updates the entry, doesn't dupe).
- Page `/waitlist` (`_main.waitlist.tsx`) — a calm form (DESIGN.md Warm Control Plane): business name, type, the story textarea (the centerpiece — "Ceritakan usaha kamu"), optional image dropzone, contact. Submit → "Terima kasih, permintaan kamu masuk antrian." No aurora overload; this is a product surface.
- Admin approval: a minimal admin surface. No `Role` model exists today, so gate admin routes behind an env-driven `ADMIN_EMAILS` allowlist (comma-separated) checked in `auth-config`/a new `requireAdmin` helper. Admin can list pending entries, view the story + image, approve/reject. Approval sets `status=approved` + `linkedUserId=null` until the user signs up.
- Signup gate: in `MainChrome` (mirrors the `verificationQuery → /verify` redirect), an approved-waitlist check: a signed-up user whose email matches an approved `WaitlistEntry` is allowed through; a user with no matching approved entry is redirected to `/waitlist` with a "akmu belum disetujui" message. Pending/rejected entries block product access.
- Migration path for the existing ~10 pilot users: seed their emails as `approved` `WaitlistEntry` rows in the migration so no one is locked out.

### Guardrails

- The image is **evidence for approval confidence**, optional but encouraged; never required (don't gate a real business on having a photo).
- Stories are length-validated (min ~80 chars) to force genuine context, not "asdf".
- Rate-limit the waitlist POST (per-IP + per-email) to prevent flooding.
- Admin allowlist, never a role migration in this phase (YAGNI; roles come if/when product needs them).

### Touch points

- `prisma/schema.prisma` — `WaitlistEntry` model + migration (with seed for pilot emails)
- `src/routes/api.waitlist.ts` (NEW POST), `src/routes/api.admin.waitlist.ts` (NEW list/approve/reject), `src/routes/_main.waitlist.tsx` (NEW page)
- `src/lib/waitlist.ts` (NEW — submission, approval, signup-gate check)
- `src/components/common/MainChrome.tsx` — waitlist-gate redirect
- `src/lib/auth.ts` or `auth-config.ts` — `requireAdmin` helper behind `ADMIN_EMAILS`
- `src/components/waitlist/` — form + dropzone (reuses Phase-2 `<FileUpload>`)
- `src/components/admin/` — minimal approval list (or a simple route; defer polished admin to a later phase if scope is tight)
- `docs/architecture.md` §Auth — document waitlist gate + admin-email allowlist
- `.env.example` — `ADMIN_EMAILS`
- Tests: idempotent submit, gate logic (approved/pending/rejected branches), admin allowlist, story length, image optional.

---

## Phase 8 — Mobile-friendly workspace (#5, the large composite)

### Current state

Workspace is desktop-first with a partial mobile surface-swap (`mobileSurface: chat | preview` via `max-md:` classes). Code view stacks awkwardly (`md:grid-cols-[280px_1fr]`). No bottom nav, no touch composer, no designed mobile generation flow.

### Design

A **designed mobile experience**, not a responsive-desktop layout. Principles: the generation flow must be navigable and completable on a phone.

- **Bottom navigation** (mobile only, `md:hidden`): Tampilan / Kode / Riwayat / Obrolan (Preview / Code / History / Chat) — single-surface swap. Active state uses the near-black action token (DESIGN.md One Action Rule).
- **Touch composer**: larger tap targets (44px min, DESIGN.md button height), full-width composer on mobile, sticky to bottom, keyboard-aware (`viewport` units + `useViewportHeight` hook for the mobile browser chrome). Streaming reply stays scroll-anchored (already fixed per commit `f15ec93`).
- **Preview on mobile**: full-bleed iframe, `min-h-dvh`, the existing Desktop/Mobile viewport toggle stays; on phones default to mobile viewport.
- **Code view on mobile**: collapse the 280px sidebar into a sheet/drawer (a file list button opens a bottom sheet), main area becomes the file content. No two-column grid on mobile.
- **Generation flow on mobile**: build-progress steps render as a vertical timeline (they already stream as events); the build-recommendation card is full-width and primary; the visual-annotation editor (desktop pointer-driven) is **hidden or read-only on mobile** — mobile users edit via chat, not pixel-annotation. Document this scope limit honestly.
- **Routing**: `/projects/$id` stays one route; mobile is a layout mode within `WorkspaceShell`, not a separate route set (avoids drift).
- Polish: re-audit every workspace state (loading, ready, stuck, build-failed, runtime-stopped, rate-limited) for mobile legibility — the Phase-0 bounded-loader states especially.

### Guardrails

- WCAG AA (PRODUCT.md): contrast, focus, reduced-motion, 44px targets.
- No decorative motion in product workflows (DESIGN.md).
- The visual-annotation editor stays desktop-only — don't try to ship pointer annotation on touch in this phase.
- Indonesian copy throughout.

### Touch points

- `src/components/projects/WorkspaceShell.tsx` (the 2.7k-line render block) — refactor mobile render into a clearly bounded `MobileWorkspaceShell` sub-component (improves the too-large-file smell the architecture doc warns about) rather than more inline `max-md:` branches
- `src/components/projects/WorkspacePrimitives.tsx` — mobile-aware primitives (bottom nav, sheet composer)
- `src/components/ui/` — a `bottom-nav` / `sheet` primitive if not present (shadcn has `sheet`; reuse)
- Storybook: new mobile states added per CLAUDE.md ("New reusable UI or repeated visual patterns must be added to Storybook first or in the same change")
- `docs/architecture.md` §Project workspace — note the mobile layout mode + the visual-annotation-on-mobile scope limit
- `DESIGN.md` — only if a new visual pattern is introduced (bottom nav is a standard shadcn pattern; likely no new visual language, but document the mobile composer)
- Tests: component tests for the mobile shell states; interaction tests for bottom-nav swap; Storybook tests for the new states.

---

## What is explicitly NOT in scope (YAGNI boundary)

- **End-user uploads to generated storefronts** (the "File upload" platform module) — future work per architecture.md; this batch only builds the *builder-side* upload primitive.
- **Graphify embedded in the generation engine** — answered "no"; it's a dev-navigation tool only.
- **A `Role` model / full RBAC** — admin is an email allowlist this phase; roles come when product needs them.
- **Dark mode for generated apps** — DESIGN.md marks it a future upgrade.
- **Public custom domains / generated-origin execution** — orthogonal; gated on `GENERATED_PUBLIC_ORIGIN` per architecture.md.
- **Rebuilding the deleted debug project** — it's gone; the durable fixes are the deliverable.

---

## Execution order (autonomous)

```
Phase 0  verify (DONE — commit 3e87980)
Phase 1  graphify refresh + bounded search        (no product risk; sets up my own navigation)
Phase 2  shared upload primitive                  (unblocks 6, 5; small surface)
Phase 3  prettier/eslint auto-fix                 (wiring; fast win)
Phase 4  history/restore                          (data exists; additive API+UI)
Phase 5  websearch tool + guardrails              (engine; heavy tests)
Phase 6  read-only sub-agent                      (engine; builds on 5's tool patterns)
Phase 7  waitlist + story + image                 (uses 2; product-facing)
Phase 8  mobile-friendly workspace                (largest; benefits from all)
```

Each phase: TDD where logic, `bun run check` green, one conventional commit, doc updated in-diff. Push via `/push-dev` at natural breakpoints. Never bypass a failing gate.

## Honesty about the 2-hour window

Nine substantial features with TDD + full quality gates exceed two hours of *correct* work. Under the autonomy mandate, I will: land every phase I can to a green, committed, doc-updated state; for phases I cannot finish in-window, I will leave them in a clean, half-done-but-green state with the spec/plan as the resume path, and continue in subsequent autonomous passes until all nine are done. I will not half-build nine things and call them done — each commit is a real, verifiable increment.

## Success criteria (per phase)

- P0: confirmed landed (no action). ✅ already true.
- P1: `graphify-out` refreshed to HEAD; `read_file`/`search_files` accept range/context; tests green.
- P2: POST upload route works, owner-scoped, image-validated, signed GET round-trips, project-delete cleans up; tests green; architecture doc updated.
- P3: pre-commit auto-fixes staged files and re-stages; a misformatted staged file commits cleanly; DEV.md updated.
- P4: snapshot list/restore routes + history UI; restore is append-only; tests + component tests green; architecture doc updated.
- P5: `web_search` tool fail-closed when unconfigured; SSRF/allowlist/sanitize/rate-cap all unit-tested; architecture doc + provider table + .env.example updated.
- P6: `spawn_subagent` is read-only, step-capped, one nesting level, parallel-safe; tests green; architecture doc updated.
- P7: waitlist form submits, image optional, gate redirects correctly, admin can approve; pilot emails seeded; tests green; architecture doc updated.
- P8: mobile bottom-nav + touch composer + mobile code-sheet + mobile-readable states; Storybook + component tests; architecture/DESIGN docs updated.
