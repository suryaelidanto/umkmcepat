# AI Discuss-Mode Reliability: Streamed Text + Structured Card

Research note. First file in `docs/research/` — establishing the convention for ad-hoc technical research writeups.

## Vercel AI SDK: single-call text + structured output is intended

`streamText`/`generateText` accept an `output` property (`Output.object()`, etc.) that runs alongside `tools` in the same call — the SDK's own path for text + structured payload together, not a workaround. `streamText` exposes `partialOutputStream` for incremental UI. Structured output counts as one step in the multi-turn loop, so `stopWhen` must account for it when tools are also in play.
Source: https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data

Non-streaming failures throw `AI_NoObjectGeneratedError` with `text`/`cause` for repair; `streamText` surfaces errors via `onError` instead of throwing.
Source: https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data

## Loop control for forcing the card

- `toolChoice: 'required'` forces a tool call every step — the documented pattern for guaranteeing a structured signal.
- `stopWhen` (`isStepCount`, `hasToolCall`, custom conditions) can stop the loop once the card tool fires.
- `prepareStep` can force `toolChoice` on a specific step, e.g. only when the discuss flow needs the card.
  Source: https://ai-sdk.dev/docs/agents/loop-control

## Dyad (github.com/dyad-sh/dyad) — real-world signal

Dyad, a Vercel-AI-SDK-based app builder, explicitly declined switching `streamText` → `generateText` for a structured step: _"streamText is the only path proven against the Dyad engine; generateText/structured output is unverified here and risks the stuck-stream we already guard against."_ They kept `streamText` everywhere, including tool-driven file writes (`write_file` tool calls, not a separate structured pass), and instead hardened stream `onError` retry logic for provider quirks.
Source: https://github.com/dyad-sh/dyad/issues/3663, https://github.com/dyad-sh/dyad/issues/2788, https://github.com/dyad-sh/dyad/issues/2412

No dyad code implements a "card with plain-text fallback" UI specifically — inferred from their tool-call architecture, not a matching feature.

## Lovable / bolt.new / v0: no public documentation found

Searched for a documented "interactive card, falls back to plain text" pattern from these products. Results were third-party comparison articles only, no engineering writeups. No primary source found; not speculating further.

## Consensus: one call vs. two

Tool-call failures come from: the model omitting the call, malformed JSON when interrupted mid-stream, and provider streaming quirks (dyad's "item not found" case). SDK-documented mitigations: `toolChoice: 'required'`, `onError`/`AI_NoObjectGeneratedError` catching raw text for repair, and treating structured output as a first-class step so `stopWhen` doesn't cut it short.

The SDK's own architecture unifies `output` + `tools` in one call for this exact shape. Dyad's rejection of a second `generateText` call — judged riskier, not safer, as an unproven second path against the same gateway — is the clearest real-world data point found.

## Recommendation for UMKM Cepat: 1-call vs 2-call

**One call.** Single `streamText` with discuss-mode text plus a `tools` entry (or `Output.object()`) for the card, `toolChoice: 'required'` forced via `prepareStep` only on the turn a card is expected, against 9Router.

1. SDK's documented, intended mechanism, not experimental.
2. UMKM Cepat already runs `streamText` elsewhere; a second structured-output call is an unproven path against the same gateway — the exact risk dyad rejected.
3. Two calls double round-trips/cost per turn with no documented reliability gain.
4. Fallback needs no second call: handle `onError` / a missing-or-invalid card in the finished result client-side, and render the streamed text as a plain input prompt when the card doesn't arrive or fails schema validation.

If the card proves unreliable against 9Router specifically, next step is `prepareStep`-forced `toolChoice` plus repair-and-retry — before reaching for a second dedicated structured-output call.
