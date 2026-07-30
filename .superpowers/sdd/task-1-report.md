# Task 1 Report: Custom input disconnect AI (#4)

## What was implemented

1. **MAX_CHAT_BYTES constant** — exported from `WorkspaceShell.tsx` set to `16 * 1024` (16384 bytes).
2. **Byte guard in `submitChatText`** — after trimming input text, checks byte length via `new TextEncoder().encode(trimmed).length > MAX_CHAT_BYTES`. Shows toast error "Pesan terlalu panjang. Maksimal 16.000 karakter." and returns early.
3. **`maxLength={16000}` on two inputs in WorkspacePrimitives** — the free-text `<input>` (Tulis jawabanmu di sini...) and the custom-answer `<textarea>` (Tulis jawabanmu sendiri...).
4. **413 interception in `rateLimitAwareFetch`** — after the 400 handler, checks for `response.status === 413` and `body.code === "chat_turn_too_large"`, throws a `ChatError` with status 413 and code `chat_turn_too_large`.
5. **413-specific error rendering** — before the generic error block in the chat error rendering, checks for `(error as ChatError).code === "chat_turn_too_large"` and shows "Pesan terlalu panjang. Ringkas dulu sebelum dikirim." in a styled error div without a retry button.
6. **Unit test** — exports `MAX_CHAT_BYTES`, tests that it equals 16384, and that 17000 ASCII chars exceed it while 16000 don't.

## Testing and test results

`bun run check` — all passes:
- Format: OK
- Lint: OK
- Typecheck: OK
- Test: 144/144 passing
- Knip: OK
- Docs: OK

## Files changed

- `src/components/projects/WorkspaceShell.tsx` — MAX_CHAT_BYTES constant, byte guard in submitChatText, 413 interception in rateLimitAwareFetch, 413 error rendering block
- `src/components/projects/WorkspacePrimitives.tsx` — maxLength={16000} on text answer input and custom answer textarea
- `src/components/projects/WorkspaceShell.test.ts` — MAX_CHAT_BYTES import + 2 test cases

## Self-review findings

- The initial Edit tool calls partially corrupted `rateLimitAwareFetch` due to mixed tabs/spaces from a first edit. Fixed by replacing the entire corrupted section via Python script.
- The test environment is `node` (not jsdom), so the brief's recommended `render`/`screen`/`userEvent` test pattern doesn't work. Used the existing test pattern instead: exported `MAX_CHAT_BYTES`, wrote a unit test with `new TextEncoder()` assertions.
- The pre-post-build-chat rendering changes in `WorkspaceShell.tsx` (`hasLastGoodPreview`, etc.) are from unrelated pre-staged code. They are not part of this task.
- The brief's `maxLength={16000}` vs `MAX_CHAT_BYTES = 16 * 1024` values are intentionally different: `maxLength` is character-based as a rough UI guard, while the server-enforced limit is byte-based at 16 KiB.

## Issues or concerns

None.
