# Outcome-directed generation engine implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace customer-facing fallbacks and prescribed visual templates with a fact-only, outcome-directed generation pipeline that gives the build agent broad creative authority and selects only independently reviewed, ready-to-publish output.

**Architecture:** Compile an immutable fact-only contract, obtain one high-level creative direction, and let the sandboxed build agent choose and apply a validated semantic design system while writing the site. Objective gates prove facts and operability; an independent rendered review may authorize one bounded revision before the final selection decision.

**Tech Stack:** Bun, TypeScript, AI SDK, Prisma, React, Vite, TanStack Router, Tailwind CSS v4, shadcn/Base UI, Vitest, Playwright, BullMQ

**Spec:** `docs/superpowers/specs/2026-08-21-outcome-directed-generation-engine-design.md`

## Global constraints

- New generated output contains no synthetic headline, subheadline, USP, testimonial, guarantee, product description, audience, business name, CTA, contact, or section-purpose fallback.
- Missing required identity, offer, visitor job, or actionable CTA blocks generation before creative model spend.
- Missing optional facts remain absent and their sections are omitted.
- The active path contains no visual recipes, design-kit selection, gold markup, default style dials, category-to-layout mapping, or universal palette.
- The build agent remains sandboxed with no shell, network, package installation, credentials, publishing, or protected runtime-file authority.
- The platform owns facts, routes, actions, approved media, runtime files, objective gates, budgets, and selection transactions.
- The build agent owns palette, typography, composition, section order, components, rhythm, and responsive execution.
- Objective gates never require a hero type, card layout, section count, signature node, palette temperature, or named composition pattern.
- Normal calls are one creative direction, one bounded build run, and one visual review.
- Maximum calls add one bounded revision and one final visual review.
- No source mutation occurs after the final visual review.
- A visual `unknown`, any final category below 3, or confidence below 0.80 cannot select output.
- Failed attempts preserve last-known-good Preview and Production.
- User-facing copy stays Indonesian. Code, tests, prompts, logs, and developer docs stay English.
- Use Bun only. Add no dependency unless current platform features cannot implement the requirement.
- Implement behavior through TDD: failing focused test, minimal implementation, focused pass, then the relevant combined gate.

## File structure

### New generation core

- `src/lib/projects/outcome-site-contract.ts`: fact-only contract types, compiler, hashes, required-field failures, and exact CTA resolution.
- `src/lib/projects/outcome-site-contract.test.ts`: fact projection, omission, CTA, route, and no-fallback tests.
- `src/lib/projects/outcome-creative-direction.ts`: structured direction schema, prompt, validation, and one-call runner.
- `src/lib/projects/outcome-creative-direction.test.ts`: accepted-fact anchors, anti-prescription validation, and model failure tests.
- `src/lib/projects/outcome-design-system.ts`: proposal schema, contrast validation, font-stack IDs, and protected CSS compilation.
- `src/lib/projects/outcome-design-system.test.ts`: valid light/dark systems, contrast rejection, and deterministic CSS tests.
- `src/lib/projects/outcome-visual-review.ts`: category-complete rendered review, verdict, and revision-brief compiler.
- `src/lib/projects/outcome-visual-review.test.ts`: category coverage, confidence, unknown, and revision tests.
- `src/lib/projects/outcome-generation-pipeline.ts`: call budget, qualification order, one revision, final review, and outcome proof.
- `src/lib/projects/outcome-generation-pipeline.test.ts`: orchestration and no-post-review-mutation tests.
- `src/lib/projects/outcome-quality-proof.ts`: sanitized proof and pass invariants.
- `src/lib/projects/outcome-quality-proof.test.ts`: proof parsing, sanitization, and selection invariants.

### Existing files changed

- `src/lib/projects/brief-flow.ts`: remove fabricated question choices and mandatory recommendation recovery.
- `src/lib/projects/brief-flow.test.ts`: neutral malformed-question recovery and explicit omission tests.
- `src/lib/projects/prompts/discuss-system.md`: stop requiring recommendation defaults and unsupported claim suggestions.
- `src/lib/projects/discuss-tool.ts`: align tool contract and prompt with neutral choices.
- `src/lib/projects/discuss-tool.test.ts`: prompt and schema expectations.
- `src/lib/projects/site-schema.ts`: stop active contract generation from overwriting themes or creating customer copy.
- `src/lib/projects/site-schema.test.ts`: historical parsing remains readable while new generation rejects synthetic success.
- `src/lib/projects/scaffold/vite-tanstack-shadcn-starter.ts`: remove public placeholder files and accept fact-only content plus compiled design CSS.
- `src/lib/projects/scaffold/scaffold.test.ts`: no placeholders, examples, or visible starter copy.
- `src/lib/projects/scaffold/shadcn-theme.ts`: delegate new proposals to the outcome design-system compiler while preserving historical snapshot compilation.
- `src/lib/projects/agentic-generator.ts`: accept fact contract and direction, expose `set_design_system`, simplify the prompt, and support one critique-guided revision.
- `src/lib/projects/agentic-generator.test.ts`: tool authority, prompt omissions, design-system requirement, and revision tests.
- `src/lib/projects/generated-site-gates.ts`: retain objective checks and remove active pattern conformance.
- `src/lib/projects/generated-site-gates.test.ts`: no preferred-shape assertions; fact and operability assertions remain hard.
- `src/lib/projects/generated-site-browser-runner.ts`: emit reviewer evidence without kit or signature assumptions.
- `src/lib/projects/generated-site-browser-runner.test.ts`: both viewport evidence and objective-only checks.
- `src/lib/projects/build-attempt-worker.ts`: compile and run the new evaluation/selection path and preserve transactional last-good behavior.
- `src/lib/projects/build-attempt-worker.test.ts`: pre-spend blocking, pass selection, rejection preservation, and ledger tests.
- `src/components/projects/build/BuildNotices.tsx`: keep recovery notice in discussion only.
- `src/components/projects/build/BuildNotices.test.ts`: recovery action and single-placement rendering.
- `src/components/projects/workspace/WorkspaceShell.tsx`: do not force Preview on start/failure; open it only by owner action or explicit successful review action.
- `src/components/projects/workspace/WorkspaceShell.test.ts`: mobile and desktop surface-state tests.
- `src/lib/projects/generation-evaluation.ts`: add outcome-directed treatment, readiness, specificity, template-recognition, and threshold arithmetic.
- `src/lib/projects/generation-evaluation.test.ts`: 40-trial and conjunctive release checks.
- `src/lib/projects/generation-evaluation-blind.ts`: randomized readiness, specificity, and paired-template review data.
- `src/lib/projects/generation-evaluation-blind.test.ts`: hidden mapping and complete paired labels.
- `DEV.md`, `DESIGN.md`, and `docs/superpowers/README.md`: canonical runtime, authority, evaluation, and recovery documentation.

### Retired from the active path, then deleted when no historical reader imports them

