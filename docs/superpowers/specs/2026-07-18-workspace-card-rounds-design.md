# Workspace Card Rounds + Reliability

**Date:** 2026-07-18
**Status:** Design — pending user review
**Scope:** `src/routes/api.projects.preview.ts` one-call discuss path, `brief-flow.ts`, `workspace-answers.ts`, `workspace-sync.ts`, `WorkspacePrimitives.tsx`, `WorkspaceShell.tsx`, `discuss-system.md`, `ai-timeouts.ts`.

## Goal

Two changes, one spec:

1. **Rounds** — workspace card may carry 1–3 independent questions per turn (mixed modes: free text / multi-select / single-select in one batch). Partial answers OK. Dependent questions stay single and sequential (next turn).
2. **Reliability** — tool `presentWorkspaceCard` not invoked ~10% today → ~99% via 4 fixes: re-prompt agent loop when forgotten, repair attempts 2→3, `maxRetries` 1→2, server-built fallback card from missing fields when all AI paths miss.

**Path:** one-call only (`handleDiscussTurnOneCall`). Two-phase legacy path (`handleDiscussTurn`) untouched, stays single-question.

## Inspiration (blended into rules + prompt)

From **grilling** (mattpocock):
- Decision-tree walk + dependency order → becomes the independence gate (batch only independents; dependents single + sequential).
- "For each question, provide recommended answer" → `recommendedOptionLabel` set per question in batch (today often only 1).
- "If a fact can be found in environment, look it up" → reuse existing "if inferable, don't ask" guard so batching never re-asks inferable fields.

From **brainstorming** (obra):
- Scope-check before action → adapted to an explicit **independence check** before emitting a batch.
- Spec self-review 4-check → analog is **per-question server-side validation** (drop invalid, keep valid).

Everything else already exists in `discuss-system.md`: tree walk, infer-facts, hallucination guard, 95% gate. We reuse, not rebuild.

## Section 1 — Shape & Goals

- Card variant `type: "questions"` carrying `BriefQuestion[]`. `type: "question"` (single) preserved for stored legacy cards and turns that must be single.
- Round = one AI turn emitting a batch. Round N+1 may depend on round N's answers (read from updated brief). No `round` field stored — it's implicit in turn-by-turn chat.
- Mix mode free: each `BriefQuestion` already carries `answerMode: "choice"|"text"` + `selectionMode: "single"|"multiple"` per-question.
- Reliability targets the one-call path only.

## Section 2 — Data Model

`WorkspaceCard` (brief.ts) — add variant:

```ts
type WorkspaceCard =
  | { type: "none" }
  | { type: "question"; question: BriefQuestion }
  | { type: "questions"; questions: BriefQuestion[] }   // NEW
  | { type: "build_recommendation"; title: string; summary: string[] };
```

Server-side constraints (in `normalizeWorkspaceCard`):
- Dedupe `questions` by `id`, keep first.
- Cap `questions.length` at 3 (slice surplus — AI over-eager has no effect).
- Each item passes existing `normalizeQuestion` (brief-flow.ts:272). Invalid → drop, keep valid. Array may reach 0.
- Array of exactly 1 valid → **collapse to `type: "question"`** so the single UI path stays used; no special-case "batch of 1".

Stored card: `type: "questions"` persists in `workspaceCard` jsonb like `question`. `parseWorkspaceCard` handles the new variant.

Tool schema (preview.ts:669): field `questions: z.array(...)` already exists as `z.array(z.any())`; widen to proper `BriefQuestion`-shaped object schema (still permissive — server is authority).

Brief patch (`buildBriefPatchFromWorkspaceAnswers`, workspace-answers.ts:28): change `const questions = [card.question]` to `questions = card.type === "questions" ? card.questions : [card.question]`. The loop already iterates `questions[]` and applies each answer as decision+fact. Patch logic unchanged; only the array source now may hold >1.

