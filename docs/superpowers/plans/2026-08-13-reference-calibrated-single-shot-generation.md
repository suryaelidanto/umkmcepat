# Reference-Calibrated Single-Shot Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the visually fixed contract route with a reference-calibrated, executable-kit writer that normally uses one streamed writer call, one mandatory visual-review call, zero model tool calls, and no correction; the entire attempt may use at most one shared correction.

**Architecture:** Compile immutable owner facts into a V2 writer contract, select one of five executable design kits derived from accepted references 01/02/03/04/07, copy its portable primitives into the locked scaffold, and request one `<design-plan>` plus complete `<file>` response. A narrow pipeline runs source/theme/build/browser gates and one visual review, enforcing one shared correction ledger and preserving last-known-good state. A real 12-case × 2-trial evaluator and blind owner comparison must pass before replacement rollout.

**Tech Stack:** Bun, TypeScript, Vitest, AI SDK `streamText`/`generateText`, Vite, React 19, TanStack Router hash history, Tailwind CSS v4, shadcn/ui, Playwright Core, BullMQ, PostgreSQL/Prisma, private S3-compatible evidence storage.

## Global Constraints

- This plan implements `docs/superpowers/specs/2026-08-13-reference-calibrated-single-shot-generation-design.md`; do not reinterpret its call budgets or visual labels.
- Gallery references 01, 02, 03, 04, and 07 are positive visual evidence. Every other recovered route is negative evidence.
- Positive labels do not authorize copying facts, identity, CTA text, prices, contacts, claims, or placeholder behavior.
- Preserve response-text `<design-plan>`, `<file>`, and `<done>` generation; do not add model-native tools, shell actions, or unrestricted file actions.
- Normal path: exactly 1 writer call, 1 critic call, 0 correction calls, and 0 tool calls.
- Attempt maximum: exactly 1 writer call, at most 1 critic call, at most 1 shared correction call, and 0 tool calls.
- AI SDK `maxRetries` is `0` at writer, critic, and correction call sites. A retry is a correction and must consume the shared correction budget.
- Do not accept an unreviewed repair for broad business fit, genericness, tone, or composition findings.
- New no-asset output uses `graphic` or `typographic` media mode and contains zero placeholder images or empty photo frames.
- Keep accepted owner facts immutable; never fabricate prices, stock, contacts, locations, hours, testimonials, awards, certifications, guarantees, regulated claims, or capabilities.
- Keep platform-owned content/theme/primitive/package/config/runtime files protected.
- Generated customer copy is Indonesian; code, prompts, tests, logs, and docs are English.
- Keep generated output standalone and portable; selected kit primitives are copied into the generated project.
- No new dependency unless a separate approved decision proves existing TypeScript/Bun/Playwright capabilities insufficient.
- No `any`, `as any`, `ts-ignore`, hidden fallback success, silent critic pass, open-ended retry, or tracked private artifact.
- Do not modify preserved `.data/project-build-workspaces` fixtures. Runtime benchmark output stays under ignored `.data/generation-evaluation/`.
- Every behavior task follows red-green TDD and ends with focused tests.
- Do not enable replacement rollout until Task 9's 24-trial report and blind owner gate pass.
- Run `bun run check` before handoff. Run root `bun run build` only in Task 10 because build/deployment orchestration changes.

---

## File Structure

### New focused modules

- `src/lib/projects/generated-site-reference-corpus.ts` — validates the tracked positive/negative label manifest without loading private screenshots.
- `src/lib/projects/generated-site-reference-corpus.test.ts` — exact count/hash/label regression tests.
- `fixtures/generation-evaluation/visual-reference-labels.json` — public hashes and extracted traits for five positives plus aggregate negative counts.
- `src/lib/projects/generated-site-call-budget.ts` — single authority for writer/critic/correction call consumption.
- `src/lib/projects/generated-site-call-budget.test.ts` — duplicate-call and correction-reason exhaustion tests.
- `src/lib/projects/generated-site-quality-proof.ts` — V2 proof types, timing/output fields, and sanitization.
- `src/lib/projects/generated-site-quality-proof.test.ts` — proof invariants and private-field removal.
- `src/lib/projects/generated-site-design-kits/types.ts` — kit ID is introduced with proof types, then expanded into kit/pattern/theme/rubric contracts.
- `src/lib/projects/generated-site-design-plan.ts` — V2 writer-plan type and strict value validation shared by theme and stream parsing.
- `src/lib/projects/generated-site-design-plan.test.ts` — enum, palette, size, and expected-contract validation.
- `src/lib/projects/generated-site-design-kits/catalog.ts` — five concrete versioned kits and deterministic selection.
- `src/lib/projects/generated-site-design-kits/catalog.test.ts` — compatibility, reference, diversity, and executability tests.
- `src/lib/projects/scaffold/generated-site-primitives.ts` — portable layout-primitive source files selected by kit.
- `src/lib/projects/scaffold/generated-site-primitives.test.ts` — source safety, exports, and standalone compilation tests.
- `src/lib/projects/generated-site-theme.ts` — validates plan palette and recompiles protected semantic theme files.
- `src/lib/projects/generated-site-theme.test.ts` — palette policy, contrast, deterministic CSS, and no-default-collapse tests.
- `src/lib/projects/generated-site-pipeline.ts` — narrow injected-dependency orchestrator from accepted handoff to qualified files/dist/proof.
- `src/lib/projects/generated-site-pipeline.test.ts` — call order, correction paths, evidence, and honest-failure tests.
- `scripts/run-generated-site-benchmark.ts` — executes control/treatment generation, build, browser, critic, and sanitized results.
- `scripts/create-generated-site-blind-review.ts` — randomizes control/treatment pairs into private review HTML and mapping.

### Existing modules to modify

- `src/lib/projects/generated-site-contract.ts` / `.test.ts` — preserve V1 readers and add V2 writer-contract compilation.
- `src/lib/projects/generated-site-recipes.ts` / `.test.ts` — compatibility adapter only; primary selection moves to executable kits.
- `src/lib/projects/site-schema.ts` / `.test.ts` — stop applying the universal default theme to V2 candidates.
- `src/lib/projects/scaffold/vite-tanstack-shadcn-starter.ts` / scaffold tests — seed selected portable primitives and writable manifest.
- `src/lib/projects/scaffold/shadcn-theme.ts` / `.test.ts` — accept validated V2 palette inputs and return contrast evidence.
- `src/lib/projects/batched-response.ts` / `.test.ts` — strict `WriterDesignPlanV2` parsing.
- `src/lib/projects/batched-prompt.ts` / `.test.ts` — one kit-grounded compact writer/correction prompt; remove dead competing paths.
- `src/lib/projects/batched-generator.ts` / `.test.ts` / truncated-retry test — restore the real contract writer and replace independent retry loops with one correction.
- `src/lib/projects/generated-site-gates.ts` / `.test.ts` — kit, reference, palette, fixed-renderer, fact, and media checks.
- `src/lib/projects/generated-site-risk.ts` / `.test.ts` — evidence only; remove deterministic-source immunity.
- `src/lib/projects/visual-critic.ts` / `.test.ts` — one mandatory reference-aware review call and verification-mode findings.
- `src/lib/projects/generated-site-qualification.ts` / `.test.ts` — integrate one critic and eligible post-review correction without a second critic.
- `src/lib/projects/candidate-qualification.ts` / `.test.ts` — remove independent compile/browser/visual model-call budgets from the v2 path.
- `src/lib/projects/build-attempt-worker.ts` / batched worker tests — delegate policy to `runGeneratedSitePipeline` while retaining lifecycle/persistence authority.
- `src/lib/projects/generated-starter.ts` / generated-source tests — persist V2 proof.
- `src/lib/projects/generation-observability.ts` / `.test.ts` — call counts, stage timings, kit, findings, and sanitized outcome.
- `src/lib/projects/generation-evaluation.ts` / `.test.ts` — V3 real-run metrics and conjunctive release gates.
- `scripts/run-generation-evaluation.ts` — report V3 runtime results and blind preference input.
- `fixtures/generation-evaluation/manifest.json` and `briefs/*.json` — complete executable synthetic handoff inputs.
- `src/lib/app-settings-registry.ts` / settings/API tests — disabled-by-default v2 and shadow switches.
- `package.json` — benchmark, blind-review, and report commands using Bun.
- `DESIGN.md`, `DEV.md`, `docs/superpowers/README.md` — canonical generated-site architecture and operating workflow.

