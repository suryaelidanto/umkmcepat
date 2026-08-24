# Generated-Site Design Quality SOP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a contract-backed design-quality SOP, rendered contrast gate, honest visual-review semantics, and a fresh qualified Butik Senja generation without weakening the existing generation safety contract.

**Architecture:** Keep the selected kit as the stable taste boundary. Add a typed taste profile and page-strategy helper, reuse a pure source pre-flight for both initial output and correction output, make the browser subprocess measure actual text contrast, and preserve `visual: "unknown"` when the critic cannot produce a report. Generated workspaces remain engine output only.

**Tech Stack:** TypeScript, Vitest/Bun tests, Vite + React + Tailwind v4 generated sites, Playwright Core browser subprocess, Prisma/worker pipeline, Firecrawl research kept outside runtime.

## Global Constraints

- Keep `default-combo`; do not switch models for one failure.
- Preserve the last-known-good generated source when qualification fails.
- No manual edits to `.data/project-*`, generated routes, `.env`, secrets, or private evidence.
- No new runtime dependency; keep `bun.lock` canonical.
- No `any`, `as any`, `ts-ignore`, or unexplained lint suppression.
- Deterministic gates own facts, CTA targets, routes, contrast, overflow, touch targets, and protected files; model review cannot bypass them.
- User-facing generated copy remains Indonesian; code, diagnostics, and docs remain English.
- A single page is the default. A multi-page decision must come from accepted route jobs/content and must never be silently collapsed into `/`.

---

### Task 1: Add a typed taste profile and page-strategy decision

**Files:**
- Modify: `src/lib/projects/generated-site-design-kits/types.ts`
- Modify: `src/lib/projects/generated-site-design-kits/catalog.ts`
- Create: `src/lib/projects/generated-site-design-quality.ts`
- Test: `src/lib/projects/generated-site-design-quality.test.ts`
- Test: `src/lib/projects/generated-site-design-kits/catalog.test.ts`

**Interfaces:**
- `GeneratedSiteDesignKitV1.taste` is consumed by prompts, design plans, and visual review.
- `deriveGeneratedSitePageStrategy(input)` returns `{ mode: "single" | "multi"; reason: "single-primary-job" | "distinct-routes"; routeCount: number }`.
- `GeneratedSiteTasteProfile` contains `variance`, `motion`, `density`, `shape`, `typeGuidance`, and `signatureBudget: 1`.

- [ ] **Step 1: Write the failing tests**

Add tests that assert every catalog kit has bounded dials and that route strategy is conservative:

```ts
it("keeps every kit taste profile bounded and complete", () => {
  for (const kit of DESIGN_KITS.values()) {
    expect(kit.taste.variance).toBeGreaterThanOrEqual(1);
    expect(kit.taste.variance).toBeLessThanOrEqual(10);
    expect(kit.taste.motion).toBeGreaterThanOrEqual(1);
    expect(kit.taste.motion).toBeLessThanOrEqual(10);
    expect(kit.taste.density).toBeGreaterThanOrEqual(1);
    expect(kit.taste.density).toBeLessThanOrEqual(10);
    expect(kit.taste.signatureBudget).toBe(1);
    expect(kit.taste.typeGuidance.trim()).not.toBe("");
  }
});

it("keeps one primary job on one page", () => {
  expect(deriveGeneratedSitePageStrategy({
    obligations: { routes: [{ path: "/", purpose: "Beranda", requiredFactIds: [], requiredSectionIds: ["hero"] }] },
  } as GeneratedSiteWriterContractV2)).toEqual({
    mode: "single",
    reason: "single-primary-job",
    routeCount: 1,
  });
});

it("does not collapse distinct accepted routes into one page", () => {
  expect(deriveGeneratedSitePageStrategy({
    obligations: { routes: [
      { path: "/", purpose: "Beranda", requiredFactIds: [], requiredSectionIds: ["hero"] },
      { path: "/katalog", purpose: "Katalog", requiredFactIds: ["offer-1"], requiredSectionIds: ["catalog"] },
    ] },
  } as GeneratedSiteWriterContractV2).mode).toBe("multi");
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
bun test src/lib/projects/generated-site-design-quality.test.ts src/lib/projects/generated-site-design-kits/catalog.test.ts
```

Expected: FAIL because `taste` and `deriveGeneratedSitePageStrategy` do not exist.

- [ ] **Step 3: Add the minimal typed implementation**

Add these types and helper without model calls:

```ts
export type GeneratedSiteTasteProfile = {
  variance: number;
  motion: number;
  density: number;
  shape: "sharp" | "soft" | "pill";
  typeGuidance: string;
  signatureBudget: 1;
};

export type GeneratedSitePageStrategy = {
  mode: "single" | "multi";
  reason: "single-primary-job" | "distinct-routes";
  routeCount: number;
};

export function deriveGeneratedSitePageStrategy(input: {
  obligations: { routes: Array<{ path: string; purpose: string }> };
}): GeneratedSitePageStrategy {
  const routeCount = new Set(input.obligations.routes.map((route) => route.path)).size;
  return routeCount > 1
    ? { mode: "multi", reason: "distinct-routes", routeCount }
    : { mode: "single", reason: "single-primary-job", routeCount };
}
```

Add a `taste` object to each of the five catalog kits. Use restrained values for trust-first kits, keep motion at `2` unless the kit explicitly earns more, use one of the three shape languages consistently, and write a kit-specific `typeGuidance` sentence. Do not change existing kit IDs, patterns, contract hashes, or media modes.

- [ ] **Step 4: Run focused tests and lint**

Run:

```bash
bun test src/lib/projects/generated-site-design-quality.test.ts src/lib/projects/generated-site-design-kits/catalog.test.ts
bunx eslint src/lib/projects/generated-site-design-quality.ts src/lib/projects/generated-site-design-kits/types.ts src/lib/projects/generated-site-design-kits/catalog.ts --max-warnings=0
```

Expected: PASS with no lint warnings.

- [ ] **Step 5: Commit the isolated task**

```bash
git add src/lib/projects/generated-site-design-quality.ts src/lib/projects/generated-site-design-quality.test.ts src/lib/projects/generated-site-design-kits/types.ts src/lib/projects/generated-site-design-kits/catalog.ts src/lib/projects/generated-site-design-kits/catalog.test.ts
```

---

### Task 2: Carry taste into the platform-owned design plan and prompts

**Files:**
- Modify: `src/lib/projects/generated-site-design-plan.ts`
- Modify: `src/lib/projects/generated-site-design-plan.test.ts`
- Modify: `src/lib/projects/batched-response.ts`
- Modify: `src/lib/projects/batched-response.test.ts`
- Modify: `src/lib/projects/batched-generator.ts`
- Modify: `src/lib/projects/batched-prompt.ts`
- Modify: `src/lib/projects/batched-prompt.test.ts`

**Interfaces:**
- `WriterDesignPlanV2` gains `pageStrategy` and `taste` from the platform frame.
- Existing writer responses may omit the plan; the deterministic frame remains authoritative.
- The writer sees taste guidance but does not spend output tokens re-emitting `<design-plan>`.

- [ ] **Step 1: Write failing plan and prompt tests**

Extend the valid plan expectation with `pageStrategy: "single"` and the selected kit taste profile. Assert the default frame carries those values, candidate normalization cannot replace them, and the writer prompt contains:

```ts
expect(prompt.system).toContain("one deliberate signature");
expect(prompt.system).toContain("Never read site.theme in JSX");
expect(prompt.system).toContain("Do not repeat eyebrow or numbered-marker scaffolding");
expect(prompt.system).toContain("page strategy");
expect(prompt.system).toContain(kit.taste.typeGuidance);
```

