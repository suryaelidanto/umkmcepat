# PRD: First Release Generated App Platform

Status: proposed
Created: 2026-07-07
Updated: 2026-07-07
Owner: Surya
Scope: first release roadmap, generated app platform, build/runtime reliability, publishing, beta readiness
Read when: planning, implementing, reviewing, or splitting first release work for generated apps, previews, build workers, runtime supervision, publishing, custom domains, or beta quality gates
Do not read for: routine copy polish, unrelated auth/profile work, legal pages, one-off component cleanup, or provider-only maintenance
Current truth: source code + `docs/architecture.md` + `docs/deployment.md` + `docs/prds/isolated-project-runtime-prd.md`

## Status History

- 2026-07-07: Drafted as the first release roadmap after research into Open Lovable, Adorable, Beam's Lovable clone, Vercel Sandbox, Freestyle, Beam Sandbox, and the current UMKM Cepat runtime foundation.
- 2026-07-07: Added `docs/prds/first-release-execution-spec.md` as the engineer-ready execution contract for state machines, API contracts, resolver policy, operational limits, review fixtures, and implementation slices.

## Problem Statement

UMKM Cepat has a working early builder flow: a user can create a project, discuss business needs, receive a structured build recommendation, generate source/build artifacts, and preview a generated site. The direction is correct, but the current product is not yet beta-ready for real UMKM users because the generated output can still feel templated, preview state can break after failed rebuilds, build/runtime behavior is not yet durable enough, and the system does not yet expose a clear path from guided discussion to custom multipage apps with lightweight backend features.

From the user's perspective, the product must feel like:

- "I explain my business in plain Indonesian."
- "The app understands what I need."
- "It builds a real website or small app that is specific to my business."
- "I can review it, ask for edits, and publish it."
- "The website keeps working even when I rebuild or make mistakes."

From the platform operator's perspective, the product must stay cheap, bounded, observable, and safe on small VPS infrastructure. UMKM Cepat should become a constrained generated-app platform, not a toy template generator and not an unrestricted hosting platform for arbitrary workloads.

The core problem is to ship a first release that beta testers can trust while preserving the architecture needed for future full-stack apps, custom domains, payments, quotas, and scale-to-zero runtime management.

## Solution

UMKM Cepat will ship a first release as a "Vercel-lite" generated-app platform for Indonesian UMKM, constrained to small and medium web projects.

The first release supports:

- Guided Indonesian discussion before build.
- A durable structured brief.
- A real generated app source workspace.
- Multipage, responsive, custom business websites.
- Lightweight interactive React experiences.
- Platform-owned backend modules for simple business needs.
- Build progress, build logs, and visible failure recovery.
- Private preview with cold-start recovery.
- Public publishing from the latest successful build.
- A foundation for custom domains.
- A quality checker that blocks misleading or broken generated output.

The first release does not support arbitrary heavy compute, unrestricted backend code, native binaries, long-running user jobs, or custom infrastructure per project.

The product should grow through stable platform seams:

```text
Project Brief -> Source Snapshot -> Build Attempt -> Deployment -> Runtime Supervisor -> Proxy
```

AI may create or edit generated app source, but generated code remains untrusted data until it is processed by the build and runtime planes. The control-plane Next.js app must never import or evaluate generated user code.

## First Release Outcome

The first release is ready when a beta tester can complete this flow without developer help:

1. Sign in.
2. Create a project in Indonesian.
3. Answer guided questions or type freely.
4. Review a clear build-ready brief.
5. Start a build.
6. Watch build progress.
7. See a generated custom website in the preview.
8. Ask for at least one design/content edit through chat.
9. Rebuild without losing the last successful preview if the rebuild fails.
10. Publish a public URL.
11. Reopen the project later and see the same current state.

The platform is ready when an operator can:

1. Run the app on one VPS with documented environment variables.
2. Keep artifacts and uploads durable across restarts.
3. Bound AI, build, storage, and runtime cost through quotas and rate limits.
4. See build/runtime events when something fails.
5. Stop idle preview runtimes.
6. Recover from failed builds without corrupting successful deployments.
7. Extend the system to additional runtime nodes later without changing the product model.

