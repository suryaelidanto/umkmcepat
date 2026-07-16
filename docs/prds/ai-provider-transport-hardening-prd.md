# PRD: AI Provider Transport Hardening

Status: proposed
Created: 2026-07-16
Updated: 2026-07-16
Owner: Surya
Scope: 9Router AI request transport layer (HTTP fetch wrapper, response parsing, Content-Type normalization) covering build spec generation, discuss chat, moderation, edit comment, build source generation, build repair, and chat compaction
Read when: changing `src/lib/ai.ts`, adding new AI call sites, debugging `Invalid JSON response` / `AI_APICallError` / `AI_JSONParseError` errors, or changing 9Router combo configuration
Do not read for: AI timeout/streaming UX (see `ai-streaming-reliability-hardening-prd.md`), generated-app runtime/build execution failures unrelated to AI response parsing, non-AI UI work, pure database migrations unrelated to AI state
Current truth: source code + `docs/architecture.md` + `docs/prds/ai-streaming-reliability-hardening-prd.md` + `docs/prds/workspace-card-reliability-hardening-prd.md` + this PRD

## Status History

- 2026-07-16: Proposed after reproducing across all 7 configured 9Router combo models a transport-layer bug where 9Router returns `Content-Type: text/event-stream` with a body that is leading whitespace followed by a single valid JSON object followed by a trailing `data: [DONE]` SSE terminator and a blank line. The bug breaks both the AI SDK JSON response handler (`generateText`/`doGenerate`) and the event-source response handler (`streamText`/`doStream`) and is the root cause of `Invalid JSON response` failures observed in moderation, discuss, build, and edit flows.

## Problem Statement

Every AI-driven flow in UMKM Cepat routes through a single chokepoint: `getAiModel()` in `src/lib/ai.ts`, which builds a `@ai-sdk/openai-compatible` provider pointed at the self-hosted 9Router instance. 9Router is a load-balancing/failover proxy that fronts a configured "combo" of upstream models (in production: 7 specific `openrouter/*` models) using a fallback policy. The application depends on 9Router to behave like a normal OpenAI-compatible endpoint.

9Router does not behave like a normal OpenAI-compatible endpoint. For non-streaming chat completions (i.e. when `stream: true` is NOT set on the request), 9Router returns:

- HTTP status: `200 OK`
- `Content-Type: text/event-stream` (wrong — should be `application/json`)
- Body: leading whitespace (newlines and spaces), then a single valid JSON chat-completion object (with nested objects inside), then a trailing SSE `data: [DONE]` terminator and a blank line, e.g. `\n         \n\n         \n{...}\ndata: [DONE]\n\n`

The Vercel AI SDK v6/v7's `createJsonResponseHandler` (used by `generateText`/`doGenerate`) reads the body and throws `AI_JSONParseError` with message `Invalid JSON response` because the trailing sentinel and whitespace are not valid JSON. The same framing also confuses `createEventSourceResponseHandler` (used by `streamText`/`doStream`) because the Content-Type promises SSE but the body is not a real multi-event stream.

This bug is reproducible for every one of the 7 currently-configured combo models:

- `openrouter/minimax/minimax-m3`
- `openrouter/stepfun/step-3.7-flash`
- `openrouter/qwen/qwen3-235b-a22b-thinking-2507`
- `openrouter/deepseek/deepseek-v4-pro`
- `openrouter/xiaomi/mimo-v2.5-pro`
- `openrouter/google/gemini-3.1-flash-lite`
- `openrouter/qwen/qwen3-vl-235b-a22b-instruct`

It reproduces both with and without `response_format: { type: "json_object" }` in the request body, so the failure is purely a 9Router-side transport/framing defect, not model-specific, not provider-specific, not free-tier-specific, not `Output.json()`-triggered.

From the user's perspective, this is felt as:

- Home page: typing "I want to make a website for my coffee shop" and getting `503 Permintaan tidak dapat diproses saat ini. Silakan coba lagi.` after a 30s+ wait, even though the model produced a perfectly fine moderation answer that was thrown away.
- Discuss mode: chat text streams correctly, but the next workspace card never appears, and the panel ends in "AI belum sempat menyiapkan pilihan" with no clear retry.
- Build mode: the initial implementation-spec generation retries twice and then writes `Build failed before completion.` to the project history, even though the spec was generated.
- Edit comment: the AI-driven source edit returns `Invalid JSON response` and the user sees no change applied.
- Chat compaction: memory summarization silently fails, leaving older context that should have been summarized.

