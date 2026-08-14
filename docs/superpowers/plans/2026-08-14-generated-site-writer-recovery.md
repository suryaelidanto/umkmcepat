# Generated-Site Writer Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the reference-calibrated writer emit a complete bounded response by disabling provider-side reasoning correctly and reducing prompt waste, then qualify the real accepted project through all hard gates.

**Architecture:** Keep the existing one-writer/one-critic/one-shared-correction pipeline. Extend the shared AI option helper with the installed OpenAI-compatible provider option so 9Router forwards `reasoning_effort: "none"`. Compact only the reference-calibrated V2 writer prompt. Retain deterministic design-plan framing and honest failure for incomplete source.

**Tech Stack:** Bun, TypeScript, Vitest, AI SDK `streamText`, 9Router OpenAI-compatible adapter, Vite, Playwright browser gates.

## Global Constraints

- One writer call, one critic call, at most one shared correction.
- No hidden retry, model-native tool, fallback success, fabricated content, or placeholder media.
- No `any`, `as any`, `ts-ignore`, new dependency, `.env` change, secret logging, or live artifact commit.
- User-facing copy stays Indonesian; code/docs/tests stay English.
- Existing dirty files not related to this recovery remain untouched.
- `bun run check` is mandatory before completion.
- No long automated E2E/browser/critic run is required; owner performs final manual project verification.

---

### Task 1: Lock provider-aware reasoning behavior

**Files:**
- Modify: `src/lib/ai.ts`
- Test: `src/lib/ai.test.ts`
- Modify: `DEV.md` only if the helper's operator behavior needs a note; current docs already call the option best-effort.

**Interfaces:**
- Produces `getNoReasoningCallOptions()` returning the existing top-level `{ reasoning: "none" }` plus `providerOptions["9router"].reasoningEffort = "none"`.

- [ ] **Step 1: Write the failing test**

Add a second assertion to the existing helper test:

