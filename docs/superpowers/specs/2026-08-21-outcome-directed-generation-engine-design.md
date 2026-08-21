# Outcome-directed generation engine

**Date:** 2026-08-21

**Status:** Proposed for review

**Scope:** New generation and regeneration of static UMKM websites

**Supersedes:** Visual recipes, fixed design-kit selection, canned customer-copy fallbacks, and pattern-conformance requirements from the 2026-08-15 professional static-site design

**Preserves:** Accepted facts, portable Vite output, bounded tools, protected runtime files, objective browser gates, last-known-good recovery, private evidence, and human release approval

## Decision

UMKM Cepat will direct generated sites by outcomes, not page patterns.

The platform will state what must be true, what the visitor needs to accomplish, what facts the owner supplied, and what quality bar the result must meet. The creative director and build agent will own palette, typography, composition, section order, visual metaphor, responsive transformation, and component choice.

The engine will remove successful customer-facing fallbacks. Missing facts remain missing. Invalid AI output fails the attempt and preserves the last successful website.

The normal path uses one creative-direction call, one bounded build-agent run, one deterministic qualification pass, and one independent visual review. A failed visual review may authorize one critique-guided revision and one final review. No candidate reaches Preview unless the final reviewed version passes every required gate.

```text
accepted owner facts + visitor jobs
  -> fact-only generation contract
  -> one high-level creative direction
  -> bounded build agent with broad design authority
  -> source, build, and browser qualification
  -> independent rendered visual review
       -> pass
       -> one critique-guided revision -> qualify again -> final review
       -> fail and preserve last-known-good
```

## Why this replaces the current design

The current engine constrains the wrong decisions.

It protects facts and runtime topology, which is correct. It also selects a small visual kit, prescribes composition patterns, supplies fixed style dials, emits a shared gold-example skeleton, and compiles canned marketing copy. The active agent does not receive several of those plans, while protected theme files prevent it from correcting the decisions that do reach the scaffold.

This creates a narrow output distribution without reliable quality:

- one orange fallback overwrites business-specific palette decisions;
- generic headline and trust formulas appear as accepted customer copy;
- eight recipes and five design kits converge on familiar landing-page structures;
- every recipe shares the same example markup;
- placeholder assets enter every scaffold even when media is absent;
- discussion defaults can turn platform suggestions into apparent owner facts;
- objective gates sometimes check pattern conformance instead of correctness;
- the visual critic sees the result too late to guide a reviewed correction;
- the recovery notice appears in both discussion and Preview.

More recipes would make this worse. A larger template catalog still teaches the model to choose a template.

## Product outcome

A successful attempt produces a site that:

- uses only accepted owner facts and safe structural labels;
- serves one clear primary visitor job and any accepted distinct secondary jobs;
- has a working, accepted primary action;
- looks designed for this business rather than its broad category;
- has one coherent visual point of view without requiring a signature gimmick;
- treats mobile and desktop as deliberate compositions;
- passes accessibility, routing, content, media, and runtime checks;
- passes an independent visual review at the ready-to-publish floor;
- remains standalone Vite, React, TanStack Router, Tailwind, and shadcn source;
- preserves the previous selected output when any new candidate fails.

Technical validity is necessary but not sufficient. Visual novelty is not sufficient either. The site must be useful, truthful, coherent, and ready to publish.

## Authority boundaries

### The platform owns truth and safety

The platform controls:

- accepted facts and provenance;
- explicit omissions;
- visitor jobs and route obligations;
- CTA kind, label, and destination;
- approved media references;
- generated package and path policy;
- protected router, content, runtime, and build files;
- source, TypeScript, Vite, browser, accessibility, and security checks;
- call, time, output-size, and Energy budgets;
- selection and last-known-good transactions.

The platform does not write persuasive customer claims to fill missing content.

### The creative director owns the point of view

The creative director decides:

- the business-specific visual thesis;
- what should dominate the first view;
- which supplied subject, process, place, product, or customer tension can carry the design;
- the intended character and emotional register;
- the main risks that would make the result generic or inappropriate;
- how the experience should change on mobile at a high level.

