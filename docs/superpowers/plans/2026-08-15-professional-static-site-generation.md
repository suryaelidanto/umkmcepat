# Professional Static-Site Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every newly selected `landing` or static `marketing_site` candidate pass a business-specific, mobile/desktop, calibrated professional quality contract while preserving one writer call, one final critic call, at most one pre-review correction, zero model tools, portable source, and last-known-good output.

**Architecture:** Compile accepted facts into a V3 writer contract, one immutable professional blueprint, and one executable V2 design kit. A single streamed writer emits a bounded V3 plan plus every blueprint-required route file; the platform compiles protected theme/font/router files, runs source/build/browser V2 gates, then performs one final category-complete calibrated visual review. New V3 proof and V4 benchmark formats fail closed on visual uncertainty; historical V1/V2 data remains readable.

**Tech Stack:** Bun, TypeScript, Vitest, AI SDK `streamText`/`generateText`, Vite, React 19, TanStack Router hash history, Tailwind CSS v4, shadcn/ui, Playwright Core, private S3-compatible evidence, BullMQ worker orchestration, Prisma snapshot metadata.

## Global Constraints

- Implement `docs/superpowers/specs/2026-08-15-professional-static-site-generation-design.md` exactly; do not weaken its qualification or release thresholds.
- Keep the configured `default-combo` route. Do not hard-code or switch models to rescue one failure.
- Supported output is `landing` plus static `marketing_site`; `interactive_app`, generated persistence, auth, checkout, payment, backend, and more than three routes remain out of scope.
- Normal model budget is exactly `writer=1`, `critic=1`, `correction=0`, `tools=0`.
- Attempt maximum is exactly `writer=1`, `critic=1`, `correction=1`, `tools=0`.
- The shared correction is pre-review only. The visual critic is final; no source changes occur after it.
- `visual: unknown`, missing evidence, malformed review, incomplete categories, or low confidence can never produce a V3 pass.
- Preserve immutable accepted facts, CTA kind/label/target, accepted routes, approved assets, and prohibited claims.
- Never invent prices, stock, contacts, addresses, hours, testimonials, awards, guarantees, certifications, regulated claims, capabilities, checkout, or payment state.
- Preserve protected scaffold ownership of content, theme, package, config, runtime, primitive, router, and preview files.
- Generated customer copy is Indonesian. Code, prompts, tests, logs, fixtures, specs, and diagnostics are English.
- Generated projects remain standalone Vite + React + Tailwind projects with `createHashHistory()` and no control-plane runtime import.
- No manual edits to `.data/project-*`, `.data/project-build-workspaces`, generated route files, `.env`, secrets, runtime screenshots, or private owner evidence.
- Runtime screenshots, labels, and blind mappings remain ignored under `.data/generation-evaluation/` or private S3.
- No new dependency. Use existing Bun, TypeScript, AI SDK, Tailwind, and Playwright capabilities.
- No `any`, `as any`, `ts-ignore`, unexplained lint suppression, hidden retry, fallback success, or fabricated benchmark value.
- Every behavior task follows red-green TDD: failing focused test, minimal implementation, passing focused test, lint, atomic commit.
- Do not modify historical V1/V2 proof meaning. Introduce V3/V4 types and preserve old metadata readers.
- Do not enable V3 production selection before Task 12 calibration and benchmark evidence passes every conjunctive threshold.
- Run `bun run check` before each review checkpoint and final handoff. Run root `bun run build` only after Task 13 worker integration because that task changes production orchestration.

---

## File Structure

### New focused modules

- `src/lib/projects/professional-site-kits.ts` — V2 executable kit types, five-kit catalog, compatibility, typography stacks, pattern requirements.
- `src/lib/projects/professional-site-kits.test.ts` — kit completeness, diversity, compatibility, and executable-output tests.
- `src/lib/projects/professional-site-blueprint.ts` — V3 accepted-content projection, route bindings, content-role classification, deterministic professional blueprint, canonical hash.
- `src/lib/projects/professional-site-blueprint.test.ts` — single/multi-route, role, pattern prerequisite, media, signature, and determinism tests.
- `src/lib/projects/professional-site-plan.ts` — `WriterDesignPlanV3` parser, size bound, blueprint/kit conformance, section rhythm, responsive transforms.
- `src/lib/projects/professional-site-plan.test.ts` — strict shape, immutable fields, one-signature, route/section, typography, and mobile tests.
- `src/lib/projects/professional-site-router.ts` — protected hash-history router compiler from blueprint route bindings.
- `src/lib/projects/professional-site-router.test.ts` — exact imports, paths, exports, route tree, and safety tests.
- `src/lib/projects/professional-site-writer.ts` — V3 one-stream writer/correction orchestration and final scaffold merge.
- `src/lib/projects/professional-site-writer.test.ts` — one-call budget, required paths, byte limits, source gate, and correction safety tests.
- `src/lib/projects/professional-site-source-gates.ts` — V3 hard source gates plus bounded non-blocking professional signals.
- `src/lib/projects/professional-site-source-gates.test.ts` — facts, CTA, routes, hooks, typography/tokens, media, section coverage, and anti-slop tests.
- `src/lib/projects/professional-site-critic.ts` — one final category-complete professional screenshot review and strict parser.
- `src/lib/projects/professional-site-critic.test.ts` — nine-category coverage, ratings, confidence, unknown reasons, call cap, and privacy tests.
- `src/lib/projects/professional-site-calibration.ts` — versioned calibration summary, release-manifest parser, and authority thresholds.
- `src/lib/projects/professional-site-calibration.test.ts` — sample/category/precision/recall/false-ready/P0/model-authority threshold tests.
- `config/professional-site-quality-release.json` — tracked sanitized release authority; starts blocked until Task 12 evidence passes.
- `src/lib/projects/professional-site-quality-proof.ts` — V3 proof creation, pass invariants, and sanitization.
- `src/lib/projects/professional-site-quality-proof.test.ts` — unknown/fail/pass invariants, call budget, hard failures, ratings, and private-field stripping.
- `src/lib/projects/professional-site-pipeline.ts` — V3 orchestration from contract/blueprint through final review, with one pre-review correction.
- `src/lib/projects/professional-site-pipeline.test.ts` — call order, correction phases, final-review authority, unknown rejection, and last-boundary tests.

### Existing modules to modify

- `src/lib/projects/generated-site-contract.ts` / `.test.ts` — add V3 writer contract compilation while preserving V1/V2.
- `src/lib/projects/scaffold/generated-site-primitives.ts` / `.test.ts` — emit stable DOM hooks and V2 kit/font metadata without business content.
- `src/lib/projects/scaffold/shadcn-theme.ts` / `.test.ts` — compile semantic `font-display`/`font-body` stacks and keep contrast evidence.
- `src/lib/projects/generated-site-theme.ts` / `.test.ts` — compile/apply V3 plan palette and allowed stack IDs.
- `src/lib/projects/batched-response.ts` / `.test.ts` — parse V3 design plan and stop only after every required editable path closes.
- `src/lib/projects/batched-generator.ts` / `.test.ts` — expose V3 stream options without changing historical V1/V2 behavior.
- `src/lib/projects/batched-prompt.ts` / `.test.ts` — build compact professional writer and pre-review correction prompts.
- `src/lib/projects/browser-gates.ts` / `.test.ts` — add versioned Browser V2 assertions and classification.
- `src/lib/projects/generated-site-browser-runner.ts` / `.test.ts` — pass blueprint/browser policy into the isolated runner and parse V2 evidence.
- `scripts/qualify-generated-site.cjs` — collect first-view, section, typography, sticky-overlap, media-frame, and professional-signal evidence.
- `scripts/generated-site-contrast.cjs` / `.test.cjs` — retain rendered contrast calculation; add no visual-opinion logic.
- `src/lib/projects/generation-evaluation.ts` / `.test.ts` — V4 trial/report types and conjunctive professional release thresholds.
- `scripts/run-generated-site-benchmark.ts` — run `professional-static-v3`, persist real reports, derive all failure counts.
- `scripts/create-generated-site-blind-review.ts` — collect relative choice plus absolute publish readiness for both arms.
- `scripts/run-generation-evaluation.ts` — normalize V4 private blind results and return non-zero on any release failure.
- `scripts/create-professional-calibration-review.ts` — randomized private route-pair review HTML and sample manifest.
- `scripts/evaluate-professional-calibration.ts` — strict two-reviewer/adjudicated label parsing, metrics, and non-zero threshold exit.
- `fixtures/generation-evaluation/manifest.json` — move to V4 and include two justified multi-route cases.
- `fixtures/generation-evaluation/briefs/education-course.json` — accepted `/` plus `/kelas` customer jobs.
- `fixtures/generation-evaluation/briefs/property-rental.json` — accepted `/` plus `/properti` customer jobs.
- `fixtures/generation-evaluation/professional-defects.json` — thirty executable deterministic defect operators spanning nine categories.
- `src/lib/projects/build-attempt-worker.ts` / `.batched.test.ts` — select V3 only after evidence checkpoint; preserve worker lifecycle and selection authority.
- `src/lib/projects/generated-starter.ts` / `generated-source.test.ts` — persist historical proof union plus V3 proof.
- `src/lib/projects/generation-observability.ts` / `.test.ts` — sanitized V3 versions, hard-failure counts, ratings, unknown reasons, timings.
- `DESIGN.md` — canonical generated-app V3 quality floor and output/routing contract.
- `DEV.md` — calibration, benchmark, private evidence, debugging, and release workflow.
- `src/lib/projects/skills/design-quality.md` — compact operational professional-quality SOP.
- `docs/superpowers/README.md` — point future agents to the V3 spec and this plan.
- `package.json` — no new dependency; retain existing `evaluate:generation:*` aliases and add `evaluate:generation:calibrate` in Task 10 because Task 12 requires an executable calibration runner.

### Private runtime artifacts; never commit

- `.data/generation-evaluation/<run-id>/trials.json`
- `.data/generation-evaluation/<run-id>/calibration/**`
- `.data/generation-evaluation/<run-id>/blind/mapping.json`
- `.data/generation-evaluation/<run-id>/blind/preferences.json`
- `.data/generation-evaluation/<run-id>/**/mobile.jpg`
- `.data/generation-evaluation/<run-id>/**/desktop.jpg`

---

### Task 1: Add Executable Professional Design Kits V2

**Files:**
- Create: `src/lib/projects/professional-site-kits.ts`
- Create: `src/lib/projects/professional-site-kits.test.ts`
- Modify: `src/lib/projects/scaffold/generated-site-primitives.ts`
- Test: `src/lib/projects/scaffold/generated-site-primitives.test.ts`

**Interfaces:**

```ts
export type ProfessionalContentRole =
  | "identity"
  | "offer"
  | "catalog"
  | "proof"
  | "process"
  | "operations"
  | "story"
  | "faq"
  | "contact";

export type ProfessionalFontStackId =
  | "editorial-serif"
  | "humanist-sans"
  | "geometric-sans"
  | "restrained-grotesk";

export type ProfessionalCompositionPattern = {
  id: string;
  intent: string;
  requiredContentRoles: ProfessionalContentRole[];
  allowedMediaModes: Array<"owner_assets" | "graphic" | "typographic">;
  desktopRelationship:
    | "centered"
    | "split"
    | "asymmetric"
    | "rail"
    | "editorial-list";
  requiredMobileTransform: string;
  forbids: string[];
};

export type GeneratedSiteDesignKitV2 = {
  id: GeneratedSiteDesignKitId;
  version: 2;
  compatibleArchetypes: string[];
  compatibleMediaModes: Array<"owner_assets" | "graphic" | "typographic">;
  compatibleDensities: Array<"sparse" | "regular" | "rich">;
  compositionPatterns: ProfessionalCompositionPattern[];
  typography: {
    allowedDisplayStackIds: ProfessionalFontStackId[];
    bodyStackId: ProfessionalFontStackId;
    maxDisplayRem: number;
    maxBodyCh: number;
  };
  themePolicy: {
    temperature: "warm" | "cool" | "neutral";
    backgroundLightness: "light" | "dark" | "either";
    accentSurfaceMaximum: number;
  };
  taste: GeneratedSiteTasteProfile;
  rhythm: {
    sectionSpacingRem: [number, number];
    allowAlternatingSurfaces: boolean;
    maximumConsecutiveEqualTreatments: 2;
  };
  primitiveFileIds: ["site-layout-v2"];
  allowedSectionTreatments: string[];
  allowedSignatureAnchors: Array<
    "offer" | "product" | "process" | "place" | "craft" | "audience"
  >;
  sourceAssertions: string[];
  browserAssertions: string[];
  criticRubric: string[];
  antiPatterns: string[];
};

export const PROFESSIONAL_DESIGN_KITS: ReadonlyMap<
  GeneratedSiteDesignKitId,
  GeneratedSiteDesignKitV2
>;

export type ProfessionalSiteSelectionInput = {
  archetype: string;
  density: "sparse" | "regular" | "rich";
  mediaMode: "owner_assets" | "graphic" | "typographic";
  hasOperationalDetails: boolean;
  routeRoles: Array<{
    path: string;
    roles: ProfessionalContentRole[];
  }>;
};

export function selectProfessionalSiteKit(
  input: ProfessionalSiteSelectionInput,
): GeneratedSiteDesignKitV2;

export function compatibleProfessionalPatterns(input: {
  kit: GeneratedSiteDesignKitV2;
  contentRoles: ProfessionalContentRole[];
  mediaMode: "owner_assets" | "graphic" | "typographic";
}): ProfessionalCompositionPattern[];
```

