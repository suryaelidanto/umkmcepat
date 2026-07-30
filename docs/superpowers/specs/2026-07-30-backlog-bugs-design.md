# Backlog bugs: spec

Fix 4 independent bugs: custom input disconnect, build preview blink, retry callsite cleanup, chat reconnect.

## 1. Custom input disconnects AI (#4)

**Trigger:** User types >16 KiB in custom answer textarea, text-mode question input, or free composer.

**Root cause:** Server rejects oversized chat turns at `api.projects.preview.ts:204` with 413 `chat_turn_too_large` before any turn claim. AI SDK maps non-OK response to error. `WorkspaceShell.tsx:3425` maps non-429/non-blocked errors to generic "AI sempat terputus".

**Fix:**
1. **Client byte guard** in `WorkspaceShell.tsx` — before `sendMessage()`, check UTF-8 byte length of trimmed text. If >16 KiB, show "Pesan terlalu panjang. Maksimal 16.000 karakter." and abort submit.
2. **`maxLength` on inputs** in `WorkspacePrimitives.tsx` — add to custom-answer and free-text textareas (realtime feedback even without submit).
3. **Error mapping** — detect 413 response in error handler, surface specific message instead of generic disconnect.

**Test:**
- Submit >16 KiB text → assert no `sendMessage` call, assert error shown
- Submit normal text → assert normal flow unaffected
- Mocked 413 from `/api/projects/preview` → assert specific size error, not generic disconnect

## 2. Build failed/unfinished preview blink (#3)

**Trigger:** During active build, preview panel blanks to "Menyiapkan pratinjau website..." even when a previous successful preview exists.

**Root cause:** `WorkspaceShell.tsx:2960` unconditional `if (isBuilding)` branch shows spinner. Server correctly retains last-good preview (`deployment-resolution.test.ts` proves this).

**Fix:**
1. **Don't blank iframe during build** when last-good preview exists. Reorder preview branch:
   - `isBuilding` AND `hasLastGoodPreview` → render old iframe + non-blocking banner "Membangun ulang website..."
   - `isBuilding` AND `!hasLastGoodPreview` → keep current spinner (first-time build, no previous preview)
2. **Failure banner** on settled `ready_with_failed_latest_attempt`: overlay "Build terbaru gagal, tampilan sebelumnya tetap aman."

**Test:**
- Mock `isBuilding=true` + existing successful build → assert `GeneratedPreviewFrame` rendered, not spinner
- Mock `ready_with_failed_latest_attempt` → assert failure banner appears

## 3. Consistent retry callsites (cleanup #1)

**Current state:** Retry config scattered:
- `discuss-turn-worker.ts:95`: `maxRetries: 2` (matches SDK default — no-op removal)
- `discuss-turn-shared.ts:132`: `maxRetries: 1` (change to omit → SDK default `2`, more tolerant)
- `discuss-turn-shared.ts:248`: `maxRetries: 2` (matches SDK default — no-op removal)
- `ai-moderation.ts:123`: fixed 1s retry wrapper — **leave as-is** (covers non-SDK errors)
- `custom-source-generator.ts`: omitted (SDK default applies — pass explicit `maxRetries: 2`)
- `source-edit-agent.ts`: omitted (SDK default applies — pass explicit `maxRetries: 2`)
- `build-attempt-worker.ts:438`: omitted (SDK default applies — pass explicit `maxRetries: 2`)

**Fix:**
1. Remove explicit `maxRetries` where it matches SDK default (no-op cleanup).
2. Change `maxRetries: 1` to omit (goes from 1 retry → 2 retries = more tolerant, safer).
3. Pass `maxRetries: 2` to callsites that currently rely on implicit default (explicit for consistency, same behavior).
4. Leave moderation `callWithRetry` untouched.

**Test:**
- Assert `streamText`/`generateText` calls receive consistent `maxRetries: 2` where expected
- Assert moderation still uses `callWithRetry` wrapper

## 4. Chat reconnect (#2) — TDD first

**Trigger:** Network disconnect during chat → retry creates new POST instead of resuming → if nothing persisted → auto-sends initial prompt = "welcome again."

**Root cause:**
1. Retry calls `regenerate()` (new POST) instead of checking `/api/projects/$id/chat/turn`
2. Empty `initialMessages` on mount → auto-sends first prompt (`WorkspaceShell.tsx:965`)
3. Dedupe can leave assistant as last message → server claims turn with wrong `userMessageId`

**Fix (TDD-first — write failing tests before any implementation code):**
1. **Retry checks `/chat/turn` first.** On chat error in `WorkspaceShell.tsx`:
   - Check GET `/api/projects/$id/chat/turn`
   - `running` → poll and wait
   - `succeeded` → reload chat from server (no regenerate)
   - `failed` → show error, offer retry (regenerate only here)
   - No turn → regenerate as before (fallback preserves current behavior)
2. **Guard assistant-as-user claim.** After dedupe in `api.projects.preview.ts:410-428`, assert last message role is `"user"`. Reject with reload instruction if `"assistant"`.

**Test (must fail against current code, pass after fix):**
- Chat error → mock `/chat/turn` returns `succeeded` → assert `regenerate()` NOT called, chat reload IS called
- Chat error → mock `/chat/turn` returns `running` → assert polling starts
- Server: `[user, assistant]` stored, incoming retry is duplicate user → assert rejection (not claim with assistant id)

## Implementation order

1. Custom input disconnect (#4) — simplest, mechanical, no integration risk
2. Build preview blink (#3) — pure client reorder + banner
3. Retry callsite cleanup (#1) — mechanical finds/replaces
4. Chat reconnect (#2) — TDD-first, test before code, highest risk
