# Contract-Compiled Generation - Design

**Date:** 2026-08-03
**Status:** Approved architecture; implementation not started
**Scope:** Discuss readiness, build planning, generated source ownership, conformance gates, visual review, repair, edit, and rollout for generated UMKM sites

## Summary

UMKM Cepat will replace its prompt-led generation handoff with a contract-compiled workflow:

```text
discuss
  -> versioned business contract draft
  -> validated build plan draft
  -> Mulai build accepts both revisions
  -> platform compiles topology and protected source
  -> one AI builder writes creative app source
  -> deterministic source/build/browser gates
  -> read-only visual critic in shadow mode
  -> bounded repair into an immutable child candidate
  -> human preview, edit, and publish
```

The platform constrains facts, routing, shared-shell ownership, safety, and release qualification. The AI keeps ownership of business-specific composition, copy phrasing, typography, visual identity, responsive layout, and approved static interactions.

This is not a template renderer, a full visual AST, or a default multi-agent system.

## Why This Supersedes Prompt-Only Generation

The existing stack already has a structured implementation spec, archetype guidance, a locked shadcn/Tailwind stack, source quality checks, Vite builds, repair loops, and thumbnail capture. The observed failures happen because these layers do not share one executable source of truth.

### Verified project evidence

| Project | Evidence | Diagnosis |
|---|---|---|
| `cmscsmrj9000d4l9nr3gxt0ct` | Generated `src/routes/__root.tsx` owns header/footer/WhatsApp while `src/components/layout.tsx` owns them again; generated `src/router.tsx` omits hash history | Deterministic structural failure: duplicate shell and nested-preview route mismatch |
| `cmsbkwxmt002b4l6mspjvkfv8` | Generated `src/routes/index.tsx:212-213` uses a full-width section background with a `max-w-6xl` inner container | The reported width problem is a visual-intent mismatch, not a universal source-rule violation |
| `cms75zhvl00014lc6280skref` | Generated router registers `/`, `/katalog`, and `/tentang` with hash history; root mounts shared chrome once | Positive example proving the current model can produce a coherent multi-page app, but only probabilistically |
| `cmsbquu2r00024lr8mwkxy74o` | Persisted plan and router intentionally contain one page with services, hours, location, and one WhatsApp conversion path | One page may be correct; the missing capability is a traceable visitor-job and page-split decision |

### Verified code gaps

| Gap | Current evidence |
|---|---|
| Conflicting interview policy | `src/lib/projects/prompts/discuss-system.md` says both "extract every applicable field" and "mandatory plus two soft fields -> build early" |
| Multiple readiness authorities | `src/lib/projects/brief.ts`, `src/lib/projects/brief-flow.ts`, workspace-card type, model confidence, and client/API behavior disagree |
| Thin planning input | `buildImplementationSpecPrompt` and `briefToBuildPrompt` omit most rich typed fields from `ProjectBrief` |
| Weak page normalization | `parseImplementationSpec` accepts arbitrary/duplicate slugs and does not require exactly one root path |
| Silent semantic downgrade | Two invalid AI plans become a successful one-page `implementationSpecFromBrief` result |
| Ambiguous source ownership | Prompts call `src/routes/__root.tsx` and `src/index.css` platform-owned while the path guard permits writes across `src/` |
| Incomplete route check | `findUnregisteredRouteFiles` catches extra files but not missing planned pages, root reachability, hash history, or broken links |
| Narrow design gate | `getGeneratedDesignIssues` mechanically blocks gradient text and `h-screen`, but not rendered structural defects |
| Non-authoritative manifest | Missing manifests silently become a valid one-route default manifest |
| No rendered release gate | Thumbnail capture is best-effort after success and does not evaluate the image or route behavior |
| Weaker repair semantics | Some repairs optimize for compilation without rerunning the complete semantic/source conformance contract |
| No immutable candidate boundary | Compile repair can mutate the snapshot/artifact associated with the failed candidate |

## Relationship To Existing Decisions

This design preserves valid decisions from earlier specs and supersedes only conflicting behavior.

| Existing design | Relationship |
|---|---|
| `2026-07-16-discussion-mode-field-completeness-design.md` | Keeps one-question conversational discovery and typed rich fields; replaces model-owned percentage readiness with deterministic contract readiness |
| `2026-07-27-archetype-driven-generation-design.md` | Keeps archetypes as advisory business-shape guidance; page topology is now carried and validated by a build plan |
| `2026-08-02-discuss-build-speed-design.md` | Keeps one source-writing agent, queue separation, verify-in-loop, and compile repair safety nets; does not introduce a default agent swarm |
| `2026-08-03-discuss-build-handoff-design.md` | Keeps the AI-led `Mulai build` handoff and no force-build composer control; the card now represents a valid contract and plan |
| `2026-08-03-post-build-discuss-none-success-design.md` | Unchanged; post-build discussion and `none` remain valid |

Compile repair and visual repair are separate:

- Existing bounded compile repair remains available until benchmark evidence supports changing its limit.
- Visual-critic repair is initially disabled, then limited to one targeted repair after calibration.
- Every repair creates a child candidate and reruns all applicable gates.

## Goals

1. Preserve every accepted owner fact from discussion through planning, generation, repair, edit, and rendered output.
2. Make page topology, route registration, shared-shell mounting, and manifest generation correct by construction.
3. Let one AI builder create distinctive, business-specific interfaces without control over infrastructure or release gates.
4. Validate the real rendered app at desktop and mobile before marking a build ready.
5. Add visual review without allowing an LLM judge to override deterministic correctness or human publishing authority.
6. Preserve existing projects, last-known-good artifacts, and current discuss/build/edit mental models.
7. Measure first-build intent capture, structural acceptance, visual preference, latency, cost, and consistency against a frozen baseline.

## Non-Goals

- No full declarative visual AST or no-code page renderer.
- No fixed UMKM page templates or forced page counts.
- No requirement that every section's content span the full viewport.
- No universal 18-question intake or fixed 10-question minimum.
- No autonomous planner/builder/critic swarm.
- No AI authority over contract acceptance, tests, evaluator thresholds, baselines, deployment, or publishing.
- No migration or automatic rebuild of existing generated projects.
- No new generated backend, authentication, database, payment gateway, or arbitrary dependency support.
- No claim that automated checks establish full WCAG conformance.
- No production enablement of generated execution before the existing isolated-worker and separate-origin requirements are satisfied.

## Design Principles

1. Constrain invariants, not visual expression.
2. One accepted fact has one provenance trail.
3. One artifact has one writer.
4. Plan and generated topology must be mechanically comparable.
5. Cheap deterministic gates run before expensive browser or model evaluation.
6. A failed planner or validator remains a failure; it never becomes a weaker successful site silently.
7. Every mutation path uses the same conformance pipeline.
8. Repairs are bounded, evidence-driven, and immutable.
9. Last-known-good output survives every failed candidate.
10. Human approval remains required for facts, publishing, and subjective final quality.

## Domain Model

The design uses two related artifacts rather than one giant schema.

### Build contract

The build contract records business truth and owner-reviewable intent. The immutable handoff status records whether that exact contract/plan pair was accepted; acceptance state is not embedded in hashed semantic content.