- [ ] **Step 1: Write failing catalog tests**

Create table-driven tests that enforce all executable dimensions:

```ts
import { describe, expect, it } from "vitest";

import {
  PROFESSIONAL_DESIGN_KITS,
  compatibleProfessionalPatterns,
  selectProfessionalSiteKit,
} from "./professional-site-kits";

describe("professional site kits", () => {
  it("defines five complete V2 kits", () => {
    expect([...PROFESSIONAL_DESIGN_KITS.keys()].sort()).toEqual([
      "bold-typographic",
      "catalog-story",
      "editorial-airy",
      "menu-led-editorial",
      "warm-commerce",
    ]);
    for (const kit of PROFESSIONAL_DESIGN_KITS.values()) {
      expect(kit.version).toBe(2);
      expect(kit.primitiveFileIds).toEqual(["site-layout-v2"]);
      expect(kit.compositionPatterns.length).toBeGreaterThanOrEqual(2);
      expect(kit.allowedSectionTreatments.length).toBeGreaterThanOrEqual(3);
      expect(kit.allowedSignatureAnchors.length).toBeGreaterThan(0);
      expect(kit.typography.allowedDisplayStackIds.length).toBeGreaterThan(0);
      expect(kit.rhythm.maximumConsecutiveEqualTreatments).toBe(2);
      expect(kit.criticRubric.length).toBe(9);
    }
  });

  it("filters patterns by real roles and media mode", () => {
    const kit = PROFESSIONAL_DESIGN_KITS.get("catalog-story");
    expect(kit).toBeDefined();
    expect(
      compatibleProfessionalPatterns({
        kit: kit!,
        contentRoles: ["identity", "offer", "catalog", "contact"],
        mediaMode: "graphic",
      }).map((pattern) => pattern.id),
    ).toContain("asymmetric-catalog-hero");
    expect(
      compatibleProfessionalPatterns({
        kit: kit!,
        contentRoles: ["identity", "offer", "contact"],
        mediaMode: "typographic",
      }).map((pattern) => pattern.id),
    ).not.toContain("asymmetric-catalog-hero");
  });

  it("keeps sparse generic content on bold typography", () => {
    expect(
      selectProfessionalSiteKit({
        archetype: "generic",
        density: "sparse",
        mediaMode: "typographic",
        hasOperationalDetails: false,
        routeRoles: [
          { path: "/", roles: ["identity", "offer", "contact"] },
        ],
      }).id,
    ).toBe("bold-typographic");
  });
});
```

Add a regression that every kit differs from every other kit in pattern IDs, typography choices, treatment vocabulary, and critic rubric. This prevents prompt-only kits.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
bun test src/lib/projects/professional-site-kits.test.ts src/lib/projects/scaffold/generated-site-primitives.test.ts
```

Expected: FAIL because the V2 catalog and `site-layout-v2` do not exist.

- [ ] **Step 3: Implement the five V2 kits**

Create the interfaces above. Upgrade the existing five kit intents without copying customer facts. Use these pattern requirements:

| Kit | Pattern | Required roles | Desktop relationship | Mobile transform |
|---|---|---|---|---|
| editorial-airy | `editorial-lockup` | identity, offer | asymmetric | identity, offer, CTA, signature detail |
| editorial-airy | `operational-editorial-split` | offer, operations | split | offer before operations; no side-by-side compression |
| menu-led-editorial | `menu-led-first-view` | identity, catalog | editorial-list | headline, order CTA, then first menu choices |
| menu-led-editorial | `operational-menu-close` | catalog, operations, contact | split | menu, operations, contact |
| catalog-story | `asymmetric-catalog-hero` | identity, offer, catalog | asymmetric | offer and CTA before catalog preview |
| catalog-story | `catalog-narrative-rail` | catalog, story | rail | vertical ordered rail with story between groups |
| warm-commerce | `split-commerce-hero` | identity, offer, contact | split | promise, CTA, decision aid |
| warm-commerce | `decision-aid-close` | proof, contact | split | proof before close CTA |
| bold-typographic | `full-field-lockup` | identity, offer | centered | keep display under 4 lines and CTA visible |
| bold-typographic | `minimal-proof-line` | offer, proof | editorial-list | proof immediately after CTA |

Each kit must expose exactly nine critic rubric entries, one per professional category. Keep motion at `1-3`, signature budget at `1`, accent surface maximum `0.10`, and existing five IDs.

- [ ] **Step 4: Add `site-layout-v2` hooks without business content**

Extend `createGeneratedSitePrimitiveFiles()` to accept V1 or V2 kits by structural fields. For V2, emit:

```tsx
export function SiteFirstView({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}): ReactElement {
  return (
    <section data-first-view className={cn("min-h-[70dvh]", className)}>
      {children}
    </section>
  );
}

export function SiteSignature({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}): ReactElement {
  return (
    <div data-signature className={cn("relative", className)}>
      {children}
    </div>
  );
}
```

Do not add a `SitePrimaryAction` wrapper. The writer places exactly one `data-primary-action` per route on that route’s real actionable `<a>` or `<button>`, preventing duplicate or non-actionable hook matches. Change `SiteSection` to emit `data-section-id={id}` whenever `id` exists. Keep primitives free of copy, customer facts, complete page composition, remote resources, and unsafe style input.

- [ ] **Step 5: Run focused tests and lint**

```bash
bun test src/lib/projects/professional-site-kits.test.ts src/lib/projects/scaffold/generated-site-primitives.test.ts
bunx eslint src/lib/projects/professional-site-kits.ts src/lib/projects/scaffold/generated-site-primitives.ts --max-warnings=0
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/projects/professional-site-kits.ts src/lib/projects/professional-site-kits.test.ts src/lib/projects/scaffold/generated-site-primitives.ts src/lib/projects/scaffold/generated-site-primitives.test.ts
git commit -m "feat(generation): add professional design kits"
```

---

### Task 2: Compile V3 Contracts and Immutable Professional Blueprints

**Files:**
- Modify: `src/lib/projects/generated-site-contract.ts`
- Modify: `src/lib/projects/generated-site-contract.test.ts`
- Create: `src/lib/projects/professional-site-blueprint.ts`
- Create: `src/lib/projects/professional-site-blueprint.test.ts`

**Interfaces:**

```ts
export type ProfessionalSiteBusinessV1 = {
  name: string;
  type: string;
  audience: string | null;
  primaryJob: string;
};

export type ProfessionalSiteContentV1 = {
  businessName: string;
  businessType: string;
  audience: string | null;
  ownerTagline: string | null;
  heroTitle: string;
  offers: SiteSchemaProduct[];
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
  primaryCta: {
    intentId: string;
    kind: "whatsapp" | "phone" | "visit" | "browse" | "book" | "order" | "other";
    label: string;
    targetFactId: string | null;
    href: string;
  };
  secondaryCta: { label: string; target: string; href: string } | null;
  navigation: Array<{
    fromPath: string;
    toPath: string;
    label: string;
    href: string;
  }>;
  labels: {
    catalog: "Pilihan";
    proof: "Yang perlu diketahui";
    process: "Cara memesan";
    operations: "Informasi usaha";
    contact: "Hubungi";
  };
  otherFacts: string[];
};

export type GeneratedSiteWriterContractV3 = {
  schemaVersion: 3;
  contractHash: string;
  handoff: { contractHash: string; planHash: string };
  business: ProfessionalSiteBusinessV1;
  content: ProfessionalSiteContentV1;
  factIndex: Array<{ id: string; kind: FactKind }>;
  obligations: GeneratedSiteWriterContractV2["obligations"];
  media: GeneratedSiteWriterContractV2["media"];
  visualInputs: {
    direction: string | null;
    density: "sparse" | "regular" | "rich";
    selectedKitId: GeneratedSiteDesignKitId;
    selectedKitVersion: 2;
  };
};

export type ProfessionalBlueprintArtDirection = {
  subject: string;
  audience: string | null;
  acceptedDirection: string | null;
  variance: number;
  motion: number;
  density: number;
  shape: "sharp" | "soft" | "pill";
  typography: {
    allowedDisplayStackIds: ProfessionalFontStackId[];
    bodyStackId: ProfessionalFontStackId;
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
    mustReference: Array<
      "offer" | "product" | "process" | "place" | "craft" | "audience"
    >;
    forbidden: string[];
  };
};

export type ProfessionalContentPath =
  | "site.businessName"
  | "site.heroTitle"
  | "site.audience"
  | "site.offers"
  | "site.usp"
  | "site.testimonials"
  | "site.certifications"
  | "site.hours"
  | "site.paymentMethods"
  | "site.priceRange"
  | "site.address"
  | "site.deliveryArea"
  | "site.socialLinks"
  | "site.promotion"
  | "site.primaryCta"
  | "site.secondaryCta"
  | "site.otherFacts";

export type ProfessionalRouteBinding = {
  path: string;
  filePath: string;
  exportName: string;
  purpose: string;
  primaryJob: string;
  requiredFactIds: string[];
  requiredContentPaths: ProfessionalContentPath[];
  firstView: {
    identityText: string;
    offerTexts: string[];
    primaryCtaLabel: string;
    primaryCtaHref: string;
  };
  allowedPatternIds: string[];
  sections: Array<{
    id: string;
    purpose: string;
    role: ProfessionalContentRole;
    requiredFactIds: string[];
    requiredContentPaths: ProfessionalContentPath[];
    requiredVisibleTexts: string[];
  }>;
};

export type ProfessionalSiteBlueprintV1 = {
  schemaVersion: 1;
  blueprintHash: string;
  contractHash: string;
  kit: { id: GeneratedSiteDesignKitId; version: 2; allowedPatternIds: string[] };
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
  };
  signatureRoute: string;
  artDirection: ProfessionalBlueprintArtDirection;
  media: GeneratedSiteWriterContractV3["media"];
  routes: ProfessionalRouteBinding[];
  responsive: {
    mobileViewport: { width: 390; height: 844 };
    desktopViewport: { width: 1440; height: 1000 };
    requireExplicitTransformFor: string[];
    primaryActionVisibleOnMobile: true;
  };
};

export function deriveProfessionalSiteSelectionInput(input: {
  handoff: GeneratedSiteHandoffInput;
  briefSnapshot: ProjectBriefV2;
  photoEnabled: boolean;
}): ProfessionalSiteSelectionInput;

export function compileProfessionalSiteContent(input: {
  handoff: GeneratedSiteHandoffInput;
  briefSnapshot: ProjectBriefV2;
  primaryCta: ProfessionalSiteContentV1["primaryCta"];
}): ProfessionalSiteContentV1;

export function compileProfessionalPrimaryCta(input: {
  contract: BuildContractV1;
  plan: BuildPlanV1;
  briefSnapshot: ProjectBriefV2;
}): ProfessionalSiteContentV1["primaryCta"];

export function compileGeneratedSiteWriterContractV3(input: {
  handoff: GeneratedSiteHandoffInput;
  briefSnapshot: ProjectBriefV2;
  photoEnabled: boolean;
  kit: GeneratedSiteDesignKitV2;
}): GeneratedSiteWriterContractV3;

export function compileProfessionalSiteBlueprint(input: {
  contract: GeneratedSiteWriterContractV3;
  kit: GeneratedSiteDesignKitV2;
}): ProfessionalSiteBlueprintV1;
```

- [ ] **Step 1: Write failing V3 contract tests**

Add tests proving:

```ts
it("compiles V3 without changing accepted facts", () => {
  const result = compileGeneratedSiteWriterContractV3({
    handoff,
    briefSnapshot,
    photoEnabled: false,
    kit: PROFESSIONAL_DESIGN_KITS.get("catalog-story")!,
  });
  expect(result).toMatchObject({
    schemaVersion: 3,
    business: { name: handoff.contract.identity.businessName },
    handoff: {
      contractHash: handoff.contractHash,
      planHash: handoff.planHash,
    },
    visualInputs: {
      selectedKitId: "catalog-story",
      selectedKitVersion: 2,
    },
  });
  expect(result.contractHash).toMatch(/^[0-9a-f]{64}$/);
});
```

Also assert equal input produces equal hash, changed route/fact/kit produces a different hash, V2 compilation remains unchanged, and `interactive_app` fails before model work. Add CTA cases: WhatsApp/phone from accepted contact fact; visit/browse from one unambiguous accepted route/section; other from exact accepted canonical target; missing `targetFactId`, unknown fact, wrong fact kind, ambiguous route, unsafe URL, and inherited `#kontak` all fail. Add explicit provenance regressions:

```ts
expect(result.content).not.toHaveProperty("headline");
expect(result.content).not.toHaveProperty("subheadline");
expect(result.content).not.toHaveProperty("trustPoints");
expect(JSON.stringify(result.content)).not.toMatch(
  /mudah dipahami|mudah dipesan|pilihan utama terlihat jelas|detail produk mudah dipahami/i,
);
expect(result.content.offers).toEqual(acceptedOfferFact.value);
expect(result.content.ownerTagline).toBe(briefSnapshot.content.tagline);
expect(result.content.heroTitle).toBe(
  briefSnapshot.content.tagline ??
    acceptedOfferFact.value[0]?.name ??
    handoff.contract.identity.businessName,
);
expect(result.content.labels).toEqual({
  catalog: "Pilihan",
  proof: "Yang perlu diketahui",
  process: "Cara memesan",
  operations: "Informasi usaha",
  contact: "Hubungi",
});
```