```ts
it("sets the 9Router provider reasoning effort to none", () => {
  expect(getNoReasoningCallOptions()).toMatchObject({
    providerOptions: { "9router": { reasoningEffort: "none" } },
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

```bash
bunx vitest run --project unit src/lib/ai.test.ts
```

Expected: the existing test passes; the new test fails because `providerOptions` is absent.

- [ ] **Step 3: Implement the smallest fix**

Change the helper return value to:

```ts
return {
  reasoning: "none" as const,
  providerOptions: {
    "9router": { reasoningEffort: "none" },
  },
};
```

Keep the existing best-effort comment and do not change call sites.

- [ ] **Step 4: Run the focused test and verify GREEN**

```bash
bunx vitest run --project unit src/lib/ai.test.ts
```

Expected: all tests in the file pass.

- [ ] **Step 5: Format and lint the changed files**

```bash
bunx prettier --write src/lib/ai.ts src/lib/ai.test.ts
bunx eslint src/lib/ai.ts src/lib/ai.test.ts --max-warnings=0
```

Expected: exit `0`.

---

### Task 2: Add a regression test for complete response boundaries

**Files:**
- Test: `src/lib/projects/batched-generator.test.ts`

**Interfaces:**
- Uses the existing `streamTextMock` and `writerStream` helpers.
- No production behavior added in this task.

- [ ] **Step 1: Add the failing test**

Add a test in `runReferenceCalibratedGenerate` using the existing valid contract fixture. Return a response with one valid `<file>` and no `<done>`; assert the result is an honest failure and the reason mentions the done marker:

```ts
it("fails an incomplete writer response without a done marker", async () => {
  streamTextMock.mockReturnValueOnce(
    writerStream(
      '<file path="src/routes/index.tsx">export function HomeRouteComponent() { return null; }</file>',
    ),
  );

  const result = await runReferenceCalibratedGenerate({
    ...baseArgs(),
    schema: createProjectSiteSchemaFromBrief(makeBrief()),
    brief: makeBrief(),
    contract: contractFixture(),
    kit: selectGeneratedSiteDesignKit({
      archetype: "generic",
      density: "sparse",
      mediaMode: "graphic",
      primaryJobKind: "inquire",
      hasOperationalDetails: false,
    }),
    budget: new GeneratedSiteCallBudget(),
    stepCharger: makeCharger(),
  });

  expect(result.ok).toBe(false);
  expect(result.ok ? "" : result.reason).toMatch(/done marker/i);
});
```

Use the existing test's inline contract fixture extraction or a minimal local helper; do not add a production fixture abstraction for one test.

- [ ] **Step 2: Run the focused test and verify RED**

```bash
bunx vitest run --project unit src/lib/projects/batched-generator.test.ts -t "incomplete writer response"
```

Expected: FAIL if the current reason does not explicitly identify the missing done marker. If it already fails with the expected message, keep the test as the regression and continue.

- [ ] **Step 3: Make the error text explicit only if needed**

Use the existing branch in `runReferenceCalibratedGenerate` and change only its fallback reason to:

```ts
"reference-calibrated writer omitted the design plan, editable files, or done marker"
```

Do not turn the result into success.

- [ ] **Step 4: Run the focused test and verify GREEN**

```bash
bunx vitest run --project unit src/lib/projects/batched-generator.test.ts -t "incomplete writer response"
```

Expected: PASS.

---

### Task 3: Compact the reference-calibrated writer prompt

**Files:**
- Modify: `src/lib/projects/batched-prompt.ts`
- Test: `src/lib/projects/batched-prompt.test.ts`

**Interfaces:**
- Keep `buildReferenceCalibratedWriterPrompt(input)` signature unchanged.
- Keep `buildReferenceCalibratedCorrectionPrompt` unchanged except formatting if Prettier requires it.

- [ ] **Step 1: Add a prompt-size regression test**

Extend the existing writer prompt test:

```ts
it("keeps the V2 writer instruction compact", () => {
  const kit = selectGeneratedSiteDesignKit({
    archetype: "generic",
    density: "sparse",
    mediaMode: "graphic",
    primaryJobKind: "inquire",
    hasOperationalDetails: false,
  });
  const prompt = buildReferenceCalibratedWriterPrompt({
    contract: writerContract(),
    kit,
    projectId: "benchmark-project",
    schema: {} as never,
  });

  expect(prompt.system.length + prompt.user.length).toBeLessThan(12_000);
  expect(prompt.system).toContain("<done summary=\"...\" />");
  expect(prompt.system).toContain("src/routes/index.tsx");
  expect(prompt.system).not.toContain("FEW-SHOT");
});
```

- [ ] **Step 2: Run the focused test and verify RED**

```bash
bunx vitest run --project unit src/lib/projects/batched-prompt.test.ts -t "compact"
```

Expected: FAIL because the current V2 prompt exceeds the compact bound or contains redundant large instructions.

- [ ] **Step 3: Replace only the V2 `system` prompt body**

Retain the immutable contract JSON, kit JSON, response tags, and required paths. Replace the current long V2 rules with this compact body:

```ts
const writablePaths = [
  "src/routes/index.tsx",
  "src/components/site/sections.tsx",
];
const system = `You are a senior Indonesian landing-page designer and React writer. Emit one complete standalone customer site. Visible copy is natural Indonesian; code and comments are English. Use the selected executable kit, never a generic template.

IMMUTABLE CONTRACT:
${JSON.stringify(input.contract)}

EXECUTABLE KIT:
${JSON.stringify({
  id: input.kit.id,
  version: input.kit.version,
  patterns: input.kit.compositionPatterns,
  typography: input.kit.typography,
  sourceAssertions: input.kit.sourceAssertions,
  antiPatterns: input.kit.antiPatterns,
})}

OUTPUT — emit no reasoning, prose, markdown, tools, or unknown tags:
<design-plan>{JSON plan matching the contract and kit}</design-plan>
<file path="src/routes/index.tsx">complete raw TSX; emit this first</file>
<file path="src/components/site/sections.tsx">complete raw TSX only when needed</file>
<done summary="..." />

Rules:
- Writable paths only: ${writablePaths.join(", ")}.
- Emit one design-plan, then complete files, then exactly one done marker. Never omit done.
- Compose seeded @/components/site/layout primitives; do not rewrite them.
- Render every populated contract fact visibly. Never invent facts, claims, prices, contacts, routes, assets, or actions.
- Preserve accepted CTA target, media mode, section IDs, kit identity, and semantic theme tokens.
- No placeholders or remote URLs when media mode is graphic/typographic. No raw hex classes. All actions are accessible and at least 44px tall.
- Keep editable file count ≤3 and editable content ≤32 KiB. Finish immediately after done.
`;
```

Keep the user message short:

```ts
const user = `Build the accepted Indonesian ${input.contract.page?.appKind ?? "landing"} now. Read owner facts from @/content/site; do not duplicate them in invented arrays. Project key: ${input.projectId}.`;
```

Use the actual available V2 contract fields; do not reference `contract.page` if the V2 type does not contain it. Use a literal `landing/marketing site` phrase or `input.contract.business.name` only.

- [ ] **Step 4: Run focused prompt tests**

```bash
bunx vitest run --project unit src/lib/projects/batched-prompt.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run formatting and typecheck for the touched prompt**