Consumers needing a `type === "questions"` branch: `getWorkspaceComposerState`, `isFreshWorkspaceCard`, `hasAnsweredWorkspaceQuestion` (workspace-sync.ts); `activeQuestionKey` (WorkspaceShell:1002) becomes composite key from all `q.id` in the batch.

## Section 3 — Prompt + Independence Logic

`buildOneCallSystemPrompt` (preview.ts:676) — replace "EXACTLY ONE question per turn. Never batch.":

```
INTERVIEW DISCIPLINE — rounds of questions:
- Emit 1-3 questions per turn. Mixed modes (choice/text, single/multiple) OK in one batch.
- INDEPENDENCE GATE: batch ONLY questions whose answer does not change another
  question's framing, options, or whether it needs asking. If Q2 depends on Q1's
  answer, ask Q1 alone this turn; ask Q2 next turn.
- Cap 3 per batch. Server enforces.
- For EACH question set recommendedOptionLabel (your default) — user can accept in one click.
- Do not ask a field inferable from brief/chat. Walk the decision tree, resolve deepest
  dependency first.
- When all applicable fields filled/declined AND confidence 95+: emit build_recommendation
  instead of questions.
```

`discuss-system.md` — flip tone (grilling: relentless, max data early). Current: *"Ask only the ones applicable... No need to ask them all."* becomes: *"Be relentless — extract every applicable field, batching independent questions aggressively to reach 95% fast. Slightly annoying upfront is fine; 95% gate still protects build."*

New section in `discuss-system.md`:

```
# Rounds (multi-question batching)

Ask 1-3 independent questions per turn when possible. Independent = one answer
doesn't change another question's options or relevance. Dependent questions
stay single and sequential (next turn).

Example independent batch: [jam buka weekday?] [jam buka weekend?] [ada WhatsApp?]
Example dependent (single): [tampilin harga?] → only if "ya": [range harga?]

Always recommend a default per question. Max 3 per batch.
```

Reliability prompt tweak (`repairDiscussCardWithTool`, preview.ts:1020): add reminder "Call tool exactly once, with valid questions[] if independent batch or question if single."

Independence check is prompt-side only (AI decides). Server cannot validate dependency (semantic). Safeguard: premature answers don't auto-build (95% gate); AI re-asks next round if off. Benign worst case is one redundant turn.

## Section 4 — Reliability Fix (90% → ~99%)

All in `handleDiscussTurnOneCall`:

**Fix 1 — Re-prompt agent loop when AI forgets the tool (biggest win).** Today: stream ends, `toolInput` null → goes straight to `repairDiscussCardWithTool` (text-only context, forced `toolChoice`). One-shot repair. Change: use `maxSteps: 2` on the primary `streamText` with `toolChoice: "auto"`. The SDK continues a step if the AI produced chat text without calling the tool — giving the model a self-correct chance ("oh, forgot the tool"), matching Claude Code's agent-loop behavior.
- Not `toolChoice: "required"` — that forces a tool every turn, even when the turn should be chat-only (greeting, build handoff line).
- `maxSteps: 2` = 1 self-correct. Repair fallback still runs if the loop also misses.
- Caveat: `maxSteps` requires a tool result returned. `presentWorkspaceCard` is pure-present (no side effect), returns `{ workspaceCard }` — safe in a loop, no double-persist. Take the first valid tool call.

**Fix 2 — Repair attempts 2→3.** `DISCUSS_CARD_SEMANTIC_ATTEMPTS` (ai-timeouts.ts:16) 2→3. Deadline rises automatically (3×45s = 135s). More repair chances.

**Fix 3 — `maxRetries` primary 1→2.** preview.ts:734. Transient API error recovery. Cheap.

**Fix 4 — Fallback card without AI (no-stuck guarantee).** If primary + repair (Fix 1+2) all miss → today the user is stuck with `type:"none"`. Change: if `workspaceTurn.workspaceCard.type === "none"` after repair, the server builds a fallback from `getMissingBriefFields(brief)` (brief.ts:322) — a deterministic `type:"questions"` (or single `question`) card derived from empty fields, no AI. Each missing field → one `BriefQuestion` with sensible default options where applicable (e.g. mandatory `businessName` → text mode; `contact` → choice WhatsApp/phone/Instagram). Matches grilling's "if a fact can be found in the environment, don't ask the AI" — here the empty field is a fact derivable without AI. User always gets a clickable card; AI recovers next turn. Fallback is last-resort only, never preferred over AI.