Assert `factIndex` has one `{ id, kind }` per accepted fact, no duplicate IDs, no fact values, and no extra fields. For every optional field, test both accepted value preservation and unsupported absence. No V3 fixture may rely on `publicHeadline()`, `publicSubheadline()`, `publicTrustPoints()`, `publicProductCopy()`, `createFallbackProjectSiteSchema()`, or `defaultTheme`.

- [ ] **Step 2: Write failing blueprint tests**

Cover:

- one accepted `/` route maps to `src/routes/index.tsx` and `HomeRouteComponent`;
- accepted `/kelas` maps to `src/routes/kelas.tsx` and `KelasRouteComponent`;
- each binding has non-empty route-specific accepted `offerTexts`, identity text, CTA label, and CTA href;
- navigation page IDs resolve to safe route paths and exact accepted labels;
- duplicate, traversal, query, fragment, dynamic, wildcard, or more than three routes fail;
- pre-kit selection traits classify route roles from purpose/fact kinds without generated copy;
- selection chooses one kit that has at least one compatible pattern for every route;
- blueprint roles classify catalog, proof, process, operations, story, FAQ, and contact identically to pre-kit traits;
- every obligated fact resolves to a protected content path and bounded accepted display texts; unknown/unmapped facts fail;
- patterns missing required roles are filtered out;
- sparse facts grow only the structural home `hero`/action binding when absent; no proof/catalog/process/FAQ/operations filler appears;
- graphic/no-asset mode keeps zero asset entries;
- split/asymmetric/rail patterns enter `requireExplicitTransformFor`;
- signature route is deterministic, exists, and prefers `/` when its roles permit the selected signature anchor;
- equal input produces equal `blueprintHash`;
- `deriveProfessionalSiteSelectionInput()` and final blueprint produce identical roles for every accepted route.

Use this exact route safety table:

```ts
it.each([
  ["/../admin", "unsafe route path"],
  ["/kelas?x=1", "unsafe route path"],
  ["/kelas#harga", "unsafe route path"],
  ["/:id", "dynamic routes are unsupported"],
  ["/*", "wildcard routes are unsupported"],
])("rejects %s", (path, message) => {
  expect(() => compileBlueprintWithRoutes(["/", path])).toThrow(message);
});
```

- [ ] **Step 3: Run tests and verify RED**

```bash
bun test src/lib/projects/generated-site-contract.test.ts src/lib/projects/professional-site-blueprint.test.ts
```

Expected: FAIL because V3 types/compiler and blueprint compiler do not exist.

- [ ] **Step 4: Implement V3 contract compilation**

Reuse V2 only for accepted business identity, CTA resolution, obligations, and media allow-list. Never copy `v2.content`, because V2 currently synthesizes generic headline/subheadline/trust/product copy.

```ts
const HASH_PREFIX_V3 = "umkmcepat:generated-site-writer-contract:v3:";

export function compileProfessionalSiteContent(input: {
  handoff: GeneratedSiteHandoffInput;
  briefSnapshot: ProjectBriefV2;
  primaryCta: ProfessionalSiteContentV1["primaryCta"];
}): ProfessionalSiteContentV1 {
  const acceptedOffers = acceptedOfferFacts(input.handoff.contract.facts);
  const secondaryHref = input.briefSnapshot.content.secondaryAction
    ? compileAcceptedSecondaryHref({
        action: input.briefSnapshot.content.secondaryAction.action,
        acceptedRoutes: input.handoff.plan.pages.map((page) => page.path),
        acceptedPrimaryCta: input.primaryCta,
      })
    : null;
  return {
    businessName: input.handoff.contract.identity.businessName,
    businessType:
      input.handoff.contract.identity.businessType ??
      input.briefSnapshot.business.type,
    audience: input.briefSnapshot.audience,
    ownerTagline: input.briefSnapshot.content.tagline,
    heroTitle:
      input.briefSnapshot.content.tagline ??
      acceptedOffers[0]?.name ??
      input.handoff.contract.identity.businessName,
    offers: acceptedOffers,
    usp: [...input.briefSnapshot.content.usp],
    testimonials: acceptedTestimonialFacts(input.handoff.contract.facts),
    certifications: acceptedCertificationFacts(input.handoff.contract.facts),
    hours: acceptedHoursFacts(input.handoff.contract.facts),
    paymentMethods: acceptedPaymentFacts(input.handoff.contract.facts),
    priceRange: input.briefSnapshot.content.priceRange,
    address: acceptedAddressText(input.handoff.contract.facts),
    deliveryArea: acceptedServiceAreaText(input.handoff.contract.facts),
    socialLinks: acceptedSocialFacts(input.handoff.contract.facts),
    promotion: input.briefSnapshot.content.currentPromo,
    primaryCta: input.primaryCta,
    secondaryCta:
      input.briefSnapshot.content.secondaryAction && secondaryHref
        ? {
            label: input.briefSnapshot.content.secondaryAction.label,
            target: input.briefSnapshot.content.secondaryAction.action,
            href: secondaryHref,
          }
        : null,
    navigation: compileAcceptedNavigation(input.handoff.plan),
    labels: {
      catalog: "Pilihan",
      proof: "Yang perlu diketahui",
      process: "Cara memesan",
      operations: "Informasi usaha",
      contact: "Hubungi",
    },
    otherFacts: acceptedOtherFacts(input.handoff.contract.facts),
  };
}

export function compileGeneratedSiteWriterContractV3(
  input: GeneratedSiteWriterContractV3Input,
): GeneratedSiteWriterContractV3 {
  const v2 = compileGeneratedSiteWriterContractV2(input);
  const primaryJob = input.handoff.contract.visitorJobs.find(
    (job) => job.priority === "primary",
  );
  if (!primaryJob) {
    throw new Error("professional site requires a primary visitor job");
  }
  const primaryCta = compileProfessionalPrimaryCta({
    contract: input.handoff.contract,
    plan: input.handoff.plan,
    briefSnapshot: input.briefSnapshot,
  });
  const draft = {
    schemaVersion: 3 as const,
    contractHash: "",
    handoff: v2.handoff,
    business: {
      name: input.handoff.contract.identity.businessName,
      type:
        input.handoff.contract.identity.businessType ??
        input.briefSnapshot.business.type,
      audience: input.briefSnapshot.audience,
      primaryJob: primaryJob.goal,
    },
    content: compileProfessionalSiteContent({
      handoff: input.handoff,
      briefSnapshot: input.briefSnapshot,
      primaryCta,
    }),
    factIndex: input.handoff.contract.facts.map((fact) => ({
      id: fact.id,
      kind: fact.kind,
    })),
    obligations: v2.obligations,
    media: v2.media,
    visualInputs: {
      direction: v2.visualInputs.direction,
      density: v2.visualInputs.density,
      selectedKitId: input.kit.id,
      selectedKitVersion: 2 as const,
    },
  };
  return {
    ...draft,
    contractHash: createHash("sha256")
      .update(HASH_PREFIX_V3 + canonicalJson(draft), "utf8")
      .digest("hex"),
  };
}
```

The named `accepted*Facts` helpers return copied arrays only for matching accepted fact kinds. `compileAcceptedNavigation()` resolves accepted `fromPageId`/`toPageId` values against declared pages, emits normalized hash-history hrefs, and rejects unknown page IDs, duplicate edges, unsafe labels, or unsafe paths. `compileProfessionalPrimaryCta()` reads the first accepted CTA intent directly. WhatsApp/phone/order/book require the referenced accepted contact fact; visit/browse require a referenced fact or one unambiguous accepted route/section; other requires an exact accepted canonical target. It normalizes WhatsApp to `https://wa.me/<canonical-digits>`, phone to `tel:<accepted-number>`, preserves safe accepted HTTP(S) targets, and normalizes accepted internal route/section targets for hash history. `compileAcceptedSecondaryHref()` accepts only declared routes/sections or the accepted external action target; otherwise it returns `null`. Build `secondaryCta` only when that helper returns a non-null href. Unsafe, missing, ambiguous, unresolved, or inherited `#kontak` primary targets fail compilation. Do not mutate V1/V2 constants, helpers, or serializers.

- [ ] **Step 5: Implement route binding, role classification, and blueprint hash**

Normalize only lowercase kebab-case static paths. Export names come from PascalCase path segments plus `RouteComponent`; `/` remains `HomeRouteComponent`. Reject duplicate paths and duplicate normalized file/export names.

Use pure helpers:

```ts
export function classifyProfessionalContentRole(input: {
  id: string;
  purpose: string;
  requiredFactKinds: string[];
}): ProfessionalContentRole;

export function contentBindingForFact(input: {
  fact: ContractFactV1;
  content: ProfessionalSiteContentV1;
}): {
  paths: ProfessionalContentPath[];
  visibleTexts: string[];
};

export function createProfessionalRouteBinding(input: {
  route: GeneratedSiteWriterContractV3["obligations"]["routes"][number];
  sections: GeneratedSiteWriterContractV3["obligations"]["sections"];
  facts: ContractFactV1[];
  content: ProfessionalSiteContentV1;
  primaryJob: string;
}): ProfessionalRouteBinding;
```

Implement one shared pure `deriveProfessionalRouteRoles()` helper over accepted plan purposes and resolved fact kinds. `deriveProfessionalSiteSelectionInput()` and `compileProfessionalSiteBlueprint()` both call it; neither duplicates role rules. Resolve every route/section `requiredFactId` against `handoff.contract.facts` during compilation and fail on an unknown ID. `contentBindingForFact()` maps every fact kind to protected content paths and flattens bounded accepted display strings; fail on an unmapped required fact. Ensure `/` has a structural `hero` binding to accepted identity/offer/CTA; add a structural contact/action binding only when no accepted section owns the primary action. These bindings add no visible strings. Do not synthesize proof, catalog, process, FAQ, story, or operations sections. Count supplied facts from unique resolved fact IDs plus non-empty accepted content arrays/values. Use the contract density as the blueprint density. Select compatible patterns with `compatibleProfessionalPatterns()`; zero compatible patterns is a configuration error.

- [ ] **Step 6: Run focused tests and lint**

```bash
bun test src/lib/projects/generated-site-contract.test.ts src/lib/projects/professional-site-blueprint.test.ts
bunx eslint src/lib/projects/generated-site-contract.ts src/lib/projects/professional-site-blueprint.ts --max-warnings=0
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/projects/generated-site-contract.ts src/lib/projects/generated-site-contract.test.ts src/lib/projects/professional-site-blueprint.ts src/lib/projects/professional-site-blueprint.test.ts
git commit -m "feat(generation): compile professional site blueprints"
```

---

### Task 3: Parse Strict V3 Writer Plans and Complete Multi-File Streams

**Files:**
- Create: `src/lib/projects/professional-site-plan.ts`
- Create: `src/lib/projects/professional-site-plan.test.ts`
- Modify: `src/lib/projects/batched-response.ts`
- Modify: `src/lib/projects/batched-response.test.ts`
- Modify: `src/lib/projects/batched-generator.ts`
- Modify: `src/lib/projects/batched-generator.test.ts`

**Interfaces:**

```ts
export type WriterDesignPlanV3 = {
  schemaVersion: 3;
  blueprintHash: string;
  visualThesis: string;
  signature: {
    route: string;
    description: string;
    sourceAnchor: "offer" | "product" | "process" | "place" | "craft" | "audience";
  };
  typography: {
    displayStackId: ProfessionalFontStackId;
    bodyStackId: ProfessionalFontStackId;
  };
  palette: {
    background: string;
    foreground: string;
    muted: string;
    accent: string;
  };
  routes: Array<{
    path: string;
    patternId: string;
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

export function parseWriterDesignPlanV3(input: {
  value: unknown;
  blueprint: ProfessionalSiteBlueprintV1;
  kit: GeneratedSiteDesignKitV2;
}): WriterDesignPlanV3;
```

Extend parser options/result:

```ts
type BatchedResponseParserOptions = {
  requiredFilePaths?: string[];
  stopAfterRequiredFilePaths?: boolean;
  designPlanV3Expected?: {
    blueprint: ProfessionalSiteBlueprintV1;
    kit: GeneratedSiteDesignKitV2;
  };
};

type BatchedParseResult = {
  designPlanV3: WriterDesignPlanV3 | null;
  stoppedAfterRequiredFilePaths: boolean;
};

// Add to BatchedStreamCallResult so release authority can verify both IDs.
type BatchedStreamModelEvidence = {
  modelRequested: string;
  modelServed: string | null;
};
```

- [ ] **Step 1: Write failing plan tests**

Create one valid two-route plan. Assert rejection for:

- serialized size over `6_144` characters;
- wrong blueprint hash;
- any route pattern outside that route binding’s `allowedPatternIds`;
- missing/duplicate/extra route;
- missing/duplicate/reordered accepted section;
- treatment outside kit vocabulary;
- three consecutive equal treatment/surface pairs;
- display/body stack outside kit policy;
- signature route absent from blueprint routes;
- signature anchor outside kit and blueprint subject anchors;
- empty/second signature;
- missing explicit mobile transform for an asymmetric/split/rail pattern;
- invalid palette literal.

The valid fixture shape must be:

