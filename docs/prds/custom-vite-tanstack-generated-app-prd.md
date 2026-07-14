# PRD: Custom Vite TanStack Generated App Builder

Status: implemented-core
Created: 2026-07-07
Updated: 2026-07-07
Owner: Surya
Scope: generated app source creation, Vite React starter, TanStack Router, AI coding agent generation, build safety
Read when: changing project generation, generated source layout, package policy, agent tool runner, build worker, preview source snapshots, or anti-template quality gates
Do not read for: routine landing page copy, auth/profile/legal pages, unrelated UI primitives, or production deployment operations
Current truth: source code + `docs/architecture.md` + `docs/deployment.md` + `docs/prds/first-release-execution-spec.md` + `docs/prds/first-release-generated-app-platform-prd.md` + `docs/prds/final-beta-release-work-order-prd.md`

## Status History

- 2026-07-07: Proposed after beta generator review showed deterministic schema/template output still felt too generic and template-like.
- 2026-07-07: Implemented core agentic generation path: Vite React TypeScript ESLint/TanStack profile, package policy, manifest support, generated-app builder skill, AI SDK ToolLoopAgent file tools, check gate, fallback metadata, and one build-repair attempt before deterministic fallback.

## Problem Statement

UMKM Cepat can now build and preview generated project artifacts, but the generated websites still feel like templates. Even after adding business variants and fallback recovery, the output is still fundamentally produced by filling a fixed React structure with user answers. Users see headings, sections, and cards that look mechanically mapped from the brief instead of thoughtfully designed and implemented for their business.

From the user's perspective, this is disappointing because they expect an AI website builder to behave like a capable engineer/designer: understand the business, create the right file structure, write custom React code, choose meaningful sections, and produce a site that feels made for them. A bengkel website should not look like a generic landing page with swapped words. A coffee shop, laundry, tutoring service, fashion shop, or home food business should not share the same information architecture with a different color palette.

From the platform perspective, the current generator is safe but too shallow. The app has useful infrastructure already: source snapshots, build attempts, deployment records, artifact storage, runtime proxying, package policy, manifest validation, and a constrained agent tool runner. The missing piece is a generation mode where AI works on a real starter codebase like an engineer, while the platform enforces safety boundaries.

The goal is to move from:

```text
brief -> schema -> preset App.tsx/styles.css with replaced variables
```

to:

```text
brief -> initialized Vite React TypeScript TanStack starter -> constrained AI coding agent edits files -> policy/build checks -> source snapshot -> build artifact -> preview
```

The user explicitly wants the generated app to start from a real React Vite starter with TypeScript, ESLint, and TanStack Router, then have AI create and modify project files inside that starter. The starter should provide engineering infrastructure, not a final business page template.

## Solution

UMKM Cepat will introduce a new generated app profile: a deterministic Vite React TypeScript starter with ESLint and TanStack Router. Every new generated project starts from this clean professional codebase. After the starter exists, a constrained AI coding agent reads the starter files, plans the project-specific file structure, writes custom routes/components/content/styles, validates the generated source, then the build worker builds the app into preview artifacts.

The starter is not a business template. It is infrastructure only:

- Vite React TypeScript configuration.
- ESLint configuration.
- TanStack Router setup.
- Project manifest.
- Safe package list.
- Preview-ready helper.
- Minimal root/index route placeholders.
- A short generated-project AGENTS guide.

The AI coding agent owns the business implementation on top of that starter:

- It can create route files.
- It can create component folders.
- It can create content modules.
- It can create custom CSS.
- It can replace the placeholder route.
- It can add static pages when needed.
- It must run the generated app check before success.

The deterministic template generator remains only as an emergency fallback. It should not be the normal path. When fallback is used, metadata must record that the custom agent path failed and why.

The first target profile remains static frontend only. Generated apps must not include arbitrary backend code, fake checkout, fake auth, fake payment processing, generated databases, or uncontrolled shell commands.

## User Stories