---

### Task 1: Freeze the Owner-Labeled Reference Corpus

**Files:**
- Create: `fixtures/generation-evaluation/visual-reference-labels.json`
- Create: `src/lib/projects/generated-site-reference-corpus.ts`
- Create: `src/lib/projects/generated-site-reference-corpus.test.ts`

**Interfaces:**

```ts
export type GeneratedSiteVisualReferenceLabelV1 = {
  gallery: "01" | "02" | "03" | "04" | "07";
  verdict: "accepted";
  routeSha256: string;
  desktopSha256: string;
  mobileSha256: string;
  family:
    | "editorial-airy"
    | "menu-led-editorial"
    | "catalog-story"
    | "warm-commerce"
    | "bold-typographic";
  traits: string[];
  unsafeToCopy: string[];
};

export type GeneratedSiteVisualReferenceCorpusV1 = {
  schemaVersion: 1;
  accepted: GeneratedSiteVisualReferenceLabelV1[];
  rejectedVisibleCount: 28;
  technicalNegativeCount: 6;
};

export function parseGeneratedSiteVisualReferenceCorpus(
  value: unknown,
): GeneratedSiteVisualReferenceCorpusV1;
```

- [ ] **Step 1: Write the failing exact-label test**

```ts
import corpusJson from "../../../fixtures/generation-evaluation/visual-reference-labels.json";
import { parseGeneratedSiteVisualReferenceCorpus } from "./generated-site-reference-corpus";

it("freezes the product owner's five accepted gallery labels", () => {
  const corpus = parseGeneratedSiteVisualReferenceCorpus(corpusJson);
  expect(corpus.accepted.map((item) => item.gallery)).toEqual([
    "01",
    "02",
    "03",
    "04",
    "07",
  ]);
  expect(corpus.rejectedVisibleCount).toBe(28);
  expect(corpus.technicalNegativeCount).toBe(6);
});
```

- [ ] **Step 2: Run the test and verify failure**

```bash
bunx vitest run --project unit src/lib/projects/generated-site-reference-corpus.test.ts
```

Expected: FAIL because the manifest and parser do not exist.

- [ ] **Step 3: Add the exact accepted hash records**

Use the five full hashes from the architecture audit. Set families in gallery order:

```json
[
  "editorial-airy",
  "menu-led-editorial",
  "catalog-story",
  "warm-commerce",
  "bold-typographic"
]
```

Each `traits` array must contain the audit's concrete hierarchy/type/palette/rhythm/mobile observations. Each `unsafeToCopy` array must explicitly name factual copy, contacts/prices, reference identity, placeholder treatment where present, and English CTA text where present.

- [ ] **Step 4: Implement strict unknown narrowing**

Reject unknown gallery labels, duplicate hashes, non-64-character lowercase SHA-256 values, missing traits, any verdict other than `accepted`, or counts other than 28/6. Do not read `.data` or `/tmp` from production code.

- [ ] **Step 5: Add a test that labels cannot be silently broadened**

```ts
it("rejects an unapproved sixth positive", () => {
  expect(() =>
    parseGeneratedSiteVisualReferenceCorpus({
      ...corpusJson,
      accepted: [...corpusJson.accepted, { ...corpusJson.accepted[0], gallery: "05" }],
    }),
  ).toThrow("unapproved generated-site visual reference");
});
```

- [ ] **Step 6: Run focused tests**

```bash
bunx vitest run --project unit src/lib/projects/generated-site-reference-corpus.test.ts
git diff --check
```

Expected: PASS; zero diff errors.

- [ ] **Step 7: Commit**

```bash
git add fixtures/generation-evaluation/visual-reference-labels.json src/lib/projects/generated-site-reference-corpus.ts src/lib/projects/generated-site-reference-corpus.test.ts
git commit -m "test(generation): freeze visual reference labels"
```

### Task 2: Establish One Model-Call Ledger and V2 Quality Proof

**Files:**
- Create: `src/lib/projects/generated-site-call-budget.ts`
- Create: `src/lib/projects/generated-site-call-budget.test.ts`
- Create: `src/lib/projects/generated-site-design-kits/types.ts`
- Create: `src/lib/projects/generated-site-quality-proof.ts`
- Create: `src/lib/projects/generated-site-quality-proof.test.ts`
- Modify: `src/lib/projects/generation-observability.ts`
- Modify: `src/lib/projects/generation-observability.test.ts`

**Interfaces:**

```ts
export type GeneratedSiteDesignKitId =
  | "editorial-airy"
  | "menu-led-editorial"
  | "catalog-story"
  | "warm-commerce"
  | "bold-typographic";

export type GeneratedSiteModelLeg = "writer" | "critic" | "correction";
export type GeneratedSiteCorrectionReason =
  | "transport"
  | "response_contract"
  | "source_gate"
  | "build"
  | "browser"
  | "visual_machine_verifiable";

export type GeneratedSiteCallBudgetSnapshot = {
  writerCalls: 0 | 1;
  criticCalls: 0 | 1;
  correctionCalls: 0 | 1;
  correctionReason: GeneratedSiteCorrectionReason | null;
};

export class GeneratedSiteCallBudget {
  consumeWriter(): void;
  consumeCritic(): void;
  consumeCorrection(reason: GeneratedSiteCorrectionReason): void;
  snapshot(): GeneratedSiteCallBudgetSnapshot;
}
```

`GeneratedSiteQualityProofV2` matches the companion spec exactly.

- [ ] **Step 1: Write failing budget tests**

```ts
it("permits one writer, one critic, and one correction", () => {
  const budget = new GeneratedSiteCallBudget();
  budget.consumeWriter();
  budget.consumeCritic();
  budget.consumeCorrection("source_gate");
  expect(budget.snapshot()).toEqual({
    writerCalls: 1,
    criticCalls: 1,
    correctionCalls: 1,
    correctionReason: "source_gate",
  });
});

it.each(["writer", "critic", "correction"] as const)(
  "rejects a second %s call",
  (leg) => {
    const budget = new GeneratedSiteCallBudget();
    const consume = {
      writer: () => budget.consumeWriter(),
      critic: () => budget.consumeCritic(),
      correction: () => budget.consumeCorrection("transport"),
    }[leg];
    consume();
    expect(consume).toThrow(`generated-site ${leg} call budget exhausted`);
  },
);
```

- [ ] **Step 2: Run tests and verify failure**

```bash
bunx vitest run --project unit src/lib/projects/generated-site-call-budget.test.ts src/lib/projects/generated-site-quality-proof.test.ts
```

Expected: FAIL because both modules are absent.

- [ ] **Step 3: Implement the explicit ledger**

Use three private integer fields initialized to zero. Increment only after checking the value is zero. `consumeCorrection` stores the first reason and throws before changing state on any later call. Do not add reset/refund behavior.

- [ ] **Step 4: Implement V2 proof construction and sanitization**

Export:

```ts
export function createEmptyGeneratedSiteQualityProofV2(input: {
  contractHash: string;
  planHash: string;
  kitId: GeneratedSiteDesignKitId;
  mediaMode: "owner_assets" | "graphic" | "typographic";
}): GeneratedSiteQualityProofV2;

export function sanitizeGeneratedSiteQualityProofV2(
  value: GeneratedSiteQualityProofV2,
): GeneratedSiteQualityProofV2;
```

Initialize unrun gates to `not_run`, timings/counts to zero, and outcome to `fail` until final qualification. Sanitization copies only the declared fields and validates call counts against the ledger limits.

- [ ] **Step 5: Add proof invariant tests**

Assert a proof with `writerCalls: 2`, `criticCalls: 2`, `correctionCalls: 2`, a screenshot URL, prompt, phone number, or business copy is rejected/dropped. Assert `outcome: "pass"` is invalid unless every required gate is `pass` and critical/high counts are zero.

- [ ] **Step 6: Extend sanitized telemetry**

Add only:

```ts
writerCalls?: number;
criticCalls?: number;
correctionCalls?: number;
correctionReason?: string;
kitId?: string;
kitVersion?: number;
criticalFindings?: number;
highFindings?: number;
writerMs?: number;
criticMs?: number;
totalToDecisionMs?: number;
editableBytes?: number;
firstFileClosedMs?: number;
```

Test that prompts, screenshots, evidence refs, content, contacts, and palette values never appear.

- [ ] **Step 7: Run focused tests**

```bash
bunx vitest run --project unit \
  src/lib/projects/generated-site-call-budget.test.ts \
  src/lib/projects/generated-site-quality-proof.test.ts \
  src/lib/projects/generation-observability.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/projects/generated-site-call-budget.ts src/lib/projects/generated-site-call-budget.test.ts src/lib/projects/generated-site-design-kits/types.ts src/lib/projects/generated-site-quality-proof.ts src/lib/projects/generated-site-quality-proof.test.ts src/lib/projects/generation-observability.ts src/lib/projects/generation-observability.test.ts
git commit -m "feat(generation): add bounded model call ledger"
```

### Task 3: Replace Prose Recipes with Five Executable Design Kits

**Files:**
- Modify: `src/lib/projects/generated-site-design-kits/types.ts`
- Create: `src/lib/projects/generated-site-design-kits/catalog.ts`
- Create: `src/lib/projects/generated-site-design-kits/catalog.test.ts`
- Create: `src/lib/projects/scaffold/generated-site-primitives.ts`
- Create: `src/lib/projects/scaffold/generated-site-primitives.test.ts`
- Modify: `src/lib/projects/generated-site-recipes.ts`
- Modify: `src/lib/projects/generated-site-recipes.test.ts`
- Modify: `src/lib/projects/scaffold/vite-tanstack-shadcn-starter.ts`
- Modify: `src/lib/projects/scaffold/scaffold.test.ts`

**Interfaces:**

Use `GeneratedSiteDesignKitV1` from the spec and produce:

```ts
export type GeneratedSiteKitSelectionInput = {
  archetype: string;
  density: "sparse" | "regular" | "rich";
  mediaMode: "owner_assets" | "graphic" | "typographic";
  primaryJobKind: "browse" | "compare" | "inquire" | "book" | "visit";
  hasOperationalDetails: boolean;
};

export function deriveGeneratedSiteKitSelectionInput(input: {
  handoff: AcceptedBuildHandoff;
  briefSnapshot: ProjectBriefV2;
  photoEnabled: boolean;
}): GeneratedSiteKitSelectionInput;

export function selectGeneratedSiteDesignKit(
  input: GeneratedSiteKitSelectionInput,
): GeneratedSiteDesignKitV1;

export function createGeneratedSitePrimitiveFiles(
  kit: GeneratedSiteDesignKitV1,
): GeneratedProjectFile[];
```

Portable primitive exports are fixed:

```ts
// src/components/site/layout.tsx in generated projects
export function SiteSection(props: {
  children: React.ReactNode;
  density?: "compact" | "regular" | "airy";
  surface?: "base" | "muted" | "contrast";
  width?: "reading" | "content" | "wide";
  id?: string;
  className?: string;
}): React.ReactElement;

export function SiteStack(props: {
  children: React.ReactNode;
  gap?: "sm" | "md" | "lg" | "xl";
  className?: string;
}): React.ReactElement;

export function SiteSplit(props: {
  children: React.ReactNode;
  emphasis?: "equal" | "leading" | "trailing";
  className?: string;
}): React.ReactElement;

export function SiteCluster(props: {
  children: React.ReactNode;
  justify?: "start" | "center" | "between";
  className?: string;
}): React.ReactElement;
```

- [ ] **Step 1: Write failing kit-catalog tests**

Assert the catalog contains exactly:

```ts
[
  "editorial-airy",
  "menu-led-editorial",
  "catalog-story",
  "warm-commerce",
  "bold-typographic",
]
```

Assert each kit has one of the approved reference labels, at least two composition patterns, non-empty source/browser assertions, non-empty critic rubric, and compatible media/density sets.

- [ ] **Step 2: Add deterministic selection-projection and catalog cases**

Test `deriveGeneratedSiteKitSelectionInput()` against sparse, rich-product, operational-menu, approved-asset, and no-asset handoffs. Equal inputs must produce equal selection traits without customer copy. Then test catalog selection:

```ts
it.each([
  [{ archetype: "fnb-menu", density: "rich", mediaMode: "typographic", primaryJobKind: "browse", hasOperationalDetails: true }, "menu-led-editorial"],
  [{ archetype: "retail-catalog", density: "rich", mediaMode: "owner_assets", primaryJobKind: "compare", hasOperationalDetails: false }, "catalog-story"],
  [{ archetype: "retail", density: "regular", mediaMode: "graphic", primaryJobKind: "browse", hasOperationalDetails: true }, "warm-commerce"],
  [{ archetype: "service-area", density: "sparse", mediaMode: "typographic", primaryJobKind: "inquire", hasOperationalDetails: false }, "editorial-airy"],
  [{ archetype: "generic", density: "sparse", mediaMode: "graphic", primaryJobKind: "inquire", hasOperationalDetails: false }, "bold-typographic"],
] as const)("selects a compatible executable kit", (input, expected) => {
  expect(selectGeneratedSiteDesignKit(input).id).toBe(expected);
});
```

- [ ] **Step 3: Add the executability regression**

For each kit, assert its ID affects four fingerprints:

```ts
expect({
  primitives: primitiveFingerprint(kit),
  prompt: promptFingerprint(kit),
  sourceAssertions: kit.sourceAssertions,
  criticRubric: kit.criticRubric,
}).not.toEqual(referenceFingerprintFromAnotherKit);
```

The test must fail if a future agent changes only `composition` prose.

- [ ] **Step 4: Run tests and verify failure**

```bash
bunx vitest run --project unit src/lib/projects/generated-site-design-kits/catalog.test.ts src/lib/projects/scaffold/generated-site-primitives.test.ts
```

Expected: FAIL.

- [ ] **Step 5: Implement the five concrete kit records**

Use these anchored pattern sets:

| Kit | Required pattern IDs |
|---|---|
| `editorial-airy` | `editorial-lockup`, `quiet-feature-band`, `split-operational-details` |
| `menu-led-editorial` | `centered-offer`, `priced-list`, `process-band`, `operational-strip` |
| `catalog-story` | `asymmetric-catalog-hero`, `product-rail`, `trust-contrast-band`, `numbered-process` |
| `warm-commerce` | `split-commerce-hero`, `compact-product-grid`, `info-triad`, `contrast-order-close` |
| `bold-typographic` | `full-field-lockup`, `high-contrast-actions`, `minimal-proof-line` |

Use the spec's type, theme, rhythm, anti-pattern, and compatibility rules. Do not add a `generic` kit.

- [ ] **Step 6: Implement safe portable primitive source**

Generate only `src/components/site/layout.tsx`. It may import React types and `cn` from `@/lib/utils`. It must use finite class maps for every prop, semantic color tokens, mobile-first layouts, `min-h-dvh` where requested by the writer, and no business literals, images, remote URLs, `dangerouslySetInnerHTML`, arbitrary style strings, or complete page sequence.

- [ ] **Step 7: Seed primitive files and protect them**

Extend the scaffold builder to accept selected primitive files. Mark `src/components/site/layout.tsx` platform-owned in the writable manifest/protected-path checks. Add standalone fixture compilation to prove the generated import resolves.

- [ ] **Step 8: Keep recipe compatibility temporarily**

Make `selectGeneratedSiteRecipe()` a thin adapter that maps the selected kit to existing recipe fields for old callers/tests. Mark no deprecation comment; remove the adapter only after Task 7 proves no current path imports it.

- [ ] **Step 9: Run focused tests**