```ts
type BuildContractV1 = {
  schemaVersion: 1;
  revision: number;
  contentHash: string;
  identity: {
    businessName: string;
    businessType: string | null;
  };
  facts: ContractFactV1[];
  decisions: Array<{
    decisionId: string;
    state: "answered" | "skipped_safe" | "unknown_safe" | "not_applicable";
    sourceTurnId: string;
  }>;
  visitorJobs: Array<{
    id: string;
    goal: string;
    priority: "primary" | "secondary";
  }>;
  ctaIntents: Array<{
    id: string;
    kind: "whatsapp" | "phone" | "visit" | "browse" | "book" | "order" | "other";
    label: string;
    targetFactId?: string;
  }>;
  hardRequirements: Array<{ id: string; statement: string }>;
  prohibitedClaims: Array<{ id: string; statement: string }>;
  preferences: {
    visualDirection: string | null;
    tone: string | null;
    density: "airy" | "balanced" | "dense" | null;
    motion: "minimal" | "moderate" | "expressive" | null;
  };
  assets: Array<{
    assetId: string;
    approvedPurpose: "logo" | "hero" | "product" | "gallery" | "reference";
  }>;
  blockers: Array<{ decisionId: string; reason: string }>;
  omissions: Array<{
    decisionId: string;
    reason: "skipped" | "unknown" | "not_applicable";
  }>;
};

type FactRecord<K extends string, V> = {
  id: string;
  kind: K;
  value: V;
  provenance: {
    source: "owner" | "ai_draft" | "uploaded_asset";
    turnId: string | null;
    assetId: string | null;
    supersedesFactId: string | null;
    reviewItemId: string | null;
  };
};

type ContractFactV1 =
  | FactRecord<"offer", ProductOrServiceItem[]>
  | FactRecord<"contact", ContactValue>
  | FactRecord<"hours", HoursValue[]>
  | FactRecord<"address", AddressValue>
  | FactRecord<"service_area", ServiceAreaValue[]>
  | FactRecord<"price", PriceValue[]>
  | FactRecord<"payment_method", PaymentMethodValue[]>
  | FactRecord<"certification", CertificationValue[]>
  | FactRecord<"testimonial", TestimonialValue[]>
  | FactRecord<"social_link", SocialLinkValue[]>
  | FactRecord<"promotion", PromotionValue[]>
  | FactRecord<"other", string>;
```

Rules:

- `contentHash` is computed server-side from canonical semantic content, excluding mutable status timestamps.
- The model proposes patches; the server validates and normalizes them.
- Owner-provided facts are never rewritten as different facts. Corrections create a new fact with `supersedesFactId`; historical provenance remains inspectable.
- AI-drafted tagline, USP, and qualitative copy retain `ai_draft` provenance. They become approved for one build only when the accepted handoff proves that their exact `reviewItemId` and value were displayed.
- Unknown exact values remain omitted. They never receive placeholders or invented defaults.
- Accepting `Mulai build` freezes the displayed contract revision and hash for that build.
- Provenance is conditional and enforced: owner and AI-drafted values require `turnId`; AI drafts also require `reviewItemId`; uploaded-asset facts require `assetId`; unrelated provenance fields are null.
- The `kind` discriminator determines the only valid value schema. High-risk data cannot be stored under `other`; validation rejects an `other` string that matches the versioned high-risk grammar.

### Build plan

The build plan translates a review-ready contract draft into executable site topology. The pair becomes accepted only through its immutable handoff.

```ts
type BuildPlanV1 = {
  schemaVersion: 1;
  revision: number;
  contractHash: string;
  contentHash: string;
  appKind: "landing" | "marketing_site" | "interactive_app";
  archetype: string;
  pages: Array<{
    id: string;
    path: string;
    title: string;
    purpose: string;
    visitorJobIds: string[];
    requiredFactIds: string[];
    representativePath?: string;
    sections: Array<{
      id: string;
      purpose: string;
      surfaceIntent: "full_bleed" | "contained" | "prose";
      requiredFactIds: string[];
      requiredAssetIds: string[];
    }>;
  }>;
  navigation: Array<{
    fromPageId: string;
    toPageId: string;
    label: string;
  }>;
  capabilities: Array<
    | "catalog"
    | "lead_intent"
    | "location"
    | "payment_link_placeholder"
    | "static_content"
    | "whatsapp_cta"
  >;
  artDirection: {
    businessSpecificReference: string;
    antiReferences: string[];
    imageStrategy: "owner_assets" | "graphic" | "typographic";
    fontStrategy: "platform_registry" | "system_stack";
  };
};
```

Rules:

- Exactly one page has path `/`.
- Paths are canonical, unique, safe, and normalized before persistence.
- Dynamic page types include a safe representative path for browser verification.
- Every primary visitor job is covered by at least one page.
- Every required fact/asset reference exists in the paired contract.
- `contractHash` must equal the paired contract's content hash.
- The plan is visible in summarized form before `Mulai build` acceptance.
- A changed contract invalidates any plan with a different contract hash.

### Schema bounds and canonical hashes

V1 limits:

| Item | Limit |
|---|---:|
| Serialized contract | 64 KiB UTF-8 |
| Serialized plan | 64 KiB UTF-8 |
| Facts | 80 |
| Decisions | 40 |
| Visitor jobs | 8 |
| CTA intents | 8 |
| Hard requirements | 24 |
| Prohibited claims | 24 |
| Approved assets | 20 |
| Pages | 1-6 |
| Sections per page | 1-12 |
| Navigation edges | 36 |
| Art-direction anti-references | 8 |
| Build-card review items | 96 and 48 KiB serialized |
| Normal prose string | 280 characters unless its typed field already has a stricter limit |

IDs use lowercase ASCII slugs and are unique within their collection. Contract fact values reuse the existing validated rich-field types from `brief-rich-fields`; arbitrary nested JSON is rejected.

V1 capabilities are a closed enum matching `SUPPORTED_CAPABILITIES` in `generated-app-manifest.ts`: `catalog`, `lead_intent`, `location`, `payment_link_placeholder`, `static_content`, and `whatsapp_cta`. Adding a capability requires a schema, compiler, manifest, browser validator, and security review in the same change. `interactive_app` remains client-only and non-persistent.

Canonical hashes use explicit semantic projections:

- `BuildContractHashInputV1` omits `revision` and `contentHash`. It includes `schemaVersion` and every remaining contract field.
- `BuildPlanHashInputV1` omits `revision` and `contentHash`. It includes `schemaVersion`, `contractHash`, and every remaining plan field.
- Acceptance status, handoff ids, review items, timestamps, attempt state, and selected-candidate state are never hash inputs.
- Contract arrays are unordered sets and sort by stable id, except typed value arrays whose existing rich-field schema declares user-visible order.
- Plan `pages`, each page's `sections`, and `navigation` preserve presentation order. Set-like id arrays, `capabilities`, and `antiReferences` sort by normalized value.

Canonical hash procedure:

1. Validate and normalize typed values.
2. Normalize strings to Unicode NFC and line endings to `\n`.
3. Sort object keys recursively; preserve semantically ordered arrays.
4. Serialize canonical JSON as UTF-8.
5. Prefix with `umkmcepat:build-contract:v1:` or `umkmcepat:build-plan:v1:`.
6. Compute SHA-256 and encode lowercase hexadecimal.

Hash tests use fixed cross-platform vectors.

### Persistence and durable handoff

Persist a sticky generation engine on `Project` and immutable contract/plan pairs in a dedicated handoff row:

