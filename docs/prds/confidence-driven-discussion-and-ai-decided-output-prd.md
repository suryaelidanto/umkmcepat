# PRD: Confidence-Driven Discussion and AI-Decided Output Structure

Status: proposed
Created: 2026-07-08
Updated: 2026-07-08
Owner: Surya
Scope: discussion engine, build-readiness gate, output structure model, generated app spec generation
Read when: changing the interview/brief flow, build-readiness confidence model, site schema or implementation spec, generation pipeline input shape, or build-gate enforcement between discussion and build
Do not read for: routine landing page copy, auth/profile/legal pages, unrelated UI primitives, runtime supervisor internals, preview proxy mechanics, or deployment/publishing operations
Current truth: source code + `docs/architecture.md` + `docs/prds/custom-vite-tanstack-generated-app-prd.md` + `docs/prds/first-release-generated-app-platform-prd.md`

## Status History

- 2026-07-08: Drafted after audit revealed three stacked preset layers (field-checklist gate, fixed landing-page schema with per-domain templates, build pipeline that forces schema → landing) preventing AI from deciding output structure or stopping discussion before genuine 95% confidence.

## Problem Statement

UMKM Cepat has a working guided discussion and a real agentic Vite/TanStack generation pipeline, but the discussion stops too early and the output still feels templated because the system decides structure in code, not the AI.

From the user's perspective, the discussion feels like a preset questionnaire: the AI collects a business type, an offer, a target customer, a CTA, and a style preference, then immediately offers a build. The user notices the same five slots every time — business type, offer, audience, CTA, style — and the resulting website looks like a landing page with those slots filled in, not a structure the AI chose for their specific business. A booking app, a calculator, a filterable catalog, a registration form, and a one-page warung site all collapse into the same eyebrow-headline-subheadline-CTA-trust-points-sections landing shape. The user wants the AI to keep interviewing until it genuinely understands the need (around 95% confidence), and to decide for itself whether the output is a landing page, a multi-section marketing site, or an interactive app — without being forced through a preset structure.

From the platform perspective, there are three stacked preset layers that each leak template behavior into the output:

1. The brief readiness gate is a five-field checklist. As soon as all five required fields are filled, the system considers the brief ready and can produce a build recommendation, regardless of whether the AI is actually confident or whether material decisions remain unresolved.
2. The project site schema is a fixed landing-page structure (eyebrow, headline, subheadline, two CTAs, audience, offer, four-color theme, trust points, sections). A deterministic domain detector maps the brief into one of six business templates with templated copy and color palettes. There is no shape for anything that is not a landing page.
3. The build pipeline forces the AI to emit the fixed landing-page schema before generating source, and the coding agent receives that landing schema plus instructions that say "turn the conversation into a polished landing page." The AI never gets to choose the application kind or structure.

The result is that the AI is restricted to filling metadata slots and producing a landing page, even when the user's need would be better served by a different structure. The discussion also stops at field completion rather than at genuine confidence, so vague answers like "terserah" or "bagus aja" can pass the gate and produce a generic build.

## Solution

Replace the field-checklist readiness gate with an AI-owned confidence model, and replace the fixed landing-page schema with a flexible AI-decided implementation spec. The AI decides when it is confident and what shape the output should take; the platform enforces safety and preserves a deterministic fallback when the AI fails.

Three coordinated changes:

### Confidence-driven discussion engine

The AI sets its own confidence (0–100) on every discussion turn through the existing workspace tool. Discussion continues until the AI reports at least 95% confidence and has reflected the brief back for user agreement. There is no minimum or maximum number of questions; the AI adapts depth to the request. The AI may ask about anything — opening hours, delivery area, product count, logo, budget, seasonality, languages, competitors — not only the five legacy fields. The five legacy fields remain available as optional metadata for the build prompt, but they no longer gate readiness. If the AI's stream fails mid-turn, the deterministic fallback card asks another question or offers a brief review, never an automatic build recommendation.

### AI-decided output structure

The fixed landing-page `ProjectSiteSchema` is replaced by a flexible `ImplementationSpec` that the AI produces from the discussion. The spec lets the AI declare the application kind (landing page, marketing site, interactive app), the pages, components, features, content, and style. The deterministic per-domain templates (angkringan, laundry, bengkel, food, retail, service) and their templated copy and color palettes are removed. The AI coding agent receives the `ImplementationSpec`, not a landing-page schema, and is free to build the structure that fits the business. A landing page remains one valid outcome the AI can choose; it is no longer the only possible outcome. The deterministic landing-page generator remains only as an emergency fallback when AI spec generation or source generation fails.