1. As a small business owner, I want the generated website to feel custom to my business, so that I trust the result enough to share it with customers.
2. As a small business owner, I want the app to understand my business type before building, so that the website structure matches how my customers decide.
3. As a bengkel owner, I want pages and sections about services, symptoms, booking, spare parts, and trust, so that riders know whether they should contact or visit.
4. As a bengkel owner, I want the visual style to feel technical and credible, so that customers do not see a generic shop template.
5. As a laundry owner, I want service packages, pickup flow, turnaround expectations, and care notes, so that customers understand what to book.
6. As a coffee shop owner, I want menu, ambience, visit info, and work-friendly context, so that customers know whether to come, stay, or order.
7. As a barber owner, I want haircut services, booking flow, style expectations, and trust indicators, so that customers can choose a service confidently.
8. As a fashion shop owner, I want collection, lookbook, size/stock inquiry, and ordering guidance, so that customers can browse with intent.
9. As a tutoring provider, I want subjects, student outcomes, learning process, parent trust, and schedule consultation, so that parents understand fit.
10. As a home food seller, I want daily menu, preorder rules, freshness, delivery/pickup expectations, and WhatsApp ordering, so that buyers can act quickly.
11. As a user, I want the generated file structure to be specific to my business, so that the site does not look like the same app with different words.
12. As a user, I want the AI to create route and component files, so that the app can grow beyond a single generic page.
13. As a user, I want the AI to write Indonesian customer-facing copy, so that the site is usable for local customers.
14. As a user, I want the AI to avoid dumping my raw answers into the page, so that the copy feels polished and professional.
15. As a user, I want the AI to avoid fake checkout/payment/auth/backend behavior, so that my customers are not misled.
16. As a user, I want the AI to build on a real React Vite TypeScript starter, so that the generated project feels like professional frontend code.
17. As a user, I want the AI to use routing when useful, so that richer sites can have separate pages like menu, services, catalog, or contact.
18. As a user, I want the AI to preserve the latest successful preview when new generation fails, so that failed attempts do not destroy working output.
19. As a user, I want failed custom generation to show a clear recoverable state, so that I know whether to retry, edit the brief, or use fallback.
20. As a user, I want edits after preview to modify the generated codebase, so that iteration feels like working with an engineer.
21. As a user, I want visual edits to change structure and style, not only color tokens, so that the result can meaningfully improve.
22. As a user, I want content edits to rewrite copy and components where needed, so that the site remains coherent.
23. As a platform operator, I want the starter to be deterministic and pinned, so that builds are reproducible and not dependent on upstream `latest` scaffolds.
24. As a platform operator, I want allowed dependencies controlled by package policy, so that generated apps stay safe and cheap.
25. As a platform operator, I want the AI to work through constrained file tools, so that generated source cannot escape project boundaries.
26. As a platform operator, I want every generated source state recorded as a snapshot, so that builds and edits are auditable.
27. As a platform operator, I want the generated app manifest to declare the profile and capabilities, so that runtime/build behavior stays explicit.
28. As a platform operator, I want custom generation metadata, so that I can tell whether a site came from AI-authored source or deterministic fallback.
29. As a maintainer, I want tests proving that fixture projects differ in file tree and UI structure, so that template regressions are caught early.
30. As a maintainer, I want tests proving generated package policy blocks unsupported dependencies, so that adding AI source generation does not weaken security.
31. As a maintainer, I want tests proving the generated starter builds by itself, so that the base profile is reliable.
32. As a maintainer, I want tests proving AI output must pass checks before snapshot/build success, so that the agent cannot claim false success.
33. As a maintainer, I want the deterministic fallback preserved but marked clearly, so that reliability and quality can improve independently.
34. As a future maintainer, I want a generated app builder skill, so that AI agents consistently understand how to work inside the starter codebase.
35. As a future maintainer, I want the build path to avoid interactive scaffolding during user builds, so that production remains deterministic and fast.
36. As a future maintainer, I want the starter to mirror the spirit of `npm create vite@latest` without running `latest` per user request, so that the system is professional but stable.
37. As a future maintainer, I want package versions pinned, so that releases are reproducible.
38. As a future maintainer, I want the starter profile extensible, so that platform-owned modules like forms/catalog/booking can be added later.
39. As a beta tester, I want the generated output to be visibly different across seven fixture businesses, so that the beta review proves the custom generation path.
40. As a beta tester, I want source code review evidence, so that quality is judged by actual files and not only screenshots.