Add a parser test proving a V2 plan candidate with a conflicting `pageStrategy` or `taste` is normalized back to the platform frame.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
bun test src/lib/projects/generated-site-design-plan.test.ts src/lib/projects/batched-response.test.ts src/lib/projects/batched-prompt.test.ts
```

Expected: FAIL on missing plan fields and missing taste instructions.

- [ ] **Step 3: Implement the frame and prompt changes**

Extend `WriterDesignPlanV2` with:

```ts
pageStrategy: "single" | "multi";
taste: GeneratedSiteTasteProfile;
```

Pass `pageStrategy` and `taste` through `deriveDefaultWriterDesignPlanV2`, `normalizeWriterDesignPlanV2Candidate`, and `parseWriterDesignPlanV2`. The expected platform values must win over candidate values. Update the two V2 call sites in `batched-generator.ts` to derive strategy from `contract.obligations.routes` and use `kit.taste`.

Add concise V2 prompt rules:

- read the business subject and audience before choosing composition;
- use the selected page strategy, dials, type guidance, shape language, and one signature;
- use semantic Tailwind tokens, never `site.theme` colors or inline palette CSS;
- no `h-screen`, em/en dash copy, repeated eyebrow/number scaffolding, duplicate CTA intent, or filler sections;
- keep the hero promise, supporting copy, and accepted CTA visible on mobile;
- a sparse brief must stay sparse; a rich brief must not be reduced to one empty card.

Add the same bounded rules to the correction prompt, without re-emitting a design plan.

- [ ] **Step 4: Run focused tests and lint**

```bash
bun test src/lib/projects/generated-site-design-plan.test.ts src/lib/projects/batched-response.test.ts src/lib/projects/batched-prompt.test.ts
bunx eslint src/lib/projects/generated-site-design-plan.ts src/lib/projects/batched-response.ts src/lib/projects/batched-generator.ts src/lib/projects/batched-prompt.ts --max-warnings=0
```

Expected: PASS.

- [ ] **Step 5: Commit the isolated task**

```bash
git add src/lib/projects/generated-site-design-plan.ts src/lib/projects/generated-site-design-plan.test.ts src/lib/projects/batched-response.ts src/lib/projects/batched-response.test.ts src/lib/projects/batched-generator.ts src/lib/projects/batched-prompt.ts src/lib/projects/batched-prompt.test.ts
```

---

### Task 3: Enforce source taste pre-flight for both writer and correction output

**Files:**
- Modify: `src/lib/projects/generated-site-gates.ts`
- Modify: `src/lib/projects/generated-site-gates.test.ts`
- Modify: `src/lib/projects/batched-generator.ts`

**Interfaces:**
- Add `inspectGeneratedSiteTasteSource(input)` to return only deterministic taste findings for source text and section count.
- `inspectReferenceCalibratedSiteSource` includes those findings.
- `runGeneratedSiteCorrection` rejects a replacement that reintroduces a blocking taste violation.

- [ ] **Step 1: Write failing gate tests**

Add one test per deterministic violation:

```ts
it.each([
  ["uses h-screen", "<main className=\"h-screen\">ok</main>", "viewport-stability"],
  ["uses an em dash", "<p>Jelas — cepat</p>", "llm-dash-tell"],
  ["repeats eyebrow scaffolding", '<p className="uppercase tracking-wide">A</p>'.repeat(3), "eyebrow-overuse"],
  ["uses numbered eyebrow scaffolding", "<p>01</p><p>02</p><p>03</p>", "numbered-scaffolding"],
])("rejects taste tell: %s", (_name, source, code) => {
  expect(inspectGeneratedSiteTasteSource({ source, sectionCount: 3 })).toEqual(
    expect.arrayContaining([expect.objectContaining({ code })]),
  );
});
```

Add a passing fixture with one concise label, semantic tokens, `min-h-dvh`, and no decorative numbering.

- [ ] **Step 2: Run the focused gate test and verify RED**

```bash
bun test src/lib/projects/generated-site-gates.test.ts
```

Expected: FAIL because the taste helper and findings do not exist.

- [ ] **Step 3: Implement bounded deterministic findings**

Implement `inspectGeneratedSiteTasteSource` with these rules:

- `h-screen` → high `viewport-stability`;
- em dash or en dash in visible source → high `llm-dash-tell`;
- small uppercase/tracking eyebrow markers above the allowed `ceil(sectionCount / 3)` cadence → high `eyebrow-overuse`;
- three or more visible `01`/`02`/`03`-style markers without a real process signal → high `numbered-scaffolding`;
- heading classes containing `font-mono` → medium `technical-display-type`;
- direct `site.theme.<role>` or color-bearing inline style → high `compiled-theme-bypass`.

Keep findings deterministic and explainable. Do not reject a valid business-specific layout merely because it is asymmetric or uses one intentional label.

Reuse the helper in `inspectReferenceCalibratedSiteSource`. In `runGeneratedSiteCorrection`, inspect normalized replacement source and throw the same diagnostic before returning replacements if any high/critical helper finding remains.

- [ ] **Step 4: Run tests and lint**

```bash
bun test src/lib/projects/generated-site-gates.test.ts src/lib/projects/batched-generator.test.ts
bunx eslint src/lib/projects/generated-site-gates.ts src/lib/projects/batched-generator.ts --max-warnings=0
```

Expected: PASS.

- [ ] **Step 5: Commit the isolated task**

```bash
git add src/lib/projects/generated-site-gates.ts src/lib/projects/generated-site-gates.test.ts src/lib/projects/batched-generator.ts
```

---

### Task 4: Make rendered contrast a real browser gate

**Files:**
- Create: `scripts/generated-site-contrast.cjs`
- Create: `scripts/generated-site-contrast.test.cjs`
- Modify: `scripts/qualify-generated-site.cjs`
- Modify: `src/lib/projects/browser-gates.test.ts`

**Interfaces:**
- `scripts/generated-site-contrast.cjs` exports `parseCssColor`, `contrastRatio`, `minimumForText`, and `findContrastFailures` for the browser subprocess and direct tests.
- Browser output keeps assertion name `computed-contrast` and includes failing element details.

- [ ] **Step 1: Write failing pure contrast tests**

Create CommonJS tests:

```js
const assert = require("node:assert/strict");
const test = require("node:test");
const { contrastRatio, minimumForText } = require("./generated-site-contrast.cjs");