```ts
const validPlan: WriterDesignPlanV3 = {
  schemaVersion: 3,
  blueprintHash: blueprint.blueprintHash,
  visualThesis: "The product choice leads the page while a quiet craft detail carries identity.",
  signature: {
    route: "/",
    description: "A measured textile-fold illustration framing the catalog preview.",
    sourceAnchor: "product",
  },
  typography: {
    displayStackId: "editorial-serif",
    bodyStackId: "humanist-sans",
  },
  palette: {
    background: "#f7f3ec",
    foreground: "#3d2b1f",
    muted: "#e5ddd2",
    accent: "#a34f2d",
  },
  routes: blueprint.routes.map((route) => ({
    path: route.path,
    patternId: route.allowedPatternIds[0],
    sections: route.sections.map((section, index) => ({
      id: section.id,
      treatment: index === 0 ? "split-feature" : "editorial-list",
      surface: index % 2 === 0 ? "base" : "muted",
      density: index === 0 ? "airy" : "regular",
    })),
  })),
  mobileTransforms: [
    {
      route: "/",
      pattern: "asymmetric-catalog-hero",
      transform: "Place the promise and primary action before the compact catalog preview.",
    },
  ],
};
```

- [ ] **Step 2: Write failing parser tests**

Add cases proving:

1. V3 `<design-plan>` parses before files.
2. Required paths `index.tsx`, `kelas.tsx`, and shared shell may arrive in any order.
3. The parser does not stop after only `index.tsx`.
4. It reports `stoppedAfterRequiredFilePaths` only after all required paths close.
5. Missing required path fails finalize.
6. Unexpected writable path is retained for the source gate to reject, not silently ignored.
7. V1/V2 parser tests remain unchanged.

- [ ] **Step 3: Run tests and verify RED**

```bash
bun test src/lib/projects/professional-site-plan.test.ts src/lib/projects/batched-response.test.ts src/lib/projects/batched-generator.test.ts
```

Expected: FAIL on missing V3 plan and required-path stream support.

- [ ] **Step 4: Implement strict plan parsing**

Use exact-key allowlists at every object layer. Reject unknown keys. Validate route and section equality against blueprint order. Validate each route’s pattern against its own binding’s `allowedPatternIds`; do not use one global plan pattern for every route. Implement a consecutive-treatment counter keyed by `${treatment}:${surface}` and reject a run greater than `2`. Require one mobile transform for each route whose selected pattern relationship is `split`, `asymmetric`, or `rail`.

The parser returns a copied object; it never trusts the input object by cast.

- [ ] **Step 5: Extend the response parser and stream chassis**

Add `<design-plan>` dispatch based on `schemaVersion`. V3 requires `designPlanV3Expected`; V2 remains on its existing branch. Replace one-path stopping with a required-path set:

```ts
const requiredFilePaths = new Set(options?.requiredFilePaths ?? []);
const closedRequiredFilePaths = new Set<string>();

if (requiredFilePaths.has(path)) {
  closedRequiredFilePaths.add(path);
}
if (
  options?.stopAfterRequiredFilePaths &&
  requiredFilePaths.size > 0 &&
  closedRequiredFilePaths.size === requiredFilePaths.size
) {
  stoppedAfterRequiredFilePaths = true;
}
```

Extend `runOneStreamedResponse()` arguments with V3 expected data and required paths. For V3, set `maxOutputTokens: 32_000`, `maxRetries: 0`, and break only on `stoppedAfterRequiredFilePaths`. Preserve V2’s current `src/routes/index.tsx` stopping behavior. Add required `modelRequested` and nullable `modelServed` fields to `BatchedStreamCallResult`; populate them on success and failure from the configured route and provider response when available.

- [ ] **Step 6: Run focused tests and lint**

```bash
bun test src/lib/projects/professional-site-plan.test.ts src/lib/projects/batched-response.test.ts src/lib/projects/batched-generator.test.ts
bunx eslint src/lib/projects/professional-site-plan.ts src/lib/projects/batched-response.ts src/lib/projects/batched-generator.ts --max-warnings=0
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/projects/professional-site-plan.ts src/lib/projects/professional-site-plan.test.ts src/lib/projects/batched-response.ts src/lib/projects/batched-response.test.ts src/lib/projects/batched-generator.ts src/lib/projects/batched-generator.test.ts
git commit -m "feat(generation): parse professional site responses"
```

---

### Task 4: Compile Protected Typography, Theme, and Hash-History Routing

**Files:**
- Create: `src/lib/projects/professional-site-router.ts`
- Create: `src/lib/projects/professional-site-router.test.ts`
- Modify: `src/lib/projects/scaffold/shadcn-theme.ts`
- Modify: `src/lib/projects/scaffold/shadcn-theme.test.ts`
- Modify: `src/lib/projects/generated-site-theme.ts`
- Modify: `src/lib/projects/generated-site-theme.test.ts`

**Interfaces:**

```ts
export const PROFESSIONAL_FONT_STACKS: Readonly<
  Record<ProfessionalFontStackId, string>
>;

export function compileProfessionalSiteRouter(
  routes: ProfessionalRouteBinding[],
): GeneratedProjectFile;

export function compileProfessionalSiteTheme(input: {
  kit: GeneratedSiteDesignKitV2;
  plan: WriterDesignPlanV3;
}): CompiledGeneratedSiteThemeV3;
```

- [ ] **Step 1: Write failing router tests**

Assert exact behavior:

```ts
it("compiles protected static routes with hash history", () => {
  const file = compileProfessionalSiteRouter([
    homeBinding,
    {
      ...kelasBinding,
      path: "/kelas",
      filePath: "src/routes/kelas.tsx",
      exportName: "KelasRouteComponent",
    },
  ]);
  expect(file.path).toBe("src/router.tsx");
  expect(file.content).toContain('import { HomeRouteComponent } from "./routes/index"');
  expect(file.content).toContain('import { KelasRouteComponent } from "./routes/kelas"');
  expect(file.content).toContain('path: "/kelas"');
  expect(file.content).toContain("createHashHistory()");
  expect(file.content).toContain("rootRoute.addChildren([indexRoute, kelasRoute, notFoundRoute])");
});
```

Reject unsafe imports, duplicate paths, duplicate variable names, unknown root mapping, and more than three routes.

- [ ] **Step 2: Write failing theme/font tests**

Assert:

- every allowed stack resolves to a local/system stack with no `url(`, `@import`, `http`, or quoted remote family;
- plan stack IDs must be allowed by the selected kit;
- CSS exposes `--font-display`, `--font-body`, `--site-font-display`, and `--site-font-body`;
- body applies `font-family: var(--site-font-body)`;
- all existing contrast checks remain pass;
- equal plan/kit produces byte-identical CSS;
- raw font IDs do not enter customer source data.

- [ ] **Step 3: Run tests and verify RED**

```bash
bun test src/lib/projects/professional-site-router.test.ts src/lib/projects/generated-site-theme.test.ts src/lib/projects/scaffold/shadcn-theme.test.ts
```

Expected: FAIL because router and semantic font compilation do not exist.

- [ ] **Step 4: Implement the protected router compiler**

Use JSON-stringified import literals and identifiers already validated by blueprint compilation. Emit imports sorted by route order, then one `createRoute()` per binding, the existing not-found route, `rootRoute.addChildren()`, `createHashHistory()`, and module registration. Do not accept raw source fragments.

- [ ] **Step 5: Implement semantic system-font compilation**

Use these exact local stacks:

```ts
export const PROFESSIONAL_FONT_STACKS = {
  "editorial-serif": 'Georgia, Cambria, "Times New Roman", serif',
  "humanist-sans": '"Segoe UI", Candara, Calibri, system-ui, sans-serif',
  "geometric-sans": 'Avenir, Montserrat, "Century Gothic", system-ui, sans-serif',
  "restrained-grotesk": 'Arial, Helvetica, system-ui, sans-serif',
} as const;
```

Extend `compileShadcnTheme()` with optional validated font strings rather than changing legacy callers. Add Tailwind theme variables and base body font. `compileProfessionalSiteTheme()` validates stack IDs against kit policy, then delegates palette/contrast compilation.

- [ ] **Step 6: Run focused tests and lint**

```bash
bun test src/lib/projects/professional-site-router.test.ts src/lib/projects/generated-site-theme.test.ts src/lib/projects/scaffold/shadcn-theme.test.ts
bunx eslint src/lib/projects/professional-site-router.ts src/lib/projects/generated-site-theme.ts src/lib/projects/scaffold/shadcn-theme.ts --max-warnings=0
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/projects/professional-site-router.ts src/lib/projects/professional-site-router.test.ts src/lib/projects/generated-site-theme.ts src/lib/projects/generated-site-theme.test.ts src/lib/projects/scaffold/shadcn-theme.ts src/lib/projects/scaffold/shadcn-theme.test.ts
git commit -m "feat(generation): compile professional site scaffolds"
```

---

### Task 5: Build the One-Call Professional Writer

**Files:**
- Create: `src/lib/projects/professional-site-writer.ts`
- Create: `src/lib/projects/professional-site-writer.test.ts`
- Modify: `src/lib/projects/batched-prompt.ts`
- Modify: `src/lib/projects/batched-prompt.test.ts`

**Interfaces:**

```ts
export type ProfessionalSiteGenerateResult =
  | {
      ok: true;
      files: GeneratedProjectFile[];
      plan: WriterDesignPlanV3;
      summary: string;
      writtenPaths: string[];
      sourceReport: ProfessionalSiteSourceGateReportV1;
      modelRequested: string;
      modelServed: string | null;
      writerMs: number;
      firstFileClosedMs: number | null;
      editableBytes: number;
    }
  | {
      ok: false;
      reason: string;
      stagedFiles: GeneratedProjectFile[];
      plan: WriterDesignPlanV3 | null;
      sourceReport: ProfessionalSiteSourceGateReportV1 | null;
      modelRequested: string;
      modelServed: string | null;
      writerMs: number;
      firstFileClosedMs: number | null;
      editableBytes: number;
    };

export function buildProfessionalSiteWriterPrompt(input: {
  contract: GeneratedSiteWriterContractV3;
  blueprint: ProfessionalSiteBlueprintV1;
  kit: GeneratedSiteDesignKitV2;
}): { system: string; user: string };

export function buildProfessionalSiteCorrectionPrompt(input: {
  contract: GeneratedSiteWriterContractV3;
  blueprint: ProfessionalSiteBlueprintV1;
  kit: GeneratedSiteDesignKitV2;
  acceptedPlan: WriterDesignPlanV3 | null;
  reason: GeneratedSiteCorrectionReason;
  diagnostics: string[];
  implicatedPaths: string[];
  files: GeneratedProjectFile[];
}): { system: string; user: string };

export async function runProfessionalSiteGenerate(input: {
  contract: GeneratedSiteWriterContractV3;
  blueprint: ProfessionalSiteBlueprintV1;
  kit: GeneratedSiteDesignKitV2;
  projectId: string;
  userId: string;
  attemptId: string;
  buildId: string | null;
  budget: GeneratedSiteCallBudget;
  abortSignal?: AbortSignal;
  onEvent?: BatchedGenerateEventSink;
  onFileStaged?: (file: GeneratedProjectFile) => void;
}): Promise<ProfessionalSiteGenerateResult>;
```

- [ ] **Step 1: Write failing prompt tests**

Assert the system prompt contains:

- the exact V3 contract and blueprint;
- allowed pattern IDs, treatments, stacks, signature anchors, route bindings, and mobile transforms;
- the nine professional dimensions;
- first-view, exactly one real action per route, exactly one site-wide signature on its declared route, and section DOM hooks;
- exact `site.primaryCta.href` and label;
- semantic token/font rules;
- no fixed section count;
- one signature only;
- no invented facts/media/routes;
- all visible copy must be `site.*`, including shared-shell navigation through `site.navigation`; no hard-coded JSX prose, local display-data arrays/objects, CSS/Tailwind generated `content`, `dangerouslySetInnerHTML`, or customer-facing `alt`/`aria-label`/`title` literals outside exact `site.labels.*` values;
- all writable paths and no protected path;
- output byte ceilings;
- one call, no tools, no markdown, `maxRetries: 0` behavior stated.

Assert the correction prompt says it is the only shared pre-review correction and emits only implicated complete paths plus the accepted plan if available.

- [ ] **Step 2: Write failing writer tests**

Mock `runOneStreamedResponse()` and assert:

1. budget consumes one writer call exactly once and records requested/served model IDs;
2. one-page requires only `src/routes/index.tsx`;
3. multi-page requires every route plus `src/components/site/generated-shell.tsx`;
4. protected `src/router.tsx` is compiled by the platform, never accepted from writer output;
5. missing route, unexpected path, invalid plan, protected path, `>32 KiB` single page, or `>48 KiB` multi-page fails;
6. V3 theme and router overwrite only protected scaffold paths;
7. source gates run after normalization/theme/router compilation;
8. writer never receives a model tool;
9. V2 writer tests remain green.

- [ ] **Step 3: Run tests and verify RED**

```bash
bun test src/lib/projects/professional-site-writer.test.ts src/lib/projects/batched-prompt.test.ts
```

Expected: FAIL because V3 prompt/writer do not exist.

- [ ] **Step 4: Implement the compact professional prompt**

Keep it under `14 KiB` before serialized contract/blueprint/schema. Avoid long few-shot page source. The prompt must state decisions, APIs, output protocol, trust rules, and professional rubric once. Do not include the legacy generic hero examples.

Required response:

```text
<design-plan>{WriterDesignPlanV3 JSON}</design-plan>
<file path="src/routes/index.tsx">complete TSX</file>
<file path="src/routes/kelas.tsx">complete TSX when the blueprint declares /kelas</file>
<file path="src/components/site/generated-shell.tsx">complete TSX for multi-route</file>
<done summary="..." />
```

