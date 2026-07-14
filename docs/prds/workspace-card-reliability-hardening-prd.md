# PRD: Workspace Card Reliability Hardening

Status: active
Created: 2026-07-13
Updated: 2026-07-13
Owner: Surya
Scope: discuss-turn workspace card lifecycle, client/server repair race, loading state, recovery UX
Read when: changing workspace card stream handling, repair fallback, chat reload timing, card polling, retry UI, or any discuss-mode reliability work
Do not read for: build generation, runtime supervisor, preview proxy, publishing, auth, moderation, or non-discuss AI paths
Current truth: source code + `docs/architecture.md` + `docs/prds/guided-discuss-reliability-prd.md` + `docs/prds/ai-streaming-reliability-hardening-prd.md` + `docs/prds/confidence-driven-discussion-and-ai-decided-output-prd.md` + this PRD

## Status History

- 2026-07-13: Proposed after auditing the discuss-turn race condition that surfaces stale workspace cards and drops chat messages when the primary tool call fails and the server-side repair pass is in flight.

## Problem Statement

UMKM Cepat's guided discuss turn uses one streaming AI call that emits both visible chat text and a hidden `setWorkspaceUi` tool call carrying the next workspace card. When the primary tool call fails to produce a tool output (the model returns `finishReason: stop` despite `toolChoice: required`, the provider times out, or the 9Router combo fails over mid-stream), the server runs a bounded repair pass inside `onFinish` to recover the next card.

From the user's perspective, this recovery is invisible until it breaks. The stream closes before the repair completes, the client transitions `streaming → ready`, and a status-driven effect reloads workspace and chat state from the database. Because the repair has not persisted the new card yet, the client receives the previous (already-answered) card and the chat messages that predate the latest turn. The user sees the previous question reappear, the chat they just typed vanish, and the composer lock up because the card's question is already answered. This feels like an error even though the server eventually succeeds.

The product must feel fully reliable: the chat text always appears, the next card always arrives (smoothly, with a brief loading state if the server is still repairing), the chat history never disappears, and if recovery genuinely fails, the user gets a clear, in-place retry without losing context.

## Solution

Harden the discuss-turn workspace card lifecycle on the client so the user never sees the repair race as an error. Three layers, all client-side, preserving the existing server repair logic and persistence invariants:

1. **Stale-card suppression.** When the stream finishes and the latest user message has already answered the active card, the client must not overwrite the visible card with the stale database copy. Instead it shows a preparing state and polls the workspace endpoint until the card changes (new question id, new card type, or build recommendation) or a bounded timeout elapses.
2. **Preparing state instead of error state.** The current "AI belum sempat menyiapkan pilihan" red panel appears the instant the stream ends with a missing tool output. It is replaced by a neutral loading state ("Menyiapkan pertanyaan berikutnya...") that covers the normal 2-13s repair window. The red retry panel only appears after the bounded poll timeout, so the common case never surfaces an error.
3. **Recovery that preserves context.** When recovery genuinely fails (timeout), the chat text stays visible, the composer stays usable, and the retry button uses the server's `Retry-After` header with a visible countdown. Chat reload is deferred until the card is fresh, so the latest user message is never replaced by a stale database snapshot mid-repair.

## User Stories

