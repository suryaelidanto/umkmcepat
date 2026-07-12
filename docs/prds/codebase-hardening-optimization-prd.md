# PRD: Codebase Hardening and Optimization

Status: active
Created: 2026-07-12
Updated: 2026-07-12
Owner: Surya
Scope: codebase-wide refactor, persistence dedup, type safety, AI error diagnostics, import graph, file organization, mobile responsiveness, and release evidence — without changing product behavior
Read when: refactoring project chat persistence, edit-attempt storage, UI message dedup, generated source/site-schema modules, AI error logging, SponsorTable mobile, or preparing a release-candidate audit
Do not read for: new product features, AI prompt tuning, runtime supervisor work, isolated build worker, public generated execution, deployment topology, or any behavior-changing change
Current truth: source code + `AGENTS.md` + `PRINCIPLES.md` + `DEV.md` + `docs/architecture.md` + this PRD

## Status History

- 2026-07-12: Proposed after a full atlas audit (Graphify 1368 nodes / 76 communities, baseline `bun run check` green, 291 tests passing, Langfuse + dev server live). Scope grouped into Worth It, Good To Have, and Big No. Big No items recorded in Out of Scope.
- 2026-07-12: Tracks A, B, C, D, E, F2, G, H implemented on `optimize/codebase-hardening`. Track F1 (generated starter template split) deferred: template functions and runtime helpers (`createGeneratedSourceSnapshotMetadata`, `getContentType`) are interleaved in `generated-source.ts`, so a clean split risks generated output for an organizational gain only. Track F2 (site-schema validators) shipped to `site-schema-issues.ts`.

## Problem Statement

UMKM Cepat's generated-app builder spine is functionally beta-complete: create, guided discuss, confidence-gated brief, AI-decided implementation spec, generated source, build, preview, visual/copy edit, rebuild, and publish all work end to end, with reliability hardening committed across the last fifteen commits. The remaining risk is not missing features; it is code hygiene and consistency debt that makes the codebase harder to trust and maintain at release:

- Project chat persistence in the preview route repeats the same raw SQL update blocks ten times with identical JSONB casting patterns, so any persistence fix must be applied in ten places.
- `ProjectEditAttempt` is written through Prisma ORM in the generate route but through hand-written raw SQL in the edit route, even though the schema models the table fully. Two access patterns for one table drift silently.
- Three type casts bypass Prisma and AI SDK type safety, hiding real type errors behind `as Parameters<...>` and `as UIMessage["parts"][number]`.
- AI tool-repair failures currently log as `{ reason: "unknown" }` in Langfuse and the AI debug log, so the most interesting failure surface is invisible to operators.
- `dedupeUiMessages` exists twice with subtly different text-key logic (the server trims and filters empty text parts; the client does a naive join), which can make client and server disagree on what is a duplicate.
- A three-file type import cycle (generated-source <-> generated-build-policy <-> generated-package-policy) is runtime-safe but signals a missing shared types seam.
- The largest modules mix unrelated concerns: `generated-source.ts` interleaves build execution with starter file templates; `site-schema.ts` interleaves the schema type with quality/candidate validators.
- The home page `SponsorTable` renders a fixed 760px-wide table inside an overflow wrapper, so mobile users get a horizontal-scroll table where a card list would communicate the same data with less effort.
- There is no recent Lighthouse evidence; the `.lighthouseci/` directory is empty.

From the maintainer's perspective, none of these break the product today, but each makes the next change slower and riskier, and a few (client/server dedupe mismatch, unknown repair errors) are latent correctness/observability gaps.

## Solution

Execute a behavior-preserving hardening pass on the `optimize/codebase-hardening` branch, grouped into nine tracks. Every track is gated by existing tests (route tests, generated-source tests, site-schema tests) plus targeted new unit tests for newly-extracted pure helpers. No product behavior changes. No new dependencies. No new comments unless they document a non-obvious invariant that self-explanatory code cannot carry; the codebase default is self-explanatory code.

The pass is ordered so each track lands on a green `bun run check`:

1. Extract chat persistence helpers and unify UI message dedup.
2. Migrate edit-route `ProjectEditAttempt` writes to Prisma ORM.
3. Remove the three unsafe type casts.
4. Enrich AI error diagnostics with a sanitized message.
5. Break the generated-source type cycle with a shared types module.
6. Conservatively split the largest modules (generated starter templates, site-schema validators).
7. Make `SponsorTable` responsive with a card fallback under the small breakpoint, with a Storybook story.
8. Run the release-evidence gate: `bun run check` then Lighthouse mobile.
9. Document verified-clean no-ops (console error logs) and deferred risky splits (WorkspaceShell) in Out of Scope.

## User Stories

