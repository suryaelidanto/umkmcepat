# Canonical Brief and Build Readiness — Design

**Date:** 2026-08-13
**Status:** Draft for written review
**Scope:** Discussion readiness, build recommendation, handoff acceptance, and first-generation build inputs
**Supersedes:** The brief/readiness assumptions in older generation specs where they conflict with this design
**Preserves:** Contract-compiled single-shot generation, bounded qualification, and immutable handoff hashes

## Summary

UMKM Cepat will replace overlapping brief fields and competing readiness checks with one canonical `ProjectBriefV2`, one deterministic `evaluateBuildReadiness()` preflight, and one immutable accepted handoff as the sole factual input to a build.

The AI may propose facts, questions, or a build recommendation. It may not authorize a build. The server normalizes AI output into the canonical brief, evaluates readiness, prepares a hash-linked draft handoff, and only then exposes an actionable build card. A `contract-v1` build without a valid handoff is rejected before an attempt is created or Energy is charged.

```text
AI tool output
  -> normalize ProjectBriefV2
  -> evaluateBuildReadiness(brief)
       blocked -> next required question
       ready   -> compile + persist draft handoff
  -> build_recommendation with required handoffId + reviewHash
  -> accept handoff atomically with attempt creation
  -> worker loads accepted handoff
  -> generated-site contract + site schema derive from accepted handoff only
```

## Incident and Root Cause

Project `cmsqtxp2u00084lre1107r1vr` exposed the mismatch:

- The legacy summary field contained `offer: "HP bekas semua merek"`.
- The typed field contained `productOrService: null`.
- `hasMinimumBriefForBuild()` checked `businessName + offer` and admitted a build recommendation.
- `buildContractFromBrief()` checked `businessName + productOrService[]` and rejected handoff preparation with `at least one offer required`.
- Handoff failure was ignored, leaving a `build_recommendation` card without `handoffId` or `reviewHash`.
- `WorkspaceShell.canStartBuild()` returned true for every non-null brief.
- The generate API silently created a legacy attempt when contract handoff fields were absent.
- The worker later rejected the attempt as `accepted handoff invalid`.

The AI writer, source generator, TypeScript compiler, and visual gates never ran. This was a control-plane consistency failure.

## Graphify Audit

Graphify mapped `ProjectBrief` to 26 direct consumers and found readiness spread across separate communities (`brief-flow.ts`, `discuss-readiness.ts`, `brief-admission.ts`, `build-planner.ts`, `contract-readiness.ts`, `WorkspaceShell.tsx`, and the generate route).

The current competing authorities are:

1. `REQUIRED_BRIEF_FIELDS`
2. `MIN_BRIEF_FIELDS`
3. `REQUIRED_BRIEF_FIELD_IDS`
4. `getBriefReadiness()` (`confidence + openQuestions`)
5. `hasMinimumBriefForBuild()` (`businessName + offer`)
6. `evaluateDiscussReadiness()` (rich structural fields)
7. `isBriefReadyForBuild()` (`readyForBuild + productOrService`)
8. `checkBatchedGenerateAdmission()` (`businessName + offer + readyForBuild`)
9. `buildContractFromBrief()` (`businessName + productOrService`)
10. `evaluateContractReadiness()` (contract facts/jobs/CTA)
11. `WorkspaceShell.canStartBuild()` (currently any non-null brief)
12. Optional handoff identifiers on `build_recommendation`

The audit also found a second consistency risk: the generated-site path combines an accepted immutable contract with the current mutable brief. `GeneratedSiteContractV1`, `ProjectSiteSchema`, writer admission, build prompt, and snapshot metadata can therefore describe different content.

## Goals

1. Store each owner fact in one canonical typed location.
2. Make one deterministic preflight the only authority for brief readiness.
3. Never show an actionable build recommendation before a valid draft handoff exists.
4. Reject handoff-less `contract-v1` requests before attempt creation and Energy charging.
5. Build only from the immutable accepted handoff, never from a later mutable brief.
6. Derive UI summaries, writer schemas, and generation contracts from canonical data rather than parallel model-written summaries.
7. Preserve owner data during migration without inventing missing facts.
8. Keep blocked users on one useful path: answer the next material question.
9. Make stale, malformed, or forced requests fail clearly and recoverably.

