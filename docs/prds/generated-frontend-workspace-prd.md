# PRD: Guided Discussion and Generated Frontend Workspace

## Problem Statement

UMKM Cepat currently proves that an authenticated user can create a project, discuss needs with AI, stream a schema, and render a preview. That is useful, but it still feels too much like a prototype: the generated result is generic, the preview is constrained by a simple schema renderer, the chat output is not a polished guided product experience, and users who want a truly custom website or frontend app will quickly hit the ceiling.

The product direction is broader than a landing-page schema builder. UMKM Cepat should become an AI full-stack web/app generator for Indonesian UMKM, with a near-term focus on high-quality custom frontend generation for marketing sites, catalogs, profile pages, and frontend-only app experiences. Users should be able to clarify their business needs in Diskusi mode, reach a shared structured brief, then switch into Buat mode to generate an actual custom frontend project with a codebase, preview, timeline, changes, and eventually export/publish.

From the user's perspective, the current problem is: “I can chat and see something rendered, but it still looks generic and does not feel like a real builder that understands what I want.”

## Solution

UMKM Cepat will introduce a Lovable-like, UMKM-focused project workspace built around two distinct modes:

- **Diskusi mode**: a guided discovery agent that asks one decision at a time, renders clickable option tools in chat, updates a structured project brief, tracks readiness, and explicitly does not build.
- **Buat mode**: a build agent that reads the accepted brief, generates a real frontend codebase for the project, runs validation/build, streams progress, and renders the generated result in a large preview workspace.

The near-term builder target is frontend-only custom web generation. Generated user projects should be separate source artifacts from the platform app, using a lightweight frontend stack suitable for static output and sandboxed preview. Published user sites should eventually be served independently of the platform app whenever possible, so editor downtime does not imply public site downtime.

The current schema renderer remains useful as a safe fallback/planning layer, but it is not the long-term ceiling for custom output. The primary product path moves toward generated frontend codebases, pattern-first generation, and later full-stack capabilities.

The workspace should also be redesigned around a large preview canvas and a right-side chat panel with draggable/collapsible panels, consistent composer UI, markdown/tool rendering, and tabs for Preview, Timeline, Changes, and eventually Code.

## User Stories

