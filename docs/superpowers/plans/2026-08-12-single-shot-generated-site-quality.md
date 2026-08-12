# Single-Shot Generated Site Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make first-generation landing and marketing sites business-specific, visually credible, accessible, and normally complete in one streamed build-model response with p50 end-to-end latency at or below 120 seconds.

**Architecture:** Load the immutable accepted `BuildContractV1`/`BuildPlanV1`, compile a deterministic generated-site contract, accessible theme, media policy, recipe, and one gold example, then require one streamed `<design-plan>` plus `<file>` response. Run deterministic source/content/theme/build/browser gates; invoke the screenshot critic only for risky candidates; allow one targeted visual repair, then pass or fail honestly.

**Tech Stack:** Bun, TypeScript, Vitest, AI SDK `streamText`/`generateText`, Vite, React 19, TanStack Router hash history, Tailwind CSS v4, shadcn/ui, Playwright Core, BullMQ, PostgreSQL/Prisma, private S3-compatible gate evidence.

## Global Constraints

- Scope v1 to `landing` and `marketing_site`; keep `interactive_app` on current behavior until a later approved spec.
- Preserve one normal build-model call; do not restore `ToolLoopAgent` or unrestricted model tools.
- Resolve `feature.builder_photo_enabled` once at attempt start and record it in candidate proof.
- Photo flag off forbids image placeholders, upload-dependent copy, empty image frames, and remote imagery.
- Photo flag on with approved assets uses `/media/<assetId>` only.
- Photo flag on without assets permits local replaceable slots only when the compiled recipe chooses `replaceable_slots`.
- Never fabricate prices, stock, contacts, addresses, hours, testimonials, awards, certifications, guarantees, or regulated claims.
- Keep `src/index.css` and other scaffold-owned files platform-owned.
- Keep generated customer-facing copy Indonesian; keep code, tests, logs, prompts, specs, and internal errors English.
- Reuse existing `BuildContractV1`, `BuildPlanV1`, canonical hash, browser-gate, gate-evidence, visual-critic, candidate-budget, settings, and telemetry modules before adding code.
- No `any`, `as any`, `ts-ignore`, hidden fallback success, unbounded retry, new dependency, or tracked private artifact.
- Every behavior task follows red-green TDD and ends with its focused test command.
- Run `bun run check` before implementation handoff; run `bun run build` only in the final build-pipeline task because this change modifies generated build qualification.
- The frozen corpus contains synthetic public fixtures only; never commit personal account IDs, credentials, raw private prompts, or user screenshots.

---

## File Structure

### New focused modules

- `src/lib/projects/generated-site-contract.ts` — deterministic compiler from accepted contract/plan, typed brief content, approved assets, and photo setting into `GeneratedSiteContractV1`.
- `src/lib/projects/generated-site-contract.test.ts` — contract compilation, sparse content, media policy, and component-name separation tests.
- `src/lib/projects/generated-site-recipes.ts` — versioned recipe catalog and deterministic recipe/gold-example selection.
- `src/lib/projects/generated-site-recipes.test.ts` — coverage and selection tests.
- `src/lib/projects/generated-site-gates.ts` — source/content/CTA/language/starter/media/genericness checks producing structured evidence.
- `src/lib/projects/generated-site-gates.test.ts` — regression fixtures, including the SuryaPhone failure shape.
- `src/lib/projects/generated-site-risk.ts` — deterministic risk report from source/theme/browser evidence.
- `src/lib/projects/generated-site-risk.test.ts` — risk categorization and sampling tests.
- `src/lib/projects/generated-site-browser-runner.ts` — bounded Playwright subprocess orchestration and typed `BrowserGateReport` production.
- `src/lib/projects/generated-site-browser-runner.test.ts` — subprocess-output parsing, timeout, and infrastructure classification tests.
- `scripts/qualify-generated-site.cjs` — isolated Playwright page runner for mobile/desktop assertions and private evidence output.
- `src/lib/projects/generated-site-qualification.ts` — orchestrates browser gates, risk, optional critic, one visual repair, and full requalification.
- `src/lib/projects/generated-site-qualification.test.ts` — clean/risky/repair/failure orchestration tests.
- `fixtures/generation-evaluation/manifest.json` — frozen 12-case schedule, two trials each.
- `fixtures/generation-evaluation/briefs/*.json` — synthetic normalized brief/contract/plan expectations.
- `fixtures/generation-evaluation/gold/*.tsx` — versioned gold example source fixtures.
- `fixtures/generation-evaluation/gold/*.json` — gold example metadata and synthetic content fingerprints.

### Existing modules to modify

- `src/lib/projects/build-attempt-worker.ts` — load accepted handoff, bypass landing/marketing AI spec call, compile contract, invoke qualification, persist proof, select only qualified output.
- `src/lib/projects/build-attempt-worker.batched.test.ts` — worker wiring, no spec call, photo-setting resolution, last-known-good preservation.
- `src/lib/projects/build-handoffs.ts` — add immutable accepted handoff loader returning parsed contract/plan and hashes.
- `src/lib/projects/build-handoffs.test.ts` — ownership/status/hash validation.
- `src/lib/projects/batched-response.ts` — parse one leading `<design-plan>` JSON block and expose it in `BatchedParseResult`.
- `src/lib/projects/batched-response.test.ts` — order, schema, truncation, duplicate, and contradiction parser tests.
- `src/lib/projects/batched-prompt.ts` — consume compiled contract/recipe/example; remove competing generic few-shots and separate implementation-spec dependency.
- `src/lib/projects/batched-generator.ts` — accept compiled contract, enforce design-plan/source gates, expose proof and implicated paths, distinguish technical and visual repairs.
- `src/lib/projects/batched-generator.test.ts` — prompt, contract, gate, repair-budget, and photo-policy tests.
- `src/lib/projects/scaffold/vite-tanstack-shadcn-starter.ts` — replace reusable centered page with neutral non-shipping route marker.
- `src/lib/projects/scaffold/scaffold.test.ts` — assert neutral route and absence of reusable starter composition.
- `src/lib/projects/scaffold/shadcn-theme.ts` — derive accessible semantic foreground roles instead of aliasing muted surface to muted text.
- `src/lib/projects/scaffold/shadcn-theme.test.ts` — WCAG contrast vectors and deterministic output.
- `src/lib/projects/browser-gates.ts` — expand assertions/evidence schema and compute hard browser status.
- `src/lib/projects/browser-gates.test.ts` — visible content, CTA, overflow, image, focus, contrast, and infrastructure behavior.
- `src/lib/projects/visual-critic.ts` — implement structured risk-triggered critic call and report parsing; preserve read-only authority.
- `src/lib/projects/visual-critic.test.ts` — complete/unknown/unavailable/finding tests.
- `src/lib/projects/candidate-qualification.ts` — enable one visual repair only for the new rollout path and expose explicit total call budget.
- `src/lib/projects/candidate-qualification.test.ts` — visual repair exhaustion and child-candidate accounting.
- `src/lib/projects/generated-starter.ts` — extend snapshot proof metadata; do not restore hardcoded variants to live generation.
- `src/lib/projects/generated-source.test.ts` — proof metadata assertions.
- `src/lib/projects/generation-evaluation.ts` — expanded category metrics, latency, critic, repair, and release decision.
- `src/lib/projects/generation-evaluation.test.ts` — thresholds, missing trials, infrastructure denominator, and category hard-failure tests.
- `scripts/run-generation-evaluation.ts` — execute/report the frozen corpus contract without mutating private project data.
- `package.json` — add one corpus command using existing Bun/Playwright dependencies.
- `src/lib/app-settings-registry.ts` — add rollout enum and critic sample rate; retain canonical photo flag.
- `src/lib/app-settings-registry.test.ts` — setting schema, bounds, and defaults.
- `src/routes/-api.admin.settings.test.ts` — validate rollout enum and sample rate.
- `DESIGN.md` — update generated-app quality contract; do not change product UI language.
- `DEV.md` — document corpus and qualification commands.