### Enforced build gate

Build is only available when the AI produces a `build_recommendation` card at confidence ≥ 95, or when the user explicitly forces a build despite an incomplete brief (the AI notes what is still assumed). The server rejects a build request whose brief confidence is below 95 unless a force flag is present. The client only shows the build action from a `build_recommendation` card, not from a `brief_review` card.

## User Stories

1. As a small business owner, I want the AI to keep asking me questions until it truly understands my business, so that the result feels made for me and not generated from a checklist.
2. As a small business owner, I want the AI to ask about details specific to my business (opening hours, delivery area, product range, budget), not only a fixed set of fields, so that the website captures what actually matters to my customers.
3. As a small business owner, I do not want the AI to offer a build after just a few generic questions, so that I am not pushed into a build before I have explained what I need.
4. As a small business owner, I want the AI to tell me when it is confident it understands my need, so that I trust the moment it recommends building.
5. As a small business owner, I want to be able to force a build early if I am in a hurry, so that I am never trapped in discussion against my will.
6. As a small business owner, when I force an early build, I want the AI to briefly tell me what it is still assuming, so that I can correct it later if the assumption is wrong.
7. As a small business owner, I want the AI to decide whether my site is a simple landing page, a multi-page marketing site, or an interactive app, so that the structure matches how my customers actually use it.
8. As a booking-focused business owner, I want the AI to recognize that I need a booking-style flow rather than a generic landing page, so that the website helps customers take action instead of just reading.
9. As a catalog seller, I want the AI to build a filterable or browsable product layout when that fits, so that customers can find products instead of scrolling one long page.
10. As a one-person warung owner with a simple need, I want the AI to recognize that a single landing page is enough, so that I am not given unnecessary complexity.
11. As a user, I want the generated website to look different from other businesses of the same type, so that it does not feel like a template with my words pasted in.
12. As a user, I want the AI to write customer-facing Indonesian copy itself, so that my raw answers are transformed into polished marketing text.
13. As a user, I want the AI to avoid dumping my raw answers into the page, so that the copy feels professional.
14. As a user, I want the discussion to feel like talking to a capable friend who keeps digging until they get it, so that the experience is warm and relentless in a good way.
15. As a user, I want the AI to use "aku" and "kamu" and never formal labels like "Anda" or "Bapak", so that the tone stays friendly and relaxed.
16. As a user, I want the AI to ask exactly one question per turn, so that I am not overwhelmed by multiple questions at once.
17. As a user, I want each question to come with specific options tailored to my business, so that answering is fast and I do not see generic template options.
18. As a user, I want the AI to recommend a sensible default option for each question, so that I can answer quickly when I am unsure.
19. As a user, I want to be able to type my own answer instead of picking an option, so that I am never forced into a preset choice.
20. As a user, I want the AI to remember details I mentioned across turns, so that it does not re-ask things I already explained.
21. As a user, I want the brief to be reflected back to me before a build is recommended, so that I can confirm or correct the AI's understanding.
22. As a user, I want to keep discussing after a build recommendation if I change my mind, so that the build is not forced.
23. As a user, I want the build recommendation to reappear if the discussion meaningfully changes, so that I am not stuck with a stale hold.
24. As a user, I want a failed discussion turn (AI stream error) to keep the last good state and let me continue, so that a transient error does not lose my progress.
25. As a user, I want the last successful preview to remain visible if a rebuild or edit fails, so that mistakes do not destroy working output.
26. As a platform operator, I want the build gate to reject builds below 95% confidence unless explicitly forced, so that low-confidence builds cannot happen silently.
27. As a platform operator, I want the AI's confidence to be recorded on the brief, so that I can audit why a build was or was not recommended.
28. As a platform operator, I want the output structure to be decided by the AI from the discussion, so that the platform is not hardcoded to landing pages.
29. As a platform operator, I want a deterministic fallback preserved for when AI spec or source generation fails, so that reliability does not depend solely on AI availability.
30. As a platform operator, I want fallback usage to be recorded in metadata, so that I can tell which sites came from AI-authored structure and which came from the safety net.
31. As a platform operator, I want the AI to remain constrained to static frontend only, so that safety boundaries are not weakened by giving the AI structural freedom.
32. As a platform operator, I want package policy and the check gate to still apply, so that AI freedom over structure does not mean freedom over dependencies or unsafe code.
33. As a maintainer, I want tests proving the brief is not ready at five filled fields but at confidence ≥ 95, so that the checklist gate does not regress.
34. As a maintainer, I want tests proving the AI can set any confidence value and that build recommendation only appears at ≥ 95, so that the gate is enforced.
35. As a maintainer, I want tests proving a forced build is allowed below 95 with an assumed-flags note, so that the escape hatch works and is visible.
36. As a maintainer, I want tests proving the fallback card never auto-recommends build when fields are filled, so that mid-stream failures do not trigger premature builds.
37. As a maintainer, I want tests proving the implementation spec is flexible (landing, marketing, interactive), so that the output is not locked to a landing shape.
38. As a maintainer, I want tests proving per-domain templated copy and color palettes are gone, so that template regressions are caught.
39. As a maintainer, I want tests proving the generation pipeline accepts the flexible spec, so that the AI receives a spec, not a landing schema.
40. As a maintainer, I want tests proving the server rejects low-confidence builds, so that the gate is not only client-side.
41. As a maintainer, I want tests proving a failed discussion turn does not lose the brief or force a build, so that resilience is verified.
42. As a future maintainer, I want the legacy landing schema retained as fallback data, so that emergency generation still works.
43. As a future maintainer, I want the confidence model documented in the architecture notes, so that the readiness rule is canonical and not buried in code.
44. As a beta tester, I want two businesses of the same type to produce visibly different structures when their needs differ, so that the platform proves it is not a template engine.
45. As a beta tester, I want a business with a booking need to get a booking-style structure and a simple warung to get a single page, so that the output adapts to the need.

