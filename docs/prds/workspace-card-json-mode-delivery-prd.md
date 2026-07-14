# PRD: Workspace Card Structured Output — Real JSON Mode Delivery

Status: proposed
Created: 2026-07-14
Updated: 2026-07-14
Owner: Surya
Scope: discuss-turn card generation provider call shape, JSON mode delivery, structured-output success rate
Read when: changing the workspace card generation call, its provider options, JSON parsing/normalization of card output, or diagnosing high card-generation failure rates
Do not read for: card UI/composer states, polling, energy accounting, repair endpoint auth, build generation, moderation, OTP, or 9Router combo membership/model selection
Current truth: source code + `docs/architecture.md` + `docs/prds/structured-discuss-turn-prd.md` + `docs/prds/workspace-card-reliability-hardening-prd.md` + `docs/prds/tanstack-start-full-migration-prd.md`

## Status History

- 2026-07-14: Proposed after a code audit found that the card-generation call's JSON mode never reaches the provider, explaining the persistently high structured-card failure rate observed during the reliability-hardening verification.

## Problem Statement

UMKM owners answering guided-interview questions frequently see the "question card could not be prepared" retry state instead of the next question card. The chat text arrives, but the hidden structured card fails often enough that the guided interview feels unreliable, even though the failure handling itself is now honest and bounded.

The root cause is not provider flakiness alone. The card-generation call passes its JSON-mode request through a provider-options key that the OpenAI-compatible provider does not recognize. Unknown keys in that namespace are spread verbatim into the request body under their camelCase name, which the gateway and upstream provider silently ignore. The result: the card call runs with **no JSON mode at all** — plain text completion guided only by a system prompt saying "output ONLY JSON" — immediately after an assistant message written in casual Indonesian prose. The model is being invited to continue chatting, and often does. The prompt even contains the OpenAI `json_object`-mode requirement that the word "json" appear in context, showing the author believed JSON mode was active. It never was.

A secondary aggravator: the card system prompt asks the model to echo conversation-scale context (full brief, hidden context) while producing a strict shape, and every semantic attempt repeats the identical prompt, so a model that failed once tends to fail the same way again.

## Solution

Deliver JSON mode to the provider for real, using the AI SDK's first-class structured-output mechanism instead of a hand-rolled provider-options key. The card generation call becomes a structured-output call whose schema is the existing workspace-turn shape, so the request that reaches the gateway carries a genuine `response_format` field the provider understands. Server-side validation and normalization remain the single authority — the schema stays permissive at the provider level because the gateway → DeepSeek path does not guarantee constrained decoding — but the model is now actually told, at the protocol level, to emit JSON.

Everything the reliability-hardening pass established is preserved: bounded semantic attempts, per-attempt timeout, outer server deadline, honest failure with a dedicated retry, no fabricated cards, and repair bypassing the discussion energy gate. This PRD only changes what travels over the wire to the provider and how the second attempt differs from the first.

The change is deliberately located in provider-call shape and lib-level helpers, not in route structure, so it can be implemented identically before or after the TanStack Start migration lands. It must not assume Next.js or TanStack route conventions.

## User Stories