## Roadmap

### Phase 0: Stabilize The Current Builder Spine

Goal: make the current product reliable before adding more generation power.

Expected outcome:

- A failed rebuild never hides or breaks the latest successful preview.
- Private preview, source, runtime status, and publish flows prefer the latest successful artifact.
- Blank white iframes become explicit preview states with retry actions and diagnostics.
- Build recommendation state is stable across refresh.
- Once a build completes, the primary composer shows a review state instead of stale build recommendation UI.
- Product UI copy remains Indonesian.
- Internal docs, errors, logs, tests, prompts, and developer-facing copy remain English.

Product scope:

- Fix latest-successful selection across preview, source, runtime, and publish surfaces.
- Preserve the last good deployment when a new build fails.
- Make failed build states useful instead of destructive.
- Keep the existing generated source path working while stronger architecture is prepared.

Quality checker:

- Start with a project that has one successful build.
- Trigger a rebuild that fails schema validation or build validation.
- Confirm the preview still renders the previous successful build.
- Confirm the UI clearly explains that the rebuild failed and the previous website is still active.
- Refresh the project page and confirm the same state remains.
- Restart the dev server and confirm artifact-backed preview can recover if local persistence is configured.
- Run the full local quality gate.

Review method:

- Browser review of the project workspace before and after failed rebuild.
- API-level review of preview/source/runtime/publish selection behavior.
- Event-log review to confirm failed attempts are recorded without replacing the successful deployment.
- Regression review against at least one existing historical project.

Exit criteria:

- No blank preview for known failed build states.
- No "latest failed attempt wins" behavior in user-facing preview.
- Last successful build remains inspectable, previewable, and publishable.

### Phase 1: Define The Generated App Contract

Goal: replace template-first thinking with a durable generated app contract.

Expected outcome:

- Generated apps have a documented source layout, metadata contract, build command, runtime profile, and allowed capability set.
- The first generated app profile is small enough for MVP but compatible with future full-stack direction.
- The platform can distinguish static site builds, interactive React builds, and future Node app builds without rewriting project identity.

Product scope:

- Define supported app categories for first release:
  - business profile site
  - product or menu catalog
  - service booking interest page
  - WhatsApp order funnel
  - simple landing page with sections
  - simple multipage company profile
- Define supported platform-owned backend modules:
  - contact lead
  - WhatsApp CTA
  - map/location block
  - static catalog
  - simple order intent
  - payment link placeholder
- Define unsupported app categories:
  - video processing
  - arbitrary scraping
  - long-running background workers
  - native binary workloads
  - user-managed database servers
  - custom infrastructure services

Architecture scope:

- Keep `Project`, source snapshot, build attempt, deployment, runtime node, and runtime event as separate first-class concepts.
- Add generated app metadata as a stable contract instead of relying on chat text or temporary implementation details.
- Treat current schema rendering as fallback and transition infrastructure, not the long-term ceiling.
- Keep the runtime profile explicit so a project can be static-first today and Node-capable later.

Quality checker:

- A generated app must declare its profile, template version, package manager, build command, output directory, supported routes, and capability flags.
- A generated app must not require secrets, native binaries, Docker, or arbitrary system services.
- A generated app must render without external paid APIs unless the platform owns the integration.
- A generated app must have all user-visible copy in Indonesian unless the user explicitly asks otherwise.

Review method:

- Contract review against current architecture docs.
- Sample project review across at least five UMKM business types.
- Generated source inspection to confirm no platform secrets, no heavy workloads, and no unsupported commands.

Exit criteria:

- Future agents can generate or edit a project by reading the contract without relying on chat history.
- The contract does not force a rewrite when custom domain, payment link, or platform-owned backend modules are added.

### Phase 2: Build The Agent Tool Loop

Goal: move from schema-only generation toward controlled source editing by an AI coding agent.

Expected outcome:

- The AI edits generated app source through narrow platform tools.
- The agent can read files, search files, write files, replace file content, list files, inspect build logs, and request app checks.
- The agent cannot freely execute unbounded commands in production.
- Every user-visible change can be traced to a source snapshot and build attempt.

Product scope:

- User can request edits after seeing a preview.
- User can ask for design changes, copy changes, section changes, page changes, and simple interaction changes.
- User does not need to know code terminology.
- The product shows progress while the AI is editing and building.

Architecture scope:

- Introduce a constrained agent tool interface above generated source storage.
- Prefer structured tool output over parsing AI prose.
- Keep tool side effects visible and recoverable.
- Keep package changes policy-controlled.
- Keep generated source writes scoped to the project workspace.

Quality checker:

- The agent must read current source before modifying it.
- The agent must not write outside the project source boundary.
- The agent must not add packages outside the package policy.
- The agent must not claim success until an app check passes or a failure is visible to the user.
- The agent must not convert a valid previous deployment into a broken current preview.

Review method:

- Run edit scenarios:
  - change brand tone
  - change background color
  - add menu/catalog section
  - add second page
  - change CTA target
  - make the design less templated
- Inspect generated source diffs at the source snapshot level.
- Confirm build events and review state match the actual app state.

Exit criteria:

- At least one edit loop works end to end: user asks, agent edits, build runs, preview updates, previous good build remains recoverable.

### Phase 3: Move Build Work Out Of Request Handling

Goal: make builds reliable, observable, retryable, and cheap enough for beta.

Expected outcome:

- Build execution is represented as a queued job or equivalent worker-owned operation.
- The web request creates intent and streams/polls status, but it does not own long build execution as a fragile request lifecycle.
- Build attempts have clear logs, status, duration, input snapshot, artifact output, and failure reason.
- Build concurrency is bounded.

Product scope:

- Users see build progress and failure states.
- Users can retry a failed build.
- Users can continue discussion or edits after a failed build.
- Users can inspect the current published/preview state separately from the latest failed attempt.

Architecture scope:

- Build workers process source snapshots into artifacts.
- Package install and build commands run under timeouts.
- Build logs are truncated and sanitized before display.
- Build artifacts are written through the storage provider boundary.
- Local artifacts remain acceptable for single-node beta, but the model must allow object storage later.

Quality checker:

- Build jobs have max duration.
- Build jobs have max log size.
- Build jobs have max source/artifact size.
- Build jobs are idempotent enough for retry.
- A worker crash leaves the build attempt in a recoverable state.
- Rate limits prevent one user from exhausting the VPS.

Review method:

- Failure injection:
  - invalid source
  - missing package
  - timeout
  - worker restart
  - artifact write failure
- Capacity review on target VPS class.
- Log review for secret leakage and user readability.

Exit criteria:

- A build can fail, retry, and recover without manual database repair.
- The control-plane app stays responsive while a build is running.

### Phase 4: Harden Runtime And Preview

Goal: make generated app previews feel immediate and reliable while preserving isolation.

Expected outcome:

- Preview traffic resolves through the proxy plane.
- Stopped preview deployments can cold-start on demand.
- Missing runtime, stale process, missing artifact, and app boot failures show actionable UI states.
- Runtime capacity is bounded and observable.

Product scope:

- Users can preview desktop and mobile states.
- Users can refresh preview after edits.
- Users can recover from runtime failures.
- Users never see a silent white canvas as the only error state.

Architecture scope:

- Runtime supervision stays behind an interface.
- Production Docker socket access remains outside the Next.js control plane.
- Static runtime remains the first adapter.
- Node app runtime can be introduced later through the same supervisor boundary.
- Idle preview deployments stop automatically.

Quality checker:

- Preview route selects the latest successful deployment by policy.
- Proxy cold-start returns useful progress or retry UI.
- Runtime health checks detect stale or dead processes.
- Runtime events record start, stop, failure, and request activity.
- Sandbox-safe asset loading works inside the iframe.

Review method:

- Browser review after:
  - page refresh
  - dev server restart
  - runtime process stop
  - failed rebuild
  - successful rebuild