```prisma
model Project {
  // Existing rows receive the safe legacy default during the additive migration.
  generationEngine  String @default("legacy-v1") @db.VarChar(32)
  activeHandoffId   String? @unique
  activeHandoff     ProjectBuildHandoff? @relation("ProjectActiveHandoff", fields: [activeHandoffId], references: [id], onDelete: SetNull)
  buildHandoffs     ProjectBuildHandoff[] @relation("ProjectBuildHandoffs")
}

model User {
  buildHandoffs ProjectBuildHandoff[]
}

model ProjectBuildHandoff {
  id               String   @id @default(cuid())
  projectId        String
  project          Project  @relation("ProjectBuildHandoffs", fields: [projectId], references: [id], onDelete: Cascade)
  activeForProject Project? @relation("ProjectActiveHandoff")
  userId           String
  user             User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  engine           String   @db.VarChar(32)
  status           String   @default("draft") @db.VarChar(32)
  contract         Json
  plan             Json
  contractHash     String   @db.VarChar(64)
  planHash         String   @db.VarChar(64)
  reviewItems      Json
  reviewHash       String   @db.VarChar(64)
  contractRevision Int
  planRevision     Int
  acceptedAt       DateTime?
  supersededAt     DateTime?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  attempts ProjectEditAttempt[]

  @@unique([projectId, contractRevision, planRevision])
  @@index([projectId, status, createdAt])
  @@index([userId])
}

model ProjectEditAttempt {
  handoffId String?
  handoff   ProjectBuildHandoff? @relation(fields: [handoffId], references: [id], onDelete: SetNull)
}
```

Handoff status records review/acceptance only; attempt and build rows own queued, running, succeeded, failed, and cancelled execution state. Handoff statuses are a closed state machine:

```text
draft -> accepted -> superseded
  |          |
  +--------> cancelled
  +--------> superseded
```

An accepted handoff remains accepted across attempt failures and explicit retries. A draft becomes superseded when a newer contract revision invalidates it. An accepted handoff becomes superseded only when a qualifying candidate from a newer accepted handoff is atomically selected. Cancelling an active handoff without selecting a replacement is forbidden. `Project.activeHandoffId` identifies the handoff that produced the selected contract-v1 deployment; it remains unchanged while a structural replacement is being built or fails.

The build-recommendation card carries the opaque `handoffId`. `POST generate` sends that id. In one database transaction the server:

1. Locks the handoff and project.
2. Verifies ownership, project engine, hashes, revisions, `reviewHash`, current project state, and no active build; atomically claims the project operation lease.
3. For a first click, compare-and-swap `draft` to `accepted` with `acceptedAt`.
4. Create the generation attempt/placeholder snapshot/build linked to `handoffId` and the request idempotency key, unless that exact request already has them.

After commit, enqueue uses the attempt id as the queue idempotency key. Replaying the same request returns the same attempt. If enqueue fails, that attempt is marked failed and the handoff remains `accepted`; an explicit retry may create a new attempt linked to the same accepted handoff without replanning or reaccepting. Workers load contract and plan only from the immutable handoff row, never from the latest project brief/card.

After all gates pass, candidate selection and deployment run in one transaction that verifies the operation lease, selects the snapshot, updates `Project.activeHandoffId`, and supersedes the previously active handoff only when it differs. A failed candidate never changes the active handoff or last-known-good deployment. Non-structural edits and restores resolve their contract and plan through `activeHandoffId`; structural attempts explicitly name the newly accepted replacement handoff.

The migration is additive. Existing rows receive `legacy-v1`; no contract/plan backfill or source rebuild occurs.

Each source snapshot also records immutable proof in `ProjectSnapshot.metadata`:

```text
generation.contractHash
generation.planHash
generation.contractRevision
generation.planRevision
generation.gateReportVersion
generation.handoffId
```

Snapshot metadata proves exactly which immutable handoff produced an artifact. Candidate lineage uses the existing `ProjectSnapshot.parentSnapshotId` relation rather than a second parent identifier.

## Discovery And Readiness

### Question protocol

Every readiness-relevant production question is backed by a server-owned registry entry:

```ts
type BuildDecisionDefinition = {
  id: string;
  target:
    | "business_identity"
    | "primary_offer"
    | "primary_visitor_job"
    | "primary_cta"
    | "cta_destination"
    | "offer_structure"
    | "location_operations"
    | "transaction_flow"
    | "proof_constraints"
    | "media_strategy"
    | "visual_preference";
  applicability: "always" | "local_business" | "multi_offer" | "transactional" | "image_led" | "regulated";
  blocksReadiness: boolean;
  skipPolicy: "forbidden" | "safe_omission" | "not_applicable_only";
  outputEffect: string;
};
```

The registry implementation owns applicability predicates and readiness effects. Every entry declares:

- Which contract field, decision, or risk it can change.
- Which business shapes make it applicable.
- Whether it is required, conditional, or optional.
- Its skip/unknown/not-applicable behavior.
- Which ambiguity or contradiction blocks readiness.
- How answer, skip, abandonment, and downstream revision rates will be measured.

A question that cannot change generation, validation, or owner trust is removed. The model may ask a free-form advisory clarification, but only registered decisions can block or authorize readiness.

The model selects the highest-value unanswered applicable `decisionId`; the server verifies that selection and supplies the corresponding skip behavior. Contract blockers and omissions reference registry ids, not free-form reasons alone.

### Core discovery dimensions

The default journey establishes four semantic dimensions:

1. Business identity.
2. Offer or product structure.
3. Primary visitor/customer job.
4. Primary action and a valid destination.

After that, the model selects zero to four adaptive registered decisions as the initial product hypothesis. This is a turn budget, not a promise that every business always receives eight questions. If more than four conditional blockers remain, the server continues only for blockers that cannot be safely omitted; optional preference questions move to post-build edit.

High-value adaptive triggers include:

| Trigger | Information to resolve |
|---|---|
| In-person/local business | Address, service area, hours, location CTA |
| Multiple materially different offers | Offer hierarchy and whether distinct pages are useful |
| Booking/order/quote intent | Completion channel, required fields, and CTA target |
| Catalog/menu/portfolio content | Collection size, categories, details, prices, and imagery |
| Ambiguous audience | Vocabulary, objections, proof, and prioritization |
| Regulated/high-risk claims | Required disclaimers and prohibited claims |
| Image-led business | Owner assets and approved placement |
| Core content complete | Optional tone and visual direction |

### Conversation behavior

- Keep one semantic question per turn.
- Parse all voluntarily supplied facts, including answers to future questions.
- Never ask for already confirmed or explicitly omitted information again.
- Support `Lewati`, `Belum tahu`, and `Tidak berlaku` where valid.
- Keep user-facing copy in plain Indonesian and mirror the user's register.
- The user may explicitly end discovery with language such as `cukup` or `langsung build`.
- Early exit does not fabricate readiness. It records visible omissions and permits a plan only if the remaining uncertainty does not make facts, topology, or CTA unsafe.

### Deterministic readiness

The server, not model confidence, authorizes planning and the build recommendation.

A contract is `ready_for_plan` when:

1. A concrete business name exists.
2. At least one concrete offer exists.
3. A primary visitor job exists.
4. A primary CTA intent exists.
5. Any CTA that requires a destination references a valid confirmed contract fact.
6. No conflict remains among confirmed contract facts.
7. Every applicable registry decision with `blocksReadiness: true` is `answered`, `skipped_safe`, `unknown_safe`, or `not_applicable` according to its registry policy.

The model may recommend the next registered question and may report advisory concerns. It cannot create a new blocking category at runtime.

Model confidence remains optional telemetry and must not be promoted to 95 to force UI behavior.

### Plan preparation lifecycle

V1 uses the existing configured build model through `getGenerationModel()` for a dedicated constrained plan call. It does not add another model setting.

Plan preparation runs before `build_recommendation`:

1. A discuss turn commits the normalized contract draft and registered decision states.
2. If the contract is not `ready_for_plan`, the normal next-question card is persisted.
3. If ready, the worker computes the canonical contract draft hash and emits progress `Menyusun rencana halaman`.
4. The worker calls the structured plan tool once, with one bounded retry on invalid output or transient provider failure: two total model attempts.
5. The parser normalizes and validates the plan against the exact contract hash.
6. Persistence uses compare-and-swap on project id, generation engine, and current contract draft hash. A result for a superseded contract is discarded and never shown.
7. A unique draft `ProjectBuildHandoff` is created or reused for the contract/plan revision pair. Equal semantic hashes at later revisions do not alias historical handoffs.
8. Only then does the turn persist a `build_recommendation` containing that handoff id.