Route files import facts from `@/content/site`, hooks/primitives from protected modules, and the shared shell only when blueprint requires it.

- [ ] **Step 5: Implement generation and scaffold merge**

Execution order:

1. compile exact protected `src/content/site.ts` from `contract.content`;
2. seed Vite scaffold plus `site-layout-v2`, replacing its compatibility `src/content/site.ts` immediately with the exact V3 file before any prompt or merge;
3. consume writer budget;
4. stream with V3 expected plan and required paths;
5. reject parse/path/byte errors;
6. compile V3 theme;
7. compile protected router;
8. merge scaffold + writer routes/shell + exact protected content/theme/router;
9. normalize preview hooks only for objective safe transforms; CTA values already come from `site.primaryCta.href` and must not be rewritten;
10. run `inspectProfessionalStaticSiteSource()`;
11. return report and files.

Do not add a plan fallback. Missing V3 design plan uses the shared correction or fails.

- [ ] **Step 6: Run focused tests and lint**

```bash
bun test src/lib/projects/professional-site-writer.test.ts src/lib/projects/batched-prompt.test.ts src/lib/projects/batched-generator.test.ts
bunx eslint src/lib/projects/professional-site-writer.ts src/lib/projects/batched-prompt.ts --max-warnings=0
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/projects/professional-site-writer.ts src/lib/projects/professional-site-writer.test.ts src/lib/projects/batched-prompt.ts src/lib/projects/batched-prompt.test.ts
git commit -m "feat(generation): add bounded professional site writer"
```

---

### Task 6: Enforce V3 Source Qualification Without Freezing Taste

**Files:**
- Create: `src/lib/projects/professional-site-source-gates.ts`
- Create: `src/lib/projects/professional-site-source-gates.test.ts`
- Modify: `src/lib/projects/professional-site-writer.ts`
- Test: `src/lib/projects/professional-site-writer.test.ts`

**Interfaces:**

```ts
export type ProfessionalSiteHardFailureKind =
  | "fact"
  | "action"
  | "media"
  | "accessibility"
  | "route"
  | "contract";

export type ProfessionalSiteSignalCode =
  | "equal-treatment-run"
  | "uniform-section-spacing"
  | "card-repetition"
  | "first-view-empty-area"
  | "accent-surface-share"
  | "long-prose"
  | "weak-heading-scale"
  | "empty-signature-node";

export type ProfessionalSiteSourceGateReportV1 = {
  version: 1;
  status: "pass" | "fail";
  findings: GeneratedSiteGateFinding[];
  hardFailureCounts: Record<ProfessionalSiteHardFailureKind, number>;
  professionalSignals: Array<{
    code: ProfessionalSiteSignalCode;
    path: string;
    detail: string;
  }>;
};

export function inspectProfessionalStaticSiteSource(input: {
  contract: GeneratedSiteWriterContractV3;
  blueprint: ProfessionalSiteBlueprintV1;
  kit: GeneratedSiteDesignKitV2;
  plan: WriterDesignPlanV3;
  files: GeneratedProjectFile[];
  starterFiles: GeneratedProjectFile[];
  themeChecks: ThemeContrastCheck[];
}): ProfessionalSiteSourceGateReportV1;
```

- [ ] **Step 1: Write failing hard-gate tests**

Create minimal valid one-route and two-route fixtures. Add one test per failure family:

- wrong/missing/extra route file;
- wrong route export;
- writer-emitted protected router/theme/content/primitive/package file;
- missing exactly one route-file `data-first-view`, exactly one route-file actionable `data-primary-action`, exactly one visible site-wide `data-signature` on `plan.signature.route`, or accepted `data-section-id`;
- any first-view, primary-action, or signature hook inside the shared shell;
- fake, duplicate, hidden, or empty hook element;
- missing populated `site.*` field globally or outside its blueprint-bound route/section;
- unknown `site.*` field;
- prohibited claim/literal;
- inherited V2/fallback copy;
- hard-coded customer-facing JSX text, local display-data array/object, CSS/Tailwind generated `content`, `dangerouslySetInnerHTML`, or `alt`/`aria-label`/`title` literal outside punctuation and exact `site.labels.*` values;
- wrong CTA target or unsafe external rel;
- unregistered internal link/anchor;
- raw hex/named palette utility/inline color/`site.theme`;
- arbitrary/remote font family;
- missing `font-display`/`font-body` roles where plan declares them;
- placeholder, remote, unapproved, or empty media;
- starter/reference/fixed-renderer residue;
- `h-screen`, gradient text, thick side stripe, nested card, technical heading, repeated decorative eyebrow, unearned number markers;
- required browser/source assertion omitted;
- byte/file count breach.

Use exact valid CTA evidence:

```tsx
<a
  data-primary-action
  href={site.primaryCta.href}
  target="_blank"
  rel="noopener noreferrer"
>
  {site.primaryCta.label}
</a>
```

- [ ] **Step 2: Write failing signal tests**

Prove signals do not fail otherwise valid output:

```ts
const report = inspectProfessionalStaticSiteSource(signalFixture);
expect(report.status).toBe("pass");
expect(report.professionalSignals).toEqual(
  expect.arrayContaining([
    expect.objectContaining({ code: "card-repetition" }),
    expect.objectContaining({ code: "equal-treatment-run" }),
  ]),
);
```

Add a minimal bold reference-style fixture that produces no “too few sections” failure. This guards legitimate sparse design.

- [ ] **Step 3: Run tests and verify RED**

```bash
bun test src/lib/projects/professional-site-source-gates.test.ts src/lib/projects/professional-site-writer.test.ts
```

Expected: FAIL because V3 gate/report does not exist.

- [ ] **Step 4: Implement objective hard gates**

Reuse TypeScript AST helpers from `generated-site-gates.ts` for `site.*` field validity and rendered JSX presence; move shared helpers only if both modules use them. Add an AST customer-copy walk over JSX text, expression string literals, local arrays/objects whose values reach JSX, and customer-facing attributes (`alt`, `aria-label`, `title`). Reject `dangerouslySetInnerHTML` and CSS/Tailwind generated-content utilities. Permit whitespace/punctuation, `site.*` expressions, and exact `site.labels.*` expressions only. Reject hard-coded visible prose while excluding class names, import strings, href/route strings, IDs, and `data-*` values. Do not add duplicate broad regexes when an AST check exists.

Map finding categories to hard counts:

```ts
const hardKindByCategory = {
  claims: "fact",
  content: "fact",
  cta: "action",
  media: "media",
  accessibility: "accessibility",
  contract: "contract",
  starter: "contract",
  language: "contract",
  genericness: "contract",
} as const;
```

Route-specific findings increment `route`. One finding may increment its semantic hard kind plus route only when it names a route failure; avoid double-counting total failures in benchmark summaries by storing both dimensions explicitly.

- [ ] **Step 5: Implement bounded professional signals**

Signals are evidence only. Cap at `20` entries. Include exact path and count/ratio, not adjectives. Never emit a signal solely because section count is low.

- [ ] **Step 6: Integrate initial and correction output gates**

Both `runProfessionalSiteGenerate()` and its correction function must call the same gate after protected files are compiled. Correction cannot return a source-gate failure as success.

- [ ] **Step 7: Run focused tests and lint**

```bash
bun test src/lib/projects/professional-site-source-gates.test.ts src/lib/projects/professional-site-writer.test.ts
bunx eslint src/lib/projects/professional-site-source-gates.ts src/lib/projects/professional-site-writer.ts --max-warnings=0
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/projects/professional-site-source-gates.ts src/lib/projects/professional-site-source-gates.test.ts src/lib/projects/professional-site-writer.ts src/lib/projects/professional-site-writer.test.ts
git commit -m "feat(generation): qualify professional site source"
```

---

### Task 7: Add Browser Qualification V2 and Professional Geometry Evidence

**Files:**
- Modify: `src/lib/projects/browser-gates.ts`
- Modify: `src/lib/projects/browser-gates.test.ts`
- Modify: `src/lib/projects/generated-site-browser-runner.ts`
- Modify: `src/lib/projects/generated-site-browser-runner.test.ts`
- Modify: `scripts/qualify-generated-site.cjs`
- Modify: `scripts/generated-site-contrast.test.cjs`

**Interfaces:**

```ts
export type ProfessionalBrowserAssertionName =
  | BrowserAssertionName
  | "first-view-contract"
  | "section-coverage"
  | "section-order"
  | "typography-bounds"
  | "content-hidden-by-navigation"
  | "empty-media-frame"
  | "signature-presence";

export type ProfessionalBrowserSignal = {
  code: string;
  route: string;
  viewport: "mobile" | "desktop";
  detail: string;
};

export type BrowserGateReportV2 = {
  version: 2;
  status: BrowserGateStatus;
  routes: Array<{
    route: string;
    viewport: "mobile" | "desktop";
    assertions: Array<{
      name: ProfessionalBrowserAssertionName;
      status: "pass" | "fail" | "infrastructure_error";
      detail?: string;
    }>;
    professionalSignals: ProfessionalBrowserSignal[];
  }>;
  evidenceIds: string[];
  overheadMs: number;
};

export function classifyProfessionalBrowserReport(
  report: BrowserGateReportV2,
  expectedRoutes: string[],
): "pass" | "fail";
```

- [ ] **Step 1: Write failing classifier/parser tests**

Assert V2 requires exactly mobile and desktop reports for every expected route, every V1 assertion, and all seven new assertions. `signature-presence` expects one signature only on `policy.signatureRoute`; other routes pass only with zero signatures. Missing/duplicate/extra route, missing viewport, missing evidence, unknown assertion, malformed signal, or non-pass status fails. Preserve V1 classifier behavior.

- [ ] **Step 2: Add pure browser metric tests**

Extract browser-evaluated decision helpers into serializable pure functions where possible. Test exact bounds:

- body prose `<15px`, line-height `<1.4`, or width `>78ch` fails;
- display size `>96px` or letter spacing `<-0.04em` fails;
- first-view missing identity text, offer text, or exact primary action fails;
- section IDs missing, duplicated, or out of blueprint order fail;
- any section missing one of its normalized `requiredVisibleTexts` values fails;
- sticky/fixed rectangle overlapping an anchor target fails;
- empty media-like frame with area at least `12_000px²`, border/background, and no visible text/image/SVG path fails;
- missing, duplicate, hidden, or empty `[data-signature]` on the signature route fails; any signature on another route fails;
- meaningful inline SVG with visible path passes;
- intentionally absent media panel passes.

Use Node tests in `scripts/generated-site-contrast.test.cjs` only for shared pure metric helpers; keep Playwright DOM collection in the qualification script.

- [ ] **Step 3: Run tests and verify RED**

```bash
bun test src/lib/projects/browser-gates.test.ts src/lib/projects/generated-site-browser-runner.test.ts scripts/generated-site-contrast.test.cjs
```

Expected: FAIL because Browser V2 evidence/assertions do not exist.

- [ ] **Step 4: Pass a bounded browser policy into the subprocess**

Serialize only:

```ts
type ProfessionalBrowserPolicy = {
  routes: Array<{
    path: string;
    sections: Array<{
      id: string;
      requiredVisibleTexts: string[];
    }>;
    firstView: {
      identityText: string;
      offerTexts: string[];
      primaryCtaLabel: string;
      primaryCtaHref: string;
    };
  }>;
  signatureRoute: string;
  typography: {
    maxDisplayPx: 96;
    minDisplayLetterSpacingEm: -0.04;
    minBodyPx: 15;
    minBodyLineHeight: 1.4;
    maxBodyCh: 78;
  };
};
```

Do not send full owner contract or unsupported private fields to the subprocess.

- [ ] **Step 5: Implement DOM evidence and assertions**

In `scripts/qualify-generated-site.cjs`:

1. retain external request blocking and current V1 assertions;
2. find `[data-first-view]`, exactly one actionable `[data-primary-action]`, `[data-section-id]`, and route-aware `[data-signature]` count/visibility;
3. compare normalized visible text and exact CTA href;
4. collect section order from DOM;
5. measure direct visible prose and headings;
6. calculate sticky/fixed overlaps against target sections;
7. inspect media-like frames conservatively;
8. cap assertion detail and professional signals to five entries per assertion and twenty signals per route;
9. capture full-page JPEG after fonts settle under reduced motion.

No aesthetic pass/fail logic belongs here.

- [ ] **Step 6: Run focused tests and lint**

```bash
bun test src/lib/projects/browser-gates.test.ts src/lib/projects/generated-site-browser-runner.test.ts scripts/generated-site-contrast.test.cjs
bunx eslint scripts/qualify-generated-site.cjs src/lib/projects/browser-gates.ts src/lib/projects/generated-site-browser-runner.ts --max-warnings=0
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/projects/browser-gates.ts src/lib/projects/browser-gates.test.ts src/lib/projects/generated-site-browser-runner.ts src/lib/projects/generated-site-browser-runner.test.ts scripts/qualify-generated-site.cjs scripts/generated-site-contrast.test.cjs
git commit -m "feat(generation): add professional browser qualification"
```

---

### Task 8: Add the Final Category-Complete Professional Critic

**Files:**
- Create: `src/lib/projects/professional-site-critic.ts`
- Create: `src/lib/projects/professional-site-critic.test.ts`
- Create: `src/lib/projects/professional-site-calibration.ts`
- Create: `src/lib/projects/professional-site-calibration.test.ts`
- Create: `config/professional-site-quality-release.json`