- `src/lib/projects/generated-site-recipes.ts`
- `src/lib/projects/generated-site-design-kits/`
- `src/lib/projects/generated-site-design-plan.ts`
- `src/lib/projects/professional-site-kits.ts`
- `src/lib/projects/professional-site-plan.ts`
- `src/lib/projects/professional-site-blueprint.ts`
- duplicated `recipeForV2()` and synthetic public-copy helpers in `src/lib/projects/generated-site-contract.ts`
- placeholder generation in `src/lib/projects/placeholders.ts` when runtime proxy tests prove it has no non-generation owner

Historical proof and snapshot parsers stay only where selected artifacts require them. New generation must have no import path to retired selectors.

---

### Task 1: Compile a fact-only site contract

**Files:**
- Create: `src/lib/projects/outcome-site-contract.ts`
- Create: `src/lib/projects/outcome-site-contract.test.ts`
- Modify: `src/lib/projects/generated-site-contract.ts`
- Modify: `src/lib/projects/generated-site-contract.test.ts`
- Modify: `src/lib/projects/build-attempt-worker.ts`

**Interfaces:**
- Consumes: `GeneratedSiteHandoffInput`, accepted `BuildContractV1`, accepted `BuildPlanV1`, and `ProjectBriefV2`.
- Produces: `OutcomeDirectedSiteContractV1`, `OutcomeContractCompileError`, and `compileOutcomeDirectedSiteContract(handoff)`.

- [ ] **Step 1: Write contract tests that reject missing required truth**

```ts
it.each([
  ["identity", handoffWithoutBusinessName()],
  ["offer", handoffWithoutOffers()],
  ["visitor_job", handoffWithoutPrimaryVisitorJob()],
  ["action", handoffWithoutResolvablePrimaryAction()],
])("rejects a handoff without %s", (field, handoff) => {
  expect(() => compileOutcomeDirectedSiteContract(handoff)).toThrow(
    expect.objectContaining({ field }),
  );
});
```

Add a positive fixture with a real WhatsApp contact fact and assert the exact canonical `wa.me` href. Add negative fixtures proving missing contact does not become `#kontak`, `Lihat`, or a guessed number.

- [ ] **Step 2: Run the focused tests and confirm failure**

Run:

```bash
bunx vitest run --project unit src/lib/projects/outcome-site-contract.test.ts
```

Expected: FAIL because the module and compiler do not exist.

- [ ] **Step 3: Define the exact contract and compile errors**

```ts
export type OutcomeContractRequiredField =
  | "identity"
  | "offer"
  | "visitor_job"
  | "action";

export class OutcomeContractCompileError extends Error {
  constructor(
    public readonly field: OutcomeContractRequiredField,
    message: string,
  ) {
    super(message);
    this.name = "OutcomeContractCompileError";
  }
}

export type OutcomeSiteAction = {
  id: string;
  kind:
    | "whatsapp"
    | "phone"
    | "visit"
    | "browse"
    | "book"
    | "order"
    | "other";
  label: string;
  href: string;
  priority: "primary" | "secondary";
};

export type OutcomeSiteRoute = {
  path: string;
  purpose: string;
  visitorJobIds: string[];
  requiredFactIds: string[];
};

export type OutcomeSiteMedia = {
  mode: "owner_assets" | "graphic" | "typographic";
  approvedAssets: Array<{
    assetId: string;
    mediaPath: string;
    purpose: string;
  }>;
};

export type OutcomeDirectedSiteContractV1 = {
  schemaVersion: 1;
  contractHash: string;
  business: {
    name: string;
    type: string | null;
    audience: string | null;
  };
  visitorJobs: Array<{
    id: string;
    goal: string;
    priority: "primary" | "secondary";
  }>;
  offers: Array<{
    name: string;
    description: string | null;
    priceRange: string | null;
    isPrimary: boolean;
  }>;
  acceptedContent: {
    tagline: string | null;
    usp: string[];
    testimonials: TestimonialValue[];
    certifications: CertificationValue[];
    hours: HoursValue[];
    paymentMethods: PaymentMethodValue[];
    priceRange: string | null;
    address: string | null;
    deliveryArea: string | null;
    socialLinks: SocialLinkValue[];
    promotion: string | null;
    otherFacts: string[];
  };
  actions: OutcomeSiteAction[];
  routes: OutcomeSiteRoute[];
  media: OutcomeSiteMedia;
  omissions: string[];
  prohibitedClaims: string[];
};
```

Compile all values from accepted facts and canonical accepted fields. Hash the canonical draft with a new version prefix. Do not call `publicHeadline`, `publicSubheadline`, `publicTrustPoints`, `publicProductCopy`, `resolveCtaTarget`, or `createFallbackProjectSiteSchema`.

- [ ] **Step 4: Add omission and literal regression tests**

Serialize contracts for sparse, laundry, retail, and multi-route fixtures. Assert the serialized output excludes:

```ts
const forbidden = [
  "Profesional & Terpercaya",
  "Berkualitas untuk Kebutuhan Anda",
  "Garansi kualitas",
  "Proses mudah dan transparan",
  "Website usaha",
  "Pelanggan baru",
  "#kontak",
];
```

For each optional absent field, assert `null` or `[]`, not substitute copy.

- [ ] **Step 5: Route the worker through the compiler before model spend**

In `build-attempt-worker.ts`, compile the fact contract immediately after loading the accepted handoff. Map `OutcomeContractCompileError` to a safe terminal build error and a discussion recovery state. Assert in the worker test that `runAgenticGenerate` and creative-direction mocks were not called.

- [ ] **Step 6: Run focused tests**

```bash
bunx vitest run --project unit \
  src/lib/projects/outcome-site-contract.test.ts \
  src/lib/projects/generated-site-contract.test.ts \
  src/lib/projects/build-attempt-worker.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/projects/outcome-site-contract.ts \
  src/lib/projects/outcome-site-contract.test.ts \
  src/lib/projects/generated-site-contract.ts \
  src/lib/projects/generated-site-contract.test.ts \
  src/lib/projects/build-attempt-worker.ts \
  src/lib/projects/build-attempt-worker.test.ts
git commit -m "feat(projects): compile fact-only generation contracts"
```

### Task 2: Stop discussion from fabricating answers

**Files:**
- Modify: `src/lib/projects/prompts/discuss-system.md`
- Modify: `src/lib/projects/discuss-tool.ts`
- Modify: `src/lib/projects/discuss-tool.test.ts`
- Modify: `src/lib/projects/brief-flow.ts`
- Modify: `src/lib/projects/brief-flow.test.ts`

**Interfaces:**
- Consumes: malformed or incomplete `WorkspaceTurnToolInput` and `evaluateBuildReadiness()` results.
- Produces: `createNeutralRecoveryQuestion(fieldId)` and normalized cards with no synthesized claim options.

- [ ] **Step 1: Write failing tests for malformed choice recovery**

```ts
it("does not synthesize answer options when model choices are invalid", () => {
  const card = normalizeWorkspaceTurnResult(
    malformedChoiceResult("usp"),
    laundryBrief(),
  ).workspaceCard;

  expect(card).toEqual({
    type: "question",
    question: expect.objectContaining({
      id: "usp",
      answerMode: "text",
      options: [],
      recommendedOptionLabel: undefined,
    }),
  });
  expect(JSON.stringify(card)).not.toMatch(/Opsi A|Paket Utama|Jaminan/);
});
```