The current post-click implementation-spec generation is removed from the contract-v1 worker. Contract-v1 source generation consumes only the accepted handoff plan. Legacy-v1 behavior remains unchanged.

Plan calls are charged and logged as a distinct `plan` AI step exactly once per new contract hash. Reusing a cached valid plan does not call the model or charge again. Insufficient energy leaves the contract intact, emits an explicit recoverable planning error, and does not show a build card.

If both plan attempts fail, the discuss turn ends in a recoverable planning failure with Indonesian guidance to retry. It does not synthesize a one-page fallback. Retrying runs only the plan stage against the unchanged contract hash.

### Build recommendation card

The existing `build_recommendation` card remains the only pre-build start path. Its v1 payload adds an opaque `handoffId`, the persisted `reviewHash`, and bounded `reviewItems`. It displays:

```ts
type ContractBuildRecommendationCard = {
  type: "build_recommendation";
  handoffId: string;
  reviewHash: string;
  title: string;
  summary: string[];
  reviewItems: Array<{
    id: string;
    kind: "fact" | "ai_draft" | "cta" | "omission" | "page" | "asset";
    label: string;
    value: string;
  }>;
};
```

- Confirmed business and offer.
- Primary visitor job and CTA.
- Every high-risk exact fact and CTA destination used by the plan.
- Every new or changed AI-drafted value verbatim.
- Every omission/assumption attached to a readiness-relevant decision.
- Every planned page path, title, and purpose.
- Assets that will be used.
- The existing `Mulai build` action.

The server derives the complete review set as the stable-id union of every plan-used high-risk fact and CTA target, every plan-used AI draft, every readiness-relevant omission, every planned page, and every used asset. It deduplicates, sorts by `kind` then id, persists the exact normalized items and their canonical `reviewHash` on the handoff, and renders that persisted list without truncation. If the complete set exceeds either review bound, plan validation fails and must reduce scope or return an explicit planning error; hidden overflow is forbidden.

Only AI-draft values rendered exactly in persisted `reviewItems` are approved by accepting that handoff. Hidden summaries never imply approval. Acceptance does not mutate fact provenance or hashes; approval is derived from the accepted handoff and review-item identity. Owner facts retain their original provenance; the card confirms use rather than rewriting history.

Clicking `Mulai build` sends the displayed `handoffId` and `reviewHash` and atomically accepts that immutable contract/plan pair before enqueueing generation. A matching accepted handoff remains valid for explicit retry. If the handoff is stale, superseded, cancelled, has a different review hash, or belongs to a different project/user, the server rejects it and asks the client to refresh the card.

## Page Planning And Information Architecture

Page count follows visitor jobs and content structure, not business labels or SEO folklore.

### Hard split triggers

A distinct route type is normally required for:

- Repeatable products, menu entries, properties, classes, portfolio entries, or articles that need browsing and detail.
- Multi-step booking, order, quote, application, or payment-intent flows.
- Multiple locations with different hours, services, or contacts.
- Durable policy/legal destinations.
- Frequently updated collections whose entries need direct links.

### Soft split signals

A visitor-job cluster becomes a separate page when at least two apply:

- It has a different primary CTA.
- It has likely direct-entry/search/share value.
- It needs substantial unique decision content.
- It serves a different audience or vocabulary.
- It has an independent owner or update cadence.
- A unique page title and stable URL materially improve findability.

Keep content together when it serves the same audience, CTA, and decision sequence, or when simultaneous comparison is the user job.

Do not automatically create About and Contact pages when concise home sections satisfy those jobs.

Archetype docs remain advisory evidence. They do not override accepted facts or the plan validator.

## Topology Compiler And Ownership

### Platform-owned source

The platform compiler writes and protects:

- `src/main.tsx`
- `src/router.tsx`
- `src/routes/__root.tsx`
- `src/routes/not-found.tsx`
- `src/lib/preview-ready.ts`
- `src/content/contract.ts`
- `generated-app.manifest.json`
- `components.json`
- `package.json`
- `vite.config.ts`
- `src/index.css`
- Canonical shadcn registry files copied through `copy_component`

The compiler creates route stubs for every plan page before source generation. The router, manifest, route stubs, and navigation metadata are generated from the same accepted plan.

The root route mounts exactly one AI-editable `SiteShell` component around `<Outlet />`. The builder may design that component's header/footer/floating actions, but cannot mount another root shell or change the root route.

### AI-editable source

The builder may write only paths derived from the accepted plan:

- `src/generated/site-shell.tsx`
- `src/generated/theme.css`
- `src/generated/pages/<planned-page>.tsx`
- `src/generated/components/**`
- Approved business content modules under `src/generated/content/**`

The exact allow-list is produced by the topology compiler. It is not a broad `src/**` rule.

The builder can request canonical shadcn components through `copy_component`, but cannot modify their source.

Protected `src/index.css` imports `src/generated/theme.css` last. The generated theme file may contain only validated `:root` design-token and font-family custom-property overrides. It may not contain arbitrary selectors, `@font-face`, `@import`, or `url()` values. The compiler owns any verified platform-font-registry declaration. Layout styling remains inline Tailwind composition in TSX, consistent with the locked generated-app design system.

### Creative ownership

The AI builder retains control of:

- DOM composition inside generated page bodies.
- Section order within plan requirements.
- Responsive Tailwind composition.
- Typography, spacing, color application, hierarchy, and motion.
- Business-specific visual metaphors and art direction.
- Indonesian customer-facing copy phrasing.
- Static interactions declared in plan capabilities.

The platform does not introduce a full component DSL. `surfaceIntent` is a small testable layout intention, not a renderer schema.

### Portability

Compiled generated source remains a conventional standalone Vite/React/TanStack project. Platform ownership during generation does not introduce a runtime dependency on UMKM Cepat.

The compiler also emits portable, protected `PRODUCT.md`, `DESIGN.md`, and `AGENTS.md` files derived from the accepted contract, plan, and locked generated-app rules. They contain no platform secrets or private operational metadata. The builder may read but not edit them.

## Content And Claim Safety

Exact business claims must be traceable to accepted facts.

Blocking claim categories:

- Phone/WhatsApp/contact destinations.
- Prices, discounts, and stock.
- Addresses, service areas, and hours.
- Capacity, quantities, speeds, and delivery guarantees.
- Certifications, licenses, awards, and years of operation.
- Testimonials, ratings, and named customers.
- Health, safety, legal, financial, or performance guarantees.

The generated content module exposes accepted facts by stable fact id. `ContractFact`, `ContractAction`, and `MediaAsset` primitives resolve exact values from that module and add stable `data-contract-fact-id` evidence to rendered output.

AI-owned source may not contain high-risk literals outside the protected contract module. A versioned matcher scans parsed JSX text, string/template literals, and URL-bearing attributes in every AI-editable file; comments and import paths are excluded. The browser matcher scans visible text and actionable destinations. Both use the same normalization and seeded fixture corpus:

| Category | Blocking normalized grammar |
|---|---|
| Contact | `tel:`, `sms:`, WhatsApp hosts/schemes, email addresses, or digit sequences normalizing to 8-15 phone digits |
| Price/promotion | `Rp`, `IDR`, `rupiah`, `%`, or discount words adjacent to a numeric amount |
| Hours | Day/day-range or open/closed terms adjacent to a clock or time range |
| Address/service area | Postal codes or address markers such as `jalan`, `jl`, `no`, `rt`, `rw`, district/city labels followed by location content |
| Quantity/performance | Numeric values adjacent to stock, capacity, duration, speed, delivery, guarantee, or measurable-result units |
| Proof | Rating/star scores, testimonial attribution, named-customer proof, certification/license/award identifiers, or years-in-operation claims |
| Regulated claim | Health, safety, legal, financial, or guaranteed-outcome lexicon from the versioned Indonesian matcher |

Static validation blocks a grammar match unless it is an id/key used to call `ContractFact`, `ContractAction`, or `MediaAsset`; those primitives resolve values only from protected `src/content/contract.ts`. Rendered validation requires each matched high-risk value or destination to be inside a `data-contract-fact-id` marker and to equal the normalized accepted fact. Matcher changes require positive, negative, boundary, Indonesian-variant, JSX-expression, and rendered-DOM fixtures. Unknown matcher output fails closed for CTA destinations and remains a reported human-audit item for qualitative prose.

Fact retention means every fact referenced by the plan renders correctly where required. Accepted facts that the plan deliberately does not reference do not have to appear on the site.

Qualitative marketing language that does not introduce a measurable claim is evaluated by the visual/content critic and human review, not treated as a deterministic fact.

The zero unsupported-claim threshold is an empirical benchmark/release requirement, not a claim that finite pattern matching can prove all natural-language truth. Seeded paraphrase cases and human review measure the residual gap.

The prompt conflict between "do not invent" and "invent proof points" is removed. The builder may invent composition and phrasing, never empirical business evidence.

## Generated Media

- The accepted contract carries the complete approved asset inventory into planning and generation.
- The build plan identifies required asset usage by asset id.
- The generated app references `/media/<assetId>`, never raw storage URLs.
- A required image-led section cannot pass with a missing/broken asset.
- Contract-v1 does not fetch or hotlink remote imagery. A future media-import service requires a separate security/licensing design and stores successful imports as ordinary owner-scoped `ProjectAsset` rows.
- If no approved image exists, the plan explicitly chooses a graphic or typographic strategy rather than pretending an image was supplied.

## Conformance Pipeline

The pipeline is versioned. Every candidate records the gate-report version and per-stage evidence.

### Stage order

```text
contract validation
  -> plan validation
  -> source ownership/policy
  -> fact/claim conformance
  -> TypeScript/Vite build
  -> actual-preview browser crawl
  -> structure/layout/accessibility checks
  -> screenshots and evidence
  -> optional visual critic
```

Cheap failures stop expensive stages.

### Contract gates

- Accepted status, revision, and canonical hash match the build request.
- Plan contract hash matches.
- CTA targets resolve.
- Required fact/asset references resolve.
- No unresolved conflict/blocker remains.

### Plan/topology gates

- Exactly one `/` root.
- Unique canonical paths.
- Safe dynamic paths and representative test paths.
- Every primary visitor job is covered.
- Compiled manifest routes equal plan routes.
- Compiled router routes equal plan routes plus the platform 404 route.
- Every planned route has exactly one generated page owner.

### Source/build gates

- Agent writes only allow-listed files.
- Protected files exactly match compiler output.
- Dependency and resource policies pass.
- Preview-ready bridge remains mounted.
- High-risk claim conformance passes.
- TypeScript and Vite succeed in the isolated build workspace.

### Browser gates

Run against the same preview routing base, origin behavior, CSP, asset path, and hash history the user receives. A bare artifact server is not sufficient evidence.

Static plan paths use `/segment` grammar. Dynamic patterns use TanStack `$param` segments, for example `/produk/$id`; each required parameter has one normalized representative value from accepted contract content. Plan/router/manifest parity compares route patterns, while browser navigation uses concrete representative paths.

For `/` and each planned representative route, test at 360px mobile and 1440px desktop:

- Expected route renders and does not show not-found content.
- No console error or uncaught page error.
- No broken internal links.
- Primary CTA exists, is visible, and resolves to the accepted target.
- Required media loads.
- No document-level horizontal overflow.
- Exactly one generated site shell is mounted.
- Landmark hierarchy is valid for the compiled shell/page boundary.
- Page title and primary heading are present.
- Navigation is keyboard reachable.
- Automated axe scan has no serious/critical A/AA findings.

Test one guaranteed-unknown path separately at both viewports:

- It renders the intended not-found state.
- It includes a keyboard-reachable safe link to `/`.
- It has no console/page error or horizontal overflow.
- Business CTA and required-media assertions do not apply.

Browser execution is bounded to six planned route patterns, two viewports, two concurrent page contexts, a 10-second per-navigation timeout, and one infrastructure-only retry. The browser-overhead metric starts after a healthy built candidate is available and ends when all browser reports/screenshots are persisted; queue and Vite time are excluded.

Browser results are one of `pass`, `fail`, or `infrastructure_error`. Timeout, launch failure, malformed output, or inaccessible preview is never treated as zero issues.

### Layout intent gates

Layout gates use DOM geometry plus the plan's `surfaceIntent`:

- `full_bleed`: the section surface reaches viewport edges; inner content may remain constrained.
- `contained`: the section surface is intentionally bounded and aligned to the page grid.
- `prose`: readable line length is intentionally narrow.

There is no universal maximum-width or full-width requirement. The Sate example must not be rejected merely because full-bleed background contains a `max-w-6xl` content column.

## Visual Critic

### Role

The critic evaluates residual rendered quality after all hard gates pass. It is an evaluator, not an autonomous agent.

Inputs:

- Accepted contract and build plan.
- Desktop/mobile screenshots for every page.
- DOM landmarks, bounding boxes, computed contrast/overflow evidence, and route metadata.
- Hard-gate report.
- Applicable `DESIGN.md`, design-quality, anti-slop, and archetype guidance.

Output:

```ts
type VisualFinding = {
  category:
    | "hierarchy"
    | "business_fit"
    | "layout_intent"
    | "responsive"
    | "typography"
    | "color_contrast"
    | "imagery"
    | "consistency"
    | "genericness"
    | "content_density";
  severity: "critical" | "high" | "medium" | "low";
  route: string;
  viewport: "mobile" | "desktop";
  evidence: string;
  contractOrPlanReference?: string;
  proposedCorrection: string;
  confidence: number;
};
```

Rules:

- The critic has no tools and no write access.
- It may return `unknown` when screenshots/evidence are insufficient.
- It cannot change contracts, plans, tests, baselines, thresholds, or publication state.
- It cannot override a hard-gate failure or pass.
- Subjective findings remain advisory until calibrated.
- Critic model identity is recorded; use a different model family from the builder when practical.

### Shadow mode and calibration

The critic initially records findings without blocking or repairing.

Human reviewers label findings from a stratified benchmark. Using the sample sizes, adjudication, and confidence rules in Evaluation Program, a category may trigger automatic repair only after it reaches:

- At least 90% precision against human labels.
- At least 70% recall on deliberately seeded defects.
- Zero observed P0 hard-gate regressions from its suggested repairs.

Likely early repairable categories are clipping, overlap, unreadable contrast, obscured CTA, duplicate visual shell, and clear responsive failure. "Generic" or "not premium" remains advisory until evidence supports a reliable intervention.

## Repair And Candidate Immutability

One candidate is one immutable `ProjectSnapshot` source state. Build retries, browser infrastructure retries, and critic reruns against unchanged source evaluate the same candidate and do not create snapshots. Every source mutation creates a child snapshot through the existing `parentSnapshotId` relation. One qualification run begins with each explicit user-triggered generation/edit/retry attempt; the root attempt id is persisted on every automatic child and gate report in that run.