---

### Task 1: Load and Validate the Immutable Accepted Handoff

**Files:**
- Modify: `src/lib/projects/build-handoffs.ts`
- Modify: `src/lib/projects/build-handoffs.test.ts`
- Modify: `src/lib/projects/build-attempt-worker.ts`
- Modify: `src/lib/projects/build-attempt-worker.batched.test.ts`

**Interfaces:**
- Consumes: `ProjectEditAttempt.handoffId`, `ProjectBuildHandoff.contract`, `ProjectBuildHandoff.plan`, `parseBuildContract`, `parseBuildPlan`, `validatePlanAgainstContract`.
- Produces:

```ts
export type AcceptedBuildHandoff = {
  id: string;
  contract: BuildContractV1;
  plan: BuildPlanV1;
  contractHash: string;
  planHash: string;
  contractRevision: number;
  planRevision: number;
};

export async function loadAcceptedHandoffForAttempt(input: {
  attemptId: string;
  projectId: string;
  userId: string;
}): Promise<AcceptedBuildHandoff>;
```

- Throws stable internal errors: `accepted handoff missing`, `accepted handoff invalid`, `accepted handoff hash mismatch`, or `accepted handoff ownership mismatch`.

- [ ] **Step 1: Write failing handoff-loader tests**

Add cases that create mocked attempt/handoff rows and assert:

```ts
await expect(
  loadAcceptedHandoffForAttempt({
    attemptId: "attempt-1",
    projectId: "project-1",
    userId: "user-1",
  }),
).resolves.toMatchObject({
  id: "handoff-1",
  contractHash: contract.contentHash,
  planHash: plan.contentHash,
  contract,
  plan,
});
```

Also assert rejection when status is not `accepted`, IDs do not match, JSON parsing fails, persisted hashes differ from canonical hashes, or plan validation fails.

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
bunx vitest run src/lib/projects/build-handoffs.test.ts -t "loads the accepted handoff for an attempt"
```

Expected: FAIL because `loadAcceptedHandoffForAttempt` does not exist.

- [ ] **Step 3: Implement the loader with existing parsers and hashes**

Query the attempt with its handoff in one Prisma read. Parse both artifacts. Verify project/user/status, `hashBuildContract(contract)`, `hashBuildPlan(plan)`, persisted hash columns, and `validatePlanAgainstContract` before returning typed values. Do not fall back to `Project.brief` when a contract attempt lacks a valid handoff.

- [ ] **Step 4: Add worker test proving the immutable handoff is loaded before generation**

Mock `loadAcceptedHandoffForAttempt` and assert `runBuildAttempt` invokes it once with the attempt/project/user IDs. Keep current source writer mocked so this test does not call AI or build.

- [ ] **Step 5: Run focused tests**

```bash
bunx vitest run src/lib/projects/build-handoffs.test.ts src/lib/projects/build-attempt-worker.batched.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/projects/build-handoffs.ts src/lib/projects/build-handoffs.test.ts src/lib/projects/build-attempt-worker.ts src/lib/projects/build-attempt-worker.batched.test.ts
git commit -m "refactor(engine): load accepted handoff in build worker"
```

### Task 2: Compile the Generated-Site Contract and Photo Policy

**Files:**
- Create: `src/lib/projects/generated-site-contract.ts`
- Create: `src/lib/projects/generated-site-contract.test.ts`
- Modify: `src/lib/projects/build-attempt-worker.ts`
- Modify: `src/lib/projects/build-attempt-worker.batched.test.ts`

**Interfaces:**
- Consumes: `BuildContractV1`, `BuildPlanV1`, `ProjectBrief`, `feature.builder_photo_enabled`, approved `ContractAsset[]`, existing rich-field types.
- Produces:

```ts
export type GeneratedSiteMediaMode =
  | "owner_assets"
  | "replaceable_slots"
  | "graphic"
  | "typographic";

export type GeneratedSiteContractV1 = {
  schemaVersion: 1;
  contractHash: string;
  business: {
    name: string;
    type: string;
    audience: string | null;
    primaryJob: string;
    primaryCta: {
      kind: "whatsapp" | "phone" | "visit" | "browse" | "other";
      label: string;
      target: string;
    };
  };
  content: {
    headline: string;
    subheadline: string;
    offer: string;
    promotion: string | null;
    trustPoints: string[];
    products: SiteSchemaProduct[];
    testimonials: SiteSchemaTestimonial[];
    faq: SiteSchemaFaqItem[];
    usp: string[];
    hours: HoursValue[];
    paymentMethods: PaymentMethodValue[];
    priceRange: string | null;
    address: string | null;
    deliveryArea: string | null;
    socialLinks: SocialLinkValue[];
  };
  page: {
    appKind: "landing" | "marketing_site";
    archetype: string;
    routes: Array<{
      path: string;
      purpose: string;
      requiredContent: string[];
    }>;
    requiredSections: Array<{
      id: string;
      purpose: string;
      requiredContent: string[];
    }>;
    prohibitedClaims: string[];
  };
  design: {
    recipeId: string;
    recipeVersion: 1;
    composition: string;
    hierarchy: string[];
    typographyStrategy: string;
    colorStrategy: string;
    mediaMode: GeneratedSiteMediaMode;
    approvedAssets: Array<{
      assetId: string;
      mediaPath: string;
      purpose: "logo" | "hero" | "product" | "gallery" | "reference";
    }>;
    signatureElement: string;
    antiPatterns: string[];
  };
};

export type GeneratedSiteContractCompileInput = {
  contract: BuildContractV1;
  plan: BuildPlanV1;
  brief: ProjectBrief;
  photoEnabled: boolean;
};