## Section 5 — UI (WorkspacePrimitives + WorkspaceShell)

Add a new `QuestionsComposer` that wraps N stacked `QuestionComposer` blocks with one shared "Kirim semua" button at the bottom. `QuestionComposer` stays single-question (reused as-is for the batch blocks); `QuestionsComposer` owns the per-id state map and the aggregate submit. Chosen over extending `QuestionComposer` to keep the single-question component focused and avoid a dual-mode prop surface.

State per question (bound to `question.id`):
- `selected: Record<id, string[]>` (choice)
- `customAnswer: Record<id, string>` (text)
- `source: Record<id, "option"|"custom">`

Submit: collect answers per id. Empty → skip (not in payload). Call `onSubmit` with `WorkspaceAnswerPayload[]` of only filled items:
```ts
[{ questionId, question, answer, source }, ...]
```
`submitChatText(answer, { workspaceAnswers })` (WorkspaceShell:1693) already accepts `workspaceAnswers[]` — no change to the send path.

Fallback card (Fix 4) in UI: `type:"questions"` from missing fields renders the same as an AI batch. No special-case chrome.

`activeQuestionKey` (WorkspaceShell:1002) → composite: `questions.map(q => q.id).join("|")`. Resets composer state when the batch changes.

`composerState` `"question"` (workspace-sync.ts:129) handles `type:"questions"` too → state `"question"` (reuse, render the batch). `getWorkspaceComposerState` adds the branch.

`hasAnsweredWorkspaceQuestion` (workspace-sync.ts:136): for a batch, check the latest user message has a `Jawaban:` block for at least one question in the batch, or that a `workspaceAnswers` payload matched. MVP: match latest user text against any `q.question` in the batch → answered. Dedupe handles stale.

`isFreshWorkspaceCard` (workspace-sync.ts:341): add `questions` branch — fresh if the id set differs from previous.

Mobile: 3 stacked cards = scroll. Acceptable for pilot (HP-first, whitelist ~10 UMKM). No accordion collapse — flat list is simpler.

## Section 6 — Error Handling & Edge Cases

| Case | Behavior |
|---|---|
| Batch of 3, 1 Q invalid format | Per-Q validate drops invalid, keeps 2 valid → `type:"questions"` (or collapse to `question` if 1 remains). Turn continues. |
| All batch invalid → array 0 | `type:"none"` → repair (Fix 1+2) → still miss → Fix 4 fallback from missing fields. No stuck. |
| AI emits >3 | Server slices to 3. |
| Duplicate `id` in batch | Dedupe by id, keep first. |
| AI batches 2 dependent (logic error, format OK) | Not mechanically detected. Premature answer recorded in brief; 95% gate still guards build; AI re-asks next round if off. Benign. |
| Partial answer (3 batch, answers 1) | Empty Q not in patch. `buildBriefPatchFromWorkspaceAnswers` loops only items with answers. AI re-asks empty if material. |
| Answer cross-wires to wrong Q | Prevented in UI: bound per `question.id`, submit payload `{questionId, answer}`. Server matches by id in `parseWorkspaceAnswers`. |
| Tool call JSON fully broken | `normalizeWorkspaceTurn` → `type:"none"` → repair → fallback. Same as today. |
| Stored legacy card `type:"question"` | `parseWorkspaceCard` unchanged. Safe. |
| `maxSteps` loop calls tool twice | Tool is pure-present, no side effect. Take first valid tool call. Dedupe. |
| Transient API error | Fix 3 `maxRetries` 1→2. |
| Repair deadline timeout | `DISCUSS_CARD_SERVER_DEADLINE_MS` rises (Fix 2, 3×45s). AbortController aborts; fallback card. |