It does not choose a named kit, fixed section sequence, card count, exact palette values, component tree, or prescribed hero type. It cannot add facts.

### The build agent owns execution

The build agent decides:

- semantic palette values;
- type system;
- composition and section order;
- route-level layouts;
- spacing and density;
- component selection;
- local graphics grounded in accepted material;
- interaction details;
- responsive transformations;
- which optional content to omit.

It can read bundled design skills, inspect the bounded scaffold, copy bundled shadcn components, write approved source paths, propose a validated design system, run deterministic checks, and repair its own compile or objective gate failures.

It cannot change accepted facts, install packages, use the shell, access the network, edit runtime topology, publish, or bypass a failed check.

### The visual reviewer owns the quality verdict

The visual reviewer judges rendered evidence. It does not prescribe a house layout.

It must identify concrete evidence for every rating and answer two decisive questions:

1. Could this design belong unchanged to an unrelated business?
2. Would a strong human designer consider it ready to publish without major visual revision?

Software derives pass or fail from the structured review. The reviewer cannot mark its own malformed or incomplete response as passing.

## Fact-only generation contract

The next contract version removes synthetic marketing prose.

```ts
type OutcomeDirectedSiteContractV1 = {
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
  actions: Array<{
    id: string;
    kind: "whatsapp" | "phone" | "visit" | "browse" | "book" | "order" | "other";
    label: string;
    href: string;
    priority: "primary" | "secondary";
  }>;
  routes: Array<{
    path: string;
    purpose: string;
    visitorJobIds: string[];
    requiredFactIds: string[];
  }>;
  media: {
    mode: "owner_assets" | "graphic" | "typographic";
    approvedAssets: Array<{
      assetId: string;
      mediaPath: string;
      purpose: string;
    }>;
  };
  omissions: string[];
  prohibitedClaims: string[];
};
```

The compiler follows these rules:

- No fallback headline, subheadline, USP, testimonial, product description, guarantee, audience, business name, CTA, route, or contact.
- The hero may display an accepted tagline, primary offer name, or business name. It cannot synthesize a promise.
- A missing required identity, primary offer, visitor job, or actionable CTA blocks generation before the creative call.
- Optional missing facts remain absent and their sections are omitted.
- Structural labels use a small closed vocabulary only when semantics require them, such as navigation accessibility labels. They do not become marketing copy.
- An unresolved CTA fails compilation. It never degrades to `#kontak`, `Lihat`, or a guessed contact.
- Customer-facing source uses protected `site.*` values. The build agent may add punctuation and non-claim interface labels from the closed vocabulary, but not new factual prose.

## Discussion and handoff policy

Discussion must help the owner decide without manufacturing business claims.

### Remove

- mandatory `recommendedOptionLabel` on every question;
- generic `Opsi A`, `Opsi B`, and `Opsi C` recovery choices;
- offer options such as `Paket Utama`, `Paket Lengkap`, and `Paket Hemat` when the owner did not name them;
- visual choices that silently become a complete art direction;
- suggested guarantees, speed claims, quality claims, popularity, hygiene, results, or operational promises;
- any success path that converts malformed AI output into a populated workspace card.

### Keep

- one question per turn;
- owner-editable examples for text fields, clearly marked as examples and never stored as answers;
- neutral choice options for real categorical decisions, such as contact channel or photo use;
- custom answers;
- explicit skip and omission recording;
- build readiness based on structural facts, not model confidence.

If the discuss model returns an invalid question, the server either asks a neutral text question derived from the missing field identifier or fails the turn. It does not invent customer-facing answer options.

## Creative direction contract

One model call creates an internal direction after contract validation.