## Implementation Decisions

- Do not run `npm create vite@latest` or any interactive scaffolder during normal user builds. The product should use an internal deterministic starter that mirrors the desired Vite React TypeScript ESLint setup. This avoids non-determinism, network dependency, upstream breaking changes, slow scaffolding, and supply-chain surprises.
- Add a new generated app runtime profile for a static Vite React TypeScript app with TanStack Router. The profile should be explicit in the generated app manifest so future profiles can coexist.
- Keep the generated app static frontend-only for this release. TanStack Router is for frontend routing, not generated backend behavior.
- The starter source should be infrastructure-only. It may include a placeholder route and reset/base styles, but it must not include a reusable business landing page template.
- The starter should include a preview-ready helper so generated apps can notify the workspace iframe after React renders.
- The starter should include a short generated-project agent guide that tells future editing agents how to work inside the generated app.
- The normal generation path should run a constrained AI coding agent over the starter source. The agent should read files, write files, replace content, and run checks through platform tools.
- The AI coding agent should receive the structured brief, starter files, generated app profile rules, package policy, anti-template quality rules, and user-facing language rules.
- The AI coding agent should be required to produce custom file structure and not merely edit a single app file with variable substitutions.
- The AI coding agent should be allowed to create business-specific route/component/content/style files. The file tree should vary by business where appropriate.
- The current deterministic business template should become an emergency fallback only. It should remain available to preserve reliability when AI custom source generation fails, but fallback usage must be recorded in source snapshot metadata.
- If fallback is used, the platform should not pretend custom generation succeeded. Metadata should include generation mode and fallback reason.
- Package policy must expand to allow the new starter dependencies and block everything else by default.
- Recommended default runtime dependencies for the generated profile:
  - React.
  - React DOM.
  - TanStack Router.
  - TanStack Query, included for future platform-owned data modules and safe client data fetching.
  - Lucide React for icons.
  - A tiny class-name helper such as clsx.
- Recommended default dev/build dependencies for the generated profile:
  - Vite.
  - Vite React plugin.
  - TypeScript.
  - ESLint.
  - TypeScript ESLint.
  - ESLint JS config package.
  - React type packages.
  - Browser globals package.
- Do not include broad state-management libraries by default. Zustand, Redux, Jotai, form libraries, schema libraries, animation libraries, UI kits, and payment packages should be added only when a supported product module actually needs them.
- Prefer custom CSS for generated apps over Tailwind as the default path. Custom CSS gives the agent more freedom to make unique visual systems and reduces template-like utility-class output. Tailwind may remain supported only if intentionally included in a future profile.
- Generated apps should use TypeScript for app code.
- Generated apps should include ESLint configuration and a check script.
- Build checks should run TypeScript/build validation for generated apps. Lint validation is desirable, but if it proves too slow for MVP, it must be available as a profile check and documented.
- The generated app manifest must include profile, package manager, build command, output directory, routes, capabilities, template/starter version, and generation mode metadata.
- The build worker should build generated source exactly as a generated project, not import it into the control-plane runtime.
- The source snapshot should store the final agent-authored files, not only the starter files.
- The preview should continue to use artifact-backed deployments and proxy/runtime boundaries.
- Existing edit loop work should reuse the same agent tool runner and package policy so initial generation and later edits follow the same safety model.
- A generated-app-builder skill should be added for future agents. The skill should explain the generated app profile, file boundaries, allowed packages, anti-template requirements, copy rules, design expectations, and check requirements.
- The product should not ask the human for local scaffolding steps. The platform creates the starter itself.
- The platform may use a one-time manually inspected Vite scaffold as reference when designing the internal starter, but the committed/generated starter is the source of truth.

## Testing Decisions