- Runtime event review for each transition.
- Mobile and desktop iframe review.

Exit criteria:

- Preview is either correct or explicitly diagnosed. It is never silently ambiguous.

### Phase 5: Ship Publishing And Custom Domain Foundation

Goal: make generated sites useful outside the editor.

Expected outcome:

- Users can publish the latest successful build to a public URL.
- A failed rebuild does not change the published site.
- Publish status is visible in the workspace.
- The data model and proxy model are ready for custom domains.

Product scope:

- Publish to an UMKM Cepat public URL.
- See whether the public site is live.
- Promote a successful build to published.
- Keep editing preview without automatically changing production.
- Prepare custom-domain onboarding for a later release.

Architecture scope:

- Published deployments point to successful build artifacts only.
- Public routing uses the proxy plane.
- Domain mapping is separate from project identity and deployment identity.
- Domain verification and DNS instructions are planned but can ship later if not ready for first beta.

Quality checker:

- Published URL serves the selected successful deployment.
- A later failed rebuild does not affect the published URL.
- A later successful build can be promoted intentionally.
- Public responses are cacheable when safe.
- Private preview remains noindex.

Review method:

- Publish, rebuild fail, confirm public site unchanged.
- Publish, rebuild success, confirm public site unchanged until promoted.
- Promote, confirm public site updates.
- Inspect response headers for private/public differences.

Exit criteria:

- A beta tester can share a public URL with confidence.

### Phase 6: Add Visual Iteration And Beta Operating Loop

Goal: make iterative improvement easy enough for non-technical beta users.

Expected outcome:

- Users can comment on what they see instead of describing everything abstractly.
- The product captures useful UI context for agent edits.
- Beta feedback can be reviewed and turned into focused fixes.

Product scope:

- User can continue editing through chat after build.
- User can choose between "review website", "edit with chat", and "build again" states.
- User can comment on visible UI areas in a future iteration.
- User can attach context to requests.

Architecture scope:

- UI comments should capture route, viewport, element text, selector-like hints, bounding box, screenshot reference, and user instruction.
- Comments become structured edit context, not raw prompt-only context.
- Review sessions should be stored separately from generated app source.

Quality checker:

- Comment context never includes secrets or auth cookies.
- Screenshot references are scoped to project ownership.
- Agent edits still go through the same tool loop and build gate.
- Comment-driven edits do not bypass package or runtime policy.

Review method:

- Test common beta feedback:
  - "make this button clearer"
  - "move this section up"
  - "change this color"
  - "make this product card more readable"
  - "add WhatsApp here"
- Confirm each request maps to source changes and a new build attempt.

Exit criteria:

- Users can iterate without needing developer vocabulary.

## User Stories

