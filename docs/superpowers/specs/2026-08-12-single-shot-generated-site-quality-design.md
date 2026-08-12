# Single-Shot Generated Site Quality — Design

**Date:** 2026-08-12
**Status:** Approved design; implementation not started
**Scope:** First-generation `landing` and `marketing_site` output only
**Supersedes:** the aesthetic-quality portions of `docs/superpowers/plans/2026-08-12-engine-reliability-beautiful-ui.md`; preserves its reliability fixes
**Preserves:** the structured streaming writer decision in `docs/superpowers/specs/2026-08-04-batched-generation-design.md` and the tool-free build decision in `docs/superpowers/specs/2026-08-06-pure-text-spec-design.md`

## Summary

UMKM Cepat will keep a Bolt-style single streamed source-writing response and recover the visual quality pressure lost when the legacy tool-loop generator was removed. It will not restore an unrestricted model tool loop.

The platform will deterministically compile owner facts, page intent, photo-feature policy, an archetype-specific design recipe, and one matching gold example. The build model will then emit one compact design plan and all source files in one streamed response. Deterministic source, accessibility, build, and browser gates will evaluate the result. Only risky builds invoke a screenshot critic. A critic failure permits one targeted repair call; the complete gate stack then reruns. A candidate that still fails remains failed and never replaces the last-known-good output.

```text
typed brief + accepted handoff + photo feature setting
  -> deterministic generated-site contract
  -> deterministic recipe + one matching gold example
  -> ONE streamed build-model response
       <design-plan>...</design-plan>
       <file path="...">...</file>
       <done ... />
  -> source/contract/theme gates
  -> TypeScript + Vite build
  -> desktop + mobile browser gates
  -> deterministic risk decision
       clean -> candidate passes
       risky -> screenshot critic
                  pass -> candidate passes
                  fail -> ONE targeted repair response
                            -> rerun every gate
                            -> candidate passes or fails honestly
```

Normal successful builds use one build-model call. The p50 end-to-end target is at most 120 seconds.

## Why This Design Exists

The current engine proves that a generated project parses, references structured data, compiles, and builds. It does not prove that the rendered site is useful or visually credible.

The successful SuryaPhone E2E project `cmspxz8p700014l1zxozqogw8` exposed the gap:

- `src/routes/index.tsx` retained `// Replace this with the real home page built from the brief`.
- The page retained the starter's centered `max-w-3xl` single-column shell.
- Customer-facing headings included `Products`, `Testimonials`, and `Connect With Us`.
- The primary CTA targeted `kontak`, but no matching `id="kontak"` existed.
- Social anchors used `link.handle` instead of the valid optional URL.
- A phone catalog contained no product imagery, device graphic, or intentional image-free product presentation.
- Visible sections used implementation names such as `HeroSection`, `ProductCard`, and `PromoBanner`.
- `--muted-foreground: #1C1C1C` appeared on `--background: #0D0D0D`, making supporting text unreadable.
- Populated `usp`, `paymentMethods`, `address`, and `deliveryArea` were omitted.

The build passed because existing gates measure technical completeness and a narrow set of populated fields. They do not enforce contrast, CTA integrity, customer-facing language, business fit, visual hierarchy, or starter-layout removal.

## Historical Audit Findings

The commits supplied for comparison were inspected in detached worktrees without changing the current branch:

- `08316bc8bb26ae1bfc4e6bb3a1ec50596ef850e8`
- `445abf52c9e3fc9cfbbc721999d71c5c673ff12d`
- `451774f2d2531f2bf7301803c8c7b307f3bd71ae`
- `0d41ae3fce3492b898bec6a81b61f245cf927c21`

Those revisions looked stronger primarily because they retained one or both of these quality pressures:

1. The legacy `custom-source-generator.ts` required meaningful presentation writes, rejected stale starter markers, checked custom CSS coverage, and could force a rewrite.
2. The deterministic generated starter contained stronger compositions: navigation, a two-column hero, a large display headline, a showcase element, varied information regions, a process strip, and a closing CTA.

The old approach is not restored wholesale:

- The model tool loop caused repeated context transmission, high latency, and unpredictable spend.
- Hardcoded deterministic variants were too narrow and could misclassify an unrelated business.
- Old source checks still did not establish rendered visual quality.
- The same theme-token contrast bug existed in the old shadcn mapping.

