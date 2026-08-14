# Generated-Site Writer Recovery — Design

**Date:** 2026-08-14  
**Status:** Approved for implementation by the active handoff  
**Scope:** Recover the reference-calibrated landing/marketing writer from token exhaustion without adding a second build path.

## Problem

The accepted `Butik Senja` build reaches the reference-calibrated writer, but `default-combo` serves `deepseek/deepseek-v4-flash` and consumes the complete `18,000` output-token budget before emitting a complete response. The existing top-level AI SDK option `reasoning: "none"` becomes no `reasoning_effort` field in the OpenAI-compatible adapter. The provider therefore keeps its default reasoning behavior. The parser then receives no complete editable response and the build fails honestly.

Evidence:

- `AiCallRecord`: writer `outputTokens=18000`, status `ok`, no completed design plan/files.
- 9Router: `OUT 18000` for the writer call.
- The existing unit test proves an omitted `<design-plan>` can use a deterministic frame, but the real response also needs a complete `<done>` and editable files.

## Goal

One accepted landing/marketing build must complete the existing pipeline:

```text
writer -> response/source gates -> Vite build -> browser gates -> one critic -> qualified candidate
```

The writer remains one bounded call. The deterministic frame is a safety contract, not a fabricated site or silent success path.

## Chosen approach

### 1. Provider-aware no-reasoning option

Extend the existing `getNoReasoningCallOptions()` helper with the OpenAI-compatible provider option already supported by the installed AI SDK:

```ts
{
  reasoning: "none",
  providerOptions: {
    "9router": { reasoningEffort: "none" },
  },
}
```

This keeps one shared setting across writer, critic, discuss, and build calls. It does not add retries, tools, providers, or dependencies. The top-level option remains for providers that understand it; the 9Router-specific option closes the current adapter gap.

### 2. Compact reference-calibrated writer prompt

Keep the immutable contract and kit constraints, but remove redundant prose and duplicate response examples from the V2 writer prompt. The prompt must:

- state the exact two writable paths;
- require one complete `src/routes/index.tsx` first;
- require `<done>` immediately after the file blocks;
- require no reasoning/prose/markdown outside tags;
- preserve Indonesian copy, accepted facts, semantic tokens, kit primitives, and media policy;
- keep editable output under 32 KiB.

The AI still owns page copy, composition, section treatment, and signature details. The platform still owns contract hash, kit, media mode, palette frame, typography frame, section IDs, source gates, build, browser, and critic gates.

### 3. Deterministic design-plan frame

Retain `deriveDefaultWriterDesignPlanV2()` and `mergeWriterDesignPlanV2()`:

- missing plan → safe kit-derived plan;
- valid plan → accept only creative fields (`visualThesis`, per-section `treatment`, `signatureElement`);
- immutable frame fields remain platform-derived: hash, kit, media mode, pattern, palette, typography, section IDs/order, surfaces, density, mobile strategy.

A missing or malformed response still fails. The frame only prevents a missing plan from being the reason an otherwise complete writer response is rejected.

## Failure policy

- No editable files or no `<done>` remains a writer failure.
- Provider/API timeout remains infrastructure or writer failure; no fake candidate.
- Existing one shared correction budget remains unchanged.
- Failed candidates never replace last-known-good source/build/deployment.
- No new model call, fallback renderer, hidden retry, or placeholder content.

## Verification

1. TDD test: `getNoReasoningCallOptions()` includes the provider-specific option.
2. Targeted writer/parser/design-plan tests pass.
3. `bun run check` passes.
4. Fast local verification passes focused tests, lint, typecheck, and `bun run check`. Manual project verification remains the owner's final browser/E2E check; no long automated E2E run is required for this recovery.
5. Git diff contains only the recovery implementation/tests/docs plus already-existing handoff changes; no secrets or generated artifacts.

## Out of scope

- Model replacement or 9Router combo redesign.
- Benchmark threshold changes.
- UI redesign.
- Commit/push/deploy.
- Rewriting the full generation architecture.
