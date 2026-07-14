# PRD: Smooth End-to-End Project Lifecycle

Status: proposed
Created: 2026-07-14
Updated: 2026-07-14
Owner: suryaelidanto
Scope: Full project lifecycle — chat, workspace card, build, generated code, preview, delete — under the migrated TanStack Start + 9Router stack
Read when: fixing or improving the end-to-end flow from project creation through generated code output, or when diagnosing AI reliability, timeout, or structured-output issues on the current stack.
Do not read for: control-plane framework migration itself (see `tanstack-start-full-migration-prd.md`), runtime supervisor architecture (see `isolated-project-runtime-prd.md`), or publishing/custom-domain work.
Current truth: source code + `docs/architecture.md` + `docs/prds/guided-discuss-reliability-prd.md` + `docs/prds/workspace-card-reliability-hardening-prd.md` + `docs/prds/fast-generated-app-builds-prd.md` + `docs/prds/confidence-driven-discussion-and-ai-decided-output-prd.md`

## Problem Statement

After migrating the control plane to TanStack Start, the end-to-end project lifecycle — create project → guided chat → workspace card → build → generated code — does not work smoothly. Specific failures found during real-device debugging:

1. **Workspace card never appears.** After a guided discussion, the workspace card always returns `type: "none"`. The user sees chat text but no interactive question or build recommendation. The root cause is twofold:
   - The 9Router gateway does not support `responseFormat` (structured output). When the card generation call includes `providerOptions: { "9router": { responseFormat: { type: "json" } } }`, the model returns empty text, and `parseJsonLenient("")` produces `null`, so `normalizeWorkspaceTurn` defaults to `type: "none"`.
   - The card generation timeout (10 seconds per attempt, 20 seconds total) is shorter than the model's actual generation time (~30 seconds for 1,452 output tokens). Even without the structured-output bug, the call would time out before the model finishes.

2. **Build never starts.** Without a `build_recommendation` card, the user cannot trigger a build. When forced through the API, the implementation spec generation fails for the same structured-output reason (`Output.object()` → `AI_NoOutputGeneratedError`).

3. **Energy silently blocks all actions.** When daily energy is exhausted, the preview route returns `429 energy_exhausted` with no visible feedback — the SSE stream simply returns empty. The user has no idea why nothing happens.

4. **Project deletion UX is fragile.** The `deleteProject` function works (server-side cleanup + DB delete), but the client-side flow depends on a server action pattern from the old Next architecture. On TanStack Start, the same pattern works but the error handling and refresh behavior need verification under the new routing model.

5. **The `parseJsonLenient` fallback exists but is untested against real model output.** The model wraps JSON in markdown fences (`\`\`\`json ... \`\`\``). The lenient parser strips fences, but the production path was never exercised because structured output masked the issue.

From the user's perspective: "I type what I want, the AI talks to me, but nothing ever gets built. I don't know if it's broken or if I'm doing something wrong." This is a product-breaking experience.

## Solution

Fix every failure in the chain from chat input to generated code output, so the full lifecycle works smoothly for a real user on the real stack:

1. **Remove all structured-output dependencies.** Replace `providerOptions.responseFormat` and `Output.object()` with plain text generation + manual JSON parsing via `parseJsonLenient`. The model produces valid JSON from well-crafted system prompts without needing the provider to enforce JSON mode. Verified: the `umkmcepat-combo` model returns 1,452 output tokens of valid JSON when called without structured-output constraints.

2. **Increase card generation timeout.** Raise `DISCUSS_CARD_ATTEMPT_TIMEOUT_MS` from 10s to 45s (matching observed model latency), and increase `maxMs` to 120s to allow env overrides. The outer `DISCUSS_CARD_SERVER_DEADLINE_MS` scales accordingly (90s for 2 attempts).

3. **Make energy exhaustion visible.** When the preview route returns `energy_exhausted`, the SSE stream should emit an explicit `error` event with the message and `remaining: 0` before closing, so the client can show a clear "Energi habis" state instead of silently doing nothing.

4. **Verify and harden project deletion.** Confirm the `deleteProject` server function works end-to-end under TanStack Start (auth check, artifact cleanup, DB cascade, UI refresh). Fix any issues found.

5. **Verify end-to-end: chat → card → build → generated code → preview.** Drive the full flow on the real stack with a real session cookie, real database, and live 9Router. Confirm every intermediate state: chat streams, card appears, build recommendation shows, build starts and streams progress events, build completes with artifacts, preview loads generated HTML.

## User Stories