The useful behavior to recover is quality pressure, explicit composition, and rejection of starter residue—not repeated model tool calls.

## Goals

1. Produce a credible, business-specific generated landing or marketing site in the first streamed writer response.
2. Keep the normal build path to one build-model call and p50 end-to-end latency at or below 120 seconds.
3. Preserve accepted owner facts without fabricating claims, prices, stock, contacts, awards, addresses, guarantees, or operational capabilities.
4. Make art direction, composition, imagery policy, and content obligations explicit before source generation.
5. Reject technically valid but generic, unreadable, untranslated, broken, or starter-derived output.
6. Run expensive screenshot criticism only when deterministic evidence marks a build risky, plus mandatory offline corpus evaluation.
7. Permit at most one evidence-driven visual repair call.
8. Keep failed candidates from replacing the last-known-good generated source or deployment.
9. Keep the generated-site design system separate from the UMKM Cepat control-plane product UI.
10. Make engine changes measurable against a frozen corpus instead of relying on one favorable generation.

## Non-Goals

- No restoration of `ToolLoopAgent`, `custom-source-generator.ts`, or unrestricted model tools.
- No multi-agent planner/builder/judge swarm.
- No generated backend, authentication, database, checkout, payment processing, or persistence.
- No redesign of the UMKM Cepat control-plane UI.
- No automatic rebuild or migration of existing generated projects.
- No guarantee that automation establishes complete WCAG conformance.
- No image search, stock licensing pipeline, or remote image hotlinking in this phase.
- No new quality architecture for `interactive_app` in v1; it keeps current behavior until landing/marketing quality is calibrated.
- No fixed universal visual template or page count.
- No claim that a single aggregate aesthetic score can establish quality.

## Design Principles

1. Constrain correctness and intent, not visual expression.
2. Front-load decisions; do not spend model turns discovering the scaffold.
3. One owner fact has one typed representation.
4. Implementation components are not customer-facing content.
5. One selected recipe beats a prompt containing many competing examples.
6. A neutral scaffold must not invite partial starter reuse.
7. Cheap deterministic checks run before browser checks; browser checks run before model criticism.
8. Build success is necessary, never sufficient.
9. Repairs are bounded and evidence-driven.
10. A failed candidate remains failed; no bland fallback is presented as success.

## Scope Boundary: Product UI vs Generated Site UI

Two design systems remain distinct:

### UMKM Cepat product UI

The authenticated workspace, admin, account, builder controls, and progress states follow root `DESIGN.md`: warm, restrained, task-first product UI. This spec does not modify those surfaces.

### Generated site UI

Generated customer-facing sites are brand/marketing surfaces. Their visual identity must derive from the business contract and selected archetype recipe. They must not inherit UMKM Cepat's warm-neutral product shell, typography, or layout unless the business itself calls for it.

Generated source remains portable and contains no UMKM Cepat-branded runtime dependency.

## Architecture

### Normal path

1. Load the immutable accepted handoff, normalized typed brief, approved assets, and the current `feature.builder_photo_enabled` setting.
2. Compile a `GeneratedSiteContractV1` deterministically. No model call occurs here.
3. Select one versioned recipe deterministically from the declared archetype and business facts.
4. Select one versioned gold example matching the recipe and media mode.
5. Construct the writer prompt from the contract, recipe, example, scaffold manifest, and strict response contract.
6. Make one streamed build-model call.
7. Parse `<design-plan>`, `<file>`, and `<done>` blocks while persisting closed file blocks durably.
8. Validate source, contract conformance, content, links, theme, and accessibility.
9. Build with TypeScript and Vite.
10. Render desktop and mobile verification views.
11. Compute deterministic risk.
12. If clean, accept the candidate. If risky, run the screenshot critic.
13. If the critic fails, make one targeted repair call and rerun all gates.
14. Select the candidate only after every required gate passes.

### No additional spec-model call

The existing post-click AI implementation-spec call is removed for `landing` and `marketing_site`. The deterministic contract replaces its factual, topology, and policy responsibilities. Creative planning moves into the `<design-plan>` block of the single writer response.

The writer may choose expressive implementation details within the contract. It may not change owner facts, CTA targets, required sections, media mode, prohibited claims, or route topology.

### Interactive app isolation

`interactive_app` remains on the current generation behavior in this phase. Dispatch is explicit by `appKind`; it must not silently consume the landing-only contract. A later spec may adopt this pipeline after landing/marketing calibration.