## Non-Goals

- No redesign of the generated-site visual quality system.
- No restoration of a model tool loop.
- No requirement to populate optional testimonials, FAQ, prices, photos, address, or hours when they do not apply.
- No user-facing technical schema editor.
- No automatic inference of phone numbers, addresses, prices, stock, testimonials, or guarantees.
- No attempt to keep legacy and canonical fields synchronized indefinitely.

## Approach Decision

### Rejected: synchronize duplicate fields

A compatibility helper could copy `offer` into `productOrService` and `contactOrCta` into `contact`. This is quick but retains two writable authorities and leaves future drift possible.

### Rejected: make the build contract the live discussion model

Every discussion turn could mutate `BuildContractV1` directly. This removes one conversion but couples a conversational draft to immutable build semantics and makes partial answers, declined questions, and provenance harder to represent.

### Chosen: canonical Brief V2 plus immutable handoff

`ProjectBriefV2` is the editable owner-information source. A single deterministic preflight evaluates it. Once ready, it compiles into an immutable, hash-linked handoff. Discussion owns the editable brief; build owns the accepted handoff. Information moves one way.

## Canonical Brief V2

The implementation reuses existing rich-field leaf types and introduces no duplicate aliases. The canonical persisted shape is:

```ts
type ProjectBriefV2 = {
  version: 2;
  prompt: string;
  business: {
    name: string;
    type: string;
    category: UmkmType | null;
  };
  offers: ProductOrServiceItem[];
  audience: string | null;
  primaryAction: {
    kind: "whatsapp" | "phone" | "instagram" | "maps" | "browse" | "other";
    label: string;
    target: string | null;
  } | null;
  visualDirection: string | null;
  fieldState: FieldStateMap;
  content: {
    tagline: string | null;
    usp: string[];
    priceRange: string | null;
    hours: HoursValue[];
    address: string | null;
    deliveryArea: string | null;
    since: string | null;
    testimonials: TestimonialValue[];
    certifications: CertificationValue[];
    paymentMethods: PaymentMethodValue[];
    socialLinks: SocialLinkValue[];
    currentPromo: string | null;
    secondaryAction: { label: string; action: string } | null;
  };
  assets: BusinessImageRef[];
  provenance: {
    facts: ProjectFact[];
    decisions: ProjectDecision[];
  };
};
```

### Canonical field rules

- `offers` replaces both `offer` and `productOrService`.
- `primaryAction` replaces both `contactOrCta` and `contact`.
- `business.type` is owner-facing wording; `business.category` is a server-derived classifier. They are distinct semantics, not aliases.
- `visualDirection` replaces readiness use of both style aliases and later compiles into contract preferences.
- `fieldState` records whether context-dependent fields were answered, declined, explicitly empty, or unresolved.
- `provenance` records discussion history; it is not a competing factual source and must not be read as fallback business data.
- `readyForBuild`, AI confidence, and open-question arrays are not persisted authorities.
- Display summaries are derived projections and are never written back as facts.

## One Readiness Authority

```ts
type BuildReadiness =
  | {
      state: "blocked";
      blockers: Array<{
        field: CanonicalBriefField;
        reason: string;
        question: string;
      }>;
      nextQuestion: BriefQuestion;
    }
  | {
      state: "ready";
      blockers: [];
    };

function evaluateBuildReadiness(brief: ProjectBriefV2): BuildReadiness;
```

This pure function is the only brief-level readiness authority. It must be used by:

- AI tool-output normalization
- discussion turn finalization
- persisted workspace-card reads
- draft handoff preparation
- build-card rendering data
- generate API preflight
- worker defense-in-depth validation
- admin/project observer state
- batched writer admission

### Core requirements

A build requires:

- non-empty business name
- at least one valid offer
- one primary offer when several offers exist
- resolved target audience
- resolved primary action
- resolved visual direction

Context-dependent fields use the existing category policy. A field is resolved when it is answered, explicitly declined, explicitly empty where policy permits, or not applicable. Optional fields are never required merely to make a page look fuller.

A browse action may have no external target. Actions such as WhatsApp, phone, Instagram, maps, visit, book, or order require a validated target.

### AI confidence

AI confidence may remain telemetry, but it cannot authorize or block a build. The server evaluates typed facts only.