```bash
bunx vitest run --project unit \
  src/lib/projects/generated-site-design-kits/catalog.test.ts \
  src/lib/projects/scaffold/generated-site-primitives.test.ts \
  src/lib/projects/generated-site-recipes.test.ts \
  src/lib/projects/scaffold/scaffold.test.ts
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/lib/projects/generated-site-design-kits src/lib/projects/scaffold/generated-site-primitives.ts src/lib/projects/scaffold/generated-site-primitives.test.ts src/lib/projects/generated-site-recipes.ts src/lib/projects/generated-site-recipes.test.ts src/lib/projects/scaffold/vite-tanstack-shadcn-starter.ts src/lib/projects/scaffold/scaffold.test.ts
git commit -m "feat(generation): add executable visual design kits"
```

### Task 4: Compile the V2 Writer Contract and Plan-Owned Accessible Theme

**Files:**
- Modify: `src/lib/projects/generated-site-contract.ts`
- Modify: `src/lib/projects/generated-site-contract.test.ts`
- Create: `src/lib/projects/generated-site-design-plan.ts`
- Create: `src/lib/projects/generated-site-design-plan.test.ts`
- Create: `src/lib/projects/generated-site-theme.ts`
- Create: `src/lib/projects/generated-site-theme.test.ts`
- Modify: `src/lib/projects/site-schema.ts`
- Modify: `src/lib/projects/site-schema.test.ts`
- Modify: `src/lib/projects/scaffold/shadcn-theme.ts`
- Modify: `src/lib/projects/scaffold/shadcn-theme.test.ts`

**Interfaces:**

`generated-site-design-plan.ts` owns `WriterDesignPlanV2` from the companion spec and exports:

```ts
export function parseWriterDesignPlanV2(input: {
  value: unknown;
  expected: {
    contractHash: string;
    kit: GeneratedSiteDesignKitV1;
    mediaMode: "owner_assets" | "graphic" | "typographic";
    requiredSectionIds: string[];
  };
}): WriterDesignPlanV2;

export function compileGeneratedSiteWriterContractV2(input: {
  handoff: AcceptedBuildHandoff;
  briefSnapshot: ProjectBriefV2;
  photoEnabled: boolean;
  kit: GeneratedSiteDesignKitV1;
}): GeneratedSiteWriterContractV2;

export type CompiledGeneratedSiteThemeV2 = {
  schemaTheme: ProjectSiteSchema["theme"];
  css: string;
  checks: ThemeContrastCheck[];
};

export function compileGeneratedSiteThemeV2(input: {
  kit: GeneratedSiteDesignKitV1;
  palette: WriterDesignPlanV2["palette"];
}): CompiledGeneratedSiteThemeV2;

export function applyGeneratedSiteThemeV2(input: {
  files: GeneratedProjectFile[];
  schema: ProjectSiteSchema;
  theme: CompiledGeneratedSiteThemeV2;
}): GeneratedProjectFile[];
```

- [ ] **Step 1: Write failing V2 fact-contract tests**

Cover full retail facts, sparse two-field input, CTA resolution, prohibited claims, required fact/section IDs, content density, and exact handoff hashes. Assert `interactive_app` rejects this compiler.

- [ ] **Step 2: Write the no-placeholder media matrix**

```ts
expect(compile({ photoEnabled: false, assets: [] }).media.mode).toMatch(
  /graphic|typographic/,
);
expect(compile({ photoEnabled: true, assets: [] }).media.mode).toMatch(
  /graphic|typographic/,
);
expect(compile({ photoEnabled: true, assets: [approvedHero] }).media.mode).toBe(
  "owner_assets",
);
```

Assert V2 never emits `replaceable_slots`.

- [ ] **Step 3: Write strict design-plan value tests**

Validate the complete `WriterDesignPlanV2` shape before stream integration: exact expected hash/kit/media mode, one entry per required section, compatible pattern ID, finite typography/surface/density enums, four six-digit palette values, non-empty mobile strategy/signature, no unknown keys, and serialized size ≤8 KiB.

- [ ] **Step 4: Write the universal-theme regression**

Compile two plans under different compatible kits/palettes. Assert their `src/index.css` and schema theme differ, both contrast reports pass, and neither silently equals the old `#f6f7f4/#111312/#f05a28` tuple unless explicitly selected by a valid plan.

- [ ] **Step 5: Run tests and verify failure**

```bash
bunx vitest run --project unit src/lib/projects/generated-site-contract.test.ts src/lib/projects/generated-site-design-plan.test.ts src/lib/projects/generated-site-theme.test.ts src/lib/projects/site-schema.test.ts
```

Expected: FAIL.

- [ ] **Step 6: Implement strict design-plan value validation**

Use explicit `unknown` narrowing and reject unknown keys. Keep this validator independent of streaming syntax so theme compilation and response parsing share exactly one semantic authority.

- [ ] **Step 7: Implement V2 compilation without changing V1 semantics**

Keep `compileGeneratedSiteContract()` and V1 parsing for old snapshots/control. Add the V2 function separately. Copy accepted values, derive only public non-factual phrasing already allowed by current tests, calculate density from supplied content counts, and include selected kit identity. Fail on unresolved CTA/fact references.

- [ ] **Step 8: Implement plan palette policy**

Validate exact six-digit hex values. Enforce kit light/dark background policy and accent surface cap metadata. Pass the resulting four values into `compileShadcnTheme`; require every returned check to pass. Do not fall back to `defaultTheme`.

- [ ] **Step 9: Apply protected theme files after plan parse**

Replace only scaffold-generated `src/index.css` and the theme object inside platform-generated `src/content/site.ts`. Recreate those files through existing scaffold/schema serializers rather than regex-editing arbitrary AI source. Preserve all content values byte-for-byte semantically.

- [ ] **Step 10: Isolate the old schema conversion**

Keep `createProjectSiteSchemaFromGeneratedContract()` for V1 control snapshots. Add a V2 conversion that receives the selected kit's safe seed palette before writer execution, then applies the plan palette through `applyGeneratedSiteThemeV2` after response parsing.

- [ ] **Step 11: Run focused tests**

