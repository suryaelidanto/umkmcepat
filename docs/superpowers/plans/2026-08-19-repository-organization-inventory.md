# Repository organization migration inventory

**Date:** 2026-08-19
**Baseline commit:** 962764c7
**Graph snapshot:** 84cc3ac5, generated before the documentation-only commit
**Purpose:** Factual baseline for the repository organization and zero-context agent contract migration.

## Worktree and policy sources

- Branch: dev
- Worktree was clean before this inventory.
- Canonical boot document: AGENTS.md
- Detailed workflow document: DEV.md
- Human contribution workflow: CONTRIBUTING.md
- Legal contributor document: CLA.md
- Decision trail: docs/superpowers/specs and docs/superpowers/plans
- No CLAUDE.md existed at baseline.
- No source, test, or configuration changes are included in this inventory wave.

## Test inventory

| Class | Count | Current selection |
| --- | ---: | --- |
| .test.ts files | 279 | 248 under src, 34 under tests, 1 under scripts |
| .test.tsx files | 0 | none |
| .itest.ts files | 4 | tests/integration only |
| Source route tests | 16 | src/routes, including generator-safe hyphen-prefixed files |
| External route tests | 23 | tests/routes |
| Integration setup | 1 | tests/integration/setup.ts |

Current Vitest selection:

- unit selects src/**/*.test.ts, tests/**/*.test.ts, and scripts/**/*.test.ts;
- integration selects tests/integration/**/*.itest.ts;
- the unit and integration projects are currently disjoint by suffix, but several files under tests/integration use .test.ts and are therefore unit tests in practice;
- no browser-specific project exists;
- tests/routes/_handler.ts is a helper, not a test, but its directory is test-shaped and it is imported by source route tests.

Current non-integration tests that need relocation or classification:

- tests/routes/*.test.ts: route behavior should merge into the owning src/routes test file or split by route contract;
- tests/lib/community-contributors.test.ts, tests/lib/feature-flags.test.ts, and tests/lib/landing-cache.test.ts: direct tests for src/lib modules and should colocate;
- tests/integration/build-pipeline.test.ts: mocked cross-module unit behavior, not infrastructure-backed integration;
- tests/integration/discussion-readiness.test.ts: readiness behavior, with an existing focused source test in src/lib/projects/build-readiness.test.ts;
- tests/integration/homepage-cache.test.ts: cache behavior spanning query-client modules, without external infrastructure;
- tests/mobile/device-capture.test.ts: live-server mobile audit that needs a browser or server-audit project and a non-unit suffix;
- tests/integration/setup.ts: retain as integration setup, excluded from test assertions.

## Source layout candidates

### Frontend

src/components/admin currently mixes:

- dashboard composition and data presentation;
- shell and navigation;
- status badge/filter presentation;
- status rules;
- streamer-mode context state;
- domain-specific sensitive text.

The first review candidates are AdminOverviewDashboard.tsx, AdminShell.tsx, admin-status.ts, streamer-mode-context.tsx, and SensitiveText.tsx. Move only after importer and test ownership checks.

src/components/projects contains large workspace modules. WorkspaceShell.tsx is the largest authored frontend module at 153,376 bytes, followed by WorkspacePrimitives.tsx at 34,149 bytes. Split only at stable responsibility and test boundaries.

Existing component boundaries include common, community, form, home, legal, payment, profile, projects, providers, and ui. There is no global hooks directory. Preserve feature-local use* modules beside their owners.

### Backend

src/lib/projects is the largest application domain. Candidate boundaries include:

- brief flow and canonical brief;
- discussion turn worker and response shaping;
- build readiness and build planning;
- attempt workers and queue coordination;
- batched generation and editing;
- generated source and generated-site gates;
- scaffold archetypes and shadcn starter data;
- preview, runtime proxy, and runtime supervision;
- generation evaluation.

Large authored candidates include:

| File | Approximate bytes | Review concern |
| --- | ---: | --- |
| src/lib/projects/scaffold/shadcn-components.ts | 142,492 | generated or catalog-like data ownership |
| src/lib/projects/batched-generator.ts | 78,912 | orchestration and generation boundaries |
| src/lib/projects/generated-site-gates.ts | 57,657 | gates, source normalization, and generated templates |
| src/lib/projects/build-attempt-worker.ts | 54,155 | worker orchestration and side effects |
| src/lib/projects/batched-prompt.ts | 58,230 | prompt construction boundary |
| src/lib/projects/generated-site-contract.ts | 49,370 | contract and validation ownership |
| src/lib/projects/professional-site-source-gates.ts | 48,132 | generated-source policy boundary |
| src/lib/projects/brief-flow.ts | 38,501 | brief state transitions |
| src/lib/projects/discuss-turn-worker.ts | 36,795 | discussion orchestration |

src/routeTree.gen.ts is 93,560 bytes and is generated. It is not a refactor candidate and must remain in the generated-file allowlist.

## Comment and suppression inventory

The initial targeted scan found:

- four file-level eslint-disable directives, in scripts/check-parallel.ts, scripts/sync-env.ts, scripts/sweep-orphan-project-resources.ts, and src/scripts/init-s3-buckets.ts;
- no @ts-ignore directives in authored source, scripts, or tests;
- no @ts-expect-error directives in the same scan;
- two literal as any occurrences inside generated-site template strings, which require parser-aware review because the text is emitted code rather than a runtime cast in this repository;
- many authored comments, including restating comments, deliberate invariant comments, generated/tooling explanations, and legal/configuration data. A raw comment count is not a safe deletion queue.

Known exception classes:

| Exception | Owner | Required treatment |
| --- | --- | --- |
| src/routeTree.gen.ts | route generator | never hand-edit; regenerate and diff-check |
| generated-site template strings | generated-site gate owner | parse emitted syntax separately from authored TypeScript |
| script console logging | script boundary | replace file-level disables with scoped ESLint configuration |
| legal and configuration comments | document or tool owner | preserve data; exclude from authored implementation policy |
| one-line non-obvious why comments | owning module | keep only when code and tests cannot express the reason |

## Generic and shared-folder candidates

The current tree contains broad shared areas such as src/components/common, src/components/ui, src/lib/support, and src/lib/uploads. These are not automatic violations. Each must be checked for stable ownership and multiple real consumers.

No new generic folders should be added. Existing names such as helpers or utils require a concrete boundary record before any move or exemption.

## Migration mapping

| Surface | Proposed owner | Main risk | Verification |
| --- | --- | --- | --- |
| Route tests | owning src/routes route test | duplicate assertions or generator naming | focused route tests, typecheck, unit project |
| Direct lib tests | adjacent src/lib or src/lib/projects test | import path and mock-scope changes | focused test, lint, typecheck |
| Infrastructure tests | tests/integration/*.itest.ts | accidentally running without services | integration project against database |
| Live mobile audit | tests/browser/*.browser.test.ts | server and browser environment assumptions | configured browser/server audit |
| Admin components | feature-owned component directories | changed public imports or visual behavior | admin tests, lint, typecheck |
| Workspace components | project workspace boundaries | state and prop contract drift | project component tests, UI checks |
| Project generation | contract-owned src/lib/projects boundaries | output or orchestration behavior | changed tests, gates, Knip |
| Authored comments and suppressions | discipline checker plus source repair | false positives in data/templates | checker fixtures, full check |

## Required next actions

1. Publish the canonical boot and handbook rules.
2. Add the parser-backed discipline checker with explicit generated exceptions.
3. Make TypeScript, Vitest, Knip, and CI cover the final test classes.
4. Move tests in small route, lib, integration, and browser batches.
5. Reorganize frontend and backend domains only after importer evidence.
6. Remove comments and suppressions using the checker report, not raw search output.
7. Record any remaining exception with an owner, reason, and verification command.
