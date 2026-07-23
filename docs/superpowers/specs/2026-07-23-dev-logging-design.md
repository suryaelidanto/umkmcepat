# Dev Logging Redesign — Design Spec

Date: 2026-07-23
Status: Approved (brainstorming complete)

## Goal

Let an AI agent debug UMKM Cepat with zero human intervention. A zero-context
agent should be able to read `dev.log` + `docker compose logs`, cross-reference
the raw AI request dump, and reconstruct a failure's causal chain without asking
the user to copy-paste anything.

## Non-goals

- No new logging dependency (Pino, Winston, etc.). Bun + node `fs` only.
- No in-container file logging for Docker services — `docker compose logs` stays
  the infra-debug path.
- No semantic-AI-failure suppression. Recovery rules in `PRINCIPLES.md` and
  `DEV.md` still hold; logging is additive, not behavior-changing.

## Current state

- `bun run dev:verbose` sets `UMKM_VERBOSE_DEV=1` and runs vite
  (`scripts/dev-verbose.ts`, 17 lines).
- `devLog()` in `src/lib/dev-log.ts` no-ops unless `UMKM_VERBOSE_DEV` is truthy,
  printing `[umkm:scope] event {json}` to `console.warn`.
- `ai-request-log.ts` writes raw AI request/response payloads to
  `.data/tmp/ai-debug/requests.ndjson`, gated on the same `UMKM_VERBOSE_DEV`.
- Existing `devLog` call sites: `custom-source-generator.ts`, `build-worker.ts`,
  `agent-tool-runner.ts`, `runtime-proxy.ts`, `shared-node-modules.ts`,
  `progressive-save.ts`.
- `.gitignore` already covers `*.log` and `/.data/`.
- `DEV.md` documents `dev:verbose` + `UMKM_VERBOSE_DEV` in "Local runtime".

## Design

### 1. Gate by runtime mode, not an env toggle

`devLog()` is gated solely on `process.env.NODE_ENV !== "production"`. In dev
(`vite dev`, `NODE_ENV=development`) it writes; in a prod build it no-ops.

**`UMKM_VERBOSE_DEV` is deleted** from:

- `src/lib/dev-log.ts` (the `VERBOSE_VALUES` set + `isVerboseDevLoggingEnabled`)
- `src/lib/ai-request-log.ts` (the gate)
- `.env.example`
- `scripts/dev-verbose.ts` (the whole file is removed)

The stdout `console.warn` line is dropped too — the terminal stays quiet (vite's
own output only); the file is the always-on record. To watch live, the user runs
`bun run dev:logs` in a second terminal.

### 2. File sink + rotation

A file logger (folded into `src/lib/dev-log.ts` or a sibling `dev-file-log.ts` —
folded preferred, single surface) appends every `devLog` event to `dev.log` at
the **repo root**. It uses `appendFile` (matches the `ai-request-log.ts`
precedent). On each write it checks file size; at ~5 MB it renames
`dev.log` → `dev.log.1` (overwriting any prior `.1`) and starts a fresh
`dev.log`.

- Path: `<repo-root>/dev.log` (+ `dev.log.1` rotated). NOT under `.data/` — that
  directory is reserved for user/project-generated state (uploads, artifacts,
  runtime data). A debug log is a tooling artifact and lives at root.
- Never deletes on crash — a crash is precisely when the log is needed. Bounded
  growth is handled by rotation, not deletion.
- `ai-request-log.ts` switches from its own gate to the always-on file path,
  so raw AI payloads land in `dev.log` too (keeping `requests.ndjson` as the
  raw-dump sink for long payloads that would bloat the human-readable log).

`.gitignore` gets explicit `/dev.log` and `/dev.log.1` lines. These are
redundant with the existing `*.log` rule but intentional — self-documenting and
survives `.gitignore` reordering.

### 3. Commands

- `bun run dev` → vite, **always writes `dev.log`**, terminal quiet.
- `bun run dev:logs` → **new**, tails `dev.log` (`scripts/dev-logs.ts`).
- `bun run dev:verbose` → **retired** (removed from `package.json` + script file;
  its purpose — agent-readable logs — is now always on in dev). Document the
  removal in DEV.md.