**Interfaces:**

```ts
export const PROFESSIONAL_REVIEW_CATEGORIES = [
  "business_specificity",
  "first_view_hierarchy",
  "content_architecture",
  "composition_rhythm",
  "typography",
  "color_system",
  "media_integrity",
  "mobile_quality",
  "professional_finish",
] as const;

export type ProfessionalReviewCategory =
  (typeof PROFESSIONAL_REVIEW_CATEGORIES)[number];

export type ProfessionalCategoryAssessment = {
  route: string;
  category: ProfessionalReviewCategory;
  rating: 1 | 2 | 3 | 4;
  viewport: "both" | "mobile" | "desktop";
  evidence: string;
  blueprintReference: string;
  suggestedRevision: string | null;
  confidence: number;
};

export type GeneratedSiteProfessionalReviewV1 =
  | {
      status: "complete";
      promptVersion: string;
      requestedModel: string;
      servedModel: string;
      assessments: ProfessionalCategoryAssessment[];
    }
  | {
      status: "unknown";
      reason:
        | "missing_evidence"
        | "transport"
        | "empty"
        | "malformed"
        | "incomplete"
        | "low_confidence"
        | "uncalibrated_requested_model"
        | "uncalibrated_served_model";
    };

export function deriveProfessionalReviewVerdict(input: {
  review: GeneratedSiteProfessionalReviewV1;
  routes: string[];
}): {
  pass: boolean;
  minimumRating: number | null;
  averageRating: number | null;
  categoryRatings: Partial<Record<ProfessionalReviewCategory, number>>;
  reason: string | null;
};

export async function runProfessionalSiteReview(input: {
  contract: GeneratedSiteWriterContractV3;
  blueprint: ProfessionalSiteBlueprintV1;
  plan: WriterDesignPlanV3;
  kit: GeneratedSiteDesignKitV2;
  sourceReport: ProfessionalSiteSourceGateReportV1;
  browserReport: BrowserGateReportV2;
  screenshots: Array<{
    route: string;
    viewport: "mobile" | "desktop";
    bytes: Uint8Array;
  }>;
  budget: GeneratedSiteCallBudget;
  modelId?: string | null;
}): Promise<GeneratedSiteProfessionalReviewV1>;
```

- [ ] **Step 1: Write failing parser/verdict tests**

Cover:

- all nine categories exactly once per route passes parsing;
- multi-route category aggregation uses each category’s minimum route rating;
- missing, duplicate, extra category or unknown route returns `unknown: incomplete`;
- invalid rating, viewport, confidence, blank evidence, or blank blueprint reference returns `unknown: malformed`;
- ratings `1-2` require a non-empty suggested revision; ratings `3-4` may use `null`;
- any assessment confidence below `0.80` returns `unknown: low_confidence`;
- any rating below `3` makes verdict fail;
- all ratings `3-4` make verdict pass;
- sparse bold fixture with all professional ratings `3` passes;
- empty response → `unknown: empty`;
- transport rejection → `unknown: transport`;
- missing two screenshots per route → `unknown: missing_evidence`;
- critic budget is consumed once; `maxRetries` is `0`.

- [ ] **Step 2: Write failing privacy/prompt tests**

Mock `generateText`. Assert:

- prompt includes nine definitions and 1-4 anchors;
- prompt includes blueprint, kit rubric, and bounded signals;
- prompt tells reviewer not to reward section count, decoration, or reference copying;
- prompt tells reviewer not to reject reference-07-style sparse bold minimalism by itself;
- response schema contains no pass boolean; software derives pass;
- telemetry contains version/model IDs only, not screenshot bytes, owner contacts, or full prompt.

- [ ] **Step 3: Write failing calibration tests**

Define:

```ts
export type ProfessionalCalibrationSummaryV1 = {
  schemaVersion: 1;
  promptVersion: string;
  kitVersion: 2;
  evaluatorVersion: string;
  samples: number;
  seededDefects: number;
  categories: Record<
    ProfessionalReviewCategory,
    { positives: number; negatives: number }
  >;
  blockerPrecision: number;
  blockerRecall: number;
  falseReadyRate: number;
  p0FalseAccepts: number;
  acceptedReference07RejectedForMinimalism: boolean;
};
```

Release eligibility requires `samples>=50`, `seededDefects>=30`, every category has positive and negative coverage, precision `>=0.90`, recall `>=0.80`, false-ready `<=0.05`, P0 false accepts `0`, and reference 07 false rejection `false`.

Also define and strictly parse `ProfessionalSiteReleaseManifestV1` from `config/professional-site-quality-release.json`. The initial tracked fixture is:

```json
{
  "schemaVersion": 1,
  "approved": false,
  "requestedModelId": "default-combo",
  "allowedWriterModelIds": [],
  "allowedCriticModelIds": [],
  "criticPromptVersion": "professional-static-review-v1",
  "kitVersion": 2,
  "evaluatorVersion": "4",
  "corpusVersion": "professional-static-v3",
  "calibration": {
    "samples": 0,
    "seededDefects": 0,
    "blockerPrecision": 0,
    "blockerRecall": 0,
    "falseReadyRate": 1,
    "p0FalseAccepts": 0
  },
  "benchmark": {
    "runId": "blocked",
    "completedTreatmentTrials": 0,
    "treatmentReadyRate": 0,
    "decisiveTreatmentPreference": 0
  },
  "ownerApprovedAt": null
}
```

Selection mode requires `approved: true`, exact requested-model/version matches, writer/correction served IDs in the calibrated writer set, critic served IDs in the calibrated critic set, all aggregate thresholds, exactly 24 completed trials, and non-null owner approval. Calibration mode records observed IDs but cannot select project output.

- [ ] **Step 4: Run tests and verify RED**

```bash
bun test src/lib/projects/professional-site-critic.test.ts src/lib/projects/professional-site-calibration.test.ts
```

Expected: FAIL because critic/calibration modules do not exist.

- [ ] **Step 5: Implement strict review parsing and final call**

Use `generateText()` with:

```ts
{
  maxOutputTokens: 6_144,
  maxRetries: 0,
  temperature: 0,
  ...getNoReasoningCallOptions(),
}
```

Cap routes at three and screenshots at six. Order screenshot parts by blueprint route, mobile then desktop. Return one unknown reason; never retry or convert unknown to pass.

Set `PROFESSIONAL_REVIEW_PROMPT_VERSION` to the stable source string `professional-static-review-v1`. Record requested/served model on complete and unknown outcomes when available; the V3 proof needs model authority evidence even for failure.

- [ ] **Step 6: Implement calibration eligibility**

Return `{ eligibleForSelection: boolean; reasons: string[] }`. Reasons must name exact threshold and observed value. This module reads aggregate values only; it does not read private screenshots.

- [ ] **Step 7: Run focused tests and lint**

```bash
bun test src/lib/projects/professional-site-critic.test.ts src/lib/projects/professional-site-calibration.test.ts
bunx eslint src/lib/projects/professional-site-critic.ts src/lib/projects/professional-site-calibration.ts --max-warnings=0
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/projects/professional-site-critic.ts src/lib/projects/professional-site-critic.test.ts src/lib/projects/professional-site-calibration.ts src/lib/projects/professional-site-calibration.test.ts config/professional-site-quality-release.json
git commit -m "feat(generation): add professional visual review"
```

---

### Task 9: Add V3 Quality Proof and the Final-Review Pipeline

**Files:**
- Create: `src/lib/projects/professional-site-quality-proof.ts`
- Create: `src/lib/projects/professional-site-quality-proof.test.ts`
- Create: `src/lib/projects/professional-site-pipeline.ts`
- Create: `src/lib/projects/professional-site-pipeline.test.ts`

**Interfaces:**

```ts
export type GeneratedSiteQualityProofV3 = {
  schemaVersion: 3;
  engine: "professional-static-single-shot";
  contractHash: string;
  blueprintHash: string;
  writerPlanHash: string | null;
  kitId: GeneratedSiteDesignKitId;
  kitVersion: 2;
  mediaMode: "owner_assets" | "graphic" | "typographic";
  calls: GeneratedSiteCallBudgetSnapshot;
  models: {
    writerRequested: string | null;
    writerServed: string | null;
    criticRequested: string | null;
    criticServed: string | null;
    correctionRequested: string | null;
    correctionServed: string | null;
  };
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
    contract: number;
  };
  professional: {
    promptVersion: string | null;
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

export type RunProfessionalSitePipelineResult =
  | {
      ok: true;
      files: GeneratedProjectFile[];
      distFiles: GeneratedDistFile[];
      contract: GeneratedSiteWriterContractV3;
      blueprint: ProfessionalSiteBlueprintV1;
      plan: WriterDesignPlanV3;
      sourceReport: ProfessionalSiteSourceGateReportV1;
      browserReport: BrowserGateReportV2;
      review: Extract<GeneratedSiteProfessionalReviewV1, { status: "complete" }>;
      proof: GeneratedSiteQualityProofV3;
    }
  | {
      ok: false;
      failureClass: string;
      safeMessage: string;
      stagedFiles: GeneratedProjectFile[];
      proof: GeneratedSiteQualityProofV3;
    };
```

- [ ] **Step 1: Write failing proof tests**

Assert:

- empty proof starts fail/not-run;
- pass requires every gate pass, zero hard failures, writer `1`, critic `1`, correction `0-1`, authorized requested/served writer/critic IDs, minimum rating `>=3`, all nine categories, no unknown reason;
- `professionalVisual: unknown` plus deterministic pass is rejected;
- review fail is rejected;
- missing category is rejected;
- duplicate/invalid call counts are rejected;
- correction reason requires one correction;
- sanitizer drops prompts, blueprint prose, owner copy, CTA target, screenshot/evidence refs, and URLs;
- V2 sanitizer behavior remains unchanged in its own tests.

- [ ] **Step 2: Write failing pipeline call-order tests**

Expected normal order:

```ts
expect(order).toEqual([
  "derive-selection-input",
  "select-kit",
  "compile-contract",
  "compile-blueprint",
  "writer",
  "build",
  "browser",
  "load-evidence",
  "professional-review",
]);
```

Add cases:

- writer/response/source/build/browser may consume the one correction and record its requested/served model IDs;
- corrected candidate reruns source/build/browser before one critic;
- critic complete with rating `2` fails and does not call correction;
- critic unknown fails and does not call correction;
- critic pass succeeds;
- browser infrastructure error produces `outcome: infrastructure_error`;
- correction failure stops;
- critic is never called before browser pass;
- no dependency mutates files after critic invocation;
- budget never exceeds one writer, one critic, one correction;
- selection mode rejects blocked/mismatched release manifest before writer, then rejects uncalibrated writer/correction/critic served IDs without selecting output.

- [ ] **Step 3: Run tests and verify RED**

```bash
bun test src/lib/projects/professional-site-quality-proof.test.ts src/lib/projects/professional-site-pipeline.test.ts
```

Expected: FAIL because V3 proof/pipeline do not exist.

- [ ] **Step 4: Implement proof creation and sanitization**

Use explicit reconstruction as V2 does. Do not spread unknown fields into the output. Validate finite non-negative timings/counts and ratings in `1-4`. For multiple routes, store each category’s minimum route rating; compute `minimumRating` across all assessments and `averageRating` across all assessments.

- [ ] **Step 5: Implement pipeline with one correction before final review**

Use one `GeneratedSiteCallBudget`. Correction phases are only:

```ts
type ProfessionalCorrectionReason =
  | "transport"
  | "response_contract"
  | "source_gate"
  | "build"
  | "browser";
```

Do not include `visual_machine_verifiable` in V3. The critic is final.

Create a helper `qualifyBeforeReview()` that runs source/build/browser for initial or corrected files. It may be called twice; the writer and critic remain once. It returns browser evidence only after every deterministic gate passes. Pipeline input includes `mode: "calibration" | "selection"` plus a parsed release manifest. Selection mode fails before writer when manifest/requested model/version authority is invalid, then verifies writer, correction when present, and critic served model IDs against calibrated sets.

- [ ] **Step 6: Run focused tests and lint**

```bash
bun test src/lib/projects/professional-site-quality-proof.test.ts src/lib/projects/professional-site-pipeline.test.ts src/lib/projects/generated-site-call-budget.test.ts
bunx eslint src/lib/projects/professional-site-quality-proof.ts src/lib/projects/professional-site-pipeline.ts --max-warnings=0
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/projects/professional-site-quality-proof.ts src/lib/projects/professional-site-quality-proof.test.ts src/lib/projects/professional-site-pipeline.ts src/lib/projects/professional-site-pipeline.test.ts
git commit -m "feat(generation): enforce professional site qualification"
```

---

### Task 10: Build the V4 Real Benchmark and Absolute Publish-Readiness Review

**Files:**
- Modify: `src/lib/projects/generation-evaluation.ts`
- Modify: `src/lib/projects/generation-evaluation.test.ts`
- Modify: `scripts/run-generated-site-benchmark.ts`
- Modify: `scripts/create-generated-site-blind-review.ts`
- Modify: `scripts/run-generation-evaluation.ts`
- Create: `scripts/create-professional-calibration-review.ts`
- Create: `scripts/evaluate-professional-calibration.ts`
- Modify: `fixtures/generation-evaluation/manifest.json`
- Modify: `fixtures/generation-evaluation/briefs/education-course.json`
- Modify: `fixtures/generation-evaluation/briefs/property-rental.json`
- Create: `fixtures/generation-evaluation/professional-defects.json`
- Modify: `package.json` — add `evaluate:generation:calibrate` pointing to the benchmark runner’s calibration mode

