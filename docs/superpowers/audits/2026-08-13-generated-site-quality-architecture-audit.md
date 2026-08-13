# Generated-Site Quality Architecture Audit

**Date:** 2026-08-13  
**Status:** Complete architecture audit; no production implementation performed  
**Graph baseline:** `f2cab3ae`, 3,698 nodes, 8,977 edges, 228 communities  
**Scope:** First-generation landing and marketing sites, their source writer, design inputs, qualification, and evaluation  
**Evidence policy:** Preserved `.data` workspaces were inspected read-only. Temporary screenshots and rebuilds stayed outside git.

## Executive conclusion

The visual regression is not caused by streamed response text or `<file>` serialization. It is caused by replacing the creative writer on accepted landing/marketing builds with one fixed platform renderer while leaving recipe, example, design-plan, theme, risk, and critic structures in place as mostly non-executing metadata.

The current path is fast and technically dependable because it does almost no design work. The final Aisyah deterministic attempt reached ready in 7.199 seconds, with 31 ms recorded as writer time and 5.751 seconds as Vite time. The user rejected that visual result as gallery item 33. Earlier AI-driven Aisyah attempts spent 374–459 seconds in the writer and still failed. The next architecture therefore must occupy the Pareto space between those extremes:

- keep the current response-text parser, locked scaffold, fact contract, build, browser, artifact, and last-known-good safety;
- restore one bounded creative writer response grounded by executable design kits;
- run exactly one mandatory visual review in the normal path;
- share one correction budget across transport, source, build, browser, and eligible visual findings;
- benchmark against the product owner's approved visual labels before rollout.

Do not restore the deleted open-ended `ToolLoopAgent` path. Do not keep the fixed route as the primary quality path.

## Evidence base

### Preserved gallery inventory

The read-only recovery found 39 historical route variants:

- 34 produced a browser capture;
- 33 produced visible pages;
- 1 rendered blank with a runtime error;
- 5 could not produce a viable temporary build.

The product owner supplied the authoritative binary label:

- **Accepted/working:** 01, 02, 03, 04, 07.
- **Broken:** every other visible item, 05–06 and 08–33.
- The blank and five non-buildable variants are also technical negatives.

That yields 5 positive and 34 negative route-level examples. These are visual/working labels, not factual or release certifications. Some accepted references contain placeholder treatment, invented operational copy, or English CTA text that would fail the current factual and copy contract. Only their visual decisions may be learned.

### Positive-reference fingerprints

| Gallery | Route SHA-256 | Desktop SHA-256 | Mobile SHA-256 | Evidence role |
|---|---|---|---|---|
| 01 | `1bc1bffc881e51d2a3f7546b3ef2a896c6fc0bc2d6bb9c3a0c3eb0874590f50f` | `db10c44f75eaddaecb78d9781a1a53242b7ff7622f4056535844265edce81662` | `a523d4854791ffe5df4138617ab3194a9890f5be85d632a24014696e0fdd3fb5` | Airy editorial hierarchy |
| 02 | `a0cfe751bb840ba2d4e408c3695a5b941a88cacc048b87bb08b906d44ac12cb7` | `a1d946c2d0914d564613a0cacb67de0464a7a031f484a1a2d20ea38c445e696e` | `6360b5c61fef6e55644fd71587179c585cd4f0babe5e0dde39fa568b763f8ac1` | Menu-led editorial page |
| 03 | `58bec2083bc96c40e6248be8d216e5a0ab785bd9c04a15c225ea85336f4c210c` | `4f543d0f656c6d0f1093805ad6c8ff2433efa01cf304893183c4a55291c94c31` | `e0a7281d754ed652d6eb983b409b346639fd725d123704d5387e4463bcdafadc` | Catalog plus story rhythm |
| 04 | `c01334ee162f1ef440567b13d89828a186b552dfa447f2b0169dbd79e251da07` | `2bf022a41966fe5337c304cd228e7e4fab14139cb7983299a5d1156d75a3b849` | `4719b540f4b6097b0a05a43546aa09b252d721a0fa6290341a30267acd7a2fe9` | Warm compact commerce |
| 07 | `35ed41a21ae2dde3f3d7426a4cbc316250125c7fd021942f7d11f62907ddbf2c` | `e2e3bd206a9692d32faf6187570b2cfcbbeb66da59a670b86c6495bcd800f387` | `21066b36db0cc974931bcb943a7d0038c431eadad589e5b1240061565f77aa76` | Bold typographic minimum |