- The highest-value seam is the project generation flow: brief to generated source snapshot to build artifact. Tests should prefer this seam when possible.
- Unit tests should cover the starter source factory. A starter created for a project should include the manifest, package config, TypeScript config, Vite config, ESLint config, router setup, root route, index route, preview-ready helper, and base styles.
- Unit tests should cover generated app manifest validation for the new profile.
- Unit tests should cover package policy for the new profile. Allowed starter dependencies should pass; server frameworks, browser automation, native/media packages, unknown packages, lifecycle scripts, backend libraries, and payment SDKs should fail.
- Unit tests should cover the agent tool runner with the new starter profile. The runner should allow safe route/component/style creation, reject path escape, reject blocked packages, and require checks after writes.
- Unit tests should cover custom generation fallback behavior. If the custom agent fails, deterministic fallback may be used only with clear metadata and without replacing a latest successful preview on failed build.
- Integration tests should cover initial custom generation with mocked AI tool output. The test should assert that the final source includes agent-authored files and not just preset template files.
- Integration tests should cover edit loop reuse of the same generated codebase. A post-preview edit should start from latest successful source and create a new snapshot/build.
- Fixture tests should cover the seven beta businesses: angkringan, laundry, coffee shop, barber shop, fashion shop, tutoring service, and home food business.
- Fixture tests should assert file tree diversity across businesses. At minimum, generated projects should differ in route/component/content/style file names and not only in text values.
- Fixture tests should assert copy quality. Generated output must not include generic section headings such as the old template-only labels unless they are genuinely appropriate and supplemented with specific domain structure.
- Fixture tests should assert no raw answer dumping. Parenthetical option descriptions and long user answer strings should be rewritten into natural copy.
- Fixture tests should assert no unsupported fake functionality. No fake checkout, payment processing, login, database, inventory persistence, booking persistence, or backend API behavior should appear unless a platform-owned module supports it.
- Fixture tests should assert preview-ready behavior remains present.
- Build tests should run generated app builds for at least representative fixtures. Full seven-fixture builds are ideal for release gates, but cheaper contract tests should run first.
- Browser review remains necessary for visual quality. Automated tests can catch template sameness, but final design judgment still needs visual inspection.
- Existing prior art in the codebase includes generated source tests, generated app manifest tests, generated package policy tests, agent tool runner tests, deployment resolution tests, workspace sync tests, route tests for preview/source/runtime/publish, and build worker/log tests. New tests should follow those patterns.

## Out of Scope

- Running `npm create vite@latest` during production user builds.
- Arbitrary generated backend code.
- User-provided Dockerfiles.
- Generated databases or user-managed database schemas.
- Real payment processing.
- Fake checkout, fake payment, fake auth, or fake booking persistence.
- Unrestricted package installation.
- Native binary dependencies.
- Browser automation workloads inside generated apps.
- Long-running user jobs.
- Full code editor parity.
- Full custom domain UI.
- Multi-node runtime scheduling.
- Production deployment, DNS changes, production migrations, or secret rotation.
- Replacing the existing source snapshot/build/deployment/runtime architecture.

## Further Notes

The user's requested direction is feasible and aligns with the existing architecture. The current system already has source snapshots, build attempts, artifact storage, package policy, manifest validation, a build worker seam, and constrained file tools. The main change is to make the default generation path agent-authored source over a real starter project instead of schema-filled UI templates.

Implementation state:

1. New generated app profile and starter contract: done.
2. Starter/source generation tests: done.
3. Manifest and package policy expansion: done.
4. Generated app builder skill: done.
5. Custom source generation seam with constrained AI file tools: done.
6. Build route custom generation first: done.
7. Deterministic fallback with metadata: done.
8. Seven-fixture anti-template/source diversity tests: partially covered by contract tests; browser review remains human-owned.
9. Targeted tests, full check, and representative generated build: done during implementation.
10. Browser review before claiming visual quality: still required and intentionally human-owned.

This PRD intentionally favors deterministic platform scaffolding over interactive CLI scaffolding. The generated projects should feel like Vite React TypeScript projects, but the platform should not depend on a changing upstream `latest` command for every user build.
