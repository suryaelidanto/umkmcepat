# Professional Static-Site Generation — Design

**Date:** 2026-08-15  
**Status:** Approved design; implementation not started  
**Scope:** New and regenerated `landing` and static `marketing_site` projects  
**Supersedes:** The rule in `docs/superpowers/specs/2026-08-14-generated-site-design-quality-sop-design.md` that allows deterministic success plus `visual: unknown` to produce an overall pass  
**Extends:** `docs/superpowers/specs/2026-08-13-reference-calibrated-single-shot-generation-design.md` and its bounded single-shot architecture  
**Preserves:** `default-combo`, accepted-handoff facts, one writer call, one final visual-review call, at most one shared correction, zero model tools, protected scaffold files, standalone Vite + Tailwind output, private evidence, and last-known-good selection

## Summary

UMKM Cepat must generate landing pages and static marketing sites that a serious small business can publish without apologizing for the design. Compiling, rendering, and passing accessibility assertions are necessary but no longer sufficient. A selected candidate must also pass a complete, calibrated professional visual review against its business-specific blueprint.

The platform will keep the fast bounded pipeline. It will not restore `ToolLoopAgent`, add a planner swarm, or let the model browse, edit files, run commands, or iterate without a budget. Instead, it will move the important design decisions into an immutable professional site blueprint, let one streamed writer call execute that blueprint, collect richer deterministic browser evidence, and run one final screenshot review with a strict category-complete result.

```text
accepted facts + accepted plan
  -> professional site blueprint
  -> executable design kit + protected portable scaffold
  -> ONE streamed writer response
       <design-plan>bounded creative execution</design-plan>
       <file>complete route files</file>
  -> source/fact/route/theme gate
  -> TypeScript + Vite build
  -> mobile + desktop browser qualification
  -> ONE final calibrated professional review
  -> qualify | reject | infrastructure error
  -> select only qualified output
```

A visual review that is empty, malformed, unavailable, incomplete, or low-confidence is `unknown`. `unknown` is honest evidence, but it is not professional qualification and cannot replace selected output.

## User intent

The required outcome is not “a technically valid AI landing page.” It is:

> A professional, serious, production-ready landing page or static site that feels intentionally designed for this exact business, uses only accepted facts, works on mobile and desktop, leads customers to one useful action, remains portable, and is generated without the latency of an unrestricted tool loop.

This is a platform-wide standard. Butik Senja is a real regression case, not the template or sole optimization target.

## Why the current implementation is insufficient

The current source is safer than the original one-shot generator, but four gaps still permit mediocre output:

1. `runGeneratedSitePipeline()` returns `ok: true` when the final visual review is `unknown`.
2. `sanitizeGeneratedSiteQualityProofV2()` explicitly allows `visual: unknown` in a passing proof.
3. `deriveDefaultWriterDesignPlanV2()` chooses the first kit pattern and generic section treatments, encouraging composition convergence.
4. The V2 writer is effectively one-route-only: the prompt allows only `src/routes/index.tsx`, the parser stops after that file, and protected `src/router.tsx` cannot register accepted additional routes.
5. Browser qualification proves basic operability but not first-view hierarchy, declared section coverage/order, hidden sticky content, empty visual frames, or bounded readable typography.
6. The critic may return an empty findings array without proving that it assessed every professional category.
7. V3 benchmark trial conversion currently writes fact, action, media, and accessibility failure counts as literal zero instead of deriving them from proof evidence.
8. Blind preference against a deliberately plain control proves relative preference, not that the treatment is ready to publish.

These are contract problems, not reasons to change the model for one project.

## Product outcome

For every supported accepted handoff, the chosen site must:

- communicate the business identity, concrete offer, audience context, and primary action in the first viewport;
- look specific to the business subject, products, process, place, or service rather than a generic category template;
- use enough structure for supplied facts without adding filler to sparse briefs;
- establish deliberate typography, palette, composition, section rhythm, media treatment, and one signature idea;
- make the primary customer path obvious and trustworthy;
- preserve every accepted fact and omit unsupported claims;
- work at `390×844` and `1440×1000`, with mobile treated as its own composition;
- meet WCAG AA contrast, focus, touch-target, overflow, and semantic requirements;
- build as standalone Vite + React + Tailwind source with hash-history routing;
- pass a final calibrated professional screenshot review;
- remain bounded to one writer, one critic, and at most one pre-review correction.

## Definition of “professional”

A professional candidate satisfies all nine dimensions below. “Professional” does not mean decorative, maximal, expensive-looking, or identical across businesses.