```bash
bunx vitest run --project unit \
  src/lib/projects/generated-site-contract.test.ts \
  src/lib/projects/generated-site-design-plan.test.ts \
  src/lib/projects/generated-site-theme.test.ts \
  src/lib/projects/site-schema.test.ts \
  src/lib/projects/scaffold/shadcn-theme.test.ts
```

Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add src/lib/projects/generated-site-contract.ts src/lib/projects/generated-site-contract.test.ts src/lib/projects/generated-site-design-plan.ts src/lib/projects/generated-site-design-plan.test.ts src/lib/projects/generated-site-theme.ts src/lib/projects/generated-site-theme.test.ts src/lib/projects/site-schema.ts src/lib/projects/site-schema.test.ts src/lib/projects/scaffold/shadcn-theme.ts src/lib/projects/scaffold/shadcn-theme.test.ts
git commit -m "feat(generation): compile writer contract and theme"
```

### Task 5: Restore One Real Streamed Contract Writer

**Files:**
- Modify: `src/lib/projects/batched-response.ts`
- Modify: `src/lib/projects/batched-response.test.ts`
- Modify: `src/lib/projects/batched-prompt.ts`
- Modify: `src/lib/projects/batched-prompt.test.ts`
- Modify: `src/lib/projects/batched-generator.ts`
- Modify: `src/lib/projects/batched-generator.test.ts`
- Modify: `src/lib/projects/generated-site-gates.ts`
- Modify: `src/lib/projects/generated-site-gates.test.ts`

**Interfaces:**

Consume `WriterDesignPlanV2` and `parseWriterDesignPlanV2()` from Task 4. The stream parser enforces tag order/uniqueness/size, then delegates plan semantics to that shared validator. For the implementing agent's local context, the consumed type is:

```ts
export type WriterDesignPlanV2 = {
  schemaVersion: 2;
  contractHash: string;
  kit: { id: GeneratedSiteDesignKitId; version: 1 };
  mediaMode: "owner_assets" | "graphic" | "typographic";
  visualThesis: string;
  compositionPatternId: string;
  palette: {
    background: string;
    foreground: string;
    muted: string;
    accent: string;
  };
  typography: {
    displayRole: "serif" | "sans";
    bodyRole: "sans" | "serif";
  };
  sections: Array<{
    id: string;
    treatment: string;
    surface: "base" | "muted" | "contrast";
    density: "compact" | "regular" | "airy";
  }>;
  mobileStrategy: string[];
  signatureElement: string;
};
```

Update `runBatchedGenerate` to require V2 contract/kit/call budget for the new path and return the accepted V2 plan.

- [ ] **Step 1: Write strict V2 parser tests**

Accept one plan before files. Reject missing/duplicate/late plans, >8 KiB plan JSON, unknown fields, invalid palette, duplicate/missing section IDs, wrong kit/hash/media mode, and more than three editable files.

- [ ] **Step 2: Write the writer-bypass regression**

Mock `runOneStreamedResponse` and assert:

```ts
expect(runOneStreamedResponseMock).toHaveBeenCalledTimes(1);
expect(createGeneratedSiteRouteSourceMock).not.toHaveBeenCalled();
expect(result.designPlan?.schemaVersion).toBe(2);
```

The deterministic renderer may remain importable only from the benchmark/control adapter, not the v2 path.

- [ ] **Step 3: Run tests and verify failure**

```bash
bunx vitest run --project unit src/lib/projects/batched-response.test.ts src/lib/projects/batched-generator.test.ts -t "V2|real streamed contract writer"
```

Expected: FAIL because the current contract branch bypasses the model.

- [ ] **Step 4: Implement strict V2 parsing**

Use explicit `unknown` narrowing and finite enum arrays. Keep incremental file staging unchanged after a valid plan closes. Record `firstFileClosedMs` on the first safe `</file>` callback.

- [ ] **Step 5: Replace the contract prompt with one compact kit-grounded prompt**

Prompt order:

1. immutable V2 factual/render contract;
2. selected kit's exact pattern IDs, primitive API, source assertions, and anti-patterns;
3. response protocol and writable file list;
4. generated content schema field names;
5. concise customer-copy and no-fabrication rules.

Do not include the old three generic few-shots, fake gold JSX, full protected source, or deterministic route text. Instruct the writer to use semantic tokens and seeded primitives, emit full files, stay ≤32 KiB, and output zero tool calls.

- [ ] **Step 6: Call the writer once**

Before `runOneStreamedResponse`, call `budget.consumeWriter()`. Pass `maxRetries: 0` through `runOneStreamedResponse`. On parse/source failure, return a typed correction request; do not call format repair inside this step.

- [ ] **Step 7: Apply plan theme and run V2 source gates**

After a valid plan, compile/apply protected theme files, then gate the complete stage. Add exact checks for kit pattern, primitive imports, reference identity leakage, fixed-renderer fingerprint, zero placeholders, raw palette literals, and fact obligations.

- [ ] **Step 8: Keep the deterministic renderer as named control only**

Move or rename the function to make authority explicit:

```ts
export function createDeterministicGeneratedSiteControlRoute(
  contract: GeneratedSiteContractV1,
): string;
```

Only benchmark/rollback code and its tests may import it. `rg` must show no v2 pipeline import.

- [ ] **Step 9: Run focused tests**

```bash
bunx vitest run --project unit \
  src/lib/projects/batched-response.test.ts \
  src/lib/projects/batched-prompt.test.ts \
  src/lib/projects/batched-generator.test.ts \
  src/lib/projects/generated-site-gates.test.ts
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/lib/projects/batched-response.ts src/lib/projects/batched-response.test.ts src/lib/projects/batched-prompt.ts src/lib/projects/batched-prompt.test.ts src/lib/projects/batched-generator.ts src/lib/projects/batched-generator.test.ts src/lib/projects/generated-site-gates.ts src/lib/projects/generated-site-gates.test.ts src/lib/projects/generated-site-contract.ts
git commit -m "feat(generation): restore single streamed site writer"
```

### Task 6: Collapse Format, Truncation, and Technical Repairs into One Correction

**Files:**
- Modify: `src/lib/projects/batched-generator.ts`
- Modify: `src/lib/projects/batched-generator.test.ts`
- Modify: `src/lib/projects/batched-generator.truncated-retry.test.ts`
- Modify: `src/lib/projects/batched-prompt.ts`
- Modify: `src/lib/projects/batched-prompt.test.ts`
- Modify: `src/lib/projects/candidate-qualification.ts`
- Modify: `src/lib/projects/candidate-qualification.test.ts`

**Interfaces:**

```ts
export type GeneratedSiteCorrectionRequest = {
  reason: GeneratedSiteCorrectionReason;
  diagnostics: string[];
  implicatedPaths: string[];
  acceptedPlan: WriterDesignPlanV2 | null;
  stagedFiles: GeneratedProjectFile[];
};

export async function runGeneratedSiteCorrection(input: {
  request: GeneratedSiteCorrectionRequest;
  contract: GeneratedSiteWriterContractV2;
  kit: GeneratedSiteDesignKitV1;
  budget: GeneratedSiteCallBudget;
  abortSignal?: AbortSignal;
}): Promise<{
  files: GeneratedProjectFile[];
  designPlan: WriterDesignPlanV2;
}>;
```

- [ ] **Step 1: Write table-driven one-correction tests**

For `transport`, `response_contract`, `source_gate`, `build`, and `browser`, assert the first correction runs and a later correction reason throws without a model call.

- [ ] **Step 2: Write truncation behavior tests**

A writer that closes `index.tsx` and truncates in a second file may use one correction that emits only the incomplete/missing declared paths. A second malformed correction fails. Assert completed first-pass files remain staged and are not re-emitted.

- [ ] **Step 3: Write a no-loop source test**

Assert the v2 path contains no second correction call after diagnostics remain. The test should inspect call count, not source text only:

```ts
expect(runOneStreamedResponseMock).toHaveBeenCalledTimes(2); // writer + one correction
expect(result.ok).toBe(false);
```

- [ ] **Step 4: Run tests and verify failure**

```bash
bunx vitest run --project unit src/lib/projects/batched-generator.test.ts src/lib/projects/batched-generator.truncated-retry.test.ts src/lib/projects/candidate-qualification.test.ts
```

Expected: FAIL because current logic has format repair, truncation resume, and two targeted rounds.

- [ ] **Step 5: Implement one correction prompt builder**

The prompt receives the immutable contract, selected kit, exact accepted plan when parsed, diagnostics, writable paths, and current full content. It emits:

- the exact accepted plan first when one exists;
- otherwise one corrected V2 plan;
- only implicated/missing editable files;
- one done marker.

It may not emit platform-owned files, unrelated files, routes outside the contract, tools, or prose.

- [ ] **Step 6: Remove independent retry loops from v2**

Delete v2 format retry, truncation-resume retry, `while (... repairRounds < 2)`, and separate compile/browser/visual budgets. Preserve legacy/control behavior only where an active non-v2 caller still requires it; Knip and call-site tests decide deletion.

- [ ] **Step 7: Set all model retries to zero**

Writer/correction transport options use `maxRetries: 0`. A provider exception becomes a typed `transport` correction request only once.

- [ ] **Step 8: Verify scope and plan immutability after correction**

Reject out-of-scope paths, changed contract hash/kit/media mode, removed required sections, or >32 KiB editable output. Rerun theme/source gates from scratch.

- [ ] **Step 9: Run focused tests**

```bash
bunx vitest run --project unit \
  src/lib/projects/batched-generator.test.ts \
  src/lib/projects/batched-generator.truncated-retry.test.ts \
  src/lib/projects/batched-prompt.test.ts \
  src/lib/projects/candidate-qualification.test.ts
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/lib/projects/batched-generator.ts src/lib/projects/batched-generator.test.ts src/lib/projects/batched-generator.truncated-retry.test.ts src/lib/projects/batched-prompt.ts src/lib/projects/batched-prompt.test.ts src/lib/projects/candidate-qualification.ts src/lib/projects/candidate-qualification.test.ts
git commit -m "refactor(generation): enforce one shared correction"
```

### Task 7: Create the Narrow Generated-Site Pipeline Boundary

**Files:**
- Create: `src/lib/projects/generated-site-pipeline.ts`
- Create: `src/lib/projects/generated-site-pipeline.test.ts`

**Interfaces:**

Use `RunGeneratedSitePipelineInput/Result` from the spec. Inject dependencies:

```ts
export type GeneratedSiteVisualReviewPort = (input: {
  contract: GeneratedSiteWriterContractV2;
  designPlan: WriterDesignPlanV2;
  kit: GeneratedSiteDesignKitV1;
  browserReport: BrowserGateReport;
  screenshots: Uint8Array[];
  budget: GeneratedSiteCallBudget;
}) => Promise<VisualCriticReport>;