## Generated Site Contract

```ts
type GeneratedSiteContractV1 = {
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
    recipeVersion: number;
    composition: string;
    hierarchy: string[];
    typographyStrategy: string;
    colorStrategy: string;
    mediaMode:
      | "owner_assets"
      | "replaceable_slots"
      | "graphic"
      | "typographic";
    approvedAssets: Array<{
      assetId: string;
      mediaPath: string;
      purpose: "logo" | "hero" | "product" | "gallery" | "reference";
    }>;
    signatureElement: string;
    antiPatterns: string[];
  };
};
```

Names above reuse existing rich-field types where those types already exist. The implementation may use equivalent existing names instead of duplicating types.

### Contract compilation rules

- Compilation is deterministic and pure for equal normalized input, recipe version, gold-example version, and photo setting.
- `contractHash` is SHA-256 over a canonical semantic projection that excludes the hash itself and mutable timestamps.
- Owner facts are copied without semantic rewriting.
- AI-drafted copy already accepted in the handoff may be used; new factual claims may not be introduced.
- `spec.components` or equivalent implementation component names never populate visible sections.
- Visible sections come from typed content and visitor jobs.
- Technical identifiers are lowercase ASCII slugs; visible headings are Indonesian customer-facing copy.
- A missing exact fact remains omitted. No placeholder address, phone, price, stock, testimonial, or guarantee is generated.
- Routes are canonical, unique, and rooted at `/`.
- Every required section names the exact content fields it must expose.
- Sparse two-field briefs receive a deliberately small page; they are not padded with fabricated proof or generic sections.

### Content section derivation

The compiler derives customer-facing intent, not rendered labels:

- Products imply catalog/browse intent.
- Real testimonials imply social proof.
- FAQ items imply objection handling.
- Address/hours imply visit intent when compatible with the CTA.
- Delivery area/payment methods imply order logistics.
- USP/trust points imply a concise trust region, not necessarily cards.
- Promotion implies a visible campaign message only when current and owner-supplied.

Component names such as `HeroSection`, `ProductCard`, `PromoBanner`, or `TestimonialCard` are implementation vocabulary and are forbidden as visible headings.

## Recipe System

### Purpose

A recipe defines composition constraints and business-specific visual opportunities. It is not a source template and contains no business copy.

Initial recipes cover at least:

- `retail-catalog`
- `fnb-menu`
- `fnb-light`
- `retail-grocery`
- `service-area`
- `service-appointment`
- `service-online`
- `property-rental`
- `education-course`
- `professional-credibility`
- `generic`

### Recipe shape

```ts
type GeneratedSiteRecipeV1 = {
  id: string;
  version: 1;
  compatibleArchetypes: string[];
  requiredWhen: string[];
  composition: string;
  hierarchy: string[];
  preferredPatterns: string[];
  avoidPatterns: string[];
  mediaGuidance: Record<GeneratedSiteMediaMode, string>;
  requiredBrowserAssertions: string[];
  riskTags: string[];
};
```

A recipe may describe asymmetric, image-led, catalog-first, service-first, or typographic composition. It must not prescribe one universal rounded-card grid.

### Gold examples

- One matching example is selected per generation.
- Examples are versioned source fixtures, not copied from user projects or private data.
- Each example demonstrates composition quality, responsive behavior, semantic tokens, and valid routing.
- Examples use neutral synthetic content that cannot leak into the final page.
- The prompt explicitly says to copy principles, never copy text, facts, business names, URLs, or exact visual identity.
- An example mismatch is a contract/compiler error; the system does not inject multiple competing fallback examples.

## Media and Photo Feature Policy

The current setting `feature.builder_photo_enabled` is a build input. The resolved value is captured in the contract and snapshot proof so a later setting change does not alter an in-flight build.

### Flag off

- Discuss does not request photos.
- The contract chooses `graphic` or `typographic`.
- The writer prompt forbids owner-upload language, remote images, `/placeholder.svg`, `/placeholder-vertical.svg`, empty image frames, and copy such as “replace this image later.”
- Recipes must provide complete image-free compositions using typography, color, geometry, icons, patterns, product data, or other local non-deceptive graphics.
- Source and browser gates reject placeholder or upload-dependent output.

### Flag on with approved owner media

