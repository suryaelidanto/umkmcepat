# Reference-Calibrated Single-Shot Generation — Design

**Date:** 2026-08-13  
**Status:** Proposed architecture; implementation intentionally not started  
**Scope:** New first-generation `landing` and `marketing_site` candidates  
**Audit:** `docs/superpowers/audits/2026-08-13-generated-site-quality-architecture-audit.md`  
**Supersedes:** the prose-recipe, sampled-critic, and deterministic-source visual-skip decisions in `docs/superpowers/specs/2026-08-12-single-shot-generated-site-quality-design.md`  
**Supersedes:** the deterministic route as the primary quality path in `docs/superpowers/specs/2026-08-13-generated-site-release-design.md`  
**Preserves:** accepted-handoff facts, response-text `<file>` streaming, protected scaffold files, source/build/browser gates, bounded execution, artifact persistence, and last-known-good selection

## Summary

UMKM Cepat will generate customer landing sites with one bounded streamed writer response grounded by an executable design kit calibrated from the product owner's accepted references 01, 02, 03, 04, and 07. Every other recovered gallery result is negative evidence.

The platform will not restore an unrestricted tool loop. The model receives no file, shell, browser, or search tools. It emits a compact `<design-plan>` followed by complete `<file>` blocks. The platform parses and persists closed files, compiles a safe semantic theme, builds the generated Vite app, runs deterministic mobile/desktop browser gates, and performs one mandatory visual review.

One shared correction token covers every automatic correction reason. A truncation continuation, response-format repair, source repair, build repair, browser repair, or eligible visual repair all consume the same token. There is no second automatic correction under another name.

```text
accepted handoff + canonical brief + media policy
  -> deterministic selection traits
  -> deterministic executable design kit
  -> factual/render contract bound to that kit
  -> kit primitives copied into portable scaffold
  -> ONE writer response (zero tool calls)
       <design-plan>creative choices within kit</design-plan>
       <file path="...">complete source</file>
       <done />
  -> source/fact/theme/media gates
  -> TypeScript + Vite build
  -> desktop + mobile browser gates
  -> ONE mandatory visual review
  -> pass | honest failure | ONE shared targeted correction
```

## Product outcome

A busy Indonesian owner should receive a page that:

- clearly looks made for their business rather than for the previous business;
- makes the useful next action obvious;
- uses only accepted facts and approved media;
- remains coherent with no photos;
- works on mobile and desktop;
- compiles and runs as a standalone Vite + Tailwind project;
- reaches ready in a bounded time without repeated hidden model turns.

## Goals

1. Recover the coherent hierarchy, typography, palette, rhythm, and business-specific composition visible in accepted references 01, 02, 03, 04, and 07.
2. Keep the normal path to exactly one writer call, zero model tool-call round trips, and one visual-review call.
3. Permit at most one automatic correction call across the entire attempt.
4. Preserve accepted facts and prohibit invented prices, stock, contacts, locations, hours, testimonials, awards, guarantees, certifications, regulated claims, and business capabilities.
5. Make design-kit selection materially affect scaffold primitives, prompt constraints, source/browser gates, and visual-review rubric.
6. Remove universal default-theme and universal fixed-route collapse.
7. Make every quality claim reproducible through a real 12-case × 2-trial runner and blind product-owner comparison.
8. Keep failed candidates from replacing the selected source, build, or deployment.
9. Keep generated output portable and free to use, edit, export, and publish.
10. Leave a narrow orchestration interface that an implementation agent can change without owning project lifecycle code.

## Non-goals

- No restoration of `ToolLoopAgent`, `custom-source-generator.ts`, `agent-tool-runner.ts`, or model shell/file tools.
- No multi-agent planner/writer/judge swarm.
- No generated backend, auth, database, payment gateway, checkout, or private API.
- No generated-artifact hand edits.
- No stock-photo search, remote image hotlink, or licensing pipeline.
- No automatic rebuild of existing projects.
- No redesign of the UMKM Cepat workspace/admin product UI.
- No claim that an LLM critic proves beauty or complete WCAG conformance.
- No acceptance based on one aggregate aesthetic number.
- No attempt to make the treatment faster than the 7.2-second AI-free control; that control is a latency floor, not a quality target.

## Frozen evidence contract

### Positive references

The authoritative accepted visual labels are:

- 01 — airy editorial hierarchy;
- 02 — menu-led editorial page;
- 03 — catalog plus story rhythm;
- 04 — warm compact commerce;
- 07 — bold typographic minimum.

Their exact source/desktop/mobile hashes are recorded in the architecture audit. Screenshots and private workspace source remain untracked.

### Negative references

- Visible gallery items 05–06 and 08–33 are broken.
- The recovered blank route and five non-buildable routes are technical negatives.
- Later repeated black-heading/orange-accent variants are explicit universal-template negatives even when their source is large and their build succeeds.

### Label semantics

The labels certify visual coherence/working presentation only. They do not authorize copying business text, claims, contacts, prices, placeholder frames, or media behavior. Current factual, copy, accessibility, and media gates remain independently binding.

## Taste contract

Every kit and generated candidate is judged against anchored behavior.

### Required qualities

- One dominant first-viewport idea: identity, offer, and primary action are legible without scrolling.
- Deliberate display/body typography roles and controlled line wrapping.
- A limited, business-appropriate palette with one restrained accent strategy.
- Content-specific section treatment rather than schema-shaped repetition.
- Meaningful rhythm changes between major sections.
- At least one signature composition decision justified by the actual content.
- Mobile reading order and action placement designed independently of desktop width reduction.
- Honest media handling: approved assets, useful local graphics, or a complete image-free composition.
- Sparse briefs stay concise; rich briefs expose useful supplied detail.

### Forbidden qualities

- starter residue;
- raw JSON/object/transcript rendering;
- implementation headings such as `HeroSection` or `ProductCard`;
- repeated equal cards as the default expression of every section;
- one universal hero/palette across unrelated businesses;
- clipped headings, invisible text, hidden actions, or horizontal overflow;
- empty image frames or “Tidak ada foto” when uploads are disabled;
- generic proof, operational details, or claims not supplied by the owner;
- gold-reference copy or identity leakage.

## Architectural boundaries

### Control plane

UMKM Cepat owns:

- accepted handoff and canonical facts;
- design-kit selection;
- protected scaffold files;
- model call budget;
- response parsing and safe-path enforcement;
- semantic theme compilation;
- TypeScript/Vite/browser execution;
- visual-review authority and release thresholds;
- source/dist/evidence persistence and deployment selection.

### Writer

The writer owns bounded creative implementation:

- section order within declared obligations;
- selected kit pattern choices;
- composition and responsive treatment;
- semantic token use;
- customer-facing phrasing that does not add facts;
- editable route/component source.

The writer may not change facts, CTA targets, media mode, protected files, dependencies, routes outside the contract, quality thresholds, or deployment state.

### Generated runtime

Generated source contains the selected kit primitives and all required app code. It does not import the UMKM Cepat control plane at runtime. Exported source remains a standalone Vite + React + Tailwind project.

## Core types

Names may be adjusted to match existing project conventions, but their authority boundaries must remain.

### Factual/render contract

The existing `GeneratedSiteContractV1` remains readable for old snapshots. New candidates compile a V2 writer projection so changed semantics are not hidden under version 1.

```ts
type GeneratedSiteWriterContractV2 = {
  schemaVersion: 2;
  contractHash: string;
  handoff: {
    contractHash: string;
    planHash: string;
  };
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
  obligations: {
    routes: Array<{
      path: string;
      purpose: string;
      requiredFactIds: string[];
      requiredSectionIds: string[];
    }>;
    sections: Array<{
      id: string;
      purpose: string;
      requiredFactIds: string[];
    }>;
    prohibitedClaims: string[];
  };
  media: {
    mode: "owner_assets" | "graphic" | "typographic";
    approvedAssets: Array<{
      assetId: string;
      mediaPath: string;
      purpose: "logo" | "hero" | "product" | "gallery" | "reference";
    }>;
  };
  visualInputs: {
    direction: string | null;
    density: "sparse" | "regular" | "rich";
    selectedKitId: GeneratedSiteDesignKitId;
    selectedKitVersion: 1;
  };
};
```

`replaceable_slots` is removed from new no-asset candidates. The current product direction disables uploads and requires zero placeholder images. A future approved photo-later product flow may add a new contract version.

### Executable design kit