1. As a UMKM owner, I want to describe my business in plain Indonesian, so that I can start without knowing web design terms.
2. As a UMKM owner, I want the AI to ask only useful questions, so that I do not waste time answering generic prompts.
3. As a UMKM owner, I want clickable answer options, so that I can move quickly when I agree with a suggested direction.
4. As a UMKM owner, I want to type a custom answer, so that I can explain details the options do not cover.
5. As a UMKM owner, I want to see the brief before build, so that I can correct wrong assumptions.
6. As a UMKM owner, I want the app to tell me when the brief is ready, so that I know when building makes sense.
7. As a UMKM owner, I want to continue discussion after a build recommendation, so that I can refine the idea before spending build time.
8. As a UMKM owner, I want the normal chat box hidden when a build-ready decision is shown, so that the next action is obvious.
9. As a UMKM owner, I want a clear "start build" action, so that I understand when the website will be generated.
10. As a UMKM owner, I want build progress to be visible, so that I know the app is working.
11. As a UMKM owner, I want build progress to use simple Indonesian, so that I understand the status without developer jargon.
12. As a UMKM owner, I want a generated website that matches my business type, so that it does not feel like a generic AI template.
13. As a UMKM owner, I want a multipage website when my business needs it, so that all important information has a proper place.
14. As a UMKM owner, I want a single focused page when that is enough, so that the site is not bloated.
15. As a UMKM owner, I want my menu or product list shown clearly, so that customers can decide faster.
16. As a UMKM owner, I want WhatsApp actions, so that customers can contact or order from me.
17. As a UMKM owner, I want location information, so that customers can visit my place.
18. As a UMKM owner, I want the design to fit my brand tone, so that it feels credible.
19. As a UMKM owner, I want to request edits in chat, so that I can improve the site after seeing it.
20. As a UMKM owner, I want to ask for visual edits without naming CSS or components, so that I can communicate naturally.
21. As a UMKM owner, I want to review the site on desktop and mobile, so that I know customers can use it on phones.
22. As a UMKM owner, I want the previous good website to stay available when a rebuild fails, so that mistakes do not ruin progress.
23. As a UMKM owner, I want a clear error when build fails, so that I know whether to retry or change the request.
24. As a UMKM owner, I want to publish only when I decide, so that unfinished edits do not go public.
25. As a UMKM owner, I want my public site to stay live while I keep editing, so that customers are not affected by drafts.
26. As a UMKM owner, I want to share a public URL, so that I can show the website to customers.
27. As a UMKM owner, I want a custom domain later, so that the website can look professional.
28. As a UMKM owner, I want the generated site to avoid fake features, so that customers do not click things that do not work.
29. As a UMKM owner, I want the AI to explain unsupported requests simply, so that I understand platform limits.
30. As a UMKM owner, I want payment features later, so that customers can pay more easily when the platform supports it.
31. As a returning user, I want my project state to persist, so that I can continue later.
32. As a returning user, I want my previous discussion preserved, so that I do not repeat the brief.
33. As a returning user, I want the current website preview to load after refresh, so that the editor feels reliable.
34. As a returning user, I want failed attempts visible but not destructive, so that I can learn what happened.
35. As a beta tester, I want the app to feel stable, so that I can trust it with a real business example.
36. As a beta tester, I want the generated result to be specific, so that I can evaluate the product honestly.
37. As a beta tester, I want to report problems with context, so that the team can fix issues quickly.
38. As a platform operator, I want every build to have a record, so that failures can be debugged.
39. As a platform operator, I want every deployment to point to a successful build, so that preview and public URLs are explainable.
40. As a platform operator, I want preview runtimes to stop when idle, so that one VPS can support many projects.
41. As a platform operator, I want build concurrency limits, so that one user cannot exhaust CPU and memory.
42. As a platform operator, I want package policy controls, so that unsupported dependencies do not destabilize the platform.
43. As a platform operator, I want AI usage rate limits, so that free beta usage stays affordable.
44. As a platform operator, I want build usage rate limits, so that expensive operations are bounded.
45. As a platform operator, I want artifact storage to be provider-backed, so that local storage can move to object storage later.
46. As a platform operator, I want logs sanitized, so that secrets and provider data do not leak.
47. As a platform operator, I want runtime events, so that operations are auditable.
48. As a platform operator, I want a simple deployment story for one VPS, so that first release can ship without overengineering.
49. As a platform operator, I want the architecture to allow more runtime nodes later, so that scaling does not require product rewrites.
50. As a platform operator, I want public routes separated from private preview routes, so that privacy and caching rules are correct.
51. As a platform operator, I want custom domain mapping separate from deployments, so that domains can point to promoted builds.
52. As a support operator, I want to see the latest successful build and latest failed attempt, so that I can explain user issues.
53. As a support operator, I want to reproduce a project state, so that bugs can be investigated.
54. As a support operator, I want safe retry actions, so that users can recover without database edits.
55. As a developer, I want a generated app contract, so that future agents can modify projects safely.
56. As a developer, I want generated source snapshots, so that changes are auditable.
57. As a developer, I want build attempts separate from project state, so that failed attempts do not corrupt successful artifacts.
58. As a developer, I want deployment resolution policy to be explicit, so that preview and publish behavior is predictable.
59. As a developer, I want runtime supervision behind an interface, so that local process, container, and external sandbox adapters can coexist.
60. As a developer, I want build execution behind a worker boundary, so that request handlers stay small and reliable.
61. As a developer, I want platform-owned backend modules first, so that UMKM users get backend value without arbitrary backend code.
62. As a developer, I want generated code treated as untrusted data, so that platform security remains clear.
63. As a developer, I want all internal prompts and logs in English, so that contributors can review them consistently.
64. As a developer, I want all user-facing builder copy in Indonesian, so that the product fits its audience.
65. As a future developer, I want custom domain support to reuse the deployment model, so that domain work does not invent a parallel system.
66. As a future developer, I want payment features to use platform-owned modules, so that money movement remains permissioned and auditable.
67. As a future developer, I want visual comments stored as structured review context, so that agent edits can target the right UI.
68. As a future developer, I want unsupported heavy workloads documented, so that agents do not promise impossible apps.
69. As a future developer, I want phase quality gates, so that work can be split across agents without losing the release bar.
70. As a maintainer, I want each phase to have exit criteria, so that "done" means user-visible reliability, not just merged code.