The hashes identify the exact approved local evidence without committing screenshots or private workspace files.

### Shared taste DNA

The five positives are not one style. Their shared quality is coherent intent:

1. **One dominant first-view idea.** Each hero has an obvious headline, visual posture, and next action. Even minimal item 07 makes one strong typographic decision instead of dumping data.
2. **Deliberate type roles.** Items 01–04 use a display/body contrast, usually serif plus sans; item 07 uses a bold display treatment. Heading scale, line breaks, and body width are visibly controlled.
3. **Limited palettes with temperature.** Items 01–04 use warm tinted neutrals and one restrained accent. Item 07 uses one cool, high-contrast field. None depend on the universal orange/black default that dominates later outputs.
4. **Whitespace as structure.** Content is grouped by large rhythm changes, not uniform `py-*` repetition.
5. **Content-specific composition.** Menus become rows, catalog items become comparison groups, trust becomes a band, process becomes numbered steps, and sparse content remains sparse.
6. **Section contrast.** Surface, alignment, density, or width changes between major sections. The page does not read as one repeated card grid.
7. **Mobile recomposition.** Heroes stack, actions become easier to tap, and reading order remains intentional rather than merely shrinking desktop.
8. **Restrained decoration.** Borders, shapes, icons, and color support hierarchy rather than substitute for it.

### Negative-pattern families

The rejected set supplies equally important anti-reference evidence:

- starter boilerplate and unrelated generic cards;
- raw object or transcript dumps rendered as body text;
- empty or runtime-broken pages;
- dark-on-dark contrast and nearly invisible supporting text;
- clipped or truncated headings;
- one oversized headline repeated across many businesses;
- identical orange/black navigation, hero, buttons, and cards across variants;
- implementation notes exposed as customer copy;
- generic equal-card grids regardless of content;
- placeholder or empty-media frames presented as the design;
- technically complete pages with no business-specific visual thesis.

Items 15–30 are especially strong evidence: source size and section count increased, but nearly every first viewport retained the same black heading, orange accent, white background, navigation, and generic retail arrangement. More generated code did not restore design quality because the upstream design decisions remained fixed or dead.

## Historical boundary

### Accepted items 01–04

Their source modification dates fall on 2026-08-05 and 2026-08-06, before commit `207778f7833e8f2584f89341c1b64d61765f00c6` removed the legacy generator, tool runner, fallback paths, and hedging. At that time the repository contained both the newer batched response-text writer and older agent infrastructure. Preserved source does not carry enough provenance to assign each page to one engine leg, so this audit does not pretend otherwise.

### Commit `207778f7`

This commit removed roughly 9,500 lines, including:

- `custom-source-generator.ts`;
- `agent-tool-runner.ts`;
- `source-edit-agent.ts`;
- batched rollout/fallback selection;
- runtime self-heal and legacy repair paths.

The useful effect was a much smaller, bounded, response-text-only control plane. The quality cost was removal of the remaining mechanisms that forced meaningful presentation work and rejected weak starter-derived output.

### Accepted item 07

Item 07 was modified on 2026-08-12 after the legacy removal and before the deterministic contract route was introduced. It is visually simple and factually unsuitable for release, but the owner accepted it as working. This is the strongest local evidence that response-text generation itself is not the visual regression: a post-tool-loop, text-response output can still produce a coherent page.