1. As a UMKM owner, I want to type what I need for my business in plain Indonesian and have the AI understand me, so that I don't need technical knowledge.
2. As a UMKM owner, I want the AI to ask me clarifying questions one at a time through interactive cards, so that I can answer naturally without being overwhelmed.
3. As a UMKM owner, I want the AI to tell me when it's ready to build my website through a clear build recommendation card, so that I know my requirements are understood.
4. As a UMKM owner, I want to click "Buat Website" and see real-time progress of my website being built, so that I know the system is working.
5. As a UMKM owner, I want to see my generated website in a preview iframe after the build completes, so that I can review the result.
6. As a UMKM owner, I want to continue chatting to request changes after seeing the preview, so that I can iterate on my website.
7. As a UMKM owner, I want to delete a project I no longer need, so that my workspace stays clean.
8. As a UMKM owner, I want to see my remaining daily energy clearly, so that I can plan my usage.
9. As a UMKM owner, when my energy is exhausted, I want a clear message telling me what happened and when it resets, so that I don't think the app is broken.
10. As a UMKM owner, I want the chat to feel smooth and responsive — text streaming immediately, cards appearing within seconds — so that the experience feels like talking to a real assistant.
11. As a developer, I want the AI pipeline to work without provider-specific structured-output support, so that the system is resilient to gateway limitations.
12. As a developer, I want all AI timeouts to reflect real model latency, so that legitimate responses are not prematurely aborted.
13. As a developer, I want the implementation spec generation to produce valid JSON even when the provider doesn't support `responseFormat`, so that builds can proceed.
14. As a developer, I want the build progress stream to include all intermediate steps (spec generation, source writing, build validation, artifact storage), so that the UI can show granular progress.
15. As a developer, I want the project deletion to clean up all resources (artifacts, deployments, thumbnails, DB rows) reliably, so that no orphaned data remains.
16. As a developer, I want the energy system to block actions cleanly with user-visible feedback, so that users never see silent failures.
17. As a platform operator, I want the E2E flow to be verifiable with a single automated test script, so that regressions are caught before they reach users.
18. As a platform operator, I want the `umkmcepat-combo` model's actual latency characteristics documented, so that timeout values can be tuned rationally.
19. As a platform operator, I want the 9Router structured-output limitation documented, so that future model/provider changes are evaluated against this constraint.
20. As a UMKM owner, I want the AI to remember everything I said across the entire conversation, so that I never have to repeat myself.
21. As a UMKM owner, if the AI fails to generate a card, I want to see a calm "Menyiapkan pertanyaan berikutnya..." loading state instead of a red error, so that I stay confident.
22. As a UMKM owner, I want the build to stream visible progress steps (not a generic spinner), so that I can see my website being created in real time.
23. As a UMKM owner, I want the generated website to include all the details I provided (business name, products, prices, contact info, colors), so that the result feels personalized.
24. As a UMKM owner, I want the project list on the home page to show my projects with thumbnails, so that I can quickly find and return to my work.
25. As a UMKM owner, I want to click on a project card to open the workspace, so that I can continue where I left off.
26. As a developer, I want the `parseJsonLenient` function to handle all common model output formats (raw JSON, markdown-fenced JSON, JSON with preamble text), so that parsing is robust.
27. As a developer, I want the SSE stream to always close cleanly (with `[DONE]` or an explicit error event), so that the client never hangs waiting for a response.
28. As a developer, I want the `after()` post-response behavior (thumbnail refresh) to work reliably under TanStack Start's fire-and-forget pattern, so that thumbnails are generated after preview access.

## Implementation Decisions

### Structured output removal

All `providerOptions: { "9router": { responseFormat: { type: "json" } } }` calls are removed from the preview route. All `Output.object()` calls are removed from the generate route. Both are replaced with plain text generation where the system prompt instructs the model to output JSON, and the response is parsed with `parseJsonLenient`.

This is a deliberate trade-off: we lose the provider-enforced JSON schema guarantee, but we gain compatibility with the current9Router gateway. The `parseJsonLenient` function handles markdown fences, preamble text, and partial JSON extraction, which covers the observed model output patterns.

### Timeout adjustments

`DISCUSS_CARD_ATTEMPT_TIMEOUT_MS` raised from 10,000ms to 45,000ms. `DISCUSS_CARD_SERVER_DEADLINE_MS` is derived (attempt × attempts = 45,000 × 2 = 90,000ms). The `discussCard` timeout config `maxMs` raised to 120,000ms to allow env overrides for slower models.

All other timeouts (discuss, moderation, buildSpec, sourceGeneration, edit, editRepair) remain unchanged. The moderation timeout (30s) was already sufficient; the moderation issue was caused by the model returning empty text for structured output, not by timeout.

### Energy feedback

The preview route's SSE stream emits an explicit `error` event with `{ message: "Energi harian habis. Coba lagi besok.", code: "energy_exhausted", remaining: 0 }` before the stream closes. The client already handles `error` events in the stream — this just ensures the error is surfaced instead of silently emptying.

### Implementation spec generation

The `generateImplementationSpec` function in the generate route is rewritten:

- Remove `Output.object()` and `jsonSchema()` imports.
- Use `streamText` with plain text output (no `output` parameter).
- Accumulate `textStream` chunks and attempt JSON parsing after each chunk via `parseJsonLenientSafe` (a safe variant that returns `null` on parse failure instead of throwing).
- After the stream ends, parse the final accumulated text.
- The `parseImplementationSpec` function is called on the parsed JSON object, matching its existing `unknown → ImplementationSpec | null` signature.

### Project deletion verification

The `deleteProjectFn` server function is verified to work under TanStack Start:

- `auth()` returns the session correctly.
- `prisma.project.findFirst` with ownership check works.
- `cleanupProjectResources` (artifact deletion, runtime stop) executes correctly.
- `prisma.project.deleteMany` with ownership check works.
- The client-side `deleteProject` wrapper extracts `projectId` from FormData and calls the server function.
- After deletion, `ProjectList` removes the project from local state and shows a toast.

### 9Router limitation documentation

The9Router gateway's lack of `responseFormat` support is documented in `docs/architecture.md` under the AI gateway section, so future model/provider changes are evaluated against this constraint. Any code that attempts structured output through9Router will fail silently (empty response).

## Testing Decisions

### What makes a good test

- Tests assert external behavior: given a request (with session cookie), the route returns expected SSE events or JSON responses.
- Tests do not assert internal implementation details (which parsing function is called, how many retries occur).
- Tests use the real `parseJsonLenient` function against actual model output patterns (raw JSON, fenced JSON, JSON with preamble).
- Tests verify the full SSE event sequence for a complete discuss turn: `start` → `text-start` → `text-delta`* → `text-end` → card event (question or build_recommendation) → `finish`.

### Modules to be tested

1. **`parseJsonLenient`** — unit tests for: raw JSON, markdown-fenced JSON, JSON with preamble text, empty string, malformed JSON, JSON embedded in prose.
2. **`parseImplementationSpec`** — existing tests remain. Add integration test: `streamText` → accumulate → `parseJsonLenientSafe` → `parseImplementationSpec` → valid `ImplementationSpec`.
3. **Card generation (preview route)** — integration test: send a discuss message → verify SSE contains a card event with `type !== "none"` within the timeout window.
4. **Build generation (generate route)** — integration test: send a force build request → verify SSE contains `progress` events → `done` event → project status changes to `ready` or `failed`.
5. **Energy exhaustion** — integration test: exhaust energy → send discuss message → verify SSE contains `error` event with `code: "energy_exhausted"`.
6. **Project deletion** — integration test: create project → delete project → verify DB row removed, artifacts cleaned up, project list updated.

### Prior art

- Existing route handler tests in `tests/routes/` use the `getHandler` pattern with synthetic `Request` objects. New integration tests follow the same pattern.
- The `parseJsonLenient` function is new but follows the same lenient-parsing pattern as `parseImplementationSpec` and `parseProjectBrief`.
- Energy tests can extend the existing `src/lib/ai-moderation.test.ts` pattern (mock the AI model, verify behavior).

## Out of Scope

- **9Router configuration changes.** This PRD works around the structured-output limitation; it does not fix9Router. If9Router adds `responseFormat` support, the `providerOptions` can be restored.
- **Model migration.** This PRD does not change the default model (`umkmcepat-combo`). If a different model with structured-output support becomes available, it can be adopted separately.
- **Runtime supervisor / preview proxy changes.** The preview proxy and runtime supervisor are unchanged. This PRD only fixes the chat → card → build → artifact chain.
- **Publishing / custom domains.** Public publishing and custom domain routing are out of scope.
- **Visual redesign.** The workspace UI components (`WorkspaceShell`, `WorkspacePrimitives`) are unchanged except for energy error surfacing.
- **Test suite migration.** The existing unit test suite (299 tests) is unchanged. New integration tests are additive.

## Further Notes

- The `umkmcepat-combo` model generates ~1,452 output tokens for a card-generation call at `temperature: 0.35`. At the observed throughput, this takes approximately 25–35 seconds. The 45-second timeout per attempt provides adequate margin.
- The model wraps JSON in markdown fences (`\`\`\`json ... \`\`\``) by default. The `parseJsonLenient` function strips these fences before parsing.
- The `parseJsonLenientSafe` variant (used in the generate route) returns `null` on parse failure instead of throwing, allowing the streaming loop to continue accumulating text until a valid JSON object is found.
- The energy system uses `UserCredit` records with negative amounts for usage. The dev-only `/api/dev/add-energy` endpoint deletes today's negative records, effectively resetting energy to the daily limit (50).
- The fire-and-forget pattern for thumbnail refresh (`void refreshProjectThumbnail(...).catch(() => undefined)`) is a pragmatic replacement for Next.js `after()`. It works correctly on Bun/Node servers where the event loop keeps the process alive, but does not guarantee completion on serverless platforms with cold-start teardown.

## Status History

- 2026-07-14: Proposed after debugging the full E2E flow on the migrated TanStack Start stack. Root causes identified:9Router lacks structured-output support, card generation timeout too short, energy exhaustion silently blocks actions.