### 1. Business specificity

The page’s visual thesis and signature are grounded in supplied business material: the offer, product form, service process, customer context, place, craft, or operating model. Removing the business name should not make the page interchangeable with an unrelated business.

### 2. First-view hierarchy

The first viewport makes four things immediately legible: who the business is, what it offers, why the visitor should continue, and what action to take. Decoration cannot outrank the offer or CTA.

### 3. Content architecture

Every major section helps a customer understand, compare, trust, visit, inquire, book, or order. Rich facts receive useful structure. Sparse facts receive deliberate restraint. Neither missing depth nor filler counts as minimalism.

### 4. Composition and rhythm

The page has a dominant first-view idea, meaningful changes in width/surface/density, intentional alignment, and a coherent close. Repeating equal cards, identical section spacing, or empty decorative panels is not rhythm.

### 5. Typography

Display and body roles are deliberate, readable, and suitable for the business. Headings wrap calmly. Body measure, size, line height, weight, and contrast support fast reading. Typography may be restrained; it may not look accidental or default because the writer ignored the plan.

### 6. Color system

A bounded semantic palette supports hierarchy and brand character. Supporting text remains readable on every surface. Accent usage is deliberate. Raw palette utilities, gradient text, generic purple-blue gradients, and unrelated decorative colors are forbidden.

### 7. Media integrity

Approved owner assets are used only for approved purposes. Image-free sites remain visually complete through typography or meaningful local graphics. Empty frames, fake product images, remote stock imagery, replacement instructions, and misleading illustrations fail.

### 8. Mobile quality

Mobile has a deliberate reading order, sensible line breaks, reachable actions, useful density, and no desktop leftovers. A desktop grid merely stacked without hierarchy does not automatically qualify.

### 9. Professional finish

Spacing, alignment, boundaries, controls, interaction states, footer/close, and details feel coherent and ready to publish. Starter residue, technical labels, side stripes, repetitive eyebrows, arbitrary badges, and obvious AI scaffolding fail this dimension.

## Non-goals

- No `ToolLoopAgent`, model tools, shell access, browser control by the writer, or open-ended iteration.
- No multi-agent planner/writer/judge system.
- No provider or hard-coded model switch; the configured `default-combo` route remains the default.
- No generated backend, auth, database, checkout, payment gateway, or private API.
- No manual edits to `.data/project-*` or generated shadow workspaces.
- No invented prices, stock, contacts, addresses, hours, awards, testimonials, guarantees, certifications, claims, or capabilities.
- No stock-photo search, remote hotlink, or licensing workflow.
- No fixed section count and no universal hero/catalog/footer template.
- No attempt to encode subjective beauty as a growing list of regexes.
- No automatic rewrite after the final visual review; an unreviewed aesthetic repair cannot qualify.
- No product-shell, admin, workspace, or Storybook redesign unless implementation changes reusable UMKM Cepat UI.

## Design principles

### Trust before spectacle

A clear offer, real facts, readable copy, and a working CTA outrank novelty. Visual ambition must never obscure the customer path.

### Blueprint before source

The writer should execute explicit business, content, route, responsive, and art-direction decisions. It should not infer the whole product strategy while simultaneously writing TSX.

### One justified signature

Every site receives one memorable composition idea anchored to the business. Everything else remains disciplined. Signature budget is exactly one.

### Useful depth, not section count

A two-section sparse page can be complete. A rich catalog may need six useful sections. Qualification checks accepted jobs and facts, not a universal minimum.

### Mobile is a composition

The plan states how desktop relationships transform on mobile: order, width, CTA placement, media crop/omission, and density. “Stack everything” alone is insufficient for split or asymmetric patterns.

### Deterministic gates stay objective

Facts, paths, routes, links, visibility, contrast, size, overflow, media, and bounded typography are software checks. Business fit, composition quality, and finish remain calibrated visual-review judgments.

### Relative evidence is not an absolute floor

Beating a deliberately plain deterministic control is insufficient. Blind review must also answer whether the treatment itself is publishable without major visual revision.

## Supported product scope

### App kinds

Supported:

- `landing`: normally one route and one primary customer job;
- static `marketing_site`: one to three routes, each serving a materially distinct customer job.

Unsupported:

- `interactive_app`;
- more than three customer routes;
- generated persistence, account, checkout, payment, or private data flows.

Unsupported scope fails before the writer call. It never silently collapses accepted routes into `/`.

### Page strategy

Single page remains the default. Multiple routes are justified only when accepted jobs or content sets are materially distinct, for example:

- overview versus a substantial catalog;
- overview versus a property collection;
- course overview versus a complete class list;
- service explanation versus booking/location details.

The following do not justify another route:

- padding a sparse brief;
- moving contact details off the home page without customer benefit;
- creating separate “about,” “features,” or “testimonials” pages from tiny content;
- imitating a reference’s route count.

## Versioned architecture

Professional generation introduces new versions rather than changing historical V2 proof semantics in place.

- `GeneratedSiteWriterContractV3`
- `GeneratedSiteDesignKitV2`
- `ProfessionalSiteBlueprintV1`
- `WriterDesignPlanV3`
- `BrowserGateReportV2`
- `GeneratedSiteProfessionalReviewV1`
- `GeneratedSiteQualityProofV3`
- `GeneratedSiteEvaluationManifestV4` / `GeneratedSiteEvaluationTrialV4`

Historical V1/V2 contracts and proofs remain readable in source snapshot metadata. New selected candidates use V3 only after calibration and release gates pass.

## Immutable writer contract

```ts
type GeneratedSiteWriterContractV3 = {
  schemaVersion: 3;
  contractHash: string;
  handoff: {
    contractHash: string;
    planHash: string;
  };
  business: GeneratedSiteWriterContractV2["business"];
  content: GeneratedSiteWriterContractV2["content"];
  obligations: GeneratedSiteWriterContractV2["obligations"];
  media: GeneratedSiteWriterContractV2["media"];
  visualInputs: {
    direction: string | null;
    density: "sparse" | "regular" | "rich";
    selectedKitId: GeneratedSiteDesignKitId;
    selectedKitVersion: 2;
  };
};
```

The V3 contract contains accepted facts and obligations only. It does not contain speculative customer copy, style scores, or model-generated claims.

## Professional site blueprint

The platform compiles one immutable blueprint before source generation.

```ts
type ProfessionalContentRole =
  | "identity"
  | "offer"
  | "catalog"
  | "proof"
  | "process"
  | "operations"
  | "story"
  | "faq"
  | "contact";

type ProfessionalRouteBinding = {
  path: string;
  filePath: string;
  exportName: string;
  purpose: string;
  primaryJob: string;
  requiredFactIds: string[];
  sections: Array<{
    id: string;
    purpose: string;
    role: ProfessionalContentRole;
    requiredFactIds: string[];
  }>;
};

type ProfessionalSiteBlueprintV1 = {
  schemaVersion: 1;
  blueprintHash: string;
  contractHash: string;
  kit: {
    id: GeneratedSiteDesignKitId;
    version: 2;
    allowedPatternIds: string[];
  };
  pageStrategy: {
    mode: "single" | "multi";
    reason: "single-primary-job" | "distinct-customer-jobs";
    routeCount: number;
  };
  contentDepth: {
    density: "sparse" | "regular" | "rich";
    suppliedFactCount: number;
    omissionPolicy: "omit-unsupported-sections";
  };
  firstView: {
    requiredRoles: ["identity", "offer", "primary-action"];
    primaryCtaTarget: string;
  };
  artDirection: {
    subject: string;
    audience: string | null;
    acceptedDirection: string | null;
    variance: number;
    motion: number;
    density: number;
    shape: "sharp" | "soft" | "pill";
    typography: {
      allowedDisplayStackIds: string[];
      bodyStackId: string;
      maxDisplayRem: number;
      maxBodyCh: number;
    };
    palette: {
      backgroundLightness: "light" | "dark" | "either";
      temperature: "warm" | "cool" | "neutral";
      accentSurfaceMaximum: number;
    };
    rhythm: {
      sectionSpacingRem: [number, number];
      allowAlternatingSurfaces: boolean;
      maximumConsecutiveEqualTreatments: 2;
    };
    signature: {
      budget: 1;
      mustReference: Array<"offer" | "product" | "process" | "place" | "craft" | "audience">;
      forbidden: string[];
    };
  };
  media: {
    mode: "owner_assets" | "graphic" | "typographic";
    approvedAssets: GeneratedSiteWriterContractV3["media"]["approvedAssets"];
  };
  routes: ProfessionalRouteBinding[];
  responsive: {
    mobileViewport: { width: 390; height: 844 };
    desktopViewport: { width: 1440; height: 1000 };
    requireExplicitTransformFor: string[];
    primaryActionVisibleOnMobile: true;
  };
};
```

### Blueprint derivation

Blueprint derivation is pure and deterministic for the same contract and kit catalog version.