1. As a UMKM owner, I want to discuss my business needs before building, so that the generated website matches my actual business.
2. As a UMKM owner, I want the AI to ask simple guided questions, so that I do not need to know web design terminology.
3. As a UMKM owner, I want to click answer options, so that I can respond quickly without typing everything manually.
4. As a UMKM owner, I want to still type freely, so that I can explain something the options do not cover.
5. As a UMKM owner, I want the AI to recommend one option, so that I have a sensible default when I am unsure.
6. As a UMKM owner, I want to see what the AI has understood about my business, so that I can correct it before generation.
7. As a UMKM owner, I want a readiness indicator, so that I know when the brief is clear enough to build.
8. As a UMKM owner, I want Diskusi mode to avoid building anything, so that I can safely explore ideas first.
9. As a UMKM owner, I want Buat mode to actually build the website, so that the mode distinction is meaningful.
10. As a UMKM owner, I want the AI to ask only one major decision at a time, so that the chat does not feel overwhelming.
11. As a UMKM owner, I want the AI to summarize my accepted plan before building, so that I know what will be generated.
12. As a UMKM owner, I want to continue discussing instead of building, so that I can refine the direction when I am not ready.
13. As a UMKM owner, I want to override the readiness gate and build with assumptions, so that I can move fast when I prefer speed.
14. As a UMKM owner, I want the assumptions to be visible before build, so that I understand what the AI will decide for me.
15. As a UMKM owner, I want the generated result to fit my business type, so that a shoe shop does not look like a generic landing page.
16. As a UMKM owner, I want different websites for different business needs, so that a hero-only request and a catalog request do not produce the same layout.
17. As a UMKM owner, I want the builder to support simple marketing pages, so that I can create a professional online presence.
18. As a UMKM owner, I want the builder to support catalog-like frontend pages, so that customers can browse products even before database support exists.
19. As a UMKM owner, I want the builder to support static/local data, so that the site can feel like an app without requiring backend setup.
20. As a UMKM owner, I want WhatsApp or contact CTAs, so that visitors can take action immediately.
21. As a UMKM owner, I want custom visual style, so that my business does not look like every other generated site.
22. As a UMKM owner, I want the AI to choose suitable sections, so that my site has only what it needs.
23. As a UMKM owner, I want the AI to avoid forced FAQ/cards/sections when I only asked for a focused page, so that the result feels intentional.
24. As a UMKM owner, I want the AI to add richer pages when needed, so that larger business needs are not squeezed into one generic page.
25. As a UMKM owner, I want a large preview area, so that I can actually judge the design.
26. As a UMKM owner, I want chat on the right side, so that the main focus stays on the generated website.
27. As a UMKM owner, I want to resize the preview and chat panels, so that I can focus on either conversation or preview.
28. As a UMKM owner, I want to collapse the chat panel, so that I can inspect the website fullscreen.
29. As a UMKM owner, I want to collapse the preview panel, so that I can focus on discussion.
30. As a UMKM owner, I want the chat composer to feel consistent with the homepage prompt input, so that the product feels cohesive.
31. As a UMKM owner, I want chat responses to render cleanly, so that markdown does not appear as raw text.
32. As a UMKM owner, I want progress to appear near the composer or in a collapsible status area, so that it does not clutter the conversation.
33. As a UMKM owner, I want build progress details to be expandable, so that I can see what is happening without being overwhelmed.
34. As a UMKM owner, I want timeline events, so that I can understand the build sequence.
35. As a UMKM owner, I want a changes tab, so that I can see what the AI changed.
36. As a UMKM owner, I want a code tab eventually, so that I can inspect or export the generated project.
37. As a UMKM owner, I want the generated website to keep working after it is published, so that my public site is not tied to the editor being online.
38. As a platform operator, I want generated projects to be separate artifacts from the platform app, so that platform changes do not directly corrupt user sites.
39. As a platform operator, I want published sites to prefer static output, so that many UMKM sites can run cheaply.
40. As a platform operator, I want preview servers to be temporary/on-demand, so that idle projects do not waste VPS resources.
41. As a platform operator, I want generated code to follow a constrained frontend stack first, so that builds are predictable and affordable.
42. As a platform operator, I want package usage controlled initially, so that arbitrary dependencies do not create security or resource issues.
43. As a platform operator, I want generated projects to be exportable, so that users can own their source code later.
44. As a platform operator, I want frontend-only generation first, so that the product can deliver custom value before database/backend complexity.
45. As a platform operator, I want a path to full-stack generation later, so that the product direction remains ambitious.
46. As a platform operator, I want build validation to run before preview is marked ready, so that broken projects do not look successful.
47. As a platform operator, I want failed builds to be visible and recoverable, so that users can retry or revise without losing context.
48. As a platform operator, I want generated source to be versioned, so that changes can be audited and rolled back.
49. As a platform operator, I want discussion outputs stored as structured brief data, so that build agents do not rely only on chat transcript text.
50. As a platform operator, I want AI calls to stay behind the internal AI SDK boundary, so that provider wiring remains maintainable.
51. As a future developer, I want clear generation phases, so that the builder can evolve from frontend-only to full-stack without a rewrite.
52. As a future developer, I want the current schema renderer treated as fallback, so that it does not block generated-code architecture.
53. As a future developer, I want one main project workspace seam, so that tests cover user behavior without coupling to internal components.
54. As a future developer, I want option-tool UI contracts, so that AI-generated choices render consistently.
55. As a future developer, I want brief readiness rules, so that Diskusi mode has predictable behavior.
56. As a future developer, I want generated project metadata, so that source artifacts can identify template/version/owner/project settings.
57. As a future developer, I want generated project constraints documented, so that agents know which files/packages they may change.
58. As a future developer, I want separate Preview, Timeline, Changes, and Code concepts, so that the workspace can grow without mixing concerns.
59. As a returning user, I want project chat memory to persist, so that the AI remembers the discussion inside the same project.
60. As a returning user, I want the accepted brief to persist, so that I can build later without repeating myself.
61. As a returning user, I want generated previews to load from project state, so that I can continue where I left off.
62. As a user on a small screen, I want the workspace to stack appropriately, so that I can use it on mobile/tablet.
63. As a user, I want Indonesian user-facing copy, so that the product feels local and understandable.
64. As a user, I want the product to avoid developer jargon unless I open advanced/code views, so that it remains friendly for UMKM.
65. As a user, I want advanced code/export views to exist later, so that technical users are not boxed in.

## Implementation Decisions