## Discussion and Workspace UX

1. The AI may emit `build_recommendation` at any time.
2. The server normalizes the brief and runs `evaluateBuildReadiness()`.
3. If blocked, the server discards the proposed build card and emits the next deterministic question.
4. The user sees plain progress such as `2 informasi lagi sebelum website siap dibuat.`
5. When ready, the server prepares the draft handoff.
6. Only successful handoff preparation produces `build_recommendation`.
7. The card summary comes from handoff review items, never arbitrary model summary text.
8. The Build button is enabled only when the card carries a valid handoff proof.

Normal blocked UX does not show a disabled Build button. A disabled button is only a stale-client fallback while fresh server state is loading.

## Workspace Card Contract

For `contract-v1`, an invalid build recommendation must be unrepresentable:

```ts
type ContractBuildRecommendationCard = {
  type: "build_recommendation";
  title: string;
  summary: string[];
  handoffId: string;
  reviewHash: string;
  reviewItems: ReviewItem[];
};
```

If legacy cards must coexist temporarily, they use an explicitly different internal type or engine-specific parser. Optional handoff fields are not allowed on the contract card.

Persisted cards are revalidated on read. A stale card whose handoff is missing, superseded, ownership-mismatched, or hash-invalid is demoted to the current readiness question.

## Handoff Preparation

`prepareBuildHandoff()` becomes the atomic bridge from editable brief to immutable build input:

1. Evaluate canonical readiness.
2. Freeze the normalized brief as `briefSnapshot` and compute `briefHash`.
3. Derive `BuildContractV1` from that snapshot and evaluate contract readiness.
4. Build and validate the plan.
5. Derive review items and hashes.
6. Persist the snapshot, contract, plan, and hashes in one draft handoff.
7. Return the complete contract build card payload.

A failure returns structured blockers or an internal validation error. The caller cannot continue displaying a build recommendation.

The handoff's canonical `briefSnapshot` contains every owner-supplied field needed by generation, including audience, offers, CTA, visual direction, promotion, USP, testimonials, social links, hours, payment methods, price range, address, delivery area, and approved assets. `BuildContractV1` remains a deterministic semantic projection for visitor jobs, CTA intent, requirements, and planning; it does not become a second editable copy. Exact missing fields remain omitted.

`ProjectBuildHandoff` gains required `briefSnapshot Json`, `briefHash String`, and `briefRevision Int` fields. `ProjectEditAttempt.handoffId` remains the immutable attempt linkage. New contract attempts require that relation; nullable linkage exists only for historical or explicitly legacy attempts during migration.

## Generate API

For `contract-v1`:

- `handoffId`, `reviewHash`, and an idempotency key are required.
- Missing or stale proof returns a specific Indonesian 409 response.
- No `ProjectEditAttempt`, build row, operation lease, or Energy debit is created.
- The route never silently falls back to the legacy path.
- Handoff acceptance and attempt creation remain atomic and idempotent.

During migration, retained legacy behavior is dispatched only by `generationEngine === "legacy-v1"`, never by absence of client fields. The compatibility branch is deleted in rollout step 6.

## Worker and Generation Inputs

The worker loads the accepted handoff linked to the attempt and validates ownership, status, hashes, and plan/contract consistency.

After acceptance:

- The mutable project brief is not a factual generation input.
- `compileGeneratedSiteContract()` accepts the accepted handoff package (`briefSnapshot`, contract, and plan) plus deterministic settings/recipe, not the current project brief.
- `ProjectSiteSchema` is derived deterministically from `GeneratedSiteContractV1`; it is never independently derived from the mutable project brief.
- Batched admission validates the accepted handoff, not legacy brief fields.
- Writer prompt, source gates, snapshot metadata, quality proof, and displayed review carry the same `briefHash`, contract hash, and plan hash.
- A later discussion edit creates a new brief revision and new handoff; it cannot mutate an in-flight or completed attempt.

Derived representations are allowed when they are one-way, deterministic, and hash-linked. Single source of truth does not require one object for every layer; it requires that derived objects cannot independently change owner facts.

## Legacy Migration

An idempotent V1-to-V2 migrator preserves real owner data and fails safely on ambiguity:

- Prefer valid `productOrService[]`; otherwise convert non-empty `offer` to one primary offer.
- Prefer valid typed `contact`; otherwise retain `contactOrCta` only as an action label. Never infer a destination.
- Preserve business name, audience, visual direction, rich content, assets, and provenance.
- Derive `business.category` from validated existing category data; do not infer owner-facing claims.
- Remove persisted readiness authority and recompute readiness.
- Invalidate draft cards/handoffs that no longer match canonical data.
- Preserve accepted handoffs as immutable historical snapshots.
- Ambiguous or incomplete projects become blocked and ask the next question; they do not auto-build.

The migration is tested against sanitized structural equivalents of historical projects, including the HP Surya incident shape.

## Error Handling

- Missing required data: deterministic next question, no charge.
- Handoff compilation failure: no build card; log field identifiers and reason without owner values.
- Stale client card: refresh workspace state and show the current question/review.
- Forced handoff-less request: 409, no attempt, no charge.
- Worker receives invalid attempt linkage: fail loud as an integrity error; never call AI.
- Mutable brief changes after acceptance: ignored by the existing attempt; a new build requires a new handoff.

## Observability

Log structured transitions without private field values:

- brief schema version
- readiness state and blocker field identifiers
- handoff preparation result
- handoff ID, brief hash, contract hash, and plan hash
- API rejection reason
- attempt-to-handoff linkage result
- generated contract hash used by writer and snapshot

Do not log contact targets, addresses, owner copy, or raw brief contents.

## Testing

### Unit tests

- V1-to-V2 normalization for duplicate, sparse, and conflicting legacy fields
- canonical readiness for each required and context-dependent field
- AI build recommendation demotion when blocked
- build recommendation creation only after successful handoff persistence
- contract card requires handoff proof at type/runtime boundaries
- handoff snapshot includes every populated canonical owner field
- generated-site compiler consumes no mutable project brief
- derived site schema and writer contract share the same accepted handoff hashes

### Regression tests

Use the HP Surya shape:

```ts
{
  businessName: "HP Surya",
  offer: "HP bekas semua merek",
  productOrService: null,
  contactOrCta: "Lihat stok & harga",
  contact: null,
  readyForBuild: true,
}
```

Expected result after migration: one canonical primary offer and an explicit `browse` action labeled `Lihat stok & harga` with a null target. An explicitly owner-selected browse action is resolved because it requires no external destination. The project remains blocked only for other unresolved required fields, and no build card exists without a persisted handoff.

### Route and worker tests

- contract project without handoff proof returns 409 and creates no rows
- stale/mismatched handoff proof returns 409 and creates no rows
- valid handoff acceptance creates exactly one attempt under retries
- worker rejects attempt/handoff ownership mismatch before AI use
- changing the project brief after acceptance does not alter generation input

### UI tests

- blocked brief shows the next question, not a build card
- contract build card cannot enable without handoff proof
- stale card refreshes to server-authoritative state
- final required answer transitions to review/build exactly once

### Integration test

Run a real discussion sequence from an incomplete prompt through required answers, handoff review, acceptance, and build. Assert that every displayed review value traces to the accepted handoff snapshot and that the resulting attempt references that handoff.

## Rollout

1. Add canonical types, migrator, and readiness tests without changing runtime writes.
2. Switch discussion normalization and handoff compilation to V2.
3. Require handoff-backed contract cards and reject contract API fallback.
4. Switch writer/schema/snapshot inputs to accepted handoff only.
5. Backfill existing editable briefs and invalidate stale draft cards.
6. Remove legacy fields, validators, and compatibility branches after migration checks pass.
7. Run focused integration tests, `bun run check`, and one real discussion-to-build E2E before enabling generated-site rollout.

## Definition of Done

- One canonical brief representation remains writable.
- One brief readiness function remains.
- `readyForBuild` is not persisted as an independent authority.
- Contract build cards require valid handoff proof.
- `contract-v1` cannot create a handoff-less attempt.
- Accepted builds consume no mutable brief facts.
- All generated factual projections trace to one accepted handoff `briefHash`; semantic build projections additionally carry the contract and plan hashes.
- Legacy duplicate fields and readiness helpers are deleted after migration.
- HP Surya regression, route tests, worker tests, typecheck, lint, affected tests, and full `bun run check` pass.
- A real discussion → handoff → build project succeeds with review data matching generated input.