Add tests that real categorical options for contact channel remain allowed and that placeholders never enter `briefPatch` unless the owner submits them.

- [ ] **Step 2: Run tests and confirm the current synthesized choices fail them**

```bash
bunx vitest run --project unit \
  src/lib/projects/brief-flow.test.ts \
  src/lib/projects/discuss-tool.test.ts
```

Expected: FAIL with existing `fallbackOptionsForQuestion()` output or mandatory recommendation prompt text.

- [ ] **Step 3: Replace choice fabrication with a neutral text recovery**

```ts
export function createNeutralRecoveryQuestion(
  id: BriefQuestionId,
): BriefQuestion {
  return {
    id,
    question: questionTextForMissingField(id),
    answerMode: "text",
    selectionMode: "single",
    options: [],
    required: isStructuralBriefField(id),
  };
}
```

Delete `fallbackOptionsForQuestion()`. If no field-safe neutral question exists, return a failed turn rather than `Opsi A/B/C`.

- [ ] **Step 4: Tighten the discuss prompt**

Replace `Selalu rekomendasi default` with rules that:

- recommendations are optional;
- options may describe neutral categories only;
- options cannot assert quality, speed, popularity, guarantees, results, hygiene, delivery, price, or operations absent from owner messages;
- examples are never copied into `briefPatch`;
- malformed output fails instead of becoming a populated success card.

Add exact prompt assertions in `discuss-tool.test.ts`.

- [ ] **Step 5: Run focused tests**

```bash
bunx vitest run --project unit \
  src/lib/projects/brief-flow.test.ts \
  src/lib/projects/brief-flow.photo-gate.test.ts \
  src/lib/projects/discuss-tool.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/projects/prompts/discuss-system.md \
  src/lib/projects/discuss-tool.ts \
  src/lib/projects/discuss-tool.test.ts \
  src/lib/projects/brief-flow.ts \
  src/lib/projects/brief-flow.test.ts
git commit -m "fix(projects): stop fabricating discussion answers"
```

### Task 3: Generate high-level creative direction without drawing the page

**Files:**
- Create: `src/lib/projects/outcome-creative-direction.ts`
- Create: `src/lib/projects/outcome-creative-direction.test.ts`
- Modify: `src/lib/projects/build-attempt-worker.ts`
- Modify: `src/lib/projects/build-attempt-worker.test.ts`

**Interfaces:**
- Consumes: `OutcomeDirectedSiteContractV1`, configured build model, and abort signal.
- Produces: `CreativeDirectionV1`, `validateCreativeDirection(value, contract)`, and `runOutcomeCreativeDirection(input)`.

- [ ] **Step 1: Write validator tests**

Test exact contract hash, at least one accepted fact anchor, bounded arrays and strings, and rejection of page-drawing language:

```ts
const forbiddenDirection = {
  ...validDirection,
  visualThesis: "Use a split hero with three cards and orange buttons",
};
expect(validateCreativeDirection(forbiddenDirection, contract)).toEqual({
  ok: false,
  reason: "prescriptive_visual_solution",
});
```

Also reject hex, `rgb`, `oklch`, font names, component names, section counts, invented fact IDs, and customer-facing claims not present in the contract.

- [ ] **Step 2: Run the test and confirm failure**

```bash
bunx vitest run --project unit src/lib/projects/outcome-creative-direction.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement schema and pure validation**

```ts
export type CreativeDirectionV1 = {
  schemaVersion: 1;
  contractHash: string;
  visitorReading: string;
  visualThesis: string;
  businessAnchors: Array<{
    source: "offer" | "process" | "place" | "product" | "craft" | "audience";
    acceptedFactId: string;
    relevance: string;
  }>;
  character: string[];
  firstViewPriority: string;
  mobileIntent: string;
  genericityRisks: string[];
  factualBoundaries: string[];
};
```

Use a closed list of prescriptive layout and style terms for direction validation. This list protects creative authority; it is not a source gate for generated UI.

- [ ] **Step 4: Implement one structured model call**

Use the configured build model and `maxRetries: 0`. The prompt includes the fact contract and explains that direction names the visitor tension, business anchors, character, priority, mobile intent, genericity risks, and factual boundaries. It forbids source code, customer copy, palette values, fonts, layouts, components, and section plans.

Parse and validate the structured output. Classify empty, malformed, prescriptive, and invented-anchor responses separately. Do not substitute a generic direction.

- [ ] **Step 5: Wire direction before the build agent**

Update the worker sequence:

```ts
const contract = compileOutcomeDirectedSiteContract(handoff);
const direction = await runOutcomeCreativeDirection({
  abortSignal,
  contract,
  projectId,
  userId,
});
const generated = await runAgenticGenerate({ contract, direction, ...input });
```

Charge and record the creative call. Add a worker test proving direction failure prevents the build-agent call and preserves existing source.

- [ ] **Step 6: Run focused tests**

```bash
bunx vitest run --project unit \
  src/lib/projects/outcome-creative-direction.test.ts \
  src/lib/projects/build-attempt-worker.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/projects/outcome-creative-direction.ts \
  src/lib/projects/outcome-creative-direction.test.ts \
  src/lib/projects/build-attempt-worker.ts \
  src/lib/projects/build-attempt-worker.test.ts
git commit -m "feat(projects): add outcome-directed creative briefs"
```

### Task 4: Let the build agent propose the semantic design system

**Files:**
- Create: `src/lib/projects/outcome-design-system.ts`
- Create: `src/lib/projects/outcome-design-system.test.ts`
- Modify: `src/lib/projects/scaffold/shadcn-theme.ts`
- Modify: `src/lib/projects/scaffold/shadcn-theme.test.ts`

**Interfaces:**
- Consumes: `GeneratedDesignSystemProposalV1`.
- Produces: `compileOutcomeDesignSystem(proposal)`, `OutcomeDesignSystemResult`, and protected Tailwind CSS.

- [ ] **Step 1: Write failing semantic contrast tests**

Create one light and one dark valid proposal. Add invalid fixtures for unreadable muted text, primary text, accent text, ring, incomplete colors, unsupported font IDs, and malformed colors.

```ts
expect(compileOutcomeDesignSystem(lowContrastProposal())).toEqual({
  ok: false,
  issues: expect.arrayContaining([
    expect.objectContaining({ pair: "muted/mutedForeground" }),
  ]),
});
```

Assert compilation is deterministic and never injects `#f05a28` or another default hue.

- [ ] **Step 2: Run tests and confirm failure**

```bash
bunx vitest run --project unit src/lib/projects/outcome-design-system.test.ts
```

Expected: FAIL because the compiler does not exist.

- [ ] **Step 3: Implement proposal parsing and contrast validation**