- Generation creates candidate A.
- A compile repair creates child candidate B; A remains inspectable.
- A second existing compile repair, if needed, creates child candidate C.
- A deterministic browser-conformance repair may create at most one child across the lineage.
- Shadow mode permits zero visual repairs. Active calibrated mode may create at most one visual-repair child across the lineage.
- Every child receives the complete accepted contract, plan, gate evidence, and targeted diagnostics.
- Every child reruns contract, plan, source, claim, build, and browser gates.
- A failed child never replaces the project's last-known-good snapshot/deployment.

Budgets never reset between repair categories within one qualification run. One run allows at most:

| Mutation | Maximum |
|---|---:|
| Initial candidate | 1 |
| Compile-repair children | 2 |
| Browser-conformance repair children | 1 |
| Visual-repair children | 0 in shadow mode; 1 after activation |
| Total source candidates | 5 |

A visual/browser-repair child that fails compilation may consume any remaining compile-repair budget, but it does not receive a fresh budget. Infrastructure-only retries are limited by their stage policy and never mutate source. An explicit charged user retry starts a new qualification run and a fresh bounded automatic-repair budget against the same accepted handoff; it does not mutate or hide candidates from earlier runs.

Repair agents cannot edit evaluator code, fixtures, thresholds, contract/plan records, or protected source.

Improvement stall, regression, energy exhaustion, superseded lease, or repair-budget exhaustion stops automatic work and returns explicit retry/review state.

## Edit Semantics

### Non-structural edit

Copy, style, spacing, media placement, and component changes reuse the accepted contract and plan. The edit agent receives their hashes and writes only AI-owned paths. The resulting child candidate runs the complete conformance pipeline.

### Structural edit

Requests such as add/remove/rename a page, add a catalog detail route, or change the primary conversion path must revise the contract and/or build plan first.

The server:

1. Classifies the request as structural.
2. Produces a new contract/plan draft as required.
3. Shows the changed plan for owner acceptance.
4. Recompiles protected topology.
5. Runs the builder against the new allow-list.

The edit agent never changes topology opportunistically.

### Snapshot restore

Operation dispatch is always based on sticky `Project.generationEngine`.

- `legacy-v1` edits, retries, and restores retain their current behavior and path policy.
- `contract-v1` may restore a snapshot directly only when its recorded contract and plan hashes equal `Project.activeHandoffId`'s handoff.
- A same-plan restore creates a child candidate and reruns all contract-v1 gates before selection/deployment.
- A snapshot with absent or different hashes cannot become active directly. Restoring it is a structural change that requires a new reviewed handoff and topology recompilation.
- Restore failure preserves the current last-known-good deployment.

## Failure Handling

| Failure | Behavior |
|---|---|
| Contract invalid/conflicted | Keep discussing; show the highest-value blocking question |
| Plan invalid after bounded retries | Persist recoverable planning failure; do not silently use one-page fallback |
| Stale card acceptance | Reject with conflict response; refresh the latest contract/plan card |
| Source ownership violation | Reject candidate before build; send exact protected path diagnostic |
| Claim mismatch | Reject candidate; identify unsupported claim and required fact id |
| Vite failure | Existing bounded compile repair creates immutable child candidates |
| Browser infrastructure error | Candidate remains unqualified; retry browser stage without regenerating source when safe |
| Browser conformance failure | At most one qualification-run-wide targeted repair for a deterministic repairable category; otherwise explicit retry/review |
| Visual critic unavailable | Hard-gate-passing candidate remains previewable; critic state is `unavailable`, never fabricated pass |
| Visual critic finding in shadow mode | Persist advisory finding; do not block or auto-repair |
| Edit failure | Preserve last-known-good source and deployment; expose explicit retry |

## Compatibility And Rollout Safety

### Existing projects

- Existing snapshots and deployments remain readable and runnable.
- Existing projects receive sticky `generationEngine = legacy-v1` and continue their current build, edit, retry, restore, and preview behavior.
- No existing project is automatically rebuilt or migrated.
- Legacy-to-contract migration is out of scope for v1. It requires a later owner-reviewed migration design; null fields or current rollout settings never migrate a project implicitly.

### Feature flag

Use a DB-first admin setting, not a new environment variable:

```text
generation.contract_compiled_rollout = off | internal | pilot | all
generation.contract_admission = paused | enabled
```

Two independent knobs: `rollout` controls **assignment** at project creation only; `contract_admission` controls **execution admission** (whether any contract-v1 attempt may be enqueued or mutated by a worker). Admission defaults to `paused`; no contract attempt runs until an operator flips it to `enabled`.

The rollout setting controls engine assignment only when creating a project:

| Value | New-project assignment |
|---|---|
| `off` | `legacy-v1` |
| `internal` | `isAdminEmail(owner.email)` at project creation -> `contract-v1`; everyone else -> `legacy-v1` |
| `pilot` | `isWaitlistApproved(owner.email) === true` at project creation -> `contract-v1`; everyone else -> `legacy-v1` |
| `all` | `contract-v1` |

The assignment resolver reads one settings snapshot and one normalized owner identity inside project creation, evaluates the predicates above, and persists the result on `Project`. It never treats a disabled waitlist gate, development bypass, admin role, or missing waitlist row as pilot approval. The assigned engine is never recomputed from the current setting, user role, or presence of a handoff row.

Rollout:

1. `off` by default while baseline and tests are built; `contract_admission` stays `paused`.
2. `internal` for admin-owned test projects (flip admission to `enabled` before assignment).
3. `pilot` for the existing approved pilot-whitelist cohort.
4. `all` for new projects after exit metrics pass.
5. Keep legacy execution available only for sticky legacy projects; contract projects never silently fall back to weaker legacy generation.

Changing rollout to `off` stops new assignment only. Existing contract projects, accepted handoffs, in-flight attempts, retries, edits, and restores continue under contract-v1 so their guarantees do not change mid-project.

There is no admin emergency-stop route in the codebase today; the only stop paths are owner-scoped `/api/projects/$id/cancel` (aborts in-memory jobs + clears the lease) and `/api/projects/$id/stop` (runtime deployment). Emergency rollback therefore uses two levers:
1. Set `generation.contract_admission = paused` — the admission guard rejects new contract-v1 attempt enqueue and any worker source mutation immediately.
2. Cancel/expire in-flight operation leases via the existing owner cancel route or lease expiry (15-minute TTL, reaped to `failed`).

In-flight jobs already past the admission check finish or fail-clean through the existing reaper path; they never change the selected last-known-good deployment. Operators never rewrite a contract project to `legacy-v1`, select a failed candidate, or delete contracts/plans as rollback. Resuming admission uses the same sticky engine and accepted handoff.

### Database migration safety

- Migration adds the handoff table, nullable attempt relation, and non-null engine column with the safe `legacy-v1` default.
- No destructive column changes or data rewrites.
- Existing rows and code paths resolve explicitly to legacy-v1.
- Deploy migration before enabling the setting.

## Security Boundary

This design does not weaken existing production restrictions.

- Generated source, user text, and uploaded assets are untrusted data.
- Build workers receive no application secrets, database credentials, Docker socket, writable shared dependency tree, or unrestricted network access.
- Generated previews/published apps must move to a separate origin before production execution is enabled.
- Control-plane cookies/credentials are never sent to the generated origin.
- Browser validation uses an isolated ephemeral context without an authenticated control-plane session when separate-origin preview is available.
- `postMessage` traffic validates source, origin, and a per-preview nonce.
- Publishing remains an explicit human action.

The isolated-worker and separate-origin implementation is tracked by the existing production-hardening work and remains a release prerequisite, not duplicated in this program.

