# Repository organization and zero-context agent contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan.

**Goal:** Make the repository consistently organized by domain and responsibility, make test ownership and placement explicit, remove unjustified comments and suppressions, and make the rules executable and discoverable by a fresh human or agentic harness.

**Architecture:** Preserve runtime behavior while migrating in reviewable waves. Keep AGENTS.md as the short canonical boot contract and DEV.md as the detailed handbook. Add one parser-backed discipline checker, make test-project globs disjoint, use colocated tests for single-module behavior, and reserve top-level test directories for cross-domain, infrastructure, browser, and support boundaries.

**Tech Stack:** Bun, TypeScript, ESLint, Prettier, Vitest, Knip, TanStack Router, Graphify, GitHub Actions.

## Global Constraints

- Work from the current dev branch. Do not reset, discard, or overwrite unrelated user changes.
- Preserve runtime behavior, public API behavior, generated output, user-facing copy, and test meaning unless a migration requires an import-path update.
- Use Bun only. Keep bun.lock canonical.
- Organize by domain and ownership. Do not create generic misc, stuff, temp, new, helpers, or utils catch-all directories.
- Do not create empty tests merely to make every source file symmetrical. Every test must document a behavior or boundary.
- Delete restating and narrative comments. Keep only a one-line why: or ponytail: comment when code, types, names, and tests cannot express the reason.
- Do not add any, as any, @ts-ignore, unreviewed @ts-expect-error, eslint-disable, prettier-ignore, or equivalent bypasses to authored code.
- Do not hand-edit generated files. Add generated files to explicit allowlists and verify them through their generator or diff check.
- Do not use --no-verify, skip flags, broad casts, disabled lint rules, or relaxed test commands to obtain a green result.
- Before each wave, inspect the exact files and imports. After each wave, run the nearest focused checks and bun run check.
- Run bun run verify before handoff. Run integration, browser, route-generation, and build checks when the changed surface requires them.
- Record intentional exceptions with an owner and reason in the canonical documentation or the generated inventory. An exception without an owner is a failed migration.
- Use small commits or equivalent reviewable checkpoints. Do not combine a mechanical move with unrelated behavior changes.

---

## Task 1: Capture the baseline inventory and exception map

**Files:**