### Current deterministic route

Later work compiled accepted contracts and eventually routed them through `createGeneratedSiteRouteSource()`. That solved truncation and build reliability for the release, but it converted design into one fixed implementation. Aisyah item 33 is the current result and is explicitly negative evidence.

## Graphify architecture map

Graphify was refreshed from `f2cab3ae` before this audit. Relevant path:

```text
API generate request
  -> BullMQ attempt
  -> runBuildAttempt()                        build-attempt-worker.ts
      -> accepted handoff / contract / recipe
      -> createProjectSiteSchemaFromGeneratedContract()
      -> runBatchedGenerate()
          -> createGeneratedSiteRouteSource()  current accepted-site bypass
          -> source gates
      -> buildGeneratedProject()
      -> qualifyGeneratedSite()
          -> runGeneratedSiteBrowserGates()
          -> classifyGeneratedSiteRisk()
          -> runShadowCritic()                  normally bypassed for deterministic source
      -> source/dist/snapshot/thumbnail persistence
```

Graph findings:

- `runBuildAttempt()` is the seventh most-connected function in the repository, with 44 graph edges.
- `build-attempt-worker.ts` directly coordinates contracts, recipes, schemas, writer calls, source persistence, build, browser evidence, risk, critic, repair, artifacts, deployments, and thumbnails.
- There are no detected import cycles; the issue is responsibility concentration, not cyclic structure.
- `batched-generator.ts` is 1,622 lines and combines response transport, parser integration, source gates, normalization, retries, repair scope, scaffold merge, and generated-route dispatch.
- The response parser and build/browser modules are separable and worth preserving. The orchestration boundary is not.

## Findings

### F1 — Critical: accepted landing builds bypass the creative writer

`runBatchedGenerate()` checks `input.contract`. When present, it:

1. creates a fake prompt saying the route is deterministic;
2. calls `createGeneratedSiteRouteSource(contract)` locally;
3. constructs a design plan by copying contract metadata;
4. runs gates;
5. returns without invoking `runOneStreamedResponse()`.

For accepted landing/marketing handoffs, the nominal single-shot writer architecture is therefore not active.

### F2 — Critical: recipe and gold-example selection do not control rendering

The worker selects `GeneratedSiteRecipeV1` and `GeneratedSiteGoldExample`, then passes both into `runBatchedGenerate()`. The contract branch never uses the selected example and does not branch on recipe composition. `createGeneratedSiteRouteSource()` renders the same hero, catalog, trust strip, closing CTA, and USP treatment for every recipe.

The current “gold examples” are also one generic JSX fragment repeated for every recipe. They are neither the owner-approved references nor complete runnable examples.

### F3 — Critical: deterministic source is declared visually safe by definition

`classifyGeneratedSiteRisk()` immediately returns `risky: false` when `deterministicSource` is true. Consequences:

- recipe risk tags are ignored;
- source risk signals are ignored;
- browser evidence cannot trigger visual risk after hard assertions pass;
- configured critic sampling is ignored;
- the critic is not invoked;
- the quality proof records `riskStatus: clean` and `criticStatus: not_invoked`.

Determinism proves repeatability, not taste. The release rule that permitted this skip is invalid as a general quality rule.

### F4 — High: theme and art direction are collapsed before rendering

`createProjectSiteSchemaFromGeneratedContract()` assigns `theme: defaultTheme` regardless of contract color strategy, style preference, recipe, or signature element. It also assigns generic `Website usaha`/`Lihat detail` defaults and maps section purpose to both title and body.

The accepted references demonstrate that palette and typography are primary design variables. The current contract path removes those variables before source generation.

### F5 — High: the design plan certifies platform intent, not writer intent

The deterministic branch synthesizes `WriterDesignPlanV1` from the same contract fields the gate later compares against. It cannot reveal whether a writer made coherent section, palette, typography, responsive, or media choices because no writer made those choices.