1. As a UMKM owner, I want the next question card to appear reliably after I answer, so that the guided interview feels smooth instead of broken.
2. As a UMKM owner, I want card generation to succeed on the first attempt most of the time, so that I rarely wait through retries.
3. As a UMKM owner, when card generation still fails, I want the same honest retry state as today, so that I am never shown an invented question.
4. As a UMKM owner, I want the chat text I already received to stay untouched when the card is retried, so that the conversation never duplicates or disappears.
5. As a UMKM owner, I want the card to match the chat text that introduced it, so that the question I see is the question the AI asked.
6. As a UMKM owner, I want card repair to remain free of energy cost, so that recovering from a failure never punishes me.
7. As a UMKM owner, I want the build recommendation and brief review cards to benefit from the same reliability as question cards, so that every stage of the interview is equally stable.
8. As a developer, I want the JSON-mode request to verifiably reach the provider as a real `response_format` field, so that the model is instructed at the protocol level, not just in prose.
9. As a developer, I want the card call to use the AI SDK's structured-output mechanism rather than a hand-rolled provider-options key, so that provider translation is the SDK's responsibility and survives SDK upgrades.
10. As a developer, I want the structured-output schema derived from the existing workspace-turn input shape, so that the schema definition stays in one place.
11. As a developer, I want server-side normalization to remain the single validation authority, so that provider-level schema enforcement is a bonus, never a dependency.
12. As a developer, I want the bounded-attempt loop, per-attempt timeout, and outer server deadline preserved exactly, so that the honest-failure contract from the reliability pass is not regressed.
13. As a developer, I want the second semantic attempt to differ from the first (at minimum by feeding back what was wrong with the first output), so that retries are not doomed to repeat the identical failure.
14. As a developer, I want the card system prompt cleaned of instructions that only made sense under the mistaken belief that OpenAI `json_object` mode was active, so that the prompt reflects the actual call shape.
15. As a developer, I want lenient JSON extraction retained as a fallback parser, so that a model that wraps valid JSON in fences or prose still yields a card.
16. As a developer, I want a debug-level log (never user-visible) of the failure category per attempt — invalid JSON, valid JSON but no valid card, timeout, provider error — so that future diagnosis can distinguish prompt problems from provider problems.
17. As a developer, I want Langfuse telemetry to keep tagging card attempts and repair attempts distinctly, so that success rates per phase are measurable.
18. As a developer, I want a measurable before/after success-rate comparison via existing telemetry metadata, so that the fix is validated by data, not vibes.
19. As a developer, I want the change confined to the card-generation call path and lib helpers, so that it merges cleanly regardless of whether the TanStack Start migration has landed.
20. As a developer, I want no assumption about the hosting framework (Next.js or TanStack Start) inside the changed code, so that the migration branch can absorb this work without rework.
21. As a developer, I want the repair endpoint's behavior contract (auth, ownership, rate limiting, energy bypass, honest 503) unchanged, so that clients need no updates.
22. As a developer, I want no new dependencies, so that the lockfile stays stable.
23. As a developer, I want the 9Router combo id and model selection untouched, so that the provider path stays stable and cost characteristics do not shift.
24. As an operator, I want timeout constants to remain env-tunable within their existing bounds, so that slow local provider paths stay usable in development.
25. As an operator, I want the fix to hold when the combo fails over between models mid-request, so that failover does not reintroduce silent prose responses.

## Implementation Decisions

- The card-generation call switches from a plain text-generation call carrying a gateway-namespaced `responseFormat` provider option (which the OpenAI-compatible provider does not recognize and therefore never translates to `response_format`) to the AI SDK's structured-output mechanism with an explicit JSON schema. The repo already has prior art for this exact pattern in the chat-compaction module, which uses the object-generation call with a JSON schema against the same provider.
- The schema passed to the provider is derived from the existing workspace-turn input shape (brief patch, workspace card, project title). It stays permissive — no strict mode, no `additionalProperties: false` — because the gateway → DeepSeek path is documented (structured-discuss-turn PRD) as not enforcing constrained decoding. Provider-level schema is a strong hint, not a guarantee.
- Server-side normalization (the existing single-authority normalize helper) remains unchanged as the validation boundary. A structurally valid provider response that fails normalization is still an honest failure.
- If the object-generation call rejects on schema-parse failure, the raw text (when available from the error) is run through the existing lenient JSON extraction before counting the attempt as failed, so fenced or prose-wrapped valid JSON is still recovered.
- The second semantic attempt is no longer a verbatim repeat: it appends a short corrective instruction describing the failure category of the first attempt (e.g., output was not JSON; output was JSON but the card was invalid because X). Temperature stays low.
- The card system prompt drops the instruction that the word "json" must appear (an OpenAI `json_object`-mode artifact) and any other phrasing that only existed to compensate for absent JSON mode; it keeps the shape contract, Indonesian-copy rules for card text, and the confidence gate wording.
- Per-attempt timeout, semantic attempt count, and the outer server deadline keep their current constants and env override bounds. The outer abort controller continues to cap total work regardless of provider behavior.
- Attempt-level failure categories are logged via the existing safe-error logging helper (no prompt/user content in logs) and tagged in the existing Langfuse telemetry metadata (phase: card vs card-repair), adding a failure-category metadata key.
- The repair endpoint's external contract is untouched: same request shape, same auth/ownership/rate-limit/energy-bypass behavior, same honest 503 with retry guidance when all attempts fail.
- No change to the 9Router combo, model selection, discussion streaming call, moderation, OTP, project creation, or build generation paths.
- Framework alignment: all changed logic lives in the provider-call helper and lib modules, not in framework route conventions. Whichever branch (current Next.js tree or the TanStack Start migration) picks this up, the diff applies to the same lib seams; only the thin route file that calls the seam differs per framework.

