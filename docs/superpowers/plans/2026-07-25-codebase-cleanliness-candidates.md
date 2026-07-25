# Codebase Cleanliness — Deepening Candidates

**Date:** 2026-07-25
**Feeds:** `docs/superpowers/plans/2026-07-25-codebase-cleanliness.md` (Phase C — the half that was checkboxed `[x]` but never shipped as commits).
**Rule:** every candidate is behavior-preserving. `bun run check` green before + after; revert-on-red, don't fix forward. No new deps, no UI/interaction change.

Active agent owns `WorkspacePrimitives.tsx`, `WorkspaceShell.tsx`, `user-credits.ts`, `ai-agent-steps.ts`, `energy-step-charger.ts` — **none of those are in scope here.** No candidate below touches them.

---

## How to read this

Pick N. I execute only those, each as its own atomic `refactor(clean):` commit to `dev`, gated by `bun run check` before + after. Risk badges:

- **Strong** — trivially behavior-preserving; the existing test suite is the proof.
- **Worth exploring** — behavior-preserving in principle, but call sites span files/scope; small ergonomic change.
- **Speculative** — judgment call; defer unless you want it.

---

## A. Shallow wrappers (delete / inline)

### A1 — `createGeneratedProjectFiles` · Strong
- **File:** `src/lib/projects/generated-source.ts:817-822`
- **Body:** `return createGeneratedViteTanStackProjectFiles(projectId, schema);` — pure forward, no logic.
- **Deepening:** inline `createGeneratedViteTanStackProjectFiles(projectId, schema)` at all call sites; delete wrapper.
- **Behavior-proof:** `generated-source.test.ts:327,777,806`; `agent-tool-runner.test.ts:11`; `generated-package-policy.test.ts:20`.
- **Note:** `createGeneratedViteTanStackStarterFiles` (L797) and `createStarterContractStyles` (L813) are the same shape but have guard tests (see A3) — keep separate.

### A2 — `createGeneratedViteTanStackStarterFiles` · Strong
- **File:** `src/lib/projects/generated-source.ts:797-802`
- **Body:** `return createViteTanStackShadcnStarterFiles(projectId, schema);` — pure forward.
- **Deepening:** inline at call sites; delete.
- **Behavior-proof:** `scaffold/scaffold.test.ts:161-170` (explicit "delegation re-export" describe block asserts `delegated` deep-equals scaffold output — catches divergence AND catches inline succeeding); `custom-source-generator.test.ts:475,492,503`.