1. As a maintainer, I want project chat persistence to live in named helpers, so that a persistence fix touches one function instead of ten raw SQL blocks.
2. As a maintainer, I want `ProjectEditAttempt` written through one access pattern, so that schema changes do not require updating both ORM calls and hand-written SQL.
3. As a maintainer, I want the codebase to compile without bypassing Prisma and AI SDK types, so that type errors surface at compile time instead of runtime.
4. As an operator, I want AI tool-repair failures to log a sanitized error message, so that I can diagnose why a repair pass failed instead of reading `reason: unknown`.
5. As a maintainer, I want client and server to dedupe UI messages with the same text-key logic, so that refreshes and persistence never disagree on what is a duplicate.
6. As a maintainer, I want the generated-source type cycle removed, so that the import graph is acyclic and future splits do not tangle.
7. As a maintainer, I want generated build execution and starter file templates in separate modules, so that I can read build logic without scrolling past hundreds of lines of string literals.
8. As a maintainer, I want site-schema validators separated from the schema type, so that quality and candidate issue logic is independently testable and readable.
9. As a mobile visitor, I want the sponsor table to render as a readable card list on small screens, so that I do not have to horizontally scroll to read donor data.
10. As a maintainer, I want a Storybook story for the responsive sponsor surface, so that the card and table variants stay visually documented.
11. As a release owner, I want a green `bun run check` and a current Lighthouse mobile run before merge, so that the hardening pass provably did not regress quality or performance.
12. As a future agent, I want this PRD to record what was deliberately not changed and why, so that I do not re-attempt risky splits that were deferred for safety.
13. As a maintainer, I want no new code comments introduced, so that the codebase stays self-explanatory and free of comment rot.
14. As a maintainer, I want every track to preserve the exact existing behavior, so that users see no product change from this pass.
15. As a maintainer, I want the branch pushed separately from `dev` and `main`, so that the hardening pass can be reviewed before it lands.
16. As a maintainer, I want existing route tests to keep passing unchanged, so that the refactor is proven behavior-preserving by the highest possible seam.
17. As a maintainer, I want newly-extracted pure helpers to have their own small unit tests, so that the extraction is covered even if route tests do not reach every branch.
18. As a maintainer, I want the AI error sanitizer to strip secrets and headers before logging, so that enriching diagnostics never leaks sensitive request data.
19. As a maintainer, I want the generated starter template extraction to preserve every generated file byte-for-byte, so that generated project output is identical before and after.
20. As a maintainer, I want the site-schema validator split to keep the same exported function names, so that callers do not need to change import paths beyond the validator module.
21. As a mobile visitor, I want the sponsor card list to preserve all data columns (date, donor, source, support, value), so that no information is lost on the small-screen layout.
22. As a maintainer, I want the responsive sponsor surface to use the existing design tokens and surface colors, so that it matches the product chrome without new visual language.
23. As a maintainer, I want the import cycle break to move only type definitions, so that runtime behavior and bundle output are unchanged.
24. As a maintainer, I want the persistence helper signatures to accept an optional transaction client, so that the existing transactional finalize path still works.
25. As a maintainer, I want the edit-route ORM migration to preserve the exact create/update field sets and null-coalescing semantics, so that audit rows are written identically.

## Implementation Decisions

- Branch: `optimize/codebase-hardening`, cut from `dev`. Push only to this branch. Do not touch `dev` or `main`.
- No new dependencies. No new comments. Self-explanatory code only. Existing invariant-documenting comments in `brief-flow.ts`, `WorkspacePrimitives.tsx`, and `project-mark.ts` are left untouched because they record non-obvious contracts.
- All changes are behavior-preserving. The acceptance signal is: existing tests pass unchanged, `bun run check` is green, generated project output is byte-identical, and Lighthouse mobile does not regress below the documented floor.

Track A — Chat persistence dedup and UI message dedup unification:

- Extract the repeated `UPDATE "Project" SET ... = ${JSON.stringify(...)}::jsonb WHERE id = ... AND "userId" = ...` blocks in `src/app/api/projects/preview/route.ts` into named persistence helpers. The helpers accept an optional transaction client so the existing transactional paths remain supported.
- Two shapes are extracted: one that persists a full chat turn (chat messages, brief, workspace card, title) and one that persists only chat messages, plus a third for compaction results (chat summary, memory facts, last compacted message count). The conditional `brief/workspaceCard` vs `chatMessages`-only branches are preserved by having the turn helper accept optional fields.
- Move `dedupeUiMessages` into the shared chat-memory module (re-exported for the route) and make the workspace shell use the shared implementation. The shared implementation uses `getTextFromUIMessage` (trim + filter empty) so client and server agree. The shell's naive inline join is removed.
- `stripTransportDiagnosticMessages`, `parseProjectChatMessages`, and `dedupeUiMessages` composition order is preserved exactly.