```ts
type CreativeDirectionV1 = {
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

Validation requires:

- the exact contract hash;
- at least one anchor tied to an accepted fact;
- no color literals, font names, layout names, component names, section counts, claims, or customer copy;
- no invented facts;
- bounded size;
- no template language such as `split hero`, `bento`, `three cards`, or `testimonial carousel`.

The direction should explain what matters, not draw the page. For a laundry, it may frame the visitor's desired relief from a recurring chore. It may not require bubbles, washing-machine illustrations, mint, orange, a three-step path, or rounded cards.

Invalid direction fails before source generation. The engine does not substitute a generic direction.

## Open design-system proposal

The build agent must control the visual system without gaining access to protected files.

Add a bounded `set_design_system` tool. The agent proposes:

```ts
type GeneratedDesignSystemProposalV1 = {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  muted: string;
  mutedForeground: string;
  primary: string;
  primaryForeground: string;
  accent: string;
  accentForeground: string;
  border: string;
  ring: string;
  displayFontStackId: string;
  bodyFontStackId: string;
  radiusScale: "sharp" | "restrained" | "soft";
};
```

The tool:

1. parses supported color formats;
2. checks every required semantic contrast pair;
3. rejects inaccessible or incomplete proposals with exact reasons;
4. compiles validated values into protected `src/index.css`;
5. records the accepted proposal in the attempt proof;
6. keeps fonts local and portable through a broad source-owned stack catalog.

The platform does not supply an orange, warm, cool, light, or dark default. A missing or invalid design-system proposal fails the attempt. The agent repairs it within its bounded run.

The tool validates accessibility and token completeness. It does not enforce accent area, temperature, hue family, serif pairing, shape language, or a house style.

## Minimal scaffold

The generated scaffold contains only what compilation and portability require:

- Vite, React, TanStack Router, Tailwind, and runtime configuration;
- protected router and preview-ready wiring;
- protected fact-only `src/content/site.ts`;
- blank accepted route modules;
- base `Button` and `Card` only if the build agent needs them, otherwise no visible design primitives;
- the local shadcn registry as a tool-only catalog, not copied visible source;
- no placeholder images;
- no sample business;
- no example page;
- no gold markup;
- no customer-facing fallback copy;
- no visible starter residue.

The build agent lists project files separately from available registry components so dummy or unused component source does not anchor its design.

## Build-agent prompt

The prompt contains:

- the fact-only contract;
- the approved creative direction;
- the visitor jobs and route obligations;
- tool and security boundaries;
- the definition of ready-to-publish quality;
- the bundled Impeccable, Indonesian UMKM, web-quality, motion-when-used, and shadcn skills;
- objective checks the output must pass;
- a short list of hard bans tied to trust or known systemic failure.

It does not contain:

- a recipe;
- a design-kit name;
- preferred composition patterns;
- a fixed hierarchy;
- default style dials;
- a gold example;
- required asymmetric layout;
- required signature element;
- section-treatment enums;
- fixed typography roles;
- predetermined palette temperature;
- business-category layout mappings;
- positive examples whose markup can be copied.

Hard bans remain narrow:

- fabricated facts or claims;
- fake commerce, booking, search, filtering, countdown, or persistence;
- inaccessible controls;
- broken routes or actions;
- remote or unapproved media;
- placeholder frames;
- hidden content used to satisfy gates;
- runtime or package policy violations.

Aesthetic concerns such as card repetition, generic gradients, decorative badges, weak hierarchy, and template resemblance belong primarily to the visual review. Deterministic source checks may record them as evidence, but should not prescribe their replacement.

## Objective qualification

Deterministic checks answer questions software can prove.

### Source and contract

- all required routes and facts appear in their accepted scope;
- no unsupported customer-facing literals appear;
- CTA labels and destinations match the contract;
- no protected or unexpected paths are written;
- packages and imports stay within policy;
- media references are approved;
- no placeholder or remote media exists;
- no hidden gate-satisfying content exists;
- the accepted design-system proposal matches compiled CSS.

### Build

- TypeScript passes;
- Vite builds;
- output stays within bounded size;
- no prohibited lifecycle or network dependency exists.

### Browser

Every route runs at mobile `390x844` and desktop `1440x1000`:

- route load and console clean;
- required accepted content visible;
- exact primary action and destination;
- internal links;
- horizontal and heading overflow;
- computed contrast;
- focus visibility;
- touch targets;
- image and media policy;
- sticky-content overlap;
- empty media frames;
- readable typography bounds;
- one usable first-view action.

Deterministic checks do not require a hero, card grid, section count, signature node, alternating surface, specific spacing range, palette temperature, or named composition pattern.

## Independent visual review

The reviewer receives the contract, creative direction, rendered mobile and desktop screenshots, objective gate evidence, and no design-kit rubric.

It rates every route from 1 to 4 in these categories:

1. business specificity;
2. visitor-job clarity;
3. first-view hierarchy;
4. content judgment and omission discipline;
5. composition and rhythm;
6. typography;
7. color system;
8. mobile composition;
9. interaction and action clarity;
10. professional finish.

Rating anchors:

- `1`: broken, deceptive, inaccessible, or unusable;
- `2`: generic, visibly unfinished, incoherent, or needs major revision;
- `3`: coherent, business-specific, and ready to publish;
- `4`: unusually strong and memorable without reducing clarity.

Each assessment includes:

- route and viewport;
- rating;
- screenshot-grounded evidence;
- contract or direction reference;
- one concrete revision when rating is below 3;
- confidence.

A first review passes only when every category for every route is at least 3 and confidence is at least 0.80. Missing, malformed, incomplete, unavailable, or low-confidence review output is `unknown` and fails closed.

### Critique-guided revision

If the first review fails with a complete, high-confidence critique:

- software converts only ratings below 3 into a bounded revision brief;
- the same build agent receives the current source, screenshots, and critique;
- facts, actions, routes, and protected files remain immutable;
- the agent may revise source and design-system tokens;
- all objective gates rerun;
- a fresh final visual review evaluates the revised rendered result.

The final review is authoritative. No source mutation occurs after it. A final rating below 3 or `unknown` fails the attempt.

Revision is not available for invalid facts, unresolved CTA, unsupported scope, auth, spend, or infrastructure failures. Those fail at their owning boundary.

## Call and iteration budget

Normal successful attempt:

```text
creative direction: 1
build agent:        1 bounded tool loop
visual review:      1
revision:           0
```

Maximum attempt:

```text
creative direction: 1
build agent:        1 bounded tool loop
visual review:      2
revision:           1 bounded tool loop
```

The build and revision loops share hard limits for steps, wall time, output bytes, and Energy. The platform stops when limits expire. It never presents partial source as a successful new website.

## Recovery UX

Build progress stays in discussion while generation runs and after it fails.

- Starting a build does not force mobile users into Preview.
- A successful selected candidate offers `Lihat website` and lets the owner open Preview.
- A failed attempt returns or remains on discussion.
- The recovery notice appears once in discussion, not inside Preview.
- `Lihat website` opens the last successful candidate when one exists.
- The notice explains that the previous website remains safe and gives one clear retry or discussion path.
- Preview may show a small non-blocking in-progress status only when the owner explicitly opens it during a rebuild.

## What remains deterministic but non-visual

Business archetypes may remain for:

- deciding which factual questions apply;
- validating supported visitor jobs;
- classifying operational facts;
- evaluation-corpus coverage.

They cannot select palette, typography, composition, sections, component patterns, or customer copy.

## Code removal and consolidation

Implementation should delete or retire from the active path:

- `defaultTheme` as a successful generated-site theme;
- `createFallbackProjectSiteSchema()` customer-facing output;
- synthetic headline, subheadline, trust-point, product-description, audience, CTA, and section-purpose helpers;
- generated gold examples;
- generated-site visual recipes;
- V1 and V2 visual kit selection from production generation;
- duplicate `recipeForV2()` logic;
- default writer design plans and pattern enums;
- fixed design dials and category-to-layout routing;
- scaffold placeholder assets;
- preview-side duplicate recovery notice;
- malformed-discussion choice fallbacks;
- docs and tests that treat these outputs as valid success.

Historical snapshot readers may retain versioned parsing only where existing selected projects require it. Historical code must not remain reachable from new generation.

Prefer deletion over compatibility wrappers. If a legacy reader has no selected artifact dependency, delete it.

## Failure semantics

| Failure | Result |
| --- | --- |
| Missing required owner identity, offer, job, or action | Block before creative call and return to discussion |
| Invalid fact contract or unsafe CTA | Fail closed, no generated fallback |
| Creative direction malformed or invented | One structured-output retry inside the call policy, then fail |
| Build agent writes incomplete or invalid source | Repair within bounded loop, then fail |
| Objective source, build, or browser gate fails | Repair within bounded loop, then fail |
| First visual review below 3 | One critique-guided revision if eligible |
| Final visual review below 3 | Fail and preserve last-known-good |
| Visual review unknown | Fail or infrastructure error, never pass |
| Energy exhausted | Stop, preserve staged work privately, preserve last-known-good |
| Any failed candidate | Never replace Preview or Production |

No deterministic renderer, dummy site, generic copy, or placeholder project can convert failure into success.

## Evidence and observability

Persist sanitized attempt evidence:

- contract, direction, prompt, tool, and reviewer versions;
- requested and served model IDs;
- tool counts and failure classes;
- objective gate results;
- category ratings and confidence;
- correction usage;
- timings, output bytes, and Energy;
- structural fingerprint for cohort analysis;
- final selection outcome.

Keep owner facts, prompts, screenshots, source, contact values, and reviewer prose private in existing evidence storage. Logs carry IDs, counts, hashes, and failure classes only.

## Quality evaluation and release authority

A visually ambitious engine cannot grade itself into production. Release requires private human evidence.

### Corpus

Use at least 20 business cases with two independent trials each. Cover:

- sparse and rich briefs;
- owner assets, graphic, and typographic media modes;
- local services, online services, food, retail, property, education, community, events, and unfamiliar businesses;
- one, two, and three justified routes;
- weak or absent visual preferences;
- long Indonesian names and copy;
- missing optional operational and trust facts.

Include real regression cases such as Kilau Laundry and Butik Senja after synthetic qualification.

### Per-candidate gates

Every treatment candidate must have:

- zero fact, CTA, route, media, security, and critical accessibility failures;
- every final visual category at least 3;
- no visual `unknown`;
- bounded calls, time, bytes, and Energy;
- no fallback customer copy;
- no unreviewed post-critic mutation.

### Human blind review

Reviewers see randomized mobile and desktop evidence without engine, model, source, or timing labels. For every candidate they answer:

- ready to publish without major revision: yes or no;
- specific to this business: yes or no;
- recognizable as the same template as another corpus result: yes or no, with paired evidence;
- preference against the current production result.

### Release thresholds

All conditions must pass:

- at least 40 completed treatment trials;
- ready-to-publish rate at least 90%;
- business-specific rate at least 90%;
- template-recognition rate at most 10%;
- treatment wins at least 75% of decisive comparisons against current production;
- zero accepted fabricated facts, broken actions, or critical accessibility defects;
- no business case loses both trials;
- final-review false-ready rate at most 5% on a separate seeded-defect calibration set;
- owner approval of the blind aggregate report;
- CI and full repository verification pass.

Structural fingerprints may reveal convergence for investigation, but no single DOM shape becomes a production ban. Human paired evidence decides whether results look templated.

Do not lower thresholds to approve a failing run. A threshold change needs a new dated decision and fresh evidence.

## Rollout

1. Implement the fact-only contract and block customer-facing fallbacks behind tests.
2. Remove discussion answer fabrication and tighten readiness.
3. Add creative-direction validation.
4. Add the validated design-system tool and minimal scaffold.
5. simplify the build-agent prompt and remove recipes, kits, gold examples, and style dials from the active path.
6. Split objective qualification from subjective evidence.
7. Add the category-complete reviewer and one reviewed revision path.
8. Fix discussion-first build and recovery UX.
9. Run the private corpus, critic calibration, and blind review.
10. Enable production selection only after the release manifest records passing evidence and owner approval.
11. Regenerate Kilau Laundry and Butik Senja through the normal route. Do not edit generated workspaces manually.
12. Monitor fallback attempts, review failures, revisions, latency, Energy, and structural convergence.

Rollout remains fail closed. Until release evidence passes, keep the current selected engine for users and run the new path only in evaluation mode. A failed evaluation never mutates project source, Preview, Production, handoff, or credits outside its explicit evaluation ledger.

## Testing strategy

### Unit tests

- fact-only contract projection and hashing;
- no synthetic customer copy for missing optional fields;
- strict required identity, offer, visitor job, and CTA checks;
- CTA resolution with no guessed fallback;
- neutral discussion recovery without fabricated options;
- creative-direction schema, fact anchors, and anti-prescription checks;
- design-system proposal parsing, contrast, font, and token compilation;
- scaffold contains no placeholders, examples, or visible starter copy;
- protected path and package policy;
- visual-review category completeness and verdict derivation;
- critique-to-revision projection;
- final-review and no-post-review-mutation invariants;
- recovery surface state.

### Integration tests

- accepted handoff through selected source transaction;
- invalid contract fails before model spend;
- build agent cannot change facts or protected runtime files;
- objective failure repairs within one bounded build run;
- first visual rejection receives one revision and final review;
- final rejection preserves last-known-good;
- review unknown preserves last-known-good;
- Energy and call ledgers match actual usage;
- one to three route compilation and navigation;
- historical selected snapshots remain readable.

### Browser tests

- all accepted routes at both viewports;
- exact actions, content, links, focus, touch, contrast, overflow, typography, and media;
- discussion remains active during and after failure;
- recovery notice appears once;
- successful completion opens Preview only by owner action;
- last-good Preview remains available after failure.

### Evaluation tests

- corpus manifests contain no owner secrets;
- randomized blind review hides treatment identity;
- template-recognition pairs are complete;
- release arithmetic fails on missing or infrastructure-unknown trials;
- thresholds remain conjunctive;
- served-model and prompt-version changes invalidate release authority.

## Documentation changes during implementation

Update in the implementation diff:

- `DEV.md` generation runtime, debugging, evaluation, and recovery semantics;
- `DESIGN.md` generated-app authority boundaries and quality floor;
- `PRODUCT.md` only if owner discussion or visible build behavior changes beyond this spec;
- `docs/superpowers/README.md` high-signal generation pointer;
- remove or mark superseded plans that still direct agents toward visual kits and recipes;
- no Storybook unless implementation changes reusable control-plane components.

## Security and privacy

- The build and revision agents remain sandboxed and have no shell, network, credentials, package installation, or publishing authority.
- Untrusted owner and generated content remain data, not instructions.
- Browser qualification blocks external requests.
- Only approved media paths enter generated source.
- Private screenshots, source, prompts, reviewer evidence, and owner facts stay in private storage.
- Telemetry contains hashes, IDs, versions, counts, ratings, timings, and failure classes only.

## Frozen decisions

- Strict outcomes replace prescribed visual patterns.
- Facts, actions, routes, safety, accessibility, and runtime remain platform-owned.
- Palette, type, composition, rhythm, components, and responsive execution belong to the build agent.
- No successful customer-facing fallback content exists.
- Missing required facts block; missing optional facts disappear.
- No design kits, visual recipes, gold markup, default dials, or category-to-layout mapping in the active path.
- One creative direction guides meaning without drawing the page.
- The build agent proposes a validated semantic design system.
- Objective software gates never encode a preferred page shape.
- One independent visual review is normal; one reviewed revision and final review is the maximum.
- Final visual `unknown` or any category below 3 cannot select output.
- No mutation occurs after the final review.
- Failed attempts preserve last-known-good Preview and Production.
- Build and recovery stay in discussion until the owner opens Preview.
- Production release requires human blind evidence for readiness, specificity, and low template recognition.