```ts
export const OUTCOME_FONT_STACKS = {
  "system-humanist": "ui-sans-serif, system-ui, sans-serif",
  "system-grotesk": '"Arial Nova", "Helvetica Neue", sans-serif',
  "system-editorial": 'Iowan Old Style, "Palatino Linotype", serif',
  "system-slab": 'Rockwell, "Roboto Slab", serif',
} as const;

export type OutcomeFontStackId = keyof typeof OUTCOME_FONT_STACKS;
```

Reuse existing color parsing and contrast helpers. Require 4.5:1 for normal semantic text, 3:1 for large/action text and visible ring contrast. Return issues; do not alter submitted hues to force a pass.

- [ ] **Step 4: Compile protected CSS**

Compile the accepted proposal into the current Tailwind semantic token shape. Include base, card, popover, primary, secondary, muted, accent, destructive, border, input, ring, display font, body font, and radius variables. Keep destructive as a source-owned safety token because it describes product state, not business identity.

- [ ] **Step 5: Preserve historical theme compilation explicitly**

Keep `compileShadcnTheme(ProjectSiteSchema)` only for historical selected snapshots and tests. New generation calls `compileOutcomeDesignSystem()` and has no fallback to `defaultTheme`.

- [ ] **Step 6: Run focused tests**

```bash
bunx vitest run --project unit \
  src/lib/projects/outcome-design-system.test.ts \
  src/lib/projects/scaffold/shadcn-theme.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/projects/outcome-design-system.ts \
  src/lib/projects/outcome-design-system.test.ts \
  src/lib/projects/scaffold/shadcn-theme.ts \
  src/lib/projects/scaffold/shadcn-theme.test.ts
git commit -m "feat(projects): validate agent-authored design systems"
```

### Task 5: Remove visible starter and placeholder anchors

**Files:**
- Modify: `src/lib/projects/scaffold/vite-tanstack-shadcn-starter.ts`
- Modify: `src/lib/projects/scaffold/scaffold.test.ts`
- Modify: `src/lib/projects/generated-starter.ts`
- Modify: `src/lib/projects/agentic-generator.ts`
- Modify: `src/lib/projects/agentic-generator.test.ts`
- Modify or delete after import proof: `src/lib/projects/placeholders.ts`
- Modify: `src/lib/projects/runtime-proxy.ts`

**Interfaces:**
- Consumes: fact-only content, accepted route bindings, and compiled design-system CSS after the agent sets it.
- Produces: a runtime-only starter with blank route modules and no visible media or copy.

- [ ] **Step 1: Write scaffold residue tests**

Assert new starter files do not contain:

```ts
const forbiddenPaths = [
  "public/placeholder.svg",
  "public/placeholder-vertical.svg",
];
const forbiddenContent = [
  "Tidak ada foto",
  "Website UMKM Kamu",
  "data-generated-site-starter",
];
```

Assert blank route modules still call `usePreviewReady()` and compile before the agent writes them.

- [ ] **Step 2: Run scaffold tests and confirm failure**

```bash
bunx vitest run --project unit src/lib/projects/scaffold/scaffold.test.ts
```

Expected: FAIL because placeholder files and starter markers exist.

- [ ] **Step 3: Remove placeholder files from generated scaffolds**

Delete placeholder entries from `createViteTanStackShadcnStarterFiles()`. Replace visible route residue with an empty semantic root that contains no customer copy and is always rejected by final source qualification if the agent leaves it unchanged.

- [ ] **Step 4: Separate project files from registry availability**

Change `list_files` to return:

```ts
{
  projectFiles: string[];
  registryComponentNames: string[];
}
```

Do not expose registry implementation paths as project files. Keep `copy_shadcn_component` as the only copy boundary.

- [ ] **Step 5: Prove whether runtime placeholders still have a non-generation owner**

Use `git grep` and focused runtime-proxy tests. If runtime proxy only serves removed generated placeholder paths, delete `placeholders.ts` and its response branch. If historical selected snapshots require it, rename the behavior to historical media compatibility and prevent new scaffold references.

- [ ] **Step 6: Run focused tests**

```bash
bunx vitest run --project unit \
  src/lib/projects/scaffold/scaffold.test.ts \
  src/lib/projects/agentic-generator.test.ts \
  src/lib/projects/runtime-proxy.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/projects/scaffold/vite-tanstack-shadcn-starter.ts \
  src/lib/projects/scaffold/scaffold.test.ts \
  src/lib/projects/generated-starter.ts \
  src/lib/projects/agentic-generator.ts \
  src/lib/projects/agentic-generator.test.ts \
  src/lib/projects/placeholders.ts \
  src/lib/projects/runtime-proxy.ts
git commit -m "refactor(projects): remove generated starter anchors"
```

### Task 6: Give the build agent broad creative authority

**Files:**
- Modify: `src/lib/projects/agentic-generator.ts`
- Modify: `src/lib/projects/agentic-generator.test.ts`
- Modify: `src/lib/projects/generated-write-policy.ts`
- Modify: `src/lib/projects/generated-site-gates.ts`
- Modify: `src/lib/projects/generated-site-gates.test.ts`

**Interfaces:**
- Consumes: `OutcomeDirectedSiteContractV1`, `CreativeDirectionV1`, and optional `OutcomeRevisionBriefV1`.
- Produces: `runAgenticGenerate(input)`, `runAgenticRevision(input)`, `qualifyOutcomeSource(input)`, source files, accepted design system, tool trace, and exact call usage.

- [ ] **Step 1: Write prompt and authority tests**

Capture the system and user prompts. Assert they contain the contract, creative direction, quality definition, truth boundaries, required routes, and tools. Assert they do not contain:

```ts
const forbiddenPromptTerms = [
  "selectedKitId",
  "preferredPatterns",
  "split hero",
  "bento",
  "DESIGN_VARIANCE",
  "MOTION_INTENSITY",
  "warm-commerce",
  "editorial-airy",
  "gold example",
  "three cards",
];
```

- [ ] **Step 2: Write failing `set_design_system` tests**

The first source write must fail until the agent submits a valid design system. Invalid proposals return exact issues and do not mutate `src/index.css`. Valid proposals compile protected CSS and record one operation without granting direct protected-file write access.

- [ ] **Step 3: Run tests and confirm failure**

```bash
bunx vitest run --project unit src/lib/projects/agentic-generator.test.ts
```

Expected: FAIL because current inputs use `ProjectSiteSchema` and no design-system tool exists.

- [ ] **Step 4: Replace schema input with contract and direction**

```ts
export type OutcomeAgenticGenerateInput = {
  abortSignal?: AbortSignal;
  attemptId: string;
  contract: OutcomeDirectedSiteContractV1;
  direction: CreativeDirectionV1;
  projectId: string;
  userId: string;
  operationToken: string;
  revision?: OutcomeRevisionBriefV1;
  initialFiles?: GeneratedProjectFile[];
  onEvent?: AgenticGenerationEventHandler;
  onFileStaged?: (file: GeneratedProjectFile) => void;
  stepCharger?: StepCharger;
};
```

The protected `site.ts` serializes the fact contract projection. Remove direct brief prompt fields that duplicate or weaken contract authority.

- [ ] **Step 5: Add `set_design_system`**

