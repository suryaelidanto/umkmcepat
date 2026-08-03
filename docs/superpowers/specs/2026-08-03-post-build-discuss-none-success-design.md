# Post-Build Discuss: Intentional `none` Is Success — Design

**Date:** 2026-08-03  
**Status:** Ready for implementation  
**Symptom project (example):** `/projects/cmsbquu2r00024lr8mwkxy74o`  
**Related:** `discuss-turn-worker.ts`, `discuss-turn-shared.ts` (`repairDiscussCardWithTool`), `brief-flow.ts` (`hasBuiltSite` force-none), `discuss-tool.ts` (post-build system prompt)

## Problem

On a **built** project (`project.status === "ready"` / `hasBuiltSite: true`), post-build free chat is **discuss-only**. Product policy:

1. System prompt: short Indonesian ack + call `presentWorkspaceCard` with `{ type: "none" }` — no interview cards.
2. `normalizeWorkspaceTurn(..., { hasBuiltSite: true })` forces any model `question` / `build_recommendation` down to `none`.

But the discuss worker still does:

```ts
let primaryToolFailed = workspaceTurn.workspaceCard.type === "none";
if (primaryToolFailed) {
  await repairDiscussCardWithTool(...); // asks for question | build_recommendation
}
// later when still none:
event: "discuss:text-only-fallback"
primaryToolFailed: true
```

So a **correct** post-build outcome is logged and charged as failure + repair. Observed on the example project:

- Chat text works (“Siap, aku bikinin…”)
- Tool output is `workspaceCard: { type: "none" }`
- Logs: `textOnly: true`, `discuss:text-only-fallback`, `primaryToolFailed: true`
- Energy debit `discuss:repair` with `repairsUsed: 0` (repair ran, could not produce a non-none card under `hasBuiltSite`)

User experience: “tool keeps failing / no workspace card to answer,” while free-text still works. Not a client hold-banner bug (that was fixed separately).

## Goal

1. When `hasBuiltSite` is true, a resolved workspace card of `type: "none"` after a successful primary stream with chat text is a **success**, not a primary tool failure.
2. **Do not call** `repairDiscussCardWithTool` when `hasBuiltSite` is true (repair cannot legally produce interview cards; it wastes energy).
3. Log post-build text+none as **`discuss:finish`** with `primaryToolFailed: false` (and accurate `didWorkspaceToolUpdate`), not `discuss:text-only-fallback` with `primaryToolFailed: true`.
4. Pre-build behavior unchanged: missing/invalid card still triggers repair and may still use `text-only-fallback`.

## Scope

**In scope:**

- `runDiscussTurn` success path after primary stream normalizes tool input (the `primaryToolFailed` / repair / hasCard logging branch).
- Optional early return inside `repairDiscussCardWithTool` if `hasBuiltSite` (defense if any other caller appears).
- Unit tests in `discuss-turn-worker.test.ts` for built-site path.
- Spec + plan docs only (this change).

**Out of scope:**

- Wiring post-build chat to `/api/projects/$id/edit` so “ganti warna” mutates the site (product follow-up).
- Changing `createFallbackWorkspaceCard` or interview UX pre-build.
- Client `settleDiscussAfterChatReady` (already settles text-only; no change required if server stops thrashing).
- Rewriting historical chat messages on the example project.

## Design

### Section 1 — Classify intentional post-build none

After `normalizeWorkspaceTurn`:

```ts
const cardIsNone = workspaceTurn.workspaceCard.type === "none";
// Pre-build: none means missing/invalid card → try repair.
// Post-build: none is the only allowed card → never treat as primary failure.
let primaryToolFailed = cardIsNone && !hasBuiltSite;
```

### Section 2 — Skip repair when site is built

```ts
if (primaryToolFailed) {
  // existing repairDiscussCardWithTool path
}
// hasBuiltSite + none: primaryToolFailed is false → no repair
```

Also skip the pre-build promote block already gated on `!hasBuiltSite` (no change).

Defense in `repairDiscussCardWithTool`:

```ts
if (hasBuiltSite) {
  return null; // never spend tokens inventing interview cards post-build
}
```

### Section 3 — Logging and persistence when `!hasCard`

When `hasCard` is false:

| Condition | Event | `primaryToolFailed` | `didWorkspaceToolUpdate` |
|-----------|--------|---------------------|---------------------------|
| `hasBuiltSite` | `discuss:finish` | `false` | `true` if a tool call was present in the stream **or** we still emit protocol none (prefer `true` when we publish `tool-output-available` with none — the turn did settle the card protocol) |
| `!hasBuiltSite` | `discuss:text-only-fallback` (unchanged) | `true` | `false` |

Minimal implementation for post-build none success:

```ts
} else if (hasBuiltSite) {
  await writeAiRequestLog({
    event: "discuss:finish",
    model: modelName,
    mode: "one_call_tools",
    projectId: project.id,
    didWorkspaceToolUpdate: true,
    primaryToolFailed: false,
    repairsUsed: 0,
    workspaceCard: { type: "none" },
  });
  await persistProjectChatTurn({
    messages: safeMessages,
    projectId: project.id,
    userId,
    workspaceCard: { type: "none" },
  });
} else {
  // existing text-only-fallback path
}
```

Do **not** emit `devLog("discuss", "text-only-fallback", ...)` when `hasBuiltSite`.

Optional timing field: `textOnly: true` may remain in timings for observability, but must not imply failure when `hasBuiltSite`.

### Section 4 — Tool-only primary with no chat text + hasBuiltSite

Existing branch `if (!chatText)` still runs repair. Under this design:

- When `hasBuiltSite` and `!chatText`, **do not** repair for interview cards.
- Prefer: persist none + finish succeeded if we can still emit protocol none without inventing Indonesian dummy chat (keep current “no fake text” rule).
- If primary produced nothing usable and `hasBuiltSite`, finalize succeeded with none tool events only, or keep existing failed path only when stream truly errored.

Minimal YAGNI for this ship: in the `!chatText` repair call site, pass through only when `!hasBuiltSite`; when `hasBuiltSite && !chatText`, emit protocol none + persist + finish without repair (same as intentional none).

### Section 5 — Tests

| Case | Expect |
|------|--------|
| Pre-build, text, none card, repair fails | still `text-only-fallback`, `generateText` called (existing test) |
| Built site (`status: "ready"`), text, none card | **no** `generateText` / repair; log `discuss:finish` with `primaryToolFailed: false`; finalize `succeeded`; protocol none tool output |
| Built site, normalize would receive question (mock still returns none after hasBuiltSite policy) | no repair; finish success |

## Acceptance

1. Chat on a `ready` project no longer logs `discuss:text-only-fallback` for intentional none.
2. No `discuss:repair` energy charge solely because post-build card is none.
3. Pre-build missing card still repairs / text-only-fallback as today.
4. Focused worker tests pass; `bun run check` green for the change set.
5. Manual: open example project, send a short edit-intent message — chat replies, no preparing-card thrash, no false failure log.

## Non-goals / risks

- Users may still expect the **website** to change from free chat; that requires edit pipeline, not this fix. Document in product follow-up if needed.
- Risk: treating all post-build none as success hides a real model hang with empty tool — mitigated by requiring successful stream path (existing `hadError` / `!chatText` branches stay separate).