## Testing Decisions

- Tests assert external behavior at the workspace-turn seam: given a provider (mocked at the AI SDK call boundary) that returns valid JSON, invalid JSON, fenced JSON, prose, an empty response, or throws/times out — the turn generator returns a valid card, retries with a corrective second attempt, or returns null within the deadline. No assertions on internal call shapes beyond the one contract that matters: the structured-output mechanism (not a raw provider-options key) is what carries the schema.
- One test verifies the request that would reach the provider contains a real `response_format`-bearing structured-output configuration — this is the regression test for the root cause. It mocks at the AI SDK boundary, mirroring the existing moderation tests that mock the text-generation call.
- The normalize helper's existing test suite (brief-flow tests) remains the authority for card-shape validation and needs no changes beyond any new failure-category surface.
- Timeout behavior reuses the existing focused timeout test patterns (ai-timeouts tests): attempts are bounded, the outer deadline aborts in-flight work, and the deadline result is null rather than a thrown error.
- Prior art: moderation tests (mock the SDK text call), chat-compaction usage (object-generation with JSON schema against the same provider), brief-flow normalization tests, ai-timeouts tests.
- Manual validation after implementation: one authenticated warm-path repair request and one full discuss turn, comparing card success across several turns; then a Langfuse check that card-phase success rate moved. Cold-compile latency must be excluded from any timing judgment.

## Out of Scope

- Any card UI, composer-state, polling, or retry-button changes — the client contract is already correct.
- Replacing or reconfiguring the 9Router combo, changing model selection, or adding models.
- Restoring text-parsed or fabricated cards, or any fallback that invents user-facing output.
- The discussion (chat text) streaming call — only the card phase changes.
- Energy accounting, project limits, moderation, OTP, and build/source generation paths.
- The TanStack Start migration itself; this PRD only requires that the implementation not block or be blocked by it.
- Guaranteeing provider-side constrained decoding — the provider path documented in the structured-discuss-turn PRD does not enforce it, and this PRD does not pretend otherwise.

## Further Notes

- The single highest-value observable for validating this fix is the Langfuse card-phase success rate before/after. If success rate does not improve materially once real JSON mode reaches the provider, the next suspect is the combo's failover members differing in JSON-mode support — that would be a follow-up PRD, not scope creep here.
- The audit trail for the root cause: the OpenAI-compatible provider's recognized provider-option keys are limited (user, reasoning effort, text verbosity, strict-schema flag); unrecognized keys are spread into the request body verbatim in camelCase, which no OpenAI-compatible server interprets as `response_format`. This is why the mistake was silent — nothing errored, the field was simply ignored.
- Implementation should happen after the TanStack Start migration branch stabilizes, on whichever tree is canonical then. The seams named here (turn generator, normalize helper, timeout helpers, telemetry helper) exist identically on both trees.
