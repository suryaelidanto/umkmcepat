# Workspace Card Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make workspace cards (question choice options + build_recommendation) completely reliable despite cheap LLM malformed outputs and gate mismatches.

**Architecture:** Server is sole authority: normalize/repair every card, synthesize missing choices, auto-derive missing businessType, and promote to build when interview stalls. No prompt-only fix.

**Tech Stack:** Bun, Prisma, AI SDK `streamText`, `src/lib/projects/*`

## Global Constraints

- Product copy Indonesian; dev docs/logs English.
- Bun only, keep `bun.lock`.
- No secrets in tracked files.
- `briefToBuildPrompt` + `MIN_BRIEF_FIELDS` gate must stay consistent.
- One question per turn; `presentWorkspaceCard` forced via toolChoice.

---

### Task 1: Server-repair empty/invalid `options` (choice cards)

**Files:**
- Modify: `src/lib/projects/brief-flow.ts:526-631` (`normalizeQuestion`, `coerceQuestionOption`)
- Modify: `src/lib/projects/card-richness.ts:1-26` (`ensureQuestionCardRichness`)
- Modify: `src/lib/projects/discuss-tool.ts:124-172` (schema comment, optional hardening)
- Test: `src/lib/projects/brief-flow.test.ts`, `src/lib/projects/card-richness.test.ts`

**Interfaces:**
- Consumes: `WorkspaceCard` from LLM tool input
- Produces: `WorkspaceCard` with `answerMode==="choice"` always has 2-5 `{label,description}`; `answerMode==="text"` has Indonesian placeholder

- [ ] **Step 1: Write failing test** `brief-flow.test.ts` — input `{id:"style_preference", question:"Mau tampilannya?", options:["","",""]}` normalizes to `answerMode:"choice"` with 3 valid options, not `text` with `[]`. Also test `options:[""]` and `options:[{label:""}]`.

```ts
expect(normalizeWorkspaceCard({type:"question", question:{id:"style_preference", question:"Mau tampilannya?", options:["","",""]}}, brief).type).toBe("question")
expect((card as any).question.options.length).toBeGreaterThan(1)
```

- [ ] **Step 2: Run test to verify it fails** `bun test src/lib/projects/brief-flow.test.ts -t "style"`
- [ ] **Step 3: Implement** `fallbackOptionsForQuestionId(id)` map (e.g., `style_preference` -> 3 preset styles, `business_location`/`delivery_area` -> text fallback, generic -> 3 generic choices). In `normalizeQuestion`, if `answerMode==="choice"` but `options.filter(Boolean).length<2`, inject fallback. In `card-richness.ts`, expand to also fix choice cards missing options.
- [ ] **Step 4: Run test to verify it passes** `bun test src/lib/projects/card-richness.test.ts src/lib/projects/brief-flow.test.ts`
- [ ] **Step 5: Commit**

**Acceptance:** No persisted card ever has `answerMode==="choice"` with `<2` options; empty-string arrays are repaired to real choices; existing `text` cards keep `placeholder`.

---

### Task 2: Fix `businessType` gate blocking `build_recommendation`

**Files:**
- Modify: `src/lib/projects/brief-flow.ts:203-250` (`MIN_BRIEF_FIELDS`, `hasMinimumBriefForBuild`, `FACT_KEY_TO_BRIEF_FIELD`, `applyBriefPatch` promotion)
- Modify: `src/lib/projects/brief.ts:166-176` (`REQUIRED_BRIEF_FIELDS` keep but gate starred)
- Test: `src/lib/projects/brief-flow.test.ts` (hasMinimumBrief tests)

**Interfaces:**
- Consumes: `ProjectBrief`
- Produces: `hasMinimumBriefForBuild(brief)===true` when `businessName,offer,targetCustomer,contactOrCta,stylePreference` filled (businessType optional / auto-derived)

- [ ] **Step 1: Write failing test** current project brief (businessType="") should pass `hasMinimumBriefForBuild`; `normalizeWorkspaceTurn({workspaceCard:{type:"build_recommendation"...}}, thinBrief)` should return `build_recommendation` not `none`.

- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement** Option A (chosen): remove `businessType` from `MIN_BRIEF_FIELDS` (keep in `REQUIRED_BRIEF_FIELD_IDS` for UI `required` flag only). Add fallback derivation in `applyBriefPatch`: if `businessType` still empty but `offer`/`businessName` present, set `businessType = "Kuliner/F&B"` or first `productOrService[0].name` inference. Add `business_location` fact key handling.
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

**Acceptance:** `cmspc6zv300084lm3n3gqoq8g` brief now qualifies; build card not demoted; batched admission still works (all 5 fields present).

---

### Task 3: Server escape-hatch for stalled/duplicate interview

**Files:**
- Modify: `src/lib/projects/brief-flow.ts:293-365` (`normalizeWorkspaceTurn` promote logic)
- Modify: `src/lib/projects/discuss-turn-worker.ts:754-815` (optional post-repair promotion accounting)
- Test: `src/lib/projects/brief-flow.test.ts`

**Interfaces:**
- Consumes: `normalizeWorkspaceTurn(input, fallbackBrief, {lastUserText, previousWorkspaceCard})`
- Produces: promotion to `build_recommendation` when `hasMinimumBriefForBuild` true + (duplicate question id OR vague style answer OR decision count >=5)

- [ ] **Step 1: Write failing test** Call `normalizeWorkspaceTurn` twice with same `style_preference` id and `lastUserText="gak tau sih, coba saranin dong"` -> second call returns `build_recommendation` with `confidence=95`.

- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement** In `normalizeWorkspaceTurn`, after existing `promoteBuildConfirmQuestion`/`promoteAfterAffirm`, add: if `minBrief && workspaceCard.type==="question" && previousWorkspaceCard?.type==="question" && workspaceCard.question.id===previousWorkspaceCard.question.id` then `brief=withHandoffReadiness(brief); workspaceCard=buildRecommendationCard(...)`. Also handle `isUserAffirmingBuild` vague? Keep minimal: duplicate id is stalled loop signal.
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

**Acceptance:** Re-asking same question no longer infinite loop; user gets build card after second `style_preference`; existing `isFreshWorkspaceCard` guard still prevents UI flicker but now promotion breaks the cycle.

---