A valid future design plan must contain bounded creative decisions and must change executable output, theme compilation, source assertions, and critic rubric.

### F6 — High: current call budgets are fragmented and can exceed the stated architecture

The non-contract branch can make:

- 1 initial writer call;
- 1 format-repair call;
- 1 truncation-resume call;
- 2 targeted source-repair calls;
- 1 visual-repair call.

Qualification may invoke the critic again after repair, and `runShadowCritic()` has its own blank-response retry. Separate `candidate-qualification.ts` compile/browser/visual budgets are not the single authority used by all those calls.

The observed long Aisyah attempts are consistent with this fragmentation:

| Observed attempt | Writer ms | Total ms | Outcome |
|---|---:|---:|---|
| A | 374,186 | 413,926 | Browser qualification failed |
| B | 458,885 | 480,157 | Qualification failed |
| C | 431,286 | 711,707 | Qualification failed |
| Final deterministic | 31 | 7,199 | Technically passed; visually rejected |

These are local observations, not a statistically valid legacy benchmark. They establish the order-of-magnitude problem and the need for one shared call ledger.

### F7 — High: the evaluation layer reports results but does not run the corpus

The repository has 12 synthetic fixture descriptors and a V2 report builder. However:

- fixture JSON contains short synthetic descriptions and expected labels, not complete executable accepted handoffs;
- `scripts/run-generation-evaluation.ts` reads precomputed result JSON and summarizes it;
- it does not generate, build, capture, or judge any candidate;
- metrics omit p95 latency, call counts, output size, reference fidelity, and blind preference;
- `deterministicQualityPass` can be true while the owner rejects the design;
- no user-approved positive/negative labels are represented.

The current evaluator can validate report arithmetic. It cannot substantiate a quality claim.

### F8 — Medium: factual safety and visual reference quality are conflated

Accepted references 03 and 04 use explicit no-photo frames; reference 07 uses generic English CTAs. They are still valid visual evidence because the owner labeled them working. Copying their source directly would reintroduce factual, media, and copy defects.

The new system must extract layout principles into sanitized design kits while continuing to enforce the current fact contract.

### F9 — Medium: the orchestrator is too broad for safe iteration

At 1,410 lines, `build-attempt-worker.ts` owns both business transaction state and detailed generation policy. Any worker change risks persistence, charging, deployment, and quality behavior together. The new path needs one narrow pipeline interface so implementation agents can change design generation without rewriting project lifecycle logic.

## Bolt.new research

### Public source architecture

Bolt's public repository uses a response-text protocol rather than requiring a model-native tool loop for every file operation:

1. The system prompt requires one `<boltArtifact>` containing ordered `<boltAction type="file">` and `<boltAction type="shell">` blocks with full file contents.
2. `StreamingMessageParser` incrementally scans cumulative assistant text. It emits action-open/action-close callbacks when tags become complete.
3. `useMessageParser` forwards closed actions into the workbench.
4. `ActionRunner` serializes actions through one promise chain, writes files to WebContainer, and executes shell commands.

Primary sources:

- `https://github.com/stackblitz/bolt.new/blob/main/app/lib/.server/llm/prompts.ts`
- `https://github.com/stackblitz/bolt.new/blob/main/app/lib/runtime/message-parser.ts`
- `https://github.com/stackblitz/bolt.new/blob/main/app/lib/runtime/action-runner.ts`
- `https://github.com/stackblitz/bolt.new/blob/main/app/lib/hooks/useMessageParser.ts`

The fetched public `main` files matched repository snapshot `eda10b121221b30825a4c16eec5da1fd3eb1eb99`. The public source is an architectural reference, not evidence of Bolt's complete current proprietary production stack.

### Public design guidance

Bolt's current support documentation says that an attached design system makes generated prototypes use real components from the start and applies its components, spacing, typography, and color to UI decisions. It also recommends specific, bounded prompts and targeting only the files/components that should change to reduce token use and improve accuracy.