The product must feel fully reliable: the AI's actual successful answer should never be thrown away because of how 9Router framed the HTTP response. Every flow that calls the AI must work, regardless of which model in the combo 9Router picked, regardless of the 9Router combo configuration, and regardless of whether the user is on a free or paid upstream model.

## Solution

Harden the AI request transport layer with a single custom `FetchFunction` wrapper that the AI SDK invokes for every HTTP request. The wrapper is injected into the `createOpenAICompatible({ ... })` configuration in `src/lib/ai.ts`, where it transparently detects and repairs the specific 9Router framing defect while leaving all other response shapes untouched.

The detection and repair rules:

1. **Detect the specific 9Router bug**: a response with `Content-Type: text/event-stream` whose body, when read as text, is leading whitespace followed by a single balanced JSON object (handling nested objects and strings containing `}` or escaped quotes correctly) followed by optional stray `}`, whitespace, `data: [DONE]`, and optional trailing whitespace. Multi-event SSE streams (which have multiple `data:` lines) must not match.
2. **Repair it**: extract the balanced JSON object (stripping leading whitespace and the trailing `data: [DONE]` sentinel and any trailing whitespace), return a new `Response` whose body is the JSON and whose `Content-Type` header is rewritten to `application/json`. Preserve all other response headers and the HTTP status.
3. **Pass through everything else unchanged**: genuine multi-chunk SSE streams, already-correct `application/json` responses, non-2xx error responses, responses with a non-JSON non-SSE body, and empty bodies all flow through unmodified so the SDK's existing parsers see exactly what 9Router sent.

The wrapper is the only chokepoint: every call site in the app that resolves a model through `getAiModel()` automatically benefits, because the AI SDK routes both `doGenerate` (used by `generateText`, `generateObject`, `ToolLoopAgent`) and `doStream` (used by `streamText`) through the same `FetchFunction` slot. No call-site code, system prompt, tool schema, or AI call topology needs to change.

The product must feel reliable across the full surface: home-page project creation, Discuss chat (every phase and every recovery path), Build spec generation, Build source generation, Build AI repair, edit comment, and chat memory compaction. The wrapper must be invisible to those flows — they should keep working exactly as if 9Router were returning correctly-framed responses, because from the call site's perspective, they now are.

## User Stories