### Private screenshot evidence

- Gate screenshots are private project artifacts, not telemetry and not public URLs.
- Store them under an owner/project/candidate-scoped S3/R2 prefix with the same owner/admin authorization boundary as source artifacts.
- Logs and analytics contain only artifact ids, dimensions, checksums, counts, and result summaries.
- Project deletion removes screenshot evidence through project cleanup.
- Non-selected candidate gate screenshots expire after 30 days. A selected screenshot may be separately derived into the existing project thumbnail; gate evidence still expires after 30 days.
- The critic is disabled unless its configured provider is approved for unpublished owner content and the data-handling policy is documented. Without that approval, screenshots remain available only for authorized human review.

## Observability

Persist per candidate:

- Contract/plan schema versions, revisions, and hashes.
- Planner source/model, attempts, latency, and tokens.
- Planned/compiled/manifest/rendered route sets.
- Source generation model, operations, touched files, latency, and tokens.
- Claim-gate results.
- Build and compile-repair attempts.
- Browser routes, viewports, timing, console/page errors, overflow, links, landmarks, axe summary, and screenshots.
- Critic model, findings, confidence, shadow/active mode, and repair decision.
- Parent candidate, selected candidate, and last-known-good preservation.
- User-visible outcome: accepted, edited, rebuilt, abandoned, published.

Production telemetry must avoid secrets and full private user content. Record ids, counts, categories, booleans, timings, and sanitized failure classes.

## Evaluation Program

### Dataset

- 30 visible regression cases for development.
- At least 60 hidden holdout briefs unavailable to builder prompts/workspaces.
- Two independent generation trials per hidden brief.
- Stratify by archetype, one/multi-page need, offer complexity, digital literacy, language style, asset availability, and CTA type.
- Include the four investigated projects as visible regression cases.
- Include positive and negative topology cases so "always one page" and "always multi-page" both fail.
- Rotate names, contacts, prices, paths, and asset ids to resist special-casing.

### Intent ground truth

For user validation, a separate researcher creates an owner-confirmed weighted intent inventory before showing generated output. The generating model never receives this hidden inventory.

```text
weighted intent coverage =
  sum(intent importance * match score) / sum(intent importance)
```

Importance: critical 3, important 2, optional 1.
Match: correct 1, materially partial 0.5, absent/wrong 0.

Track separately:

- Critical-intent recall.
- Intent precision.
- Unsupported assertion rate.
- Structural acceptance.
- Revision effort and time to publishable.
- Interview completion and duration.
- Top-task success/directness.
- Readiness calibration.

### Initial go/no-go thresholds

Phase 0 freezes a baseline id, corpus version, evaluator version, and rubric before treatment runs. Missing reports or a repeated `infrastructure_error` after the single allowed infrastructure retry count as operational trial failures; they are also reported separately from model-quality failures so infrastructure cannot be hidden or blamed on the model.

Metric definitions:

| Metric | Unit and scoring |
|---|---|
| Accepted fact retention | Percentage of plan-required accepted fact ids rendered with the same normalized value and intended role; every holdout fact is checked |
| Unsupported high-risk claims | Count of rendered high-risk claims without a matching marked accepted fact, measured by automated grammar plus two-reviewer audit |
| Plan/compiler/router/manifest parity | Exact set equality over normalized route patterns, including dynamic patterns but excluding the platform 404 from plan pages |
| First-pass hard-gate success | Percentage of initial candidates passing every blocking gate without source mutation |
| Success after compile repairs | Percentage of trials passing every blocking gate within the lineage compile-repair budget |
| Two-trial consistency | Percentage of hidden briefs for which both independent trials pass every blocking gate (`pass^2`) |
| Weighted intent coverage | Owner-confirmed hidden intent inventory scored by two independent reviewers; disagreements are adjudicated before aggregation |
| Structural acceptance | Owner accepts page set, section purposes, hierarchy, and primary CTA without structural edit |
| Blind visual preference | At least three blinded Indonesian reviewers per pair, randomized order, majority result; 95% bootstrap interval resampled by brief with 10,000 samples |
| Clearly worse output | Majority marks treatment materially worse than baseline, not merely different |
| Browser overhead | Healthy built candidate to persisted browser report, excluding queue and Vite time |
| Model cost | Metered planner, builder, and active critic/repair tokens priced through the existing credit proof; cached plan reuse is zero new model cost |

Every percentage names its denominator in the frozen evaluator manifest. Trial metrics use all scheduled hidden-corpus trials, including terminal operational failures; brief-level metrics aggregate the two trials per brief and fail the brief unless both required reports exist. Owner-review metrics use only completed blinded review sessions and report completion/abandonment separately. No failed, missing, timed-out, or infrastructure-error result may be removed from a release denominator after the run starts.

Critic calibration is per category, with at least 50 human-labeled findings and at least 30 deliberately seeded positive defects. Two reviewers label independently and a third adjudicates disagreements. Automatic repair requires point precision >= 0.90 with Wilson 95% lower bound >= 0.80, point recall >= 0.70, and no P0 regression in calibration.

P0 means secret/cross-project exposure, origin escape, wrong or unsafe CTA destination, unsupported high-risk claim, root/primary route unreachable, last-known-good loss, or publication without owner action.

| Metric | Threshold |
|---|---:|
| Accepted fact retention | 100% |
| Unsupported high-risk claims | 0 |
| Correct primary CTA target | 100% |
| Plan/compiler/router/manifest parity | 100% |
| Planned route reachability | 100% |
| Broken internal links | 0 |
| Runtime/page errors | 0 |
| Duplicate generated site shell | 0 |
| Serious/critical automated axe findings | 0 |
| Document overflow at 360px and 1440px | 0 |
| First-pass hard-gate success | At least 85% |
| Success after existing compile repairs | At least 96% |
| Two-trial consistency | At least 90% |
| Completed owner reviews with weighted intent coverage >= 0.90 | At least 80% |
| Critical-intent recall | At least 98%, with zero high-risk contradictions |
| First-build structural acceptance | At least 85% |
| Interview duration | Median <= 3 minutes; P90 <= 6 minutes |
| Interview completion regression | No worse than 3 percentage points versus sparse-flow control |
| Blind visual preference versus baseline | At least 60%, lower confidence bound above 50% |
| Clearly worse visual output | At most 20% |
| Critic precision before automatic repair | At least 90% |
| Critic recall on seeded defects | At least 70% |
| Browser-gate P95 overhead | At most 30 seconds |
| No-repair model cost | Median at most 1.25x baseline |
| Last-known-good preservation | 100% |

Any secret exposure, cross-project access, origin escape, wrong CTA, unsupported high-risk claim, or publication without owner action is an immediate no-go regardless of aggregate scores.

If latency/cost misses, disable the visual critic before weakening deterministic correctness gates.

## Phased Delivery

### Phase 0 - Baseline and evaluator

Build the visible/hidden corpus, mutation fixtures, human rubric, and baseline reports before changing generation behavior.

### Phase 1 - Contract and readiness

Add additive persistence, contract parsing/validation/hashing, question protocol, complete rich-field projection, deterministic readiness, plan preparation, and atomic acceptance. Remove silent semantic fallback for the new path.

### Phase 2 - Topology compiler and ownership

Compile/protect root/router/manifest/content/route stubs, narrow agent writes, and prove exact plan-topology parity.

### Phase 3 - Candidate conformance

Create immutable candidate lineage, unify all mutation paths behind source/claim/build/browser gates, and persist evidence/screenshots.

### Phase 4 - Critic shadow mode

Run the checklist-guided critic without blocking or repairing. Calibrate each finding category against blinded human labels.