### A3 — `createStarterContractStyles` · Worth exploring
- **File:** `src/lib/projects/generated-source.ts:813-815` + ponytail comment L804-812
- **Body:** `return shadcnThemeCss(schema);`
- **Call sites:** `custom-source-generator.ts:914,921` (2 — the ponytail's delete-condition is met).
- **Deepening:** inline `shadcnThemeCss(schema)` at both call sites; delete wrapper + ponytail.
- **Behavior-proof:** `generated-source.test.ts:81` (asserts output); BUT `scaffold/scaffold.test.ts:171-176` explicitly asserts the re-export *exists* ("createStarterContractStyles still exists (legacy re-export)"). → deleting the wrapper **deletes that guard test** too (it's testing the indirection, not behavior). Flag this in the commit message.
- **Risk note:** the guard test is itself a load-bearing ponytail artifact; deleting it is the intended end-state per the ponytail.

### A4 — `createGeneratedDesignContextFiles` (empty stub) · Strong
- **File:** `src/lib/projects/generated-source.ts:987-991`
- **Body:** `function createGeneratedDesignContextFiles(_schema): GeneratedProjectFile[] { return []; }` — single caller L975 spreads `[]` (no-op).
- **Deepening:** delete the function + the `...createGeneratedDesignContextFiles(schema)` spread at L975.
- **Behavior-proof:** `generated-source.test.ts` snapshot tests for `createGeneratedProjectFiles` catch any file add/remove.

### A5 — `getBriefPatchFields` · Strong
- **File:** `src/lib/projects/brief-flow.ts:489-491`
- **Body:** `function getBriefPatchFields() { return BRIEF_PATCH_FIELDS; }` — pure indirection over a module const. One caller L68.
- **Deepening:** inline `BRIEF_PATCH_FIELDS` at L68; delete.
- **Behavior-proof:** `brief-flow.test.ts` exercises `applyBriefPatch` over `BRIEF_PATCH_FIELDS`.

### A6 — `isAllowedGeneratedDotPath` (always-false) · Speculative
- **File:** `src/lib/projects/generated-source.ts:157-159`
- **Body:** `function isAllowedGeneratedDotPath(_filePath: string) { return false; }` — 2 callers at L143-144 use `!isAllowedGeneratedDotPath(filePath)` ⇒ always `true`.
- **Deepening:** either (a) drop the function + the `!` so the literal `true` is visible at the call site, or (b) if the dot-path branch is unreachable given the earlier `BLOCKED_GENERATED_PATHS.has` + `.browser/` + windows-basename checks, delete the whole branch. **Read the surrounding `assertSafeProjectFilePath` before choosing.**
- **Behavior-proof:** `generated-source.test.ts` (dot-path rejection); `agent-tool-runner.test.ts:302` ("rejects writes outside generated project source boundary").
- **Risk note:** path-safety is a trust boundary. The always-false is *intended* (block all dot paths) — not dead code. Don't touch unless the surrounding logic is read + the deletion is provably no-op. Defer if any doubt.

---

## B. Degenerate / dead helpers

### B1 — `createFallbackWorkspaceCard` (degenerate) · Worth exploring
- **File:** `src/lib/projects/brief-flow.ts:231-235`
- **Body:** `export function createFallbackWorkspaceCard(_brief: ProjectBrief): WorkspaceCard { return { type: "none" }; }` — `brief` unused (`_brief`); body is a constant.
- **Call sites:** ~8 internal in `brief-flow.ts` + `createPendingWorkspaceCard` (L238) wraps it.
- **Deepening:** replace all `createFallbackWorkspaceCard(x)` calls with `{ type: "none" }`; delete function. `createPendingWorkspaceCard` (A-sibling) then also collapses.
- **Behavior-proof:** `brief-flow.test.ts` asserts the `{ type: "none" }` shape via `normalizeWorkspaceTurn` / `parseWorkspaceCard`.
- **Risk note:** 8 call sites across one file — ergonomic churn, no behavior delta. Value = one less named indirection for "the degenerate card."

### B2 — `createPendingWorkspaceCard` (wraps B1) · Strong
- **File:** `src/lib/projects/brief-flow.ts:237-239`
- **Body:** `return createFallbackWorkspaceCard(brief);`
- **Call sites:** `src/routes/api.projects.ts:229` (one external).
- **Deepening:** inline `{ type: "none" }` at the route call site; delete. (Or fold into B1 — if B1 is deleted, this wrapper goes with it.)
- **Behavior-proof:** `brief-flow.test.ts`.

---

## C. Duplicated logic (extract one shared helper)

### C1 — `toPackageName` (byte-identical) · Strong
- **Sites:** `src/lib/projects/generated-source.ts:993-1000` + `src/lib/projects/scaffold/vite-tanstack-shadcn-starter.ts:225-232`
- **Body (both, identical):**
  ```ts
  function toPackageName(value: string) {
    return (value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")) || "generated-app";
  }
  ```
- **Deepening:** extract to `src/lib/projects/package-name.ts` (one home); re-export from both. Or move to the scaffold module and import from generated-source (scaffold is the natural home — it already owns the package.json scaffold).
- **Behavior-proof:** `generated-source.test.ts` + `scaffold/scaffold.test.ts` both snapshot the generated `package.json` `name` field.

### C2 — abort-signal bridge (2x in custom-source-generator) · Worth exploring
- **Sites:** `src/lib/projects/custom-source-generator.ts:189-201` (`generateCustomProjectFilesWithAgent`) + `391-399` (`runForcedRewritePass`)
- **Body (both, identical shape):**
  ```ts
  const localAbortController = new AbortController();
  if (abortSignal) {
    abortSignal.addEventListener("abort", () => localAbortController.abort(), { once: true });
    if (abortSignal.aborted) { localAbortController.abort(); }
  }
  ```
- **Deepening:** extract `bridgeAbortSignal(parent: AbortSignal | undefined, child: AbortController)` (pure, no deps).
- **Behavior-proof:** `custom-source-generator.test.ts` (agent abort path indirectly).
- **Risk note:** 5 lines × 2 sites — win is readability + single source of truth for the `aborted` pre-check. Route handlers use a different variant (`request.signal?.addEventListener?.`) — **don't fold those in** (not byte-identical).

### C3 — `repairGeneratedProjectFiles` vs `repairRuntimeErrors` (author-approved) · Strong
- **Sites:** `src/lib/projects/custom-source-generator.ts:2124-2257` vs `2264-2367`
- **Ponytail marker L2262-2263** (verbatim): _"mirrors repairGeneratedProjectFiles structure verbatim; if a 3rd repair variant appears, extract a shared runRepairAgent helper."_
- **Diffs (only these):** telemetry label (`project-source-generation-agent-repair` vs `project-source-runtime-repair`), prompt text, the diagnostic-input block (`buildLog` vs `runtimeErrors[]`). Everything else — `runCommand` closure, ToolLoopAgent construction, heal block (`ensureRouterRouteWired` → `ensurePreviewReadyCalled` → `ensureStylesFileExists` → `touchedFiles.add(AUTO_STYLE_PATH)`), return shape — byte-identical (verified: `diff` of matched blocks = empty).
- **Deepening:** extract `runRepairAgent({ diagnosticInput, prompt, telemetryLabel, files, projectId, schema, implementationSpec, onOperation, stepCharger })` returning `{ files, operationTrace, touchedFiles, modelId, usage, summary, energyExhausted }`; both fns become thin callers.
- **Behavior-proof:** `runtime-self-heal.test.ts` (`repairRuntimeErrors`); `build-repair-planner.test.ts` + `custom-source-generator.test.ts` (`repairGeneratedProjectFiles`); `api.projects.$id.generate.ts` integration path L471/L972.
- **Highest leverage of the set** — ~130 lines collapse to one helper + two ~15-line callers.

### C4 — `flushGenerateEnergy` / `flushEditEnergy` · Worth exploring
- **Sites:** `src/routes/api.projects.$id.generate.ts:342-357` + `src/routes/api.projects.$id.edit.ts:436-448`
- **Shape:** same `energyCharged`-guard + `chargeEnergyForAiUsage(userId, modelId, inputTokens, outputTokens, reason)` pattern, ~8 lines each.
- **Deepening:** extract `createEnergyFlusher({ userId, getModelId, reason })` returning a `flush(inputTokens, outputTokens)` closure.
- **Behavior-proof:** `api-projects.test.ts`; `energy-step-charger.test.ts`.
- **Risk note:** token accumulators (`specInputTokens` / `totalEditInputTokens`) live in different route scopes — helper needs a getter. And this is on the energy path adjacent to the active agent's WIP — **defer if the energy metering isn't settled.**

### C5 — build-retry loop (2x in generate route) · Speculative
- **Sites:** `src/routes/api.projects.$id.generate.ts:457-518` (retry_build) + `956-1045` (first_generate)
- **Shape:** both are `for (let repairAttempt = 0; repairAttempt < 2; ...)` loops doing `renewProjectOperation` → progress emit → `repairGeneratedProjectFiles` → snapshot update → write source artifact → `buildGeneratedProject` → break-on-ok.
- **Deepening:** extract a `runBuildRepairLoop({...})`. **BUT** the two loops differ in persistence side-effects (retry_build updates the same snapshot row; first_generate creates a fresh `projectBuild.update` + `runtimeBuildFinalized`). Extraction requires careful param threading.
- **Behavior-proof:** `api-projects.test.ts`; `build-repair-planner.test.ts`.
- **Recommendation:** defer — the side-effect divergence makes the extraction subtle; high chance of a behavior-nudge. Only if you explicitly want it.

---

## E. Cross-route duplicated guards (highest leverage in the whole scan)

These are byte-identical patterns repeated across **many** route files. Verified counts via `grep` on 2026-07-25 (Agent undersampled — real counts higher than the agent's first pass). Highest leverage of any section.

### E1 — session guard + 401 response · Strong (HIGHEST leverage)
- **Body (byte-identical at every site):**
  ```ts
  const session = await auth();
  if (!session?.user?.id) return Response.json({ message: "Masuk dulu untuk melanjutkan." }, { status: 401 });
  ```
- **Sites:** **28 route files** (29 grep hits incl. `api.projects.ts` x2). Confirmed in: `api.projects.ts`, `api.projects.$id.{cancel,stop,title,runtime,snapshots,snapshots.$snapshotId.restore,snapshots.$snapshotId.source,workspace,source,assets,assets.$,publish,runtime-events,thumbnail,chat,chat.turn,edit,generate,preview.$,asset.$assetId}`, `api.user.{credits,verification}`, `api.auth.otp.{send,verify}`, `api.dev.skip-verification`, `api.projects.moderate`, `api.projects.preview`.
- **Deepening:** extract `src/lib/auth/require-user.ts` exporting `requireUser(): Promise<{ userId: string } | { response: Response }>`. Each route: `const user = await requireUser(); if (user.response) return user.response;` then use `user.userId`. (Or a narrower `requireUserOr401(): Promise<Response | { userId: string }>`.) Natural home outside `projects/` — auth is cross-cutting.
- **Behavior-proof:** `src/routes/-api.projects.test.ts` + per-route tests exercise the 401 path indirectly.
- **Risk note:** highest count × highest churn. **But** the churn is mechanical (same 2-line replacement × 28) and behavior-preserving (the 401 body + status never vary). One atomic commit, gated.

### E2 — owned-project lookup + 404 · Worth exploring
- **Body (byte-identical `where` + 404):**
  ```ts
  const project = await prisma.project.findFirst({ where: { id, userId: session.user.id }, select: { id: true } });
  if (!project) return Response.json({ message: "Proyek tidak ditemukan." }, { status: 404 });
  ```
- **Sites:** **~19 route files** with the 404 body; `where: { id, userId: session.user.id }` confirmed byte-identical across `cancel`, `stop`, `title`, `runtime`, `snapshots`, `snapshots.restore`, `snapshots.source`, `workspace`, `source`, `assets`, `assets.$`, `publish`, `chat.turn` (+ more).
- **DELTA:** the `select` clause differs per route (most `select: { id: true }`; some add `prompt`, `thumbnailRef`, etc.). The `where` + 404 body are the stable part.
- **Deepening:** extract `src/lib/projects/owned-project.ts` exporting `findOwnedProject(id, userId, select?) → { project, notFoundResponse }`. Routes pass their `select`; the helper owns the `where` + 404.
- **Behavior-proof:** `api-projects.test.ts` + route tests indirectly.
- **Risk note:** the `select` variance means the helper takes a param; the 404 body + `where` collapse. Composes naturally after E1 (uses the userId from `requireUser`).

### E3 — `escapeHtml` (byte-identical) · Strong
- **Sites:** `src/lib/projects/preview-error-html.ts:60-66` + `src/lib/projects/runtime-proxy.ts:266-272`. Byte-identical 4-replace chain (`&`, `<`, `>`, `"`). Only type annotation differs.
- **Deepening:** extract `src/lib/escape-html.ts` (tiny leaf); import from both.
- **Behavior-proof:** `runtime-proxy.test.ts` (covers `injectPreviewAnnotationBridge` which uses escaped output).

### E4 — `isPrismaDatabaseUnavailable` → 503 + `Retry-After: 3` · Worth exploring
- **Sites:** `api.projects.$id.assets.$.ts:27-38`, `api.projects.$id.preview.$.ts:45-56`, `api.projects.$id.runtime.ts:46-67`, `api.projects.$id.workspace.ts:48-61`.
- **Shape:** `catch (error) { if (isPrismaDatabaseUnavailable(error)) return <503 Retry-After:3 {code:"database_unavailable", message}>; throw error }`.
- **DELTA:** the response builder varies (`Response.json` vs `sandboxJson` vs `createPreviewIssueResponse`) + localized `message`.
- **Deepening:** extract `handlePrismaDatabaseUnavailable(error, message): Response | null` — caller wraps with its own response builder if needed, or the helper returns the raw `{ body, init }` for the caller to materialize.
- **Behavior-proof:** `api-projects.test.ts` + route tests indirectly.

### E5 — `unstringifyJsonObject` (byte-identical core) · Worth exploring
- **Sites:** `src/lib/projects/brief-flow.ts:167-180` (standalone generic) + `src/lib/projects/discuss-tool.ts:14-28` (wrapped in `z.preprocess`).
- **Shape:** trim → `startsWith "{"`/`"["` → try `JSON.parse` → catch return raw.
- **Deepening:** extract `src/lib/projects/json-unstringify.ts` `tryParseJsonObjectOrPass<T>(value)`. discuss-tool keeps its 1-line `z.preprocess` wrapper.
- **Behavior-proof:** `brief-flow.test.ts` + `discuss-tool.test.ts`.

### E6 — `edit_failed_retryable` 503 body (single-file dup) · Worth exploring
- **Sites:** `src/routes/api.projects.$id.edit.ts:295-303, 341-349, 896-904` (+ a near-identical at :382-390). Same `{ attemptId, code: "edit_failed_retryable", message }` + `Retry-After: 3`.
- **DELTA:** only `message` varies.
- **Deepening:** route-local `retryableEditFailureResponse(attemptId, message)` (no new file — single-file dup, keep it local per YAGNI).
- **Behavior-proof:** verify against any `api.projects.$id.edit` test in `src/routes/` (agent found none — confirm before executing).
- **Risk note:** adjacent to the energy metering WIP (edit route). **Defer until energy metering settles.**

### E7 — ID-format assert regex · Worth exploring
- **Sites:** `project-assets.ts:393-411` (`assertSafeProjectId` + `assertSafeUserId` + `isValidProjectId` + `isValidUserId`), `project-thumbnail.ts:329-333` (`assertSafeId`), `runtime-artifacts.ts:467-471` (`assertSafeArtifactId`).
- **DELTA:** project-assets + project-thumbnail byte-identical regex `^[A-Za-z0-9_-]{1,160}$`; runtime-artifacts drops the length cap + changes error message.
- **Deepening:** extract `src/lib/projects/safe-id.ts` `assertSafeId(value, { maxLength?, label? })`. The length-cap variance becomes a param.
- **Behavior-proof:** `project-assets.test.ts`, `project-thumbnail.test.ts`, `runtime-artifacts.test.ts` exercise call sites.

### E8 — env positive-int parser · Speculative
- **Sites:** `generated-resource-budget.ts:110-116`, `runtime-network.ts:29-35` (byte-identical min/max/default clamp), `preview-asset-token.ts:122-128` (no min clamp), `project-thumbnail.ts:355-358` + `build-worker.ts:125-127` (simpler `process.env` direct shape).
- **Deepening:** extend `src/lib/config.ts` (existing `getEnv` home) with `getEnvNumber(name, { default, min?, max? })`; the simpler 2-site cluster collapses to `getPositiveInt(name, fallback)`.
- **Behavior-proof:** per-file `.test.ts` for each site.
- **Risk note:** two sub-shapes; consolidating means one helper with optional min/max. Speculative — defer unless you want the env-parsing surface unified.

---

## F. Pure-function cluster extraction (file-size reduction, no behavior change)

These reduce the 2339-line `custom-source-generator.ts` by extracting cohesive pure clusters to adjacent modules. **Each cluster is self-contained (no I/O, no closure state, no shared mutable imports).** Tests already cover them in-place and migrate cleanly.

### D1 — Tailwind CSS-stub emitter (~700 lines, pure) · Strong
- **Symbols:** `getTailwindCssRule` (L1080-1446), `twSpacingValue` (L1448-1461), `twBoxSides` (L1463-1486), `twTextSize` (L1488-1505), `twColorHex` (L1507-1777).
- **Deepening:** extract to `src/lib/projects/tailwind-css-stubs.ts`. Only `getTailwindCssRule` is consumed (by `applyStylesCoverStubs` L1805, same file → becomes an import).
- **Behavior-proof:** `custom-source-generator.test.ts`.

### D2 — CSS class-coverage validator (~300 lines, pure) · Strong
- **Symbols:** `extractClassNamesFromTsx` (L575-596), `TRIVIAL_CSS_CLASS_ALLOWLIST` (L603-610), `isTailwindUtilityClass` (L612-779), `cssCoversClassName` (L792-804, exported), `hasMeaningfulRuleForClass` (L812-845), `isNonColorDeclaration` (L847-869), `findMissingCssClasses` (L871-888, exported), `isStarterStylesContent` (L891-897).
- **Deepening:** extract to `src/lib/projects/css-class-coverage.ts`. Two exports consumed by tests + `applyStylesCoverStubs` + `checkAgentSourceQuality`.
- **Behavior-proof:** `custom-source-generator.test.ts`.

### D3 — Agent prompt/spec builders (~160 lines, pure) · Worth exploring
- **Symbols:** `DESIGN_DIRECTIVE` const (L1960-1989), `buildAgentPrompt` (L1991-2014), `buildGeneratedAppBuildSpec` (L2016-2071, exported, cross-file), `buildGeneratedAppAgentInstructions` (L2073-2122, exported).
- **Deepening:** extract to `src/lib/projects/agent-prompt-builder.ts`. Less clean than D1/D2 — `buildGeneratedAppBuildSpec` is imported by the route + both repair fns, so this is a cross-file move (fine, but more import churn).
- **Behavior-proof:** `custom-source-generator.test.ts`; `api-projects.test.ts`.

---

## Recommended pick order (lowest-risk, highest-leverage first)

**Tier 1 — biggest leverage, fully behavior-preserving:**
1. **E1** — session-guard extract (28 route files, byte-identical 401; mechanical replacement).
2. **E2** — owned-project lookup extract (~19 routes; `where`+404 collapse, `select` param).
3. **C3** — repair-helper extract (author-approved via ponytail L2262; ~130 lines → 1 helper + 2 thin callers).
4. **E3** — `escapeHtml` extract (2 byte-identical sites; tiny leaf).
5. **A1** — `createGeneratedProjectFiles` inline (pure forward, 6 call sites, no guard test).
6. **A2** — `createGeneratedViteTanStackStarterFiles` inline (pure forward; guard test catches divergence).
7. **A4** — `createGeneratedDesignContextFiles` delete (empty `[]` stub, no-op caller).
8. **A5** — `getBriefPatchFields` inline (const indirection, 1 caller).
9. **C1** — `toPackageName` extract (byte-identical dup, 2 homes).

**Tier 2 — pure-cluster extraction (file-size reduction):**
10. **D1 / D2** — Tailwind-stub + CSS-coverage clusters (~1000 lines out of the 2339-line god-file; pure, tests migrate).
11. **B2** — `createPendingWorkspaceCard` inline (1 external caller).
12. **A3** — `createStarterContractStyles` delete (needs guard-test deletion too; intended end-state per ponytail).
13. **C2** — abort-bridge extract (small win, readability).
14. **E5** — `unstringifyJsonObject` extract (byte-identical core, 2 homes).
15. **E7** — ID-assert regex extract (3 sites, length-cap variance → param).
16. **E4** — `isPrismaDatabaseUnavailable` → 503 (4 routes, builder variance).

**Tier 3 — higher churn / judgment calls (do only if you want them):**
17. **B1** — `createFallbackWorkspaceCard` degenerate-replace (8 call sites, churn, marginal).
18. **D3** — prompt-builder extract (cross-file move, more churn).
19. **E8** — env positive-int parser unification (two sub-shapes; speculative).
20. **A6** — `isAllowedGeneratedDotPath` (trust-boundary; defer unless surrounding logic read + provably no-op).
21. **C5** — build-retry loop (defer — side-effect divergence; high behavior-nudge risk).

**Defer (active WIP adjacency — not this session):**
- **C4** — energy flusher (edit route, energy metering in flight).
- **E6** — `edit_failed_retryable` 503 body (single-file, edit route, energy adjacency).

---

## S. Security-consistency: raw `error.message` → client (the PR #19 pattern, done properly)

PR #19 (OrbisAI, now closed) tried to fix one error-leak site by hardcoding a generic message. The canonical fix already on `dev` is `mapToUserFacingError` (`src/lib/user-facing-error.ts`) — pattern-matches known adapter reasons → Indonesian generic, else a safe fallback; **never** the raw string. A sweep of all `error.message` sites in `src/routes/` classified every one as either log-only (safe — `devLog`/`console.error`, never sent to client) or a real leak. The log-only sites are correct as-is. **Only 2 are real leaks; both server-side, ~4-line diff each.**

### S1 — `api.waitlist.ts:91-95` + `api.projects.$id.assets.ts:80-82` · Strong
- **Leak:** `catch (error) { const message = error instanceof Error ? error.message : "<fallback>"; return Response.json({ message }, { status: 400 }); }` — raw adapter error string → HTTP response body → client.
- **Fix:** `const message = mapToUserFacingError(error instanceof Error ? error.message : "")` at both sites. Imports `mapToUserFacingError` from `@/lib/user-facing-error` (already imported in `payment.create.ts:11` — same pattern). Keep the existing Indonesian fallback strings as the client-side display default; the server returns the sanitized helper output.
- **Downstream consequence — no separate fix needed:** `_main.waitlist.tsx:71-74`'s `toast.error(error.message)` reads `json.message` from the waitlist response (line 68: `throw new Error(json.message ?? ...)`). Once the server returns the sanitized message, the toast shows the sanitized message automatically. The toast's own `error.message` branch only fires on a `fetch`-level network error (generic, not a leak). → **Do not touch `_main.waitlist.tsx`.**
- **Behavior-proof:** `api-projects.test.ts` + waitlist route test exercise the 400 path. The message string changes from raw → generic Indonesian; if any test asserts the raw message, update it (unlikely — the error reasons are adapter-dependent, not asserted).
- **Behavior delta (intended):** error responses no longer leak raw Pakasir/R2/SDK internals; user sees generic Indonesian instead. This is the fix the PR intended, applied consistently.
- **Scope note:** this is a **behavior change** (message content), not a pure cosmetic refactor — it belongs to topic 8 (polish+security), not topic 6 (cleanliness). Listed here because the user surfaced it via the PR. Execute as its own `fix(security):` commit, not `refactor(clean):`.

### Verified-safe (log-only — DO NOT change)
- `generate.ts:720, 750, 1251` → `devLog()` internal only.
- `preview.ts:270` → `console.error("[moderation] failed:", ...)` server log.
- `api.projects.ts:198` → `console.error` log.
- `waitlist.ts:71` → `devLog()` only.
- `restore.ts:73` → `devLog()` only.
- `preview.ts:506` → already routed through `mapToUserFacingError(reason)`. ✅ correct.
- `payment.create.ts:88` → already routed through `mapToUserFacingError`. ✅ correct (why PR #19 is obsolete).

---

## Out of scope (verified non-candidates)

- `cleanText` in `brief-flow.ts:549` vs `site-schema.ts:36` — different signatures + different normalization (site-schema lowercases, brief-flow strips emoji). **Not a dup.**
- `normalizeConfig` (`generated-build-policy.ts:81`) — 1-line `replace(/\r\n/g,"\n").trim()` with one caller; reads fine, marginal value.
- `BuildCacheMetadata` type — 2 consumers, not a one-impl interface.
- R2 Sig V4 — already consolidated in `src/lib/r2-client.ts`.
- `build-logs.ts` `classifyBuildFailure` / `sanitizeBuildLog` — established read surface, not dup.
- `discuss-turn-shared.ts` 3-layer repair — intentional layering, not dup.

## Notes

- Every "Behavior-proof" line above references a test file that was verified to exist on 2026-07-25.
- Candidate C3's ponytail marker is the only author-written extraction approval in the set — highest confidence.
- Phase A discovery was done with Explore agents + Graphify (4390 nodes, 0 import cycles, 239 communities) + direct file reads for line-number verification.