export type GeneratedSitePipelineDeps = {
  runWriter: typeof runBatchedGenerate;
  runCorrection: typeof runGeneratedSiteCorrection;
  build: typeof buildGeneratedProject;
  runBrowser: typeof runGeneratedSiteBrowserGates;
  loadVisualEvidence: (report: BrowserGateReport) => Promise<Uint8Array[]>;
  reviewVisual: GeneratedSiteVisualReviewPort;
  deriveKitInput: typeof deriveGeneratedSiteKitSelectionInput;
  compileContract: typeof compileGeneratedSiteWriterContractV2;
  selectKit: typeof selectGeneratedSiteDesignKit;
  now: () => number;
};
```

- [ ] **Step 1: Write the normal-path orchestration test**

Record dependency calls and assert exact order:

```ts
expect(order).toEqual([
  "derive-kit-input",
  "select-kit",
  "compile-contract",
  "writer",
  "build",
  "browser",
  "load-visual-evidence",
  "visual-review",
]);
expect(result.proof.calls).toMatchObject({
  writerCalls: 1,
  criticCalls: 1,
  correctionCalls: 0,
});
```

- [ ] **Step 2: Write failure/correction orchestration tests**

Cover writer parse, source gate, build, and browser failures. Each may run one correction, then rerun source/build/browser as needed. Assert only one visual review after the final browser-clean candidate.

- [ ] **Step 3: Write the lifecycle-boundary test**

Construct `GeneratedSitePipelineDeps` with only selection/compiler/writer/correction/build/browser/evidence-reader/review/time functions. Assert pipeline tests require no Prisma mock, deployment selector, artifact writer, energy charger, thumbnail, or project-status dependency. A pipeline failure returns staged files and proof rather than mutating lifecycle state.

- [ ] **Step 4: Run tests and verify failure**

```bash
bunx vitest run --project unit src/lib/projects/generated-site-pipeline.test.ts
```

Expected: FAIL because the narrow orchestrator does not exist.

- [ ] **Step 5: Implement the pure-over-dependencies pipeline**

The pipeline owns generation policy and proof timings. It does not call Prisma, select deployment, charge energy, publish project terminal state, or write artifacts. It emits staged-file/progress callbacks supplied by the worker.

- [ ] **Step 6: Keep lifecycle authority outside the module**

The pipeline owns generation policy and returns `GeneratedSiteQualityProofV2`; it does not persist that proof. Keep production worker dispatch unchanged in this task so incomplete v2 code cannot become live before critic calibration and benchmark gates. Task 10 performs the guarded worker integration.

- [ ] **Step 7: Verify the module graph boundary**

Run Graphify after edits:

```bash
bun run graph:update
```

Inspect `graphify-out/GRAPH_REPORT.md`. Expected: `runGeneratedSitePipeline()` depends on compiler/writer/correction/build/browser/review modules and has no edge to Prisma, deployment selection, artifact writes, charging, or thumbnails.

- [ ] **Step 8: Run focused tests**

```bash
bunx vitest run --project unit src/lib/projects/generated-site-pipeline.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/projects/generated-site-pipeline.ts src/lib/projects/generated-site-pipeline.test.ts
git commit -m "refactor(generation): define site quality pipeline"
```

### Task 8: Make One Reference-Aware Visual Review Mandatory

**Files:**
- Modify: `src/lib/projects/visual-critic.ts`
- Modify: `src/lib/projects/visual-critic.test.ts`
- Modify: `src/lib/projects/generated-site-risk.ts`
- Modify: `src/lib/projects/generated-site-risk.test.ts`
- Modify: `src/lib/projects/generated-site-qualification.ts`
- Modify: `src/lib/projects/generated-site-qualification.test.ts`
- Modify: `src/lib/projects/generated-site-pipeline.ts`
- Modify: `src/lib/projects/generated-site-pipeline.test.ts`
- Modify: `src/lib/projects/critic-calibration.ts`
- Modify: `src/lib/projects/critic-calibration.test.ts`

**Interfaces:**

```ts
export type GeneratedSiteVisualFindingV2 = {
  category:
    | "business_fit"
    | "hierarchy"
    | "composition"
    | "typography"
    | "color_contrast"
    | "imagery"
    | "content_usefulness"
    | "mobile_quality"
    | "genericness";
  severity: "critical" | "high" | "medium" | "low";
  route: string;
  viewport: "mobile" | "desktop";
  evidence: string;
  kitReference: string;
  proposedCorrection: string;
  verificationMode: "browser_assertion" | "human_only";
  verificationAssertions: string[];
  confidence: number;
};

export async function runGeneratedSiteVisualReview(input: {
  contract: GeneratedSiteWriterContractV2;
  designPlan: WriterDesignPlanV2;
  kit: GeneratedSiteDesignKitV1;
  browserReport: BrowserGateReport;
  screenshots: Uint8Array[];
  budget: GeneratedSiteCallBudget;
  modelId?: string | null;
}): Promise<GeneratedSiteVisualReviewV2>;
```

- [ ] **Step 1: Write mandatory-review tests**

Assert every browser-clean v2 candidate consumes one critic call, including deterministic-looking source and kits with no risk tags. Delete the expectation that clean deterministic source skips criticism.

- [ ] **Step 2: Write one-invocation tests**

Mock an empty response and a provider error. Assert `generateText` runs once, `maxRetries` is zero, result is `unknown`/`unavailable`, and qualification fails closed. No manual blank retry.

- [ ] **Step 3: Write visual finding schema tests**

Reject unknown category/severity/verification mode, empty evidence, assertion names not present in the browser assertion registry, confidence outside `0..1`, and more than 24 findings.

- [ ] **Step 4: Write post-review correction tests**

Cases:

1. no critical/high findings → pass, no correction;
2. high `human_only` finding → fail, no correction;
3. high `browser_assertion` finding + correction available → one correction, rerun hard/browser gates, all named assertions pass, no second critic, pass;
4. named assertion still fails → fail;
5. correction already consumed → fail;
6. mixed machine/human blocking findings → fail without auto-acceptance.

- [ ] **Step 5: Run tests and verify failure**

```bash
bunx vitest run --project unit \
  src/lib/projects/visual-critic.test.ts \
  src/lib/projects/generated-site-risk.test.ts \
  src/lib/projects/generated-site-qualification.test.ts \
  src/lib/projects/generated-site-pipeline.test.ts \
  src/lib/projects/critic-calibration.test.ts
```

Expected: FAIL because current deterministic source returns clean, critic retries, and repaired candidates can re-enter the critic loop.

- [ ] **Step 6: Implement one reference-aware prompt**

The prompt includes only contract identity/jobs/CTA/preferences/prohibited claims, V2 design plan, selected kit rubric/reference traits, browser risk signals, and bounded mobile/desktop images. It explicitly treats accepted minimal/bold layouts as valid when coherent and forbids proposing facts or source.

- [ ] **Step 7: Remove risk as a skip authority**

`classifyGeneratedSiteRisk()` still produces evidence categories for the critic and telemetry. Delete `deterministicSource` early return and sampling as a production acceptance shortcut. The critic runs regardless of `risky` for v2.

- [ ] **Step 8: Implement machine-verifiable correction policy**

Map only these assertion families in v2:

```ts
[
  "computed-contrast",
  "heading-overflow",
  "horizontal-overflow",
  "primary-cta",
  "touch-target",
  "required-content-visible",
  "content-hidden-by-navigation",
]
```

A visual finding naming any other assertion or `human_only` cannot auto-pass after repair. After correction, do not call the critic again.

- [ ] **Step 9: Raise calibration recall and preserve P0 rule**

Set critical/high calibration thresholds to precision `0.90`, recall `0.80`, at least 50 labels, at least 30 defects, and zero P0 regressions/false-negative acceptance. Add a regression that accepted reference 07 is not a defect solely for minimal content or bold type.

- [ ] **Step 10: Run focused tests**

```bash
bunx vitest run --project unit \
  src/lib/projects/visual-critic.test.ts \
  src/lib/projects/generated-site-risk.test.ts \
  src/lib/projects/generated-site-qualification.test.ts \
  src/lib/projects/generated-site-pipeline.test.ts \
  src/lib/projects/critic-calibration.test.ts
