# Workspace Card Rounds + Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the one-call discuss path emit 1-3 independent questions per turn (rounds, mixed modes) and raise tool-invocation reliability from ~90% to ~99%.

**Architecture:** New `WorkspaceCard` variant `type:"questions"` carrying `BriefQuestion[]`; server validates per-question (dedupe, cap 3, collapse 1→single). Reliability via agent `maxSteps` self-correct loop, repair attempts 2→3, `maxRetries` 1→2, and a no-AI fallback card derived from missing brief fields when all AI paths miss. One-call path only; two-phase legacy untouched.

**Tech Stack:** TypeScript, Bun, Vitest, ai-sdk (`streamText`, `tool`, `ToolLoopAgent`), Zod, TanStack Router, React, motion/react. Lint: Prettier + ESLint via `bun run check:commit` hook.

## Global Constraints

- **Lockfile:** Bun only. Lockfile is `bun.lock`. No `package-lock.json`/`pnpm-lock.yaml`/`yarn.lock`.
- **No new dependencies.** Everything uses installed `ai`, `zod`, `vitest`.
- **Server is single authority.** Tool schema stays permissive; `normalizeWorkspaceTurn`/`normalizeWorkspaceCard` validate. Never fail a whole turn on malformed AI output (brief-flow.ts:55-58 philosophy).
- **Reliability fixes ship unconditionally inside the one-call path** (`isDiscussOneCallToolsEnabled()` gates the path, not the fixes).
- **No new env flag for rounds.** Rounds live behind the existing `DISCUSS_ONE_CALL_TOOLS` flag.
- **Two-phase path (`handleDiscussTurn`) untouched.** All edits go in `handleDiscussTurnOneCall` and shared helpers.
- **Prompt copy in Bahasa Indonesia** for user-visible text; prompt instructions in English.
- **Cap 3 questions per batch.** Server enforces via slice.
- **Prettier gotcha:** older babel parser in this repo crashes on template literals containing `${...}` followed by `{` and on backtick spans inside JSDoc that contain `(`. Build regex/pattern strings with concatenation and use single-quotes in JSDoc when the span contains `(` or `{`. Do NOT reintroduce that pattern.
- **Commit messages:** conventional commits. End with `Co-Authored-By: Claude <noreply@anthropic.com>`. Footer needs a leading blank line.
- **Test runner:** `bun test <path>`.

**Spec:** `docs/superpowers/specs/2026-07-18-workspace-card-rounds-design.md`

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `src/lib/projects/brief.ts` | `WorkspaceCard` type incl. new `type:"questions"` variant; `getMissingBriefFields` (consumed by fallback). | Modify |
| `src/lib/projects/brief-flow.ts` | `normalizeWorkspaceCard` validates `questions[]` (per-Q, dedupe, cap 3, collapse 1→single). New `buildFallbackWorkspaceCardFromBrief` helper. | Modify |
| `src/lib/projects/workspace-answers.ts` | `buildBriefPatchFromWorkspaceAnswers` reads `questions[]` from a `questions` card. | Modify |
| `src/lib/projects/workspace-sync.ts` | `getWorkspaceComposerState`, `isFreshWorkspaceCard`, `hasAnsweredWorkspaceQuestion` handle `questions` variant. | Modify |
| `src/lib/projects/prompts/discuss-system.md` | Relentless tone + Rounds section. | Modify |
| `src/routes/api.projects.preview.ts` | Batch prompt rules, Fix 1 `maxSteps`, Fix 3 `maxRetries`, Fix 4 fallback emit, tool schema `questions` widened. | Modify |
| `src/lib/ai-timeouts.ts` | `DISCUSS_CARD_SEMANTIC_ATTEMPTS` 2→3. | Modify |
| `src/components/projects/WorkspacePrimitives.tsx` | New `QuestionsComposer` wrapping N `QuestionComposer`; composite submit. | Modify |
| `src/components/projects/WorkspaceShell.tsx` | `activeQuestionKey` composite; render `QuestionsComposer` for `questions` card. | Modify |
| `src/lib/projects/brief-flow.test.ts` | `normalizeWorkspaceCard` questions variant tests. | Modify |
| `src/lib/projects/workspace-answers.test.ts` | Multi-answer patch tests. | Modify |
| `src/stories/WorkspaceDecisionCards.stories.tsx` | `questions` fixture (optional). | Modify |

---

### Task 1: Add `type:"questions"` to `WorkspaceCard`

**Files:**
- Modify: `src/lib/projects/brief.ts:76-82`
- Test: `src/lib/projects/brief-flow.test.ts`

**Interfaces:**
- Consumes: existing `BriefQuestion` type (brief.ts:63-74).
- Produces: `WorkspaceCard` now accepts `{ type: "questions"; questions: BriefQuestion[] }`. Downstream `parseWorkspaceCard`, `normalizeWorkspaceCard`, consumers must handle it (Tasks 2, 4).

- [ ] **Step 1: Write the failing type-guard test**

Add to `src/lib/projects/brief-flow.test.ts`:

```ts
import { parseWorkspaceCard } from "./brief-flow";

describe("parseWorkspaceCard questions variant", () => {
  it("parses a valid questions[] card", () => {
    const brief = createInitialBrief("warung kopi");
    const card = parseWorkspaceCard(
      {
        type: "questions",
        questions: [
          {
            id: "jam_buka",
            question: "Jam buka hari kerja?",
            answerMode: "text",
            options: [],
          },
          {
            id: "kontak",
            question: "Pakai apa buat order?",
            options: [
              { label: "WhatsApp", description: "Chat langsung." },
              { label: "Telepon", description: "Telepon dulu." },
            ],
          },
        ],
      },
      brief,
    );
    expect(card.type).toBe("questions");
    if (card.type === "questions") {
      expect(card.questions).toHaveLength(2);
      expect(card.questions[0].id).toBe("jam_buka");
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/lib/projects/brief-flow.test.ts -t "questions variant"`
Expected: FAIL — `normalizeWorkspaceCard` reads `questions[0]` and returns `type:"question"` (current `[0]` behavior), so `card.type` is `"question"` not `"questions"`.

