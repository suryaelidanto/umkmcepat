# Discuss Hedging — Design

**Date:** 2026-08-04
**Status:** Draft
**Depends on:** AiCallRecord ledger spec; the on-disk discuss worker pipeline.
**Related:** `src/lib/projects/discuss-turn-worker.ts` (streamText call), `src/lib/projects/discuss-tool.ts` (card schema + tool), `src/lib/app-settings-registry.ts` (admin settings), `src/lib/ai-models.ts` (combo resolution), `src/lib/projects/discuss-turn-sse-tail.ts` (SSE relay)
**Read this if you have zero context:** self-contained. Explains what hedging is, where it runs, what it costs, how it degrades safely, and how to test.

## Problem

Measured in the previous handoff (`/tmp/opencode/umkmcepat-discuss-latency-handoff.md`): discuss turns are bimodal — p50 ~4s, p95 ~30s. The long-tail is upstream provider streaming of tool-args JSON, not our code. Failures over provider-specific 422s and a DeepSeek DISCONNECT have also been observed.

`toolChoice: required` is a hard product constraint: every discuss turn MUST show a workspace card, no exceptions.

## Decision

Run the discuss turn as **three parallel requests to three different 9Router combos** (each backed by a different provider family). The first stream that completes with a **valid** workspace card wins. The two losers are aborted promptly; their partial tokens are billed to the user (transparency chosen deliberately: users get what they actually bought, no hidden subsidy).

This is the tail-latency killer. Two streams just double the joint p95 tail to P(both slow) → very low. Three makes it negligible, and each model costs cents. Switching provider families matters because correlated failures (one provider being slow or down for a span) shouldn't take all three options down.

## Why not more or fewer hedges

- 1 hedge: original behavior; grows p95.
- 2 hedge: helps a lot; both can land on a struggling provider family on bad days.
- 3 hedge: our choice. Cost stays ~2–6× sub-cent per turn. Beyond that there's no measurable gain.

Combo contents (set by operator; mirrors already exist):

- Hedge A: `xiaomi/mimo-v2.5`
- Hedge B: `z-ai/glm-4.6v`
- Hedge C: `minimax/minimax-m3`

All three are image-capable — required because discuss inlines owner-uploaded images.

## Where it hooks

`src/lib/projects/discuss-turn-worker.ts` is the only place this lives. The existing body:

```
claimDiscussTurn → ensure progress channel → enqueue → streamText(card-tool)
→ if invalid → repairToolCallInTurn once → text-only fallback
```

becomes:

```
claimDiscussTurn → ensure progress channel → enqueue
→ fire three streamText calls in parallel via hedge configs (discuss-combo, discuss-combo-2, discuss-combo-3)
→ first clean stream wins; abort others
→ if winner's card invalid → repairToolCallInTurn once using the winner's conversation
→ if still invalid → text-only fallback (unchanged)
```

## Event discipline

- `publishProgress(turnId, ...)` gets events only from the chosen winner. Loser streams must not publish; canceling them via `AbortController` is synchronous with their internal lifecycle.
- TTFT is recorded *per racer* to AiCallRecord (`task: "discuss"`, `raceRole: winner|aborted`, `hedged: true`).
- The tool-choice is still `required`; schema compatibility is verified during deployment.

## Energy accounting (1:1 transparency)

Each racer's tokens are summed into the turn's energy debit:

```
userEnergy = winnerTokens + loserATokens + loserBTokens
```

`UserCredit` sees a single debit for the total. `AiCallRecord` has one row per racer, labeled winner/aborted, which is what you use when users ask, "why did this turn cost 4k energy?" — because the answer is "you paid for three races; here's exactly what each did." That transparency is the product truth, not a bug.

Repair and compaction calls (when they run) are billed additively on top of the race: the turn's repair leg gets its own `AiCallRecord` row and its tokens join the same turn debit — the user pays for racer calls and repair calls alike, and the ledger shows each as its own row.

## Hedges seen by the UI

- **Perceived latency**: winner arrives at min(A,B,C). When B is enabled — best-effort partial tool-JSON extraction — the leading stream starts showing card text as it streams (existing `nextAssistantTextDeltaFromPartialToolJson`). The other two streams don't paint to the UI.
- **Failures**: if all three fail, the same text-only fallback as today kicks in — the UI gets a chat text response instead of a card. The existing Redis-drop / SSE tail DB-poll fallback is untouched.

## Partial-tool-args streaming ("B")

Where flagged providers support Anthropic-style fine-grained tool streaming 9Router returns partial JSON chunks. The existing extractor pulls live user-visible text from those chunks. Where it doesn't apply the UI waits for the closure (same as today). This is best-effort, off by default where providers can't support it.

## Deploy-time compatibility check

A one-time script verifies each hedge model accepts the tool schema (the known 422 trigger). The script runs three identical tiny cards against each combo; a 422/fail on any one is a red flag that blocks rollout until operator updates combos. This avoids discovering a schema-incompat provider during production traffic.

## Settings / env (removed-config risk handled intentionally)

New admin settings, in same group as existing keys (`AI advanced`):

- `ai.model.discuss_hedge_2` (env: `AI_MODEL_DISCUSS_HEDGE_2`)
- `ai.model.discuss_hedge_3` (env: `AI_MODEL_DISCUSS_HEDGE_3`)

Empty = that hedge leg off. Both empty = only primary combo fires (initial state, backward compat). Operator edits them in `/admin/settings`; each combo label must exist in 9Router.

`default-combo` doesn't need a hedge — it's the net for misconfig.

## Observability

Complete data exists in one place because every call pass `recordAiCall`:

- `turnId` groups all three racers.
- Per-racer `ttftMs`, `requestMs`, `status`, `errorClass`.
- `raceRole` shows who won and who was killed.
- Aggregated: p95 per task in a time window is a single SQL query.

The existing `[umkm:discuss] timings` log lines remain as a human-visible trace; database is the durable index.

## Risk register

| Risk | Mitigation |
|---|---|
| Pricing bug on hedged calls (double-count) | AiCallRecord sums match UserCredit exactly per turn; tested. |
| Abort doesn't stop streaming | AI SDK's abort contract is well-defined; cancel both body and generator; tested. |
| 422 provider refuses schema | Deploy-time schema check gates config creation. |
| All three fail simultaneously | Text-only fallback path (already exists, unchanged). |
| Hedge memory pressure / connection ceiling | 3-concurrency per turn, bounded by queue concurrency of node workers. Existing limits hold. |
| Model degeneration | Not possible: all three are gated by tool choice and card validation. |

## Success criteria

1. Discuss p95 < 4s on a 20-sample production run.
2. Valid-card rate ≥ 95% across a 50-turn sample.
3. No "Coba lagi" banner while server succeeded (regression from incident `eee3cd8` specifically is linted against).
4. AiCallRecord shows exactly 3 rows per hedged turn with role tags; sums match UserCredit.
5. When hedge settings are blank, behavior is indistinguishable from current single-call.
6. Worker's "stop the world if moderation says no" gating still applies first (as today).
