# Discuss Readiness Implementation Plan — Part 2

**Continues:** `2026-08-04-discuss-readiness-implementation.md`

## Task 4. Worker enforcement

File: `src/lib/projects/discuss-turn-worker.ts`

### 4.1 Import evaluator and field-state helpers

```ts
import { evaluateDiscussReadiness } from "./discuss-readiness";
import { recordFieldDecline } from "./chat-memory";
```

### 4.2 Add impatience detector

Reuse any existing normalized-user-message helper. If none exists, add the smallest local pure function:

```ts
const BUILD_NOW_PATTERNS = [
  /langsung (?:bangun|build)/i,
  /build (?:aja|sekarang)/i,
  /udah cukup/i,
  /cukup dulu/i,
] as const;

function requestsImmediateBuild(text: string): boolean {
  return BUILD_NOW_PATTERNS.some((pattern) => pattern.test(text));
}
```

Do not classify generic affirmative answers (`ya`, `oke`) as impatience.

### 4.3 Gate build recommendations

Immediately after workspace turn resolution, before `assistantMessage` and `safeMessages` construction:

```ts
if (
  project.generationEngine === "legacy-v1" &&
  workspaceTurn.workspaceCard.type === "build_recommendation"
) {
  const readiness = evaluateDiscussReadiness({
    brief: workspaceTurn.brief,
    fieldState: workspaceTurn.brief.fieldState ?? {},
    umkmType: workspaceTurn.brief.umkmType,
  });

  if (readiness.state === "needs_question") {
    const latestUserText = getLatestUserText(messages);

    if (requestsImmediateBuild(latestUserText)) {
      const skipped = readiness.blockers.reduce(
        (state, blocker) =>
          recordFieldDecline(state, blocker.fieldId),
        workspaceTurn.brief.fieldState ?? {},
      );

      workspaceTurn = {
        ...workspaceTurn,
        brief: {
          ...workspaceTurn.brief,
          fieldState: skipped,
          readyForBuild: true,
        },
      };
      chatText = buildEarlyBuildWarning(readiness.blockers);
    } else {
      workspaceTurn = {
        ...workspaceTurn,
        brief: {
          ...workspaceTurn.brief,
          readyForBuild: false,
        },
        workspaceCard: buildReadinessQuestion(readiness.nextFieldId),
      };
      chatText = buildReadinessQuestionIntro(readiness.nextFieldId);
    }

    await writeAiRequestLog({
      event: "discuss:gate",
      projectId: project.id,
      turnId,
      blockers: readiness.blockers.map((blocker) => blocker.fieldId),
    });
  }
}
```

Adapt to the actual `writeAiRequestLog` schema rather than widening its event type blindly. If it does not accept arbitrary blocker metadata, use the existing structured details field.

### 4.4 Add deterministic question registry

Do not ask the model to generate the corrective question after rejecting its card. Use one local record keyed by field ID:

```ts
const READINESS_QUESTIONS: Record<
  StructuralFieldId,
  { question: string; answerMode: "choice" | "text"; options: BriefQuestion["options"] }
> = {
  contact: {
    question: "Nomor WhatsApp atau telepon apa yang bisa pelanggan hubungi?",
    answerMode: "text",
    options: [],
  },
  visuals: {
    question: "Kamu sudah punya foto produk, atau aku buat desain yang fokus ke teks?",
    answerMode: "choice",
    options: [
      { label: "Sudah punya foto", description: "Pakai layout yang menonjolkan foto asli" },
      { label: "Belum punya foto", description: "Pakai layout tipografis dengan placeholder lokal" },
    ],
  },
  address: {
    question: "Alamat lengkap usaha kamu di mana?",
    answerMode: "text",
    options: [],
  },
  hours: {
    question: "Jam buka dan hari operasionalnya bagaimana?",
    answerMode: "text",
    options: [],
  },
  deliveryArea: {
    question: "Area pengiriman atau layanan kamu sampai mana?",
    answerMode: "text",
    options: [],
  },
  targetCustomer: {
    question: "Pelanggan utama yang paling ingin kamu tarik siapa?",
    answerMode: "text",
    options: [],
  },
  secondaryCta: {
    question: "Selain tindakan utama, pelanggan sebaiknya bisa melakukan apa?",
    answerMode: "text",
    options: [],
  },
};
```

Only include fields that are truly structural. Do not include cosmetic fields in this registry.

### 4.5 Honest warning format