```bash
bunx prettier --write src/lib/projects/batched-prompt.ts src/lib/projects/batched-prompt.test.ts
bunx eslint src/lib/projects/batched-prompt.ts src/lib/projects/batched-prompt.test.ts --max-warnings=0
```

Expected: exit `0`.

---

### Task 4: Verify provider request and fast local boundaries

**Files:**
- No new production files.
- Runtime evidence only: `/tmp/umkm-writer-raw.txt` and ignored `.data` artifacts; do not commit them.

**Interfaces:**
- Existing `getNoReasoningCallOptions()` flows through `runOneStreamedResponse` to `streamText`.
- Existing accepted handoff: project `cmss98mi8000c4lveqqui7scy`.

- [ ] **Step 1: Run the full local gate**

```bash
bun run check
```

Expected: all `check:parallel` rows show `✓`; exit `0`.

- [ ] **Step 2: Run focused tests only**

```bash
bunx vitest run --project unit src/lib/ai.test.ts src/lib/projects/batched-prompt.test.ts src/lib/projects/batched-response.test.ts src/lib/projects/generated-site-design-plan.test.ts src/lib/projects/generated-site-gates.test.ts src/lib/projects/canonical-brief.test.ts src/lib/projects/build-contract.test.ts
```

Expected: focused tests pass quickly. Do not run browser, critic, benchmark, or full E2E here; the owner will manually verify the project.

- [ ] **Step 3: If a focused test fails, inspect that exact boundary and make one minimal fix**

Inspect only non-secret evidence:

```bash
docker compose logs --since=10m 9router | tail -120
bun --env-file=.env -e '/* print only model/phase/token counts from AiCallRecord */'
```

If `reasoning_effort` is visibly forwarded and output still reaches the cap, reduce the V2 prompt JSON further or use the configured build model only if an existing admin setting already selects it. Do not add another retry or model path.

- [ ] **Step 4: Run the complete gate again after any single change**

```bash
bun run check
```

Expected: exit `0`.

---

### Task 5: Documentation and final diff audit

**Files:**
- Modify: `DEV.md` only if provider-specific reasoning behavior is not already documented.
- Review: `docs/superpowers/specs/2026-08-14-generated-site-writer-recovery-design.md`
- Review: `docs/superpowers/plans/2026-08-14-generated-site-writer-recovery.md`

- [ ] **Step 1: Self-review docs**

```bash
rg -n "TODO|TBD|N/A|placeholder" docs/superpowers/specs/2026-08-14-generated-site-writer-recovery-design.md docs/superpowers/plans/2026-08-14-generated-site-writer-recovery.md
```

Expected: no unfinished requirements.

- [ ] **Step 2: Audit repository state**

```bash
git diff --check
git status --short --untracked-files=all
git diff --stat
```

Expected: no whitespace errors; only intended recovery files plus previously dirty handoff files; no `.env`, logs, screenshots, `.data`, or secrets.

- [ ] **Step 3: Final verification**

```bash
bun run check
```

Expected: exit `0`. Claim completion only if the real smoke test also passed.
