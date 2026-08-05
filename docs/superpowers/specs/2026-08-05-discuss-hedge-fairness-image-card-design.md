# Discuss Hedge Fairness + Image-Upload Card — Design

**Date:** 2026-08-05
**Status:** Implemented (see `docs/superpowers/plans/2026-08-05-discuss-hedge-fairness-image-card.md`)

## Why

Three problems surfaced while using the new-stack trial (contract-v1 + batched + hedge):

1. **Unfair energy billing in the hedge.** `discuss-turn-worker.ts` summed primary + aborted hedge-leg tokens and charged them all at the *winner's* model price. Aborted legs (e.g. mimo, glm) were billed at the winner's rate (e.g. minimax-m3), so the user was over/under-charged relative to what actually ran.
2. **Sparse winning cards.** The hedge promotes the fastest *parseable* card. Cheap winning models (glm-4.6v, minimax-m3) emit minimal cards — no `placeholder`, `selectionMode:"single"` always — so text inputs fell back to the bare literal and multi-select never appeared, even though the schema/UI/prompt support both.
3. **No image collection with real placement.** Users wanted a card where the AI recommends uploading images (jpeg/png/webp only, single or multiple, always skippable) that the build agent then places for real in the generated site. The `mediaPaths` value the client sent was never read server-side, so placement was unwired.

## What changed

### A. Per-model energy pricing for hedged discuss
- New `addEnergyUsageLegs(userId, legs[], reason, opts)` in `src/lib/user-credits.ts`. Prices each leg at its **own** model via the existing `calculateEnergyCost`, sums energy into one UserCredit row. `addEnergyUsage`/`chargeEnergyForAiUsage` unchanged for non-hedged paths.
- `discuss-turn-worker.ts` centralizes all debits into `chargeDiscussEnergy()`: unhedged → `chargeEnergyForAiUsage`; hedged → `addEnergyUsageLegs` with a leg per racer (primary at its own served model, each hedge at its own served model), plus an extra leg for repair/compaction tokens priced at the served (winner) model. Served model ids come from each racer's `response.modelId` (bare OpenRouter id, e.g. `xiaomi/mimo-v2.5`), never combo names. Token counts stay 1:1 with `AiCallRecord` per-racer rows.

### B. Card richness
- `src/lib/projects/card-richness.ts`: `ensureQuestionCardRichness(card)` backfills a default placeholder on a text question that lacks one. Applied to the normalized workspace card in the worker.
- Hardened `discuss-tool.ts` prompts: text questions must include a placeholder; choice questions use `selectionMode:"multiple"` only when several choices naturally apply.

### C. `image_upload` workspace card
- New `WorkspaceCard` variant `{ type: "image_upload"; imageUpload: ImageUploadQuestion }` in `brief.ts` (id, question, hint, selectionMode single|multiple, purpose business-image|logo|reference, required default false).
- Normalizer `createImageUploadCard` in `brief-flow.ts`; tool schema + prompt in `discuss-tool.ts`.
- UI `ImageUploadComposer` in `WorkspacePrimitives.tsx`, rendered by `WorkspaceShell.tsx` for `card.type === "image_upload"`. Reuses `uploadTempImageFile` (jpeg/png/webp ≤5MB) + `ImageUploadThumb`. Skip always available (`required !== true`). Storybook story added.
- Answers carry `assetIds`; `workspace-answers.ts` `buildImageUploadPatch` writes `businessImages` refs (`{id, purpose}`).
- `brief.ts`: `ProjectBrief.businessImages`, parsed/normalized, merged in `mergeProjectBriefPatch`, emitted in `briefToBuildPrompt` as `/media/<id> (purpose)` so the build agent's existing UPLOADED IMAGES placement instruction (`custom-source-generator.ts`) finally has real refs.
- Preview route persists `businessImages` via `persistProjectBrief` (end-to-end tested).

## Files

- `src/lib/user-credits.ts` (+ `addEnergyUsageLegs`, `EnergyUsageLeg`)
- `src/lib/projects/discuss-turn-worker.ts` (`chargeDiscussEnergy`, `ensureQuestionCardRichness` apply)
- `src/lib/projects/card-richness.ts` (+ test)
- `src/lib/projects/brief.ts` (`ImageUploadCard`, `ImageUploadQuestion`, `BusinessImageRef`, `businessImages`)
- `src/lib/projects/brief-flow.ts` (`createImageUploadCard`)
- `src/lib/projects/discuss-tool.ts` (schema + prompt)
- `src/lib/projects/workspace-answers.ts` (`assetIds`, `buildImageUploadPatch`)
- `src/components/projects/WorkspacePrimitives.tsx` (`ImageUploadComposer`)
- `src/components/projects/WorkspaceShell.tsx` (render image card)
- `src/components/projects/WorkspaceImageUpload.stories.tsx`
- `src/routes/api.projects.preview.ts` (persist businessImages; merge already handled)
- Tests: `user-credits.priced-legs`, `card-richness`, `image-upload-card`, `workspace-answers.image`, `business-images`, `-api.projects.preview.discuss`

## Notes / follow-ups
- `required` stays default `false`: no card ever forces an image; user can always skip.
- `purpose` is exposed to the AI within the existing allowlist (`business-image|logo|reference`).
- Legacy `mediaPaths` client field remains; businessImages is the persisted, build-facing source of truth.