1. As a UMKM owner, I want the chat text to always appear when I send an answer, so that I never feel like my message was lost.
2. As a UMKM owner, I want the next question card to always appear after my answer, so that the conversation feels continuous.
3. As a UMKM owner, when the AI takes a moment to prepare the next question, I want to see a calm loading state, so that I know the app is still working and not broken.
4. As a UMKM owner, I never want to see the question I just answered reappear, so that I do not think the app reset.
5. As a UMKM owner, I never want my latest chat message to disappear after I send it, so that I trust the app remembers what I said.
6. As a UMKM owner, if the AI genuinely cannot prepare the next question, I want a clear retry button in the same place, so that I know exactly what to do next.
7. As a UMKM owner, when I click retry, I want my chat and my previous answer to stay visible, so that I do not lose context.
8. As a UMKM owner, when the server tells me to wait before retrying, I want a visible countdown, so that I am not surprised by a disabled button.
9. As a UMKM owner, I want the workspace to recover automatically without me pressing anything, so that the normal case is zero-friction.
10. As a UMKM owner, I want the preparing state to end as soon as the next card is ready, so that I am never waiting longer than necessary.
11. As a UMKM owner, if the repair takes too long, I want a fallback retry button, so that I am never stuck on a loading state forever.
12. As a UMKM owner, I want the composer to stay locked while the next card is being prepared, so that I cannot accidentally send a second answer before the next question is ready.
13. As a UMKM owner, I want the composer to unlock as soon as the next card arrives, so that I can answer immediately.
14. As a UMKM owner, I want the build recommendation card to appear as reliably as a question card, so that the transition from discussion to build feels smooth.
15. As a UMKM owner, I want a brief review or build recommendation card to replace my answered question cleanly, so that the workspace never shows a stale card after I act on it.
16. As a developer, I want the repair race to be fixed without changing server persistence or the repair pass, so that the existing architecture invariants stay intact.
17. As a developer, I want the stale-card suppression to be driven by the existing `hasAnsweredWorkspaceQuestion` seam, so that I reuse the domain logic that already knows when a card is answered.
18. As a developer, I want the poll loop to be bounded and cancelable, so that a navigating user does not leak timers or overwrite state after unmount.
19. As a developer, I want the preparing state to be a single source of truth, so that the UI does not flicker between loading, error, and stale card.
20. As a developer, I want chat reload to be deferred until the card is fresh during repair, so that the latest user message is never replaced by a stale database snapshot.
21. As a developer, I want the retry countdown to read the `Retry-After` header, so that the server controls the wait window.
22. As a developer, I want the preparing state to clear on any successful card update, so that a late repair result does not leave a loading indicator stuck.
23. As a developer, I want the poll to stop as soon as a new card is detected, so that unnecessary requests are avoided.
24. As a developer, I want the timeout to surface the retry panel exactly once, so that the user is not flooded with duplicate retry buttons.
25. As a developer, I want the repair pass and the poll to be observable in the AI debug log and Langfuse, so that I can verify the race is resolved in production traces.
26. As a developer, I want the hardening to be covered by route tests and workspace-sync unit tests, so that regressions are caught before they ship.
27. As a developer, I want no new server endpoints, so that the API surface stays small.
28. As a developer, I want no changes to the AI system prompt, confidence gate, or tool schema, so that the AI behavior contract stays stable.
29. As a developer, I want the fix to work with the 9Router combo fallback, so that provider failover inside the combo does not confuse the client.
30. As a developer, I want the fix to degrade gracefully if the workspace endpoint returns an error, so that a transient DB hiccup does not break the UI.
31. As a developer, I want the preparing state to respect `prefers-reduced-motion`, so that the loading indicator stays calm for users who opt out of motion.
32. As a UMKM owner, I want the preparing state to show immediately after my answer is sent, so that there is no blank gap between sending and seeing the loading indicator.
33. As a UMKM owner, I want the loading indicator to disappear the instant the next card appears, so that the transition feels instant.
34. As a UMKM owner, I want the retry button to be large enough to tap on mobile, so that recovery is easy on a small screen.
35. As a UMKM owner, I want the retry button to be the only red element on the screen, so that it is obvious where to tap when something is wrong.
36. As a UMKM owner, I want the chat scroll to stay at the bottom during recovery, so that I do not lose my place.
37. As a developer, I want the poll interval and timeout to be configurable via constants, so that they can be tuned without hunting through the component.
38. As a developer, I want the hardening to not introduce a new comment policy, so that the codebase stays self-explanatory.

## Implementation Decisions

- The fix is entirely client-side. The server repair pass (`repairMissingWorkspaceTool`, `repairWorkspaceCard`), the `onFinish` persistence, the AI system prompt, the confidence gate, the tool schema, and the 9Router combo routing are unchanged.

- The primary module modified is the workspace shell client component. A small new pure helper module is introduced for the poll/prepare state machine so it is unit-testable in isolation, mirroring the existing `workspace-sync.ts` seam.

- A new client state `isPreparingNextQuestion` is the single source of truth for the preparing/loading UI. It is true when the stream has finished, the active card is already answered (via the existing `hasAnsweredWorkspaceQuestion` helper), and no fresh card has arrived yet.

- The existing status-driven reload effect (the one that fires `loadWorkspaceState` and `reloadLatestChat` on `streaming → ready`) is guarded: when `isPreparingNextQuestion` is true, `loadWorkspaceState` must not call `setWorkspaceCard` with the stale database card, and `reloadLatestChat` is deferred until the card is fresh. This is the core race fix.

