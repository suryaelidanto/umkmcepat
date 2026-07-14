Status: proposed
Created: 2026-07-09
Updated: 2026-07-09
Owner: Surya
Scope: AI request streaming, timeout configuration, tool-call finalization, observability, and user-visible recovery
Read when: changing any AI request, AI SDK streaming, generated-app build/edit agents, moderation, chat compaction, timeouts, retry behavior, or AI observability
Do not read for: non-AI UI polish, auth-only changes, static legal pages, pure database migrations unrelated to AI state, or generated app visual design alone
Current truth: source code + `DEV.md` + `PRODUCT.md` + `PRINCIPLES.md` + `docs/architecture.md` + `docs/prds/guided-discuss-reliability-prd.md`

## Problem Statement

UMKM Cepat depends on AI for project creation safety checks, guided Discuss, chat memory compaction, implementation spec generation, generated source creation, visual/source edits, repair passes, and build-related reasoning. Users have repeatedly seen broken-feeling states: project creation returns `503` after a long wait, Discuss text streams but the workspace card arrives late or not at all, stale questions reappear after being answered, generated preview cards appear ready in backend state but the UI remains stuck, and retries can make the product feel random.

From the user's perspective, the problem is not that AI is slow. Slow is acceptable when progress is visible and the final state is reliable. The problem is that timeouts, stream finalization, and retry boundaries are inconsistent. Some AI work times out too aggressively, some work has no explicit timeout, some finalization waits are too short for the provider/tool layer, and some failure paths discard or hide useful partial progress. The user sees this as: "AI answered, then the UI broke," or "I already answered that, why did it ask again?" or "Project creation failed even though the prompt was normal."

Streaming text alone does not solve this. Streaming proves that some progress reached the user, but the request can still hang after partial output, the AI tool call can resolve after the server finish handler, a provider can freeze mid-stream, a gateway can buffer, a DB write can lag behind a client reload, and a generated app preview can miss its ready signal. The product needs streaming for UX and timeouts for safety. The timeout problem is that the current values and locations are not coherent, not fully configurable, and sometimes destructive.

UMKM Cepat needs a complete AI reliability hardening pass that inventories every AI request, makes timeouts environment-configurable, sets defaults that are not aggressively short, preserves partial user-visible progress, logs the real failure boundary, and prevents stale UI rollback. This PRD is the investigation and implementation guide for making AI-driven flows feel calm, observable, and reliable.

## Solution

UMKM Cepat will treat every AI request as a bounded operation with a user-appropriate timeout, visible progress when applicable, durable partial state when safe, and explicit recovery when the AI result is incomplete. Timeout configuration will move into a single canonical environment-driven timeout module, with `.env.example` documenting every supported knob.

The default policy:

- No AI request should default below 30 seconds.
- User-facing Discuss should stream text promptly and allow enough time for tool/card finalization.
- Moderation should not block normal project creation because of a tiny timeout; if moderation infrastructure is slow or unavailable, the current fail-open behavior for normal business prompts may remain, but the timeout should be sane and logged.
- Build/spec/source/edit/repair AI work should have longer defaults because the user already expects build/edit to take time.
- Timeouts should terminate truly stuck operations, not normal slow operations.
- Timeout failures must preserve useful completed work: chat text stays visible, user answers remain saved, last good preview/thumbnail remains, and stale questions do not reappear.
- Timeout values must be configurable without code changes.

The product will distinguish three layers:

1. **Streaming progress**: text or progress events that prove the user can see work happening.
2. **Finalization barrier**: server-side completion work required before the client reloads or reconciles committed state, such as workspace-card tool output persistence.
3. **Timeout boundary**: a configurable safety stop that decides when a missing AI/tool result is truly late enough to fail cleanly.

The implementation should not add dummy AI content, deterministic fallback cards, or fake generated outputs. Recovery should be honest: keep partial real AI text, explain that the structured card/build/edit did not finish, and offer a focused retry where appropriate.