## Implementation Decisions

### Confidence model on the brief

- The project brief gains two AI-owned fields: a `confidence` integer (0–100) and an `openQuestions` string array of unresolved material decisions the AI still wants to ask about.
- Brief readiness is redefined from "all five required fields filled" to "confidence ≥ 95 and no blocking open questions and the user has agreed to a reflected brief." The five legacy fields (business type, offer, target customer, CTA, style preference) remain on the brief as optional metadata consumed by the build prompt, but they no longer gate readiness.
- The readiness helper returns a structured result (ready boolean, confidence, remaining open questions) rather than a single boolean, so the client and server can reason about why a brief is or is not ready.
- The confidence value is normalized defensively: non-numbers clamp to 0, out-of-range values clamp to 0–100, so malformed AI output never produces a false "ready."

### Free-form discussion questions

- The discussion question type's `id` becomes a free-form string (a short slug the AI chooses, e.g. `opening_hours`, `delivery_area`, `product_count`, `budget`, `logo`), no longer restricted to the five legacy field ids.
- The question payload keeps its existing shape (question text, 3–5 specific options, recommended option, selection mode, why-it-matters) so the client composer does not change shape. Only the `id` constraint is relaxed.
- Answers to free-form questions are persisted into the brief's `notes` array and into the project's memory facts, not into fixed schema slots. The five legacy fields are filled only when the AI explicitly maps an answer to them.
- The workspace answer parser is generalized to accept any question id the active card declares, rather than validating against the five legacy ids. Custom-typed answers and option selections both remain supported.
- The deterministic fallback question builder (used when AI tool output is missing) no longer walks the five-field checklist. When the AI provides no card, the fallback asks the AI to continue or surfaces a brief review; it does not auto-advance through fixed fields.

### AI-decided output structure

- The fixed `ProjectSiteSchema` (eyebrow, headline, subheadline, two CTAs, audience, offer, four-color theme, trust points, sections) is replaced as the generation input by a flexible `ImplementationSpec`.
- The `ImplementationSpec` type shape (from prototype) encodes the decision:

  ```
  ImplementationSpec = {
    appKind: "landing" | "marketing_site" | "interactive_app",
    pages: Array<{ slug, title, purpose }>,
    components: Array<{ name, purpose }>,
    features: Array<string>,          // e.g. "booking_form", "price_calculator", "filterable_catalog", "contact_whatsapp"
    content: {                        // free-form, AI-filled
      [key: string]: string | string[] | { [key: string]: string }
    },
    style: {
      direction: string,              // AI's visual direction prose
      palette?: { background?, foreground?, muted?, accent? }  // optional, AI may omit for pure-prose direction
    },
    primaryCta?: string,              // optional, only when a CTA is relevant
    notes: string[]
  }
  ```

  This lets the AI declare a landing page with one page, a marketing site with several pages, or an interactive app with features and components, all in one shape. A landing page is one valid `appKind`, not the only shape.

