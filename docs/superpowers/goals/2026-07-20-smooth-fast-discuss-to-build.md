# Goal: smooth, fast discuss → working build (end-to-end, real account)

A reusable goal prompt. Hand this back to me verbatim to resume the work.

---

## The two outcomes I want (definition of done)

1. **End-to-end, for real.** Using the user's authenticated account, create a new project, chat with the AI until it reaches `build_recommendation`, click "Mulai build", and **watch the build job until it succeeds** (workspace `buildStatus` reaches a success state, source files generated). Not "the gate passes" — the actual running app build completes. If it fails, read the real failure, fix the root cause, and re-run until green. No fake completion, no skipping a failing turn.

2. **One fast, smooth AI turn.** Every discuss turn must be **a single AI call** that:
   - **streams the chat text first** (token-by-token, real Indonesian prose, never a hardcoded dummy, never JSON in the bubble), **then**
   - **emits the workspace card as a tool call** (`presentWorkspaceCard`) in the same turn.
   The card must appear **fast** — the moment the model decides the tool input, the card renders. No two-call sequence, no "wait then repair", no JSON dump shown to the user. Text-stream → card. Smooth.

## Why (the bug history you inherit)

- The forced `toolChoice: { type: "tool" }` on the primary `streamText` (in `src/routes/api.projects.preview.ts`, `handleDiscussTurnOneCall`) made 9router return **no chat prose** — only the tool call — so `chatText` was empty and the code persisted a dummy string `"Oke, biar aku tanya dulu."`. That's fixed on `dev` (`ab747f8`: `toolChoice: "auto"`, dummy removed, repair context carries the user's latest answer).
- **A deeper stall remains**: around turn 9-10 the discuss turn returns HTTP 200 but the workspace card does not advance — the AI re-emits an already-answered field's card, the frontend discards it as stale, and the brief never climbs past `confidence: 85` to the 95% build gate (`getBriefReadiness`: ready requires `confidence >= 95` **and** `openQuestions.length === 0`). So "Mulai build" never appears. **This is the blocker for outcome #1.**
- Suspected causes (verify, don't guess): (a) the 10th SSE stream errored mid-flight and the `hadError` branch silently dropped the turn without persisting — needs dev-server stderr; (b) answered soft fields are not pruned from `brief.openQuestions`, so the AI re-asks them — check `removeUnansweredActiveQuestionMemory` + how `openQuestions` is updated in `applyBriefPatch`.

## How to do it well

### Investigate with evidence, not guesses
- The single-Node dev server logs `console.error("[preview-chat] ...")` lines. **Capture these** during the e2e drive — they name the real failure. Don't patch blind.
- Read the stored `chatMessages` (via `/api/projects/:id/chat`) and `workspaceCard`/`brief` (via `/api/projects/:id/workspace`) after the stall — the persisted tool-output parts show exactly what the model emitted.
- Reuse the Playwright e2e harness pattern (cookie-authenticated, headless chromium) to drive the real flow. Capture the **SSE body** of the `/api/projects/preview` response that stalls, not just the status code.

### Use Firecrawl MCP for deep research (the user explicitly asked)
Research primary sources — do not answer from memory:
- **AI SDK `streamText` + tool-call + text streaming**: how to get the model to emit **both** streamed text **and** a tool call in one turn, reliably, on an OpenAI-compatible provider. Confirm `toolChoice: "auto"` is right vs `"required"`, and whether `toolChoice` even matters for first-token latency.
- **Fast first-token / fast card**: provider options and SDK flags that minimize time-to-first-token and time-to-tool-input on `@ai-sdk/openai-compatible` (e.g. `simulateStreaming`, `streaming`, `structuredOutputs`, temperature, `maxOutputTokens` caps). The provider is 9router (`src/lib/ai.ts`, `supportsStructuredOutputs: false`, `includeUsage: true`).
- **One-call pattern**: is a separate `generateText` "card repair" call ever needed if the primary stream is set up correctly? The goal is to make repair rare-to-never, not to rely on it.
- Cite what you find; prefer the Vercel AI SDK docs + `@ai-sdk/openai-compatible` source.

### Code constraints (from CLAUDE.md / AGENTS.md — do not violate)
- Bun only; `bun.lock` canonical. Don't add a new dependency for what a few lines can do. Reuse `repairDiscussCardWithTool` and existing helpers; don't fork the flow.
- Surgical edits: touch only `src/routes/api.projects.preview.ts` (+ prompts if needed). Match surrounding style. No "while I'm here" refactors. Indonesian = user-facing copy; English = code/comments/logs.
- User-facing product UI copy = Indonesian. Dev-facing docs/code/logs/errors = English.
- Never bypass a failing gate. Run `bun run check` before any push. Never `--no-verify`.
- No DB migration unless the schema actually needs it. No new env vars without updating `.env.example`.

## Verification (the only acceptable proof)

1. `bun run check` green (format/lint/typecheck/test/knip).
2. **Real e2e drive with the user's cookie**: create project → chat through to `build_recommendation` → click "Mulai build" → poll `/api/projects/:id/workspace` until `buildStatus` is a success state and source files exist. **The build must actually complete.** If the chat stalls before the build gate, that's a fail — investigate, fix, re-run.
3. Measure: time from "Kirim jawaban" click to workspace card appearing should be visibly fast (streaming text starts immediately, card follows). No dummy strings anywhere in the chat (`rg "Oke, biar aku tanya dulu" src/` → empty).
4. Dev-server stderr during the drive shows no `[preview-chat] ... error` lines.
5. Persisted `chatMessages` in the DB shows every assistant turn with a real text part + a `tool-presentWorkspaceCard` part — never a bare tool part with no text.

## Anti-patterns (do not do these)
- Guessing the stall cause from the HTTP status code. Read the SSE body + server stderr.
- "It returns 200 so it worked." 200 on the SSE wrapper ≠ the stream succeeded.
- Adding a deterministic fallback card to force past the stall. That masks the AI loop, it doesn't fix it.
- Two AI calls per turn (one for text, one for card). One call. Text streams, then the tool call.
- Dummy/hardcoded assistant text. Ever.
- Disabling a check to go green.
- Claiming "build works" without having watched a real build reach success.

## Resume note
Start by re-confirming the current state: `git status`, the stalled project's stored chat/workspace, and the dev-server console. Then drive the e2e loop and capture the 10th-turn SSE body + stderr. That evidence decides the next fix.