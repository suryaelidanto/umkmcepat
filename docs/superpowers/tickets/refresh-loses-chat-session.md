# Refresh loses chat session

## Problem

When a user refreshes the workspace page during (or after) a chat turn, the
conversation resets to "welcome/new session" — the initial prompt gets
re-sent as if starting fresh.

## Root cause

1. `WorkspaceShell.tsx:965-997` auto-sends `initialPrompt` via
   `sendMessage()` when `initialMessages.length === 0` on mount.
2. If the first user message hadn't persisted to the DB before the refresh,
   the server returns `chatMessages: []` → client thinks "no messages" →
   auto-sends the first prompt again = "welcome."
3. The `/chat/turn` endpoint (GET `api/projects/$id/chat/turn`) correctly
   returns the active/latest turn state, but the client doesn't consult it
   on cold reload — only on reconnect after a streaming error.

## What exists (already merged from build-progress-sse-detach)

- Build progress uses `EventSource` + `build-attempt-pubsub` for
  reconnectable SSE streams. Chat does not use this pattern.
- Build worker detached from `request.signal` so transport disconnect
  doesn't abort the build. Chat worker is already detached.

## Fix surface

Primary fix:

1. **`src/components/projects/WorkspaceShell.tsx`** — On cold mount with
   `initialMessages.length === 0`:
   a. Check GET `/api/projects/$id/chat/turn` first.
   b. If a turn exists (any status), DON'T auto-send `initialPrompt`.
      Instead fetch latest chat messages via `useChat` reload or a direct
      `/api/projects/$id` GET.
   c. Only auto-send if no turn exists at all (truly fresh project).

2. **`src/routes/api.projects.$id.chat.turn.ts`** — Verify the response
   includes enough info for the client to decide: `turnId`, `status`,
   `userMessageId`, `expiresAt`. (Likely already does — verify.)

Secondary fix (belt-and-suspenders):

3. **`src/routes/api.projects.ts:451-458`** — When creating initial project
   data, include a flag like `hasPendingFirstMessage: true` so the client
   can distinguish "no messages yet, fresh project" from "messages were
   sent but lost."

## Tests

- `WorkspaceShell.test.ts`:
  - Mock `initialMessages=[]` + mock `/chat/turn` returns `{status:"succeeded", turnId:"t1"}`.
  - Assert `initialPrompt` is NOT sent.
  - Assert chat reload is triggered instead.
- `WorkspaceShell.test.ts`:
  - Mock `initialMessages=[]` + mock `/chat/turn` returns 404/no-turn.
  - Assert `initialPrompt` IS sent (fresh project, no welcome bug).
- `api.projects.preview.ts` (integration):
  - POST a user message, refresh client state, GET project.
  - Assert chat messages appear in response.

## Non-goals

- Do not touch build progress SSE — that's already working.
- Do not change the retry flow (covered separately).
- Do not add new DB fields unless the flag approach is chosen.

## References

- `src/components/projects/WorkspaceShell.tsx` — auto-send on mount
- `src/routes/api.projects.$id.chat.turn.ts` — turn state endpoint
- `src/routes/api.projects.ts` — initial project response
- `src/routes/_main.projects.$id.tsx` — route loader, passes `initialMessages`
