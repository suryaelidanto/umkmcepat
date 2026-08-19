# Repository organization and zero-context agent contract

**Date:** 2026-08-19
**Status:** Draft for review
**Supersedes:** The cleanliness and comment-hygiene portions of docs/superpowers/specs/2026-07-25-codebase-cleanliness-design.md and its plan. Their behavior-preserving and gate-or-reject decisions remain in force.

## Goal

Make the repository self-steering for humans and agentic harnesses. A new contributor using Claude Code, Codex, Pi, OpenCode, or another supported harness should discover the same rules from the repository, make changes in the expected place, and finish with the same quality evidence without relying on maintainer memory or conversation context.

The result must be repeatable. A future agent should be able to answer:

- Where does this code belong?
- Which module owns this behavior?
- Where does its test belong?
- Which comments are allowed?
- Which checks are mandatory?
- What intentional exception explains the unusual shape?

## Design principles

1. **Domain before file type.** Organize by business capability or technical boundary first. Use components, hooks, and utils only when the directory genuinely owns that boundary.
2. **Ownership is visible.** A file should sit beside the module that owns its behavior. Shared code must have multiple real consumers and a stable contract.
3. **Names explain structure.** Prefer descriptive feature names over catch-all folders and vague files such as helpers.ts, misc.ts, or index.ts that hide ownership.
4. **Comments are the last resort.** Make code, names, types, and tests explain the rule. Keep only a short comment that records a non-obvious reason which the code cannot express.
5. **Checks are part of implementation.** Repository rules must be executable where practical. A written rule without a check is guidance, not a guarantee.
6. **Generated output is not hand-maintained.** Generated files have an explicit owner, an allowlist, and a regeneration or diff check. Their generated syntax does not become a pattern for authored code.
7. **Migration stays reviewable.** Move and split code in small waves, preserve behavior, run fresh gates after each wave, and keep exceptions visible.

## Current repository context

The repository already has the beginnings of this contract:

- AGENTS.md is the boot document and points agents to PRINCIPLES.md, DEV.md, PRODUCT.md, DESIGN.md, the unslop skill, and the specs README.
- DEV.md is the detailed development handbook and already requires formatting, linting, typechecking, and tests.
- CLA.md is a legal Contributor License Agreement. It must remain a legal document and must not become an agent instruction file.
- src/components/admin/ currently mixes dashboard views, shell/navigation, status logic, context state, and tests.
- src/lib/projects/ is the largest domain and must be regrouped by ownership using imports and Graphify evidence, not by arbitrary alphabetic or file-size rules.
- The current test inventory is 279 .test.ts files and four .itest.ts files. Unit globs currently include several files under tests/, while integration tests use a separate .itest.ts suffix.
- src/routeTree.gen.ts is generated and contains generated suppressions and casts. It must not be hand-edited or used as evidence that authored code may bypass type safety.

## Canonical source-tree rules

### Directory hierarchy

Use this order:

1. repository boundary, such as src/, tests/, scripts/, or docs/;
2. domain or technical boundary, such as projects, payment, admin, routes, or storage;
3. responsibility within that boundary, only when it improves discovery, such as components, workers, scaffold, or support;
4. the file.

Do not create generic catch-all directories such as misc, stuff, temp, new, helpers, or utils. A shared directory is valid only when its name describes a real stable boundary. A feature-local formatters.ts or useSomething.ts belongs with the feature, not in a global bucket.

Feature-local hooks, contexts, types, constants, schemas, formatters, and tests stay beside the feature. A filename beginning with use already communicates that it is a hook, so a generic hooks/ directory is not required.

Cross-feature code belongs in a shared domain only when at least two real consumers need the same contract and the abstraction has an owner. A first reuse case stays local until the boundary is clear.

Reusable visual primitives belong in src/components/ui/ when they are truly application-wide. Domain UI belongs in the owning domain. Do not move a component into ui/ merely because it renders JSX.

Routes remain flat where TanStack Router file-based generation requires them. Route entrypoints should validate, authorize, call the owning domain module, and serialize the response. Reusable behavior belongs in the domain module, not in a route-shaped helper folder.

### File responsibility

Split a file when it contains separate responsibilities, separate state machines, separate public contracts, or a test boundary that a reader must understand independently. Do not split solely to satisfy an arbitrary line count.

Prefer one primary exported responsibility per module. Types, constants, and tiny helpers may remain with their owner when separating them would make the behavior harder to follow.

## Test placement and naming

Tests are behavior documentation, not a file-count quota. Do not create an empty or meaningless test for every .ts or .tsx file.

Use this decision tree:

1. A test for one source module sits beside it: thing.ts and thing.test.ts, or Thing.tsx and Thing.test.tsx.
2. Several modules in one domain share a contract: keep the test beside that domain, using a name that states the contract.
3. A unit test crosses domains without one clear owner: use tests/unit/.
4. A database, queue, storage, or external-service test needs infrastructure: use tests/integration/*.itest.ts.
5. A real server, browser, mobile viewport, or user journey is required: use tests/browser/*.browser.test.ts or the repository's configured end-to-end suffix.
6. A reusable test fixture or harness is not itself a test: use tests/support/, and keep it out of test globs.

Every test must have one obvious reason to exist. Test names should describe the behavior or boundary, not the implementation detail. A source module may be classified as directly tested, covered through a boundary test, type-only/generated/configuration, static data, or requiring a deliberate test-review decision. The classification must be recorded during migration when no separate test is appropriate.

The unit, integration, and browser globs must be disjoint. A file must not be selected by two projects accidentally, and a test cannot be “integration” only because it happens to live under tests/.

## Documentation and agent entrypoints

AGENTS.md is the canonical short boot contract. It must tell an agent what to read, where code belongs, which rules are absolute, and which commands prove completion.

DEV.md is the canonical detailed handbook. It owns workflow explanations, command details, debugging procedures, environment rules, and the full organization policy. AGENTS.md points to it instead of duplicating the handbook.

Harness-specific adapter files, such as CLAUDE.md, are allowed only as small pointers to the canonical contract. They must not introduce a second policy. The first adapter is CLAUDE.md, with the same boot order as AGENTS.md; other adapter files require verified harness support and a concrete reason.

CONTRIBUTING.md explains the human contribution workflow. CLA.md remains legal text. Neither document replaces AGENTS.md or DEV.md.

## Comment policy

Delete comments that restate code, narrate control flow, preserve stale history, explain obvious test setup, or compensate for unclear naming. Delete commented-out code instead of preserving it.

Keep a comment only when all of these are true:

1. the reason is not expressible through code, types, names, or a focused test;
2. removing it would make a correct but non-obvious invariant, security rule, compatibility constraint, or deliberate simplification easy to break;
3. the comment is one short line.

Authored comments should begin with why: or the repository's existing ponytail: marker when that marker is the clearest form. Block comments and multi-line JSDoc are not allowed in ordinary authored implementation code unless an external tool or public API contract requires them. Generated headers, legal text, configuration data whose comments are part of the data, and tool-owned files are governed by their owner and must be explicitly allowlisted.

## Type and quality discipline

Authored TypeScript must not use any, as any, @ts-ignore, or an unreviewed @ts-expect-error. Authored code must not use eslint-disable, prettier-ignore, or equivalent suppressions to hide unfinished work. A narrowly scoped suppression is allowed only when the repository documents why the rule cannot express a known-correct case, and the suppression itself is checked.

Every implementation wave runs the nearest focused test and lint, then bun run check. Repository-wide changes run bun run verify. Changes touching integration, browser, route generation, build, or deployment also run the corresponding explicit command. A failing gate is a failed change. Do not use --no-verify, skip flags, broad casts, or disabled rules to obtain a green result.

## Enforcement design

Add one parser-backed discipline check with three responsibilities:

1. validate test suffixes, test placement, and disjoint test project ownership;
2. detect authored comments and type/lint suppressions using syntax-aware checks with an explicit generated-file allowlist;
3. report newly introduced generic catch-all directories and files outside the allowed top-level layout.

The check runs from bun run check and CI. It fails closed for authored code and fails loudly for an unclassified exception. It must report the file, line, rule, and repair direction. It must not parse generated output as authored source.

File-level eslint-disable used only because an executable script intentionally logs should be replaced with a scoped ESLint override for the approved script boundary. Inline suppressions should remain exceptional and reviewed.

## Migration shape

The implementation proceeds in small waves:

1. record the current inventory and exception map;
2. publish the canonical agent and organization contract;
3. add executable discipline checks and wire them into local and CI gates;
4. normalize test placement and test project globs;
5. reorganize UI and feature domains, starting with admin and projects;
6. regroup backend project-generation and route-support modules by ownership;
7. remove obsolete comments and suppressions, handling generated files through allowlists;
8. run full verification and publish the remaining exception list.

Each wave must preserve runtime behavior, keep import paths intentional, and leave the repository in a gate-passing state before the next wave begins.

## Out of scope

- Product behavior, API contracts, visual design, or generated-site output changes.
- Hand-editing generated files.
- Fake tests created only to make file counts symmetrical.
- Adding a new dependency when Bun, TypeScript, ESLint, Vitest, or existing scripts can enforce the rule.
- A single giant rename or refactor that cannot be reviewed and verified in waves.
- Turning CLA.md into an agent guide.

## Acceptance criteria

The work is accepted when:

- a fresh agent can read AGENTS.md and reach the complete policy through canonical links;
- CLAUDE.md is only an adapter and does not create a second source of truth;
- every test has an explainable owner, suffix, and test project;
- source modules are organized by domain and responsibility, with no new generic catch-all buckets;
- authored comments and suppressions pass the executable policy, while generated and legal exceptions are explicit;
- bun run check, bun run verify, and all relevant integration, browser, route-generation, and build checks pass with fresh evidence;
- the final exception list is short, owned, and documented in the canonical handbook.