```ts
type GeneratedSiteDesignKitId =
  | "editorial-airy"
  | "menu-led-editorial"
  | "catalog-story"
  | "warm-commerce"
  | "bold-typographic";

type GeneratedSiteDesignKitV1 = {
  id: GeneratedSiteDesignKitId;
  version: 1;
  referenceLabels: Array<"01" | "02" | "03" | "04" | "07">;
  compatibleArchetypes: string[];
  compatibleMediaModes: Array<"owner_assets" | "graphic" | "typographic">;
  compatibleDensities: Array<"sparse" | "regular" | "rich">;
  compositionPatterns: Array<{
    id: string;
    intent: string;
    requires: string[];
    forbids: string[];
  }>;
  typography: {
    displayRole: "serif" | "sans";
    bodyRole: "sans" | "serif";
    maxDisplayRem: number;
    maxBodyCh: number;
  };
  themePolicy: {
    temperature: "warm" | "cool" | "neutral";
    backgroundLightness: "light" | "dark" | "either";
    accentSurfaceMaximum: number;
  };
  rhythm: {
    sectionSpacingRem: [number, number];
    allowAlternatingSurfaces: boolean;
  };
  primitiveFileIds: string[];
  sourceAssertions: string[];
  browserAssertions: string[];
  criticRubric: string[];
  antiPatterns: string[];
};
```

A kit is valid only if its ID changes all of these outputs:

1. portable primitive files copied into the generated scaffold;
2. allowed design-plan choices and writer context;
3. source/browser assertions;
4. visual-review rubric.

Tests must fail a kit that only changes prompt prose.

### Writer design plan

```ts
type WriterDesignPlanV2 = {
  schemaVersion: 2;
  contractHash: string;
  kit: {
    id: GeneratedSiteDesignKitId;
    version: 1;
  };
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

The plan is creative but bounded:

- hashes, kit, version, media mode, and section IDs must match platform inputs;
- pattern ID must exist in the selected kit;
- palette values must be six-digit hex and pass kit bounds before compilation;
- plan text cannot add facts, routes, or assets;
- every plan field must affect either generated source, compiled theme, or a gate;
- maximum serialized size is 8 KiB.

### Shared call budget

```ts
type GeneratedSiteModelLeg = "writer" | "critic" | "correction";

type GeneratedSiteCorrectionReason =
  | "transport"
  | "response_contract"
  | "source_gate"
  | "build"
  | "browser"
  | "visual_machine_verifiable";