## User Stories

1. As a small-business owner, I want AI responses to stream visibly, so that I know the product is working.
2. As a small-business owner, I want slow AI to keep waiting within a reasonable window, so that normal provider latency does not break my flow.
3. As a small-business owner, I want the product to stop waiting when AI is truly stuck, so that I am not left with an infinite spinner.
4. As a small-business owner, I want project creation to avoid failing just because a safety checker was briefly slow, so that I can start working reliably.
5. As a small-business owner, I want my chat text response to remain visible even if the next UI card fails, so that I do not lose useful AI progress.
6. As a small-business owner, I want the app not to ask the same question again after I answered it, so that the discussion feels intelligent.
7. As a small-business owner, I want a retry to repair only the failed part, so that I do not have to redo a whole response unnecessarily.
8. As a small-business owner, I want clear Indonesian recovery copy, so that I understand whether to retry, wait, continue chatting, or rebuild.
9. As a small-business owner, I want build progress to continue being visible, so that long builds feel trustworthy.
10. As a small-business owner, I want failed rebuilds not to destroy the last successful preview, so that I can still inspect the previous good site.
11. As a small-business owner, I want preview loading failures to become actionable states, so that I am not stuck on a spinner.
12. As a returning user, I want refresh to show the latest durable state, so that browser reloads do not corrupt progress.
13. As a returning user, I want old projects without new metadata to continue working, so that reliability work is backward-compatible.
14. As a beta tester, I want fewer false failures from short timeouts, so that I can test the actual product instead of timeout edge cases.
15. As a beta tester, I want logs to reveal whether frontend streaming, backend streaming, provider streaming, tool finalization, DB persistence, or preview readiness failed, so that bugs can be reported precisely.
16. As an operator, I want every AI timeout configurable through environment variables, so that local, VPS, and production deployments can tune latency without code changes.
17. As an operator, I want defaults that are safe for slow local 9Router/provider paths, so that development does not look broken by default.
18. As an operator, I want a central list of timeout environment variables, so that I do not have to grep the codebase.
19. As an operator, I want timeout logs to include project id, operation kind, model, duration, and safe status, so that recurring slow paths are visible.
20. As an operator, I want timeout logs to avoid secrets, prompts beyond safe excerpts, API keys, auth tokens, and private generated content dumps, so that observability is safe.
21. As a developer, I want a single timeout helper, so that timeout parsing/clamping does not drift across modules.
22. As a developer, I want every AI SDK call site audited, so that no request is left unbounded or aggressively bounded.
23. As a developer, I want tests around delayed AI tool finalization, so that finish-before-tool races do not regress.
24. As a developer, I want tests around moderation timeout behavior, so that project creation does not fail because of an overly short checker.
25. As a developer, I want tests around compaction timeout behavior, so that background memory work never breaks visible chat.
26. As a developer, I want generated build/edit AI operations to have longer budgets than chat, so that complex output is not cut off prematurely.
27. As a developer, I want route `maxDuration` values to be large enough for configured AI timeouts, so that framework-level timeout does not terminate earlier than the intended AI timeout.
28. As a developer, I want environment examples documented, so that future agents do not hardcode new timeout constants.
29. As a developer, I want clear separation of AI timeouts and non-AI timeouts, so that build command, preview-ready, runtime start, and idle cleanup are tuned separately.
30. As a developer, I want frontend/client timeout behavior to preserve partial progress, so that UI recovery is non-destructive.
31. As a developer, I want no hidden normal-path duplicate AI calls, so that timeouts are not masked by extra cost or confusing traces.
32. As a developer, I want explicit repair/retry calls to be separately observable, so that they are not mistaken for normal duplicate calls.
33. As a developer, I want frontend streaming to be verifiable from browser network chunks, so that we can distinguish backend-provider streaming from backend-frontend streaming.
34. As a developer, I want the app to handle providers that emit tool outputs after text finish, so that AI SDK event ordering does not break UI state.
35. As a developer, I want the app to handle providers that never emit the expected tool, so that the user gets a clean retry/free-chat state.
36. As a developer, I want old successful builds without thumbnails or new metadata to keep using safe placeholders, so that migration is not blocking.
37. As a maintainer, I want PRs touching AI calls to update the timeout registry and docs, so that future work stays coherent.
38. As a maintainer, I want full local checks before shipping timeout changes, so that reliability patches do not introduce type/test regressions.