export function compileGeneratedSiteContract(
  input: GeneratedSiteContractCompileInput,
): GeneratedSiteContractV1;
```

- [ ] **Step 1: Write failing tests for factual and content mapping**

Assert owner facts become typed content, primary visitor job/CTA are required, plan routes become route obligations, and prohibited claims are copied. Assert visible section purposes derive from page sections and content—not component names or `ImplementationSpec.components`.

- [ ] **Step 2: Write the photo matrix tests**

```ts
expect(compile({ photoEnabled: false, assets: [] }).design.mediaMode).toMatch(
  /graphic|typographic/,
);
expect(compile({ photoEnabled: true, assets: [hero] }).design.mediaMode).toBe(
  "owner_assets",
);
expect(compile({ photoEnabled: true, assets: [] }).design.mediaMode).toBe(
  "replaceable_slots",
);
```

Also assert photo-off contracts contain no placeholder permission and approved asset paths normalize to `/media/<assetId>`.

- [ ] **Step 3: Run tests and verify failure**

```bash
bunx vitest run src/lib/projects/generated-site-contract.test.ts
```

Expected: FAIL because the compiler does not exist.

- [ ] **Step 4: Implement the minimal pure compiler**

Use exhaustive fact-kind switches. Fail when primary job/CTA is absent, CTA target cannot be resolved, `appKind` is `interactive_app`, or a plan/content reference is invalid. Build the contract hash with `canonicalJson` plus a generated-site-specific prefix and `node:crypto`; do not weaken existing handoff hashes.

For `replaceable_slots`, require both `photoEnabled=true` and an image-benefiting recipe tag supplied in Task 3; until then expose a compiler dependency that receives the selected recipe media recommendation.

- [ ] **Step 5: Resolve the photo flag once in the worker**

Read:

```ts
const photoEnabled = getSettingSync("feature.builder_photo_enabled", true);
```

before compilation, pass it into the compiler, and retain it in the generation proof object. Do not reread it during writer/repair/browser phases.

- [ ] **Step 6: Add worker tests for flag off/on**

Mock `getSettingSync` to return false and true. Assert the compiled contract passed to `runBatchedGenerate` carries the expected media mode and the same resolved boolean is used in metadata.

- [ ] **Step 7: Run focused tests**

```bash
bunx vitest run src/lib/projects/generated-site-contract.test.ts src/lib/projects/build-attempt-worker.batched.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/projects/generated-site-contract.ts src/lib/projects/generated-site-contract.test.ts src/lib/projects/build-attempt-worker.ts src/lib/projects/build-attempt-worker.batched.test.ts
git commit -m "feat(engine): compile generated-site contract"
```

### Task 3: Add Versioned Recipes and One Gold Example

**Files:**
- Create: `src/lib/projects/generated-site-recipes.ts`
- Create: `src/lib/projects/generated-site-recipes.test.ts`
- Create: `fixtures/generation-evaluation/gold/retail-catalog-no-photo.tsx`
- Create: `fixtures/generation-evaluation/gold/retail-catalog-slots.tsx`
- Create: `fixtures/generation-evaluation/gold/fnb-menu-no-photo.tsx`
- Create: `fixtures/generation-evaluation/gold/service-area-no-photo.tsx`
- Create: `fixtures/generation-evaluation/gold/service-appointment-no-photo.tsx`
- Create: `fixtures/generation-evaluation/gold/property-rental-no-photo.tsx`
- Create: `fixtures/generation-evaluation/gold/education-course-no-photo.tsx`
- Create: `fixtures/generation-evaluation/gold/service-online-no-photo.tsx`
- Create: `fixtures/generation-evaluation/gold/generic-no-photo.tsx`
- Create: matching `fixtures/generation-evaluation/gold/*.json` metadata files

**Interfaces:**
- Consumes: `BuildPlanV1.archetype`, content shape, photo setting/assets.
- Produces:

```ts
export type GeneratedSiteRecipeV1 = {
  id: string;
  version: 1;
  compatibleArchetypes: string[];
  composition: string;
  hierarchy: string[];
  preferredPatterns: string[];
  avoidPatterns: string[];
  mediaGuidance: Record<GeneratedSiteMediaMode, string>;
  imageBenefiting: boolean;
  requiredBrowserAssertions: string[];
  riskTags: string[];
};

export type GeneratedSiteGoldExample = {
  id: string;
  version: 1;
  recipeId: string;
  mediaModes: GeneratedSiteMediaMode[];
  source: string;
  forbiddenLiterals: string[];
};

export function selectGeneratedSiteRecipe(archetype: string): GeneratedSiteRecipeV1;
export function selectGeneratedSiteGoldExample(input: {
  recipeId: string;
  mediaMode: GeneratedSiteMediaMode;
}): GeneratedSiteGoldExample;
```

- [ ] **Step 1: Write failing catalog coverage tests**

Assert every current `KNOWN_ARCHETYPE_IDS` entry maps to exactly one recipe or the explicit `generic` recipe. Assert every recipe has at least one compatible gold example for image-free media; image-benefiting recipes also have a `replaceable_slots` example.

- [ ] **Step 2: Write gold-fixture integrity tests**

For each fixture, assert:

- no starter marker
- no remote URL
- no `Lorem`, `Products`, `Testimonials`, or copied business name
- no hidden facts or exact phone/price/address literals
- responsive mobile base classes precede desktop variants
- at least one recipe signature element is represented
- placeholder references occur only in `replaceable_slots` examples

- [ ] **Step 3: Run tests and verify failure**

```bash
bunx vitest run src/lib/projects/generated-site-recipes.test.ts
```

Expected: FAIL because catalog and fixtures do not exist.

- [ ] **Step 4: Implement the recipe catalog**

Use a direct readonly object map, not factories or inheritance. Map related archetypes to one recipe where composition is genuinely shared. Keep exact version `1` in each entry.

- [ ] **Step 5: Author one concise gold example per recipe/media need**

Each source fixture must demonstrate layout hierarchy, varied section treatment, semantic classes, correct CTA/anchor mechanics, mobile behavior, and no private or realistic claims. Keep examples short enough to preserve the one-call latency budget.

- [ ] **Step 6: Integrate recipe selection into contract compilation**

Update `compileGeneratedSiteContract` to receive selected recipe/example identity and choose:

```ts
photoEnabled === false
  ? recipe.imageBenefiting
    ? "graphic"
    : "typographic"
  : approvedAssets.length > 0
    ? "owner_assets"
    : recipe.imageBenefiting
      ? "replaceable_slots"
      : "graphic";
```

- [ ] **Step 7: Run focused tests**

```bash
bunx vitest run src/lib/projects/generated-site-recipes.test.ts src/lib/projects/generated-site-contract.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/projects/generated-site-recipes.ts src/lib/projects/generated-site-recipes.test.ts src/lib/projects/generated-site-contract.ts src/lib/projects/generated-site-contract.test.ts fixtures/generation-evaluation/gold
git commit -m "feat(engine): add generated-site design recipes"
```

### Task 4: Compile Accessible Semantic Theme Tokens

**Files:**
- Modify: `src/lib/projects/scaffold/shadcn-theme.ts`
- Create: `src/lib/projects/scaffold/shadcn-theme.test.ts`
- Modify: `src/lib/projects/scaffold/scaffold.test.ts`

**Interfaces:**
- Consumes: `ProjectSiteSchema.theme` or the equivalent compiled palette.
- Produces:

```ts
export type ThemeContrastCheck = {
  role: string;
  foreground: string;
  background: string;
  ratio: number;
  minimum: number;
  pass: boolean;
};

export type CompiledShadcnTheme = {
  css: string;
  checks: ThemeContrastCheck[];
};

export function compileShadcnTheme(schema: ProjectSiteSchema): CompiledShadcnTheme;
export function contrastRatio(foreground: string, background: string): number;
```

Keep `shadcnThemeCss(schema)` as the compatibility entry point returning `compileShadcnTheme(schema).css` until all callers migrate.

- [ ] **Step 1: Write the failing SuryaPhone regression test**

Use background `#0D0D0D`, foreground `#F0EDE5`, muted `#1C1C1C`, accent `#C9A84C`. Assert compiled `muted-foreground` contrasts with `background` and `muted` at least 4.5:1; assert it is not `#1C1C1C`.

- [ ] **Step 2: Add fixed WCAG vectors**

Test black/white, dark/light accent foreground, invalid hex rejection, deterministic output, normal text 4.5:1, large text 3:1, and focus ring 3:1.

- [ ] **Step 3: Run tests and verify failure**

```bash
bunx vitest run src/lib/projects/scaffold/shadcn-theme.test.ts
```

Expected: FAIL because `compileShadcnTheme` and proper contrast derivation do not exist.

- [ ] **Step 4: Implement sRGB luminance and deterministic readable-role derivation**

Use WCAG relative luminance, not the current weighted 0.299 heuristic. Pick between supplied foreground and a bounded mix toward black/white until the threshold passes. Throw on non-six-digit hex at the contract boundary; never emit unsafe fallback colors.

- [ ] **Step 5: Keep CSS ownership unchanged**

Ensure `src/index.css` remains generated by the platform and exposes the same Tailwind variable names. Do not permit writer palette overrides.

- [ ] **Step 6: Run focused tests**

```bash
bunx vitest run src/lib/projects/scaffold/shadcn-theme.test.ts src/lib/projects/scaffold/scaffold.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/projects/scaffold/shadcn-theme.ts src/lib/projects/scaffold/shadcn-theme.test.ts src/lib/projects/scaffold/scaffold.test.ts
git commit -m "fix(engine): compile accessible generated themes"
```

### Task 5: Extend the Stream Contract with a Required Design Plan

**Files:**
- Modify: `src/lib/projects/batched-response.ts`
- Modify: `src/lib/projects/batched-response.test.ts`
- Modify: `src/lib/projects/batched-prompt.ts`
- Modify: `src/lib/projects/batched-generator.ts`
- Modify: `src/lib/projects/batched-generator.test.ts`

**Interfaces:**
- Consumes: `GeneratedSiteContractV1`, `GeneratedSiteRecipeV1`, `GeneratedSiteGoldExample`.
- Produces:

```ts
export type WriterDesignPlanV1 = {
  contractHash: string;
  recipeId: string;
  mediaMode: GeneratedSiteMediaMode;
  visualThesis: string;
  hierarchy: string[];
  sectionOrder: string[];
  signatureElement: string;
};

export type BatchedParseResult = {
  designPlan: WriterDesignPlanV1 | null;
  diagnostics: BatchedDiagnostic[];
  done: { summary: string } | null;
  files: Map<string, BatchedFile>;
  proposals: { path: string; reason: string }[];
};
```

Update:

```ts
export function buildBatchedWriterPrompt(input: {
  contract: GeneratedSiteContractV1;
  recipe: GeneratedSiteRecipeV1;
  example: GeneratedSiteGoldExample;
  projectId: string;
  schema: ProjectSiteSchema;
}): { system: string; user: string };
```

- [ ] **Step 1: Write parser tests for required order and schema**

Test one valid `<design-plan>` followed by files/done. Reject files before plan, duplicate plan, unknown fields, wrong scalar types, malformed JSON, truncation, and missing plan at finalize.

- [ ] **Step 2: Run parser tests and verify failure**

```bash
bunx vitest run src/lib/projects/batched-response.test.ts -t "design-plan"
```

Expected: FAIL.

- [ ] **Step 3: Implement strict plan parsing**

Parse raw JSON between `<design-plan>` tags with a bounded size of 8 KiB. Validate fields explicitly with `unknown` narrowing. Do not add a new schema dependency. Preserve streaming file staging after the plan closes.

- [ ] **Step 4: Replace competing few-shots with one selected example**

Remove the three static hero examples from `batched-prompt.ts`. Prompt order:

1. immutable generated-site contract
2. selected recipe, explicitly higher priority than example
3. one gold example
4. response contract
5. scaffold manifest

State that example copy, names, literals, URLs, and visual identity must never be copied.

- [ ] **Step 5: Add design-plan conformance checks**

Before accepting files, assert exact contract hash, recipe ID, media mode, all required section IDs represented in order, and signature element matching the contract. Return structured diagnostics with `code`, `path` when relevant, and actionable message.

- [ ] **Step 6: Make format/truncation repair preserve the plan contract**

Update repair prompts so format repair re-emits the full design plan when it was not safely parsed; truncation resume must not duplicate an already accepted plan. Targeted source repair receives the accepted plan read-only and emits files only.

- [ ] **Step 7: Run focused tests**

```bash
bunx vitest run src/lib/projects/batched-response.test.ts src/lib/projects/batched-generator.test.ts src/lib/projects/batched-generator.truncated-retry.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/projects/batched-response.ts src/lib/projects/batched-response.test.ts src/lib/projects/batched-prompt.ts src/lib/projects/batched-generator.ts src/lib/projects/batched-generator.test.ts src/lib/projects/batched-generator.truncated-retry.test.ts
git commit -m "feat(engine): require streamed design plan"
```

### Task 6: Neutralize the Scaffold and Add Deterministic Quality Gates

**Files:**
- Create: `src/lib/projects/generated-site-gates.ts`
- Create: `src/lib/projects/generated-site-gates.test.ts`
- Modify: `src/lib/projects/scaffold/vite-tanstack-shadcn-starter.ts`
- Modify: `src/lib/projects/scaffold/scaffold.test.ts`
- Modify: `src/lib/projects/batched-generator.ts`
- Modify: `src/lib/projects/batched-generator.test.ts`
- Modify: `src/lib/projects/high-risk-claims.ts`
- Modify: `src/lib/projects/high-risk-claims.test.ts`

**Interfaces:**
- Consumes: compiled contract, writer design plan, staged files, compiled theme checks, starter fingerprint.
- Produces:

```ts
export type GeneratedSiteGateCategory =
  | "contract"
  | "content"
  | "cta"
  | "language"
  | "starter"
  | "media"
  | "claims"
  | "accessibility"
  | "genericness";

export type GeneratedSiteGateFinding = {
  category: GeneratedSiteGateCategory;
  severity: "critical" | "high" | "medium" | "low";
  code: string;
  message: string;
  path?: string;
  selector?: string;
};

export type GeneratedSiteSourceGateReportV1 = {
  version: 1;
  status: "pass" | "fail";
  findings: GeneratedSiteGateFinding[];
  riskSignals: GeneratedSiteGateFinding[];
};

export function inspectGeneratedSiteSource(input: {
  contract: GeneratedSiteContractV1;
  designPlan: WriterDesignPlanV1;
  files: GeneratedProjectFile[];
  starterIndexSource: string;
  themeChecks: ThemeContrastCheck[];
}): GeneratedSiteSourceGateReportV1;
```

- [ ] **Step 1: Freeze the SuryaPhone failure as a synthetic test fixture**

Embed a sanitized route/site/theme fixture reproducing:

- starter marker
- `max-w-3xl` starter shell fingerprint
- English section headings
- `hash="kontak"` without `id="kontak"`
- `href={link.handle}`
- visible `HeroSection`/`ProductCard`
- no media despite contract mode
- omitted USP/payment/address/delivery fields
- unreadable muted foreground

Assert the report fails with exact categories/codes.

- [ ] **Step 2: Add focused gate tests**

Cover valid sparse page, valid image-free retail composition, duplicate anchor, missing route, generic repeated-card risk, all-card hard failure only when recipe forbids it, invalid social href, customer-facing English, gold-example literal leakage, prohibited claim, and photo-mode matrix.

- [ ] **Step 3: Run tests and verify failure**

```bash
bunx vitest run src/lib/projects/generated-site-gates.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Replace the starter page with a neutral marker**

The scaffold route must compile but contain only the required export/hook and a stable marker such as `data-generated-site-starter`. It must not contain a hero, card, CTA, business content, centered max-width shell, or reusable visual hierarchy. The source gate rejects the marker in final output.

- [ ] **Step 5: Implement source/content/CTA/media/language checks**

Use TypeScript AST for JSX-visible `site.*`, headings, anchors, and links. Use exact contract required-content mapping rather than the current fixed `RENDER_REQUIRED_SITE_FIELDS`. Treat technical headings and broken CTA targets as hard failures. Treat structural sameness and weak hierarchy as risk unless unambiguously starter-derived.

- [ ] **Step 6: Reuse and harden high-risk claim scanning**

Compare high-risk literals against normalized contract facts/prohibited claims instead of rejecting every raw owner-approved fact. Reject literals absent from the contract. Keep the scanner finite and versioned.

- [ ] **Step 7: Replace current gate wiring**

Call `inspectGeneratedSiteSource` from `gateStage`. Convert hard findings into targeted-repair diagnostics. Carry risk signals forward without invoking repair before browser evidence.

- [ ] **Step 8: Run focused tests**

```bash
bunx vitest run src/lib/projects/generated-site-gates.test.ts src/lib/projects/batched-generator.test.ts src/lib/projects/scaffold/scaffold.test.ts src/lib/projects/high-risk-claims.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/projects/generated-site-gates.ts src/lib/projects/generated-site-gates.test.ts src/lib/projects/scaffold/vite-tanstack-shadcn-starter.ts src/lib/projects/scaffold/scaffold.test.ts src/lib/projects/batched-generator.ts src/lib/projects/batched-generator.test.ts src/lib/projects/high-risk-claims.ts src/lib/projects/high-risk-claims.test.ts
git commit -m "feat(engine): enforce generated-site quality floor"
```

### Task 7: Run Real Desktop and Mobile Browser Gates

**Files:**
- Modify: `src/lib/projects/browser-gates.ts`
- Modify: `src/lib/projects/browser-gates.test.ts`
- Create: `src/lib/projects/generated-site-browser-runner.ts`
- Create: `src/lib/projects/generated-site-browser-runner.test.ts`
- Create: `scripts/qualify-generated-site.cjs`
- Modify: `src/lib/projects/gate-evidence.ts`
- Modify: `src/lib/projects/gate-evidence.test.ts`

**Interfaces:**
- Consumes: built `distFiles`, contract routes/assertions, contract CTA, media mode, private evidence scope.
- Produces:

```ts
export type BrowserAssertionName =
  | "route-load"
  | "console-clean"
  | "required-content-visible"
  | "primary-cta"
  | "internal-links"
  | "horizontal-overflow"
  | "heading-overflow"
  | "image-health"
  | "media-policy"
  | "computed-contrast"
  | "focus-visible"
  | "touch-target";

export async function runGeneratedSiteBrowserGates(input: {
  projectId: string;
  candidateId: string;
  files: GeneratedDistFile[];
  contract: GeneratedSiteContractV1;
  timeoutMs: number;
}): Promise<BrowserGateReport>;
```

- [ ] **Step 1: Expand browser report tests**

Assert every route has mobile and desktop reports, an infrastructure error never passes, missing required evidence fails, and hard assertion failure sets overall status `fail`.

- [ ] **Step 2: Write runner parser tests**

Feed synthetic subprocess JSON for pass/fail/timeout/malformed output. Assert one infrastructure retry maximum and stable classification.

- [ ] **Step 3: Run tests and verify failure**

```bash
bunx vitest run src/lib/projects/browser-gates.test.ts src/lib/projects/generated-site-browser-runner.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Implement the isolated Playwright script**

Reuse the artifact-server and browser executable resolution patterns from `project-thumbnail.ts`/`capture-project-thumbnail.cjs`. Use contexts:

```js
{ viewport: { width: 390, height: 844 }, locale: "id-ID", reducedMotion: "reduce" }
{ viewport: { width: 1440, height: 1000 }, locale: "id-ID", reducedMotion: "reduce" }
```

Block external network. Collect console/page errors, computed visibility, scroll width, bounding boxes, computed color/background, focus style, image completion/natural width, CTA href, anchor targets, and JPEG screenshots. Print bounded JSON metadata to stdout; write image bytes to temporary files supplied by the parent, never stdout JSON.

- [ ] **Step 5: Store private evidence**

Extend gate evidence to support screenshot bytes with `image/jpeg` while retaining candidate/project/route/viewport scoping and 30-day expiration metadata. Store DOM/report JSON separately. Do not log refs in public telemetry.

- [ ] **Step 6: Implement the parent runner**

Start the same artifact server used for thumbnail capture, spawn the script, bound routes to six, timeout each navigation at 10 seconds, retry one infrastructure failure, store evidence, and return a typed report. Ensure server, child, temp files, context, and browser close in `finally` paths.

- [ ] **Step 7: Add a live-opt-in browser smoke test**

Use `RUN_GENERATED_SITE_BROWSER_TESTS=1` to exercise a small built fixture. Default unit runs test parsing/orchestration without requiring Chromium. The opt-in test asserts no overflow and valid CTA at both viewports.

- [ ] **Step 8: Run focused tests**

```bash
bunx vitest run src/lib/projects/browser-gates.test.ts src/lib/projects/generated-site-browser-runner.test.ts src/lib/projects/gate-evidence.test.ts
```

Expected: PASS.

When Chromium is installed:

```bash
RUN_GENERATED_SITE_BROWSER_TESTS=1 bunx vitest run src/lib/projects/generated-site-browser-runner.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/projects/browser-gates.ts src/lib/projects/browser-gates.test.ts src/lib/projects/generated-site-browser-runner.ts src/lib/projects/generated-site-browser-runner.test.ts scripts/qualify-generated-site.cjs src/lib/projects/gate-evidence.ts src/lib/projects/gate-evidence.test.ts
git commit -m "feat(engine): qualify generated sites in browser"
```

### Task 8: Add Risk-Triggered Critic and One Visual Repair

**Files:**
- Create: `src/lib/projects/generated-site-risk.ts`
- Create: `src/lib/projects/generated-site-risk.test.ts`
- Modify: `src/lib/projects/visual-critic.ts`
- Modify: `src/lib/projects/visual-critic.test.ts`
- Modify: `src/lib/projects/candidate-qualification.ts`
- Modify: `src/lib/projects/candidate-qualification.test.ts`
- Create: `src/lib/projects/generated-site-qualification.ts`
- Create: `src/lib/projects/generated-site-qualification.test.ts`
- Modify: `src/lib/projects/batched-prompt.ts`
- Modify: `src/lib/projects/batched-generator.ts`

**Interfaces:**
- Consumes: source risk signals, browser report/evidence, generated-site contract, writer plan, recipe, candidate budget.
- Produces:

```ts
export type GeneratedSiteRiskReportV1 = {
  version: 1;
  risky: boolean;
  reasons: Array<{
    category:
      | "borderline_contrast"
      | "business_fit"
      | "content_density"
      | "genericness"
      | "hierarchy"
      | "image_led"
      | "novel_recipe"
      | "render_contract_mismatch"
      | "sampled";
    route: string;
    viewport: "mobile" | "desktop";
    evidence: string;
  }>;
};

export type GeneratedSiteQualificationResult =
  | {
      ok: true;
      files: GeneratedProjectFile[];
      browserReport: BrowserGateReport;
      riskReport: GeneratedSiteRiskReportV1;
      criticReport: VisualCriticReport | null;
      visualRepairCount: 0 | 1;
    }
  | {
      ok: false;
      reason: string;
      browserReport?: BrowserGateReport;
      riskReport?: GeneratedSiteRiskReportV1;
      criticReport?: VisualCriticReport;
      visualRepairCount: 0 | 1;
    };
```

- [ ] **Step 1: Write risk classifier tests**

Assert image-led, borderline contrast, genericness, density, contract mismatch, novel recipe, and deterministic sample selection produce evidence. Assert a clean known recipe with hard gates passing remains non-risky.

Use a stable hash of attempt/candidate ID for sampling; never `Math.random()`.

- [ ] **Step 2: Write critic parsing tests**

Mock `generateText` structured JSON response. Assert findings validate categories/severity/viewports/confidence, unavailable evidence yields `unknown`, transport failure yields `unavailable`, and the critic cannot return source mutations.

- [ ] **Step 3: Write qualification orchestration tests**

Cover:

1. clean build: no critic, no repair
2. risky build + critic pass: no repair
3. risky build + critic fail: one repair, all gates rerun, pass
4. repair still fails: honest failure
5. critic unknown/unavailable during internal/pilot: fail closed
6. visual repair budget exhausted: no second call

- [ ] **Step 4: Run tests and verify failure**

```bash
bunx vitest run src/lib/projects/generated-site-risk.test.ts src/lib/projects/visual-critic.test.ts src/lib/projects/generated-site-qualification.test.ts src/lib/projects/candidate-qualification.test.ts
```

Expected: FAIL.

- [ ] **Step 5: Implement deterministic risk**

Merge source risk signals and browser evidence. Include a `sampleRate` input clamped to `0..1`; use SHA-256 first 32 bits divided by `0xffffffff` for stable selection.

- [ ] **Step 6: Implement the read-only critic**

Use the configured build model with no tools, bounded timeout, structured text JSON parsing, and sanitized `AiCallRecord` phase `visual-critic`. Supply private screenshot evidence to the model through the existing approved multimodal provider path; never persist the resulting prompt. If the current provider adapter cannot send images, return `unavailable` and keep rollout off rather than sending public URLs.

- [ ] **Step 7: Enable exactly one visual repair in the qualification budget**

Change `createQualificationRunBudget` to accept:

```ts
createQualificationRunBudget({ visualRepairEnabled: boolean })
```

Return `visualRepairsRemaining: 1` only for enabled landing/marketing qualification. Keep compile/browser limits explicit and record every consumption.

- [ ] **Step 8: Implement the visual repair prompt**

Pass contract, accepted design plan, recipe, exact findings, and implicated editable files. Output file blocks only. Prohibit contract/theme/topology changes. Charge/record phase `visual-repair`. After merge, invoke the complete source/build/browser/risk/critic path again.

- [ ] **Step 9: Implement qualification orchestration**

Keep this module pure over injected dependencies where possible so tests do not launch browsers/models. Count child candidates with `QualificationRunBudgetImpl.createdCandidate()` and return structured failure rather than throwing after expected quality failure.

- [ ] **Step 10: Run focused tests**

```bash
bunx vitest run src/lib/projects/generated-site-risk.test.ts src/lib/projects/visual-critic.test.ts src/lib/projects/generated-site-qualification.test.ts src/lib/projects/candidate-qualification.test.ts src/lib/projects/batched-generator.test.ts
```

Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add src/lib/projects/generated-site-risk.ts src/lib/projects/generated-site-risk.test.ts src/lib/projects/visual-critic.ts src/lib/projects/visual-critic.test.ts src/lib/projects/candidate-qualification.ts src/lib/projects/candidate-qualification.test.ts src/lib/projects/generated-site-qualification.ts src/lib/projects/generated-site-qualification.test.ts src/lib/projects/batched-prompt.ts src/lib/projects/batched-generator.ts
git commit -m "feat(engine): add risk-triggered visual qualification"
```

### Task 9: Wire Qualification, Proof, Rollout, and Remove the Extra Spec Call

**Files:**
- Modify: `src/lib/projects/build-attempt-worker.ts`
- Modify: `src/lib/projects/build-attempt-worker.batched.test.ts`
- Modify: `src/lib/projects/generated-starter.ts`
- Modify: `src/lib/projects/generated-source.test.ts`
- Modify: `src/lib/projects/generation-observability.ts`
- Modify: `src/lib/projects/generation-observability.test.ts`
- Modify: `src/lib/app-settings-registry.ts`
- Modify: `src/lib/app-settings-registry.test.ts`
- Modify: `src/routes/-api.admin.settings.test.ts`

**Interfaces:**
- Consumes: accepted handoff, compiled contract, rollout setting, qualification result.
- Produces settings:

```text
feature.generated_site_quality_rollout = off | internal | pilot | all
quality.generated_site_critic_sample_rate = number 0..1
```

- `off` uses the current batched prompt/gates without old tool loops.
- `internal` applies to admin-email owners.
- `pilot` applies to admin-email owners and approved waitlist users.
- `all` applies to every landing/marketing build.

- [ ] **Step 1: Write setting tests**

Assert rollout is an advanced string enum with fallback `off`; sample rate is an advanced number with fallback `0.1`, minimum `0`, maximum `1`. Assert admin API accepts valid values and rejects invalid enum/range values.

- [ ] **Step 2: Write worker test proving no implementation-spec AI call**

For enabled landing/marketing quality path, assert:

```ts
expect(generateTextMock).not.toHaveBeenCalledWith(
  expect.objectContaining({ tools: expect.anything() }),
);
expect(runBatchedGenerateMock).toHaveBeenCalledWith(
  expect.objectContaining({ contract: expect.any(Object) }),
);
```

Assert `interactive_app` retains the current spec/generation path until later scope.

- [ ] **Step 3: Write qualification selection tests**

Assert the worker does not mark build/snapshot/deployment successful before qualification passes. On qualification failure, the previous selected snapshot/deployment remains untouched and the new attempt/build becomes failed.

- [ ] **Step 4: Run tests and verify failure**

```bash
bunx vitest run src/lib/app-settings-registry.test.ts src/routes/-api.admin.settings.test.ts src/lib/projects/build-attempt-worker.batched.test.ts src/lib/projects/generated-source.test.ts src/lib/projects/generation-observability.test.ts
```

Expected: FAIL.

- [ ] **Step 5: Implement rollout resolution**

Add a focused helper in `build-attempt-worker.ts` or a small existing settings module only if reused by tests. Resolve owner email and approved waitlist status once. Do not reintroduce `generation.batched_rollout` or change sticky `generationEngine`.

- [ ] **Step 6: Remove the landing/marketing implementation-spec call**

After accepted handoff loading and contract compilation are active, bypass `generateImplementationSpec` for enabled landing/marketing builds. Remove now-unused imports/functions only when Knip confirms they have no other consumers. Do not delete `implementation-spec.ts` while interactive/current paths still consume it.

- [ ] **Step 7: Wire full qualification before success transaction**

Order:

```text
writer -> source gates -> build -> browser/risk/critic/repair qualification
-> snapshot proof update -> build success -> deployment selection -> thumbnail
```

A failed candidate must not update active handoff, selected snapshot, successful deployment, or project ready state.

- [ ] **Step 8: Persist proof metadata**

Extend `createGeneratedSourceSnapshotMetadata` input with a typed quality proof and record contract/recipe/example/design-plan/gate/risk/critic/repair/timing versions and outcomes. Store no owner copy, screenshot URL, or prompt.

- [ ] **Step 9: Extend sanitized telemetry**

Add only category counts, booleans, versions, recipe ID, media mode, stage timings, critic invoked, repair count, and outcome. Test screenshot refs and business text are dropped.

- [ ] **Step 10: Run focused tests**

```bash
bunx vitest run src/lib/app-settings-registry.test.ts src/routes/-api.admin.settings.test.ts src/lib/projects/build-attempt-worker.batched.test.ts src/lib/projects/generated-source.test.ts src/lib/projects/generation-observability.test.ts
```

Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add src/lib/projects/build-attempt-worker.ts src/lib/projects/build-attempt-worker.batched.test.ts src/lib/projects/generated-starter.ts src/lib/projects/generated-source.test.ts src/lib/projects/generation-observability.ts src/lib/projects/generation-observability.test.ts src/lib/app-settings-registry.ts src/lib/app-settings-registry.test.ts src/routes/-api.admin.settings.test.ts
git commit -m "feat(engine): qualify single-shot generated sites"
```

### Task 10: Freeze the Corpus, Enforce Release Metrics, Document, and Run Final E2E

**Files:**
- Create: `fixtures/generation-evaluation/manifest.json`
- Create: `fixtures/generation-evaluation/briefs/retail-catalog.json`
- Create: `fixtures/generation-evaluation/briefs/fnb-menu.json`
- Create: `fixtures/generation-evaluation/briefs/local-service.json`
- Create: `fixtures/generation-evaluation/briefs/appointment-service.json`
- Create: `fixtures/generation-evaluation/briefs/property-rental.json`
- Create: `fixtures/generation-evaluation/briefs/education-course.json`
- Create: `fixtures/generation-evaluation/briefs/online-service.json`
- Create: `fixtures/generation-evaluation/briefs/image-led.json`
- Create: `fixtures/generation-evaluation/briefs/photo-off.json`
- Create: `fixtures/generation-evaluation/briefs/photo-on-assets.json`
- Create: `fixtures/generation-evaluation/briefs/photo-on-no-assets.json`
- Create: `fixtures/generation-evaluation/briefs/sparse-two-field.json`
- Modify: `src/lib/projects/generation-evaluation.ts`
- Modify: `src/lib/projects/generation-evaluation.test.ts`
- Modify: `scripts/run-generation-evaluation.ts`
- Modify: `package.json`
- Modify: `DESIGN.md`
- Modify: `DEV.md`
- Modify: `docs/superpowers/plans/2026-08-12-single-shot-generated-site-quality.md` completion section only after evidence exists

**Interfaces:**
- Consumes: 24 scheduled trials, stage timings, hard/source/browser/risk/critic/repair results.
- Produces:

```ts
export type GeneratedSiteEvaluationReportV2 = {
  schemaVersion: 2;
  corpusVersion: string;
  evaluatorVersion: string;
  scheduled: number;
  completed: number;
  metrics: {
    cleanBuildP50Ms: number;
    firstBuildTechnicalSuccess: number;
    deterministicQualityPass: number;
    criticalAccessibilityFailures: number;
    brokenActionFailures: number;
    fabricatedFactFailures: number;
    criticInvocationRate: number;
    visualRepairRate: number;
    visualRepairSuccessRate: number;
  };
  release: { pass: boolean; reasons: string[] };
};
```

- [ ] **Step 1: Write evaluator threshold tests**

Assert release fails when:

- any scheduled trial is absent
- any corpus case lacks two trials
- p50 exceeds 120,000 ms
- technical success is below 0.95
- deterministic quality pass is below 0.90
- any critical accessibility, broken action, or fabricated fact failure exists

Assert one fully qualifying synthetic report passes.

- [ ] **Step 2: Run tests and verify failure**

```bash
bunx vitest run src/lib/projects/generation-evaluation.test.ts
```

Expected: FAIL because V2 metrics do not exist.

- [ ] **Step 3: Implement V2 evaluation without weakening V1 readers**

Add explicit V2 types/functions or migrate the script atomically. Infrastructure errors stay in denominators. Compute p50 from sorted clean-build durations. Report category failures separately; never hide critical failures in an aggregate score.

- [ ] **Step 4: Create the 12 synthetic fixtures and 24-trial manifest**

Each JSON includes expected recipe/media mode/routes/CTA/required content/prohibited claims/browser assertions/risk expectation. The SuryaPhone equivalent uses synthetic contact/social values and no real account ID.

- [ ] **Step 5: Extend the evaluation CLI**

Add:

```json
"evaluate:generation:quality": "bun scripts/run-generation-evaluation.ts --manifest fixtures/generation-evaluation/manifest.json"
```

The command writes runtime results under `.data/generation-evaluation/` and prints the final JSON report. It must not overwrite fixture expectations or tracked files.

- [ ] **Step 6: Run all focused unit tests**

```bash
bunx vitest run \
  src/lib/projects/generated-site-contract.test.ts \
  src/lib/projects/generated-site-recipes.test.ts \
  src/lib/projects/scaffold/shadcn-theme.test.ts \
  src/lib/projects/batched-response.test.ts \
  src/lib/projects/generated-site-gates.test.ts \
  src/lib/projects/browser-gates.test.ts \
  src/lib/projects/generated-site-browser-runner.test.ts \
  src/lib/projects/generated-site-risk.test.ts \
  src/lib/projects/visual-critic.test.ts \
  src/lib/projects/generated-site-qualification.test.ts \
  src/lib/projects/build-attempt-worker.batched.test.ts \
  src/lib/projects/generation-evaluation.test.ts
```

Expected: PASS.

- [ ] **Step 7: Run the frozen corpus twice per case**

```bash
bun run evaluate:generation:quality
```

Expected: report `release.pass=true`, 24/24 scheduled trials present, p50 ≤120,000 ms, technical success ≥0.95, deterministic quality pass ≥0.90, and zero critical accessibility/broken-action/fabricated-fact failures.

Do not proceed to real-account E2E if this fails. Fix the smallest failing compiler/recipe/gate behavior and rerun the affected unit fixture before rerunning the corpus.

- [ ] **Step 8: Update canonical docs**

In `DESIGN.md`, replace the prompt-only generated-app taste claim with the contract/recipe/theme/browser qualification rules and explicit photo matrix. In `DEV.md`, document Chromium prerequisite, corpus command, private evidence location/TTL, rollout settings, and failure investigation by attempt/candidate ID.

- [ ] **Step 9: Run complete local quality gates**

```bash
bun run check
bun run build
```

Expected: both exit 0.

- [ ] **Step 10: Run final E2E only after every local/corpus gate passes**

Use the ignored local E2E seed/build script under the approved test account without adding IDs or credentials to git.

Run 1:

```text
feature.builder_photo_enabled=false
feature.generated_site_quality_rollout=internal
```

Assert:

- build `ok:true`
- no placeholder paths or image-replacement copy
- desktop/mobile browser reports pass
- risk/critic behavior matches proof metadata
- primary CTA and social links work
- all required typed content is visible
- generated source contains no starter marker or technical headings

Run 2:

```text
feature.builder_photo_enabled=true
no uploaded media
feature.generated_site_quality_rollout=internal
```

Assert placeholders appear only when media mode is `replaceable_slots`, page remains coherent before replacement, and no layout claims a photo is required.

- [ ] **Step 11: Inspect final repository state and evidence**

```bash
git status --short --untracked-files=all
git diff --check
```

Expected: only intended tracked changes; no `.env`, `.data`, screenshots, logs, account data, or browser artifacts staged.

- [ ] **Step 12: Add a factual completion note to this plan**

Record commit IDs, exact focused/full commands, corpus report metrics, and final E2E project IDs only if IDs are safe operational identifiers. Do not claim subjective perfection; report rubric/gate evidence.

- [ ] **Step 13: Commit docs, corpus, and evaluator**

```bash
git add package.json fixtures/generation-evaluation src/lib/projects/generation-evaluation.ts src/lib/projects/generation-evaluation.test.ts scripts/run-generation-evaluation.ts DESIGN.md DEV.md docs/superpowers/plans/2026-08-12-single-shot-generated-site-quality.md
git commit -m "test(engine): gate generated-site quality rollout"
```

---

## Execution Checkpoints

Stop for review after these groups:

1. **Tasks 1-3:** immutable inputs, deterministic contract, recipe/example selection.
2. **Tasks 4-6:** accessible theme, streamed design plan, source quality floor.
3. **Tasks 7-8:** browser evidence, deterministic risk, critic, one repair.
4. **Task 9:** live worker wiring and rollout proof.
5. **Task 10:** corpus, full gates, final E2E.

At every checkpoint, run the listed focused tests and inspect `git diff --stat`. Do not defer a known failing focused test to the final gate.

## Rollback

- Set `feature.generated_site_quality_rollout=off` to restore the prior batched prompt/gates.
- Rollback does not change `generationEngine`, restore a tool loop, mutate handoffs, rebuild existing projects, or delete evidence.
- Candidate failures before selection leave the active handoff, selected snapshot, deployment, and thumbnail unchanged.
- If browser/critic infrastructure is unavailable during internal/pilot rollout, fail the new candidate and turn the quality rollout off; never mark missing evidence as pass.

## Execution Evidence — 2026-08-12

Implemented commits before final evaluator/docs commit: `aa7cf07`, `ab6749f`, `5aea9de`, `30deb84`. Focused generated-site suite passed 97 tests (one opt-in browser test skipped); the opt-in Chromium smoke separately passed 4/4 at mobile and desktop. `bun run check` passed. `bun run build` passed.

Release qualification remains intentionally blocked and rollout remains `off`. `bun run evaluate:generation:quality` failed closed because `.data/generation-evaluation/results.json` has no funded 24-trial run. Real-account photo-off attempts reached accepted-handoff compilation and full browser qualification, exposing and fixing planner provenance/hash, case-insensitive file collisions, browser evidence lifecycle, timeout, CTA/touch checks, and format-repair context. Final attempt `cmsq41ah500014l3ydp8oss4g` was blocked before generation by upstream OpenRouter HTTP 402 credit limits even after the writer ceiling was reduced from 24,000 to 9,000 tokens. Photo-on/no-assets was not run because the required photo-off gate did not pass. No corpus or E2E success is claimed.

## Completion Definition

Implementation is complete only when:

- all focused tests pass
- `bun run check` passes
- `bun run build` passes
- browser smoke passes with Chromium
- frozen corpus produces 24/24 trials and `release.pass=true`
- p50 clean build is ≤120 seconds
- technical success is ≥95%
- deterministic quality pass is ≥90%
- zero critical accessibility, broken-action, or fabricated-fact corpus failures exist
- both final photo-flag E2E scenarios pass
- current and last-known-good project state survive an intentionally failed candidate test
- docs and completion evidence are current
- repository contains no private/generated artifacts
