# Discuss Build Handoff Reliability — Design

**Date:** 2026-08-03  
**Status:** Approved for implementation (product constraint locked with user)  
**Study case:** project discuss keeps emitting `question` / `build_confirm` instead of `build_recommendation`; confidence ~0–1; no **Mulai build** button  
**Related:** discuss stream reliability (separate); discuss-mode reliability; server-side discuss turn

## Problem

Generate only starts from the **Mulai build** control, which appears only when `workspaceCard.type === "build_recommendation"`.

Observed:

1. Model **does** call `presentWorkspaceCard` successfully.
2. At “build time” it often emits **`type: "question"`** with id/copy like **`build_confirm`** (“Langsung bangun…?”) instead of **`build_recommendation`**.
3. `brief.confidence` stays **0–1**, so even a real `build_recommendation` is **server-downgraded** by `getBriefReadiness` (needs ≥95 and empty `openQuestions`).
4. User affirms in chat → still no build card → repair/text-only path → **still no Mulai build**.

Product constraint (user):

- **Do not** add a force-build / “Bangun sekarang” composer control.
- Keep the **same experience as before**: discuss → AI-led handoff → **Mulai build**.
- Fix reliability of **when the build card appears**, not invent a second start path.

## Goals

1. When build-time is clear (enough brief **or** model already asking “build now?” **or** user affirms after that), the turn must end with **`build_recommendation`** so **Mulai build** shows.
2. Server is authority: normalize/promote in one place (`normalizeWorkspaceTurn` / helpers), not prompt-only hope.
3. No invented business fields; only card type + confidence/openQuestions adjustment for readiness.
4. No auto-start generate from chat text alone.
5. After site is built, still suppress interview cards (existing `hasBuiltSite` rule).

## Non-goals

- Always-visible force-build button in the chat composer.
- Auto-fire generate without **Mulai build**.
- Changing dual queues, stream bus, or repair×1 (orthogonal).
- Model A/B or 9Router changes.

## Design

### Single authority: post-tool normalize

Extend `normalizeWorkspaceTurn(input, fallbackBrief, options)`:

```ts
options?: {
  hasBuiltSite?: boolean;
  /** Last user message text this turn (for affirm detection). */
  lastUserText?: string;
  /** Prior workspace card from project state, if any. */
  previousWorkspaceCard?: WorkspaceCard;
}
```

Pipeline (after applyBriefPatch + normalizeWorkspaceCard, before readyForBuild derive):

1. **hasBuiltSite** → force `{ type: "none" }` for question/build_recommendation (unchanged).
2. **Promote to build** when `shouldPromoteToBuildRecommendation({ brief, card, lastUserText, previousWorkspaceCard })`.
3. On promote: set card via existing `buildRecommendationCard(brief, title?, summary?)`; set `brief.confidence = max(confidence, BRIEF_CONFIDENCE_THRESHOLD)`; clear or empty-filter openQuestions that block readiness only when promoting for handoff (prefer: leave openQuestions but treat promote path as ready — see readiness).
4. **readyForBuild** remains `workspaceCard.type === "build_recommendation"`.

### Promotion rules (OR)

Promote **only if** `hasMinimumBriefForBuild(brief)` **and** not `hasBuiltSite`:

| Rule | Condition |
|------|-----------|
| P1 | Card is already `build_recommendation` but `getBriefReadiness` is false **and** minimum brief holds → **accept** build card (bump confidence to threshold; do not leave openQuestions blocking — clear `openQuestions` on promote only when they are empty-string noise or when promoting from model build card / confirm) |
| P2 | Card is `question` and `isBuildConfirmQuestion(question)` → rewrite to `build_recommendation` |
| P3 | `previousWorkspaceCard` was build-confirm style **and** `isUserAffirmingBuild(lastUserText)` → force `build_recommendation` (even if model returned question/none/weak tool) |
| P4 | Card is `question`/`none` and `isUserAffirmingBuild(lastUserText)` **and** minimum brief holds **and** last assistant already asked build-confirm (via previous card) — covered by P3; if previous card missing, optional: affirm + minimum brief alone does **not** promote (avoid skip-interview from random “ya”) |

**Locked:** P4 without previous build-confirm **does not** promote. Affirm alone is not enough; need prior build-confirm question or model already signaling build.

### Minimum brief for build

`hasMinimumBriefForBuild(brief)` true when non-empty after trim:

- `businessName` **or** `offer` (product signal), **and**
- at least **two** of: `businessType`, `offer`, `targetCustomer`, `contactOrCta`, `stylePreference`, `businessName`

(Aligned with “basics known” without requiring model confidence.)

### Build-confirm detection

`isBuildConfirmQuestion(q)` true if:

- `q.id` matches `/build_confirm|confirm_build|mulai_build|ready_build/i`, **or**
- `q.question` matches Indonesian/English build intent:  
  `/langsung\s*bangun|mulai\s*bangun|bangun\s*website|build\s*now|siap\s*dibuild|mulai\s*buat/i`

### User affirm detection

`isUserAffirmingBuild(text)` true if trimmed text matches (case-insensitive, whole-ish):

- `/^(ya|iya|yoi|oke|ok|yes|yep|gas|lanjut|boleh|setuju|silakan|silahkan)\b/i`  
- or contains `/langsung\s*bangun|bangun\s*aja|mulai\s*build|mulai\s*bangun|build\s*sekarang|udah\s*dulu|cukup(\s*sudah)?/i`

Keep conservative; false negatives OK if model still can emit build_recommendation; false positives limited by requiring previous build-confirm (P3).

### Confidence / readiness interaction

- On any promote: `brief.confidence = Math.max(brief.confidence ?? 0, BRIEF_CONFIDENCE_THRESHOLD)`.
- On promote from P1/P2/P3: set `brief.openQuestions = []` so `getBriefReadiness` stays consistent if called later (handoff is explicit).
- Premature pure `build_recommendation` with **insufficient** minimum brief: keep existing downgrade-to-question behavior when a nested question exists; if no nested question → `{ type: "none" }` or fallback question policy unchanged.

### Wire last user text + previous card

In `discuss-turn-worker` (and repair path if it uses normalize):

- `lastUserText` = text of last user UIMessage in `messages`.
- `previousWorkspaceCard` = project’s current stored card if available on the job/row; if not loaded, pass `undefined` (P2 still works from this turn’s tool output).

Prefer loading workspace card from project row in discuss-queue-worker if cheap; else only P1/P2 in normalize without previous card until worker passes it.

### UX unchanged

- Still only **Mulai build** starts generate.
- No new composer button.
- Chat may still say “siap dibangun”; button appears via promoted card.

## Edge cases

| Case | Expected |
|------|----------|
| Model asks real content question (hours) | Stay question |
| Model asks build_confirm, brief enough | `build_recommendation` + Mulai build |
| Model sends build_recommendation, confidence 1, fields enough | Accept + bump confidence |
| Model sends build_recommendation, almost empty brief | Downgrade as today |
| User “ya” after build_confirm previous card | Promote this turn |
| User “ya” to “warna?” question | No promote |
| hasBuiltSite | none card; no promote |
| Text-only path after failed tool | If P3 can run from previous+affirm before text-only, prefer promote; if tool none and P3 true, set build card instead of text-only-only |

For text-only path in worker: **before** text-only finalize, if P3/P2 conditions hold on failed card, construct build recommendation turn server-side (no invented fields beyond summary from brief).

## Alternatives rejected

| Approach | Why not |
|----------|---------|
| Always-on “Bangun sekarang” | Feature workaround; user rejected |
| Auto-generate on “ya” | Skips intentional Mulai build |
| Prompt-only “must emit build_recommendation” | Already fails in production |
| Lower global threshold to 50 | Weakens gate for incomplete briefs without field check |

## Success criteria

1. Fixture: build_confirm question + filled brief → `build_recommendation`.
2. Fixture: build_recommendation + confidence 1 + filled brief → stays build_recommendation, readyForBuild true.
3. Fixture: “ya” + previous build_confirm + filled brief → build_recommendation.
4. Fixture: “ya” + previous hours question → stays non-build.
5. Manual: discuss until ready on local project → **Mulai build** appears without new force UI.
6. Atomic commits on `dev` for docs then code.

## File map

| File | Role |
|------|------|
| `src/lib/projects/brief-flow.ts` | promote helpers + normalizeWorkspaceTurn |
| `src/lib/projects/brief-flow.test.ts` | unit tests |
| `src/lib/projects/discuss-turn-worker.ts` | pass lastUserText / previous card; pre-text-only promote |
| `src/lib/projects/discuss-queue-worker.ts` | load previous workspace card if needed |
| Spec + plan | `docs/superpowers/specs|plans/2026-08-03-discuss-build-handoff-*` |