Keep one sentence and avoid percentages:

```ts
function buildEarlyBuildWarning(blockers: DiscussBlocker[]): string {
  const labels = blockers
    .map((blocker) => READINESS_FIELD_LABELS[blocker.fieldId])
    .filter(Boolean)
    .slice(0, 4);
  const suffix = blockers.length > 4 ? " dan beberapa detail lain" : "";
  return `Oke, aku bangun sekarang; tanpa ${formatIndonesianList(labels)}${suffix}, bagian terkait akan dibuat umum atau dikosongkan dulu.`;
}
```

The warning must not claim the site is complete or at 95%.

### 4.6 Tests

Extend `src/lib/projects/discuss-turn-worker.test.ts`:

1. Legacy-v1 premature recommendation becomes a question.
2. `readyForBuild` becomes false when demoted.
3. `nextFieldId` determines question ID.
4. "langsung bangun aja" preserves recommendation, writes warning, marks blockers declined.
5. Contract-v1 behavior remains unchanged.
6. Ordinary "ya" does not activate impatience path.

Run:

```bash
bun test src/lib/projects/discuss-turn-worker.test.ts
```

## Task 5. Field-state recording

The gate cannot work if state only persists but never changes.

### 5.1 Record questions

When persisting a `question` card, map its question ID to a `SoftFieldId`. Reuse exact IDs where possible. Add a narrow parser:

```ts
function asSoftFieldId(value: string): SoftFieldId | null {
  return SOFT_FIELDS.includes(value as SoftFieldId)
    ? (value as SoftFieldId)
    : QUESTION_ID_TO_FIELD[value] ?? null;
}
```

On emitted question:

```ts
const askedField = asSoftFieldId(workspaceTurn.workspaceCard.question.id);
if (askedField) {
  workspaceTurn.brief.fieldState = recordFieldAsk(
    workspaceTurn.brief.fieldState ?? {},
    askedField,
  );
}
```

### 5.2 Record answers and explicit skips

Before resolving the next model output, inspect the previous active question plus latest user response:

- Explicit skip button/value → `recordFieldDecline`.
- Clear empty answer (`ga ada`, `tidak ada`, `belum ada`) → `recordFieldEmpty` only when semantically empty, not when "belum ada foto" selects typographic media strategy. For `visuals`, store `visuals: false` and `answered`.
- Any non-empty response to known previous question → `recordFieldAnswer` after validator accepts the corresponding brief value.

Prefer structured choice metadata over text matching. Text matching is fallback only.

### 5.3 Tests

Extend `chat-memory.test.ts` or worker tests:

- Asked question persists `asked`.
- Valid answer transitions to `answered`.
- Skip transitions to `declined`.
- `answered` cannot regress to `declined`.
- `visuals=false` counts as answered, not empty.

## Task 6. Prompt cleanup

### 6.1 Canonical prompt

File: `src/lib/projects/prompts/discuss-system.md`

Delete the early-build paragraph. Replace confidence section with:

```md
# Build readiness

Keep asking one relevant question per turn until every structural decision is answered or explicitly skipped. Structural decisions determine page structure, CTA behavior, location/operations sections, media strategy, and visual direction.

Do not expose confidence percentages, field counts, or readiness metrics to the user. Never say the information is sufficient while unresolved structural decisions remain. The server authorizes the build recommendation; model confidence does not.

Probe a vague answer once. Accept explicit skips, record the tradeoff, and continue. If the user explicitly asks to build now, give one honest warning that unresolved areas will be generic or omitted, then recommend building.
```

Keep the no-hallucination section unchanged.

### 6.2 One-call prompt

File: `src/lib/projects/discuss-tool.ts`

Delete:

- mandatory + 2 soft → build recommendation
- confidence 95+ / basics known
- "Build early"

Replace with:

```text
- Keep asking the single highest-impact unresolved structural question.
- Use build_recommendation only when the brief has no unresolved structural decisions, or after the user explicitly accepts an honest early-build warning.
- Never expose confidence percentages or field-count metrics to the user.
```

Update `buildCardSystemPrompt` with the same rule. Remove conflicting "confidence 95+ / basics known" wording.

### 6.3 Preview prompt

File: `src/routes/api.projects.preview.ts`

Change the opening role from "fast" discovery to a concise consultant. Delete mandatory + 2 soft rule. Replace final build copy requirement with conditional language:

```text
- Recommend building only after structural decisions are resolved or explicitly skipped.
- When ready, say: "Sip, arahnya sudah jelas. Yuk kita bangun."
```

### 6.4 Prompt tests

Update `src/lib/projects/prompts/discuss-system.test.ts` and relevant `discuss-tool` tests:

- Contains "structural" readiness rule.
- Contains server authorization language.
- Does not contain "mandatory fields plus at least 2 soft fields".
- Does not contain "Build early".
- Does not require displaying 95% to user.

## Task 7. Build-decision flags

File: `src/lib/projects/build-decisions.ts`

Set:

```ts
media_strategy.blocksReadiness = true;
visual_preference.blocksReadiness = true;
```

Keep existing skip policies unless contract-readiness tests prove a conflict. Add/update tests in `build-decisions.test.ts` to assert both block readiness.

## Task 8. Image strategy wiring

The placeholder solves rendering, but planner must stop hardcoding media strategy.

File: `src/lib/projects/build-planner.ts`

Derive strategy from brief/contract facts available to the planner:

```ts
function resolveImageStrategy(contract: BuildContractV1): BuildPlanV1["artDirection"]["imageStrategy"] {
  if (contract.assets.some((asset) => asset.kind === "image")) {
    return "owner_assets";
  }
  return "typographic";
}
```

If the contract has no assets collection, use the existing media decision representation. Do not invent a new asset model in this task.

Rules:

- Explicit uploaded owner assets → `owner_assets`.
- Explicit no photos → `typographic`.
- Unknown/skipped → `typographic`.
- `graphic` remains unused until a real graphic-generation pipeline exists. Do not claim generated graphics exist.

Update `build-planner.test.ts`:

- Owner image asset → owner_assets.
- No images → typographic.
- Unknown → typographic.

## Task 9. Integration coverage

Extend `tests/integration/discussion-readiness.test.ts`:

```ts
it("keeps asking structural questions before build");
it("does not block online service on address");
it("requires primary offer when multiple offers exist");
it("accepts explicit skip as resolved omission");
it("allows early build after one warning");
it("does not expose percentages or counts in user copy");
it("selects typographic strategy when photos are unavailable");
```

Use existing fixtures and worker harness. Do not build a second fake pipeline.

## Task 10. Documentation updates

Update `DEV.md` discuss-flow section:

- Field state stored inside `Project.brief` JSON; no migration.
- Legacy-v1 build recommendations pass deterministic readiness gate.
- Explicit early-build requests receive one warning then proceed.
- Placeholder image is `/placeholder.svg`, bundled in every generated app.
- Media strategy defaults typographic without owner images.

If product behavior copy changes, update `PRODUCT.md` only where the interview promise is described. Avoid duplicating implementation details there.

## Verification Sequence

During implementation, run nearest tests after each task. Before handoff:

```bash
bun test src/lib/projects/scaffold/scaffold.test.ts
bun test src/lib/projects/custom-source-generator.test.ts
bun test src/lib/projects/brief.test.ts
bun test src/lib/projects/chat-memory.test.ts
bun test src/lib/projects/discuss-readiness.test.ts
bun test src/lib/projects/discuss-turn-worker.test.ts
bun test src/lib/projects/build-decisions.test.ts
bun test src/lib/projects/build-planner.test.ts
bun test tests/integration/discussion-readiness.test.ts
bun run check
```

Do not run `bun run build`; changes do not touch deployment/build behavior per repository policy. Run `bun run verify` before handoff if requested or if `bun run check` exposes cross-suite uncertainty.

## Implementation Order

1. Phase 1 scaffold test → placeholder asset → generator prompt test → implementation.
2. Phase 1 focused verification.
3. Brief type tests → `umkmType` and field-state persistence.
4. Readiness evaluator tests → evaluator.
5. Worker tests → gate and impatience path.
6. Prompt tests → prompt cleanup.
7. Decision/planner tests → image strategy wiring.
8. Integration tests.
9. Docs.
10. `bun run check`.

## Definition of Done

- No blank image slots when no owner photo exists; local `/placeholder.svg` renders under current CSP.
- Structural unanswered fields prevent legacy-v1 build recommendation.
- Field state persists across queued and direct preview paths.
- Explicit "build now" receives one honest warning then proceeds.
- No user-facing percentages, answered counts, or readiness metrics.
- No invented contact, address, hours, photos, or claims.
- Focused tests and `bun run check` pass.