The tool accepts `GeneratedDesignSystemProposalV1`, calls `compileOutcomeDesignSystem`, and updates protected `src/index.css` only on success. It can run again to repair an invalid or visually rejected system. Store the latest accepted proposal in the result.

- [ ] **Step 6: Simplify the implementation prompt**

Keep:

- exact facts and omissions;
- exact actions and route obligations;
- creative direction;
- bundled skill reading;
- objective checks;
- sandbox rules;
- strict anti-fabrication and fake-interaction bans;
- ready-to-publish review dimensions.

Delete recipes, kits, examples, default dials, fixed page patterns, default palette hints, and instructions that require a signature gimmick.

- [ ] **Step 7: Add bounded revision mode**

`runAgenticRevision()` reuses `runAgenticGenerate()` with existing source, existing design system, rendered critique, and immutable contract/direction. Its prompt allows only revisions named by `OutcomeRevisionBriefV1`. It must call `check_app` after changes and cannot change `site.ts`, routes, or action destinations.

- [ ] **Step 8: Keep only objective source failures**

Retain fact literals, prohibited claims, actions, routes, imports, paths, package, media, hidden content, and starter residue as hard failures. Convert card repetition, section rhythm, palette taste, generic gradients, badges, and template resemblance into reviewer signals instead of replacement prescriptions.

- [ ] **Step 9: Run focused tests**

```bash
bunx vitest run --project unit \
  src/lib/projects/agentic-generator.test.ts \
  src/lib/projects/generated-site-gates.test.ts
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/lib/projects/agentic-generator.ts \
  src/lib/projects/agentic-generator.test.ts \
  src/lib/projects/generated-write-policy.ts \
  src/lib/projects/generated-site-gates.ts \
  src/lib/projects/generated-site-gates.test.ts
git commit -m "feat(projects): open creative authority for site agents"
```

### Task 7: Make browser qualification objective-only

**Files:**
- Modify: `src/lib/projects/generated-site-browser-runner.ts`
- Modify: `src/lib/projects/generated-site-browser-runner.test.ts`
- Modify: `src/lib/projects/generated-site-qualification.ts`
- Modify: `src/lib/projects/generated-site-qualification.test.ts`

**Interfaces:**
- Consumes: candidate files, contract routes, exact required visible facts, actions, and design-system proof.
- Produces: `runOutcomeBrowserGates(input)` and `OutcomeBrowserReportV1` with objective assertions, screenshots, geometry, and non-blocking visual signals.

- [ ] **Step 1: Write tests proving layout freedom**

Create centered, asymmetric, editorial-list, and sparse fixtures with identical accepted facts. Assert all can pass when objective behavior is correct. Assert no report requires `data-pattern`, `data-signature`, alternating surfaces, or a specific section count.

- [ ] **Step 2: Run tests and confirm current pattern assumptions fail**

```bash
bunx vitest run --project unit \
  src/lib/projects/generated-site-browser-runner.test.ts \
  src/lib/projects/generated-site-qualification.test.ts
```

Expected: FAIL where current professional hooks or pattern requirements remain.

- [ ] **Step 3: Define objective report output**

```ts
export type OutcomeRouteGeometry = {
  documentWidth: number;
  viewportWidth: number;
  firstActionTop: number | null;
  headingBoxes: Array<{ top: number; right: number; bottom: number; left: number }>;
};

export type OutcomeVisualSignal = {
  kind:
    | "repeated_rectangles"
    | "uniform_spacing"
    | "badge_density"
    | "accent_share"
    | "weak_heading_scale"
    | "large_empty_region";
  evidence: string;
};

export type OutcomeBrowserReportV1 = {
  schemaVersion: 1;
  routes: Array<{
    path: string;
    viewport: "mobile" | "desktop";
    assertions: BrowserAssertionResult[];
    screenshotRef: string;
    geometry: OutcomeRouteGeometry;
    visualSignals: OutcomeVisualSignal[];
  }>;
  outcome: "pass" | "fail" | "infrastructure_error";
};
```

Keep screenshots private. Persist only refs in private evidence, never telemetry.

- [ ] **Step 4: Retain hard objective assertions**

Require route load, console clean, accepted content visibility, exact primary action, links, overflow, contrast, focus, touch targets, image health, media policy, sticky overlap, empty media frames, typography bounds, and first-view action visibility.

- [ ] **Step 5: Record taste clues without failing shape choices**

Record repeated equal rectangles, uniform vertical gaps, excessive badges, accent share, weak heading scale, and large empty regions as `visualSignals`. Do not attach prescribed fixes or hard verdicts.

- [ ] **Step 6: Run focused tests**

```bash
bunx vitest run --project unit \
  src/lib/projects/generated-site-browser-runner.test.ts \
  src/lib/projects/generated-site-qualification.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/projects/generated-site-browser-runner.ts \
  src/lib/projects/generated-site-browser-runner.test.ts \
  src/lib/projects/generated-site-qualification.ts \
  src/lib/projects/generated-site-qualification.test.ts
git commit -m "refactor(projects): keep browser gates layout-neutral"
```

### Task 8: Add independent review and one reviewed revision

**Files:**
- Create: `src/lib/projects/outcome-visual-review.ts`
- Create: `src/lib/projects/outcome-visual-review.test.ts`
- Create: `src/lib/projects/outcome-quality-proof.ts`
- Create: `src/lib/projects/outcome-quality-proof.test.ts`
- Modify: `src/lib/projects/generated-site-call-budget.ts`
- Modify: `src/lib/projects/generated-site-call-budget.test.ts`

**Interfaces:**
- Consumes: contract, direction, objective report, and route screenshot pairs.
- Produces: `OutcomeVisualReviewV1`, `deriveOutcomeVisualVerdict(review)`, `compileOutcomeRevisionBrief(review)`, and `OutcomeQualityProofV1`.

- [ ] **Step 1: Write category completeness and verdict tests**

Use ten exact categories:

```ts
export const OUTCOME_REVIEW_CATEGORIES = [
  "business_specificity",
  "visitor_job_clarity",
  "first_view_hierarchy",
  "content_judgment",
  "composition_rhythm",
  "typography",
  "color_system",
  "mobile_composition",
  "interaction_clarity",
  "professional_finish",
] as const;
```

Test one assessment per category per route, ratings 1 to 4, evidence, reference, required revision below 3, and confidence at least 0.80. Duplicate, missing, malformed, transport, empty, and low-confidence responses become `unknown`.

- [ ] **Step 2: Run tests and confirm failure**