- `bun run dev:reset` → unchanged.

No new dev dependencies.

### 4. New instrumentation

~20-25 new `devLog()` calls across the three pipelines that produce
agent-debuggable failures. Each call carries a **correlation id**
(`projectId` + `turnId` or `requestId`) so an agent greps one id and reads the
full causal chain in order.

- **AI requests** — `src/lib/ai-moderation.ts`, discuss worker
  (`src/lib/projects/discuss-turn-worker.ts`), `src/routes/api.projects.preview.ts`:
  request-start (model, mode, messageCount, correlation id), response-parsed,
  unexpected-response, auth-fail, timeout.
- **Discuss/chat turns** — `src/lib/projects/discuss-turn.ts`,
  `replayTurnFromDb` in `src/routes/api.projects.preview.ts`:
  claim, duplicate-rejected, finalize(success/fail/cancel), replay-from-db,
  client-auto-resume.
- **Build/source-gen** — `src/lib/projects/build-worker.ts` (add to existing
  checkpoints), `src/lib/projects/custom-source-generator.ts`: source-gen
  start/finish, repair-attempts, failure-reason.

No new calls in routine DB-row, storage-op, or rate-limit paths — keep `dev.log`
signal-dense so the causal chain isn't buried in routine noise.

### 5. Documentation

**`DEV.md` — new "Debugging" section** (replaces the `dev:verbose` prose in
"Local runtime"):

> When something breaks:
> 1. Grep `dev.log` for the project id or error string; read events in order to
>    reconstruct the causal chain.
> 2. Cross-reference `docker compose logs` (`bun run infra:logs`) for infra
>    failures (9Router, Headroom, Postgres).
> 3. Cross-reference `.data/tmp/ai-debug/requests.ndjson` for raw AI payloads.
> 4. Run `bun run graph:update`, then navigate the source tree before searching
>    blindly — Graphify is the default discovery step.
>
> `bun run dev:logs` tails `dev.log` live in a second terminal.

Also remove the `dev:verbose` command block and the `UMKM_VERBOSE_DEV`
paragraph from DEV.md's "Local runtime" section (lines ~27-33).

**`AGENTS.md`**:

- Add a one-line pointer in "Commands" or "Read first" to DEV.md's Debugging
  section so a booting zero-context agent finds the workflow.
- Sharpen the existing Graphify line (line 60) from "Use Graphify for non-trivial
  codebase discovery when available" to a **default-first** step: run
  `bun run graph:update` then navigate the tree before blind grep/search.

## Files touched (summary)

- `src/lib/dev-log.ts` — rewrite: mode-gate, add file sink + rotation, drop
  `UMKM_VERBOSE_DEV`/`isVerboseDevLoggingEnabled`.
- `src/lib/ai-request-log.ts` — drop `isVerboseDevLoggingEnabled` gate; route
  to always-on file path.
- `scripts/dev-verbose.ts` — deleted.
- `scripts/dev-logs.ts` — new tail script.
- `package.json` — remove `dev:verbose`, add `dev:logs`.
- `.env.example` — remove `UMKM_VERBOSE_DEV` (if present).
- `.gitignore` — add `/dev.log`, `/dev.log.1`.
- `src/lib/ai-moderation.ts`, `src/lib/projects/discuss-turn-worker.ts`,
  `src/routes/api.projects.preview.ts`, `src/lib/projects/discuss-turn.ts`,
  `src/lib/projects/build-worker.ts`,
  `src/lib/projects/custom-source-generator.ts` — new `devLog` checkpoints with
  correlation ids.
- `DEV.md` — new Debugging section; trim Local runtime.
- `AGENTS.md` — debugging pointer + Graphify-first rule.

## Testing

- Unit: `dev-log.ts` writes to a temp `dev.log`, rotates at the cap, no-ops in
  production mode (`NODE_ENV=production`).
- Manual: `bun run dev` produces `dev.log` with `[umkm:scope]` lines; crash
  leaves the log intact; `bun run dev:logs` streams it.
- Gate: `bun run check` (Knip must not flag removed `UMKM_VERBOSE_DEV` refs;
  no unused exports).