```

Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add src/lib/projects/visual-critic.ts src/lib/projects/visual-critic.test.ts src/lib/projects/generated-site-risk.ts src/lib/projects/generated-site-risk.test.ts src/lib/projects/generated-site-qualification.ts src/lib/projects/generated-site-qualification.test.ts src/lib/projects/generated-site-pipeline.ts src/lib/projects/generated-site-pipeline.test.ts src/lib/projects/critic-calibration.ts src/lib/projects/critic-calibration.test.ts
git commit -m "feat(generation): require one visual quality review"
```

### Task 9: Build the Real 24-Trial Benchmark and Blind Preference Gate

**Files:**
- Modify: `fixtures/generation-evaluation/manifest.json`
- Modify: all `fixtures/generation-evaluation/briefs/*.json`
- Modify: `src/lib/projects/generation-evaluation.ts`
- Modify: `src/lib/projects/generation-evaluation.test.ts`
- Create: `scripts/run-generated-site-benchmark.ts`
- Create: `scripts/create-generated-site-blind-review.ts`
- Modify: `scripts/run-generation-evaluation.ts`
- Modify: `package.json`

**Interfaces:**

```ts
export type GeneratedSiteEvaluationTrialV3 = {
  runId: string;
  arm: "deterministic-control-v1" | "reference-calibrated-v2";
  briefId: string;
  trial: 1 | 2;
  outcome: "pass" | "fail" | "infrastructure_error";
  kitId: GeneratedSiteDesignKitId | "control";
  calls: GeneratedSiteCallBudgetSnapshot;
  totalToDecisionMs: number;
  firstFileClosedMs: number | null;
  editableBytes: number;
  technicalSuccess: boolean;
  criticalAccessibilityFailures: number;
  brokenActionFailures: number;
  fabricatedFactFailures: number;
  placeholderMediaFailures: number;
  visualFindings: Record<"critical" | "high" | "medium" | "low", number>;
  compositionPatternId: string | null;
  desktopEvidenceRef: string;
  mobileEvidenceRef: string;
};

export type BlindPreference = {
  briefId: string;
  trial: 1 | 2;
  choice: "control" | "treatment" | "tie";
};
```

- [ ] **Step 1: Write V3 evaluator threshold tests**

Assert release fails for any of:

- fewer than 24 treatment trials;
- missing/infrastructure-error trial;
- writer/critic count not exactly 1;
- correction count >1 or correction rate >0.20;
- any technical, fabricated fact, broken action, placeholder, critical accessibility, critical visual, or high visual failure;
- p50 >90,000 ms or p95 >150,000 ms;
- p50 first file >45,000 ms;
- p95 editable bytes >32 KiB;
- decisive treatment preference <0.75;
- ties >0.25;
- a case loses both treatment trials;
- any kit lacks a conformance case;
- an unjustified composition pattern appears in >50% of cases.

- [ ] **Step 2: Run evaluator tests and verify failure**

```bash
bunx vitest run --project unit src/lib/projects/generation-evaluation.test.ts
```

Expected: FAIL because V3 types/metrics do not exist.

- [ ] **Step 3: Upgrade all 12 fixtures into executable synthetic inputs**

Each fixture must include:

```json
{
  "schemaVersion": 2,
  "id": "retail-catalog",
  "briefSnapshot": {},
  "acceptedContract": {},
  "acceptedPlan": {},
  "expected": {
    "compatibleKitIds": ["catalog-story", "warm-commerce"],
    "mediaMode": "graphic",
    "requiredRoutes": ["/"],
    "requiredFactIds": [],
    "primaryCta": { "kind": "whatsapp", "target": "+6281100000000" },
    "prohibitedClaims": ["nomor satu", "termurah", "pasti berhasil"]
  }
}
```

Populate complete values with synthetic names, contacts, offers, and facts. Use no real project/user/account IDs. Ensure the manifest still schedules exactly two trials for each case.

- [ ] **Step 4: Implement V3 report arithmetic**

Keep V1/V2 readers for old result files. Add percentile calculation using nearest-rank over sorted values, decisive preference math, per-case dual-loss detection, kit coverage, pattern share, and conjunctive reasons. Infrastructure errors stay in every denominator.

- [ ] **Step 5: Implement the real benchmark runner**

The script:

1. validates model/runtime prerequisites without printing secret values;
2. creates `.data/generation-evaluation/<run-id>/`;
3. loads each complete fixture;
4. runs the deterministic control once per scheduled comparison;
5. runs v2 treatment trials through `runGeneratedSitePipeline` with isolated workspace keys;
6. stores source/dist/report/screenshots privately;
7. writes sanitized `trials.json` and `run.json`;
8. exits nonzero on missing trials or infrastructure failure.

It must not require a product DB, mutate project rows, publish a site, or write tracked outputs.

- [ ] **Step 6: Implement blind review generation**

Use `node:crypto.randomInt` to choose left/right placement and save the mapping privately. Emit `.data/generation-evaluation/<run-id>/blind/review.html` containing one desktop/mobile pair per brief/trial and a small form that downloads `preferences.json`. Do not show arm, model, kit, source size, or timing.

- [ ] **Step 7: Extend the report CLI**

Read V3 trials plus optional private `preferences.json`. Without preferences, print `release.pass=false` with `blind preference input missing`. With preferences, print sanitized metrics/reasons only.

- [ ] **Step 8: Add Bun commands**

```json
{
  "evaluate:generation:run": "bun scripts/run-generated-site-benchmark.ts",
  "evaluate:generation:blind": "bun scripts/create-generated-site-blind-review.ts",
  "evaluate:generation:report": "bun scripts/run-generation-evaluation.ts --manifest fixtures/generation-evaluation/manifest.json"
}
```

- [ ] **Step 9: Run non-model focused tests**

```bash
bunx vitest run --project unit \
  src/lib/projects/generation-evaluation.test.ts \
  src/lib/projects/generated-site-reference-corpus.test.ts \
  src/lib/projects/generated-site-design-kits/catalog.test.ts
```

Expected: PASS.

- [ ] **Step 10: Run the live benchmark only with explicit approval/credentials**

```bash
bun run evaluate:generation:run
bun run evaluate:generation:blind -- --run-id <run-id>
```

Expected before owner input: 24 treatment + matching control results exist; no tracked diff; blind HTML exists privately.

- [ ] **Step 11: Collect blind owner labels and report**

After the product owner completes the randomized review, save the downloaded JSON under the private run directory and execute:

```bash
bun run evaluate:generation:report -- \
  --results .data/generation-evaluation/<run-id>/trials.json \
  --preferences .data/generation-evaluation/<run-id>/blind/preferences.json
```

Expected before rollout: `release.pass=true` and every threshold from the spec is present in output. If it fails, stop. Do not weaken thresholds in the same commit as a failing treatment.

- [ ] **Step 12: Commit code/fixtures only**

```bash
git status --short
git add fixtures/generation-evaluation src/lib/projects/generation-evaluation.ts src/lib/projects/generation-evaluation.test.ts scripts/run-generated-site-benchmark.ts scripts/create-generated-site-blind-review.ts scripts/run-generation-evaluation.ts package.json
git commit -m "test(generation): add reference-calibrated benchmark"
```

Never add `.data` results, screenshots, review HTML, or preferences.

### Task 10: Add Disabled-by-Default Rollout, Update Canonical Docs, and Verify

**Files:**
- Modify: `src/lib/app-settings-registry.ts`
- Modify: `src/lib/app-settings-registry.test.ts`
- Modify: `src/routes/-api.admin.settings.test.ts`
- Modify: `src/lib/projects/build-attempt-worker.ts`
- Modify: `src/lib/projects/build-attempt-worker.batched.test.ts`
- Modify: `src/lib/projects/generated-starter.ts`
- Modify: `src/lib/projects/generated-source.test.ts`
- Modify: `DESIGN.md`
- Modify: `DEV.md`
- Modify: `docs/superpowers/README.md`
- Modify: this plan's completion evidence only after commands pass