1. Validate one to three normalized routes.
2. Bind each accepted route to a protected router import, file path, and exact export name.
3. Classify every accepted section by purpose and required fact kinds.
4. Derive content density from supplied facts, not generated word count.
5. Choose compatible pattern candidates using actual prerequisites. A pattern whose `requires` are absent is not offered.
6. Record accepted visual direction as a constraint, never as customer-facing copy.
7. Derive one or more legitimate subject anchors from accepted facts.
8. Set media mode from feature policy plus approved assets.
9. Require explicit mobile transforms for split, asymmetric, rail, comparison, and media-led patterns.
10. Hash the canonical blueprint.

The platform does not choose generic section copy or an automatic first catalog pattern. The writer chooses one compatible pattern in the same streamed response.

### Content-role classification

Classification follows purpose and fact kinds, in this priority order:

- hero/introduction/primary CTA → `identity` or `offer`;
- product/menu/property/course collection → `catalog`;
- accepted testimonial, certification, history, or USP → `proof`;
- accepted order/service/booking steps → `process`;
- hours, address, delivery/service area, or payment method → `operations`;
- accepted business story/process narrative → `story`;
- accepted questions and answers → `faq`;
- contact/visit/book/order close → `contact`.

Ambiguous sections retain their accepted purpose and use `offer`; they are never rewritten into invented proof.

## Executable design kits V2

The five existing families remain:

- `editorial-airy`;
- `menu-led-editorial`;
- `catalog-story`;
- `warm-commerce`;
- `bold-typographic`.

V2 kits add executable typography, section-treatment, signature, and responsive policies.

```ts
type GeneratedSiteDesignKitV2 = Omit<
  GeneratedSiteDesignKitV1,
  "version" | "compositionPatterns" | "typography"
> & {
  version: 2;
  compositionPatterns: Array<{
    id: string;
    intent: string;
    requiredContentRoles: ProfessionalContentRole[];
    allowedMediaModes: Array<"owner_assets" | "graphic" | "typographic">;
    desktopRelationship: "centered" | "split" | "asymmetric" | "rail" | "editorial-list";
    requiredMobileTransform: string;
    forbids: string[];
  }>;
  typography: {
    allowedDisplayStackIds: string[];
    bodyStackId: string;
    maxDisplayRem: number;
    maxBodyCh: number;
  };
  allowedSectionTreatments: string[];
  allowedSignatureAnchors: ProfessionalSiteBlueprintV1["artDirection"]["signature"]["mustReference"];
};
```

A kit is executable only when it changes:

1. compatible blueprint choices;
2. protected primitive and semantic font outputs;
3. writer choices;
4. source/browser expectations;
5. professional-review anchors.

A kit that only changes prompt prose is invalid.

## Typography and theme compilation

Generated sites remain portable and make no runtime font request. Protected theme CSS exposes semantic stacks:

```css
@theme inline {
  --font-display: var(--site-font-display);
  --font-body: var(--site-font-body);
}
```

Kits select from source-owned system stacks such as editorial serif, humanist sans, geometric sans, and restrained grotesk. The writer uses `font-display` and `font-body`; it cannot emit `font-family`, remote font URLs, `@import`, or arbitrary font classes.

The protected compiler still owns all semantic colors. It must verify:

- normal text `>= 4.5:1`;
- large text and focus indicators `>= 3:1`;
- readable muted text on base, muted, contrast, primary, and accent surfaces;
- accent area policy as evidence;
- deterministic CSS for equal blueprint/plan inputs.

Only semantic Tailwind tokens may appear in generated TSX. Raw hex, named palette utilities, `site.theme` reads, color-bearing inline styles, and gradient text fail.

## Writer design plan V3

The writer emits a small bounded design plan before files in the same call.

```ts
type WriterDesignPlanV3 = {
  schemaVersion: 3;
  blueprintHash: string;
  patternId: string;
  visualThesis: string;
  signature: {
    description: string;
    sourceAnchor: "offer" | "product" | "process" | "place" | "craft" | "audience";
  };
  typography: {
    displayStackId: string;
    bodyStackId: string;
  };
  palette: {
    background: string;
    foreground: string;
    muted: string;
    accent: string;
  };
  routes: Array<{
    path: string;
    sections: Array<{
      id: string;
      treatment: string;
      surface: "base" | "muted" | "contrast";
      density: "compact" | "regular" | "airy";
    }>;
  }>;
  mobileTransforms: Array<{
    route: string;
    pattern: string;
    transform: string;
  }>;
};
```

Validation requires:

- exact blueprint hash;
- one compatible kit pattern;
- exactly one signature with an allowed accepted-fact anchor;
- allowed typography stacks;
- valid bounded palette;
- every declared route and section exactly once;
- allowed section treatments;
- no more than two consecutive equal treatments;
- explicit mobile transforms for every pattern that requires one;
- serialized plan size `<= 6 KiB`.

Plan prose is internal and cannot authorize customer-facing facts. The contract remains authoritative.

## Portable scaffold and routing

### Required DOM contracts

Generated route source uses these stable hooks:

- first-view container: `data-first-view`;
- primary action: `data-primary-action`;
- every accepted section: `data-section-id="<accepted-id>"` through `SiteSection`;
- selected pattern: `data-pattern="<pattern-id>"`.

Source gates verify that the hooks are attached to real accepted content and CTA bindings, not empty elements.

### Route bindings

The platform derives writable files and export names:

- `/` → `src/routes/index.tsx` → `HomeRouteComponent`;
- additional routes → normalized `src/routes/<slug>.tsx` and deterministic export names;
- multi-route output also includes `src/components/site/generated-shell.tsx` for shared navigation/footer composition.

`src/router.tsx` remains protected. After parsing, the platform compiles it from `ProfessionalRouteBinding[]` using `createHashHistory()` and exact route imports. The writer cannot register, omit, or invent routes.

### Output limits

- `landing`: exactly one route file; plan plus editable source `<= 32 KiB`.
- multi-route `marketing_site`: two or three route files plus one shared shell; editable source `<= 48 KiB`.
- no other editable paths;
- each file must close completely;
- the parser may stop after all blueprint-required paths close and assign an implicit done summary;
- output after required paths never invalidates a complete candidate.

## Source qualification

### Hard failures

Source qualification rejects:

- contract, blueprint, plan, kit, route, section, or media mismatch;
- missing required editable path or unexpected extra path;
- protected-file emission;
- wrong route export or protected router mismatch;
- missing or fake first-view/primary-action/section hooks;
- accepted fact or populated content omission;
- invented or prohibited claim/literal;
- wrong CTA label, target, kind, or external-link safety;
- broken internal route or anchor;
- unknown `site.*` fields;
- raw palette/font declarations or uncompiled utilities;
- missing selected primitive/pattern;
- starter/fixed-renderer/reference identity residue;
- placeholder, remote, unapproved, or empty media;
- technical customer-facing copy;
- `h-screen`, side stripes, gradient text, nested cards, repeated decorative eyebrows, unearned numbered scaffolding, or other explicit project bans;
- response/file/byte budget violation.

### Non-blocking professional signals

Objective evidence that is not universally wrong is recorded for the critic:

- repeated equal surface/treatment runs;
- uniform section spacing;
- high card repetition;
- unusual first-view empty area;
- accent surface share;
- dense long prose;
- weak size contrast between heading levels;
- signature source concentrated in an empty decorative node.

Signals never override facts or mechanically force one layout.

## Browser qualification V2

The browser runner remains isolated, blocks external requests, uses Indonesian locale, and captures private full-page JPEG evidence at:

- mobile `390×844`;
- desktop `1440×1000`.

Every declared route must pass:

- `route-load`;
- `console-clean`;
- `required-content-visible`;
- `primary-cta` with exact accepted destination;
- `internal-links`;
- `horizontal-overflow`;
- `heading-overflow`;
- `image-health`;
- `media-policy`;
- `computed-contrast`;
- `focus-visible`;
- `touch-target`;
- `first-view-contract`;
- `section-coverage`;
- `section-order`;
- `typography-bounds`;
- `content-hidden-by-navigation`;
- `empty-media-frame`.

### Objective bounds

- first-view identity, offer, and primary action are visible within the initial viewport;
- long body prose is at least `15px`, line-height at least `1.4`, and at most `78ch`;
- display text does not exceed `96px` or tracking tighter than `-0.04em`;
- primary/customer actions are at least `44×44px`;
- accepted sections exist once, appear in accepted order, and have non-zero visible content;
- sticky/fixed chrome cannot cover targeted content;
- no large bounded media-like frame is empty of approved image, meaningful SVG, or text content.

Browser V2 also records bounded professional signals and DOM geometry for review. Unsupported image/gradient contrast remains unknown and fails the affected assertion; it never silently passes.

## Final professional visual review

The critic is read-only and runs exactly once, after the final source/build/browser candidate. It receives:

- immutable contract projection;
- professional blueprint;
- accepted writer plan;
- selected kit rubric;
- source/browser professional signals;
- mobile and desktop screenshots for each route, maximum three routes.