1. As a UMKM owner, when I type a business idea on the home page and click "Buat website", I want the safety check to succeed and a project to be created, so that I can start discussing my idea immediately.
2. As a UMKM owner, when the AI moderation takes a moment, I want to see clear progress and then succeed, so that I do not think the site is broken.
3. As a UMKM owner, I want my project to be created reliably regardless of which AI model the system happens to use right now, so that I am not at the mercy of provider flakiness.
4. As a UMKM owner, when I send an answer in Discuss mode, I want the next workspace card to arrive smoothly, so that the conversation feels intelligent and continuous.
5. As a UMKM owner, when the AI takes a moment to prepare the next question, I want a calm loading state and not a red error, so that I trust the product is still working.
6. As a UMKM owner, I want the chat text to always remain visible even if the next card takes longer, so that I never feel my answer was lost.
7. As a UMKM owner, I want the workspace card's one-call forced-tool repair pass to succeed when the primary stream dropped the tool call, so that I get a card instead of a permanent error.
8. As a UMKM owner, I want the review/build-recommendation phase to produce a card reliably, so that I can transition from discussion to build without a manual retry.
9. As a UMKM owner, when I click "Buat" to start a build, I want the implementation spec to be generated reliably, so that the build can begin.
10. As a UMKM owner, when the build is generating source files, I want each AI-driven file edit to succeed reliably, so that the build does not stall halfway.
11. As a UMKM owner, if a generated file fails to compile, I want the AI's repair attempt to actually run and produce a result, so that the build can self-correct.
12. As a UMKM owner, when I edit a generated file from a comment, I want the AI-driven edit to succeed reliably, so that my change is applied.
13. As a UMKM owner, when I chat a lot and the AI compacts my chat history in the background, I want compaction to succeed silently, so that the product keeps feeling responsive.
14. As a UMKM owner, I want every AI flow in the product to work regardless of which underlying model the combo picked at this moment, so that I am not surprised by intermittent failures.
15. As a UMKM owner, I want the product to keep working when the 9Router combo falls over from one model to another mid-flight, so that failover inside the proxy does not bubble up to me as a user-facing error.
16. As a UMKM owner, I want the product to keep working when 9Router adds a stray SSE terminator to a non-streaming response (the current bug), so that framing quirks in the proxy never become my problem.
17. As a UMKM owner, I want the product to remain reliable even when 9Router is upgraded to a new version that changes its framing behavior in minor ways, so that I am not at the mercy of proxy release timing.
18. As a UMKM owner, I want the product to keep working whether the model is free-tier or paid, so that upstream model economics never affect my user experience.
19. As a UMKM owner, I want the product to feel equally reliable in the morning and the late evening, so that peak/failover patterns inside the combo are invisible to me.
20. As a UMKM owner, I want a single normal "Try again" button when an AI call genuinely fails (not a transport bug), so that I have one obvious recovery path.
21. As a UMKM owner, I want to see a clear, honest error message when the AI call itself is unrecoverable, so that I know it is not just a network blip.
22. As a developer, I want a single place to harden all AI HTTP transport, so that I do not have to repeat the same fix in every call site.
23. As a developer, I want the transport fix to be expressed as a plain function with the standard `FetchFunction` shape, so that it slots into the SDK's existing extension point with no monkey-patching.
24. As a developer, I want the transport fix to live in its own module with no dependencies on call-site code, so that it can be tested in isolation and reasoned about independently.
25. As a developer, I want the transport fix to be opt-out-able with a single config line, so that future debugging or upstream SDK upgrades can bypass it.
26. As a developer, I want the transport fix to log (but not throw) when it repairs a response, so that operators can see how often the bug is occurring in production traces.
27. As a developer, I want the transport fix to be observable via the existing Sentry/Langfuse pipeline, so that the 9Router bug frequency is tracked like any other production signal.
28. As a developer, I want the transport fix to use the existing `getSafeAiErrorLog` canonical log shape when it cannot repair a response, so that the UI/log format stays uniform across the app.
29. As a developer, I want the fix to be covered by unit tests that stub `globalThis.fetch` with the established `vi.spyOn` convention, so that it tests only the wrapper's behavior, not 9Router itself.
30. As a developer, I want the fix to NOT introduce a new AI provider abstraction, a new env var, a new npm dependency, or a new retry policy, so that the surface area stays minimal.
31. As a developer, I want the fix to NOT change `Output.json()` to plain text + manual JSON parse, so that the schema/structured-output contract with the AI SDK stays intact.
32. As a developer, I want the fix to NOT add app-level model failover, so that 9Router remains the single source of truth for which upstream model is used at any given moment.
33. As a developer, I want the fix to NOT touch the `maxRetries` values that already exist at call sites, so that retry policy is owned by the call site, not the transport layer.
34. As a developer, I want the fix to preserve the exact same error behavior for genuine errors (HTTP 4xx/5xx, network failures, timeouts), so that existing error handling and user-facing error UI keep working.
35. As a developer, I want the fix to pass through genuine multi-chunk SSE streams untouched, so that streaming UX (live text, tool call streaming) is unaffected.
36. As a developer, I want the fix to be small (one file, one exported function, one 1-line config edit), so that the diff is reviewable in under five minutes.
37. As a developer, I want the fix to be safe to enable in production on day one, so that there is no need for a staged rollout.
38. As a developer, I want the fix to not require any new config or secret rotation, so that deployment is a no-op.
39. As a developer, I want the fix to be applied at the single chokepoint (`src/lib/ai.ts`) so that future call sites inherit the hardening for free.
40. As a developer, I want the wrapper to not swallow non-2xx responses, so that genuine upstream errors are still surfaced for debugging.
41. As a developer, I want the wrapper to be a pure function of `(input, init) → Promise<Response>`, so that it is trivial to reason about and to mock in tests.
42. As a developer, I want the wrapper to handle the 9Router bug with a regex/parse, not a streaming transformation, so that the implementation is simple and does not introduce a third body parser.
43. As a developer, I want the wrapper's repair path to be exercised by a dedicated test, so that a future regression in 9Router's framing does not silently break the app again.
44. As a developer, I want the wrapper to be the kind of change that lands once and stays stable, so that the team does not have to revisit transport hardening for the lifetime of the 9Router integration.
45. As a developer, I want the fix to be documented in a PRD that future maintainers can read first, so that the design rationale, scope, and known-not-covered failure modes are explicit.