### Phase 5 - Scoped visual repair

Enable at most one repair only for calibrated categories. Rerun all hard gates and preserve parent candidates.

### Phase 6 - Pilot canary

Enable the DB setting for internal projects, then the existing approved pilot-whitelist cohort. Expand only after the quantitative exit criteria pass.

## Risks And Mitigations

| Risk | Mitigation |
|---|---|
| Contract schema becomes another sprawling brief | Separate business contract from implementation plan; version both; keep only output-changing data |
| Deterministic topology makes sites feel templated | Constrain route/shell mounting only; AI retains page composition and visual language |
| Surface-intent checks reject valid narrow content | Validate declared surface versus inner content separately; no universal width rule |
| Longer discovery increases abandonment | Ask one relevant question at a time, support skip/unknown, cap adaptive turns initially, measure completion and total time-to-publishable |
| Planner adds latency before build card | Cache by contract hash, bound retries, measure separately, never regenerate unchanged plans |
| Claim validation produces false positives | Require typed fact/action primitives and a documented raw-literal grammar; keep qualitative findings advisory |
| Browser checks become flaky | Pin browser/environment/data/time/motion; use pass/fail/infrastructure_error; retry stage rather than source generation |
| Visual critic homogenizes design | Contract-specific checklist, critic shadow mode, human calibration, no baseline authority, track cross-project similarity as advisory |
| Critic shares builder bias | Use a different model family when practical, blind model identity in benchmark, randomize pairwise order |
| Repair fixes one issue and breaks another | Immutable child candidate plus complete gate rerun; last-known-good never replaced by failure |
| Legacy projects break | Sticky `legacy-v1` assignment, additive handoff table, no contract backfill/rebuild, legacy operations remain on legacy policy |
| Program scope becomes a big-bang rewrite | Phase gates, focused commits, TDD, and independently reversible rollout |

## Rejected Alternatives

### Prompt hardening only

Prompt cleanup is required but cannot enforce cross-file routing, ownership, runtime behavior, fact provenance, or release qualification. Current contradictory prompts demonstrate the ceiling.

### Full visual AST or template renderer

This would make topology enforceable but unnecessarily constrain visual composition, introduce a renderer/schema migration product, and recreate template sameness. The current need is invariant ownership, not a no-code renderer.

### Default multi-agent planner-builder-critic

Coding and visual repair share tightly coupled state. A swarm adds serial latency, tokens, handoff loss, tracing complexity, and correlated model errors. Use a predefined workflow with one bounded planner stage, one builder, deterministic evaluators, and an optional read-only critic.

### Force every site to be multi-page

One-page Warnet and Sate experiences can be correct. Separate pages are justified by visitor jobs/content structure, not perceived sophistication.

### Require every section to be full-width

Full-bleed surfaces often contain constrained content, and readable prose should remain narrow. Layout intent must be explicit and rendered, not inferred from one class name.

### Make the critic the release gate immediately

Model judges have position, verbosity, self-preference, and style bias. The critic must earn authority per category through human calibration.

## Research Basis

| Source | Design implication |
|---|---|
| [Anthropic: Building Effective Agents](https://www.anthropic.com/research/building-effective-agents) | Prefer simple workflows and programmatic gates; add evaluator loops only when criteria are measurable |
| [OpenAI: Structured Outputs](https://openai.com/index/introducing-structured-outputs-in-the-api/) | Schema adherence can guarantee shape, not semantic correctness of values |
| [WebGen-Bench](https://arxiv.org/abs/2505.03733) | Render/build success is insufficient; executable browser operations expose major functionality gaps |
| [Design2Code](https://arxiv.org/abs/2403.03163) | Frontend models particularly struggle with visual-element recall and layout correctness |
| [ArtifactsBench](https://arxiv.org/abs/2507.04952) | Temporal screenshots plus checklist-guided multimodal evaluation can approximate human preference at scale |
| [Vision-Guided Iterative Refinement](https://arxiv.org/abs/2604.05839) | Visual critique can improve frontend output, but evidence is recent and does not justify uncalibrated release authority |
| [Judging LLM-as-a-Judge](https://arxiv.org/abs/2306.05685) | Judges have position, verbosity, and self-enhancement biases |
| [LLMs Cannot Self-Correct Reasoning Yet](https://arxiv.org/abs/2310.01798) | Intrinsic self-correction without external evidence can degrade performance |
| [GOV.UK: Structuring forms](https://www.gov.uk/service-manual/design/form-structure) | Use a question protocol, branching, and one decision per step |
| [GOV.UK: Question pages](https://design-system.service.gov.uk/patterns/question-pages/) | Ask only necessary questions, support unknown/optional answers, and avoid unreliable progress totals |
| [NN/g: Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/) | Put common essentials first and disclose specialized questions only when relevant |
| [Google conversation design](https://developers.google.com/assistant/conversation-design/learn-about-conversation) | Accept volunteered information, preserve context, stay relevant, and ask one question per turn |
| [Playwright: Visual comparisons](https://playwright.dev/docs/test-snapshots) | Screenshot evidence requires a pinned and consistent rendering environment |
| [Playwright: Accessibility testing](https://playwright.dev/docs/accessibility-testing) | Automated axe checks catch common defects but require manual/inclusive testing alongside them |
| [W3C: Selecting accessibility tools](https://www.w3.org/WAI/test-evaluate/tools/selecting/) | Automated tools assist evaluation and can produce misleading results; they cannot determine accessibility alone |
| [Google SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide) | Use logical organization and useful distinct URLs; no magical content/page-count target exists |
| [WCAG 2.4.5 Multiple Ways](https://www.w3.org/WAI/WCAG22/Understanding/multiple-ways.html) | Multi-page sites create navigation and orientation obligations |

## Canonical File Areas

Implementation is expected to affect these areas, with exact edits defined by the implementation plan:

- `prisma/schema.prisma` and one additive migration.
- New contract/plan modules under `src/lib/projects/`.
- `src/lib/projects/brief.ts`, `brief-flow.ts`, `discuss-tool.ts`, and discuss prompts/workers.
- `src/lib/projects/implementation-spec.ts` or its replacement adapter.
- `src/lib/projects/build-attempt-worker.ts`.
- `src/lib/projects/custom-source-generator.ts` and `agent-tool-runner.ts`.
- Generated scaffold, manifest, build policy, snapshot metadata, and edit workers.
- Browser capture/verification modules and tests.
- Workspace build-recommendation summary and stale-acceptance handling.
- Admin setting definitions for the rollout flag.
- `PRODUCT.md`, `DESIGN.md`, and `DEV.md` where canonical behavior changes.

## Locked Decisions

- Contract-compiled workflow is the target architecture.
- Existing `Mulai build` remains the only pre-build start action.
- Contract and page plan are visible and accepted together.
- V1 plan preparation uses the existing configured build model, one primary attempt plus one retry, before the build card.
- An immutable handoff row is the worker source of truth.
- Generation engine assignment is sticky per project.
- Model confidence is not readiness authority.
- Platform compiles and owns topology.
- One builder owns creative generated source.
- No silent one-page fallback in the new path.
- Existing compile repair remains bounded; visual repair starts disabled.
- Visual critic starts read-only in shadow mode.
- Legacy projects are not rebuilt/backfilled.
- New rollout is DB-feature-flagged and canaried.
- Last-known-good artifacts survive every failed candidate.

## Deferred Decisions

These require benchmark evidence and are deliberately not needed to begin:

- Whether any subjective critic category may eventually block release.
- Whether more than one visual candidate should ever be generated.
- Whether a visual AST is justified for a future structured editor.
- Whether the existing compile-repair limit should change after immutable candidates and conformance metrics are available.