**Interfaces:**

```ts
export type GeneratedSiteEvaluationManifestV4 = {
  schemaVersion: 4;
  baselineId: "deterministic-control-v1";
  treatmentId: "professional-static-v3";
  corpusVersion: string;
  evaluatorVersion: string;
  cases: Array<{
    briefId: string;
    fixture: string;
    expectedRouteCount: 1 | 2 | 3;
    expectedKitIds: GeneratedSiteDesignKitId[];
    trials: [1, 2];
  }>;
};

export type GeneratedSiteEvaluationTrialV4 = {
  runId: string;
  arm: "deterministic-control-v1" | "professional-static-v3";
  briefId: string;
  trial: 1 | 2;
  outcome: "pass" | "fail" | "infrastructure_error";
  routeCount: number;
  kitId: GeneratedSiteDesignKitId | "control";
  calls: GeneratedSiteCallBudgetSnapshot;
  totalToDecisionMs: number;
  firstFileClosedMs: number | null;
  editableBytes: number;
  hardFailures: GeneratedSiteQualityProofV3["hardFailures"];
  professionalVisual: "pass" | "fail" | "unknown" | "not_run";
  minimumProfessionalRating: number | null;
  categoryRatings: Partial<Record<ProfessionalReviewCategory, number>>;
  routePatternIds: string[];
  desktopEvidenceRefs: string[];
  mobileEvidenceRefs: string[];
};

export type BlindPreferenceV2 = {
  briefId: string;
  trial: 1 | 2;
  choice: "control" | "treatment" | "tie";
  controlReady: boolean;
  treatmentReady: boolean;
};
```

- [ ] **Step 1: Write failing V4 report tests**

Create one qualifying 12-case × 2-trial set, then table-test every rejection:

- treatment count not `24`;
- missing/duplicate treatment or control pair;
- infrastructure/outcome failure;
- route count mismatch;
- writer/critic count not exactly `1`;
- correction count over `1` or correction rate over `0.20`;
- any hard fact/action/media/accessibility/route/contract failure;
- professional status not pass;
- minimum rating below `3` or missing category;
- any kit absent;
- fewer than two multi-route passing cases;
- any route-level composition pattern over `50%` of all treatment routes;
- total p50 over `90_000`, p95 over `150_000`, first-file p50 over `45_000`;
- single-page p95 over `32 KiB` or any multi-page over `48 KiB`;
- decisive treatment preference below `0.75`;
- ties over `0.25`;
- treatment readiness below `0.90`;
- a case has both treatment trials not ready.

- [ ] **Step 2: Write failing benchmark evidence-integrity tests**

Extract pure `trialFromProfessionalResult()` and assert hard counts, route count, professional status, category ratings, calls, timings, and evidence arrays come from the actual pipeline result. Use non-zero fixture counts and prove they survive conversion. This explicitly prevents current hard-coded zeros.

- [ ] **Step 3: Write failing blind-normalization tests**

For randomized left/right mapping, assert normalized output correctly maps relative choice plus both absolute readiness booleans to control/treatment. Missing readiness or incomplete pair returns no valid V4 preference and release fails.

- [ ] **Step 4: Run tests and verify RED**

```bash
bun test src/lib/projects/generation-evaluation.test.ts
```

Expected: FAIL because V4 types, thresholds, and conversion do not exist.

- [ ] **Step 5: Implement V4 report arithmetic**

Reuse the existing percentile helper. Keep infrastructure errors in denominators. Deduplicate reason strings but never drop a failing dimension. V1-V3 report builders remain readable.

- [ ] **Step 6: Upgrade two fixtures to justified multi-route static sites**

`education-course.json` accepted plan:

- `/`: identity, primary course offer, accepted trust, CTA;
- `/kelas`: supplied course/class catalog and accepted enrollment/contact CTA.

`property-rental.json` accepted plan:

- `/`: identity, audience, location/service context, primary inquiry CTA;
- `/properti`: supplied property collection and exact inquiry CTA.

Update accepted contract visitor jobs/route obligations consistently and regenerate fixture hashes using existing canonical helpers or the fixture’s established hash workflow. Do not hand-invent a hash.

- [ ] **Step 7: Add thirty seeded professional defects**

Create a tracked definition file containing IDs/categories/operator IDs/parameters only, no private screenshots. Implement each operator in the benchmark calibration runner as a deterministic pure source transform; reject a definition whose operator is unknown or whose transform makes no source change. After mutation, rebuild and capture the mobile+desktop route pair privately. Use exact IDs only for traceability; critic prompts never receive mutation IDs. Minimum distribution:

- business specificity: 3;
- first-view hierarchy: 4;
- content architecture: 3;
- composition/rhythm: 4;
- typography: 4;
- color system: 3;
- media integrity: 3;
- mobile quality: 3;
- professional finish: 3.

Each entry has:

```json
{
  "id": "first-view-hidden-cta",
  "category": "first_view_hierarchy",
  "severity": "blocker",
  "operator": "move-primary-action-below-mobile-fold",
  "parameters": { "minTopPx": 900 },
  "expectedRatingMaximum": 2
}
```

Do not special-case exact IDs in the critic prompt. The private calibration runner applies each operator, verifies changed source, builds it, runs deterministic browser checks, captures route-pair screenshots, invokes the critic once for calibration prediction, then stores predictions and human labels privately.

- [ ] **Step 8: Upgrade the real runner, calibration mode, and blind HTML**

Add:

```json
"evaluate:generation:calibrate": "bun scripts/run-generated-site-benchmark.ts --calibration"
```

Calibration mode loads `professional-defects.json`, applies every known deterministic operator to passing treatment source, verifies a source change, rebuilds, runs browser qualification, invokes the critic for prediction, and persists private route-pair evidence/predictions.

`create-professional-calibration-review.ts` reads those private samples, randomizes sample order, and emits `calibration/review.html` plus `calibration/samples.json`. Each reviewer downloads:

```ts
type ProfessionalCalibrationLabelsV1 = {
  schemaVersion: 1;
  reviewerId: string;
  labels: Array<{
    sampleId: string;
    category: ProfessionalReviewCategory;
    rating: 1 | 2 | 3 | 4;
  }>;
};
```

`evaluate-professional-calibration.ts` requires complete reviewer-A and reviewer-B files with identical sample/category keys, rejects duplicates, writes `calibration/adjudication.json` for every ready/not-ready (`>=3`) disagreement, then requires a complete adjudicated label file for those keys. It computes confusion counts against critic ratings, precision, recall, false-ready rate, category coverage, P0 false accepts, and reference-07 false rejection. It emits `ProfessionalCalibrationSummaryV1` and exits non-zero below any threshold.

Use `runProfessionalSitePipeline()` for treatment. Persist source, dist, reports, screenshots, and proof privately. Convert actual result fields. The blind HTML adds required questions per side:

- relative: A/B/tie;
- “A siap dipublikasikan tanpa revisi visual besar?” yes/no;
- “B siap dipublikasikan tanpa revisi visual besar?” yes/no.

Keep arm, kit, model, source size, timing, and mapping hidden.

- [ ] **Step 9: Run focused tests and lint**

```bash
bun test src/lib/projects/generation-evaluation.test.ts
bunx eslint src/lib/projects/generation-evaluation.ts scripts/run-generated-site-benchmark.ts scripts/create-generated-site-blind-review.ts scripts/run-generation-evaluation.ts scripts/create-professional-calibration-review.ts scripts/evaluate-professional-calibration.ts --max-warnings=0
bun scripts/check-doc-links.ts
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/lib/projects/generation-evaluation.ts src/lib/projects/generation-evaluation.test.ts scripts/run-generated-site-benchmark.ts scripts/create-generated-site-blind-review.ts scripts/run-generation-evaluation.ts scripts/create-professional-calibration-review.ts scripts/evaluate-professional-calibration.ts fixtures/generation-evaluation/manifest.json fixtures/generation-evaluation/briefs/education-course.json fixtures/generation-evaluation/briefs/property-rental.json fixtures/generation-evaluation/professional-defects.json package.json
git commit -m "feat(generation): add professional quality benchmark"
```

---

### Task 11: Publish Canonical Operational Documentation and Verify Offline Code

**Files:**
- Modify: `DESIGN.md`
- Modify: `DEV.md`
- Modify: `src/lib/projects/skills/design-quality.md`
- Modify: `docs/superpowers/README.md`

**Interfaces:**
- Canonical docs use V3/V4 terminology and preserve V1/V2 historical-read rules.
- Runtime research sources remain references only; no external design dependency is added.

- [ ] **Step 1: Update `DESIGN.md`**

Replace outdated generated-app statements with:

- professional V3 scope and nine dimensions;
- one-page default, one-to-three route static marketing sites;
- blueprint/kit/plan ownership;
- semantic colors and font stacks;
- required DOM hooks;
- one writer/one critic/one optional pre-review correction;
- final visual unknown fails V3 selection;
- private evidence and benchmark thresholds;
- no ToolLoopAgent/model tools/manual generated edits.

- [ ] **Step 2: Update `DEV.md`**

Document exact commands:

```bash
bun run graph:update
bun run evaluate:generation:run
bun run evaluate:generation:blind -- --run-id <run-id>
bun run evaluate:generation:report -- \
  --results .data/generation-evaluation/<run-id>/trials.json \
  --preferences .data/generation-evaluation/<run-id>/blind/preferences.json
```

Document:

- calibration version keys and thresholds;
- private artifact locations;
- how to inspect a failed V3 proof by attempt/project ID;
- unknown visual semantics;
- no selection before aggregate release pass;
- Butik Senja regression steps;
- rollback and last-known-good behavior.

- [ ] **Step 3: Update compact design-quality SOP**

Keep it under `300` lines. Include the nine categories, blueprint review, one-signature rule, useful-depth rule, mobile transform rule, objective gate list, final critic authority, and V3 unknown failure. Remove the superseded instruction that visual unknown may still pass.

- [ ] **Step 4: Update the decision-trail index**

Point the high-signal generated-site area to:

- `docs/superpowers/specs/2026-08-15-professional-static-site-generation-design.md`;
- `docs/superpowers/plans/2026-08-15-professional-static-site-generation.md`.

Mark 2026-08-13 and 2026-08-14 documents as historical foundations where they conflict.

- [ ] **Step 5: Run the offline quality gate**

```bash
bunx prettier --write DESIGN.md DEV.md src/lib/projects/skills/design-quality.md docs/superpowers/README.md
bun run check
```

Expected: all format, lint, typecheck, test, Knip, and docs checks pass.

- [ ] **Step 6: Inspect diff and commit**

```bash
git status --short --untracked-files=all
git diff --check
git diff --stat
git add DESIGN.md DEV.md src/lib/projects/skills/design-quality.md docs/superpowers/README.md
git commit -m "docs(generation): publish professional quality workflow"
```

Do not stage `.data`, screenshots, logs, `.firecrawl`, `.pi`, graph output, or private labels.

---

### Task 12: Calibrate the Critic and Pass the 24-Trial Release Gate

**Files:**
- No tracked runtime artifacts.
- A sanitized aggregate summary may be added to a new dated audit only after it contains no owner/private evidence.

**Interfaces:**
- `ProfessionalCalibrationSummaryV1`
- `ProfessionalSiteReleaseManifestV1`
- `GeneratedSiteEvaluationReportV4`
- Product-owner blind approval

This is a mandatory evidence checkpoint. Task 13 must not start until every item passes.

- [ ] **Step 1: Verify runtime prerequisites without exposing secrets**

Check Bun, browser, build execution, configured AI route, and infrastructure. Log setting names plus set/unset only. Never print environment values.

```bash
bun run infra
bun run db:migrate
bun run graph:update
```

- [ ] **Step 2: Generate calibration pages and seeded defects privately**

Run:

```bash
bun run evaluate:generation:calibrate
```

Use the emitted calibration run ID. Keep all output under `.data/generation-evaluation/<run-id>/`. Produce at least 50 human-labeled route-pair samples; each sample contains the same route’s mobile and desktop screenshots. Apply all 30 executable seeded defect operators to passing treatment source, rebuild, capture evidence, and collect critic predictions.

- [ ] **Step 3: Collect independent human labels**

Run `bun scripts/create-professional-calibration-review.ts --run-id <calibration-run-id>`. For every route-pair sample, reviewer A and reviewer B independently label all nine categories `1-4` while viewing mobile and desktop together. Save private `reviewer-a.json` and `reviewer-b.json`. Run the evaluator once to produce `adjudication.json`; adjudicate every listed key into `adjudicated.json`. Keep reviewer identity and screenshots private.

- [ ] **Step 4: Build and verify calibration summary**

Require:

```text
samples >= 50
seededDefects >= 30
all categories have positive and negative coverage
blockerPrecision >= 0.90
blockerRecall >= 0.80
falseReadyRate <= 0.05
p0FalseAccepts = 0
acceptedReference07RejectedForMinimalism = false
```

Run:

```bash
bun scripts/evaluate-professional-calibration.ts \
  --run-id <calibration-run-id> \
  --reviewer-a .data/generation-evaluation/<calibration-run-id>/calibration/reviewer-a.json \
  --reviewer-b .data/generation-evaluation/<calibration-run-id>/calibration/reviewer-b.json \
  --adjudicated .data/generation-evaluation/<calibration-run-id>/calibration/adjudicated.json
```