- The contract chooses `owner_assets`.
- Only approved `/media/<assetId>` paths may represent owner media.
- The design places assets according to approved purposes and supplies specific alt text.
- Missing/broken approved media fails browser validation; it is not silently replaced with stock imagery.

### Flag on without owner media

- The contract may choose `replaceable_slots` only when imagery materially improves the business surface.
- Local `/placeholder.svg` and `/placeholder-vertical.svg` are permitted as intentionally replaceable slots.
- The page must remain coherent, useful, and trustworthy before replacement.
- Placeholders may not imply a real product, property, person, location, certification, result, or testimonial.
- The writer must not claim that photos are required to use or publish the site.
- A user who did not explicitly choose “add photos later” may still receive image-free `graphic` or `typographic` output when that is stronger.

### Stock imagery

Verified stock imagery is outside this phase. No remote hotlinks or guessed photo URLs are allowed. A future approved asset-ingestion pipeline may add downloaded, licensed assets without changing the writer contract.

## Streamed Writer Contract

The response order is strict:

```text
<design-plan>
{...compact JSON...}
</design-plan>
<file path="src/routes/index.tsx">
...full raw file content...
</file>
<file path="src/components/...">
...full raw file content...
</file>
<done summary="..." />
```

### Design plan shape

```ts
type WriterDesignPlanV1 = {
  contractHash: string;
  recipeId: string;
  mediaMode: GeneratedSiteMediaMode;
  visualThesis: string;
  hierarchy: string[];
  sectionOrder: string[];
  signatureElement: string;
};
```

Rules:

- The design plan is compact and must precede every file.
- It is part of the same model response, not a separate call.
- `contractHash`, `recipeId`, and `mediaMode` must match the compiled contract exactly.
- `sectionOrder` must cover required section IDs.
- The plan cannot introduce facts or routes.
- Missing, malformed, or contradictory plans fail before source acceptance.
- Raw source remains in strict `<file>` blocks and uses the current streaming persistence behavior.
- The response contains no tool calls.

## Scaffold Policy

The scaffold owns runtime correctness, not page design.

- Platform-owned files remain protected.
- The starter home route becomes neutral and unmistakably incomplete.
- The starter must not contain a visually reusable centered hero/card composition.
- Any starter marker or meaningful starter structure surviving in a candidate fails validation.
- `src/index.css` remains platform-owned for semantic tokens and runtime-safe base rules.
- The writer uses inline Tailwind utilities and approved generated components unless a later spec explicitly reopens custom CSS ownership.
- Pre-seeded shadcn primitives remain implementation tools, not a mandate to express every content block as a `Card`.

A structural-similarity check may use stable starter fingerprints such as marker text and distinctive class sequences. It must not reject common individual utilities such as `mx-auto` or `px-6`.

## Theme Compilation

The platform—not the writer—owns semantic color correctness.

### Required semantic roles

- background
- foreground
- surface/card
- surface foreground
- primary
- primary foreground
- secondary
- secondary foreground
- muted surface
- muted foreground
- accent
- accent foreground
- border
- input
- focus ring
- destructive
- destructive foreground

### Rules

- `muted` is a surface color; it must not be copied directly into `muted-foreground`.
- Text/background pairs are derived or adjusted until they meet the configured WCAG thresholds.
- Normal text requires at least 4.5:1 contrast.
- Large text requires at least 3:1 contrast.
- Focus indicators require at least 3:1 contrast against adjacent colors.
- Invalid or unparseable palette values fail contract compilation; they do not degrade to unsafe colors.
- Theme compilation produces deterministic output and unit-testable contrast reports.
- The writer consumes semantic roles and does not redeclare competing palette literals unless the contract explicitly permits a decorative role.

## Quality Gates

Gates run in the following order and stop expensive work when a cheaper gate already fails.

### 1. Response and source gates

Existing safe-path, parser, import allow-list, required-file, TypeScript syntax, and protected-file checks remain.

New checks reject:

- missing or contradictory `<design-plan>`
- starter marker or starter structural fingerprint
- visible technical component headings
- customer-facing English section headings when the site language is Indonesian
- undeclared or omitted required content
- unsupported invented `site.*` fields
- incomplete route registration
- generic boilerplate or synthetic gold-example text
- forbidden claims or high-risk literals not present in the contract
- photo-policy violations
- raw remote placeholder/image URLs

