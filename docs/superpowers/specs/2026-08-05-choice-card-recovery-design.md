# Choice-Card Recovery for Malformed Options — Design

**Date:** 2026-08-05
**Status:** Draft
**Related:** `src/lib/projects/brief-flow.ts`, `src/lib/projects/discuss-tool.ts`
**Read first if you have zero context:** This doc is self-contained. It explains why users see plain text inputs instead of choice/image cards, and the minimal recovery we ship.

## Problem

Users overwhelmingly see **text inputs** instead of radio/checkbox choice cards. Debug capture proved the chain:

1. minimax-m3 (the frequent hedge winner) sometimes emits choice cards with **malformed options** — an array of empty strings instead of `[{ label, description }]` objects:

   ```json
   "answerMode":"choice", "options":["","",""]
   ```

   Minimax is inconsistent: the same question can produce valid `[{label,description}]` one turn and `["","",""]` the next.

2. Our normalizer (`brief-flow.ts:554` `coerceQuestionOption`) drops entries with empty labels → `options:[]` → `options.length < 2` → `answerMode` is **forced to `"text"`** (`brief-flow.ts:515-516`).

Result: a question that should render as a choice card degrades to a plain text input. The user asked "why is everything a text box?" — this is why.

This is **not** a UI bug (`WorkspacePrimitives` renders choice correctly when options exist) and **not** a race-design bug per se — the trigger is minimax's malformed options plus the normalizer's lack of recovery.

## Design

### 1. Normalizer: honor the model's intended `answerMode`

`normalizeQuestion` currently downgrades to `text` whenever it cannot parse ≥2 options. Change the fallback so a `choice`-intended card is **not** silently relabeled `text`:

- When `candidate.answerMode === "choice"` but `< 2` valid options parsed, still emit a **choice** card with whatever valid options exist (≥1). This keeps the UI in choice mode (radio/checkbox + the built-in custom-answer affordance) instead of degrading to a text box.
- Only force `text` when the model explicitly said `text`, or when zero options are available.

Net: minimax's `options:["","",""]` → a choice card with **zero options** → the UI shows the choice container with just the custom-answer option, and (below) we harden the prompt to stop it happening.

> ponytail: with zero valid options a choice card shows only the custom-answer input. The real fix is preventing empty options (prompt hardening, #2); this guard just stops the false `text` label. Upgrade path: option-3 race rework (prefer the winner whose card parses) if minimax keeps misbehaving.

### 2. Prompt hardening: options must be `{label, description}` objects

Add an explicit negative example to the discuss tool prompt (`discuss-tool.ts`) so all models — especially minimax — stop emitting string/empty options:

- State options must be an array of `{ label, description }` objects (2-5).
- Explicitly forbid `options: ["", "", ""]` / string arrays / empty strings — these invalidate the card and force a plain text box.

## Constraints / non-goals

- Do NOT rework the hedge race to prefer a non-degraded winner (option 3) — larger, riskier, deferred.
- Do NOT change combo contents or hedge config.
- Do NOT add a debug log (already removed).
- Choice card with 0 options is acceptable as an edge fallback; prompt hardening is the primary lever.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Choice card with 0 options (only custom-answer shows) | Prompt hardening reduces frequency; better than silently forcing `text` and lying about intent. |
| minimax keeps sending empty options despite prompt | Deferred option-3 race rework; or operator swaps hedge-3 combo. |
| Existing stored cards unaffected | Change applies to new charges/renders only. |

## Success criteria

1. A minimax turn emitting `options:["","",""]` with `answerMode:"choice"` produces a **choice** card (not `text`).
2. `bun run check` passes.
3. Unit test covers the malformed-options → choice recovery path.

## Done when

Normalizer keeps `choice` on malformed options; prompt forbids string/empty options; unit tests added; `bun run check` green.