## Implementation Decisions

- UMKM Cepat remains one control-plane platform app with many user projects.
- Generated apps are project artifacts and runtime deployments, not platform code.
- Generated code must not be imported or evaluated by the control-plane app.
- The platform keeps source snapshots, build attempts, deployments, runtime nodes, and runtime events as separate first-class concepts.
- The current schema renderer is fallback and transition infrastructure, not the final custom generation engine.
- The first release should prioritize stable static and interactive React sites with platform-owned backend modules before arbitrary user backend code.
- The app builder should feel full-stack through platform-owned capabilities first: contact leads, catalog data, WhatsApp order intent, location, simple booking interest, and payment links later.
- Arbitrary backend route generation is not part of the first release unless it runs under an explicitly approved Node app runtime profile and sandbox policy.
- The generated app contract is the main seam for future framework choices. The product should not couple user experience to whether the implementation uses Vite, Next.js, or another Node-compatible profile.
- Package management uses Bun for the platform. Generated app package policy must be explicit and may allow a narrower package manager/profile for generated projects if needed by the runtime.
- AI-generated changes go through narrow tools with visible side effects.
- Agent tools should prefer read, search, write, replace, list, and check operations before any command execution.
- Any command execution available to the agent must be bounded by working directory, timeout, output size, package policy, and runtime profile.
- The agent must not be allowed to run heavy workloads, start arbitrary services, or access platform secrets.
- Build work should move out of request handling into a worker or worker-shaped module before beta scale.
- Build status must distinguish current attempted build from latest successful build.
- Preview resolution must prefer the latest successful preview deployment unless the user is explicitly viewing a failed attempt.
- Publish resolution must only point to successful builds and must never change automatically because a draft rebuild succeeded or failed.
- Preview runtime failures are first-class product states.
- The runtime supervisor remains the only authority that starts or stops generated deployments.
- Production Docker socket access, if introduced, belongs behind a supervisor service and not inside the control-plane app.
- Scale-to-zero is required for preview deployments on small VPS infrastructure.
- Local artifact storage is acceptable for first single-node beta when mounted persistently, but artifact storage must stay behind a provider boundary so object storage can replace it.
- Custom domains should attach to published deployments through domain mapping, not to mutable project draft state.
- Payment integration should be platform-owned and permissioned. AI may configure payment flows only after the user approves money-related setup.
- Consumer-facing product copy is Indonesian. Developer-facing docs, prompts, logs, errors, comments, test names, and internal UI are English.
- Open Lovable is useful as a reference for sandbox provider seams and build validation, but its global in-memory sandbox state and manual parser should not be copied.
- Adorable is useful as a reference for agent tools, check-before-finish discipline, and persistent project source, but its cloud-specific Freestyle dependency should not be copied as the product architecture.
- Beam's Lovable clone is useful as a reference for a simple websocket message protocol and structured code changes, but its Python/Beam dependency does not match the Node-first MVP direction.