It returns a category-complete scorecard, not only optional findings.

```ts
type ProfessionalReviewCategory =
  | "business_specificity"
  | "first_view_hierarchy"
  | "content_architecture"
  | "composition_rhythm"
  | "typography"
  | "color_system"
  | "media_integrity"
  | "mobile_quality"
  | "professional_finish";

type ProfessionalCategoryAssessment = {
  route: string;
  category: ProfessionalReviewCategory;
  rating: 1 | 2 | 3 | 4;
  viewport: "both" | "mobile" | "desktop";
  evidence: string;
  blueprintReference: string;
  suggestedRevision: string;
  confidence: number;
};

type GeneratedSiteProfessionalReviewV1 =
  | {
      status: "complete";
      promptVersion: string;
      requestedModel: string;
      servedModel: string;
      assessments: ProfessionalCategoryAssessment[];
    }
  | { status: "unknown"; reason: "missing_evidence" | "transport" | "empty" | "malformed" | "incomplete" | "low_confidence" };
```

### Rating anchors

- `1` — broken, deceptive, inaccessible, or clearly unusable;
- `2` — visibly unfinished, generic, weak, or requires major revision;
- `3` — professional, coherent, business-specific, and ready to publish;
- `4` — especially strong, distinctive, and polished without harming clarity.

Software derives the verdict. The model cannot declare itself passed.

A route passes only when:

- all nine categories appear exactly once;
- every assessment has specific screenshot evidence and a valid blueprint reference;
- every rating is at least `3`;
- review-level confidence is at least `0.80`;
- the parser and category coverage are complete.

A candidate passes only when every route passes. Any missing category, low-confidence report, transport failure, malformed JSON, empty response, or absent screenshot returns `unknown` and rejects selection.

## Critic calibration and authority

The critic earns authority; it does not receive authority because it returned JSON.

Calibration is versioned by:

- requested route (`default-combo` by default);
- served-model set observed during calibration;
- critic prompt hash/version;
- professional category/rating contract version;
- kit catalog version;
- evaluator/corpus version.

Minimum release evidence:

- at least `50` human-labeled page/viewport samples;
- at least `30` deliberately seeded defect page/viewport samples;
- blocker precision `>= 0.90` for human ratings `1-2`;
- blocker recall `>= 0.80`;
- false-ready rate `<= 0.05`;
- zero accepted P0 fact/action/accessibility defects;
- accepted reference 07 is not rejected merely for sparse content, bold type, or minimalism;
- each of the nine categories has labeled positive and negative coverage.

Calibration labels and screenshots remain private under `.data/generation-evaluation/`. A tracked aggregate summary may contain only version IDs, counts, rates, hashes, and pass/fail. It contains no owner copy, screenshots, prompts, contacts, or evidence URLs.

A prompt, category contract, kit version, or configured route change invalidates prior calibration for release purposes.

## Correction policy

The final critic is the last mutating boundary. There is no automatic source rewrite after it.

Normal model calls:

```text
writer:     1
critic:     1
correction: 0
tools:      0
```

Attempt maximum:

```text
writer:     1
critic:     1
correction: 1
tools:      0
```

The one shared correction may repair only a pre-review failure:

- writer transport/format;
- response contract;
- source gate;
- TypeScript/Vite build;
- deterministic browser gate.

After correction, source, build, and browser gates rerun. The critic then reviews the corrected final candidate exactly once.

If the critic rates any category below `3`, the candidate fails. The user may start an explicit new generation/edit attempt. This avoids auto-accepting an aesthetic rewrite that no reviewer saw.

## Failure and selection policy

| Failure | Outcome |
|---|---|
| Invalid handoff/hash or unsupported route scope | Fail before model call |
| No compatible kit/pattern | Configuration failure |
| Writer/response/source/build/browser failure | One correction if unused; otherwise fail |
| Browser infrastructure unavailable | `infrastructure_error` |
| Critic missing/empty/malformed/incomplete/low-confidence | `visual: unknown`, overall fail/infrastructure error |
| Any professional category rating `1-2` | Professional rejection |
| Correction still fails | Fail; no second correction |
| Candidate fails at any point | Last-known-good source/build/deployment remains selected |
| Candidate passes every gate | Candidate may replace selected output transactionally |

No deterministic fallback or bland renderer is presented as the new generated success. The deterministic route remains benchmark/control and emergency rollback behavior for new attempts only when explicitly selected by platform policy.

## Quality proof V3

