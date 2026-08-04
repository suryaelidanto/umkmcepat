# AGENTS.md

Boot instructions for AI agents working on UMKM Cepat.

## Read first

- `PRINCIPLES.md`: operating taste and quality bar.
- `DEV.md`: local workflow, commands, quality gate, + the **Cleanliness contract** (behavior-preserving refactors, comment hygiene).
- `PRODUCT.md`: required before product positioning, builder flow, generated-project UX, or design-system decisions.
- `DESIGN.md`: required before UI, styling, layout, typography, colors, or components.
- `docs/superpowers/specs/`: active feature specs
- `docs/superpowers/plans/`: active implementation plans
- Key modules: `src/lib/s3-client.ts` (MinIO/R2), `src/lib/email.ts` (Resend), `src/lib/analytics.ts` (Umami), `src/lib/waitlist-enabled.ts` (gate toggle), `/media/<assetId>` route, `/admin` dashboard
- Generation engine: `src/lib/projects/batched-response.ts` (streamed `<file>` parser), `scaffold/manifest.ts` (auto-derived scaffold manifest), `brief-admission.ts`, `batched-generator.ts`, `batched-edit-targets.ts` + `edit-attempt-worker` wiring. Rollout flag: `generation.batched_rollout` (off|internal|pilot|all); legacy agent loop is the fallback.
- Observability: `AiCallRecord` table + `src/lib/ai-call-record.ts` (`recordAiCall`, `startAiCallTimer`, ttftMs capture). Query by `turnId`/`attemptId`/`projectId`. Raw payloads stay in `.data/tmp/ai-debug/requests.ndjson` (dev-only).
- Discuss hedging: `src/lib/projects/discuss-turn-worker.ts` races up to 3 combos; toggles `discuss.hedging`, `ai.model.discuss_hedge_2/3`; ledger rows tagged `raceRole`; energy debit sums all racers.

## Commands

```bash
bun install
cp .env.example .env
bun run infra
bun run db:migrate
bun run dev
bun run check      # fast manual gate: parallel format/lint/typecheck/affected tests/Knip
bun run verify     # locks + route regen + format/lint/typecheck/full tests/Knip (CI also runs build + Storybook)
```

- When debugging, read `dev.log` at repo root and `docker compose logs`; see `DEV.md`'s Debugging section for the full workflow.

Local quality gates are automated:

- **Pre-commit** runs `bun run check:commit`: lockfile guard plus prettier/eslint on staged files only. No typecheck, no tests, no Knip at commit time.
- **No pre-push hook.** Push is intentionally cheap locally; CI runs the full suite on every push to `dev`/`main` and on every PR.
- **CI** runs Storybook build, Storybook tests, Chromatic visual tests (if token), `bun run build`, then `bun run verify`. This is the real quality gate.
- The local `bun run check` is the manual fast gate (parallel format/lint/typecheck/`test:changed`/Knip) — a feedback loop, not a substitute for CI. Both must pass before anything reaches `main`.
- During fast iteration, run the nearest focused test plus targeted ESLint; do not repeatedly run the full suite. Never bypass a failing gate.

`bun run verify` regenerates the route tree and runs format/lint/typecheck/full unit tests/Knip. It does not run `bun run build` or Storybook — those are separate CI steps. Use it before handoff without a push, or when you want to confirm a clean state locally.

`bun run sweep:project-orphans` purges `.data/project-*` dirs whose IDs are not in the DB. Run after deleting projects via the DB / CLI (the homepage's delete path runs cleanup automatically).

`bun run infra` starts full local infra (no Compose profiles): Postgres, Redis (BullMQ), 9Router, Headroom, and MinIO (local S3 on `http://localhost:9000`; `scripts/init-s3-buckets.ts` auto-creates the two buckets from `MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD`). Use `bun run infra:minimal` for Postgres + Redis only.

Optional Storybook:

```bash
bun run storybook
bun run storybook:build
bun run test:storybook
```

## Rules

- Optimize for the next capable agent with zero session context: leave canonical docs, scripts, and checks clear enough that future work resumes in minutes, not archaeology.
- Use Bun only; keep `bun.lock` as the canonical lockfile.
- Work from `dev`; open PRs into `dev` unless maintainers say otherwise.
- Keep changes small, focused, and easy to review.
- Surgical edits: touch only what the task requires. Match surrounding style. Don't refactor, "improve," or clean up adjacent code, comments, or formatting unless asked. Notice unrelated code that looks broken or dead? Mention it in your response — don't edit it. Clean up only your own mess (unused imports/vars your edit created).
- Uncertain about a dependency or the intent of existing code? Stop and ask. Don't guess, and don't rewrite logic that already exists — search and reuse first.
- Prefer deletion, reuse, platform features, and existing dependencies before adding code.
- User-facing product UI copy uses Indonesian; developer-facing docs/code/logs/errors use English.
- Follow `PRODUCT.md`, `DESIGN.md`, and `.agents/skills/impeccable` before frontend design work; do not introduce new visual language without updating the canonical design context.
- New reusable UI or repeated visual patterns must be added to Storybook first or in the same change.
- Use Graphify for non-trivial codebase discovery when available; do not add it as a project dependency.
- Docs are part of the change: if behavior, setup, env, architecture, provider, storage, deployment, UI system, or product flow changes, update the canonical doc in the same diff or state why docs did not change.
- Pre-commit runs `bun run check:commit`; CI runs `bun run verify`. Never bypass a failing gate. Before handoff without a push, run `bun run check` explicitly.
- Do not run `bun run build` unless requested or touching build/deployment behavior.
- Never commit `.env`, secrets, OAuth credentials, API keys, private data, local uploads, logs, screenshots, `.next/`, `.pi/`, `.browser/`, `graphify-out/`, `storybook-static/`, or coverage artifacts.
- Never write secrets into tracked files: no API keys, access keys, secret keys, tokens, passwords, account IDs, or credentialed connection strings in `.md`, docs, specs, plans, comments, commits, or fixtures. Env blocks in docs use empty `""` values, never real values — not even as a "before" block or a "to show current state" example. This repo is public; a secret in a tracked file is a secret leaked.
- Never echo `process.env` or secrets to the terminal or logs. Assume a developer is watching on streaming mode and reads every `console.*`/log line live. To reference an env var in a log, print its name and a set/unset boolean, never the value. No parsed `.env` dumps, no auth-header logs, no "redacted" values that can be reversed.
- Open-source mindset: this repo is public, seen by millions, and safe for anyone to clone. Treat every tracked file, commit, and log line as public forever. Secrets live only in `.env` (gitignored) or deployment secrets. Before writing any value into a tracked file, ask: "am I fine if this appears on the public GitHub front page tomorrow?"
