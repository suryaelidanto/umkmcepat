# Discuss Chat Error Feedback & AI Thinking UX — Design

**Date:** 2026-08-06
**Status:** Proposed
**Related:**
- `src/components/projects/WorkspaceShell.tsx` — chat composer, error banner (`:3218-3234`), `submitChatText` (`:2488`), `retryChat` (`:2683`), `toUserFacingDiscussError` (`:4965`), `useChat` wiring (`:413`)
- `src/lib/user-facing-error.ts` — server-side error → Indonesian mapping
- `src/lib/app-settings-registry.ts` — AppSetting registry (`discuss.hedging` at `:431`)
- `src/routes/api.admin.settings.ts` — admin settings read/write (validate + upsert + `invalidateSettingCache`)
- `src/routes/_main.projects.$id.tsx` — project page loader passing props to `WorkspaceShell`
- `src/lib/ai.ts:50` — `getNoReasoningCallOptions()` (reasoning: "none" contract)
- `src/lib/projects/discuss-turn-worker.ts:910,1124` — server transient-error copy ("AI lagi gangguan. Coba lagi sebentar.")
- `src/lib/projects/chat-memory.ts:207` — strips reasoning parts from persisted messages

## Problem

1. **Generic error banner hides the real failure.** `WorkspaceShell.tsx:3220-3223` hardcodes `"AI sempat terputus. Coba kirim ulang pesanmu."` for *any* `useChat` error that isn't `project_request_blocked` or `chat_turn_too_large`. The server already sends friendly Indonesian copy (`"AI lagi gangguan. Coba lagi sebentar."` from `discuss-turn-worker.ts`), but the renderer discards `error.message` and substitutes a generic disconnect string. The user cannot tell a transient provider blip from a real failure.
2. **Error banner persists after a new send.** `submitChatText` (`:2488`) clears `rateLimitError`/`message`/`buildProgress` but never calls `clearError()`. The previous turn's `error` stays in `useChat` state, so the banner from an old failure stays visible while the user is composing the next message (the reported screenshot).
3. **No auto-retry before the banner.** The only retry is the manual "Kirim ulang" button. The M2 reliability contract ("any error surfaces a retry-able message; retry succeeds on 1st attempt") is server-side; the client never auto-acts on transient envelopes, so a single provider blip shows the failure banner immediately.
4. **Dead silence while waiting.** After the user sends a message, there is no visible "working" state between the optimistic user bubble and the first assistant token. Turns routinely take 3-12s (measured TTFT), and during that window the UI looks stalled — the exact "user closes the tab thinking it's broken" scenario.

## Goals

- Show the **real** server error, redacted to friendly Indonesian — never raw English, never the hardcoded "AI sempat terputus" placeholder.
- Auto-retry transient failures (provider/stream) up to a configurable attempt cap **before** showing the banner; hide the banner while a retry is in flight.
- Clear the stale error the moment the user sends a new message.
- Show a calm, honest "AI thinking" indicator so the user never stares at dead air — visible only after a short grace period, escalating gently for long waits.
- Future-proof the thinking indicator: if a future operator enables model reasoning (currently `reasoning: "none"` everywhere via `getNoReasoningCallOptions()`), the UX should reflect the reasoning state without code changes.

## Design

### A. Error copy — redact via `toUserFacingDiscussError`

`toUserFacingDiscussError` (`WorkspaceShell.tsx:4965`) already maps:
- raw Indonesian product copy → pass-through,
- legacy internal codes (`stream_error_no_text`, `repair_failed`, `expired`, ...) → Indonesian,
- stack/EN-glitch patterns → generic Indonesian fallback.

Change the catch-all error banner (`:3218-3234`) to render:

```tsx
{isRetrying
  ? `Mencoba lagi (putaran ke-${retryAttempt})…`
  : toUserFacingDiscussError(error.message)}
```

- `isRetrying` branch becomes the **honest retry copy** (attempt number), replacing the generic "Mencoba menyambung ulang...".
- non-retrying branch runs `error.message` through the redactor. `project_request_blocked` / `chat_turn_too_large` blocks keep their specific copy (already Indonesian + actionable).

### B. Configurable auto-retry cap — AppSetting

New registry entry (same pattern as `discuss.hedging` at `:431`):

| field | value |
|---|---|
| key | `discuss.chat.auto_retry_attempts` |
| category | `feature_flag` |
| tier | `advanced` |
| type | `number` |
| label | "Discuss chat auto-retry attempts" |
| fallback | `2` |
| min / max | `0` / `5` |
| env | `DISCUSS_CHAT_AUTO_RETRY_ATTEMPTS` |

Admin-editable via existing `/admin/settings` (the admin PUT upserts + invalidates cache; no new endpoint). `0` = never auto-retry (current behavior). Client reads it via the project-page loader (`_main.projects.$id.tsx`) and passes `autoRetryAttempts` as a prop to `WorkspaceShell` — no admin-auth leak to the composer.

### C. Auto-retry transient errors

New `useEffect` in `WorkspaceShell` watching `useChat`'s `error`:

- Classify the error as **transient** vs **terminal**:
  - Terminal (no auto-retry, show banner): `project_request_blocked`, `chat_turn_too_large`, `code` present with `status >= 400` other than 429/408, or `error.code` matches the "already Indonesian terminal" strings (`proses dihentikan`, etc.).
  - Transient (auto-retry): `error.code` in `{stream_error_no_text, repair_failed}`, or no `code`/message pattern matching the known stack/ECONN/timeout/queue regexes from `toUserFacingDiscussError`, or a 429/408 `status`.