- The deterministic per-domain detector (angkringan, laundry, bengkel, food, retail, service) and its templated copy generators (headline, subheadline, trust points, sections per domain) and per-domain color palettes are removed. The AI writes all copy and chooses all structure.
- The schema generation system prompt is rewritten from "create one landing page schema" to "decide the application kind and structure from the discussion, then fill the implementation spec." The prompt instructs the AI to choose the simplest structure that fits the need and to invent layout, hierarchy, and copy specific to the business.
- The generation pipeline consumes the `ImplementationSpec` instead of `ProjectSiteSchema`. The build spec passed to the coding agent describes pages, components, features, content, and style, and instructs the agent to realize that structure as custom React routes/components/content/CSS on the Vite/TanStack starter.
- The coding agent instructions are rewritten to say "build the structure declared in the implementation spec" instead of "turn the conversation into a polished landing page." The agent retains all existing safety constraints (static frontend only, package policy, check gate, Indonesian copy, preview-ready signal).
- The deterministic landing-page generator remains as an emergency fallback. When AI spec generation fails, or AI source generation fails, the fallback produces a valid landing page from whatever brief metadata exists, and the source snapshot metadata records the fallback reason. The fallback is a safety net, not the normal path.

### Build gate enforcement

- The build recommendation card is only produced by the AI when confidence ≥ 95 (or the user forces build). The card carries the confidence value so the client and server can audit it.
- The server build/generate route reads the brief confidence. If confidence < 95 and the request does not carry a force flag, the server rejects the build with a clear message ("AI belum yakin 95% bahwa kebutuhanmu sudah jelas. Lanjut diskusi atau paksa build kalau kamu mau.") and does not start generation.
- The client only renders the build action from a `build_recommendation` card. The `brief_review` card keeps its adjust/refine actions but does not offer a direct build button; the user must let the AI reach confidence first or explicitly force.
- A forced build records `forced: true` and the AI's assumed-flags note on the brief and in build metadata, so the assumption is visible and correctable later through chat edits.

### Fallback and resilience

- When the AI discussion stream fails mid-turn, the persisted brief and the fallback card remain valid. The fallback card is a question or a brief review, never a build recommendation. The user can retry the turn or continue discussing.
- When AI spec generation fails, the generation pipeline falls back to the deterministic landing-page generator and records the failure reason, exactly as the current source-generation fallback does. The last successful preview is not replaced by a failed build.
- The confidence model degrades safely: if the AI never emits a confidence value, confidence defaults to 0, which means discussion must continue. This prevents a silent "ready" state from missing data.

### Documentation

- `docs/architecture.md` project workspace section is updated to replace the five-field readiness rule with the confidence rule, and to describe the `ImplementationSpec` as the generation input. The confidence threshold (95) and the force escape hatch are recorded as canonical.

## Testing Decisions

A good test in this area asserts external behavior through the public functions and routes, not internal helper wiring. The codebase already has strong prior art: `brief.test.ts` and `brief-flow.test.ts` test brief parsing/normalization and workspace turn normalization without AI calls; `site-schema.test.ts` tests schema parsing and quality issues deterministically; `custom-source-generator.test.ts` tests the generation seam with mocked AI tool output; `generate/route.test.ts` tests the build route with mocked prisma and AI; `workspace-answers.test.ts` tests answer parsing; `workspace-sync.test.ts` tests composer state derivation.

The highest-value seam is the discussion → brief → spec derivation, covered mostly by existing test files extended rather than new ones. Three seams, prioritized by coverage:

### Primary seam: discussion → brief → readiness (existing files extended)