## Implementation Decisions

- A single new module `src/lib/ai-fetch.ts` exports one function `nineRouterFetch: FetchFunction` (where `FetchFunction = typeof globalThis.fetch`). The module has no other exports and no dependencies on call-site code.

- The single 1-line edit to `src/lib/ai.ts` adds `fetch: nineRouterFetch` to the `createOpenAICompatible({ ... })` call so every model resolved through `getAiModel()` inherits the wrapper. This is the only production-code change outside the new module.

- The wrapper's repair logic is a small, ordered series of checks (no streaming transformation, no third body parser): read `Content-Type` from the response; if it is not `text/event-stream`, return the response unchanged; otherwise buffer the body as text; if the body matches the specific 9Router defect (single JSON object followed by `data: [DONE]` glued with no separator), construct a new `Response` from the JSON-only portion with `Content-Type` rewritten to `application/json`; otherwise return the original response unchanged. Buffered reading is acceptable because the affected responses are bounded by the same token limit the AI SDK already enforces upstream, and because non-recoverable responses (including genuine multi-event SSE streams) never reach the buffer-read path's error branch — they fall through as a passthrough.

- The wrapper does NOT swallow HTTP errors. Any non-2xx response is returned to the SDK untouched so the existing `AI_APICallError` and HTTP-status-driven UI continue to work.

- The wrapper does NOT log repaired responses by default. A single opt-in `console.debug` line is emitted on each repair so an operator can grep for the 9Router bug frequency in dev/staging; production log volume stays unchanged unless the bug recurs at scale.

- The wrapper does NOT change `Output.json()`, `Output.object()`, or any call-site `maxRetries` value. The fix is purely at the transport layer.

- The wrapper does NOT introduce a new env var. The existing `NINE_ROUTER_BASE_URL` / `NINE_ROUTER_API_KEY` configuration in `src/lib/ai.ts` is reused as-is.

- The wrapper does NOT introduce a new npm dependency. The `FetchFunction` type is imported from `@ai-sdk/provider-utils`, which is already an indirect dependency of `@ai-sdk/openai-compatible`.

- The wrapper does NOT add app-level model failover. 9Router remains the single source of truth for which upstream model answers a given request; this fix makes the application tolerate 9Router's framing, not 9Router's model selection.

- The wrapper does NOT change the `supportsStructuredOutputs: false` configuration already in `src/lib/ai.ts`. That flag is a separate concern about JSON-schema support and is unrelated to the framing bug.

- The single new test file `src/lib/ai-fetch.test.ts` stubs `globalThis.fetch` with `vi.spyOn(globalThis, "fetch")` (the convention established in `runtime-network.test.ts` and `runtime-proxy.test.ts`) and asserts: (a) the 9Router malformed-SSE-with-valid-JSON case is repaired and re-tagged `application/json`; (b) a genuine multi-event SSE stream passes through unchanged; (c) an already-correct `application/json` response passes through unchanged; (d) a non-2xx error response passes through unchanged with its status preserved; (e) an empty body passes through unchanged; (f) a `text/event-stream` body that is genuine garbage (not the 9Router bug shape) passes through unchanged; (g) the wrapper preserves all response headers from the original response on the repair path. Tests assert on the public contract (response `Content-Type` and parseable body) only, not on internal implementation details.

- The fix does not change the `createOpenAICompatible({ includeUsage: true, supportsStructuredOutputs: false, name: "9router", baseURL, apiKey, fetch: nineRouterFetch })` call's other fields.

- The fix does not require new infra, secrets, config files, or environment-specific changes. The diff is exactly: one new file, one new test file, one 1-line edit to an existing file.

## Testing Decisions

- A good test for this fix exercises only the wrapper's external contract: given a stubbed `globalThis.fetch` that returns a specific `Response`, the wrapper's output `Response` must have the right `Content-Type`, the right parseable body, the right status, and the right headers. Tests do not assert on internal state, on whether the wrapper called the underlying fetch, or on what the underlying fetch received (beyond the standard `(input, init)` shape, which is part of the contract).

- The prior art for this style of test in the codebase is `runtime-network.test.ts` and `runtime-proxy.test.ts`, both of which use `vi.spyOn(globalThis, "fetch")` to stub the underlying HTTP layer and assert on observable behavior of the function under test. The new test file follows the same convention.