Track B — `ProjectEditAttempt` ORM unification:

- Replace the hand-written `INSERT INTO "ProjectEditAttempt"` and `UPDATE "ProjectEditAttempt" SET ... COALESCE(...)` raw SQL helpers in `src/app/api/projects/[id]/edit/route.ts` with Prisma ORM calls (`prisma.projectEditAttempt.create`, `.update`).
- The ORM `create` uses the schema's default `id`, `createdAt`, `updatedAt`, and default `status` where the raw SQL hardcoded `NOW()`. The `update` preserves the null-coalescing semantics by only setting provided fields (Prisma `update` ignores `undefined`).
- The generate route already uses ORM for the same table; this track makes the edit route consistent. The `as Parameters<typeof prisma.project.update>[0]["data"]` cast in the same file is removed in Track C by constructing a typed object.

Track C — Remove unsafe type casts:

- `src/app/api/projects/preview/route.ts` `createPersistedWorkspaceToolMessage`: construct the tool part as a typed object matching the AI SDK `UIMessage["parts"]` union instead of casting via `as UIMessage["parts"][number]`. If the SDK type is too narrow for a synthesized persisted part, narrow the construction to the exact shape the SDK expects and keep behavior identical.
- `src/app/api/projects/route.ts` project create: build the create data object as a typed `Prisma.ProjectCreateInput`-compatible literal instead of `as Parameters<typeof prisma.project.create>[0]["data"]`.
- `src/app/api/projects/[id]/edit/route.ts` `persistVisualSummaryMessage`: build the update data as a typed literal instead of `as Parameters<typeof prisma.project.update>[0]["data"]`.

Track D — AI error diagnostics:

- Enrich `getSafeAiErrorLog` in `src/app/api/projects/preview/route.ts` to capture a sanitized `message`: take `error.message` (or the AI SDK error's `lastError.message`), truncate to a bounded length, and strip anything that looks like a header value, URL with credentials, or API key. Keep the existing `reason`, `statusCode`, and `retryAfter` fields.
- The sanitizer never includes raw request bodies, response headers beyond the existing `retry-after`, or full URLs. It fails closed to a short generic string if the message is not a safe primitive.
- Add a unit test covering: known message, long message truncation, message with an API-key-like substring, non-Error input, and input with no message.

Track E — Break generated-source type cycle:

- Create `src/lib/projects/generated-types.ts` exporting `GeneratedProjectFile`, `GeneratedDistFile`, `BuildGeneratedProjectResult`, and the build option/result helper types currently defined in `generated-source.ts`.
- `generated-source.ts`, `generated-app-manifest.ts`, `generated-package-policy.ts`, `generated-build-policy.ts`, `custom-source-generator.ts`, `source-edit-agent.ts`, and any test files import these types from the new module. The cycle becomes `generated-types` (leaf) <- `generated-package-policy` <- `generated-build-policy` <- `generated-source`.
- Only types move. No runtime code moves. Bundle output is unchanged.

Track F — Conservative file organization:

- Extract the generated starter template functions (`createGeneratedViteTanStackStarterFiles`, `createGeneratedViteTanStackProjectFiles`, `getBusinessRouteModule`, `createHomeRouteSource`, `createDetailRouteSource`, `createShowcaseComponentSource`, `createBusinessContentSource`, and the shared string helpers they use) into `src/lib/projects/generated-starter-templates.ts`. `generated-source.ts` re-exports the public entry points so callers that import from `generated-source` still compile. Generated output must be byte-identical; the existing `generated-source.test.ts` and `generated-package-policy.test.ts` prove it.
- Split `src/lib/projects/site-schema.ts` validators (`getProjectSiteSchemaQualityIssues`, `getProjectSiteSchemaCandidateIssues`, `resolveProjectSiteSchemaCandidate`, and the related constant/word-list data) into `src/lib/projects/site-schema-issues.ts`. The type, `createFallbackProjectSiteSchema`, `createProjectSiteSchemaFromBrief`, and `parseProjectSiteSchema` stay in `site-schema.ts`; validators are re-exported so existing imports keep working.
- `WorkspaceShell.tsx` split is deferred (see Out of Scope) because the file is cohesive and recently hardened; splitting it risks the preview lifecycle fixes landed in the last commits.

Track G — Responsive SponsorTable:

- `src/components/home/SponsorTable.tsx` renders a card list under the `sm:` breakpoint and the existing table at `sm:` and above. Both render the same columns: date, donor, source (with link), support, value. The card list uses existing surface tokens, spacing tokens, and the same pagination controls.
- Add `src/stories/SponsorTable.stories.tsx` covering a populated list (multi-page) and an empty state. This satisfies the AGENTS.md rule that repeated visual patterns land in Storybook with the change.

Track H — Release evidence:

- Run `bun run check` (locks, prettier, lint, typecheck, unit tests, knip) as the merge gate.
- Run `bun run lighthouse:mobile` for the public-page regression floor. If the local environment cannot start Chrome or build, record the blocker and the last known thresholds instead of weakening the gate.

Track I — Verified clean and deferred:

- The six `console.error`/`console.warn` sites in `preview/route.ts`, `runtime-idle-runner.ts`, and `readiness.ts` are legitimate operator error logs. Routing them through the verbose-gated `devLog` would silence them in production. No action; documented here so future agents do not re-flag them.

## Testing Decisions

- The highest seam is the existing route test layer: `src/app/api/projects/preview/route.test.ts`, `src/app/api/projects/[id]/edit/route.test.ts`, `src/app/api/projects/[id]/generate/route.test.ts`, and `src/app/api/projects/[id]/publish/route.test.ts`. These tests assert external HTTP behavior and persistence outcomes; they must pass unchanged across Tracks A, B, and C. This is the ideal single seam for the behavior-preserving refactor.
- Track A also relies on `src/lib/projects/chat-memory.test.ts` for the shared `dedupeUiMessages`/`getTextFromUIMessage` behavior. A new unit test asserts the shared dedupe trims and filters empty parts, matching the prior route behavior.
- Track B relies on `src/app/api/projects/[id]/edit/route.test.ts` for edit attempt creation and update outcomes. The test must keep passing without modification, proving ORM parity with the prior raw SQL.
- Track D adds a unit test for the enriched `getSafeAiErrorLog` sanitizer (truncation, secret stripping, non-Error input). This is a new pure-helper seam; it is the lowest seam that covers the sanitizer without spinning up the AI stream.
- Track E relies on `tsc --noEmit` (the existing typecheck gate) and the existing generated-source/package-policy tests to prove the type move is acyclic and behavior-identical.
- Track F relies on `src/lib/projects/generated-source.test.ts` and `src/lib/projects/generated-package-policy.test.ts` for byte-identical generated output, and `src/lib/projects/site-schema` tests for validator parity. The split is proven safe by these tests passing unchanged.
- Track G adds a Storybook story and relies on the existing Storybook test runner for visual regressions; the responsive behavior is verified by the story rendering both layouts.
- Track H is the release gate itself: `bun run check` green and a current Lighthouse mobile report at or above the documented floor (performance 65, accessibility 100, best practices 100, SEO 95 for public pages).
- A good test in this pass asserts external behavior (HTTP status, persisted row shape, generated file content, sanitized log shape) and never asserts on module-private internals, so the refactor can move code freely without breaking tests.

## Out of Scope

- No product behavior changes. No AI prompt edits. No confidence-gate logic changes. No streaming contract changes.
- No `RuntimeSupervisor`, `runtime-proxy`, or runtime idle changes. The isolated runtime boundary is recently hardened and governed by `docs/architecture.md` invariants.
- No enabling of `GENERATED_BUILD_EXECUTION_ENABLED` or `GENERATED_PUBLIC_EXECUTION_ENABLED`. These are intentional containment switches.
- No raw SQL to ORM migration for the chat state reads (`$queryRaw SELECT chatMessages/brief/workspaceCard`). The atomic JSONB read pattern is deliberate.
- No `WorkspaceShell.tsx` split. The file is 2725 lines but cohesive and recently hardened; splitting risks the preview lifecycle fixes. Only the shared `dedupeUiMessages` extraction touches it.
- No `generated-source.ts` starter-template split (Track F1). Template functions and runtime helpers are interleaved; a clean separation would require relocating `createGeneratedSourceSnapshotMetadata` and shared helpers (`getContentType`) and risks breaking generated project output for a purely organizational gain. The file stays whole until a future change naturally separates build execution from template authoring.
- No new code comments. Existing invariant-documenting comments are left in place.
- No new dependencies.
- No deployment topology, Docker, CI, or production env changes.
- The six `console.error`/`console.warn` operator logs are left as-is; routing them through verbose-gated `devLog` would hide production errors.

## Further Notes

- The pass is executed and verified on the `optimize/codebase-hardening` branch with `bun run check` green and Lighthouse mobile evidence captured (or the environment blocker recorded).
- The branch is pushed for review; it is not merged into `dev` or `main` by this work.
- The lazy-engineering bar for this pass: every change must beat the existing surface. Tracks that only reorganize without a real readability or correctness payoff would be dropped. The client/server dedupe mismatch (Track A) and the unknown repair-error diagnostics (Track D) are the correctness wins; the rest are readability/consistency wins gated by existing tests.