```ts
type GeneratedSiteQualityProofV3 = {
  schemaVersion: 3;
  engine: "professional-static-single-shot";
  contractHash: string;
  blueprintHash: string;
  writerPlanHash: string | null;
  kitId: GeneratedSiteDesignKitId;
  kitVersion: 2;
  mediaMode: "owner_assets" | "graphic" | "typographic";
  calls: GeneratedSiteCallBudgetSnapshot;
  gates: {
    response: "pass" | "fail" | "not_run";
    source: "pass" | "fail" | "not_run";
    build: "pass" | "fail" | "not_run";
    browser: "pass" | "fail" | "infrastructure_error" | "not_run";
    professionalVisual: "pass" | "fail" | "unknown" | "not_run";
  };
  hardFailures: {
    fact: number;
    action: number;
    media: number;
    accessibility: number;
    route: number;
  };
  professional: {
    promptVersion: string | null;
    requestedModel: string | null;
    servedModel: string | null;
    minimumRating: number | null;
    averageRating: number | null;
    categoryRatings: Partial<Record<ProfessionalReviewCategory, number>>;
    unknownReason: string | null;
  };
  timingsMs: {
    contract: number;
    blueprint: number;
    writer: number;
    sourceGates: number;
    build: number;
    browser: number;
    critic: number;
    correction: number;
    totalToDecision: number;
  };
  output: {
    routeCount: number;
    editableFileCount: number;
    editableBytes: number;
    firstFileClosedMs: number | null;
  };
  outcome: "pass" | "fail" | "infrastructure_error";
};
```

A V3 pass requires all five gates to be `pass`, all hard-failure counts to be zero, every required category rating to be at least `3`, and exactly one writer plus one critic call. `unknown` can never coexist with `outcome: pass`.

Proof sanitization strips all full copy, prompts, plan prose, screenshot references, owner facts, URLs, and private evidence.

## Real evaluation contract V4

### Corpus

Keep twelve synthetic cases with two treatment trials each:

1. appointment service;
2. education/course;
3. F&B menu with operational details;
4. image-led business with synthetic approved assets;
5. local service with service area;
6. online professional service;
7. uploads disabled/no assets;
8. uploads enabled with synthetic approved assets;
9. uploads enabled without approved assets;
10. property/rental collection;
11. retail catalog;
12. sparse two-field brief.

At least two cases must declare two genuinely distinct routes so static marketing-site routing is exercised. Every other case remains one page unless its accepted jobs justify more.

### Arms

- `deterministic-control-v1` — speed and blind relative comparison only;
- `professional-static-v3` — treatment.

### Evidence integrity

Trial hard-failure counts come from actual proof and browser/source reports. The runner must not write literal zero values for facts, actions, media, accessibility, or routes.

Missing trials, failed evidence loading, critic `unknown`, and infrastructure errors stay in every denominator and fail release.

### Human blind review

Each randomized A/B pair collects:

- relative choice: A, B, or tie;
- whether A is ready to publish without major visual revision;
- whether B is ready to publish without major visual revision.

Mapping remains private. The normalized report derives treatment preference and treatment absolute readiness without revealing engine/kit/model/timing/source size to the reviewer.

### Conjunctive release thresholds

Execution and safety:

- exactly `24/24` treatment trials completed and passed;
- writer calls exactly `1` per trial;
- critic calls exactly `1` per trial;
- corrections `0-1` per trial and correction rate `<= 20%`;
- tool calls `0`;
- fact, action, media, route, and critical accessibility failures `0`;
- professional visual status `pass` for every trial;
- minimum category rating `>= 3` for every route/trial;
- all five kit families represented by a passing conformance case;
- at least two multi-route cases pass every route;
- no one composition pattern appears in more than `50%` of treatments.

Human quality:

- treatment wins at least `75%` of decisive comparisons;
- ties are at most `25%` of comparisons;
- treatment absolute “ready to publish” rate is at least `90%`;
- no corpus case has both treatment trials marked not ready;
- product owner explicitly approves the aggregate blind report.

Latency and size:

- total decision p50 `<= 90,000 ms`;
- total decision p95 `<= 150,000 ms`;
- first closed editable file p50 `<= 45,000 ms`;
- single-page editable bytes p95 `<= 32 KiB`;
- every multi-route candidate `<= 48 KiB`.

Thresholds are conjunctive. They cannot be changed to bless a failing run; a threshold change requires a new dated design decision and a fresh benchmark.

## Butik Senja regression

After corpus and calibration gates pass, regenerate existing project `cmss98mi8000c4lveqqui7scy` through the normal engine path without recreating it or editing generated files manually.