### 2. Content conformance gates

The contract, not `site.ts` regex presence alone, defines required visible content.

Checks verify:

- every required content field is rendered on its assigned route
- every primary CTA has the expected label, target, and interaction kind
- every internal anchor target exists exactly once
- every planned route is registered and reachable
- social links use valid contract URLs when provided; a handle is never used as an href
- address, hours, payment, delivery, promotion, and price data appear only when supplied
- technical implementation names never become visible content
- sparse contracts remain sparse instead of receiving fabricated filler

AST checks remain useful for source evidence. Browser checks establish actual visibility.

### 3. Structural genericness gates

Deterministic signals reject or mark risky:

- the full rich page constrained to the starter's narrow centered shell
- every major section expressed as an identical card list
- repeated equal cards without content-driven reason
- no meaningful hierarchy beyond sequential `h2` blocks
- identical spacing on every section
- recipe-required composition absent
- no signature element from the accepted design plan

Hard rejection is reserved for unambiguous violations such as surviving starter fingerprints. Softer genericness signals contribute to risk so legitimate restrained designs are not rejected mechanically.

### 4. Theme and accessibility gates

Source-level checks verify:

- semantic token pairs meet contrast thresholds
- heading scale and letter spacing remain inside safe bounds
- motion includes reduced-motion behavior when motion is present
- interactive elements have accessible names
- buttons/links have visible focus treatment
- image alt text follows media policy
- landmarks and heading order are valid enough for deterministic inspection

Browser-level checks verify computed contrast for visible text, focus visibility for primary controls, and target dimensions. Automated checks establish a floor, not complete WCAG conformance.

### 5. Build gates

- TypeScript project build passes.
- Vite build passes.
- Artifact paths and manifest remain valid.
- Failure is recorded against the candidate; no weaker generated source is substituted.

### 6. Browser gates

Run against at least:

- mobile: 390 × 844
- desktop: 1440 × 1000

For every planned route or representative route:

- route loads with no runtime or console error
- required content is visible, not only present in the DOM
- primary CTA is visible and resolves to the contracted action
- internal navigation and anchors resolve
- no horizontal overflow exists
- major headings do not clip or overflow
- no broken image exists
- placeholder behavior matches media mode
- content is not hidden behind fixed navigation
- touch targets meet the configured floor
- desktop and mobile screenshots are captured ephemerally for risk/critic use

Screenshots are runtime artifacts and must not be committed.

## Deterministic Risk Decision

The risk classifier is versioned and returns evidence, never a vague score.

```ts
type GeneratedSiteRiskReportV1 = {
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
```

A critic is required when any configured risk reason exists. Random sampling remains enabled at a small versioned rate during calibration. The risk decision uses deterministic inputs and is recorded in candidate metadata.

## Screenshot Critic

The critic is read-only and receives only the evidence required to judge generated visual quality:

- compiled generated-site contract
- writer design plan
- recipe rubric
- desktop/mobile screenshots
- deterministic risk reasons

It evaluates separate categories:

- business fit
- hierarchy
- composition
- typography
- color and contrast
- imagery/media-policy execution
- content usefulness
- mobile quality
- genericness

The critic returns structured findings with route, viewport, category, severity, screenshot evidence, proposed correction, and confidence.

Rules:

- It cannot change facts, contracts, recipes, gates, thresholds, deployment, or publishing.
- It cannot override a deterministic hard failure.
- It returns `unknown`, not `pass`, when required evidence is unavailable.
- Critical functional, safety, or accessibility findings fail regardless of aggregate aesthetic quality.
- Category thresholds are calibrated against human review before pilot rollout.

## One Targeted Repair

A critic failure permits exactly one model repair response.

Input includes:

- contract and contract hash
- design plan
- recipe
- exact critic findings
- deterministic gate evidence
- implicated source files only
- bounded screenshot references or extracted visual evidence

Output contains only full replacement `<file>` blocks for implicated editable files and one `<done>` block. It may not alter the compiled contract, platform-owned theme/scaffold files, route topology, or owner facts.

After repair:

1. Rerun response/source gates.
2. Rerun content and theme gates.
3. Rerun TypeScript and Vite builds.
4. Rerun desktop/mobile browser gates.
5. Rerun deterministic risk.
6. Rerun the critic when risk remains or when the original failure was critic-originated.

A remaining failure ends the candidate honestly. There is no second repair and no generic fallback.