- Create docs/superpowers/plans/2026-08-19-repository-organization-inventory.md
- Read AGENTS.md, DEV.md, CONTRIBUTING.md, CLA.md, vitest.config.ts, tsconfig.json, knip.json, eslint.config.*, package.json, and .github/workflows/*
- Read the current cleanliness design and plan under docs/superpowers/specs/2026-07-25-* and docs/superpowers/plans/2026-07-25-*
- Read the generated Graphify output through the repository's documented command and do not add the ignored output to Git

**Steps:**

1. Confirm the starting branch and worktree state with git status --short --branch and git diff --stat.
2. Regenerate or refresh the repository graph with bun run graph:update when the graph is stale. Record the graph revision and use it only for discovery.
3. Inventory all authored source, test, script, documentation, generated, and support files with rg --files.
4. Record every .test.ts, .test.tsx, .itest.ts, and browser or end-to-end test file with its current Vitest project.
5. Record test files under src/, tests/, and scripts/, including duplicate route ownership between src/routes/ and tests/routes/.
6. Record current comments and suppression forms using syntax-aware or targeted searches. Separate authored files from generated files, legal files, fixtures, prompt data, and configuration data.
7. Record generic directory names, ambiguous helpers, barrel files, and large mixed-responsibility candidates. Treat them as review candidates, not automatic moves.
8. For each candidate, record current owner, proposed owner, importers, test owner, behavior risk, and verification command.
9. Include the current known generated exception src/routeTree.gen.ts and the current script logging boundary in the exception map.

**Verification:**

~~~text
git status --short --branch
git diff --check
bun run check:docs
~~~

Expected result: the inventory is a factual snapshot with counts and named exceptions, and the worktree contains no source or generated changes from discovery.

## Task 2: Publish the canonical zero-context contract

**Files:**

- Modify AGENTS.md
- Modify DEV.md
- Create CLAUDE.md
- Modify CONTRIBUTING.md only if its workflow contradicts the canonical contract
- Modify docs/superpowers/README.md only if it needs to identify the new spec and plan as the current decision trail

**Steps:**

1. Keep AGENTS.md short enough to be read on startup. Add the canonical organization, test-placement, comment, suppression, and quality-gate rules.
2. Keep the existing product and safety rules in AGENTS.md. Add links to the new spec, the detailed DEV.md sections, and the inventory format.
3. Add a clear boot sequence: read AGENTS.md, then the named canonical docs, then the applicable local instructions, then the nearest source and test.
4. Add the source-tree decision tree to DEV.md, including domain ownership, route constraints, shared-code thresholds, and the test decision tree.
5. Define the allowed test suffixes and explain why colocated unit tests and infrastructure/browser tests have different locations.
6. Define the deletion-first comment policy and the only allowed authored comment shape.
7. Define the no-bypass rule with examples of forbidden forms and the required repair path.
8. Document that CLA.md is legal text and must never be treated as an agent policy source.
9. Create CLAUDE.md as a short pointer to AGENTS.md and DEV.md. Do not duplicate the policy or add Claude-specific behavior.
10. Add an explicit rule that harness-specific files must point to the same canonical documents.

**Verification:**

~~~text
bun run check:docs
bun run format:check
git diff --check
~~~

Expected result: a fresh agent can discover one policy from AGENTS.md, and CLAUDE.md contains only the canonical pointer.

## Task 3: Add the parser-backed repository discipline checker

**Files:**

- Create scripts/check-codebase-discipline.ts
- Create scripts/check-codebase-discipline.test.ts
- Modify package.json
- Modify scripts/check-parallel.ts
- Modify eslint.config.* only for a scoped approved script boundary
- Modify knip.json if the new script test or test suffixes need explicit entry configuration
- Modify DEV.md with checker ownership and failure repair instructions

**Steps:**

1. Implement a Bun-compatible checker with deterministic output and no new dependency.
2. Define one explicit generated-file allowlist containing src/routeTree.gen.ts and any other generated path verified from repository configuration. Do not allow a broad generated glob without a named owner.
3. Define test classifications:
   - colocated unit test beside one source module;
   - domain test beside a domain boundary;
   - tests/unit/ for cross-domain unit behavior;
   - tests/integration/*.itest.ts for infrastructure-backed tests;
   - tests/browser/*.browser.test.ts for browser or real-server behavior;
   - tests/support/ for fixtures and harnesses, excluded from test globs.
4. Validate that unit, integration, and browser test globs are disjoint. Report the selected project and the repair direction for every violation.
5. Detect authored line comments, block comments, and suppression directives with a TypeScript-aware parser or the repository's existing parser tooling. Do not flag string literals, template data, generated files, legal text, or configuration comments as authored implementation comments.
6. Permit only the documented one-line why: or ponytail: authored exception, and require the file to be listed when a tool-owned exception is necessary.
7. Detect any, as any, @ts-ignore, unreviewed @ts-expect-error, file-level lint disables, and formatting bypasses in authored TypeScript. Do not use a raw substring rule that flags expect.any, natural-language text, or generated templates.
8. Detect newly introduced generic catch-all directories and ambiguous catch-all filenames. Allow existing deliberate boundaries only when the inventory records their owner and purpose.
9. Produce actionable failures containing path, line, rule, observed form, and repair guidance. Exit nonzero on failure.
10. Add focused tests for allowed and rejected comments, generated exceptions, suppression forms, test placement, test-project overlap, and generic directories.
11. Add bun run check:discipline to package.json.
12. Add the discipline checker to the parallel fast gate in scripts/check-parallel.ts.
13. Ensure the checker itself is included in formatting, linting, typechecking, unit tests, and Knip.

**Verification:**

~~~text
bun run check:discipline
bun test scripts/check-codebase-discipline.test.ts
bunx eslint scripts/check-codebase-discipline.ts scripts/check-codebase-discipline.test.ts
bunx tsc --noEmit
bun run check
~~~

Expected result: clean authored code passes, each deliberate exception is explicit, and an intentionally invalid fixture fails for the expected reason.

## Task 4: Make quality gates cover the actual repository

**Files:**

- Modify package.json
- Modify vitest.config.ts
- Modify tsconfig.json
- Modify knip.json
- Modify scripts/check-parallel.ts
- Modify .github/workflows/* only where CI does not run the same discipline and test-project checks
- Modify DEV.md with the final command matrix

**Steps:**

1. Keep unit tests, integration tests, and browser tests in disjoint Vitest projects.
2. Change the unit include set to cover only src/**/*.test.ts, scripts/**/*.test.ts, and tests/unit/**/*.test.ts.
3. Keep tests/integration/**/*.itest.ts in the integration project. Move any infrastructure test currently ending in .test.ts to the integration suffix.
4. Add the configured browser or end-to-end include for tests/browser/**/*.browser.test.ts without mixing it into the unit project.
5. Include all authored test and checker files in typechecking. Do not rely on accidental transitive imports to typecheck a test file.
6. Include every supported test suffix in Knip without adding generated output or support fixtures as test entries.
7. Keep bun run check as the fast local gate and make the discipline checker one of its parallel steps.
8. Keep bun run verify as the repository-wide gate. Document that CI separately runs build, route generation, generated-file diff validation, integration tests, and browser checks where configured.
9. Replace file-level eslint-disable no-console in approved executable scripts with a scoped ESLint configuration override. Do not add a source-wide console exemption.
10. Ensure every changed command prints a clear label and preserves nonzero exit codes.