## Implementation Decisions

- Create a single AI timeout registry module. The module owns environment names, default values, min/max clamps, and parse behavior.
- All AI timeout defaults must be at least 30 seconds unless there is a documented product reason and explicit user approval.
- Use environment variables for each meaningful AI operation category rather than one global timeout that is wrong for some flows.
- Proposed AI timeout environment variables:
  - `AI_TIMEOUT_MODERATION_MS`, default `30000`.
  - `AI_TIMEOUT_DISCUSS_MS`, default `90000`.
  - `AI_TIMEOUT_DISCUSS_TOOL_SETTLE_MS`, default `30000`.
  - `AI_TIMEOUT_CHAT_COMPACTION_MS`, default `60000`.
  - `AI_TIMEOUT_BUILD_SPEC_MS`, default `120000`.
  - `AI_TIMEOUT_SOURCE_GENERATION_MS`, default `180000`.
  - `AI_TIMEOUT_EDIT_MS`, default `180000`.
  - `AI_TIMEOUT_EDIT_REPAIR_MS`, default `180000`.
- Proposed non-AI timeout environment variables to evaluate separately:
  - `PROJECT_BUILD_COMMAND_TIMEOUT_MS`, default currently equivalent to 180 seconds; consider 180000-300000.
  - `PROJECT_PREVIEW_READY_TIMEOUT_MS`, default 12000 today; consider 15000-30000.
  - Runtime startup/retry timeout variables if the runtime supervisor exposes a start loop.
- Keep Next route `maxDuration` exports static. They cannot be runtime environment variables. Set route max durations high enough to exceed configured defaults and document that runtime AI timeouts are the actual product-level control.
- Moderation timeout should be increased from the current overly aggressive default. If moderation times out or provider fails, existing create-flow behavior may continue to allow normal project creation, but it must log the timeout safely.
- Project creation 503s must log the real failure boundary. The create route currently swallows `createProjectOnce` errors and returns a generic 503; future implementation should add safe dev/observability logs before returning 503.
- Discuss streaming must continue using a single AI SDK streaming call in the normal path. Do not regress to complete JSON generation for normal Discuss.
- Discuss workspace-card tool settlement must use the configurable `AI_TIMEOUT_DISCUSS_TOOL_SETTLE_MS` value. When the tool arrives in time, persist card/brief/title before client reconciliation. When it does not, keep chat text and show explicit recovery.
- Discuss timeout failure must not restore an already-answered card. If the active card was answered in the latest user message, the composer should fall back to free chat or a retry-card state, not the stale card.
- Chat compaction timeout/failure should never break visible chat. It should return `null`, skip compaction, and try again later when thresholds apply.
- Build implementation spec timeout should produce a clean build failure or recoverable fallback only when that fallback is honest and already part of product policy. It must not fabricate final generated content as if AI succeeded.
- Generated source creation and edit agents need longer budgets than Discuss. If they time out, they should preserve prior source/build state and produce a visible failure/retry path.
- Repair passes should have their own timeout and logs so operators can distinguish initial generation from repair work.
- Every AI request should include enough metadata for observability: operation kind, model, route/project/build/edit attempt id when available, configured timeout, duration, finish reason/error class, and retry/repair flag.
- The implementation should coordinate with AI observability/Langfuse work. Timeout metadata should be visible in both local verbose logs and configured tracing where available.
- `.env.example` is the canonical env placeholder list. Add all timeout variables there with comments or grouping.
- `DEV.md`, `docs/architecture.md`, and/or `docs/deployment.md` should document how to tune these values for local 9Router, VPS, and production.
- Do not add new dependencies solely for timeouts. Use AbortController, AI SDK `timeout`/`abortSignal` support where supported, and small local helpers.
- Do not add broad retry loops. Retrying can multiply cost and confuse state. Prefer one explicit user retry or one already-approved repair path.