- [ ] **Step 3: Add the variant to the type**

In `src/lib/projects/brief.ts`, replace the `WorkspaceCard` type (lines 76-82):

```ts
// One decision per turn OR a round of up to 3 independent questions. The card
// never batches dependent questions: if Q2 depends on Q1's answer, the AI asks
// Q1 alone this turn and Q2 next turn. Server validates per-question.
export type WorkspaceCard =
  | { type: "none" }
  | { type: "question"; question: BriefQuestion }
  | { type: "questions"; questions: BriefQuestion[] }
  | { type: "build_recommendation"; title: string; summary: string[] };
```

- [ ] **Step 4: Run test to verify it still fails (normalize not yet updated)**

Run: `bun test src/lib/projects/brief-flow.test.ts -t "questions variant"`
Expected: FAIL — type compiles but `normalizeWorkspaceCard` still collapses to `question`. Confirms Task 2 is needed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/projects/brief.ts src/lib/projects/brief-flow.test.ts
git commit -m "feat(discuss): add WorkspaceCard questions[] variant type

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: Validate `questions[]` in `normalizeWorkspaceCard`

**Files:**
- Modify: `src/lib/projects/brief-flow.ts:215-270` (`normalizeWorkspaceCard`)
- Test: `src/lib/projects/brief-flow.test.ts`

**Interfaces:**
- Consumes: `WorkspaceCard` `questions` variant (Task 1), existing `normalizeQuestion` (brief-flow.ts:272).
- Produces: `normalizeWorkspaceCard` returns `type:"questions"` for 2-3 valid questions, collapses to `type:"question"` for 1 valid, `type:"none"` for 0 valid. Dedupes by id, caps at 3.

- [ ] **Step 1: Write failing tests**

Add to `src/lib/projects/brief-flow.test.ts` (extend the `parseWorkspaceCard questions variant` describe block):

```ts
  it("drops an invalid question but keeps the valid ones", () => {
    const brief = createInitialBrief("warung kopi");
    const card = parseWorkspaceCard(
      {
        type: "questions",
        questions: [
          {
            id: "jam_buka",
            question: "Jam buka?",
            answerMode: "text",
            options: [],
          },
          { id: "bad", question: "y", options: [{ label: "", description: "" }] },
          {
            id: "kontak",
            question: "Order via?",
            options: [
              { label: "WhatsApp", description: "Chat." },
              { label: "Telepon", description: "Call." },
            ],
          },
        ],
      },
      brief,
    );
    expect(card.type).toBe("questions");
    if (card.type === "questions") {
      expect(card.questions.map((q) => q.id)).toEqual(["jam_buka", "kontak"]);
    }
  });

  it("collapses a single valid question to type:question", () => {
    const brief = createInitialBrief("warung kopi");
    const card = parseWorkspaceCard(
      {
        type: "questions",
        questions: [
          {
            id: "jam_buka",
            question: "Jam buka?",
            answerMode: "text",
            options: [],
          },
        ],
      },
      brief,
    );
    expect(card.type).toBe("question");
  });

  it("returns none when all questions are invalid", () => {
    const brief = createInitialBrief("warung kopi");
    const card = parseWorkspaceCard(
      {
        type: "questions",
        questions: [{ id: "bad", question: "y", options: [] }],
      },
      brief,
    );
    expect(card.type).toBe("none");
  });

  it("dedupes questions by id", () => {
    const brief = createInitialBrief("warung kopi");
    const card = parseWorkspaceCard(
      {
        type: "questions",
        questions: [
          { id: "kontak", question: "Order via?", options: [{ label: "WA", description: "" }, { label: "Telp", description: "" }] },
          { id: "kontak", question: "Order via? (dup)", options: [{ label: "WA", description: "" }, { label: "Telp", description: "" }] },
          { id: "jam_buka", question: "Jam buka?", answerMode: "text", options: [] },
        ],
      },
      brief,
    );
    expect(card.type).toBe("questions");
    if (card.type === "questions") {
      expect(card.questions.map((q) => q.id)).toEqual(["kontak", "jam_buka"]);
    }
  });

  it("caps at 3 questions", () => {
    const brief = createInitialBrief("warung kopi");
    const card = parseWorkspaceCard(
      {
        type: "questions",
        questions: Array.from({ length: 5 }, (_, i) => ({
          id: `q${i}`,
          question: `Q${i}?`,
          answerMode: "text" as const,
          options: [],
        })),
      },
      brief,
    );
    expect(card.type).toBe("questions");
    if (card.type === "questions") {
      expect(card.questions).toHaveLength(3);
    }
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/lib/projects/brief-flow.test.ts -t "questions variant"`
Expected: FAIL — current `normalizeWorkspaceCard` reads `value.question ?? value.questions[0]` and returns single `question`.

- [ ] **Step 3: Implement `normalizeWorkspaceCard` questions branch**

In `src/lib/projects/brief-flow.ts`, add a helper and branch. Replace the body of `normalizeWorkspaceCard` (lines 215-270) so it first checks for an explicit `questions` array. Insert near the top of the function, after the `value` destructuring (after line ~230):

```ts
  if (value.type === "questions") {
    return normalizeQuestionsArray(value.questions, brief);
  }
```

Add the helper above `normalizeWorkspaceCard`:

```ts
function normalizeQuestionsArray(
  raw: unknown,
  brief: ProjectBrief,
): WorkspaceCard {
  if (!Array.isArray(raw)) {
    return createFallbackWorkspaceCard(brief);
  }

  const seen = new Set<string>();
  const questions: BriefQuestion[] = [];
  for (const item of raw) {
    const question = normalizeQuestion(item);
    if (!question || seen.has(question.id)) {
      continue;
    }
    seen.add(question.id);
    questions.push(question);
    if (questions.length === 3) {
      break;
    }
  }

  if (questions.length === 0) {
    return createFallbackWorkspaceCard(brief);
  }
  if (questions.length === 1) {
    return { type: "question", question: questions[0] };
  }
  return { type: "questions", questions };
}
```

Ensure `BriefQuestion` is in the existing imports at the top of `brief-flow.ts` (it already imports `type BriefQuestion` from `./brief` — verify; if not, add it).

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/lib/projects/brief-flow.test.ts`
Expected: PASS — all existing tests + new questions-variant tests green.

- [ ] **Step 5: Run full brief-flow regression**

Run: `bun test src/lib/projects/brief-flow.test.ts src/lib/projects/brief.test.ts`
Expected: PASS — no regressions (existing `question` and `build_recommendation` paths untouched).

- [ ] **Step 6: Commit**

```bash
git add src/lib/projects/brief-flow.ts src/lib/projects/brief-flow.test.ts
git commit -m "feat(discuss): validate questions[] in normalizeWorkspaceCard

Per-question validation drops invalid items, dedupes by id, caps at 3,
and collapses a single valid question to the existing type:question card.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: `buildBriefPatchFromWorkspaceAnswers` reads `questions[]`

**Files:**
- Modify: `src/lib/projects/workspace-answers.ts:24-28`
- Test: `src/lib/projects/workspace-answers.test.ts`

**Interfaces:**
- Consumes: `WorkspaceCard` `questions` variant (Task 1).
- Produces: `buildBriefPatchFromWorkspaceAnswers` accepts a `questions` card and applies every answered question's payload to the brief patch.

- [ ] **Step 1: Write failing tests**

Add to `src/lib/projects/workspace-answers.test.ts`:

```ts
const multiCard: WorkspaceCard = {
  type: "questions",
  questions: [
    {
      id: "businessType",
      question: "Jenis usaha?",
      options: [
        { label: "Warung Bakso", description: "" },
        { label: "Kedai Mie", description: "" },
      ],
    },
    {
      id: "targetCustomer",
      question: "Pelanggan utama?",
      options: [
        { label: "Anak sekolah", description: "" },
        { label: "Karyawan", description: "" },
      ],
    },
  ],
};

describe("buildBriefPatchFromWorkspaceAnswers questions card", () => {
  it("applies all answered questions in a batch", () => {
    const patch = buildBriefPatchFromWorkspaceAnswers({
      card: multiCard,
      fallbackText: "",
      workspaceAnswers: [
        { answer: "Warung Bakso", question: "Jenis usaha?", questionId: "businessType", source: "option" },
        { answer: "Anak sekolah", question: "Pelanggan utama?", questionId: "targetCustomer", source: "option" },
      ],
    });

    expect(patch.businessType).toBe("Warung Bakso");
    expect(patch.targetCustomer).toBe("Anak sekolah");
    expect(patch.decisions).toHaveLength(2);
    expect(patch.facts).toHaveLength(2);
  });

  it("applies only the answered subset (partial)", () => {
    const patch = buildBriefPatchFromWorkspaceAnswers({
      card: multiCard,
      fallbackText: "",
      workspaceAnswers: [
        { answer: "Warung Bakso", question: "Jenis usaha?", questionId: "businessType", source: "option" },
      ],
    });

    expect(patch.businessType).toBe("Warung Bakso");
    expect(patch.targetCustomer).toBeUndefined();
    expect(patch.decisions).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/lib/projects/workspace-answers.test.ts -t "questions card"`
Expected: FAIL — `buildBriefPatchFromWorkspaceAnswers` returns `{}` for a `questions` card because the guard `card.type !== "question"` short-circuits (line 24).

- [ ] **Step 3: Change the active-questions source**

In `src/lib/projects/workspace-answers.ts`, replace lines 24-28 (the `questions` derivation):

```ts
  if (card.type !== "question" && card.type !== "questions") {
    return {};
  }

  const questions =
    card.type === "questions" ? card.questions : [card.question];
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/lib/projects/workspace-answers.test.ts`
Expected: PASS — all existing single-question tests + new batch tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/projects/workspace-answers.ts src/lib/projects/workspace-answers.test.ts
git commit -m "feat(discuss): apply workspace answers for a questions[] card

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: Handle `questions` variant in `workspace-sync.ts`

**Files:**
- Modify: `src/lib/projects/workspace-sync.ts:111-133` (`getWorkspaceComposerState`), `:341-368` (`isFreshWorkspaceCard`), `:136-169` (`hasAnsweredWorkspaceQuestion`)

**Interfaces:**
- Consumes: `WorkspaceCard` `questions` variant.
- Produces: composer-state machine, freshness, and answered-detection all treat a `questions` card like a `question` card (composer state `"question"`, freshness compares id sets, answered-detection checks the latest user text against any question in the batch).

- [ ] **Step 1: Write failing test**

Create or extend a test file. Check if `workspace-sync.test.ts` exists; if so add there, else create `src/lib/projects/workspace-sync-rounds.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { createInitialBrief } from "./brief";
import { getWorkspaceComposerState, isFreshWorkspaceCard } from "./workspace-sync";

describe("workspace-sync questions variant", () => {
  const brief = createInitialBrief("warung");
  const batch = {
    type: "questions" as const,
    questions: [
      { id: "a", question: "A?", options: [{ label: "x", description: "" }, { label: "y", description: "" }] },
      { id: "b", question: "B?", options: [{ label: "x", description: "" }, { label: "y", description: "" }] },
    ],
  };

  it("treats a questions card as composer state question", () => {
    const state = getWorkspaceComposerState({
      buildComplete: false,
      card: batch,
      held: false,
      postBuildChatOpen: false,
    });
    expect(state).toBe("question");
  });

  it("isFreshWorkspaceCard detects changed id set", () => {
    const prev = {
      type: "questions" as const,
      questions: [{ id: "a", question: "A?", options: [{ label: "x", description: "" }, { label: "y", description: "" }] }],
    };
    expect(isFreshWorkspaceCard(batch, prev)).toBe(true);
    expect(isFreshWorkspaceCard(batch, batch)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/lib/projects/workspace-sync-rounds.test.ts`