type GeneratedSiteCallBudgetSnapshot = {
  writerCalls: 0 | 1;
  criticCalls: 0 | 1;
  correctionCalls: 0 | 1;
  correctionReason: GeneratedSiteCorrectionReason | null;
};
```

The budget object is passed to every model-call site. No call site keeps an independent retry counter.

## Design-kit selection

Selection is deterministic for equal accepted handoff, canonical brief, media policy, and kit catalog version. A pure `deriveGeneratedSiteKitSelectionInput()` projection computes only archetype, content density, primary-job kind, media mode, and operational-detail presence; it does not generate copy or source. Selection considers:

- declared archetype;
- content density;
- product/menu/service structure;
- media mode;
- accepted visual direction;
- operational content such as hours/location;
- whether the page's primary job is browse, compare, inquire, book, or visit.

Initial intent:

| Kit | Reference | Best fit |
|---|---|---|
| `editorial-airy` | 01 | Sparse/local/service content; strong type and whitespace |
| `menu-led-editorial` | 02 | F&B/menu/price lists and operational details |
| `catalog-story` | 03 | Rich product/catalog plus process/proof narrative |
| `warm-commerce` | 04 | Compact catalog/order pages with several decision aids |
| `bold-typographic` | 07 | Sparse image-free offers needing a strong high-contrast first view |

These are composition families, not business-name templates. No kit contains customer copy, phone numbers, addresses, prices, claims, or reference identities.

If no compatible kit exists, compilation fails as a configuration error. It does not silently select a generic fixed renderer.

## Portable kit primitives

The scaffold copies a small versioned set of source-owned layout primitives selected by the kit. They are implementation aids, not full rendered pages.

Permitted primitive responsibilities:

- section width, surface, and vertical rhythm;
- stack/cluster/split layout;
- display/body type roles;
- semantic action treatment;
- media framing for approved assets or local non-deceptive graphics;
- accessible decorative geometry.

Forbidden primitive responsibilities:

- embedded business copy or facts;
- a complete fixed hero/catalog/footer sequence;
- remote resources;
- hidden runtime dependency on UMKM Cepat;
- accepting arbitrary HTML or unsafe style text;
- rendering an empty photo placeholder.

Primitives are platform-owned during generation but copied into the exported project. The writer may import them; it may not rewrite them.

## Theme compilation

The writer chooses four bounded palette inputs in the leading design plan. The platform then compiles all semantic roles into protected `src/index.css`.

Rules:

- plan palette is validated against kit temperature/lightness policy;
- normal text contrast is at least 4.5:1;
- large text and focus indicators are at least 3:1;
- foreground roles are derived separately from surfaces;
- `muted` is never reused as `muted-foreground`;
- one accent remains within the kit's surface-use cap;
- invalid palette input uses the one correction only if still available; otherwise the attempt fails;
- no universal `defaultTheme` is substituted after contract compilation;
- source uses semantic Tailwind tokens and cannot redeclare competing hex palettes.

The platform applies the accepted design plan to protected theme files before final source gates and build. Equal plan + kit version produces equal CSS.

## Streamed response protocol

The response remains plain streamed text:

```text
<design-plan>{...WriterDesignPlanV2 JSON...}</design-plan>
<file path="src/routes/index.tsx">complete TSX</file>
<file path="src/components/site/...">complete TSX when contract routes require it</file>
<done summary="..." />
```

Rules:

- The design plan is first and appears exactly once.
- The writer emits only paths declared writable by the generated scaffold manifest.
- Platform-owned content, theme, primitive, router-core, package, config, and preview files are never writable.
- Every file block contains full raw content and is persisted only after `</file>` closes.
- A `landing` normally emits one route file.
- A `marketing_site` may emit only the route/shared-composition files required by the accepted plan, with a maximum of three editable files in v2.
- Total editable source response is capped at 32 KiB; the prompt instructs the writer to compose seeded primitives rather than repeat implementation.
- No tool calls, shell blocks, package changes, markdown fences, or prose outside the protocol.
- AI SDK `maxRetries` is zero for writer, critic, and correction. An automatic retry must be visible as the single correction call.

The existing incremental parser and closed-file persistence are retained and extended rather than replaced.

## Normal execution path

1. Load and validate the immutable accepted handoff.
2. Resolve media mode and deterministic kit-selection traits once.
3. Select one compatible executable kit.
4. Compile `GeneratedSiteWriterContractV2` from canonical facts and bind the selected kit identity.
5. Seed the locked portable scaffold and selected primitive files.
6. Consume the writer call and stream one response.
7. Validate design plan, paths, source, facts, claims, CTA, media, and kit assertions.
8. Compile protected semantic theme files from the design plan.
9. Run TypeScript and Vite build.
10. Run mobile and desktop browser gates.
11. Consume one critic call and perform mandatory visual review.
12. Accept only when hard gates pass and no critical/high visual finding remains.
13. Persist proof, source, dist, thumbnail, and selection transaction.

Normal ready-state model calls:

```text
writer:     1
critic:     1
correction: 0
tool calls: 0
```

## One shared correction

### Eligibility

The correction may be consumed once for:

- truncated/malformed response;
- source/fact/theme gate failure;
- TypeScript/Vite failure attributable to editable source;
- browser hard failure attributable to editable source;
- a visual finding explicitly marked machine-verifiable.

Infrastructure outages, invalid accepted handoffs, missing kits, unavailable critic evidence, and non-verifiable critical/high aesthetic findings are not repair prompts. They fail honestly.

### Scope

The correction receives:

- immutable contract projection and hashes;
- accepted design plan when available;
- exact diagnostics/findings;
- exact implicated editable paths and current full content;
- no unrelated source;
- no tools.

It emits only full replacement file blocks and one done marker. If the response truncates, is malformed, changes protected data, or fails again, the attempt stops.

### Visual correction under one-review rule

There is exactly one visual-review model invocation.

If the review returns critical/high findings:

- findings with `verificationMode: "human_only"` fail the candidate; no unreviewed aesthetic repair may be auto-accepted;
- findings with `verificationMode: "browser_assertion"` may consume the correction if all blocking findings name deterministic post-repair assertions;
- after that correction, source/build/browser gates rerun and every named assertion must pass;
- the critic is not called again;
- medium/low findings remain recorded but do not block release.

Examples of machine-verifiable visual findings include computed contrast, clipping, overflow, touch-target size, hidden CTA, duplicate surface, and measurable line-length bounds. Business fit, genericness, emotional tone, or broad composition quality are `human_only` unless a future calibrated evaluator defines a deterministic assertion. This prevents claiming that an unreviewed visual rewrite is fixed.

Maximum ready-state model calls when correction is used:

```text
writer:     1
critic:     1
correction: 1
tool calls: 0
```

If correction is consumed before browser-clean output, the corrected candidate still receives the one final visual review. If correction is consumed after visual review, only machine-verifiable findings can qualify it.

## Source and fact gates

Hard source gates retain current safe-path/import/syntax/protected-file checks and add:

- exact V2 design-plan conformance;
- selected kit/pattern/primitive API conformance;
- required fact/section coverage;
- primary CTA label, target, and interaction kind;
- internal route/anchor registration;
- unsupported claim and literal detection;
- owner-media allow-list;
- no placeholders or empty media frames when assets are absent;
- no reference identity/copy/hash leakage;
- no starter fingerprints;
- no raw transcript/object dumps;
- no technical customer-facing headings;
- no competing raw palette declarations;
- no universal fixed-route fingerprint.

Soft source signals feed visual evidence but do not mechanically reject legitimate minimalism:

- repeated equal-card composition;
- identical section spacing;
- weak hierarchy;
- missing signature treatment;
- unusual content density;
- composition inconsistent with kit intent.

## Browser gates

Run at minimum:

- mobile: 390 × 844, `id-ID`, reduced motion;
- desktop: 1440 × 1000, `id-ID`, reduced motion.

Every declared route must establish:

- route load and console clean;
- required visible content;
- exact primary action behavior;
- internal navigation and anchor integrity;
- no horizontal overflow;
- no clipped heading;
- no broken/unapproved image;
- media policy compliance;
- computed contrast floor;
- visible focus;
- minimum touch target;
- no content hidden by sticky navigation;
- kit-specific measurable assertions.

Screenshots are private runtime evidence and are never committed.

## Mandatory visual review

The critic receives in one call:

- factual/render contract projection;
- accepted writer design plan;
- selected kit rubric and approved reference traits;
- deterministic source/browser signals;
- one mobile and one desktop screenshot per judged route, bounded to the route limit.

It returns structured category findings:

```ts
type GeneratedSiteVisualFindingV2 = {
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
```

Rules:

- one invocation, `maxRetries: 0`;
- read-only authority;
- no source output or tool calls;
- no fact, kit, threshold, or deployment changes;
- `unknown`/`unavailable` is not a pass;
- critical/high findings block unless resolved through the narrowly defined machine-verifiable correction path;
- critic model/version and category outcomes are recorded;
- the deterministic-source bypass and production sampling shortcut are removed.

## Pipeline boundary

Detailed generation policy moves out of `runBuildAttempt()` behind one stable interface:

```ts
type RunGeneratedSitePipelineInput = {
  attemptId: string;
  buildId: string | null;
  projectId: string;
  userId: string;
  handoff: AcceptedBuildHandoff;
  briefSnapshot: ProjectBriefV2;
  abortSignal?: AbortSignal;
  onEvent?: BatchedGenerateEventSink;
  onFileStaged?: (file: GeneratedProjectFile) => void;
};

type RunGeneratedSitePipelineResult =
  | {
      ok: true;
      files: GeneratedProjectFile[];
      distFiles: GeneratedDistFile[];
      proof: GeneratedSiteQualityProofV2;
    }
  | {
      ok: false;
      failureClass: string;
      safeMessage: string;
      proof: GeneratedSiteQualityProofV2;
      stagedFiles: GeneratedProjectFile[];
    };
```

The pipeline does not update Prisma project/deployment selection itself. The worker remains responsible for leases, charging, snapshots, build rows, artifacts, last-known-good selection, progress publication, and terminal transaction state.

## Quality proof

```ts
type GeneratedSiteQualityProofV2 = {
  schemaVersion: 2;
  engine: "reference-calibrated-single-shot";
  contractHash: string;
  planHash: string;
  kitId: GeneratedSiteDesignKitId;
  kitVersion: 1;
  designPlanHash: string | null;
  mediaMode: "owner_assets" | "graphic" | "typographic";
  calls: GeneratedSiteCallBudgetSnapshot;
  gates: {
    response: "pass" | "fail" | "not_run";
    source: "pass" | "fail" | "not_run";
    build: "pass" | "fail" | "not_run";
    browser: "pass" | "fail" | "infrastructure_error" | "not_run";
    visual: "pass" | "fail" | "unknown" | "not_run";
  };
  visualFindings: Record<"critical" | "high" | "medium" | "low", number>;
  timingsMs: {
    contract: number;
    writer: number;
    sourceGates: number;
    build: number;
    browser: number;
    critic: number;
    correction: number;
    totalToDecision: number;
  };
  output: {
    editableFileCount: number;
    editableBytes: number;
    firstFileClosedMs: number | null;
  };
  outcome: "pass" | "fail" | "infrastructure_error";
};
```

No full prompt, private owner content, screenshot bytes, credentials, or public evidence URLs enter telemetry.

## Evaluation corpus

### Cases

Use the existing 12-case shape, upgraded into executable synthetic accepted handoffs:

1. retail catalog;
2. F&B menu with hours/location;
3. local service with service area;
4. appointment service;
5. property/rental collection;
6. education/course;
7. online professional service;
8. image-led business with approved synthetic assets;
9. uploads disabled/no assets;
10. approved owner-like synthetic assets;
11. no assets with complete graphic/typographic design;
12. sparse two-field brief.

Each case runs two independent treatment trials. All fixtures are synthetic, public, and free of account IDs or real owner data.

### Arms

- `deterministic-control-v1`: current fixed route, used for speed and blind visual comparison.
- `reference-calibrated-v2`: treatment.
- Approved references 01/02/03/04/07: calibration evidence, not executable production source and not a factual control.

Deleted legacy code is not restored into production for benchmarking. An isolated historical worktree may be measured as diagnostic evidence, but it is not a release dependency because model/provider drift would make it a confounded control.

### Real runner

The evaluator must execute, not merely summarize:

```text
fixture -> compile -> generate -> build -> browser -> critic -> proof/result
```

It writes private generated files/screenshots/results under `.data/generation-evaluation/<run-id>/` and prints a sanitized report. Missing trials and infrastructure errors remain in denominators.

### Blind owner comparison

The runner emits randomized, anonymized control/treatment desktop+mobile pairs. The reviewer records `left`, `right`, or `tie` without engine, model, kit, or trial labels. The result file remains private; only aggregate counts and run ID enter the release report.

## Release thresholds

All thresholds are conjunctive.

### Execution and safety

- 24/24 treatment trials completed; missing and infrastructure-error trials fail release.
- 24/24 first candidates pass response/source fact and protected-path gates, or use the single correction and then pass.
- 24/24 final candidates pass TypeScript, Vite, and all required browser assertions.
- Fabricated-fact failures: 0.
- Broken primary/internal action failures: 0.
- Placeholder/unapproved-media failures: 0.
- Critical accessibility failures: 0.
- Writer calls per trial: exactly 1.
- Critic calls per trial: exactly 1.
- Correction calls per trial: 0 or 1.
- Tool calls: 0.
- Correction usage rate: at most 20% across the 24 treatment trials.

### Visual quality

- Unresolved critical findings: 0.
- Unresolved high findings: 0.
- Every one of the five kit families passes at least one dedicated conformance case.
- No one composition pattern appears in more than 50% of treatment cases unless the frozen case distribution itself makes other kits incompatible.
- Blind treatment preference is at least 75% of decisive comparisons: `wins / (wins + losses) >= 0.75`.
- No corpus case loses both treatment trials to the deterministic control.
- Ties are reported separately and may not exceed 25% of all comparisons.
- Product owner explicitly approves the aggregate blind sheet before internal rollout.

### Latency and size

Measured from pipeline entry to quality decision, excluding thumbnail capture:

- p50 total-to-decision ≤90,000 ms.
- p95 total-to-decision ≤150,000 ms.
- p50 first closed editable file ≤45,000 ms.
- p95 editable response bytes ≤32 KiB.
- Treatment p50 must be at least 50% lower than the frozen same-model multi-call diagnostic baseline if that baseline is successfully captured; the absolute 90-second threshold remains binding either way.

The treatment is not required to beat the 7.2-second deterministic control on latency.

### Critic calibration

Before critic findings can block or authorize machine-verifiable repair:

- at least 50 human-labeled page/viewport samples;
- at least 30 labeled/seeded defects;
- precision ≥0.90 for critical/high findings;
- recall ≥0.80 for critical/high findings;
- zero critical false-negative acceptance on the frozen negative set;
- accepted item 07 must not be rejected merely for being minimal/bold;
- calibration is versioned by model, prompt, kit rubric, and evaluator.

Until calibrated, the complete pipeline remains offline/shadow and cannot replace selected output.

## Failure policy

| Failure | Result |
|---|---|
| Accepted handoff/hash invalid | Fail before model call |
| No compatible kit | Configuration failure; no generic fallback |
| Writer transport/format failure | Consume correction if available; otherwise fail |
| Source/theme/build/browser editable failure | Consume correction if available; rerun full hard gates |
| Infrastructure unavailable | `infrastructure_error`; no quality pass |
| Critic unavailable/unknown | Fail closed before rollout |
| Critic critical/high `human_only` finding | Fail; explicit new user attempt required |
| Critic machine-verifiable blocking finding | One correction if available; deterministic requalification only |
| Correction malformed or still failing | Fail; no second correction |
| Energy exhausted | Persist closed staged files and proof; explicit recoverable failure |
| Candidate fails | Last-known-good source/build/deployment remains selected |

There is no bland fallback presented as success.

## Rollout

1. **Architecture complete:** this spec and implementation plan approved; no code enabled.
2. **Offline implementation:** unit/fixture/browser tests and real evaluator runner.
3. **Calibration:** owner labels, critic precision/recall, blind comparison, and thresholds pass.
4. **Shadow internal:** v2 runs without replacing current selected output; call/latency/proof observed.
5. **Internal replacement:** admin/internal accounts only after shadow evidence.
6. **Pilot:** approved pilot owners, with kill switch and last-known-good preservation.
7. **All:** only after pilot SLO and owner preference remain above thresholds.

Rollback selects `deterministic-control-v1` for new attempts. It does not restore the deleted tool loop and does not rebuild existing projects.

## Testing strategy

### Unit

- V2 factual/render contract and hashes;
- deterministic kit compatibility/selection;
- every kit affects scaffold, prompt, gates, and critic rubric;
- design-plan V2 parser and conformance;
- palette policy and semantic contrast;
- shared call budget exhaustion;
- correction scope and reason recording;
- source/fact/claim/media/CTA gates;
- critic structured result and one-call behavior;
- quality-proof sanitization;
- V3 evaluation arithmetic and thresholds.

### Fixture

- all five kits compile their own portable primitives;
- no primitive includes facts, identity, remote resources, or fixed full-page composition;
- all 12 synthetic handoffs resolve expected kit/media/obligations;
- positive/negative reference label manifest validates exact hashes and counts;
- fixed-renderer fingerprint is rejected from treatment output.

### Browser

- all routes at mobile/desktop;
- kit-specific measurable assertions;
- CTA, anchor, overflow, clipping, contrast, focus, touch targets, media health;
- post-correction named assertion verification;
- no second critic call.

### Integration

- one writer + one critic normal path;
- one shared correction across every failure phase;
- worker persists proof and preserves last-known-good on failure;
- source/dist/preview/thumbnail remain portable and available;
- evaluator executes 24 real trials rather than reading fabricated results.

## Documentation impact

Implementation updates:

- `DESIGN.md` generated-site section;
- `DEV.md` generation-evaluation and failure-debugging workflow;
- `docs/superpowers/README.md` high-signal generation pointer if needed;
- rollout-setting documentation if implementation adds a DB-first setting.

No Storybook work is required unless a reusable UMKM Cepat product-UI component changes. Generated-site visual fixtures belong in the private evaluation runner, not product Storybook.

## Frozen decisions

- The five owner labels are the positive taste corpus; all other recovered routes are negatives.
- Response-text generation stays.
- Model-native tools and shell authority stay absent.
- The primary path uses a real writer; the fixed renderer becomes control/rollback only.
- Design kits must be executable across scaffold, prompt, gates, and critic.
- New no-asset output contains zero placeholders.
- Normal path uses one writer call and one visual-review call.
- One shared correction is the only automatic extra writer call.
- One visual-review invocation is a hard cap; unreviewable aesthetic repairs cannot auto-pass.
- Deterministic source is never visually immune.
- Release requires a real 24-trial runner and blind owner preference.
- No production implementation starts from this document alone; execution follows the companion TDD plan with review checkpoints.