- When transient and `retryAttempt < autoRetryAttempts` and not already `isRetrying`:
  - `setIsRetrying(true)`
  - increment `retryAttempt` (a `useRef` counter, reset on `status === "ready"` or on a fresh `submitChatText`)
  - call `retryChat()` once.
- `retryChat` already sets `isRetrying`, clears the error, and either resumes the running turn (SSE reattach/poll) or regenerates — no changes needed to its internals.
- Cap is a client-side bound; after `autoRetryAttempts` exhausted, the banner renders with the redacted message + manual "Kirim ulang".

The retry copy (`putaran ke-N`) uses the same counter so the user sees exactly which attempt is in flight.

### D. Clear stale error on send

In `submitChatText` (`:2598-2604`), alongside `setRateLimitError(null)`:

```tsx
setRateLimitError(null);
clearError();          // hide stale banner from the previous failed turn
```

`clearError` is already destructured from `useChat` (`:412`).

### E. "AI thinking" indicator

New state in `WorkspaceShell`:

```tsx
const [aiThinking, setAiThinking] = useState<"idle" | "active" | "slow" | "reasoning">("idle");
```

Transitions:
- `status === "submitted" || status === "streaming"` → arm a 800ms timer; on fire set `"active"`; a second 8s timer escalates to `"slow"`.
- First assistant token (a `text-delta`/`tool-input-delta` part in `messages`) → `"idle"` immediately (clear timers).
- `status === "ready"` or `error` → `"idle"` (clear timers).
- **Reasoning future-proofing:** scan the latest assistant message's `parts` for `type === "reasoning"` with `state !== "done"`; if present, set `"reasoning"` tier. Today `reasoning: "none"` means this never fires; if a future operator enables reasoning, the strip automatically shows the reasoning copy. `chat-memory.ts:207` already strips reasoning from persisted messages, so no storage leak.

Copy per tier (all Indonesian, honest, non-spammy):

| tier | copy |
|---|---|
| `active` | `Memproses…` (dim, opacity 0.6, no pulse) |
| `slow` | `Memproses…` + slow pulse (opacity 0.6↔0.85, 1.6s period, CSS keyframe) |
| `reasoning` | `AI sedang menyusun ide…` |
| exhausted/error | (banner slot takes over) |

Render: a single strip slot **above the composer, below the latest message**, mutually exclusive with the error banner (`error ? banner : aiThinking !== "idle" ? strip : null`). Fade in 180ms / fade out 180ms. No spinner — text + optional slow pulse only. Placement mirrors the error banner slot so the two states never stack.

Threshold rationale (matches M2 targets):
- 800ms — short grace so the strip doesn't flicker for sub-second turns.
- 8s — past the common TTFT window; pulse signals "still alive" without narration.
- No 18s+ escalation copy in v1 (keep it calm); the pulse + persistent "Memproses…" is enough. (Original draft had a 12-18s escalation; user asked for calm, non-spammy — the pulse carries the "still working" signal without alarming copy.)

### F. Future-proofing note

- Add a comment in `getNoReasoningCallOptions` (`src/lib/ai.ts:50`) documenting that flipping `reasoning: "none"` changes the discuss UX contract (the composer's `reasoning` tier becomes reachable).
- The composer's reasoning scan is defensive — it activates automatically, no code change needed when reasoning is enabled.

## Files

- `src/components/projects/WorkspaceShell.tsx` — banner copy, auto-retry effect, `clearError` on send, thinking strip + timers, `autoRetryAttempts` prop.
- `src/lib/app-settings-registry.ts` — new `discuss.chat.auto_retry_attempts` entry.
- `src/routes/_main.projects.$id.tsx` — loader reads the setting, passes `autoRetryAttempts` prop.
- `src/lib/ai.ts` — docstring note in `getNoReasoningCallOptions`.
- `src/lib/app-settings-registry.test.ts` — registry sanity (auto-covered by existing "numeric bounds" + "no duplicate keys" tests once the entry is added).
- New: `src/lib/projects/discuss-chat-error.test.ts` — pure classification/cap logic (testable without React).

## Non-goals

- No server changes to `discuss-turn-worker.ts` / `api.projects.preview.ts` — the server already emits clean Indonesian transient copy.
- No changes to `toUserFacingDiscussError` internals — it already covers all known codes; we only route more call sites through it.
- No changes to the `project_request_blocked` / `chat_turn_too_large` specific banners (already Indonesian + actionable).
- No `reasoning: "auto"` flip — that's a separate operator decision; we only make the UX ready for it.

## Risks

- **Auto-retry loop:** bounded by the `useRef` counter + cap from AppSetting; counter resets only on `status === "ready"` or fresh send. Worst case: `autoRetryAttempts` sequential `retryChat` calls, then banner.
- **Retry of a genuinely failed turn:** `retryChat` first checks `/chat/turn` status; if the turn already failed/succeeded it reloads persisted chat instead of regenerating — no double-work.
- **Thinking strip flicker:** 800ms grace + fade in/out; timers cleared on every status change and unmount.
- **Reasoning tier false positive:** `state !== "done"` scan — the SDK marks reasoning `done` before the next part; transient "reasoning" then "active" is a ≤180ms fade, acceptable.