Expected: FAIL — `getWorkspaceComposerState` falls through to `"free_chat"` for `type:"questions"`; `isFreshWorkspaceCard` returns false (no `questions` branch).

- [ ] **Step 3: Update `getWorkspaceComposerState`**

In `src/lib/projects/workspace-sync.ts`, the function has branches `card.type === "question"` (lines 111-113 and 129-131). Add `questions` to both comparisons:

```ts
      if (card.type === "question" || card.type === "questions") {
        return "question";
      }
```
(inside the `buildComplete && postBuildChatOpen` block), and:

```ts
  if (card.type === "question" || card.type === "questions") {
    return "question";
  }
```
(after the build_recommendation branches).

- [ ] **Step 4: Update `isFreshWorkspaceCard`**

Add a `questions` branch in `isFreshWorkspaceCard` (after the `question` branch, ~line 353):

```ts
  if (next.type === "questions" && previous.type === "questions") {
    const nextIds = next.questions.map((q) => q.id).sort().join("|");
    const prevIds = previous.questions.map((q) => q.id).sort().join("|");
    return nextIds !== prevIds;
  }

  if (next.type === "questions" || previous.type === "questions") {
    return true;
  }
```

- [ ] **Step 5: Update `hasAnsweredWorkspaceQuestion`**

In `hasAnsweredWorkspaceQuestion` (line 145), widen the guard and detection. Replace the guard:

```ts
  if (mode !== "discuss" || (card.type !== "question" && card.type !== "questions")) {
    return false;
  }
```

After computing `answeredQuestion` (the text before `\nJawaban:`), compare against the batch's questions:

```ts
  const cardQuestions =
    card.type === "questions"
      ? card.questions.map((q) => q.question.trim())
      : [card.question.question.trim()];

  if (!answeredQuestion || !cardQuestions.includes(answeredQuestion)) {
    return false;
  }
  return true;
```

