# Per-Step Energy Metering

**Date:** 2026-07-25
**Status:** Approved, not implemented

## Problem

Energy accounting is correct in aggregate but wrong in two ways.

**Three call sites burn tokens without charging.** All three cost the platform, never the user — nobody is overcharged, but the platform eats real money and the ledger understates actual usage.

| Site | Why it leaks |
|---|---|
| `src/lib/projects/custom-source-generator.ts:526` `runSubagent` | Separate `generate()` with its own 15-step tool loop. Returns `Promise<string>`; usage never extracted. Parent's `result.usage` cannot include it. |
| `src/lib/projects/discuss-turn-shared.ts:245` `repairToolCallInTurn` | Runs inside the SDK's `repairToolCall` callback, which is invoked from `parseToolCall` — not a step. Parent usage sums only steps, so this is excluded. |
| `src/routes/api.projects.preview.ts:562` manual card repair | `repairDiscussCardWithTool` returns accumulated usage; the handler at `:514-590` ignores it. No `chargeEnergyForAiUsage` in that branch. |

**Charging is per-turn, not per-step.** A 60-step build debits once at the end. The energy meter sits frozen for the whole build, then drops all at once. Three consequences: the displayed balance is stale during the longest operations; a single overrun can push premium balance below zero because the pre-gate only checks a minimum (`MIN_ENERGY_BUILD` 40,000) and the real cost is billed after; and a user cannot see what any individual step cost.

Not a problem: tool-loop steps are already billed correctly. `ToolLoopAgent.generate` delegates to `generateText`, whose `usage` is `steps.reduce(addLanguageModelUsage)` — every `read_file` / `write_file` / `search_files` round-trip is included. Verified against `ai@^7.0.28`.

## Goals

- Every token that burns charges energy, in near-realtime, visibly.
- Balance never goes negative.
- A user can see what each step cost.

## Non-goals

- **Refunds.** Per-step charging makes them largely moot: a build that dies at step 3 was only charged for 3 steps. Tokens genuinely burned are not refunded — the platform should not eat cost for a failure the user's own prompt may have caused. This preserves the existing documented policy in spirit while making it far less punishing.
- Changing pricing, the free/premium split, the daily limit, or the WIB day boundary.
- Reworking `addEnergyUsage`'s transaction, which is already race-safe and correct.

## Design

### 1. Step charger

Everything hangs off `onStepFinish`, an ai-sdk hook on `generateText` / `streamText` called after each step with that step's own `usage`. This is the per-step charge point. It requires no plumbing through tool return contracts.

New in `src/lib/user-credits.ts`:

```ts
chargeEnergyForStep(opts: {
  userId: string;
  modelId?: string | null;
  inputTokens: number;
  outputTokens: number;
  reason: string;
  projectId?: string | null;
}): Promise<{ energyUsed: number; remaining: number } | null>
```

Wraps the existing `addEnergyUsage` (unchanged) and additionally returns `remaining`, so callers can decide whether to continue. Like `chargeEnergyForAiUsage`, it never throws into the request path.

New in `src/lib/projects/energy-step-charger.ts`:

```ts
createStepCharger(opts: { userId; projectId?; reason; modelId }): {
  onStepFinish: (step) => Promise<void>;
  isExhausted: () => boolean;
  totals: () => { inputTokens; outputTokens; energyUsed };
}
```

One helper wired identically at every call site in a single line. It charges synchronously inside `onStepFinish` — correctness over the ~2–5ms, and exactness is what makes stop-at-zero reliable.

Sub-agents construct their own charger with `reason: "build:subagent"`. This closes the `runSubagent` leak with no change to the `spawn_subagent` tool's return type.

### 2. Stop at zero

`stopWhen` in ai v7 accepts an array of predicates:

```ts
stopWhen: [isStepCount(generateSteps), energyExhausted(charger)]
```

`onStepFinish` charges and records `remaining`; `energyExhausted` returns true once it reaches zero. The loop halts cleanly after the current step completes.

Partial work survives by construction: the generator writes files through `runCommand` into the project directory as it goes, so anything written before the halt stays on disk.

Routes surface a distinct outcome, `energy_exhausted`, rather than a build failure — the UI shows "energi habis, isi ulang untuk lanjut" (Indonesian, per the product copy rule), not an error state.

Balance can undershoot by at most one step's cost, never a full build's. Combined with the existing pre-gates, negative balance becomes unreachable in practice.

### 3. Ledger and realtime UI

One `UserCredit` row per step. `reason` becomes structured and enumerated:

`build:step`, `build:subagent`, `build:spec`, `build:repair`, `discuss:step`, `discuss:repair`, `edit:step`, `moderation`

`reason` is `VarChar(64)`; the `" (Premium)"` suffix appended for premium rows stays as-is.

Schema change — `UserCredit` gains:

```prisma
projectId String?
project   Project? @relation(fields: [projectId], references: [id], onDelete: SetNull)

@@index([userId, expiresAt, createdAt])
@@index([projectId, createdAt])
```

`projectId` is nullable: moderation runs before a project exists, and payment grants have no project at all. `onDelete: SetNull`, not `Cascade` — deleting a project must not erase billing history.

Realtime: the charger publishes `{ energyUsed, remaining }` through the existing `publishProgress` pub/sub already used by the discuss worker, which reaches the client over the existing SSE stream in `api.projects.preview.ts`. `EnergyDisplay` subscribes and updates live. No new transport.

New UI: an itemized ledger — step, model, input/output tokens, energy — grouped by project. The moving meter is the visible half of transparency; the itemization is the substantive half.

**Write volume.** Roughly 60–120 rows per build, since the free/premium split can emit two rows per step. Accepted deliberately over coalescing: a coalesced meter is realtime but its ledger is not, and "what did step 34 cost" becomes unanswerable. Postgres handles this scale on an indexed `SUM(amount)`. If `getEnergyStats` ever degrades, the fix is a materialized running total, not batching.

### 4. Remaining two leaks

- `src/routes/api.projects.preview.ts:562` — the handler already holds `turn.usage`; add a `chargeEnergyForAiUsage` call with `reason: "discuss:repair"`.
- `src/lib/projects/discuss-turn-shared.ts:245` — charge directly from that call's `result.usage`, `reason: "discuss:repair"`. It is not a step of the parent, so it cannot use `onStepFinish`.

## Testing

Unit (`src/lib/user-credits.test.ts`, plus a new charger test):

- Exhaustion boundary: charger reports exhausted exactly when remaining reaches 0, not before.
- Free→premium rollover mid-loop: a loop that crosses the daily free limit splits correctly across steps.
- Zero-usage step is a no-op, writes no row.
- `projectId` null path (moderation) still charges.

Integration:

- A build that exhausts energy mid-loop halts, returns `energy_exhausted`, and leaves already-written files intact.
- A build with a spawned sub-agent produces `build:subagent` ledger rows.

## Docs

`docs/architecture.md:50` currently reads "Energy is charged for the full turn even on disconnect." Rewrite to describe per-step charging: work is charged as each step completes, so a disconnected or halted turn is charged only for steps that actually ran.

`PRODUCT.md` energy section gains a line on the itemized ledger.

## Phasing

1. Step charger + `chargeEnergyForStep` + schema migration. Wire into the build agent only.
2. Stop-at-zero predicate + `energy_exhausted` outcome + UI copy.
3. Remaining call sites (discuss, edit, sub-agent), the two direct-charge leak fixes, realtime SSE, itemized ledger UI.
