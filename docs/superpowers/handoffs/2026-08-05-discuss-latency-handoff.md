# Handoff: discuss latency — report delivered, fixes awaiting approval

Date: 2026-08-05 · Base: `dev` @ `0437770` · **No production code changed.**

## Read this first

**The report is `docs/superpowers/handoffs/2026-08-05-discuss-reliability-t3code-study.md`.**
It is written in Indonesian for the maintainer and holds the full evidence, the t3code comparison,
and the ranked recommendations R1–R11. This file is the English, agent-facing companion: what was
proven, what is blocked, and how to re-verify it yourself.

Do not re-run the investigation. It is done. Start from the decisions in §4.

## 1. Status

- Report: **delivered**, not yet approved.
- Fixes R1–R11: **none implemented**. Do not start coding until the maintainer picks from §4.
- Working tree: clean. Only new file is the report (plus this handoff).
- Original upstream brief: `/tmp/opencode/handoff-t3code-study.md` — **superseded by the report**; several of its priorities were wrong (see §3).

## 2. What was proven

Discuss is **not functionally broken**: 162 of 162 `ProjectChatTurn` rows are `succeeded`
(0 failed, 0 cancelled). The defect is perceived latency.

Anchor case `ct_1ab7e4fb97e045a6aefde67a9da9f809` (project `cmsfbxegq000e4lcov5t5yn1t`):
wall-clock **39,998 ms** = `discuss` 14,816 ms + `compaction` 24,485 ms = 39,301 ms of AI calls (98.3%).

| ID | Finding | Anchor |
|---|---|---|
| T1 | `maybeCompactProjectChat` (avg 17.4 s, max **26.1 s**) runs before `finish` is published — user reads a finished answer with a locked composer. The three degraded paths (`:889`, `:977`, `:1104`) `return` before compaction, so **a failing turn is faster than a successful one**. | `discuss-turn-worker.ts:1429` vs `:1450` |
| T2 | Serial preamble before the stream opens, including a full `moderation` LLM call (avg 2.2 s, max **14.6 s**) plus ~8 DB ops. Client receives no bytes, not even headers. | `api.projects.preview.ts:74→501`, moderation at `:264` |
| T3 | Only `assistantText` streams, and it is capped at one sentence / ~20 words. `workspaceCard` + `briefPatch` do not stream — the card appears all at once at `tool-call`. | `discuss-tool.ts:22`, `discuss-turn-worker.ts:567-606` |
| T4 | Hedging is **off now** (`AppSetting discuss.hedging=false`) but the code path buffers all deltas instead of streaming them, and bills per leg. History: 13 winner / 32 aborted. Re-enabling reintroduces dead air + ~3× spend. | `discuss-turn-worker.ts:481`, `:493`, `:631` |
| T5 | **Real, enforced** CSP break: brand font Plus Jakarta Sans is blocked on every page load. `style-src` lacks `fonts.googleapis.com`, `font-src` lacks `fonts.gstatic.com`. 16 `enforce` violations. | `__root.tsx:86` vs `security-headers.ts:86-87` |
| T6 | Redis pub client is cached forever once created; `redisInitFailed` is only set on the *first* connect failure, never on a later drop. With `enableOfflineQueue:false` every later publish throws until process restart. Latent — harmless while single-process. | `discuss-turn-pubsub.ts:219` |
| T7 | SSE has no `Last-Event-ID`, no `retry:`, no sequence numbers, no heartbeat. Recovery relies on a 500-event in-memory buffer with a 30 s grace. | `turns.$turnId.stream.ts`, `discuss-turn-pubsub.ts:29` |
| T8 | Reattach path ignores every `text-delta`; it listens only for `finish`/`error` then calls `reloadLatestChat()`. Two transports, two behaviours. | `WorkspaceShell.tsx:2617-2648` |
| T9 | Discuss energy debits carry `projectId: null` (6 rows, `reason:"discuss:step"`) → no per-project cost accounting. | — |

## 3. Dead ends — do not chase these

The upstream brief mis-prioritised four items. Verified against DB and source:

- **"Edit pipeline most broken, 80/84 unexpected-failure"** — 100% fixtures. All 80 failures are `projectId:"p1"`; all 84 requests are `projectId:"project_1"`. **Zero real edit traffic** in that log. There is no evidence of an edit bug.
- **"Redis offline = biggest UX breaker"** — no. Worker runs in-process (`instrumentation.ts:47`), `publishProgress` calls `deliverLocal()` first, and there are **zero** `sse-tail-db-fallback` lines. Redis is up (`PONG`). Real bug (T6) but latent.
- **"195 CSP violations blocking previews"** — 171 of 203 are `disposition: report`, blocking nothing (`security-headers.ts:163`). Telemetry noise. The real break hiding under it is T5.
- **"Deployment preview timeouts"** — `deploymentId:"deployment_timeout"` is a fixture at `runtime-proxy.test.ts:244`.