test("dark body text on warm background passes AA", () => {
  assert.ok(contrastRatio("#3d2b1f", "#f7f3ec") >= 4.5);
});

test("light muted text on warm background fails AA", () => {
  assert.ok(contrastRatio("#e5ddd2", "#f7f3ec") < 4.5);
});

test("large text uses the 3:1 threshold", () => {
  assert.equal(minimumForText({ fontSize: "24px", fontWeight: "400" }), 3);
});
```

- [ ] **Step 2: Run the pure tests and verify RED**

```bash
bun test scripts/generated-site-contrast.test.cjs
```

Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Implement contrast calculation and DOM inspection**

Implement CSS `rgb(...)`, `rgba(...)`, and hex parsing; calculate WCAG relative luminance and ratio; resolve transparent ancestor backgrounds; classify normal versus large/bold text; and return at most five concise failure details.

In `qualify-generated-site.cjs`, inspect visible text-bearing elements (`h1`-`h6`, `p`, `a`, `button`, `label`, `li`, and elements with direct text nodes), skip `aria-hidden` and unsupported image/gradient backgrounds, and set `computed-contrast` to fail when any measured element is below its threshold. Preserve the existing body color/background check as a fallback, and include the failures in the assertion detail.

- [ ] **Step 4: Run tests and the browser-report unit suite**

```bash
bun test scripts/generated-site-contrast.test.cjs src/lib/projects/browser-gates.test.ts src/lib/projects/generated-site-browser-runner.test.ts
bunx eslint scripts/qualify-generated-site.cjs --max-warnings=0
```

Expected: PASS.

- [ ] **Step 5: Commit the isolated task**

```bash
git add scripts/generated-site-contrast.cjs scripts/generated-site-contrast.test.cjs scripts/qualify-generated-site.cjs src/lib/projects/browser-gates.test.ts
```

---

### Task 5: Preserve honest visual-unknown quality proof semantics

**Files:**
- Modify: `src/lib/projects/visual-critic.ts`
- Modify: `src/lib/projects/visual-critic.test.ts`
- Modify: `src/lib/projects/generated-site-pipeline.ts`
- Modify: `src/lib/projects/generated-site-pipeline.test.ts`
- Modify: `src/lib/projects/generated-site-quality-proof.ts`
- Modify: `src/lib/projects/generated-site-quality-proof.test.ts`

**Interfaces:**
- `runGeneratedSiteVisualReview` returns `status: "unknown"` for malformed, empty, or transport-failed V2 critic output without retrying.
- Pipeline accepts deterministic response/source/build/browser pass plus visual unknown and sets `outcome: "pass"`, while preserving `gates.visual = "unknown"`.
- Sanitization rejects visual fail and critical/high findings even when other gates pass.

- [ ] **Step 1: Write failing tests**

Change the V2 malformed-output test to expect `unknown`, add a transport rejection test, and add quality-proof tests:

```ts
it("accepts deterministic gates with an unknown visual critic", () => {
  const proof = createEmptyGeneratedSiteQualityProofV2({
    contractHash: "a".repeat(64),
    planHash: "b".repeat(64),
    kitId: "warm-commerce",
    mediaMode: "graphic",
  });
  expect(
    sanitizeGeneratedSiteQualityProofV2({
      ...proof,
      outcome: "pass",
      gates: {
        response: "pass",
        source: "pass",
        build: "pass",
        browser: "pass",
        visual: "unknown",
      },
    }).gates.visual,
  ).toBe("unknown");
});
```

Keep the existing incomplete-gate failure test and add a visual-fail failure case.

- [ ] **Step 2: Run focused tests and verify RED**

```bash
bun test src/lib/projects/visual-critic.test.ts src/lib/projects/generated-site-pipeline.test.ts src/lib/projects/generated-site-quality-proof.test.ts
```

Expected: FAIL on current unavailable status and proof sanitizer requiring every gate to be pass.

- [ ] **Step 3: Implement the smallest semantic change**

Return `unknown` in `runGeneratedSiteVisualReview` when parsing fails or the call throws. Do not change `runShadowCritic` legacy semantics. Keep the V2 critic call count at one.

Retain the pipeline's existing unknown branch, ensure its proof has `outcome: "pass"` and `gates.visual: "unknown"`, and update `sanitizeGeneratedSiteQualityProofV2` so deterministic gates must be pass while visual may be pass or unknown. Critical/high visual findings must still reject pass.

- [ ] **Step 4: Run focused tests and lint**

```bash
bun test src/lib/projects/visual-critic.test.ts src/lib/projects/generated-site-pipeline.test.ts src/lib/projects/generated-site-quality-proof.test.ts
bunx eslint src/lib/projects/visual-critic.ts src/lib/projects/generated-site-pipeline.ts src/lib/projects/generated-site-quality-proof.ts --max-warnings=0
```

Expected: PASS.

- [ ] **Step 5: Commit the isolated task**

```bash
git add src/lib/projects/visual-critic.ts src/lib/projects/visual-critic.test.ts src/lib/projects/generated-site-pipeline.ts src/lib/projects/generated-site-pipeline.test.ts src/lib/projects/generated-site-quality-proof.ts src/lib/projects/generated-site-quality-proof.test.ts
```

---

### Task 6: Publish the SOP and run repository verification

**Files:**
- Modify: `src/lib/projects/skills/design-quality.md`
- Modify: `DEV.md` only if the final verification workflow changes

**Interfaces:**
- The guide documents the same page strategy, taste dials, type/shape rules, deterministic gates, critic semantics, and UMKM trust overrides implemented in Tasks 1-5.

- [ ] **Step 1: Replace the short guide with the canonical compact SOP**

Document the design read, page strategy, dial defaults, typography review questions, one-signature rule, mobile/contrast checklist, anti-patterns, and the rule that research references calibrate taste but are never copied into generated facts/assets/identity. Include the source URLs as references and keep it under 250 lines so future agents can actually read it.

- [ ] **Step 2: Run formatting and focused checks**

```bash
bunx prettier --write src/lib/projects/skills/design-quality.md
bun run check
```

Expected: `bun run check` exits 0. If the known Bun/Vitest `vi.hoisted` incompatibility remains, isolate it with the nearest focused test, fix it without weakening tests, and rerun `bun run check`.

- [ ] **Step 3: Review the full diff and commit only intended files**

```bash
git status --short
git diff --check
git diff --stat
```

Confirm the prior recovery changes remain intact, no `.data`, `.env`, logs, screenshots, or `.firecrawl` files are staged, then:

```bash
git add src/lib/projects/skills/design-quality.md
```

---

### Task 7: Fresh engine generation and release verification

**Files:**
- No generated workspace files may be edited manually.
- Use the existing retry script or API request only to create a new attempt for `cmss98mi8000c4lveqqui7scy`.

- [ ] **Step 1: Verify the worker and project state before retrying**

Inspect the database attempt/build records, `dev.log`, and current project workspace. Confirm the accepted handoff and last-known-good source remain present. Confirm only one healthy worker is processing the retry.

- [ ] **Step 2: Trigger one bounded engine retry**

Use the existing project retry path with the same project ID and no project recreation, model switch, or generated-source patch. Record the new attempt/build IDs and wait for terminal status.

- [ ] **Step 3: Inspect qualification evidence**

Require all of:

- response/source/build pass;
- browser pass on mobile `390×844` and desktop `1440×1000`;
- `computed-contrast` pass with no measured failures;
- screenshot review showing readable type, a specific signature, useful density, no repeated scaffolding, and an obvious Indonesian CTA;
- preview readiness and `/media/<id>`/thumbnail surfaces unchanged or valid where applicable;
- last-known-good source retained on any failed candidate.

- [ ] **Step 4: Run final local verification**

```bash
bun run check
```

Run the nearest focused tests again if any generation fix was needed. Do not run `bun run build` unless a build/deployment file was touched.

- [ ] **Step 5: Push `dev` and block on CI**

Follow `@.agents/skills/push-dev`: stage only intended source/tests/docs, make a Conventional Commit if needed, push `origin dev`, and run:

```bash
RUN_ID=$(gh run list --branch dev --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch "$RUN_ID" --exit-status
```

Fix any failure using the CI log before continuing.

- [ ] **Step 6: Release protected `main`**

Follow `@.agents/skills/push-main`: checkout/update `main`, merge `dev`, run `bun run check`, push `origin main`, block on the `main` CI run until `Verify`, `Build`, `Storybook`, and `Integration` are green, then return to `dev`.