- The product north star is a full-stack AI web/app generator for UMKM, but the next implementation phase focuses on frontend-only custom generation for marketing and simple app-like frontend experiences.
- Diskusi and Buat are separate states, not just labels. Diskusi never triggers build generation. Buat triggers build generation from an accepted brief.
- Diskusi mode uses a guided discovery agent inspired by the grilling workflow: one decision at a time, clickable options, recommended default, free-text fallback, structured brief updates, readiness tracking, and explicit build recommendation.
- The minimum build-ready checklist is: business type, primary goal, target audience, style direction, and frontend feature needs. When these are complete, readiness is at least 80% and the agent may recommend build.
- Users may override readiness and build immediately, but the system must surface assumptions before generation.
- AI option output should be tool/UI driven, not raw prose. The initial tool contracts are `showOptions`, `updateBrief`, and `recommendBuild`.
- `showOptions` renders a question with clickable A/B/C/D/Other choices, optional descriptions, and a recommended option.
- `updateBrief` updates the structured project brief and renders a brief progress card with complete/missing items and readiness score.
- `recommendBuild` renders the accepted plan and lets the user choose between starting build or continuing discussion.
- Chat markdown should render as formatted content, not raw markdown syntax. Raw HTML should not be rendered from model output.
- The workspace layout should move toward a large preview canvas and right-side chat. The default ratio should heavily favor preview, approximately 3:1 or 4:1, with draggable/collapsible panels.
- Progress should not live as a bulky static card under the chat. It should appear as a collapsible build/status surface near the chat composer or in a details/timeline view.
- Generate ulang should not be a primary visible action in the normal chat flow. Retry/regenerate belongs in failure/recovery or advanced menus.
- Workspace tabs should include Preview, Timeline, and Changes in the near term. Code view arrives when generated source artifacts exist.
- The current schema renderer remains as fallback/planning/safe preview infrastructure but is not the final product ceiling for custom output.
- Generated frontend projects should become separate source artifacts from the platform app.
- The preferred generated project stack is Vite + React + TypeScript + TanStack Router + TanStack Query + Tailwind + shadcn/Radix-style components + Bun.
- Generated projects should be frontend-only at first, with static/local data for app-like experiences such as catalog, filters, gallery, product details, and WhatsApp order intent.
- The first generated-code phase should avoid database, authentication, payment, and arbitrary backend logic.
- Published sites should eventually prefer static build artifacts served independently from the platform app. Platform downtime should not automatically take down already published static sites.
- Preview runtimes may be temporary/on-demand during editing, with idle shutdown and reverse proxy routing later. They should not be one always-on public port per project.
- Per-project Next.js servers, containers, and long-lived node processes are not the default architecture for MVP scale.
- Future full-stack generation may introduce custom backend code, but that requires stronger sandboxing/isolation and is explicitly later than the frontend-only phase.
- Generated projects should include project metadata analogous to `.lovable/project.json`, but named for UMKM Cepat, to record template/schema version and project identity.
- Generated projects should include agent-facing instructions analogous to AGENTS.md, so future AI edits respect project constraints and history.
- Package usage should start constrained/allowlisted to keep builds reliable, secure, and cheap.
- Build/preview infrastructure should use Bun and should cache dependencies where possible.
- Project chat memory and structured brief memory are different. Chat messages support conversation continuity; structured brief memory drives build decisions.
- The main product seam for implementation and testing is the project workspace flow: create project, discuss, update brief, reach readiness, build, preview, inspect timeline/changes.

A prototype-level state shape that captures the decision is:

```ts
type ProjectWorkspaceMode = "discuss" | "build";

type BriefReadiness = {
  score: number;
  complete: string[];
  missing: string[];
};

type ProjectBrief = {
  businessType?: string;
  primaryGoal?: string;
  targetAudience?: string;
  styleDirection?: string;
  frontendFeatures?: string[];
  pages?: string[];
  assumptions?: string[];
  readiness: BriefReadiness;
  acceptedAt?: string;
};
```

## Testing Decisions

- Tests should verify external behavior through the highest possible seam: the project workspace flow and its API contracts, not internal component implementation details.
- The primary seam is: a user in Diskusi mode receives option UI and brief updates without triggering build; a user in Buat mode or a user who accepts the build recommendation triggers generation/build behavior.
- API tests should cover ownership checks: users can only load/update/generate for their own projects.
- API tests should cover malformed input and invalid mode handling.
- Diskusi agent route tests should verify that tool calls can produce option data, brief updates, and build recommendations without starting generation.
- Build route tests should verify that build requires an accepted brief or explicit assumption override.
- Chat memory tests should verify bounded context behavior and valid message filtering, following existing project chat memory tests.
- Workspace tests should favor user-visible state: Diskusi shows no generated preview/build, Buat shows build/progress/preview, and accepted plan can trigger build.
- Generated project tests should validate output contracts: expected metadata exists, expected source tree exists, build command can run, and static output is produced.
- Renderer tests should continue to verify safe fallback behavior for invalid schema data while generated-code tests grow separately.
- Browser verification should be used for major workspace UI changes, especially panel layout, responsive behavior, markdown/tool rendering, and preview readability.
- The existing `bun run check` remains the local quality gate and must pass before handoff.

## Out of Scope

- Implementing the full generated-code engine in this PRD itself.
- Database-backed user app features.
- Custom backend code generation.
- Authentication inside generated user projects.
- Payment integration.
- Production-grade sandbox/microVM isolation.
- Kubernetes or multi-service orchestration.
- Always-on per-project Next.js servers.
- Custom domains and final public publishing implementation.
- Full code editor parity with Lovable.
- Arbitrary package installation from user prompts.
- Migrating existing MVP schema preview completely out of the codebase.

## Further Notes

- The user explicitly wants UMKM Cepat to head toward Lovable-level custom generation, but with cost-conscious engineering suitable for a small VPS.
- The user accepts that frontend-only custom generation comes first for marketing and product demonstration, while full-stack generation remains the endgame.
- The current schema JSON approach is not considered sufficient for high customizability. It should be reframed as a helper/fallback rather than the main future path.
- Generated source projects should be treated as first-class artifacts later, with export and preview behavior.
- The Lovable export inspected locally uses a lightweight Vite/TanStack/shadcn-style architecture. UMKM Cepat should copy the underlying principles, not the exact brand, UI, or unnecessary features.
- Indonesian user-facing copy is required. Developer-facing docs, code names, and errors remain English.
- The issue tracker could not be published to from this environment because the GitHub CLI token is invalid. Re-authentication is required before creating the issue and applying `ready-for-agent`.