Also: three turns lacking a `finalize` log line (`ct_ab580369`, `ct_ef0f3ed8`, `ct_37678078`) are **not** hung — all `succeeded` in DB. Incomplete logging only.

And: **asset transport is already at parity with t3code.** Both issue signed short-lived URLs
(t3code `contracts/src/assets.ts:26` `relativeUrl`+`expiresAt`; ours `assetToken=v1.…`). No gap. Do not "fix" it.

## 4. Blocking decisions — get these answered before coding

1. **R1 — move `compaction` off the turn** (publish `finish` first, compact as a separate job). Biggest win, smallest change, and the degraded paths already prove early `finish` is safe. *Recommended first.*
2. **R4 — allow Google Fonts in CSP.** Two-line change, restores the brand font. *Recommended, near-zero risk.*
3. **R3 — run `moderation` in parallel with discuss instead of serially.** Saves 2–15 s but means tokens may be spent before a request is rejected. **Product/risk call, not technical.**
4. **R7 — sequence numbers + `afterSequence` resume** (t3code Pattern 1–3). Worth doing now, or defer until web/worker are actually split into separate processes?
5. **Hedging** — leave off? If it is ever re-enabled, T4 must be fixed first or streaming dies again.

Full rationale and the effort/impact table for R1–R11 are in the report — do not duplicate them here.

## 5. Re-verify the evidence yourself

`dev.log` contains bytes that make grep treat it as binary — **`-a` is required** or you get silent empty results:

```bash
grep -aoE '\[umkm:[a-z0-9-]+\] [a-zA-Z0-9:._-]+' dev.log | sort | uniq -c | sort -rn
grep -ao '"disposition":"[^"]*"' dev.log | sort | uniq -c        # 171 report / 32 enforce
```

Postgres runs under podman-emulated docker:

```bash
# turn wall-clock vs summed AI time
docker exec umkmcepat-postgres psql -U postgres -d umkmcepat -c \
"SELECT t.id, EXTRACT(EPOCH FROM (t.\"finishedAt\"-t.\"startedAt\"))*1000 AS wall_ms, SUM(a.\"requestMs\") AS ai_ms
 FROM \"ProjectChatTurn\" t JOIN \"AiCallRecord\" a ON a.\"turnId\"=t.id
 WHERE t.\"projectId\"='cmsfbxegq000e4lcov5t5yn1t' GROUP BY t.id, wall_ms ORDER BY wall_ms DESC LIMIT 8;"

# per-task latency
docker exec umkmcepat-postgres psql -U postgres -d umkmcepat -c \
"SELECT task, count(*) n, round(avg(\"requestMs\")) avg_ms, max(\"requestMs\") max_ms FROM \"AiCallRecord\" GROUP BY task;"
```

Rows where `ai_ms > wall_ms` are hedged turns — parallel legs sum above wall-clock. That is expected, not a bug.

t3code clone (reference only, do not vendor): `/tmp/opencode/t3code` —
`apps/server/src/ws.ts:1144` (subscribe-before-snapshot), `packages/contracts/src/orchestration.ts:1341`
(snapshot/event/synchronized), `packages/client-runtime/src/state/threads.ts:202` (dedupe by sequence),
`packages/client-runtime/src/connection/model.ts:125` (connection state machine).

## 6. Guardrails

- `git status` in this repo lists ~200 phantom `M` files with no real diff. **Use `git diff --quiet HEAD`** (exit 0 = clean) as the real check, and stage explicit paths — never `git add -A`.
- Work from `dev`; PRs into `dev`.
- Gate before handoff: `bun run check`. CI runs `bun run verify`. Never bypass a failing gate.
- Surgical edits only. The `p1` / `project_1` / `deployment_timeout` fixtures are correct as-is — do not "fix" the tests to reduce the error counts.
- Do not run `bun run build` unless the change touches build/deploy behaviour.
- Report is user-facing → Indonesian. Code, logs, and this handoff → English.

## 7. Known, out of scope

`src/routes/api.payment.create.ts:83` — `prisma.user.findUniqueOrThrow` outside `try/catch` → raw 500
when a session user has no `User` row. Agreed in spirit (guard → 401 + re-login), still unimplemented.
Unrelated to discuss latency.