```bash
bunx vitest run --project unit src/lib/projects/outcome-visual-review.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the read-only review call**

The prompt asks the reviewer to judge rendered evidence, not enforce kits. It includes the two decisive questions from the spec and requires screenshot-grounded evidence. It returns assessments only; software derives the verdict.

- [ ] **Step 4: Compile the bounded revision brief**

```ts
export type OutcomeRevisionBriefV1 = {
  schemaVersion: 1;
  contractHash: string;
  directionHash: string;
  issues: Array<{
    route: string;
    category: OutcomeReviewCategory;
    viewport: "mobile" | "desktop" | "both";
    evidence: string;
    requiredOutcome: string;
  }>;
};
```

Include only complete high-confidence assessments below 3. Do not include reviewer-proposed facts, route changes, or unbounded redesign instructions.

- [ ] **Step 5: Expand the call budget**

Track exactly one direction, one build, one or two reviews, and zero or one revision. Reject any sequence with review before objective qualification, revision after final review, or source mutation after final review.

- [ ] **Step 6: Implement sanitized proof**

The proof stores versions, hashes, model IDs, counts, gate statuses, minimum category rating, confidence, correction use, timings, bytes, Energy, and outcome. Sanitization strips facts, source, prompts, reviewer prose, contact values, URLs, and screenshot refs.

- [ ] **Step 7: Run focused tests**

```bash
bunx vitest run --project unit \
  src/lib/projects/outcome-visual-review.test.ts \
  src/lib/projects/outcome-quality-proof.test.ts \
  src/lib/projects/generated-site-call-budget.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/projects/outcome-visual-review.ts \
  src/lib/projects/outcome-visual-review.test.ts \
  src/lib/projects/outcome-quality-proof.ts \
  src/lib/projects/outcome-quality-proof.test.ts \
  src/lib/projects/generated-site-call-budget.ts \
  src/lib/projects/generated-site-call-budget.test.ts
git commit -m "feat(projects): require independent rendered site review"
```

### Task 9: Orchestrate qualification, revision, and final selection

**Files:**
- Create: `src/lib/projects/outcome-generation-pipeline.ts`
- Create: `src/lib/projects/outcome-generation-pipeline.test.ts`
- Modify: `src/lib/projects/build-attempt-worker.ts`
- Modify: `src/lib/projects/build-attempt-worker.test.ts`
- Modify: `src/lib/projects/workspace-release.ts`
- Modify: `src/lib/projects/workspace-release.test.ts`

**Interfaces:**
- Consumes: accepted handoff, generation dependencies, call budget, and last-known-good state.
- Produces: `runOutcomeGenerationPipeline(input)` with `pass`, `fail`, or `infrastructure_error`, candidate files, proof, and selection eligibility.

- [ ] **Step 1: Write orchestration-order tests**

Assert the normal order:

```ts
expect(order).toEqual([
  "contract",
  "direction",
  "build-agent",
  "source",
  "build",
  "browser",
  "review",
  "select",
]);
```

Assert failed first review order adds `revision`, repeats source/build/browser, performs `final-review`, then selects only on pass.

- [ ] **Step 2: Write no-post-review-mutation tests**

Record file hashes before and after final review. Assert no writer, normalizer, repair, or theme compiler runs after final review. A changed hash makes proof invalid and blocks selection.

- [ ] **Step 3: Run tests and confirm failure**

```bash
bunx vitest run --project unit src/lib/projects/outcome-generation-pipeline.test.ts
```

Expected: FAIL because the pipeline does not exist.

- [ ] **Step 4: Implement dependency-injected orchestration**

```ts
export type OutcomeGenerationDependencies = {
  createDirection: typeof runOutcomeCreativeDirection;
  generate: typeof runAgenticGenerate;
  revise: typeof runAgenticRevision;
  qualifySource: typeof qualifyOutcomeSource;
  build: typeof buildGeneratedProject;
  qualifyBrowser: typeof runOutcomeBrowserGates;
  review: typeof runOutcomeVisualReview;
};
```

The pipeline does not write Prisma rows or select deployments. It returns a complete result for the worker transaction boundary.

- [ ] **Step 5: Integrate with the worker transaction**

The worker charges actual calls, stores sanitized proof, and selects source/build/deployment only when pipeline outcome is `pass`. Failed candidates retain private attempt evidence and never overwrite `project.sourceFiles`, current snapshot, Preview, or Production.

- [ ] **Step 6: Add failure-boundary tests**

Cover contract, direction, agent, source, build, browser, first review, revision, final review, Energy, abort, and infrastructure failures. For every failure, assert last-good IDs and source hashes remain unchanged.

- [ ] **Step 7: Run focused tests**

```bash
bunx vitest run --project unit \
  src/lib/projects/outcome-generation-pipeline.test.ts \
  src/lib/projects/build-attempt-worker.test.ts \
  src/lib/projects/workspace-release.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/projects/outcome-generation-pipeline.ts \
  src/lib/projects/outcome-generation-pipeline.test.ts \
  src/lib/projects/build-attempt-worker.ts \
  src/lib/projects/build-attempt-worker.test.ts \
  src/lib/projects/workspace-release.ts \
  src/lib/projects/workspace-release.test.ts
git commit -m "feat(projects): select only reviewed generated sites"
```

### Task 10: Keep builds and failures in discussion

**Files:**
- Modify: `src/components/projects/build/BuildNotices.tsx`
- Modify: `src/components/projects/build/BuildNotices.test.ts`
- Modify: `src/components/projects/workspace/WorkspaceShell.tsx`
- Modify: `src/components/projects/workspace/WorkspaceShell.test.ts`
- Modify: `src/lib/projects/workspace-sync.ts`
- Modify: `src/lib/projects/workspace-sync.test.ts`

**Interfaces:**
- Consumes: build lifecycle, last-good availability, and explicit owner Preview action.
- Produces: one discussion recovery notice and stable `chat` or `preview` surface state.

- [ ] **Step 1: Write failing surface-state tests**

Test that starting a build keeps `mobileSurface === "chat"`, failure keeps or returns it to `chat`, and success does not open Preview without an explicit user action. Test that `Lihat website` opens Preview and displays the selected last-good result.

- [ ] **Step 2: Write a single-placement recovery test**

Render the workspace in `ready_with_failed_latest_attempt`. Assert `Website terakhir masih aman` appears exactly once in the discussion region and zero times in `workspace-preview-panel`.

- [ ] **Step 3: Run tests and confirm failure**

```bash
bunx vitest run --project unit \
  src/components/projects/build/BuildNotices.test.ts \
  src/components/projects/workspace/WorkspaceShell.test.ts \
  src/lib/projects/workspace-sync.test.ts
```

Expected: FAIL because start currently switches to Preview and Preview renders a duplicate recovery notice.

- [ ] **Step 4: Remove automatic Preview switching**

Delete `setActiveTab("preview")` and `setMobileSurface("preview")` from build start. On terminal error, set discussion mode and mobile surface to chat without collapsing the last-good Preview permanently.

- [ ] **Step 5: Remove Preview-side recovery notice**

Keep `CompletedBuildNotice variant="recovery"` only in the discussion composer state. Preview may retain the small in-progress strip only when the owner explicitly opened Preview during an active rebuild.

- [ ] **Step 6: Run focused tests**

```bash
bunx vitest run --project unit \
  src/components/projects/build/BuildNotices.test.ts \
  src/components/projects/workspace/WorkspaceShell.test.ts \
  src/lib/projects/workspace-sync.test.ts