## Testing Decisions

- Tests should verify external behavior at the highest practical seam: project workspace flow, build lifecycle, preview resolution, deployment resolution, and publish behavior.
- Unit tests are appropriate for pure policy functions: latest successful resolver, package policy, runtime policy, quota policy, and generated app contract validation.
- API tests should cover ownership checks, build status transitions, preview route selection, publish route selection, and failure responses.
- Integration tests should cover project creation, guided discussion, build recommendation, build start, build success, build failure, preview retry, edit request, rebuild, and publish.
- Browser tests should cover the user-visible workspace states because the main product risk is user trust.
- Visual review is required for major workspace UI changes, especially build recommendation, review state, preview failure panel, mobile preview, and chat-edit flow.
- Generated app checks should inspect output from the user's perspective:
  - route loads
  - primary CTA works
  - mobile layout is usable
  - no obvious template placeholder remains
  - no blank iframe
  - no raw stack trace in consumer UI
- Build tests should avoid coupling to private implementation details of the builder. They should assert the build record, artifact availability, and preview behavior.
- Runtime tests should cover stopped, running, stale, failed, and missing artifact states.
- Publish tests should prove failed draft rebuilds cannot alter the live public deployment.
- Security tests should cover project ownership boundaries, artifact path traversal, signed private asset access, and secret leakage in logs.
- Performance tests for first release should be pragmatic and VPS-focused: build duration, cold-start duration, runtime memory, artifact size, and concurrent build behavior.
- The full local quality gate remains required before handoff.

## Quality Checker

The release quality checker is the required definition of done for the first release.

### Product Quality Gates

- A new user can complete the first release outcome flow without developer help.
- User-facing builder copy is Indonesian and avoids developer jargon.
- The product never shows stale build recommendation UI after a build has completed.
- The normal chat composer is hidden when a build-ready decision is the primary action.
- A user can continue discussion and return to build later without losing the recommendation state.
- A user can ask for at least one edit after seeing preview.
- A user can publish a successful build.
- A failed rebuild keeps the previous successful preview and published site intact.

### Generated Output Quality Gates

- Generated output matches the completed brief.
- Generated output uses business-specific content rather than generic filler.
- Generated output has no unsupported fake features.
- Generated output has no visible placeholder sections unless the user explicitly asked for placeholder content.
- Generated output has responsive desktop and mobile layouts.
- Generated output uses accessible contrast and readable typography.
- Generated output has a clear primary customer action.
- Generated output avoids one-note template visuals across the sample matrix.

### Build And Runtime Quality Gates

- Every build attempt has status, started time, ended time, logs, source snapshot, and failure reason when applicable.
- Successful builds have artifacts.
- Failed builds do not replace successful artifacts.
- Preview routes resolve latest successful deployment by default.
- Public routes resolve promoted successful deployment only.
- Preview failures show an actionable panel, not a silent white screen.
- Runtime start, stop, stale process, and failed start states are recorded.
- Idle preview runtime cleanup works on a single-node deployment.

### Security And Abuse Gates

- Every private project route checks ownership.
- Generated source writes are scoped to the project boundary.
- Generated app artifacts reject unsafe paths.
- Logs are sanitized and truncated.
- AI and build rate limits are active.
- Package policy blocks unsupported or dangerous dependencies.
- Generated code cannot read platform secrets.
- Production architecture does not expose Postgres, Docker socket, AI gateway, storage credentials, or supervisor internals publicly.

### Cost And Operations Gates

- Build concurrency is bounded.
- Runtime concurrency is bounded.
- Preview deployments scale to zero.
- Local artifact directories are documented as persistent volumes for single-node beta.
- Object storage migration remains possible through the storage provider boundary.
- Operators can inspect current builds, deployments, and runtime events.
- Operators can retry failed jobs without manual database edits.

### Review Packet Required For Each Phase

Each phase should produce a review packet with:

- Scope summary.
- User-visible flow screenshots or short recording when UI changed.
- Targeted test output.
- Full local quality gate output before handoff.
- Any failed or skipped check with reason.
- Build/runtime evidence when relevant.
- Risk notes and follow-up items.