## Testing Decisions

- Highest-priority seam: route-level tests for user-visible AI flows with mocked AI SDK behavior. These should simulate slow, delayed, missing, and successful responses.
- Add moderation tests proving the default timeout is 30 seconds and low env values are clamped/ignored according to the final helper policy.
- Add Discuss tests proving tool settlement uses the configured env value and does not finish/persist stale state before a delayed tool within the configured window.
- Add Discuss tests proving missing tool after timeout keeps chat messages but does not overwrite workspace with a fabricated card.
- Add client/workspace state tests proving answered stale question cards are not shown again after a failed/missing card turn.
- Add compaction tests proving timeout/failure is swallowed as a non-blocking `null` result where appropriate.
- Add build/spec tests where an AI timeout produces the correct build failure/recovery state without corrupting last successful preview.
- Add source/edit tests where timeout preserves previous source snapshot and records a failed edit attempt where applicable.
- Add configuration tests for the timeout helper: default values, env override, invalid env fallback, min clamp, max clamp, and operation key coverage.
- Do not test exact millisecond wall-clock delays with real timers where fake timers can prove behavior faster.
- Use fake timers for timeout boundary tests.
- Use existing route tests as prior art: project preview route tests, moderation tests, source/edit route tests, and workspace-sync tests.
- Manual validation should include browser DevTools Network inspection for `POST /api/projects/preview` to confirm backend-to-frontend chunks arrive over time, not only after provider completion.
- Manual validation should include local verbose logs and, after observability lands, trace inspection for AI operation durations and timeout metadata.
- Full `bun run check` is required before handoff/commit because timeout work cuts across multiple subsystems.

## Out of Scope

- Replacing AI SDK.
- Replacing 9Router.
- Adding a new queue system solely for this timeout hardening pass.
- Adding deterministic fake AI outputs.
- Adding dummy/manual workspace cards.
- Adding broad automatic retry loops for normal AI success paths.
- Reworking the generated app architecture.
- Implementing screenshot thumbnails or preview-card rendering, except where preview-ready timeout semantics are directly relevant.
- Changing product positioning or visual design language.
- Changing auth providers.
- Changing rate-limit policy except where timeout behavior currently masquerades as rate-limit or create failure.
- Migrating historical data.

## Further Notes

Streaming and timeout serve different jobs. Streaming is for user-perceived progress. Timeout is for safety, resource control, finalization, and recovery. Removing timeouts would leave requests, DB state, build state, or UI spinners stuck indefinitely when a provider or tool event hangs. The correct fix is not "no timeout"; it is generous, configurable, non-destructive timeouts with good logs.

The recent failure pattern in Discuss was a server/client finalization race: backend could finish the response and the client could reload before the structured workspace tool output persisted. Increasing the settlement window helps, but the broader solution is to make all AI finalization barriers explicit, configurable, and tested.

The frontend/backend streaming question should be validated empirically. Terminal logs only prove backend/provider events. Browser Network streaming chunks prove backend-to-frontend streaming. If chunks arrive gradually but UI does not update, the bug is client state/rendering. If chunks arrive only at the end, the bug is backend/proxy/provider buffering.

The current timeout audit found known AI call sites in moderation, project preview/discuss, chat compaction, build spec generation, generated source generation, and source/visual edit agents. Implementation agents should re-run a code search before editing because active observability work may add wrappers or new AI call paths.

## Status History

- 2026-07-09: Created from repeated Discuss, project creation, preview readiness, and timeout reliability debugging.