**No-regression guarantee:** every failure path today (`type:"none"`, repair, retry, persisted recovery) still runs. Rounds + reliability are **additive** — batching is an extra option; fixes strengthen existing paths. Worst case = AI falls back to single = status quo.

## Section 7 — Testing

Lazy senior — test only the non-trivial.

1. **`brief-flow.test.ts` — `normalizeWorkspaceCard` questions variant:**
   - valid 3 Q → `type:"questions"` 3 items.
   - 1 invalid → keep 2 valid.
   - array of 1 valid → collapse `type:"question"`.
   - array of 0 valid → `type:"none"`.
   - dup id → dedupe.
   - >3 → slice to 3.

2. **`workspace-answers.test.ts` — `buildBriefPatchFromWorkspaceAnswers` multi:**
   - batch 3 answers → 3 decisions+facts.
   - partial (2 answers) → 2 patches.
   - matches by `questionId`.

3. **`brief.ts` type self-check** — assert `WorkspaceCard` variant compiles (TS guard).

Not tested: two-phase path (untouched), `WorkspaceCardView` (behavior unchanged), prompt independence (semantic, untestable), reliability 99% (observability via existing `writeAiRequestLog` `primaryToolFailed` field; add `fallbackUsed` flag following the same pattern). Stories: add a `questions` fixture to `WorkspaceDecisionCards.stories.tsx` (optional, one file).

## Section 8 — Blast Radius + Rollout

~10 files, most 1–5 line diffs:

| File | Change |
|---|---|
| `src/lib/projects/brief.ts` | Add `type:"questions"` variant. |
| `src/lib/projects/brief-flow.ts` | `normalizeWorkspaceCard` validate `questions[]` (per-Q, dedupe, cap 3, collapse 1→`question`). |
| `src/lib/projects/workspace-answers.ts` | `questions = card.type==="questions" ? card.questions : [card.question]`. |
| `src/lib/projects/workspace-sync.ts` | `getWorkspaceComposerState`, `isFreshWorkspaceCard`, `hasAnsweredWorkspaceQuestion` add `questions` branch. |
| `src/lib/projects/prompts/discuss-system.md` | Flip tone relentless + Rounds section. |
| `src/routes/api.projects.preview.ts` | Batch prompt rules (buildOneCallSystemPrompt), Fix 1 `maxSteps`, Fix 3 `maxRetries`, Fix 4 fallback card, tool schema `questions` widened. |
| `src/lib/ai-timeouts.ts` | Fix 2 `DISCUSS_CARD_SEMANTIC_ATTEMPTS` 2→3. |
| `src/components/projects/WorkspacePrimitives.tsx` | Add `QuestionsComposer` wrapping N `QuestionComposer`; composite submit. |
| `src/components/projects/WorkspaceShell.tsx` | `activeQuestionKey` composite, `composerState` branch. |
| `src/lib/projects/brief-flow.test.ts` + `workspace-answers.test.ts` | Tests 1+2. |
| `src/stories/WorkspaceDecisionCards.stories.tsx` | `questions` fixture (optional). |

**Rollout:** existing flag `isDiscussOneCallToolsEnabled()` gates the path. Default on in non-prod (config.ts:31). Production via env `DISCUSS_ONE_CALL_TOOLS`. No new rounds flag — once the one-call path is on, rounds + reliability ship together. To revert rounds only, prompt changes are the lever; reliability fixes are safe to keep unconditionally.

## Out of Scope (YAGNI)

- Rounds in the two-phase legacy path — untouched, stays single.
- Stored migration of legacy `question` cards — `parseWorkspaceCard` handles both; no backfill.
- Server-side dependency validation — semantic, not feasible; prompt + benign worst case suffice.
- Accordion/progressive disclosure UI for batch — flat list simpler; revisit if pilot shows scroll fatigue.
- Telemetry dashboard for 99% target — `writeAiRequestLog` fields (`primaryToolFailed`, new `fallbackUsed`) are enough; query later if needed.