Require:

- new terminal attempt/build IDs;
- all V3 gates pass;
- professional review complete with every category `>= 3`;
- correct WhatsApp CTA target;
- readable mobile and desktop screenshots;
- no faint supporting text, empty product rectangle, generic side bars, excessive dead space, or weak right-column legibility;
- preview, thumbnail, and media behavior remain valid;
- last-known-good output remains selected on any failed candidate.

Butik Senja proves the reported real failure is fixed; it does not replace corpus evidence.

## Rollout

1. Implement V3 modules offline; keep production selection unchanged.
2. Generate calibration evidence and pass critic calibration.
3. Run all 24 treatment/control trials.
4. Complete blind preference and absolute-readiness review.
5. Publish sanitized aggregate evidence and obtain owner approval.
6. Integrate V3 into worker selection; preserve V2 proof readers only.
7. Regenerate Butik Senja and inspect private evidence.
8. Run local checks, push `dev`, wait for CI, release `main`, wait for CI.
9. Monitor correction rate, unknown visual rate, latency, and rejection categories.

Rollback stops selecting V3 for new attempts and preserves already selected last-known-good source. It does not restore ToolLoopAgent or rewrite existing projects.

## Testing strategy

### Unit

- V3 contract hashes and V2 historical readability;
- route binding/path/export normalization and three-route cap;
- content-role classification;
- blueprint determinism and compatible pattern filtering;
- kit V2 executability across primitives/prompt/gates/review rubric;
- writer-plan V3 validation and immutable-field enforcement;
- semantic font/theme compilation and contrast;
- response required-path stopping;
- protected router compilation;
- source hard failures and non-blocking signals;
- professional review parser, category completeness, rating anchors, confidence, and unknown reasons;
- V3 proof pass invariants and sanitization;
- V4 evaluation arithmetic and every release threshold.

### Fixture

- twelve synthetic handoffs compile expected one/multi-page blueprints;
- all five kits receive valid compatible cases;
- no kit primitive includes customer facts or a full fixed page;
- thirty seeded professional defect samples cover every review category;
- positive references remain accepted, including sparse/bold reference 07;
- negative/reference leakage remains rejected.

### Browser

- every route at both viewports;
- first-view identity/offer/action visibility;
- exact CTA destination;
- section coverage/order;
- typography bounds;
- sticky overlap;
- empty media frame;
- contrast, focus, touch, overflow, headings, media, links, and console;
- multi-route hash navigation and shared shell once.

### Integration

- one writer + one critic normal path;
- one shared correction before final critic;
- no source mutation after critic;
- critic unknown/fail cannot replace output;
- V3 pass transactionally replaces candidate;
- failed V3 preserves last-known-good source/build/deployment;
- proof persists in source metadata without private evidence;
- benchmark derives failure counts rather than inserting zeros.

## Documentation impact during implementation

Update in the same implementation diff:

- `DESIGN.md` generated-app quality floor and V3 versions;
- `DEV.md` benchmark, calibration, debugging, evidence, and failure semantics;
- `src/lib/projects/skills/design-quality.md` compact operational SOP;
- `docs/superpowers/README.md` high-signal pointer;
- no Storybook unless a reusable control-plane UI component changes.

## Security and privacy

- Runtime screenshots and human labels stay private and ignored under `.data/generation-evaluation/` or private S3 evidence.
- Telemetry contains IDs, versions, counts, ratings, timings, and failure classes only.
- No prompts, owner copy, contact values, screenshot bytes/URLs, evidence refs, or business facts enter telemetry or tracked calibration summaries.
- External network remains blocked during browser qualification.
- Generated source can reference only approved `/media/<assetId>` paths or local source-owned graphics.

## Frozen decisions

- Professional means all nine dimensions meet the ready-to-publish floor.
- Technical success alone cannot select output.
- `visual: unknown` is not pass for V3.
- The final critic runs once and last; there is no unreviewed post-critic repair.
- One writer, one critic, one optional shared pre-review correction, zero tools.
- Single page is default; accepted distinct jobs may produce at most three routes.
- The platform compiles protected hash-history routing.
- The writer emits a bounded design plan and complete required route files in one stream.
- No universal section count or universal page template.
- Objective gates do not absorb subjective composition taste.
- The critic must pass versioned human calibration before V3 selection.
- Relative blind preference and absolute publish readiness are both required.
- The 12-case/24-trial corpus is the release gate; Butik Senja is an additional real regression.
- Failed candidates never replace last-known-good output.
- No implementation begins by editing generated workspaces or switching models.
