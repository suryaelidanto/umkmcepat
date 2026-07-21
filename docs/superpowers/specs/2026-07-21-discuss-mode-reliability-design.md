# Design: Discuss-Mode Chat Reliability Hardening

## Background & Problem Statement

The discuss ("diskusi") chat in `/projects/[id]` is unreliable in two ways the user reports:

1. **Streamed text sometimes doesn't appear.**
2. **The workspace card (AI tool-call driven interactive question card) sometimes fails to render, and retrying doesn't help.**

The user's goal: discuss mode should *almost always* show the workspace card (~95%), streaming text progressively to the UI as it's generated. When the card genuinely can't be produced, degrade gracefully to the normal plain textbox — not an error toast. Build mode is out of scope; it already works.

### Audit findings (root causes)

`handleDiscussTurnOneCall` (`src/routes/api.projects.preview.ts:877`) is the active path (gated on by `isDiscussOneCallToolsEnabled()`). It makes **one** `streamText` call with `tools: { presentWorkspaceCard }` and `toolChoice: "auto"`, then manually consumes `primary.stream` to forward `text-delta` chunks to the UI and capture the `tool-call` chunk.

Root causes, in impact order:

- **R1 — `toolChoice: "auto"` lets the model skip the tool.** Nothing forces a tool call. When skipped, the code falls into `repairDiscussCardWithTool` — a *separate* full `generateText` call, up to 3 attempts × 45s = 135s. This is the dominant latency/reliability complaint. Notably the repair path *already* forces the tool (`toolChoice: { type: "tool", toolName }` at `:1343`), so the primary path is held to a looser standard than the repair path.
- **R2 — Stream-consumption errors are swallowed.** The `for await` loop is wrapped in `catch { hadError = true }` (`:988`) — the actual error is discarded. Failures are undiagnosable; we cannot tell a 9router 429/503 from a malformed chunk from a code bug. (Live logs confirm frequent upstream 429/503 from `openrouter/minimax/minimax-m3` and `antigravity/claude-opus-4-6-thinking`; 9router's fallback chain handles these — not a 9router bug, provider availability noise.)
- **R3 — Missing middle repair layer.** SDK `repairToolCall` is not wired anywhere (grep: zero references). When the model calls the tool but its args fail zod validation (`InvalidToolInputError`), there is no in-turn recovery — it crashes straight to an error toast.
- **R4 — Repair cascade can stack twice per turn.** `repairDiscussCardWithTool` is callable from two branches — `!chatText` (`:1033`) and `primaryToolFailed` (`:1139`) — each independently spending up to 3 attempts, worst case ~270s before the user sees anything.
- **R5 — Terminal failures emit error toasts, not graceful degradation.** Every exhausted-failure path writes `writer.write({ type: "error", errorText: "AI lagi gangguan..." })`. The user's goal is "else just show the textbox normally." The building block for this already exists — `createFallbackWorkspaceCard` returns `{ type: "none" }` (`brief-flow.ts:203`), the exact state the client renders as the plain text input (used today for edit turns).

A separate client-side concern — three racing writers of `workspaceCard` in `WorkspaceShell.tsx` (tool-output-in-message, preparing-poll loop, status-change effect) — is **out of scope for this one-shot** and tracked as a follow-up (see Scope).

### Research basis

Sourced from Vercel AI SDK + OpenAI docs (citations in `docs/research/ai-discuss-mode-reliability.md`):

- **One call, not two.** `streamText` with `tools` is the SDK's intended path for streaming text + structured output together. Dyad (production AI builder, same SDK) explicitly rejected adding a second `generateText` structured-output call as an unproven second path against their gateway. Current design's one-call shape is correct; do not regress to two calls.
- **`toolChoice: "required"`** guarantees only that *a tool call is present* in the response — not that its args are valid (AI SDK: "the model must call a tool"; OpenAI: "Call one or more functions"). It removes the "model skipped the tool" failure mode (R1) structurally. It does **not** break progressive text streaming — the model still emits `text-delta` chunks first.
- **Args validation is a separate concern**, handled at two layers: provider `strict: true` (unavailable here — 9router model is wired with `supportsStructuredOutputs: false`) and SDK `inputSchema` validation (throws `InvalidToolInputError`). Recovery is via SDK `repairToolCall` (in-turn re-prompt) — documented motivation: *"Language models sometimes fail to generate valid tool calls, especially when the input schema is complex or the model is smaller"* — i.e. exactly this config (large nested `briefPatch` schema + glm-5.2 / deepseek-v4-flash tier models).
- **Existing app-level validation is lenient by design and correct.** `normalizeWorkspaceTurn` (`brief-flow.ts:167`) treats tool input as `unknown`, coerces/cleans each field, and degrades any invalid piece to `createFallbackWorkspaceCard` (`type:"none"`) rather than crashing. The zod `inputSchema` is intentionally permissive (most fields `.optional()`, `options: z.array(z.any())`) — tightening it would *increase* failures. Do not add zod validation everywhere; reuse the existing normalizer.

## Scope

**In scope (this one-shot, server-side, sim-validated):** R1, R2, R3, R4, R5 — all in `src/routes/api.projects.preview.ts` plus a small pure-module extraction.

**Out of scope (follow-up, browser-validated):** Client race in `WorkspaceShell.tsx` (three writers of `workspaceCard`). The sim cannot validate client behavior; that fix gets its own change with a browser E2E run. Tracking note: collapse client to one source of truth driven by the stream message, with the `/workspace` poll as last-resort reconciliation only.

**Explicitly not touched:** the legacy 2-call `handleDiscussTurn` (`:422`) beyond the R2 logging fix (it's gated off; full removal is a separate cleanup). Build mode. The zod schema strictness. Streaming mechanics (already progressive, working).

## Proposed Solution

### Part 1: Pure-module extraction (enables 1:1 sim, single source of truth)

Verified via Graphify + grep against current HEAD (`2d0e063`):

New file `src/lib/projects/discuss-tool.ts` — pure module, no side-effects, no DB/auth imports. Moves from `api.projects.preview.ts`:
- `PRESENT_WORKSPACE_CARD_TOOL_NAME` (`:684`, not exported)
- `presentWorkspaceCardTool` (`:686-836`, not exported) — verbatim, unchanged schema
- `buildOneCallSystemPrompt` (`:838-875`, **already exported**) — verbatim, including the `hasBuiltSite` branch
- `buildCardSystemPrompt` (`:1770`, not exported) — the card-only prompt used by `handleDiscussTurn`, `handleDiscussTurnOneCall` (`:901`), and `repairDiscussCardWithTool` (`:1558`). Moves too so the sim can be 1:1 with the repair path as well.

**Stays in the route** (shared with legacy path, not discuss-tool-specific): `buildChatSystemPrompt` (`:1701`, exported) — called by both `handleDiscussTurn` (legacy) and `buildOneCallSystemPrompt`, and imported by the test. `discuss-tool.ts` imports it from the route. (Importing a route module for one pure function is acceptable here because `buildChatSystemPrompt` is a pure string builder with no side-effects; alternatively, if we want zero route-imports from `discuss-tool.ts`, move `buildChatSystemPrompt` too — but that widens the diff and touches the legacy path's import. Prefer the import; revisit if Knip/typed-imports complain.)

Behavior is byte-identical — the route file replaces the four declarations with one import from `discuss-tool.ts`, and re-exports `buildOneCallSystemPrompt` + `buildChatSystemPrompt` so existing importers (`api.projects.preview.test.ts`) keep working without churn.

### Part 2: Server fixes in `api.projects.preview.ts`

**#1 (R1) — Force the tool on the primary call.** `toolChoice: "auto"` → `toolChoice: "required"` (`:922`). Makes the primary path match the standard the repair path already enforces. The "model skipped the tool" failure becomes structurally impossible. Progressive text streaming is unaffected.

**#2 (R2) — Stop swallowing stream errors.** Replace `catch { hadError = true }` with logging the real error + serving model + a new `writeAiRequestLog({ event: "discuss:stream_error", model, projectId, error })` (DB-backed, queryable). Apply the same to the legacy path's identical swallow at `:522`. Ordering note: `discussModelId` is resolved after the loop from `primary.response`; to include it in the error log, kick off `primary.response` early via a promise and read it in the catch.

**#3 (R3) — Add SDK `repairToolCall` (1 in-turn attempt).** Wire `repairToolCall` on the primary `streamText`. It catches malformed args (`InvalidToolInputError`) by re-prompting the same turn once — one cheap round-trip — then returns the fixed call or `null`. On `null`, control falls through to Layer 3. The inner re-prompt call gets `maxRetries: 2` so provider flakiness inside repair is covered by Layer 1 (HTTP redial). One attempt, not more — Layer 3 already retries 3× on its own, so duplicating would add latency without fixing more.

**#4 (R4) — Cap the Layer-3 cascade.** `repairDiscussCardWithTool` stays as the backstop for "tool call missing entirely / `repairToolCall` returned null." Cap total Layer-3 attempts to **3 per turn** via a shared counter across both the `!chatText` (`:1033`) and `primaryToolFailed` (`:1139`) branches, instead of today's 3+3=6. Worst-case latency drops 270s → 135s. With #1 forcing the tool, the `!chatText` branch (tool-only, no prose) becomes rare anyway.

**#5 (R5) — Degrade to plain textbox instead of error toast.** After Layer 2 + Layer 3 both exhaust, **if any text streamed**, emit that text + a `workspaceCard.type === "none"` tool output (via the existing `createFallbackWorkspaceCard`) instead of `writer.write({ type: "error" })`. The client already renders `type:"none"` as the normal text input — zero new client code in this one-shot. Only emit the error toast when *nothing* streamed at all (true total failure).

### Part 3: Three-layer repair (explicit model)

| Layer | Mechanism | Fixes | Config | Wired today? |
|---|---|---|---|---|
| 1 | `maxRetries` (HTTP redial) | network/provider 429/503 | 2 on primary | yes |
| 2 | SDK `repairToolCall` (in-turn) | malformed tool args | 1 attempt, inner `maxRetries: 2` | **no — adding** |
| 3 | `repairDiscussCardWithTool` (new request) | tool call missing / Layer 2 gave up | 3 attempts × 45s, capped per turn | yes (capping) |

### Part 4: 1:1 reliability sim (gate before shipping)

Rewrite `.data/tmp/sim-reliability.mjs` → `.data/tmp/sim-reliability.ts` (gitignored scratch, run on-demand, never in CI — it hits live 9router).

**1:1 sourcing (zero drift):** imports `buildOneCallSystemPrompt`, `presentWorkspaceCardTool`, `PRESENT_WORKSPACE_CARD_TOOL_NAME` from `src/lib/projects/discuss-tool.ts`. 9router model wiring mirrors prod (`createOpenAICompatible({ supportsStructuredOutputs: false, includeUsage: true })`, same env vars).

**Fixtures (hand-written, 4-6):** each `{ messages, brief, hasBuiltSite }`:
1. Turn-1 greeting, empty brief, `hasBuiltSite=false` → question card expected.
2. Mid-interview, brief with `businessName` + `businessType`, confidence ~45 → next question.
3. Near-complete, mandatory + 2 soft fields, confidence ~90 → `build_recommendation` expected.
4. Edit turn, `hasBuiltSite=true` → `type:"none"` expected (proves forced-tool is correct for the none-payload case, not just questions).
5-6. Repeat variants for coverage.

**Variable under test:** `toolChoice` only — each fixture run N times (default 25) under two arms: `auto` (current prod) vs `required` (proposed). Same schema, prompt, history, model; only toolChoice differs. Side-by-side cardOk% / textOk% / orderOk% / error% / latency, with failure breakdown (`no_tool_call` vs `bad_args` vs `stream_error`).

**Scoring:** validators point at the real schema shape (`workspaceCard.type`, `.question.id`, `.question.options[]`, `type:"none"` for edit turns). Reuses the existing sim's percentile/latency helpers.

### Shipping gate

Run the sim at 25 runs/fixture, both arms. Ship the change **only if** the `required` arm meets **all** of:
- `cardOk% ≥ 90%`
- beats `auto` by ≥ +15 points
- no spike in `InvalidToolInputError` / malformed-args failures vs `auto`

If `required` backfires (e.g. garbage calls, lower cardOk%), **do not ship** — return to brainstorm. If it passes, make the one-line `toolChoice` change (already done in Part 2) with real evidence, then a browser E2E run confirms end-to-end before merging.

## Net effect vs today

| Failure | Today | After |
|---|---|---|
| Model skips tool | 135s repair → maybe error | impossible (required) |
| Malformed args | crash → error toast | Layer 2 fixes in-turn → card |
| Layer 2 can't fix | (didn't exist) | Layer 3 rebuilds → card |
| Layer 3 can't fix, text streamed | error toast | plain textbox (`type:"none"`) |
| Total failure, nothing streamed | error toast | error toast (honest) |
| Worst-case latency | 270s | 135s |
| Diagnosability | swallowed errors | DB-logged with model + error |

## Files touched

- **New:** `src/lib/projects/discuss-tool.ts` (extracted pure module)
- **New:** `.data/tmp/sim-reliability.ts` (replaces `.mjs`; gitignored scratch)
- **Edit:** `src/routes/api.projects.preview.ts` (#1–#5 + import from new module + re-export moved symbols + legacy R2 log)
- **Edit:** `src/lib/projects/api.projects.preview.test.ts` (repont `buildOneCallSystemPrompt` import to `@/lib/projects/discuss-tool`; `buildChatSystemPrompt` import unchanged if re-exported from route, else repoint too)

## Verification

1. **Extraction guard:** `src/lib/projects/api.projects.preview.test.ts` passes against new module location; `bun run check` green (typecheck/lint/Knip catch the move). Graphify re-run confirms no duplicate definitions of `presentWorkspaceCardTool` / `buildOneCallSystemPrompt` / `buildCardSystemPrompt` remain.
2. **Sim gate:** `.data/tmp/sim-reliability.ts` run at 25/fixture meets the shipping bar above.
3. **Unit:** existing discuss/brief-flow tests unchanged-behavior green.
4. **Browser E2E (post-merge candidate):** one real discuss session confirms progressive text + card render + degradation; client-race fix is the separate follow-up.