```

Expected: PASS.

- [ ] **Step 7: Run the Impeccable detector once for changed UI files**

```bash
node .agents/skills/impeccable/scripts/detect.mjs --json \
  src/components/projects/build/BuildNotices.tsx \
  src/components/projects/workspace/WorkspaceShell.tsx
```

Expected: no new blocking finding. Fix any finding introduced by this task before committing.

- [ ] **Step 8: Commit**

```bash
git add src/components/projects/build/BuildNotices.tsx \
  src/components/projects/build/BuildNotices.test.ts \
  src/components/projects/workspace/WorkspaceShell.tsx \
  src/components/projects/workspace/WorkspaceShell.test.ts \
  src/lib/projects/workspace-sync.ts \
  src/lib/projects/workspace-sync.test.ts
git commit -m "fix(workspace): keep generation recovery in discussion"
```

### Task 11: Remove active visual templates and synthetic copy

**Files:**
- Delete when imports reach zero: `src/lib/projects/generated-site-recipes.ts`
- Delete: `src/lib/projects/generated-site-recipes.test.ts`
- Delete when imports reach zero: `src/lib/projects/generated-site-design-kits/catalog.ts`
- Delete: `src/lib/projects/generated-site-design-kits/catalog.test.ts`
- Delete: `src/lib/projects/generated-site-design-kits/types.ts`
- Delete when imports reach zero: `src/lib/projects/generated-site-design-plan.ts`
- Delete: `src/lib/projects/generated-site-design-plan.test.ts`
- Delete when imports reach zero: `src/lib/projects/professional-site-kits.ts`
- Delete: `src/lib/projects/professional-site-kits.test.ts`
- Delete when imports reach zero: `src/lib/projects/professional-site-plan.ts`
- Delete: `src/lib/projects/professional-site-plan.test.ts`
- Delete when imports reach zero: `src/lib/projects/professional-site-blueprint.ts`
- Delete: `src/lib/projects/professional-site-blueprint.test.ts`
- Modify: `src/lib/projects/generated-site-contract.ts`
- Modify: `src/lib/projects/generated-site-contract.test.ts`
- Modify: dependent professional evaluation modules and tests

**Interfaces:**
- Consumes: outcome pipeline from Tasks 1 through 9.
- Produces: no active import of recipes, kits, pattern plans, gold examples, or synthetic public-copy helpers.

- [ ] **Step 1: Add an architecture-boundary test**

Create a test in `src/lib/projects/outcome-generation-pipeline.test.ts` that reads the active module graph from explicit imports and asserts no active outcome module imports paths matching:

```ts
/generated-site-recipes|generated-site-design-kits|professional-site-kits|professional-site-plan|professional-site-blueprint/
```

Keep this as an explicit import-boundary assertion, not a runtime file-system scan in production.

- [ ] **Step 2: Run Knip before deletion and record actual import owners**

```bash
bunx knip
```

Expected: existing repository status. Use `git grep` to classify each remaining owner as historical reader, evaluation-only control, or active generation.

- [ ] **Step 3: Remove active imports and duplicate helpers**

Delete `recipeForV2()`, `publicHeadline()`, `publicSubheadline()`, `publicTrustPoints()`, `publicProductCopy()`, and generic CTA-target fallback from new contract compilation. Keep historical parsers isolated under their existing version names only when fixture evidence requires them.

- [ ] **Step 4: Delete unreachable template modules**

Delete each listed module once `git grep` shows no historical selected-artifact reader. If a professional benchmark control still needs old behavior, move only the control entry point under evaluation ownership and ensure production cannot import it.

- [ ] **Step 5: Run focused and dead-code checks**

```bash
bunx vitest run --project unit \
  src/lib/projects/outcome-generation-pipeline.test.ts \
  src/lib/projects/generated-site-contract.test.ts
bunx knip
```

Expected: PASS with no dead exports or deleted-module references.

- [ ] **Step 6: Commit**

Stage only files proven by the import cleanup:

```bash
git add src/lib/projects
git commit -m "refactor(projects): remove visual template engines"
```

Before committing, inspect `git diff --staged --name-only` and unstage unrelated project files if present.

### Task 12: Add private evaluation and release authority

**Files:**
- Modify: `src/lib/projects/generation-evaluation.ts`
- Modify: `src/lib/projects/generation-evaluation.test.ts`
- Modify: `src/lib/projects/generation-evaluation-blind.ts`
- Modify: `src/lib/projects/generation-evaluation-blind.test.ts`
- Modify: `src/lib/projects/professional-site-calibration.ts`
- Modify: `src/lib/projects/professional-site-calibration.test.ts`
- Create: `src/lib/projects/outcome-generation-release.ts`
- Create: `src/lib/projects/outcome-generation-release.test.ts`
- Create: `src/lib/projects/outcome-generation-release.json`
- Modify: evaluation runner scripts selected by `package.json`
- Modify: `package.json`

**Interfaces:**
- Consumes: at least 20 private cases, two trials each, objective proofs, final reviews, and human blind labels.
- Produces: `OutcomeGenerationReleaseManifestV1`, aggregate report, and `assertOutcomeGenerationReleaseAuthority(input)`.

- [ ] **Step 1: Write conjunctive threshold tests**

Test exact minimums:

```ts
const thresholds = {
  completedTreatmentTrials: 40,
  readyToPublishRate: 0.9,
  businessSpecificRate: 0.9,
  maximumTemplateRecognitionRate: 0.1,
  decisivePreferenceRate: 0.75,
  maximumCriticFalseReadyRate: 0.05,
  acceptedHardFailures: 0,
};
```

For each threshold, create one fixture that misses only that threshold and assert release remains blocked. Missing and infrastructure-unknown trials stay in denominators.

- [ ] **Step 2: Extend blind labels**

```ts
export type OutcomeBlindLabel = {
  trialId: string;
  readyToPublish: boolean;
  businessSpecific: boolean;
  sameTemplateAsTrialIds: string[];
  preference: "treatment" | "control" | "tie";
};
```

Require complete paired evidence for each template-recognition label. Keep arm mapping private.

- [ ] **Step 3: Add the blocked release manifest**

```json
{
  "schemaVersion": 1,
  "approved": false,
  "contractVersion": 1,
  "directionPromptVersion": "outcome-direction-v1",
  "buildPromptVersion": "outcome-build-v1",
  "reviewPromptVersion": "outcome-review-v1",
  "allowedWriterModelIds": [],
  "allowedReviewerModelIds": [],
  "ownerApprovedAt": null
}
```

The tracked manifest contains no prompts, source, screenshots, owner copy, contacts, evidence URLs, or private mappings.

- [ ] **Step 4: Gate production selection**

Evaluation mode may run the new pipeline without selection. Production selection requires an approved manifest whose versions and requested/served model IDs match the attempt. A mismatch fails closed and preserves current selected output.

- [ ] **Step 5: Add corpus coverage validation**

Require at least 20 cases covering sparse/rich, all media modes, listed business groups, one to three routes, weak visual preferences, long Indonesian content, and missing optional facts. Include Kilau Laundry and Butik Senja only after synthetic corpus qualification.

- [ ] **Step 6: Run evaluation unit tests**

```bash
bunx vitest run --project unit \
  src/lib/projects/generation-evaluation.test.ts \
  src/lib/projects/generation-evaluation-blind.test.ts \
  src/lib/projects/professional-site-calibration.test.ts \
  src/lib/projects/outcome-generation-release.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/projects/generation-evaluation.ts \
  src/lib/projects/generation-evaluation.test.ts \
  src/lib/projects/generation-evaluation-blind.ts \
  src/lib/projects/generation-evaluation-blind.test.ts \
  src/lib/projects/professional-site-calibration.ts \
  src/lib/projects/professional-site-calibration.test.ts \
  src/lib/projects/outcome-generation-release.ts \
  src/lib/projects/outcome-generation-release.test.ts \
  src/lib/projects/outcome-generation-release.json \
  package.json \
  scripts