- A bounded poll loop fetches the workspace endpoint at a fixed interval (default 2000ms) until the returned card differs from the answered card (different question id, different card type, or a build recommendation) or a timeout elapses (default 30000ms). The poll is wrapped in a cancelable async loop that clears on unmount, on a fresh card, or on timeout.

- The poll differentiates "fresh card" by comparing the card type and, for question cards, the question id. A `none` card from the database during poll is treated as "not yet fresh" and does not clear the preparing state.

- The preparing state surfaces a neutral loading indicator (skeleton or short text "Menyiapkan pertanyaan berikutnya...") in the same container that currently shows the red retry panel. The retry panel only renders after the poll timeout.

- The retry button uses the existing `retryWorkspaceCard` callback. The `Retry-After` header from the 503 response is read and a visible countdown disables the button until the window elapses, then auto-enables it. The countdown reuses the existing `rateLimitError` state shape and the `captureRateLimitError` seam.

- The composer stays locked while `isPreparingNextQuestion` is true, reusing the existing `isResponding` / `hasAnsweredActiveQuestion` gating. It unlocks the moment the fresh card arrives.

- Chat scroll-to-bottom behavior is preserved during the preparing state so the user's latest message stays in view.

- The preparing indicator respects `prefers-reduced-motion` by rendering a static label instead of an animated skeleton when the user opts out of motion, consistent with the rest of the workspace.

- Poll interval, timeout, and the retry-after default are module-level constants, not env vars, to keep the surface small and the values reviewable in one place.

- No new server endpoints. No schema changes. No new dependencies. No changes to the AI SDK message shape or tool contract.

- The fix is compatible with the 9Router combo: when the combo fails over inside a single request, the stream may still close without a tool output, and the client preparing state handles it identically to a primary model failure.

- State machine for the client card lifecycle during a discuss turn (prototype-derived, decision-rich parts only):

  ```
  user sends answer
    -> status: submitted
    -> status: streaming (chat text streams)
    -> status: ready
       -> if response has fresh tool output: show card, clear preparing
       -> else if active card already answered:
          -> isPreparingNextQuestion = true
          -> show preparing indicator
          -> poll workspace every 2s, defer chat reload
             -> card changed: setWorkspaceCard(fresh), clear preparing, reload chat
             -> timeout 30s: clear preparing, show retry panel with Retry-After countdown
       -> else: existing behavior (error/missing turn path)
  ```

## Testing Decisions

- The highest seam is the existing route test layer for the preview endpoint (`src/app/api/projects/preview/route.test.ts`) combined with the workspace-sync unit tests. These prove the server contract is unchanged and the client helpers behave correctly.

- A new unit test file for the poll/prepare state machine asserts the pure transitions: answered-card detection, poll card-change detection, timeout handling, and cancel-on-unmount. Prior art is `src/lib/projects/workspace-sync.test.ts` and `src/lib/projects/chat-memory.test.ts`, which test pure helpers over `UIMessage` and `WorkspaceCard` shapes.

- The existing preview route tests must keep passing unchanged, proving the server repair and persistence behavior is not altered by this work.

- A good test in this pass asserts external behavior only: given a stream that closes without a tool output and a database that later returns a fresh card, the state machine transitions preparing → fresh card; given a timeout, it transitions preparing → retry. It never asserts on timer internals or private state.

- Manual verification: send a discuss answer, observe the preparing indicator appear, then the next card arrive without the previous card ever reappearing and without the chat message disappearing. If a 429 is forced, observe the retry panel with countdown after the timeout.

## Out of Scope

- No changes to the server repair pass, `onFinish` persistence, or the AI system prompt.
- No changes to the confidence gate, tool schema, or workspace card schema.
- No changes to the 9Router combo configuration or model selection.
- No changes to build generation, runtime supervisor, preview proxy, or publishing.
- No new server endpoints or schema migrations.
- No task-based model routing (deferred per prior decision).
- No build UX changes beyond what already ships (SSE progress + last-good preview invariant).

## Further Notes

- The fix is intentionally client-side so the server invariants documented in `docs/architecture.md` (single authority normalize, never overwrite valid card with none, stale card hidden immediately once answered) are preserved and reinforced rather than weakened.
- The preparing state is the user-facing expression of the existing server repair window; it does not add a new server concept, it only stops the client from racing the server.
- After this work, the discuss turn should feel fully reliable to a business owner: the chat always appears, the next card always arrives (with a calm loading beat if needed), and recovery is a single obvious tap if the rare true failure occurs.
