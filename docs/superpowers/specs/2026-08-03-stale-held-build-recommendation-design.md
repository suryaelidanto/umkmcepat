# Stale Held Build Recommendation — Design

**Date:** 2026-08-03  
**Status:** Ready for implementation  
**Symptom project (example):** `/projects/cmsbquu2r00024lr8mwkxy74o`  
**Related code:** `WorkspaceShell.tsx` (`getWorkspaceCardFromMessages`, hold/consume localStorage), `workspace-sync.ts` (`getWorkspaceComposerState`)

## Problem

After a project has **already finished building** (`status=ready`, `buildStatus=passed`, persisted `workspaceCard={type:"none"}`), the workspace composer can still show:

> **Rancangan build disimpan**  
> Lanjutkan diskusi dulu, atau buka rancangan saat siap mulai build.

That banner is `HeldBuildRecommendationNotice`, driven by composer state `held_build_recommendation`. It is correct **before** a build when the user parks a rancangan to keep chatting. It is **wrong** after the build has completed and the server card is `none`.

### Observed data (example project)

| Source | Value |
|--------|--------|
| DB `project.status` | `ready` |
| DB `project.buildStatus` | `passed` |
| DB `project.workspaceCard` | `{ type: "none" }` |
| Chat history tool cards (order) | … → `build_recommendation` ("Siap dibangun!") → later `type: "none"` → free chat |

### Root cause

`getWorkspaceCardFromMessages` walks assistant messages newest → oldest and looks for `tool-presentWorkspaceCard` with `state === "output-available"`. On each hit:

```ts
if (!card || typeof card !== "object" || card.type === "none") {
  continue; // skips terminal none, keeps searching older messages
}
```

So a later authoritative **`none`** does not clear the client card. The scan resurrects the older **`build_recommendation`**. Effects that re-apply tool cards from messages then:

1. Set `workspaceCard` back to the stale rancangan.
2. "Chat dengan AI" / hold paths store its signature in  
   `umkmcepat:build-recommendation-hold:<projectId>`.
3. With `held` + `postBuildChatOpen` (or pre-build hold),  
   `getWorkspaceComposerState` returns `held_build_recommendation`.
4. Banner stays while the user only chats — looks like chat is "re-saving" the plan. It is not; the UI is re-applying a dead card from history.

Consumed signatures (`umkmcepat:build-recommendation-consumed:<projectId>`) only update inside `startBuild`. If the card was not current at start-build time, or hold was applied after build, the notice can stick even though build already passed.

### What is not broken

- Server build pipeline and DB state for the example project.
- Indonesian copy for a *legitimate* held pre-build rancangan.
- Free-chat persistence of user messages.

## Goal

1. **Latest terminal `none` wins.** Scanning chat for a workspace card must treat the newest `presentWorkspaceCard` output with `type: "none"` as "no active card" — do not walk past it to older recommendations.
2. **Post-build discuss must not show a held banner for a dead/consumed rancangan.** After a successful build, parking discuss must not re-surface a pre-build plan that was already used or cleared.
3. **No per-project data migration.** Fix is client logic shared by all projects. Reload after fix is enough for existing projects (including the example).

## Scope

**In scope:**

- Extract and unit-test pure message → card scan (terminal `none` semantics).
- Wire `WorkspaceShell` to that helper (replace private function body).
- Harden hold-on-discuss and/or clear-hold-on-successful-build so post-build free chat cannot show `HeldBuildRecommendationNotice` for a stale signature.
- Tests for composer interaction with consumed + held + `buildComplete` (extend existing `workspace-sync` tests if gaps remain).

**Out of scope:**

- Server-side rewrite of chat history to strip old `build_recommendation` tool parts.
- Changing banner copy or Storybook visual redesign of the notice.
- Edit/visual-revision build paths beyond clearing hold when `startBuild` / success already clears it.
- Redis/server storage of hold/consumed sets (localStorage stays).

## Design

### Section 1 — Pure scan: newest tool card, `none` is terminal

Move (or re-export) scan logic into a testable module. Prefer:

- `src/lib/projects/workspace-card-from-messages.ts`  
  **or** export from `workspace-sync.ts` if that file stays the single workspace UI state home.

**Contract:**

```ts
function getWorkspaceCardFromMessages(messages: UIMessage[]): {
  projectTitle?: string;
  workspaceCard: WorkspaceCard;
} | null
```

Walk messages newest → oldest; within each assistant message, parts newest → oldest.

For each `tool-presentWorkspaceCard` / `presentWorkspaceCard` with output available:

| Card | Behavior |
|------|----------|
| Missing / not object | continue |
| `type === "none"` | **return `null` immediately** (terminal clear) |
| `question` / `build_recommendation` | return `{ workspaceCard, projectTitle? }` |

Do not change tool type string (`tool-presentWorkspaceCard`) or readiness of partial tool states (still require `output-available`).

### Section 2 — Shell uses shared helper only

`WorkspaceShell` imports the pure helper. Call sites (message effect, chat-status settle) keep the same apply rules (`isFreshWorkspaceCard`, etc.). With Section 1 fixed, settle no longer re-applies a pre-`none` recommendation.

### Section 3 — Hold / consume hardening (defense in depth)

Minimum required if Section 1 alone is insufficient under hold-from-localStorage:

1. **On successful build settle** (when `buildComplete` becomes true, or at end of successful `startBuild` path already clearing hold):  
   - `localStorage.removeItem(holdKey)`  
   - `setHeldBuildRecommendationSignature(null)`  
   Existing `startBuild` already clears hold and adds consumed signature; ensure success path also clears hold if build completed without going through that client path (e.g. refresh mid-build then complete).

2. **When opening post-build discuss** (`CompletedBuildNotice` `onDiscuss`):  
   - Only hold if there is a current `build_recommendation` signature **and** it is **not** in `consumedBuildRecommendationSignatures`.  
   - Prefer: if `buildComplete` and card is not a *fresh unconsumed* recommendation, open `postBuildChatOpen` without writing hold.

YAGNI: do not invent server-side consume records in this change.

### Section 4 — Tests

| Case | Expected |
|------|----------|
| History ends with `build_recommendation` only | returns that card |
| History has `build_recommendation` then later `none` | returns `null` |
| History has `question` then later `none` | returns `null` |
| History has `none` then later new `question` | returns the new question |
| `buildComplete` + held + consumed + `postBuildChatOpen` | `post_build_chat` (already in suite; keep) |
| Hold discuss only when unconsumed signature | no hold write when consumed |

## Acceptance

1. Open a built project whose chat still contains an old `build_recommendation` followed by `none`: composer is **not** `held_build_recommendation` unless the user parks a **new** unconsumed recommendation.
2. Free chat after build does not show "Rancangan build disimpan".
3. Pre-build flow still works: discuss → recommendation → "Lanjut diskusi" → hold banner → "Mulai build" → consume → no stale re-show of same signature.
4. Unit tests above pass under `bun test` for the touched files.
5. No new deps; no secrets in docs; product copy remains Indonesian where already Indonesian.

## Non-goals / risks

- **Risk:** Treating first-seen `none` as terminal is wrong if a buggy agent emits `none` then a real card in the **same** newer message after `none` in part order — part walk is newest-part-first, so a later part still wins. Across messages, newer message always wins. Acceptable.
- **Risk:** localStorage hold from before fix may still be set on first load; clearing hold when card scan returns null / when buildComplete is true removes the banner without manual key delete.
