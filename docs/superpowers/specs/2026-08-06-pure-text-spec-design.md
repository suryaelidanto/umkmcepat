# Pure-Text Spec Phase — Design

**Date:** 2026-08-06
**Status:** Implemented
**Supersedes:** the tool-calling spec phase described in `2026-08-04-batched-generation-design.md` ("implementation spec 18s" sample, `presentImplementationSpec` tool) and `2026-07-27-archetype-driven-generation-design.md` (`implementationSpecTool.inputSchema`).
**Read this if you have zero context:** the batched generation engine emits all project files in one streamed plain-text response (`<file>` blocks, no tools). The only remaining AI tool call in the build pipeline was the pre-writer implementation-spec call. This change makes that call pure text too, so the entire first-generation path is tool-free.

## Decision

Replace the forced `presentImplementationSpec` tool call in `build-attempt-worker.ts` `generateImplementationSpec` with a plain `generateText` call that emits the spec as one `<spec>...JSON...</spec>` block, parsed by a new lenient extractor.

- New: `parseImplementationSpecFromText(text)` in `src/lib/projects/implementation-spec.ts` — extracts `<spec>` block → ```json fence → bare brace span, `JSON.parse`, recursively unstringifies combo-model double-encoded fields (`json-unstringify.ts`), then validates with the existing `parseImplementationSpec` gates.
- Removed: `implementationSpecTool` export (the only consumer was the spec phase; the legacy ToolLoopAgent fallback keeps its own tool-calling loop unchanged).
- The spec system prompt now demands exactly one `<spec>` block with a JSON shape example; no prose, no fences, no XML wrappers other than the tags.
- Retry chain unchanged: attempt 1 (4 096 tokens) → 2s pause → attempt 2 (8 192 tokens) → deterministic `implementationSpecFromBrief` fallback. Malformed text returns null and follows the same chain.

## Why

- Purity + one less failure mode: no tool-schema drift, no `toolChoice` contract. Combo models emit malformed pseudo-XML under `Output.json()` (the reason tool calling was chosen originally) — the lenient extractor + existing retry/fallback chain absorbs that noise the same way the batched `<file>` parser does.
- Not a speed play: the spec call was ~10–30s of a multi-minute build; the writer response and Vite build remain the long poles.

## Contract

Response format for the spec call:

```text
<spec>
{ "appKind": "...", "archetype": "...", "businessName": "...", "pages": [...], "components": [...], "features": [...], "content": {...}, "style": { "direction": "...", "palette": {...} }, "primaryCta": "...", "notes": [...] }
</spec>
```

Validation is exactly the previous `parseImplementationSpec` rules (appKind enum, pages ≥1, components ≥2, features ≥1, content object, style direction, 4 palette hexes, primaryCta, notes array, archetype whitelist → `generic`).

## Rollout

No flag — this replaces the spec call unconditionally on the batched path. `generation.batched_rollout` and `generation.contract_compiled_rollout` are unaffected; the legacy agent loop (and its tool calls) remain the fallback for batched failures.

## Superseded by full contract-v1 migration (same day)

The above "legacy stays as fallback" note is now historical. A follow-up migration removed the legacy ToolLoopAgent engine **entirely**: `custom-source-generator.ts`, `agent-tool-runner.ts`, `source-edit-agent.ts`, `batched-rollout.ts`, `contract-generation-admission.ts`, and the legacy edit/build-repair paths are deleted. `generationEngine` is always `contract-v1`; `resolveGenerationEngine()` returns it unconditionally; the rollout settings (`generation.contract_compiled_rollout`, `generation.batched_rollout`, `generation.contract_admission`) are removed from the registry and admin UI. A batched writer/edit failure now fails the attempt — there is no fallback. Discuss hedging (the 3-combo parallel race and its `discuss.hedging` / `ai.model.discuss_hedge_2/3` settings) is removed too; the discuss turn is one direct call. See `src/lib/projects/generation-engine.ts` and the updated `AGENTS.md`.

## Write-op diffs (same change)

The batched writer's `operation` events (the "Menulis file" rows in the build progress list) now carry `diff: DiffLine[]` so the UI can expand before/after per written file — the same expandable diff the legacy agent loop's `write_file`/`replace_in_file` ops already render.

- `runOneStreamedResponse` gained an optional `onResolvePreviousContent(path)` baseline; the op event diff is `truncateDiff(generateDiff(baseline ?? "", content))`.
- `runBatchedGenerate` diffs against the previously staged content (new files → all-add); `runBatchedEdit` diffs against the live source / previous repair round — so an edit shows the real before/after.
- `truncateDiff` + `MAX_DIFF_LINES` (400) moved from `agent-tool-runner.ts` into the shared `src/lib/projects/diff.ts`.
- Flow: worker `send("operation", …)` → `publishBuildProgress` → `reduceBuildStreamEvent` carries `event.diff` into `BuildProgressStep.diff` → `WorkspacePrimitives` expandable diff; the build-attempt worker also persists the diff in the `runtimeEvent` metadata for late rehydration (`project-job.ts`).