**Verification:**

~~~text
bun run format:check
bun run lint
bun run typecheck
bun run test:full
bun run check
bun run verify
~~~

Expected result: no test is silently omitted from typechecking or Knip, and no test file is selected by more than one test project.

## Task 5: Normalize test placement and route-test ownership

**Files:**

- Move or merge tests/routes/admin-transactions-verify.test.ts into src/routes/-api.admin.transactions.$orderId.verify.test.ts
- Move or merge tests/routes/api.community.contributors.test.ts into src/routes/-api.community.contributors.test.ts
- Move or merge tests/routes/api.flags.test.ts into src/routes/-api.flags.test.ts
- Move or merge tests/routes/api.projects.$id.assets.upload.test.ts into src/routes/-api.projects.$id.assets.upload.test.ts
- Move or merge tests/routes/api.uploads.temp-images.test.ts into src/routes/-api.uploads.temp-images.test.ts
- Move or merge tests/routes/auth.turnstile.test.ts into src/routes/-api.auth.turnstile.test.ts
- Move or merge tests/routes/health.live.test.ts into src/routes/-api.health.live.test.ts
- Move or merge tests/routes/health.ready.test.ts into src/routes/-api.health.ready.test.ts
- Move or merge tests/routes/moderation.project-request.test.ts into src/routes/-api.moderation.project-request.test.ts
- Move or merge tests/routes/p.slug.splat.test.ts into src/routes/-p.$slug.$.test.ts
- Move or merge tests/routes/profile.test.ts into src/routes/-api.profile.test.ts
- Move or merge tests/routes/projects.id.edit.test.ts into src/routes/-api.projects.$id.edit.test.ts
- Move or merge tests/routes/projects.id.generate.test.ts into src/routes/-api.projects.$id.generate.test.ts
- Move or merge tests/routes/projects.id.preview.splat.test.ts into src/routes/-api.projects.$id.preview.$.test.ts
- Move or merge tests/routes/projects.id.publish.test.ts into src/routes/-api.projects.$id.publish.test.ts
- Move or merge tests/routes/projects.id.restart.test.ts into src/routes/-api.projects.$id.restart.test.ts
- Move or merge tests/routes/projects.id.runtime.test.ts into src/routes/-api.projects.$id.runtime.test.ts
- Move or merge tests/routes/projects.id.source.test.ts into src/routes/-api.projects.$id.source.test.ts
- Move or merge tests/routes/projects.id.thumbnail.test.ts into src/routes/-api.projects.$id.thumbnail.test.ts
- Move or merge tests/routes/projects.moderate.test.ts into src/routes/-api.projects.moderate.test.ts
- Move or merge tests/routes/projects.test.ts into src/routes/-api.projects.test.ts
- Move or merge tests/routes/sitemap.test.ts into src/routes/-sitemap[.]xml.test.ts
- Split tests/routes/payment.test.ts by route contract into src/routes/-api.payment.create.test.ts, src/routes/-api.payment.status.$orderId.test.ts, and src/routes/-api.payment.webhook.test.ts
- Move tests/routes/_handler.ts to tests/support/route-handler.ts
- Move tests/lib/community-contributors.test.ts to src/lib/community-contributors.test.ts
- Move tests/lib/feature-flags.test.ts to src/lib/feature-flags.test.ts
- Move tests/lib/landing-cache.test.ts to src/lib/landing-cache.test.ts
- Merge tests/integration/discussion-readiness.test.ts into src/lib/projects/build-readiness.test.ts because the source module already owns the focused readiness test
- Move tests/integration/build-pipeline.test.ts to tests/unit/build-pipeline.test.ts because it is a mocked cross-module unit contract, not infrastructure-backed integration
- Move tests/integration/homepage-cache.test.ts to tests/unit/homepage-cache.test.ts because it crosses query-cache modules without one owning source module and does not require external infrastructure
- Move tests/mobile/device-capture.test.ts to tests/browser/device-capture.browser.test.ts because it audits a live server surface
- Keep tests/integration/setup.ts as integration setup and move no test assertions into it
- Keep tests/integration/*.itest.ts for actual integration tests
- Keep scripts/generated-site-contrast.test.ts beside its script unless its execution requires a separate project
- Modify vitest.config.ts, tsconfig.json, knip.json, and imports as required by the final ownership

**Steps:**

1. Build a source-to-test mapping before each move. Confirm whether the destination already exists.
2. Use versioned moves and explicit merges. Never overwrite a destination test.
3. Preserve route-generator-safe hyphen-prefixed test naming for route files.
4. Move support helpers out of test globs.
5. Remove empty directories only after rg --files confirms they have no tracked or required files.
6. Update imports and test configuration in the same change as each move.
7. Run the nearest focused test after each domain batch.

**Verification:**

~~~text
bun run check:discipline
bun run test:changed
bun run typecheck
bun run knip
bun run check
~~~

Expected result: every test has one owner and one test project, route tests are discoverable beside route contracts, and no test assertion disappears during a merge.

## Task 6: Reorganize frontend code by feature ownership

**Files:**

- Review and regroup src/components/admin/AdminOverviewDashboard.tsx
- Review and regroup src/components/admin/AdminShell.tsx
- Review and regroup src/components/admin/AdminStatusBadge.tsx
- Review and regroup src/components/admin/AdminStatusFilter.tsx
- Review and regroup src/components/admin/AdvancedSettingsDisclosure.tsx
- Review and regroup src/components/admin/DashboardCard.tsx
- Review and regroup src/components/admin/SensitiveText.tsx
- Review and regroup src/components/admin/admin-status.ts
- Review and regroup src/components/admin/streamer-mode-context.tsx
- Review src/components/projects/WorkspaceShell.tsx, WorkspaceComposer.tsx, WorkspacePreview.tsx, WorkspacePrimitives.tsx, and their colocated tests
- Modify imports and route/component consumers for every intentional move

**Steps:**

1. Use Graphify and import searches to identify actual feature boundaries before moving files.
2. Keep admin dashboard shell/navigation separate from admin status presentation and streamer-mode state when those boundaries have independent consumers.
3. Keep pure status rules beside their status test. Keep domain components beside the feature they render.
4. Keep reusable primitives in src/components/ui/ only when at least two domains consume the same visual contract.
5. Keep feature-local hooks, context, schemas, constants, and formatters in the feature directory. Do not introduce a global hooks/ or utils/ bucket.
6. Split WorkspaceShell.tsx only where the extracted module has a clear responsibility and test boundary. Avoid visual or behavior changes.
7. Preserve route-level public imports or add deliberate compatibility exports only when an existing consumer requires them. Remove compatibility exports once all consumers move.
8. Move or merge tests with the owning component or feature during the same wave.

**Verification:**

~~~text
bun run format:check
bunx eslint src/components
bunx tsc --noEmit
bun test --run src/components/admin
bun test --run src/components/projects
bun run check
~~~

Expected result: an engineer can find admin, project workspace, shared UI, and feature-local state from the directory tree without inspecting a generic bucket first.

## Task 7: Reorganize backend domains and route support

**Files:**

- Review and regroup src/lib/projects/
- Review and regroup src/lib/projects/scaffold/
- Review and regroup src/lib/projects/generated-site-gates.ts
- Review and regroup src/lib/projects/batched-generator.ts
- Review and regroup src/lib/projects/batched-edit.ts
- Review and regroup src/lib/projects/build-attempt-worker.ts
- Review src/lib/s3-client.ts
- Review src/lib/use-feature-flag.ts and other cross-domain modules that may be feature-local
- Review src/routes/ route entrypoints and route-adjacent helpers
- Modify imports, aliases, Knip configuration, and docs for every intentional move

**Steps:**

1. Start with the Graphify community boundaries and importer counts. Do not make directory decisions from filenames alone.
2. Group project brief flow, discussion turns, build planning, attempts, generation, editing, scaffold, preview, runtime supervision, and generated-source gates by their actual contracts.
3. Keep storage ownership explicit. src/lib/s3-client.ts remains in a storage boundary unless the importer map proves a narrower owner.
4. Keep route entrypoints thin. Move reusable validation, orchestration, and serialization support into the domain module that owns it.
5. Keep generated scaffold data and generator code separate from runtime application code.
6. Split large files only when a stable module boundary exists. Each extracted module gets a focused test or is classified as covered through a boundary.
7. Remove obsolete barrel exports and update all importers. Run Knip after each domain batch.
8. Do not alter generated-site contracts, output, or product behavior.

**Verification:**

~~~text
bun run graph:update
bun run test:changed
bun run lint
bun run typecheck
bun run knip
bun run check
~~~

Expected result: project-generation and runtime-support code is grouped by stable ownership, and route files remain discoverable without becoming a second domain layer.

## Task 8: Remove comments and authored bypasses

**Files:**

- All authored TypeScript and TSX files identified by the inventory
- src/routeTree.gen.ts only through generation and diff checks, never manual edits
- scripts/check-parallel.ts
- scripts/sync-env.ts
- scripts/sweep-orphan-project-resources.ts
- src/scripts/init-s3-buckets.ts
- eslint.config.*
- DEV.md exception table

**Steps:**

1. Run the discipline checker and use its line-level report as the work queue.
2. Delete comments that restate implementation, narrate obvious control flow, preserve dead code, or record stale history.
3. Rewrite unclear identifiers or extract a named predicate when a comment exists only to explain a vague name.
4. Keep only one-line why: or ponytail: comments for non-obvious invariants, compatibility behavior, security boundaries, or deliberate simplifications.
5. Replace file-level script logging disables with scoped ESLint configuration. Preserve the required logging behavior.
6. Replace any and broad casts with unknown, explicit types, discriminated unions, or validated boundary shapes.
7. Replace @ts-ignore with a real repair. Keep an @ts-expect-error only when the failing type is the tested contract and the line has a documented, checked reason.
8. Treat prompt strings, generated templates, legal text, fixtures, and configuration comments according to their owner. Do not damage data while removing implementation comments.
9. Regenerate route output through the repository command if a source change affects it, then inspect the diff for unexpected generated changes.
10. Update the exception table whenever a legitimate exception remains.

**Verification:**

~~~text
bun run check:discipline
bun run format:check
bun run lint
bun run typecheck
bun run test:full
bun run check
~~~

Expected result: authored code has no unjustified comments or bypasses, and every remaining exception is narrow, visible, and owned.

## Task 9: Run final gates and publish the decision trail

**Files:**

- AGENTS.md
- DEV.md
- CLAUDE.md
- docs/superpowers/specs/2026-08-19-repository-organization-and-agent-contract-design.md
- docs/superpowers/plans/2026-08-19-repository-organization-and-agent-contract.md
- docs/superpowers/plans/2026-08-19-repository-organization-inventory.md
- Any final exception or migration record identified by the implementation

**Steps:**

1. Read the final diff as a fresh contributor. Check that each moved file has one obvious owner and each test has one obvious project.
2. Check that no instruction document duplicates or contradicts AGENTS.md and DEV.md.
3. Check that the discipline checker reports zero unclassified violations.
4. Run the complete local gate and all relevant CI-equivalent commands.
5. Confirm route generation and generated-file diff checks are clean.
6. Confirm the worktree contains no secrets, .env changes, live project data, logs, screenshots, or ignored Graphify output.
7. Review git diff --check, git status --short --branch, and the staged diff before committing.
8. Commit the documentation and implementation waves with conventional commit messages that describe one concern at a time.
9. After committing, inspect git show --stat --oneline HEAD and rerun the relevant verification if a hook modified files.
10. Record the final verification commands and outcomes in the handoff.

**Verification:**

~~~text
bun run check
bun run verify
bun run test:integration
bun run build
git diff --check
git status --short --branch
~~~

Expected result: all required gates pass with fresh evidence, the final exception list is explicit, and the repository can guide a zero-context agent without a second verbal briefing.