## Frozen Regression Corpus

The initial corpus contains at least 12 public, synthetic, non-secret fixtures:

1. Retail catalog with several products.
2. F&B menu with hours/location.
3. Local service with service area.
4. Appointment service.
5. Property/rental collection.
6. Education/course offer.
7. Online professional service.
8. Image-led business.
9. Photo feature off with no assets.
10. Photo feature on with approved owner-like fixture assets.
11. Photo feature on without assets.
12. Sparse two-field brief.

The corpus also includes sanitized structural equivalents of historical good-result briefs and the current SuryaPhone failure. It does not contain personal account IDs, private source, private screenshots, real credentials, or unapproved customer data.

Each fixture defines:

- normalized typed brief/contract input
- expected recipe and media mode
- required routes and content
- required CTA behavior
- prohibited claims
- expected image/placeholder policy
- desktop/mobile browser assertions
- prohibited starter/generic patterns
- risk expectations where deterministic

Every engine release candidate runs each fixture twice to expose model variance.

## Quality Rubric

Aesthetic assessment remains category-based. No single total score can conceal a critical failure.

Each category uses anchored criteria rather than adjectives such as “beautiful”:

- **Business fit:** layout and emphasis serve the primary visitor job and actual offer.
- **Hierarchy:** the first viewport establishes identity, offer, and primary action clearly.
- **Composition:** section treatment and rhythm vary according to content; structure is intentional.
- **Typography:** readable scale, line length, wrapping, and role contrast support the business voice.
- **Color/contrast:** palette has a deliberate strategy and every required pair is readable.
- **Imagery:** execution follows media mode and avoids deceptive or broken visuals.
- **Content usefulness:** supplied products, proof, logistics, and objections are surfaced where useful.
- **Mobile quality:** order, spacing, navigation, targets, and overflow remain usable at 390px.
- **Genericness:** the page does not read as a starter, repeated-card dump, or copied gold example.

Human calibration records pass/fail and category feedback. Critic agreement is measured per category, not only overall.

## Acceptance Metrics

Offline corpus and rollout telemetry must establish:

- clean-build p50 end-to-end latency ≤120 seconds
- first-build technical success ≥95%
- deterministic quality-gate pass ≥90%
- zero accepted critical accessibility failures in the corpus
- zero accepted broken CTA/internal-link failures in the corpus
- zero accepted fabricated-fact failures in the corpus
- all 12 corpus fixtures pass twice before internal rollout
- one-repair usage and success rate are measured separately
- critic invocation rate is measured; clean builds normally remain one-call
- critic/human agreement meets the calibrated per-category threshold recorded by the evaluator version

Latency measurement starts when the build attempt begins source-contract compilation and ends when the candidate reaches ready or honest failure. Reports separate contract compilation, writer, gates, build, browser, critic, repair, and thumbnail time.

Thumbnail capture is not part of release qualification unless the product explicitly makes it so in a later decision.

## Rollout

1. **Offline only:** corpus generation, deterministic gates, browser checks, and human critic calibration.
2. **Internal accounts:** enabled by a dedicated generated-site-quality setting.
3. **Pilot:** approved users after thresholds hold on internal runs.
4. **All:** only after the release metrics remain above threshold for the configured sample.

Rollback restores the prior batched prompt/recipe/gate version. It does not restore a tool loop and requires no DB migration or generated-project rebuild.

Existing projects are not rebuilt. Last-known-good source and deployment remain selected while a new candidate is generating or failing.

## Settings

The design introduces the smallest DB-first setting surface required for safe rollout:

- one rollout setting for the generated-site quality pipeline, using the project's established `off | internal | pilot | all` semantics
- optional deterministic sampling rate for critic calibration, bounded to `0..1`

`feature.builder_photo_enabled` remains the existing canonical photo setting; it is not duplicated.

Thresholds and recipe/evaluator versions are code-owned for reproducibility. They do not become arbitrary admin knobs in v1.

## Persistence and Proof

Successful and failed candidate metadata records:

- generated-site contract hash and schema version
- recipe ID/version
- gold-example ID/version
- writer design-plan hash
- photo feature value and media mode resolved at attempt start
- gate report version and category outcomes
- desktop/mobile browser gate outcomes
- risk report version and reasons
- critic model/evaluator version and outcome when invoked
- repair count (`0` or `1`)
- per-stage timings