Sources:

- `https://support.bolt.new/building/design-system/use-design-system`
- `https://support.bolt.new/best-practices/prompting-effectively`

### Applicable lesson

UMKM Cepat already has the useful transport shape: streamed text, closed-file persistence, and deterministic execution. It should copy Bolt's grounding principle, not its full shell authority:

- keep `<design-plan>`, `<file>`, and `<done>`;
- preload portable design-kit primitives and exact APIs;
- let the model write bounded editable source once;
- let the platform—not the model—run build and browser commands;
- target one implicated file in the only correction;
- never grant generated shell or unrestricted file tools.

## Root-cause statement

The regression is a **control-flow and grounding failure**:

```text
rich accepted facts + recipe prose + example placeholder
  -> default theme
  -> fixed route renderer
  -> self-authored design plan
  -> mechanical browser pass
  -> deterministic-source visual bypass
  -> "clean" proof for an owner-rejected design
```

It is not a parser-format failure:

```text
one streamed response
  -> incremental closed-file parser
  -> bounded platform executor
```

That second sequence remains the recommended foundation.

## Architecture recommendation

Adopt a reference-calibrated, kit-grounded single-shot pipeline:

```text
accepted handoff + canonical facts
  -> factual/render contract
  -> deterministic design-kit selection
  -> portable kit primitives + semantic theme policy
  -> ONE streamed writer response
       <design-plan> bounded creative choices </design-plan>
       <file> full editable source </file>
       <done />
  -> source/fact/media gates
  -> TypeScript + Vite
  -> mobile + desktop browser gates
  -> ONE mandatory reference-aware visual review
  -> pass, honest failure, or ONE shared targeted correction
```

A design kit is executable only if its identity changes all four of these surfaces:

1. scaffolded portable primitives and allowed APIs;
2. writer prompt and design-plan choices;
3. source/browser assertions;
4. visual-review rubric.

Metadata that changes none of those is dead documentation and must fail a test.

## Benchmark recommendation

Use three evidence roles, not one misleading race:

1. **Technical-speed control:** current deterministic renderer.
2. **Treatment:** proposed kit-grounded streamed writer.
3. **Taste references:** owner-approved items 01, 02, 03, 04, 07 plus all remaining negatives.

The treatment is not expected to beat a no-AI renderer's 7.2-second latency. It must materially improve owner preference while remaining materially faster than observed multi-call AI generation.

Release thresholds belong in the successor spec. At minimum they must cover:

- all scheduled trials present;
- call-count compliance;
- p50 and p95 end-to-ready latency;
- source/build/browser success;
- zero fabricated facts and broken actions;
- zero unresolved critical/high visual findings;
- blind owner preference over the deterministic control;
- reference-family coverage and no universal-template collapse.

## Decisions for the successor spec

1. Preserve response-text generation.
2. Preserve locked platform execution and portable generated source.
3. Replace prose-only recipes with executable design kits derived from 01, 02, 03, 04, and 07.
4. Treat every other recovered variant as anti-reference evidence.
5. Remove deterministic-source visual immunity.
6. Use one mandatory visual review in the normal path.
7. Use one shared correction budget; transport retry and visual repair are not separate free budgets.
8. Keep the fixed renderer only as a rollback/control arm, not the quality path.
9. Extract generation orchestration behind one narrow interface before rollout.
10. Do not implement until the benchmark and release contract are frozen.

## Unknowns and limits

- Historical source does not persist definitive engine-leg/model provenance for items 01–04.
- Historical positive builds do not carry reliable end-to-end timing records.
- Five broken variants could not be rebuilt; their exact runtime failures are not fully classified.
- No authenticated product UI E2E was run for this audit.
- Visual labels are from the product owner and intentionally override generic critic taste, but category-level critic calibration still needs a labeled execution task.

None of these unknowns blocks the architecture decision. They block unsupported claims about which old engine was best or how fast it was.