Expected: exit `0`. If it fails, revise prompt/rubric or objective evidence, increment prompt/evaluator version, rerun focused tests, then regenerate the full calibration set. Do not edit thresholds. Record the requested `default-combo` ID plus every observed writer/correction/critic served model ID in the private calibration summary.

- [ ] **Step 5: Run all 24 treatment/control trials**

```bash
bun run evaluate:generation:run
```

Record the emitted `<run-id>`. Expected: `24` treatment plus `24` control trials persisted privately. Missing/infrastructure/unknown trials remain failures; rerun as a new run rather than deleting failed trials from the denominator.

- [ ] **Step 6: Create and complete blind review**

```bash
bun run evaluate:generation:blind -- --run-id <run-id>
```

The product owner reviews all 24 randomized pairs, answers relative preference and absolute readiness for both sides, then saves `preferences.json` into the run’s private `blind/` directory.

- [ ] **Step 7: Produce the V4 release report**

```bash
bun run evaluate:generation:report -- \
  --results .data/generation-evaluation/<run-id>/trials.json \
  --preferences .data/generation-evaluation/<run-id>/blind/preferences.json
```

Expected: exit `0`, `release.pass: true`, exactly 24 completed treatment trials, all conjunctive metrics passing.

- [ ] **Step 8: Inspect diversity and evidence manually**

Check every treatment mobile/desktop pair. Confirm all five kits appear, at least two multi-route cases work, no route-level composition pattern exceeds 50% of treatment routes, no category has hidden repeat failure, and no reference/customer identity leaked.

- [ ] **Step 9: Write release authority and record the checkpoint**

After every threshold passes, update `config/professional-site-quality-release.json` with `approved: true`, the requested `default-combo` ID, sorted unique observed writer/correction IDs in the writer set plus critic served-model IDs in the critic set, exact prompt/kit/evaluator/corpus versions, aggregate calibration metrics, benchmark run ID, 24 completed trials, readiness/preference rates, and owner approval timestamp. Parse it with `ProfessionalSiteReleaseManifestV1`; expected: selection eligibility passes.

Create a sanitized dated audit only with the same version IDs, model IDs, run ID, aggregate counts/rates/timings, pass/fail, and owner approval. Never include screenshots, prompts, contacts, business copy, mapping, or evidence URLs. Commit separately:

```bash
git add config/professional-site-quality-release.json docs/superpowers/audits/2026-08-15-professional-generation-release-audit.md
git commit -m "docs(generation): record professional quality evidence"
```

If execution occurs on a later date, use that actual date in the audit filename and `git add` command. Do not create an empty audit before evidence exists.

---

### Task 13: Integrate V3 Selection, Proof Persistence, and Sanitized Observability

**Prerequisite:** Task 12 calibration evaluator and V4 release report both exit `0`; product-owner aggregate approval is recorded.

**Files:**
- Modify: `src/lib/projects/build-attempt-worker.ts`
- Modify: `src/lib/projects/build-attempt-worker.batched.test.ts`
- Modify: `src/lib/projects/generated-starter.ts`
- Modify: `src/lib/projects/generated-source.test.ts`
- Modify: `src/lib/projects/generation-observability.ts`
- Modify: `src/lib/projects/generation-observability.test.ts`
- Modify: `src/lib/projects/resolve-generate-mode.ts` / `.test.ts` only if app-kind dispatch needs an explicit V3 name

**Interfaces:**

```ts
export type GeneratedSourceQualityProof =
  | GeneratedSiteQualityProofV1
  | GeneratedSiteQualityProofV2
  | GeneratedSiteQualityProofV3;
```

Sanitized telemetry adds:

```ts
professionalPromptVersion?: string;
professionalVisualStatus?: string;
professionalMinimumRating?: number;
professionalAverageRating?: number;
professionalUnknownReason?: string | null;
writerRequestedModel?: string;
writerServedModel?: string;
criticRequestedModel?: string;
criticServedModel?: string;
factFailures?: number;
actionFailures?: number;
mediaFailures?: number;
accessibilityFailures?: number;
routeFailures?: number;
contractFailures?: number;
routeCount?: number;
blueprintVersion?: number;
```

- [ ] **Step 1: Write failing worker-selection tests**

Assert:

- accepted `landing`/`marketing_site` dispatches `runProfessionalSitePipeline()`;
- `interactive_app` stays on existing path;
- V3 `ok: true` files become the source candidate;
- V3 fail/unknown/infrastructure leaves last-known-good selected and fails the attempt honestly;
- blocked/unmatched release manifest, requested-model mismatch, or uncalibrated writer/critic served ID fails closed and preserves last-known-good;
- no V2 fallback or second writer runs after V3 failure;
- no generated workspace edit occurs;
- source/build/deployment selection changes only after sanitized V3 pass;
- call ledger and requested/served model-authority values persist unchanged.

- [ ] **Step 2: Write failing metadata/observability tests**

Assert V1/V2/V3 proof union round-trips. Verify sanitized V3 fields survive while contract, blueprint prose, plan prose, owner copy, CTA target, prompt, screenshot/evidence refs, and URLs are absent.

- [ ] **Step 3: Run tests and verify RED**

```bash
bun test src/lib/projects/build-attempt-worker.batched.test.ts src/lib/projects/generated-source.test.ts src/lib/projects/generation-observability.test.ts
```

Expected: FAIL because worker/persistence do not recognize V3.

- [ ] **Step 4: Integrate the V3 pipeline at one worker boundary**

Keep worker authority for leases, charging, build rows, snapshots, artifacts, project selection, progress, and terminal transactions. The V3 pipeline owns only contract/blueprint/writer/gates/review/proof.

Delete or bypass the duplicate V2 replacement generation for supported app kinds after V3 is enabled. Do not run V2 and V3 in the same paid attempt. Keep deterministic control available only through explicit rollback policy, not silent success fallback.

- [ ] **Step 5: Persist V3 proof and telemetry**

Sanitize proof before metadata persistence. Emit model IDs, counts, versions, and timings only. Preserve historical readers.

- [ ] **Step 6: Run focused tests, full check, and build**

```bash
bun test src/lib/projects/build-attempt-worker.batched.test.ts src/lib/projects/generated-source.test.ts src/lib/projects/generation-observability.test.ts src/lib/projects/professional-site-*.test.ts
bun run check
bun run build
```

Expected: all commands exit `0`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/projects/build-attempt-worker.ts src/lib/projects/build-attempt-worker.batched.test.ts src/lib/projects/generated-starter.ts src/lib/projects/generated-source.test.ts src/lib/projects/generation-observability.ts src/lib/projects/generation-observability.test.ts src/lib/projects/resolve-generate-mode.ts src/lib/projects/resolve-generate-mode.test.ts
git commit -m "feat(generation): select professionally qualified sites"
```

Omit unchanged optional files from `git add`.

---

### Task 14: Regenerate Butik Senja Through the Engine and Review Real Evidence

**Files:**
- No generated workspace files may be edited manually.
- Project: `cmss98mi8000c4lveqqui7scy`.

**Interfaces:**
- Consumes: approved `ProfessionalSiteReleaseManifestV1`, the existing accepted Butik Senja handoff, and the normal generate API/queue path.
- Produces: one terminal attempt/build pair, private mobile/desktop Browser V2 evidence, and a persisted `GeneratedSiteQualityProofV3`; no tracked generated source.

- [ ] **Step 1: Verify state and one healthy worker**

Read `dev.log` by project ID, inspect attempt/build rows, confirm accepted handoff/hash, current selected source, and last-known-good build. Confirm one worker processes the retry. Do not print secrets or owner-private fields.

- [ ] **Step 2: Trigger one normal bounded retry**

Use the existing API/queue retry path for the same project ID. Do not recreate the project, switch models, patch generated files, or manually copy prior source. Record attempt/build IDs.

- [ ] **Step 3: Require terminal V3 qualification**

Proof must show:

```text
response=pass
source=pass
build=pass
browser=pass
professionalVisual=pass
outcome=pass
writerCalls=1
criticCalls=1
correctionCalls<=1
all hard failures=0
minimum professional rating>=3
```

- [ ] **Step 4: Inspect mobile and desktop screenshots**

Explicitly verify:

- supporting text is readable;
- no placeholder-like product rectangle;
- whitespace has purposeful rhythm rather than dead space;
- no generic side accent bars or repetitive scaffold markers;
- right-column content is legible and meaningful;
- business, offer, and WhatsApp action are clear in first view;
- CTA resolves to the accepted target;
- meaningful graphic/SVG or complete image-free composition;
- mobile order and CTA remain intentional;
- preview readiness, thumbnail, and media surfaces remain valid.

If any criterion fails despite V3 pass, stop rollout, add the screenshot as private calibration evidence, fix the evaluator/contract rather than manually editing Butik Senja, increment the affected evaluator version, and rerun Tasks 8-12.

- [ ] **Step 5: Verify failure safety**

If the attempt fails, confirm selected source/build/deployment remains the prior last-known-good version. Report the exact failure class; do not claim regeneration success.

- [ ] **Step 6: Run final local checks**

```bash
bun run check
```

Run `bun run build` again only if Task 14 required tracked build/orchestration changes.

---

### Task 15: Push `dev`, Watch CI, Release `main`, Watch CI

**Prerequisite:** Task 14 has fresh passing V3 evidence and `bun run check` exits `0`.

**Files:**
- No additional source expected unless CI exposes a real defect.

**Interfaces:**
- Consumes: clean verified `dev` with passing V3 real evidence.
- Produces: matching released commits on `origin/dev` and `origin/main`, both with green Quality workflows, then a clean local `dev`.

- [ ] **Step 1: Inspect repository cleanliness**

```bash
git status --short --untracked-files=all
git diff --check
git log --oneline --decorate -15
```

Confirm no `.data`, `.env`, logs, screenshots, `.firecrawl`, `.pi`, `graphify-out`, `storybook-static`, private labels, or generated workspaces are tracked/staged.

- [ ] **Step 2: Run final verification**

```bash
bun run check
bun run build
```

Expected: both exit `0` because production orchestration changed in Task 13.

- [ ] **Step 3: Push `dev` and block on CI**

Follow `.agents/skills/push-dev/SKILL.md`. Push only after local gates pass:

```bash
git push origin dev
RUN_ID=$(gh run list --branch dev --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch "$RUN_ID" --exit-status
```

Require `Verify`, `Build`, `Storybook`, and `Integration` green. Chromatic may skip only when its token is unavailable by existing CI policy. Fix failures from logs; never bypass them.

- [ ] **Step 4: Release protected `main`**

Follow `.agents/skills/push-main/SKILL.md`:

```bash
git checkout main
git pull --ff-only origin main
git merge dev --no-edit
bun run check
git push origin main
RUN_ID=$(gh run list --branch main --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch "$RUN_ID" --exit-status
```

Require all main jobs green.

- [ ] **Step 5: Return to clean `dev`**

```bash
git checkout dev
git status --short --branch
git log -1 --oneline --decorate
```

Expected: clean `dev`; local/remote `dev` and released `main` point to the intended commit.

---

## Requirement-to-Task Traceability

| Spec requirement | Implemented by |
|---|---|
| Five executable kit families | Task 1 |
| Immutable V3 contract and professional blueprint | Task 2 |
| One bounded plan plus complete route files | Task 3 |
| Protected portable theme/font/router | Task 4 |
| One writer, no tools, compact prompt | Task 5 |
| Objective source gates plus non-blocking taste signals | Task 6 |
| Mobile/desktop Browser V2 evidence | Task 7 |
| Nine-category final visual review | Task 8 |
| Calibrated authority and sparse-minimalism protection | Tasks 8, 12 |
| V3 proof; unknown cannot pass | Task 9 |
| One pre-review shared correction; no post-review mutation | Task 9 |
| 12 cases × 2 trials; real failure counts | Task 10 |
| Relative preference plus absolute publish readiness | Task 10 |
| Two multi-route static-site cases | Task 10 |
| Canonical docs | Task 11 |
| Calibration and conjunctive release gate | Task 12 |
| Transactional worker selection and last-known-good | Task 13 |
| Butik Senja real regression | Task 14 |
| Local/CI/release verification | Task 15 |

## Byte Accounting

Every V3 source-size check uses UTF-8 bytes:

```ts
export function professionalEditableBytes(input: {
  plan: WriterDesignPlanV3;
  files: GeneratedProjectFile[];
}): number {
  return (
    Buffer.byteLength(JSON.stringify(input.plan), "utf8") +
    input.files.reduce(
      (total, file) => total + Buffer.byteLength(file.content, "utf8"),
      0,
    )
  );
}
```

Protocol tags and `<done>` summary are excluded. Single-page limit is `32 * 1024`; multi-route limit is `48 * 1024`. Use this helper in writer, proof, benchmark conversion, and tests so limits cannot drift.

## Execution Notes

- Tasks 1-11 may be implemented offline before production selection.
- Task 12 is a hard human/evidence gate. No agent may infer approval from unit tests.
- Task 13 begins only after Task 12 records passing calibration, benchmark, blind readiness, and owner approval.
- Task 14 uses the product engine only. Generated source is evidence, never a hand-edited implementation surface.
- Any threshold change, added model call, post-critic correction, provider switch, or route-cap increase requires a new dated design spec before code changes.