Do not persist private full prompts or screenshots in tracked files. Runtime screenshot retention follows existing private artifact policy and must be bounded. Logs contain IDs, versions, timings, and category outcomes—not owner content or image bytes.

## Error Handling

| Failure | Result |
|---|---|
| Contract compilation rejects facts/policy | Fail before writer; no charge for writer call |
| No compatible recipe/example | Fail loudly as configuration error |
| Writer omits/malforms design plan | One existing format retry may repair transport structure only; it may not add an open-ended design loop |
| Writer source fails deterministic gates | Use the existing bounded source-repair behavior only for technical/source diagnostics; visual repair budget remains one |
| TypeScript/Vite fails | Existing bounded compile repair policy applies only if retained by implementation plan; every resulting candidate reruns full gates |
| Browser unavailable | Infrastructure error, never quality pass |
| Risk critic unavailable/unknown | Risky candidate fails closed during calibration/pilot; rollout policy may only change after measured evidence and a new decision |
| Critic fails candidate | One targeted visual repair |
| Repaired candidate still fails | Honest failure; last-known-good remains selected |
| Energy exhausted | Persist completed stage evidence; explicit recoverable failure, no free hidden calls |

The implementation plan must reconcile existing format/technical repair counts with the one visual-repair limit so call budgets are explicit and telemetry cannot mislabel repairs.

## Testing Strategy

### Unit tests

- deterministic contract compilation
- technical component names never becoming visible sections
- recipe and gold-example selection
- canonical hashes
- photo flag/media-mode matrix
- semantic token contrast derivation
- design-plan parsing and conformance
- CTA/anchor/social-link checks
- starter fingerprints
- language/technical-heading checks
- populated-content coverage
- risk classification

### Fixture/component tests

- each recipe fixture produces the expected contract and prompt fragment
- gold examples contain no prohibited copy and satisfy their own gates
- neutral scaffold cannot pass as generated output

### Browser tests

- mobile and desktop route rendering
- CTA and anchor resolution
- horizontal overflow
- computed text contrast
- focus visibility and accessible names
- image/placeholder policy
- required content visibility
- runtime/console errors

### Corpus tests

- 12 fixtures × 2 independent writer runs
- category rubric evidence
- risk/critic invocation behavior
- repair behavior
- stage latency reporting

### Final E2E

Only after unit, fixture, browser, and corpus gates pass:

- run one real-account build with the photo flag off
- run one real-account build with the photo flag on and no uploaded media
- verify ready state, desktop/mobile output, CTA behavior, thumbnail/preview integration, source portability, and account visibility

Personal account identifiers and credentials remain untracked.

## Documentation Impact

Implementation must update:

- root `DESIGN.md` generated-app design-system section
- relevant generated-engine architecture decision trail
- admin-setting documentation if a rollout setting is added
- test/corpus operating instructions

No Storybook change is required unless the implementation changes reusable UMKM Cepat product UI. Generated-site fixture previews belong in the corpus/browser harness, not product Storybook.

## Implementation Sequence

The implementation plan must preserve these dependency boundaries:

1. Freeze failure fixtures and quality contracts.
2. Compile media policy and accessible theme deterministically.
3. Separate implementation topology from customer-facing content.
4. Add recipes and one-example selection.
5. Extend streamed protocol with `<design-plan>`.
6. Neutralize scaffold and strengthen source/content gates.
7. Add browser verifier and risk report.
8. Calibrate screenshot critic and one repair.
9. Add corpus runner and release report.
10. Roll out behind settings; run final E2E only after local/corpus success.

Each task starts with a failing focused test and ends with focused tests plus lint/typecheck as appropriate. The complete `bun run check` gate runs before handoff.

## Decisions Frozen by This Spec

- One normal writer call; no unrestricted tool loop.
- Deterministic contract plus in-response creative design plan.
- Landing/marketing scope first; interactive apps isolated.
- Clean-build p50 target ≤120 seconds.
- Deterministic gates always.
- Screenshot critic only for risk-triggered builds and mandatory offline corpus evaluation.
- One targeted visual repair; then honest failure.
- Photo flag off forbids placeholders and upload-dependent design.
- Photo flag on with no assets permits replaceable slots but does not require them.
- No remote hotlinks or stock-image pipeline in v1.
- Current/last-known-good output survives candidate failure.