(Replace the existing single `answeredQuestion !== card.question.question.trim()` check.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `bun test src/lib/projects/workspace-sync-rounds.test.ts src/lib/projects/workspace-sync.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/projects/workspace-sync.ts src/lib/projects/workspace-sync-rounds.test.ts
git commit -m "feat(discuss): workspace-sync handles questions[] card

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: Prompt — relentless tone + Rounds section

**Files:**
- Modify: `src/lib/projects/prompts/discuss-system.md`
- Modify: `src/routes/api.projects.preview.ts:683-690` (`buildOneCallSystemPrompt`)

**Interfaces:**
- Consumes: none.
- Produces: AI emits 1-3 independent questions via `questions[]` tool field, or a single `question`, or `build_recommendation`. Per-question `recommendedOptionLabel`.

- [ ] **Step 1: Update `buildOneCallSystemPrompt`**

In `src/routes/api.projects.preview.ts`, replace the `CRITICAL OUTPUT ORDER` block (lines 685-690) with:

```ts
  return `${buildChatSystemPrompt({ brief, context })

CRITICAL OUTPUT ORDER:
1) Write 1-3 short Indonesian chat sentences first (aku/kamu only).
2) Then call ${PRESENT_WORKSPACE_CARD_TOOL_NAME} exactly once with the next workspace card.

INTERVIEW DISCIPLINE — rounds of questions:
- Emit 1-3 questions per turn. Mixed modes (choice/text, single/multiple) OK in one batch.
- INDEPENDENCE GATE: batch ONLY questions whose answer does not change another
  question's framing, options, or whether it needs asking. If Q2 depends on Q1's
  answer, ask Q1 alone this turn; ask Q2 next turn.
- Cap 3 per batch. Server enforces (dedupes by id, slices surplus).
- For EACH question set recommendedOptionLabel (your default) — user can accept in one click.
- Do not ask a field inferable from brief/chat. Walk the decision tree, resolve the
  deepest open dependency first.
- When all applicable fields filled/declined AND confidence 95+: emit build_recommendation
  instead of questions.

Never put JSON in chat text. Never call the tool before chat text.
For questions: type="questions" with questions[] (independent batch) or type="question" with a single question.
question.id must be a short slug like business_name or services.
Prefer choice options with label+description (2-5). Use build_recommendation only when confidence is genuinely 95%+ and no open questions remain. Below that, keep asking. Never use any other card type.`;
```

- [ ] **Step 2: Flip tone in `discuss-system.md`**

In `src/lib/projects/prompts/discuss-system.md`, replace the line:

```
Ask only the ones applicable to the UMKM type. No need to ask them all.
```

with:

```
Be relentless — extract every applicable field, batching independent questions aggressively to reach 95% fast. Slightly annoying upfront is fine; the 95% gate still protects the build. Ask only the applicable soft fields for the UMKM type, but do not skip them.
```

- [ ] **Step 3: Add a Rounds section to `discuss-system.md`**

Append at the end of the file:

```markdown
# Rounds (multi-question batching)

Ask 1-3 independent questions per turn when possible. Independent = one answer
doesn't change another question's options or relevance. Dependent questions
stay single and sequential (next turn).

Example independent batch: [jam buka weekday?] [jam buka weekend?] [ada WhatsApp?]
Example dependent (single): [tampilin harga?] → only if "ya": [range harga?]

Always recommend a default per question (recommendedOptionLabel). Max 3 per batch.
```

- [ ] **Step 4: Verify file builds (typecheck-ish)**

Run: `bunx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "preview.ts|discuss-system" | head` (or the repo's typecheck script). Expected: no errors in edited files. If the repo uses `bun run check:types`, run that instead.

- [ ] **Step 5: Commit**

```bash
git add src/lib/projects/prompts/discuss-system.md src/routes/api.projects.preview.ts
git commit -m "feat(discuss): prompt rounds + relentless tone

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: Widen tool schema `questions` field

**Files:**
- Modify: `src/routes/api.projects.preview.ts:652-672` (`presentWorkspaceCardTool` inputSchema)

**Interfaces:**
- Consumes: `WorkspaceCard` `questions` variant.
- Produces: tool accepts a properly-shaped `questions[]` (still permissive — server validates via Task 2).

- [ ] **Step 1: Widen the `questions` field in the tool schema**

In `src/routes/api.projects.preview.ts`, in `presentWorkspaceCardTool`'s `workspaceCard` schema (lines 652-672), replace the `questions: z.array(z.any()).optional()` line with a permissive-but-shaped array:

```ts
        questions: z
          .array(
            z.object({
              id: z.union([z.string(), z.number()]).optional(),
              question: z.string().optional(),
              text: z.string().optional(),
              title: z.string().optional(),
              answerMode: z.string().optional(),
              selectionMode: z.string().optional(),
              placeholder: z.string().optional(),
              recommendedOptionLabel: z.string().optional(),
              whyThisQuestionMatters: z.string().optional(),
              options: z.array(z.any()).optional(),
            }),
          )
          .optional(),
```

(Keep the existing `question` single-object field alongside it — AI may emit either.)

- [ ] **Step 2: Run brief-flow tests (schema feeds normalize)**

Run: `bun test src/lib/projects/brief-flow.test.ts`
Expected: PASS (no behavioral change; schema only widens accepted input).

- [ ] **Step 3: Commit**

```bash
git add src/routes/api.projects.preview.ts
git commit -m "feat(discuss): shape presentWorkspaceCard questions[] schema

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: Fix 1 — `maxSteps` self-correct loop

**Files:**
- Modify: `src/routes/api.projects.preview.ts:728-751` (`streamText` primary call)

**Interfaces:**
- Consumes: existing `presentWorkspaceCardTool`.
- Produces: if the AI streams chat text without calling the tool, the SDK runs one more step so the model can self-correct. Tool is pure-present (no side effect), safe to loop.

- [ ] **Step 1: Add `maxSteps` to the primary `streamText`**

In `src/routes/api.projects.preview.ts` `handleDiscussTurnOneCall`, the `primary = streamText({...})` block (lines 728-751). Add `maxSteps: 2` next to `toolChoice: "auto"`:

```ts
  const primary = streamText({
    model,
    system: systemPrompt,
    messages: modelMessages,
    tools: { [PRESENT_WORKSPACE_CARD_TOOL_NAME]: presentWorkspaceCardTool },
    toolChoice: "auto",
    maxSteps: 2,
    maxRetries: 2,
    temperature: 0.35,
    timeout: getAiTimeoutMs("discussOneCall"),
    telemetry: getAiTelemetry("project-guided-discuss-one-call", {
      briefConfidence: effectiveBrief.confidence,
      mode: "discuss-one-call",
      model: modelName,
      projectId: project.id,
      route: "api.projects.preview",
      userId,
    }),
    onError({ error }) {
      console.error(
        "[preview-chat] one-call stream error",
        getSafeAiErrorLog(error),
      );
    },
  });
```

Note: this also lands Fix 3 (`maxRetries: 1` → `2`) in the same edit.

- [ ] **Step 2: Verify the stream loop handles multiple tool-call parts**

The existing `for await (const part of primary.stream)` loop (lines 769-797) already captures the latest `tool-call` part into `toolInput`/`streamToolCallId`. With `maxSteps: 2`, a second step may emit a second `tool-call`; the loop keeps the last one. That is the desired behavior (first valid tool call wins, last-write of the stream var is fine because step 2 only runs when step 1 produced no tool call). No code change needed — confirm by reading the loop.

- [ ] **Step 3: Typecheck**

Run the repo typecheck (`bun run check:types` or `bunx tsc --noEmit`). Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/routes/api.projects.preview.ts
git commit -m "fix(discuss): maxSteps self-correct loop + maxRetries bump

Agent loop gives the model one self-correct step if it streams chat text
without calling presentWorkspaceCard. Also raises maxRetries 1->2 for
transient API errors. Targets ~99% tool-invocation reliability.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 8: Fix 2 — repair attempts 2→3

**Files:**
- Modify: `src/lib/ai-timeouts.ts:16`

**Interfaces:**
- Consumes: `DISCUSS_CARD_SERVER_DEADLINE_MS` derived constant.
- Produces: repair path gets a third semantic attempt; server deadline rises to 135s automatically.

- [ ] **Step 1: Bump the constant**

In `src/lib/ai-timeouts.ts`, change line 16:

```ts
export const DISCUSS_CARD_SEMANTIC_ATTEMPTS = 3;
```

`DISCUSS_CARD_SERVER_DEADLINE_MS` (line 18-19) is derived: `45_000 * 3 = 135_000`. No other change.

- [ ] **Step 2: Verify no test pins the old value**

Run: `bun test src/lib/ai-timeouts.test.ts 2>/dev/null || echo "no ai-timeouts test"`
Expected: either PASS or "no ai-timeouts test" (no assertion on the old constant).

- [ ] **Step 3: Commit**

```bash
git add src/lib/ai-timeouts.ts
git commit -m "fix(discuss): repair attempts 2->3 (deadline 135s)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 9: Fix 4 — no-AI fallback card from missing brief fields

**Files:**
- Modify: `src/lib/projects/brief-flow.ts` (new `buildFallbackWorkspaceCardFromBrief`)
- Modify: `src/routes/api.projects.preview.ts` (`handleDiscussTurnOneCall`, after repair)
- Test: `src/lib/projects/brief-flow.test.ts`

**Interfaces:**
- Consumes: `getMissingBriefFields` (brief.ts:322), `REQUIRED_BRIEF_FIELDS` (brief.ts:118), `createInitialBrief`/`parseProjectBrief`.
- Produces: `buildFallbackWorkspaceCardFromBrief(brief): WorkspaceCard` returns a `questions` (or `question`) card derived from up to 3 missing required fields. Never returns `build_recommendation`. Caller uses it only when all AI paths produced `type:"none"`.

- [ ] **Step 1: Write failing test**

Add to `src/lib/projects/brief-flow.test.ts`:

```ts
import { buildFallbackWorkspaceCardFromBrief } from "./brief-flow";

describe("buildFallbackWorkspaceCardFromBrief", () => {
  it("builds a questions card from missing required fields", () => {
    const brief = createInitialBrief("jualan");
    brief.businessType = "Katering";
    // offer, targetCustomer, contactOrCta, stylePreference still empty
    const card = buildFallbackWorkspaceCardFromBrief(brief);
    expect(card.type).toBe("questions");
    if (card.type === "questions") {
      expect(card.questions.length).toBeGreaterThan(0);
      expect(card.questions.length).toBeLessThanOrEqual(3);
      expect(card.questions.every((q) => q.options.length >= 2 || q.answerMode === "text")).toBe(true);
    }
  });

  it("returns none when no required fields are missing", () => {
    const brief = createInitialBrief("jualan");
    brief.businessType = "Katering";
    brief.offer = "Nasi kotak";
    brief.targetCustomer = "Anak sekolah";
    brief.contactOrCta = "WhatsApp";
    brief.stylePreference = "Hangat";
    const card = buildFallbackWorkspaceCardFromBrief(brief);
    expect(card.type).toBe("none");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/lib/projects/brief-flow.test.ts -t "buildFallbackWorkspaceCardFromBrief"`
Expected: FAIL — function not exported.

- [ ] **Step 3: Implement the helper**

In `src/lib/projects/brief-flow.ts`, add the export near `createFallbackWorkspaceCard` (~line 188):

```ts
const FALLBACK_FIELD_QUESTIONS: Record<
  string,
  { question: string; answerMode: "choice" | "text"; placeholder?: string; options: Array<{ label: string; description: string }> }
> = {
  businessType: {
    question: "Usahamu bidang apa?",
    answerMode: "choice",
    options: [
      { label: "Kuliner/F&B", description: "Warung makan, kafe, jajanan." },
      { label: "Jasa lokal", description: "Laundry, barber, servis." },
      { label: "Jasa online", description: "Desain, tulis, freelance." },
      { label: "Lainnya", description: "Tulis sendiri." },
    ],
  },
  offer: {
    question: "Produk/jasa utama yang dijual?",
    answerMode: "text",
    placeholder: "Contoh: nasi kotak harian",
  },
  targetCustomer: {
    question: "Pelanggan utamanya siapa?",
    answerMode: "text",
    placeholder: "Contoh: anak sekolah sekitar",
  },
  contactOrCta: {
    question: "Pakai apa buat dihubungi?",
    answerMode: "choice",
    options: [
      { label: "WhatsApp", description: "Chat langsung." },
      { label: "Telepon", description: "Telepon dulu." },
      { label: "Instagram", description: "DM Instagram." },
      { label: "Lainnya", description: "Tulis sendiri." },
    ],
  },
  stylePreference: {
    question: "Arah tampilan yang kamu suka?",
    answerMode: "choice",
    options: [
      { label: "Hangat & ramah", description: "Warna earthy, cozy." },
      { label: "Bersih & modern", description: "Minimalis, putih." },
      { label: "Ceria & cerah", description: "Warna terang, playful." },
      { label: "Lainnya", description: "Tulis sendiri." },
    ],
  },
};

// Last-resort card when every AI path produced type:"none". Derives up to 3
// questions from empty REQUIRED_BRIEF_FIELDS without calling the model — matches
// the grilling principle that an inferable fact should not be re-asked of the AI.
// Never returns build_recommendation.
export function buildFallbackWorkspaceCardFromBrief(
  brief: ProjectBrief,
): WorkspaceCard {
  const missing = getMissingBriefFields(brief);
  if (missing.length === 0) {
    return createFallbackWorkspaceCard(brief);
  }

  const seen = new Set<string>();
  const questions: BriefQuestion[] = [];
  for (const field of missing) {
    if (seen.has(field)) {
      continue;
    }
    const spec = FALLBACK_FIELD_QUESTIONS[field];
    if (!spec) {
      continue;
    }
    seen.add(field);
    questions.push({
      id: field,
      question: spec.question,
      answerMode: spec.answerMode,
      options: spec.options,
      placeholder: spec.placeholder,
    });
    if (questions.length === 3) {
      break;
    }
  }

  if (questions.length === 0) {
    return createFallbackWorkspaceCard(brief);
  }
  if (questions.length === 1) {
    return { type: "question", question: questions[0] };
  }
  return { type: "questions", questions };
}
```

Ensure imports include `getMissingBriefFields` from `./brief` (add if missing). `ProjectBrief` and `BriefQuestion` already imported.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/lib/projects/brief-flow.test.ts -t "buildFallbackWorkspaceCardFromBrief"`
Expected: PASS.

- [ ] **Step 5: Wire the fallback into the one-call turn**

In `src/routes/api.projects.preview.ts` `handleDiscussTurnOneCall`, after the repair block (the `if (primaryToolFailed) { ... }` block ending ~line 866), insert the fallback when still none:

```ts
        if (workspaceTurn.workspaceCard.type === "none") {
          const fallbackCard = buildFallbackWorkspaceCardFromBrief(
            workspaceTurn.brief,
          );
          if (fallbackCard.type !== "none") {
            workspaceTurn = {
              ...workspaceTurn,
              workspaceCard: fallbackCard,
            };
            primaryToolFailed = true; // still log as AI-failed, fallback covered
          }
        }
```

Add the import at the top of the file with the other brief-flow imports:

```ts
import {
  buildFallbackWorkspaceCardFromBrief,
  normalizeWorkspaceTurn,
  parseWorkspaceCard,
} from "@/lib/projects/brief-flow";
```

- [ ] **Step 6: Typecheck + run full brief-flow suite**

Run: `bun run check:types` (or `bunx tsc --noEmit`) then `bun test src/lib/projects/brief-flow.test.ts`
Expected: no type errors; all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/projects/brief-flow.ts src/lib/projects/brief-flow.test.ts src/routes/api.projects.preview.ts
git commit -m "fix(discuss): no-AI fallback card from missing brief fields

When every AI path (primary + repair) yields type:none, the server derives
a questions card from empty required brief fields so the user is never stuck
without a clickable card.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 10: UI — `QuestionsComposer` + render in `WorkspaceShell`

**Files:**
- Modify: `src/components/projects/WorkspacePrimitives.tsx` (add `QuestionsComposer`)
- Modify: `src/components/projects/WorkspaceShell.tsx:1002` (`activeQuestionKey`), render site (~line 2159)

**Interfaces:**
- Consumes: `WorkspaceCard` `questions` variant, existing `QuestionComposer`, `WorkspaceAnswerPayload`.
- Produces: a batch of N `QuestionComposer` blocks with a single "Kirim semua" submit that emits the filled `WorkspaceAnswerPayload[]`.

- [ ] **Step 1: Add `QuestionsComposer` to `WorkspacePrimitives.tsx`**

Append after the existing `QuestionComposer` export (after line ~1199):

```tsx
export function QuestionsComposer({
  questions,
  onSubmit,
}: {
  questions: BriefQuestion[];
  onSubmit: (answers: WorkspaceAnswerPayload[]) => void;
}) {
  // Per-id draft state. Each child QuestionComposer is uncontrolled for its own
  // selection; we collect on submit by reading a ref map of answers. To keep this
  // simple and avoid prop-drilling controlled state into the existing single
  // QuestionComposer, we render one QuestionComposer per question and capture its
  // onSubmit per question, buffering until the user presses "Kirim semua".
  const buffer = useRef<Record<string, WorkspaceAnswerPayload | undefined>>({});

  function childSubmit(question: BriefQuestion, payload: WorkspaceAnswerPayload) {
    buffer.current[question.id] = payload;
  }

  function sendAll() {
    const answers = Object.values(buffer.current).filter(
      (item): item is WorkspaceAnswerPayload => Boolean(item),
    );
    if (!answers.length) {
      return;
    }
    onSubmit(answers);
  }

  return (
    <div className="mt-spacing-3 space-y-spacing-3">
      {questions.map((question) => (
        <QuestionComposer
          key={question.id}
          question={question}
          onSubmit={(answer, workspaceAnswers) => {
            const payload = workspaceAnswers?.[0];
            if (payload) {
              childSubmit(question, payload);
            }
          }}
        />
      ))}
      <div className="flex items-center justify-end gap-spacing-3 px-spacing-1">
        <Button
          type="button"
          onClick={sendAll}
          className="rounded-full bg-surface-warm-white text-foreground-primary hover:bg-surface-warm-white/86"
        >
          Kirim semua jawaban
        </Button>
      </div>
    </div>
  );
}
```

Note: `QuestionComposer`'s existing `onSubmit(answer, workspaceAnswers?)` already builds the `WorkspaceAnswerPayload[]` per question (WorkspacePrimitives.tsx:1017-1024). We take `[0]`. The child composer also sends a chat text per question internally; we override by NOT calling the parent chat send — `QuestionsComposer` owns submit and calls `onSubmit(answers)` with the collected payloads. The caller (WorkspaceShell) turns those payloads into one chat send (Task 11).

- [ ] **Step 2: Import `useRef` if not present**

Check the existing imports in `WorkspacePrimitives.tsx` (line 18: `import { useEffect, useRef, useState } from "react";`). `useRef` is already imported. No change.

- [ ] **Step 3: Make `activeQuestionKey` composite in `WorkspaceShell.tsx`**

In `src/components/projects/WorkspaceShell.tsx`, replace the `activeQuestionKey` computation (~line 1002):

```ts
  const activeQuestionKey =
    workspaceCard.type === "question"
      ? workspaceCard.question.id
      : workspaceCard.type === "questions"
        ? workspaceCard.questions.map((q) => q.id).join("|")
        : workspaceCard.type;
```

- [ ] **Step 4: Render `QuestionsComposer` for a `questions` card**

In `src/components/projects/WorkspaceShell.tsx`, find the existing `<QuestionComposer ... />` render (~line 2159, inside the `composerState === "question"` block). Add a branch above it:

```tsx
                      {workspaceCard.type === "questions" ? (
                        <QuestionsComposer
                          questions={workspaceCard.questions}
                          onSubmit={(answers) =>
                            submitChatText("", { workspaceAnswers: answers })
                          }
                        />
                      ) : (
                        <QuestionComposer
                          question={workspaceCard.question}
                          onClose={() => setQuestionComposerMode("free")}
                          onSubmit={(answer, workspaceAnswers) =>
                            submitChatText(answer, { workspaceAnswers })
                          }
                        />
                      )}
```

Add `QuestionsComposer` to the import from `@/components/projects/WorkspacePrimitives` (line ~28-42).

- [ ] **Step 5: Handle empty-text send in `submitChatText`**

`submitChatText` (WorkspaceShell.tsx:1693) guards `if (!trimmed ...) return;`. With `QuestionsComposer` we call `submitChatText("", { workspaceAnswers: answers })` — empty text but with answers. Update the guard so an empty text WITH workspaceAnswers is allowed. In `submitChatText`, change the guard:

```ts
      const hasAnswers = Boolean(options.workspaceAnswers?.length);
      if (
        (!trimmed && !hasAnswers) ||
        isProcessing ||
        rateLimitError ||
        authStatus !== "authenticated" ||
        sessionExpired
      ) {
        return;
      }
```

- [ ] **Step 6: Verify the server path accepts empty text + answers**

In `src/routes/api.projects.preview.ts` `handlePreviewPost`, the empty-incoming guard (lines 265-270) returns 400 if `!incoming.length`. With `submitChatText("", { workspaceAnswers })`, the chat transport sends `message: { parts: [{ type: "text", text: "" }] }` — so `incoming.length` is 1 (not empty), passing the guard. The `latestUserText` (lines 215-219) is `""`, and `buildBriefPatchFromWorkspaceAnswers` is called with `workspaceAnswers: body.workspaceAnswers` (line 228) which takes precedence. Confirm by re-reading lines 187-254: `workspaceAnswerPatch` is built from `workspaceAnswers` first, fallback to text. Empty text + answers works. No server change needed.

- [ ] **Step 7: Typecheck**

Run: `bun run check:types` (or `bunx tsc --noEmit`). Expected: no errors. Fix any JSX/prop type issues in the new component.

- [ ] **Step 8: Run Prettier + lint on touched files**

Run: `bunx prettier --write src/components/projects/WorkspacePrimitives.tsx src/components/projects/WorkspaceShell.tsx`
Then: `bun run check:commit` (dry — stage first if it requires staged files).

- [ ] **Step 9: Commit**

```bash
git add src/components/projects/WorkspacePrimitives.tsx src/components/projects/WorkspaceShell.tsx
git commit -m "feat(discuss): QuestionsComposer renders a batch with one submit

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 11: Repair prompt tweak + final integration check

**Files:**
- Modify: `src/routes/api.projects.preview.ts:1020-1024` (`repairDiscussCardWithTool` system prompt)

**Interfaces:**
- Consumes: Task 2 validation, Task 9 fallback.
- Produces: repair prompt reminds the model to emit a valid `questions[]` batch or single `question`.

- [ ] **Step 1: Update the repair system prompt**

In `src/routes/api.projects.preview.ts` `repairDiscussCardWithTool`, the repair system string (lines 1020-1024):

```ts
          system: `${cardSystemPrompt}

REPAIR attempt ${semanticAttempt + 1}: previous card was invalid or missing.
Call ${PRESENT_WORKSPACE_CARD_TOOL_NAME} exactly once with a valid workspace card.
Emit type="questions" with 1-3 independent questions[], or type="question" with a single question, or type="build_recommendation" only at 95%+ confidence.
Keep a short Indonesian chat preface only if needed. Prefer 2-5 options per choice question and set recommendedOptionLabel.`,
```

- [ ] **Step 2: Run the full discuss-related test suite**

Run: `bun test src/lib/projects/brief-flow.test.ts src/lib/projects/workspace-answers.test.ts src/lib/projects/workspace-sync-rounds.test.ts src/lib/projects/workspace-sync.test.ts`
Expected: all PASS.

- [ ] **Step 3: Run the whole project test suite**

Run: `bun test`
Expected: PASS (no regressions across modules).

- [ ] **Step 4: Run typecheck + lint gate**

Run: `bun run check:types` then `bun run check:commit` (with all touched files staged).
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/routes/api.projects.preview.ts
git commit -m "fix(discuss): repair prompt emits questions[] or single question

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 12 (optional): Storybook fixture for `questions` card

**Files:**
- Modify: `src/stories/WorkspaceDecisionCards.stories.tsx`

**Interfaces:**
- Consumes: `QuestionsComposer` (Task 10).
- Produces: a visual story for a 3-question batch.

- [ ] **Step 1: Read the existing stories file and mirror its pattern**

Run: `head -40 src/stories/WorkspaceDecisionCards.stories.tsx` to see the export shape. Add a new story exporting a `questions` card sample (3 questions, mixed modes) rendering `<QuestionsComposer questions={[...]} onSubmit={() => {}} />`.

- [ ] **Step 2: Run storybook smoke (if available)**

Run: `bunx storybook build --test 2>&1 | tail -5` or skip if storybook isn't part of CI. Optional — only if the repo runs storybook in CI.

- [ ] **Step 3: Commit**

```bash
git add src/stories/WorkspaceDecisionCards.stories.tsx
git commit -m "docs(story): add questions[] batch fixture

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Self-Review Notes

**Spec coverage:**
- Section 1 (shape/goals) → Tasks 1, 2, 10.
- Section 2 (data model) → Tasks 1, 2, 3, 6.
- Section 3 (prompt + independence) → Task 5.
- Section 4 (reliability Fix 1-4) → Tasks 7, 8, 9 (Fix 3 folded into Task 7).
- Section 5 (UI) → Task 10.
- Section 6 (edge cases) → covered by Task 2 tests (invalid/dup/cap/collapse/none) + Task 9 fallback.
- Section 7 (testing) → Tasks 2, 3, 9 + Task 11 final sweep.
- Section 8 (rollout) → no new flag; tasks ship behind existing `DISCUSS_ONE_CALL_TOOLS`.

**Placeholder scan:** none. Every code step shows actual code.

**Type consistency:** `buildFallbackWorkspaceCardFromBrief`, `QuestionsComposer`, `normalizeQuestionsArray` named consistently across producers/consumers. `WorkspaceCard` variant `questions` used everywhere. `WorkspaceAnswerPayload` reused as-is.
