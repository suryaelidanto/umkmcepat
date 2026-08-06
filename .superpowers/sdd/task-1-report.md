# Task 1 Report: Pure transient/terminal classification + retry-cap math

**Status:** DONE

## What was implemented

Created two files exactly as specified in `task-1-brief.md`:

- `src/lib/projects/discuss-chat-error.ts` — pure, React-free module:
  - `export type DiscussChatErrorKind = "transient" | "terminal"`
  - `export function classifyDiscussChatError(input: { code?: string; message?: string; status?: number }): DiscussChatErrorKind`
  - `export function isTerminalChatError(input): boolean` (convenience wrapper)
  - `export function nextRetryAttempt(current: number, cap: number): number | null`
- `src/lib/projects/discuss-chat-error.test.ts` — vitest suite with all 9 cases from the brief (6 for classification, 3 for retry math).

Logic (verbatim from brief): terminal wins on exact blocked/too-large codes, Indonesian terminal copy, and status ≥ 400 excluding 429/408; transient wins on internal transient codes, stack/network/timeout/queue patterns, and 429/408; unknown/empty falls back to transient. `nextRetryAttempt` clamps cap to `Math.max(0, Math.floor(cap))` and returns `current + 1` below cap, else `null`.

## Test results

```
bunx vitest run --project unit src/lib/projects/discuss-chat-error.test.ts
Test Files  1 passed (1)
Tests       9 passed (9)
```

## TDD evidence

**RED** (before implementation — test file only, module missing):
```
bunx vitest run --project unit src/lib/projects/discuss-chat-error.test.ts
Test Files  1 failed (1)
Tests       no tests
→ "Cannot find module '@/lib/projects/discuss-chat-error'" (failed to resolve import at discuss-chat-error.test.ts:3)
```

**GREEN** (after implementation):
```
bunx vitest run --project unit src/lib/projects/discuss-chat-error.test.ts
Test Files  1 passed (1)
Tests       9 passed (9)
```

## Files changed

- `src/lib/projects/discuss-chat-error.ts` (new, 47 lines)
- `src/lib/projects/discuss-chat-error.test.ts` (new, 89 lines)

Commit: `93aceb2 feat(discuss): add transient/terminal chat error classifier + retry-cap math` (on `dev`).

## Self-review

- **Completeness:** All interfaces from the brief's "Produces" list are exported; test file matches the brief's test code verbatim; implementation matches the brief's implementation code verbatim (diffed line-by-line). No extra files, no stray changes — commit contains exactly the two task files.
- **Quality:** Pre-commit hook (`check-staged-fix.ts`) ran and reported Prettier clean, ESLint auto-fix no errors. Focused test passes.
- **Discipline:** Only task files staged/committed. Pre-existing unrelated working-tree changes (`src/routes/api.projects.$id.edit.ts`, `tests/routes/projects.id.edit.test.ts`) were left untouched.
- **Testing:** 9/9 focused tests pass. `isTerminalChatError` has no dedicated test in the brief's suite (it's a one-line wrapper over `classifyDiscussChatError`); noted but followed the brief exactly — the plan's reviewer will diff against the brief.
- **Notes for later tasks:** The implementation's `TRANSIENT_PATTERNS` include `/worker |queue /` which would classify an Indonesian terminal message containing "queue" as transient if it reached the transient check — but terminal patterns and blocked/too-large codes are checked first, so per-brief behavior is preserved. No action taken (brief-exact code).

## Verification

- Focused test: PASS (9/9)
- Pre-commit gate: PASS

## Task 1 fix report (review findings)

### What changed

- `src/lib/projects/discuss-chat-error.ts`: in `classifyDiscussChatError`, HTTP 503 is no longer classified terminal — it now falls through to the transient branch (retryable), alongside 429 and 408.
- `src/lib/projects/discuss-chat-error.test.ts`: added `isTerminalChatError` to the import and a `describe("isTerminalChatError")` block covering terminal (blocked code, "Proses dihentikan." message) and transient (stream_error_no_text, status 503) cases.

### Verify

Command: `bunx vitest run --project unit src/lib/projects/discuss-chat-error.test.ts`

Output:

```
 RUN  v4.1.10 /mnt/data/code/side/umkmcepat


 Test Files  1 passed (1)
      Tests  11 passed (11)
   Start at  14:00:57
   Duration  2.19s (transform 484ms, setup 0ms, import 698ms, tests 51ms, environment 1ms)
```

Pass count: 11/11 (existing 9 + 2 new `isTerminalChatError` cases).
