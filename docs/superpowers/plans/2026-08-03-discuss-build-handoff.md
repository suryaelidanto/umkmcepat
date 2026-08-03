# Discuss Build Handoff Reliability — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When discuss is build-ready, always surface `build_recommendation` so **Mulai build** appears—without a force-build feature or auto-start generate.

**Architecture:** Server-side promotion inside `normalizeWorkspaceTurn` (+ helpers): rewrite build-confirm questions, accept premature build cards when minimum brief is filled (bump confidence), promote on user affirm after a prior build-confirm card. Worker passes last user text and previous workspace card.

**Tech stack:** Existing brief-flow normalize, Vitest, discuss-turn-worker.

**Spec:** `docs/superpowers/specs/2026-08-03-discuss-build-handoff-design.md`

## Global constraints

- No new force-build / “Bangun sekarang” composer control.
- Generate still starts only from **Mulai build**.
- No invented business field values; only card type + confidence/openQuestions for handoff.
- User-facing copy Indonesian; code/docs English.
- Surgical diffs; Bun only; atomic commits on `dev`.
- Do not bypass pre-commit / failing tests.

## File map

| Area | Files |
|------|--------|
| Promote logic | `src/lib/projects/brief-flow.ts` |
| Tests | `src/lib/projects/brief-flow.test.ts` |
| Worker wire | `src/lib/projects/discuss-turn-worker.ts`, maybe `discuss-queue-worker.ts` |
| Docs | spec + this plan |

---

### Task 1: Docs commit (spec + plan)

- [ ] **Step 1: Ensure both docs exist and are staged**

```bash
git add docs/superpowers/specs/2026-08-03-discuss-build-handoff-design.md \
        docs/superpowers/plans/2026-08-03-discuss-build-handoff.md
git commit -m "docs(discuss): build handoff reliability design and plan"
```

---

### Task 2: Promotion helpers + normalizeWorkspaceTurn

**Files:**

- Modify: `src/lib/projects/brief-flow.ts`
- Modify: `src/lib/projects/brief-flow.test.ts`

**Interfaces to add/export (for tests):**

```ts
export function hasMinimumBriefForBuild(brief: ProjectBrief): boolean;
export function isBuildConfirmQuestion(question: {
  id?: string;
  question?: string;
}): boolean;
export function isUserAffirmingBuild(text: string | undefined): boolean;

// extend options on normalizeWorkspaceTurn:
// { hasBuiltSite?: boolean; lastUserText?: string; previousWorkspaceCard?: WorkspaceCard }
```

**hasMinimumBriefForBuild:** true when (businessName or offer non-empty) AND at least 2 of {businessName, businessType, offer, targetCustomer, contactOrCta, stylePreference} non-empty after trim.

**Promotion order inside normalizeWorkspaceTurn** (after card normalize, after hasBuiltSite clamp):

1. If hasBuiltSite → none (existing).
2. If should promote (P1–P3 per spec) → `buildRecommendationCard` + confidence max threshold + `openQuestions = []`.
3. Derive readyForBuild from card type.

- [ ] **Step 1: Add failing tests** in `brief-flow.test.ts`:

```ts
it("promotes build_confirm question to build_recommendation when brief is enough", () => {
  const brief = parseProjectBrief({
    businessName: "Surya Beauty",
    businessType: "Salon",
    offer: "Perawatan",
    targetCustomer: "Wanita",
    contactOrCta: "WA",
    stylePreference: "Elegan",
    confidence: 1,
  }, "salon");
  const turn = normalizeWorkspaceTurn(
    {
      workspaceCard: {
        type: "question",
        question: {
          id: "build_confirm",
          question: "Langsung bangun website Surya Beauty sekarang?",
          answerMode: "text",
          options: [],
          selectionMode: "single",
        },
      },
    },
    brief,
  );
  expect(turn.workspaceCard.type).toBe("build_recommendation");
  expect(turn.readyForBuild).toBe(true);
  expect(turn.brief.confidence).toBeGreaterThanOrEqual(95);
});

it("accepts build_recommendation when confidence is low but brief is enough", () => {
  // confidence 1, type build_recommendation, filled fields → stays build_recommendation
});

it("promotes when user affirms after previous build_confirm card", () => {
  // previousWorkspaceCard build_confirm, lastUserText "ya", model returned none/question
});

it("does not promote bare ya after a content question", () => {
  // previous hours question, lastUserText "ya" → stay question or model card
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
bunx vitest run --project unit src/lib/projects/brief-flow.test.ts
```

- [ ] **Step 3: Implement helpers + wire normalizeWorkspaceTurn**

- [ ] **Step 4: Run tests — expect PASS**

```bash
bunx vitest run --project unit src/lib/projects/brief-flow.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/projects/brief-flow.ts src/lib/projects/brief-flow.test.ts
git commit -m "fix(discuss): promote build_recommendation when handoff is clear"
```

---

### Task 3: Worker passes context + promote before text-only

**Files:**

- Modify: `src/lib/projects/discuss-turn-worker.ts`
- Modify: `src/lib/projects/discuss-queue-worker.ts` if project row has workspace card
- Test: extend `discuss-turn-worker.test.ts` if mocks allow

**Wire:**

```ts
const lastUserText = /* text from last user message in messages */;
const previousWorkspaceCard = /* from project if available */;

normalizeWorkspaceTurn(toolInput, effectiveBrief, {
  hasBuiltSite: project.status === "ready",
  lastUserText,
  previousWorkspaceCard,
});
```

Same options for repair normalize if any.

Before text-only fallback when `!hasCard` but `chatText` present: try:

```ts
const promoted = normalizeWorkspaceTurn(
  { workspaceCard: { type: "none" } },
  effectiveBrief,
  { hasBuiltSite, lastUserText, previousWorkspaceCard },
);
// if promoted.readyForBuild → use that card path instead of text-only
```

(Or call a small `promoteBuildHandoff(brief, opts)` if cleaner.)

- [ ] **Step 1: Implement wire + pre-text-only promote**

- [ ] **Step 2: Focused tests**

```bash
bunx vitest run --project unit \
  src/lib/projects/brief-flow.test.ts \
  src/lib/projects/discuss-turn-worker.test.ts
```

- [ ] **Step 3: Commit**

```bash
git commit -m "fix(discuss): pass handoff context into normalizeWorkspaceTurn"
```

---

### Task 4: Verify + optional prompt nudge (no new UI)

- [ ] **Step 1: `bun run check`** (or focused lint/typecheck + tests)

- [ ] **Step 2: Optional one-line prompt in discuss-tool** — if model emits build confirm as question, server still wins; prompt nudge is optional only:

  “If asking whether to build, emit type=build_recommendation not type=question.”

- [ ] **Step 3: Commit if prompt touched**

```bash
git commit -m "fix(discuss): clarify build_recommendation vs confirm question in prompt"
```

---

## Order

1 → 2 → 3 → 4

## Success criteria

1. build_confirm + enough brief → Mulai build card type.  
2. Low confidence build_recommendation + enough brief → accepted.  
3. Affirm after build_confirm → promote.  
4. No force-build UI.  
5. Atomic commits on dev.

## Spec coverage

| Spec | Task |
|------|------|
| Promote helpers | 2 |
| normalize options | 2–3 |
| Worker context | 3 |
| Text-only pre-promote | 3 |
| Docs | 1 |
| No force UI | all |