**Interfaces:**

Add settings:

```text
feature.reference_calibrated_generation_enabled = boolean, fallback false
feature.reference_calibrated_generation_shadow = boolean, fallback true
```

Resolution:

```ts
export type ReferenceCalibratedGenerationMode =
  | "off"
  | "shadow"
  | "replace";

export function resolveReferenceCalibratedGenerationMode(): ReferenceCalibratedGenerationMode;
```

- [ ] **Step 1: Write setting and mode tests**

Assert:

| enabled | shadow | mode |
|---|---|---|
| false | false/true | `off` |
| true | true | `shadow` |
| true | false | `replace` |

Admin API accepts booleans only. Defaults are disabled + shadow.

- [ ] **Step 2: Write worker rollout and last-known-good tests**

- `off`: current deterministic control remains selected; v2 does not run.
- `shadow`: v2 runs and persists private proof/evidence but cannot select source/build/deployment or charge the owner's success path twice.
- `replace`: allowed only when a code-owned benchmark approval constant contains the current evaluator/kit versions and a passing run ID; otherwise resolve to `shadow` and fail loud in admin logs.
- v2 failure: record failed attempt/build/proof, retain staged source for diagnosis, keep selected snapshot/deployment/project ready state unchanged, and never mutate the accepted handoff.
- v2 success: select only after `proof.outcome === "pass"`.

Keep benchmark approval metadata free of private paths/preferences.

- [ ] **Step 3: Run tests and verify failure**

```bash
bunx vitest run --project unit src/lib/app-settings-registry.test.ts src/routes/-api.admin.settings.test.ts src/lib/projects/build-attempt-worker.batched.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Implement settings, guarded resolution, and worker delegation**

Reuse DB-first setting behavior. Do not add an environment-only hidden switch. Under `shadow` or approved `replace`, delegate detailed v2 policy to `runGeneratedSitePipeline()` while keeping worker authority for operation leases, energy, progressive persistence, snapshot/build/runtime rows, source/dist artifacts, selection, thumbnails, and terminal events. Shadow candidate failures must not fail the owner's control attempt; replacement candidate failures must fail honestly and preserve last-known-good.

Extend snapshot metadata serialization to accept sanitized `GeneratedSiteQualityProofV2`. Keep V1 proof readable.

- [ ] **Step 5: Update `DESIGN.md`**

Document the generated-site system separately from product UI:

- five reference-derived kit families;
- executable-kit definition;
- one dominant first-view idea, type/palette/rhythm rules;
- no universal cards/theme;
- no-asset media honesty;
- mobile and visual-review requirements.

Do not copy the long implementation plan into the root doc.

- [ ] **Step 6: Update `DEV.md`**

Document:

```bash
bun run graph:update
bun run evaluate:generation:run
bun run evaluate:generation:blind -- --run-id <run-id>
bun run evaluate:generation:report -- --results <path> --preferences <path>
```

Include ignored evidence location, prerequisite checks, call-budget debugging fields, failure classes, blind-review procedure, and the rule that thresholds cannot be changed to bless a failing run.

- [ ] **Step 7: Update the Superpowers index**

Point generation readers to the new audit/spec/plan and state that the 2026-08-12 quality design is historical where superseded.

- [ ] **Step 8: Run all focused generation tests**

```bash
bunx vitest run --project unit \
  src/lib/projects/generated-site-reference-corpus.test.ts \
  src/lib/projects/generated-site-call-budget.test.ts \
  src/lib/projects/generated-site-quality-proof.test.ts \
  src/lib/projects/generated-site-design-kits/catalog.test.ts \
  src/lib/projects/scaffold/generated-site-primitives.test.ts \
  src/lib/projects/generated-site-contract.test.ts \
  src/lib/projects/generated-site-theme.test.ts \
  src/lib/projects/batched-response.test.ts \
  src/lib/projects/batched-prompt.test.ts \
  src/lib/projects/batched-generator.test.ts \
  src/lib/projects/batched-generator.truncated-retry.test.ts \
  src/lib/projects/generated-site-gates.test.ts \
  src/lib/projects/generated-site-pipeline.test.ts \
  src/lib/projects/visual-critic.test.ts \
  src/lib/projects/generated-site-qualification.test.ts \
  src/lib/projects/build-attempt-worker.batched.test.ts \
  src/lib/projects/generation-evaluation.test.ts
```

Expected: PASS.

- [ ] **Step 9: Run complete local gates**

```bash
bun run check
bun run build
```

Expected: both exit 0. Root build is required here because generated build/deployment orchestration changed.

- [ ] **Step 10: Re-run Graphify and inspect boundaries**

```bash
bun run graph:update
```

Expected:

- no import cycle;
- worker delegates generated-site policy to `runGeneratedSitePipeline`;
- no v2 path calls the deterministic renderer;
- no v2 call site bypasses `GeneratedSiteCallBudget`.

Verify with:

```bash
rg -n "createDeterministicGeneratedSiteControlRoute" src scripts
rg -n "maxRetries:" src/lib/projects/{batched-generator,visual-critic,generated-site-pipeline}.ts
```

Expected: deterministic renderer appears only in control/benchmark wiring; all v2 model call options show `maxRetries: 0`.

- [ ] **Step 11: Obtain architecture and benchmark review**

Before enabling `replace`, require:

- spec compliance review;
- code quality review;
- fresh passing 24-trial report;
- product-owner blind preference approval;
- sanitized benchmark run/version recorded in code-owned approval metadata.

If any is absent, leave settings disabled/shadow and report implementation complete but rollout blocked.

- [ ] **Step 12: Commit docs/rollout**

```bash
git add src/lib/app-settings-registry.ts src/lib/app-settings-registry.test.ts src/routes/-api.admin.settings.test.ts src/lib/projects/build-attempt-worker.ts src/lib/projects/build-attempt-worker.batched.test.ts src/lib/projects/generated-starter.ts src/lib/projects/generated-source.test.ts DESIGN.md DEV.md docs/superpowers/README.md docs/superpowers/plans/2026-08-13-reference-calibrated-single-shot-generation.md
git commit -m "feat(generation): gate reference-calibrated rollout"
```

---

## Required Review Checkpoints

Implementation agents must stop for senior review after:

1. **Task 3:** Are the kits truly executable, visually distinct, and free of full-page template lock-in?
2. **Task 6:** Is there exactly one correction authority with no hidden AI SDK retry?
3. **Task 8:** Can any unreviewed human-only visual repair auto-pass? The answer must be no.
4. **Task 9:** Does the runner execute real generation/build/browser/review, or only summarize supplied JSON?
5. **Task 10:** Are replacement settings still disabled until the benchmark and owner gate pass?

## Self-Review Checklist for the Executing Lead

- [ ] Every successor-spec requirement maps to a task above.
- [ ] Five and only five accepted reference labels are frozen.
- [ ] `replaceable_slots` is absent from V2 no-asset output.
- [ ] Design-kit metadata changes scaffold, prompt, gates, and critic.
- [ ] V2 calls the writer instead of the deterministic renderer.
- [ ] Writer, critic, and correction all use the shared budget and `maxRetries: 0`.
- [ ] Normal path is 1 writer + 1 critic + 0 correction.
- [ ] Attempt maximum is 1 writer + 1 critic + 1 correction.
- [ ] No post-repair second critic exists.
- [ ] Human-only critical/high findings cannot auto-pass.
- [ ] Worker retains lifecycle authority but not detailed quality policy.
- [ ] Benchmark executes 24 real treatment trials and matching controls.
- [ ] Blind preference is randomized and engine labels stay private until scoring.
- [ ] Thresholds remain conjunctive and infrastructure errors remain in denominators.
- [ ] `.data`, screenshots, private preferences, prompts, and credentials remain untracked.
- [ ] `bun run check`, root build, and Graphify evidence are fresh before handoff.

## Execution Handoff

Use **subagent-driven development in a fresh implementation session**. Dispatch one fresh implementation agent per task, then perform both spec-compliance and code-quality review before advancing. Do not execute this plan in the architecture session that authored it.