- `brief.test.ts`: assert the new readiness helper returns not-ready when confidence < 95 even if all five legacy fields are filled; assert ready only at confidence ≥ 95 with no blocking open questions and user agreement; assert confidence clamps non-numbers and out-of-range values to a safe default; assert the five legacy fields remain optional metadata and do not gate readiness.
- `brief-flow.test.ts`: assert `normalizeWorkspaceTurn` accepts free-form question ids (not only the five legacy ids); assert the fallback card for a filled-but-low-confidence brief is a question or brief review, never a build recommendation; assert a build recommendation card only appears when the AI sets confidence ≥ 95; assert a forced-build card carries a forced flag and an assumed note.

### Secondary seam: answer parsing generalization (existing file extended)

- `workspace-answers.test.ts`: assert the answer parser accepts any question id declared by the active card (free-form slug), not only the five legacy ids; assert free-form answers persist into notes; assert legacy-field answers still map when the AI declares a legacy id.

### Tertiary seams: spec flexibility and build gate (existing files extended)

- `site-schema.test.ts` (or a renamed `implementation-spec.test.ts`): assert the `ImplementationSpec` parser accepts landing, marketing_site, and interactive_app kinds; assert missing optional fields degrade to a valid landing fallback; assert the per-domain template copy and palettes are absent from the deterministic fallback path (fallback still produces a valid landing, but not domain-templated copy).
- `custom-source-generator.test.ts`: assert the generation seam accepts an `ImplementationSpec` of each appKind and that the build spec passed to the agent describes pages/components/features, not landing-only fields.
- `generate/route.test.ts`: assert the server rejects a build whose brief confidence < 95 without a force flag; assert the server allows a build with a force flag and records the forced flag and assumed note; assert a build at confidence ≥ 95 proceeds normally.

Existing prior art patterns to follow: deterministic input/output assertions in `brief-flow.test.ts`, mocked-AI-output generation in `custom-source-generator.test.ts`, mocked prisma/AI route assertions in `generate/route.test.ts`. No new test file is strictly required; extending the existing files keeps the seam count low. If the `ImplementationSpec` type is large enough to warrant its own unit file, a single `implementation-spec.test.ts` is acceptable, but the ideal is to extend `site-schema.test.ts`.

Browser/visual review of output diversity remains human-owned, as in the existing custom Vite PRD. Automated tests catch structural sameness and gate regressions; final design judgment still needs visual inspection.

## Out of Scope

- Arbitrary generated backend code. AI structural freedom is over frontend structure only; static frontend constraints remain.
- Real payment processing, fake checkout, fake auth, fake booking persistence, or generated databases. The `interactive_app` kind allows frontend-only interactive features (forms, calculators, filters), not backend persistence.
- User-provided Dockerfiles or custom runtime profiles.
- Multi-node runtime scheduling or production deployment changes.
- Removing the deterministic fallback entirely. It remains as an emergency safety net.
- Changing the Vite/TanStack starter infrastructure, package policy, manifest, or check gate. Those are owned by the custom Vite PRD and remain as-is.
- Changing the preview/runtime/proxy architecture, publishing, or custom domains.
- Changing auth, rate limits, storage providers, or monitoring.
- A UI for the user to manually pick the application kind. The AI decides the kind; the user influences it through discussion.
- Enforcing a minimum or maximum number of discussion questions. Depth is AI-decided.
- Production database migrations beyond adding optional brief fields (confidence, openQuestions) if they require schema changes; if the brief is stored as JSON, no migration is needed.

## Further Notes

The user's core intent is that the AI owns two decisions the platform currently owns in code: when to stop discussing (confidence, not field count) and what structure to build (landing/marketing/interactive, not always landing). The platform keeps the safety boundaries (static frontend, package policy, check gate, deterministic fallback) and adds the build gate enforcement so low-confidence builds cannot happen silently.

The 95% confidence threshold is the build-recommendation bar. The force escape hatch exists so a hurried user is never trapped, but forced builds are visible and correctable. The five legacy brief fields are deliberately retained as optional metadata because the build prompt and fallback still benefit from having a business type, offer, audience, CTA, and style hint available; they are just no longer the gate.

This PRD does not require `npm create vite@latest` or any interactive scaffolding; the deterministic starter from the custom Vite PRD remains the base. The AI's new freedom is over what to build on top of that starter, not over the starter itself.

Implementation should be staged: confidence gate and free-form questions first (smallest blast radius, biggest discussion-quality improvement), then the `ImplementationSpec` and pipeline rewiring (larger, touches generation), then build-gate enforcement (small, after the first two clarify the confidence surface). Each stage can ship and be tested independently.