git commit -m "feat(projects): gate outcome generation on human evidence"
```

Inspect staged script files before commit and remove unrelated scripts from the stage.

### Task 13: Update canonical documentation and run full local verification

**Files:**
- Modify: `DEV.md`
- Modify: `DESIGN.md`
- Modify: `docs/superpowers/README.md`
- Modify only if visible product semantics changed beyond the approved spec: `PRODUCT.md`
- Modify or mark superseded: relevant generation specs and plans referenced as current

**Interfaces:**
- Consumes: implemented runtime behavior and commands.
- Produces: zero-context documentation for generation, debugging, evaluation, rollout, and recovery.

- [ ] **Step 1: Update `DEV.md` from implemented behavior**

Document:

- fact-only contract blocking;
- creative direction, build, review, revision call order;
- sandbox and design-system tool authority;
- objective versus subjective checks;
- last-known-good and discussion recovery semantics;
- private evidence locations;
- evaluation commands and release manifest;
- served-model authority failures;
- project-ID-first debugging sequence.

Do not document commands that do not exist in `package.json`.

- [ ] **Step 2: Update `DESIGN.md` generated-app section**

Replace kit and fixed-pattern language with outcome ownership:

- platform owns truth, actions, routes, semantic validation, and qualification;
- build agent owns visual execution;
- no default palette or customer-copy fallback;
- reviewer categories and ready-to-publish floor;
- no source mutation after final review.

- [ ] **Step 3: Update the decision index**

Point `docs/superpowers/README.md` to the approved outcome-directed spec and this plan as the current generation decision. Mark the 2026-08-15 professional static-site design as historically implemented but superseded for visual prescription.

- [ ] **Step 4: Run documentation and formatting checks**

```bash
bunx prettier --check DEV.md DESIGN.md PRODUCT.md docs/superpowers
bun scripts/check-doc-links.ts
```

Expected: PASS.

- [ ] **Step 5: Run the full manual gate**

```bash
bun run check
```

Expected: every task reports success: routes, format, lint, typecheck, affected tests, Knip, discipline, and docs.

- [ ] **Step 6: Run generation-specific tests uncached**

```bash
bunx vitest run --project unit \
  src/lib/projects/outcome-site-contract.test.ts \
  src/lib/projects/outcome-creative-direction.test.ts \
  src/lib/projects/outcome-design-system.test.ts \
  src/lib/projects/outcome-visual-review.test.ts \
  src/lib/projects/outcome-generation-pipeline.test.ts \
  src/lib/projects/outcome-quality-proof.test.ts \
  src/lib/projects/outcome-generation-release.test.ts \
  src/lib/projects/agentic-generator.test.ts \
  src/lib/projects/build-attempt-worker.test.ts \
  src/lib/projects/generated-site-browser-runner.test.ts
```

Expected: PASS.

- [ ] **Step 7: Inspect repository cleanliness**

```bash
git status --short --untracked-files=all
git diff --check
git grep -n -E '#f05a28|Profesional & Terpercaya|Berkualitas untuk Kebutuhan Anda|Garansi kualitas' -- src/lib/projects
```

Expected: no accidental artifacts and no forbidden fallback in the active outcome path. Historical fixtures may retain literals only with an explicit historical-test owner.

- [ ] **Step 8: Commit docs**

```bash
git add DEV.md DESIGN.md PRODUCT.md docs/superpowers/README.md docs/superpowers/specs docs/superpowers/plans
git commit -m "docs(projects): document outcome-directed generation"
```

Inspect staged files and omit `PRODUCT.md` or old decision files when they did not require changes.

### Task 14: Run private qualification before production approval

**Files:**
- Private ignored evidence under `.data/generation-evaluation/<run-id>/`
- Modify only after passing evidence and explicit owner approval: `src/lib/projects/outcome-generation-release.json`

**Interfaces:**
- Consumes: configured AI models, browser runtime, 20-case corpus, 40 treatment trials, seeded-defect calibration, and blinded human labels.
- Produces: private evidence, sanitized aggregate metrics, and an approved release manifest only after every threshold passes.

- [ ] **Step 1: Run the outcome-directed corpus in evaluation mode**

Use the implemented `package.json` command. The command must print IDs, counts, timings, and failure classes only. It must not print owner facts, contacts, prompts, source, screenshots, or evidence URLs.

Expected: 40 completed treatment trials with no selection mutation.

- [ ] **Step 2: Complete seeded-defect critic calibration**

Label the private randomized review set with two reviewers and adjudicate threshold disagreements. Require false-ready at most 5% and zero accepted hard fact, action, media, route, security, or critical accessibility defects.

- [ ] **Step 3: Complete blind human review**

Collect readiness, business specificity, paired template recognition, and control preference without exposing engine or model identity.

- [ ] **Step 4: Generate the aggregate report**

Require every release threshold from Task 12. Missing trials, unknown reviews, and infrastructure failures remain in denominators. Do not lower thresholds to approve the run.

- [ ] **Step 5: Obtain explicit product-owner approval**

Present only the sanitized aggregate report and private review UI. Record approval time only after the owner approves the evidence.

- [ ] **Step 6: Update and validate the release manifest**

Set `approved: true`, exact prompt/contract versions, calibrated served model IDs, aggregate counts, and `ownerApprovedAt`. Run the release-manifest unit test and `bun run check`.

- [ ] **Step 7: Commit release authority separately**

```bash
git add src/lib/projects/outcome-generation-release.json
git commit -m "chore(projects): approve outcome generation release"
```

Never include private evidence in this commit.

- [ ] **Step 8: Regenerate real regressions through normal routes**

Trigger Kilau Laundry `cmt2wgjz100ib4l9u2s80q1pc` and Butik Senja through `bun run build:trigger`. Do not edit `.data/project-*`, generated workspaces, snapshots, or database rows manually.

Require for each:

- new attempt and build IDs;
- exact accepted action behavior;
- no fallback customer copy;
- objective gates pass on every route and viewport;
- every final visual category at least 3;
- owner review confirms the result does not look like the same template;
- failed candidates preserve last-known-good.

- [ ] **Step 9: Stop at local release readiness**

Do not push. Report commits, checks, private evaluation outcome, regression evidence IDs, and remaining release workflow. Use `push-dev` only after the user separately asks to push.