## Review Method

### Sample Matrix

The first release must be reviewed against at least these sample UMKM projects:

1. Angkringan with menu, WhatsApp order, and location.
2. Laundry with service list, pricing, pickup CTA, and contact lead.
3. Coffee shop with menu, ambience, gallery, and map.
4. Barber shop with services, schedule intent, and WhatsApp booking.
5. Local fashion shop with product catalog and size/contact guidance.
6. Course or tutoring service with program pages and lead capture.
7. Home food business with daily menu and order CTA.

### Required Scenario Reviews

For each sample project:

- Generate first build from a brief.
- Refresh the workspace.
- Inspect desktop preview.
- Inspect mobile preview.
- Ask for one content edit.
- Ask for one visual edit.
- Trigger or simulate one failed rebuild.
- Confirm last successful preview remains available.
- Publish a successful build.
- Confirm failed draft rebuild does not change public output.

### Manual UX Review

The reviewer should answer:

- Is the next user action obvious?
- Does the UI explain what is happening?
- Does the generated result feel specific to the business?
- Is the failure state recoverable?
- Is the published site clearly separate from draft editing?
- Would a non-technical UMKM owner understand the copy?

### Technical Review

The reviewer should answer:

- Which source snapshot produced this build?
- Which build produced this deployment?
- Which deployment is previewed?
- Which deployment is published?
- What happens if the latest build fails?
- What happens if the runtime process dies?
- What happens after server restart?
- Where are artifacts stored?
- Which limits prevent abuse?

### Release Readiness

The first release is ready for beta only when:

- All phase exit criteria are met or explicitly deferred.
- The sample matrix passes.
- The full local quality gate passes.
- Known unsupported workloads are documented in product and internal language.
- Operators have a deployment and rollback procedure.
- Support can diagnose common failures from records and logs.

## Out of Scope

- Arbitrary backend code generation for users.
- User-managed databases inside generated apps.
- FFmpeg, image/video processing pipelines, scraping farms, native binaries, or long-running jobs.
- User-provided Dockerfiles.
- Kubernetes or multi-node orchestration for first release.
- Per-project VPS provisioning.
- Realtime multiplayer apps.
- Full code editor parity with mature AI IDE products.
- Automatic payment collection without explicit user approval and platform-owned payment integration.
- Enterprise team permissions.
- White-label reseller infrastructure.
- Replacing all local storage with object storage before single-node beta.
- Final custom domain UI if publish-to-platform URL is stable enough for beta.

## Further Notes

- The first release should be small enough to ship and solid enough to trust.
- Engineers should use `docs/prds/first-release-execution-spec.md` as the execution contract for implementation. This PRD remains the roadmap and product rationale.
- The architecture should optimize for future agents with no chat context. Durable docs, records, and small stable interfaces matter.
- The best near-term product promise is not "build anything." It is "build useful small business websites and lightweight apps within clear limits."
- The first release should avoid copying a reference repo wholesale. The correct strategy is to adopt the best proven patterns while preserving UMKM Cepat's control-plane, snapshot/build/deployment/runtime model.
- The main implementation priority after this PRD is Phase 0. There is little value in adding a stronger generator while failed rebuilds can still hide valid previews.
- The issue tracker publication step is pending because this repo does not currently contain an active `docs/agents` issue tracker configuration. This PRD is saved in-repo first so it can be split into ready-for-agent issues after tracker setup.

## References

- Open Lovable: https://github.com/firecrawl/open-lovable
- Adorable: https://github.com/freestyle-sh/adorable
- Beam Lovable Clone: https://github.com/beam-cloud/lovable-clone
- Vercel Sandbox: https://vercel.com/docs/sandbox
- Vercel Functions: https://vercel.com/docs/functions
- Freestyle GitHub Sync: https://www.freestyle.sh/docs/git/github-sync
- Beam Sandbox: https://docs.beam.cloud/v2/sandbox/overview