- The wrapper is unit-tested in isolation. It does not need a live 9Router instance, a live upstream model, network access, or a test fixture file. The 9Router-defect body shape is encoded directly in the test as a string literal.

- The wrapper is NOT tested against every one of the 7 combo models, because the bug is transport-framing, not model-content. Testing the framing against one representative model body shape is sufficient to cover all models.

- The fix does NOT need a new e2e test, integration test, or route-level test. The wrapper is a pure transport-layer function; its unit tests are sufficient. Existing route tests continue to pass unchanged because no call-site code changed.

- The fix does NOT need a load test, soak test, or chaos test. The wrapper is constant-time and stateless; its only impact is a single buffer-read per response, which is negligible compared to the network round-trip it is part of.

- The fix is safe to ship without a feature flag or staged rollout. It is strictly additive: every response that previously failed now succeeds, and every response that previously succeeded continues to succeed (the wrapper's pass-through paths preserve the original response unchanged).

## Out of Scope

- **Generated-app compile/build execution failures** (`bun run build` returning non-zero, generated source failing typecheck, etc.) — these are runtime/toolchain problems, not AI-response-parsing problems. The AI-driven _repair attempt_ for such failures IS covered by this fix (it routes through `getAiModel()`), but the underlying compile execution itself is not.

- **Total 9Router outage / network-unreachable scenarios** — when 9Router itself is down or unreachable, this fix cannot help; the network error propagates through unchanged. Those failures are out of scope and remain surfaced as-is for honest error reporting.

- **Model returning syntactically-valid-but-semantically-wrong or incomplete JSON** — this is handled by existing app-level schema validation and the existing one-call repair-retry logic, not by this transport fix. The fix repairs HTTP framing, not AI content quality.

- **Genuine rate-limiting / quota exhaustion** — handled by the existing `maxRetries` values at call sites, which this fix explicitly does not change.

- **A provider returning totally non-JSON garbage that cannot be regex-recovered into valid JSON** — the wrapper's pass-through rule means such responses still surface as `AI_JSONParseError` (or the appropriate parser error) with full diagnostic visibility. Silently recovering unrecognizable garbage is intentionally NOT done.

- **App-level model failover, circuit breakers, or "try the next model if this one fails" logic** — 9Router remains the single source of truth for upstream model selection. This fix is intentionally a transport-layer repair, not a routing policy.

- **Changing `Output.json()` to plain text + manual JSON parse** — explicitly excluded to preserve the AI SDK's structured-output contract and existing schema validation.

- **New env vars, new npm dependencies, new config files** — explicitly excluded; the fix is a single new module + a 1-line config edit.

- **AI timeout, streaming UX, and observability work** — these belong to the pre-existing `ai-streaming-reliability-hardening-prd.md` and are explicitly out of scope for this PRD.

- **Discuss-turn workspace card race conditions** — these belong to `workspace-card-reliability-hardening-prd.md` and are explicitly out of scope for this PRD.

## Further Notes

- This PRD is adjacent to but does not overlap with `docs/prds/ai-streaming-reliability-hardening-prd.md`. The streaming-reliability PRD covers AI timeout configuration, streaming UX, and observability. This PRD covers a different, lower-level concern: HTTP response framing. A future maintainer reading both should understand the streaming PRD as "how long we wait and what we do with partial progress" and this PRD as "the bytes that come back from the wire are interpreted correctly."

- This PRD is also adjacent to but does not overlap with `docs/prds/workspace-card-reliability-hardening-prd.md`. The workspace-card PRD covers client-side race conditions between the stream finishing and the server persisting a new card. This PRD covers the upstream cause of why the card's primary tool call was lost in the first place. Once this transport fix lands, several of the scenarios the workspace-card PRD was hardening against will simply stop occurring.

- The `to-prd` skill's "publish to issue tracker / apply `ready-for-agent` label" step was not performed in this session because the project's issue tracker and triage label vocabulary have not been configured. When the tracker is set up, the same PRD body should be published there as well, with no content changes.

- The 9Router upstream project (`decolua/9router`) is a self-hosted proxy. The framing defect is a known class of bug in OpenAI-compatible proxies that mishandle non-streaming responses. This PRD's fix is defensive and model-agnostic by design; it will keep working even if 9Router changes the exact body shape (as long as the body still has a single JSON object followed by stray `data: [DONE]`-like terminator, which the regex tolerates), and it is a no-op on correctly-framed responses.
