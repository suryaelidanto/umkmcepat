# PRD: Visual Annotation Edit Hardening Edge Cases

Status: proposed
Created: 2026-07-08
Owner: Surya
Scope: visual annotation edit acceptance, generated source edit quality gates, preview refresh correctness, runtime/deployment promotion safety
Read when: changing `/api/projects/[id]/edit`, agent tool runner acceptance, visual annotation instructions, generated source validation, preview deployment selection, edit/build status UI
Current truth: source code + `docs/architecture.md` + `docs/prds/visual-annotation-edit-mode-prd.md`

## Problem Statement

Visual annotation edits can currently succeed technically while failing product intent. The edit route accepts a successful build as success, even if the agent made a no-op or irrelevant change. Example: a user asked to fix unreadable text and navbar contrast; the agent only appended `.site-shell{filter:saturate(1.06)}` and `.hero-card{...}` where `.hero-card` does not exist. Build passed, deployment updated, UI showed success, but the requested visual problems remained.

This is not a re-render bug, build bug, or runtime cache bug. It is an edit acceptance bug: “build succeeded” is being treated as “user request was applied.”

## Reliability Goal

For visual annotation edits, UMKM Cepat should only show completion when the system has strong evidence that the generated source changed the annotated targets in a relevant way. Build success remains necessary, but not sufficient.

## Core Invariants

1. A successful edit must create a new snapshot/build/deployment only after source changes pass edit-quality gates.
2. A build success with no relevant source change must be treated as failed or needs-repair.
3. A no-op selector must not count as a meaningful visual edit.
4. The previous good preview must remain visible when validation fails.
5. Published sites must not change unless the user explicitly publishes/promotes.
6. User comments must be preserved when edit validation fails.
7. The UI must not say “Website siap dicek” if the system only knows that TypeScript/Vite compiled.
8. Every visual edit attempt must leave an auditable reason for success, repair, or failure.

## Edge Cases

### A. No-op and irrelevant code changes

1. Agent appends CSS selector that matches no element in generated source, e.g. `.hero-card` when markup has no `hero-card`.
2. Agent edits a selector that exists only in an unused route/component.
3. Agent adds global cosmetic filter, e.g. `saturate()`, instead of solving annotated target.
4. Agent changes comments, whitespace, or formatting only.
5. Agent touches `README`, `AGENTS.md`, config, or unrelated files only.
6. Agent changes generated metadata but not rendered UI.
7. Agent edits a component imported nowhere.
8. Agent creates a new component but never renders it.
9. Agent changes dead CSS below an invalid syntax boundary if CSS parser/build tolerates it.
10. Agent renames a class in JSX but does not update CSS, or vice versa.
11. Agent adds `!important` globally, masking instead of solving target.
12. Agent changes animation/filter/shadow but requested copy/text/contrast/layout.
13. Agent changes a parent container so broadly that requested target is still broken.
14. Agent removes content to avoid conflict instead of fixing visual issue.
15. Agent changes the wrong repeated element because several cards share similar text.
16. Agent edits first matching selector while annotation target referred to second/third repeated card.
17. Agent changes mobile CSS only while user annotated desktop preview.
18. Agent changes desktop CSS only while user annotated mobile preview.
19. Agent changes a route not currently previewed.
20. Agent changes imported content but rendered copy comes from another constant.

### B. Annotation target mapping failures

1. Selector path from DOM is not stable after rebuild.
2. Bounding box shifts after layout change, making marker coordinates stale.
3. Click target is too narrow: span inside button instead of button.
4. Click target is too broad: whole section instead of specific text/button/card.
5. Shadow DOM or nested iframe target cannot be mapped.
6. Text selection crosses multiple elements.
7. Selected text appears multiple times in source.
8. Selected text is truncated by cap and loses disambiguating context.
9. Element text is empty but visual problem is background/border/spacing.
10. Icon-only button has no visible text.
11. Image/background has no alt or textual label.
12. Generated source minifies/collapses copy differently than DOM extraction.
13. DOM includes runtime-generated text not present literally in source.
14. CSS modules/hash/class generation changes class names between builds.
15. Tailwind-like utility classes make class matching too broad.
16. `closest()` heuristic picks nav/link/card unexpectedly.
17. User comments on hover overlay/pin accidentally.
18. Annotation bridge captures product toolbar instead of generated iframe.
19. User scrolls before adding comment; bounding box no longer lines up.
20. Route hash/path changes during annotation.

### C. Visual intent interpretation failures

1. “Jangan nabrak” means contrast/readability, but agent changes layout only.
2. “Ganti warna” requires both foreground and background contrast checks.
3. “Kelihatan tabrakan” may refer to tone/style conflict, not physical overlap.
4. “Bikin premium” needs concrete design changes, not generic color tweak.
5. “Lebih kecil” could mean font size, card size, spacing, or visual weight.
6. “Rapi” could mean alignment, spacing, copy hierarchy, or color consistency.
7. “Jangan putih” could refer to text color, card background, navbar background, or all white surfaces.
8. User annotates two elements with related comments; fixing one may break the other.
9. User asks to preserve current layout but fix contrast.
10. User asks to change a color but generated brand palette conflicts.
11. User asks for impossible contrast with same foreground/background.
12. Comment refers to “atasnya”/“sampingnya” and needs nearby context.
13. Comment uses Indonesian slang/typos.
14. User says “itu” in general instruction; must bind to annotations.
15. User asks for copy and visual change in one comment.
16. User asks for “lebih modern” but target is content card.
17. User wants navbar style fixed but annotates the whole topbar text.
18. User comments on low opacity text; agent changes only color variable unused by variant class.
19. User wants actual business mismatch fixed, not just visual styling.
20. User asks for change that conflicts with earlier brief; visual comment should win for edit scope.

### D. Build/deployment/UI state edge cases

1. Edit build succeeds but preview iframe does not reload.
2. Preview reloads before new deployment is started.
3. New deployment starts but route selection still points to old deployment.
4. Two preview deployments remain `running`; selector picks stale one.
5. `updatedAt` ordering differs from successful build order.
6. Runtime process for old deployment still serves old artifact.
7. Browser caches old JS/CSS asset URL.
8. Asset filenames unchanged despite source change.
9. Preview ready message arrives from old iframe after reload key increments.
10. Build progress panel marks done while runtime startup still pending.
11. UI shows success from chat stream while edit route still running.
12. User sends another edit while first visual edit is running.
13. User toggles annotation mode during edit.
14. User refreshes page during edit; annotations disappear or status lies.
15. User navigates away mid-edit, then returns.
16. Edit route returns 200 with failed build status.
17. Edit route throws after snapshot written but before deployment created.
18. Build succeeds but artifact write fails.
19. Deployment creation succeeds but runtime start fails.
20. Last-good preview should stay visible if validation/build/deployment fails.

### E. Agent/tool-runner acceptance edge cases

1. Agent claims success without modifying files.
2. Agent modifies files then check fails, but fallback incorrectly marks success.
3. Agent only runs `check_app`; no edits.
4. Agent writes unsafe file paths; runner blocks but route misinterprets partial result.
5. Agent writes enormous CSS/JS to brute-force styling.
6. Agent imports new dependency instead of using existing CSS.
7. Agent adds backend/auth/payment code despite static-only policy.
8. Agent removes preview-ready hook.
9. Agent breaks accessibility labels while fixing visuals.
10. Agent changes CTA links unexpectedly.
11. Agent removes sections not referenced by annotations.
12. Agent rewrites the whole app for a small contrast fix.
13. Agent changes project manifest incorrectly.
14. Agent emits invalid JSON/metadata in trace.
15. Agent produces valid source but violates package policy.
16. Agent edits generated lockfile/node_modules artifacts.
17. Agent adds local image refs/files missing from dist.
18. Agent hardcodes annotation labels/comments into UI accidentally.
19. Agent exposes hidden selectors/DOM metadata in visible website copy.
20. Agent changes public publish state without explicit publish.

### F. Validation false positives

1. Existing selector match is counted even if new CSS selector has zero matches.
2. Source text contains a class name in comments/string literals only.
3. Regex selector parser accepts invalid CSS.
4. Matching class in source does not mean rendered on annotated route.
5. Color changed but contrast still below readable threshold.
6. Font size changed by 1px and treated as success despite no perceptible fix.
7. Build artifact hash changes only due to timestamp/non-determinism.
8. Diff count threshold passes due to formatting.
9. Agent changed nearby target but not annotated target.
10. Agent changed hidden mobile media query but desktop issue remains.
11. CSS variable changed but overridden later.
12. Selector exists but specificity loses.
13. Inline style overrides changed stylesheet.
14. Validation checks source only, not built artifact.
15. Validation checks current source but preview serves old deployment.
16. Chat summary exists and is mistaken for applied edit.
17. Operation trace includes `write_file` but write content equals previous content.
18. Multiple annotations: one fixed, one ignored, overall marked success.
19. User asked two constraints; validation checks only first.
20. Agent adds CSS that matches annotation target but worsens readability.

### G. Validation false negatives

1. Agent fixes issue by changing parent/theme variable, not annotated selector.
2. Agent fixes contrast through CSS variable used globally.
3. Agent fixes by changing component structure, so old selector no longer exists.
4. Agent removes conflicting wrapper correctly.
5. Agent moves content into new reusable component correctly.
6. Agent rewrites copy to remove selected text intentionally.
7. Agent fixes repeated cards via shared data mapping.
8. Agent fixes route-level layout via root class.
9. Agent changes imported design token used by target.
10. Agent uses semantic CSS cascade instead of direct selector.
11. Agent fixes by changing background rather than foreground.
12. Agent fixes by changing opacity variable.
13. Agent improves responsive layout with media query only.
14. Agent fixes icon-only contrast via `currentColor` parent.
15. Agent changes content module not JSX/CSS.
16. Agent removes unused bad selector and replaces markup.
17. Agent fixes with browser default by removing custom style.
18. Agent fixes by changing the underlying data label.
19. Agent changes a route component and validation only scans CSS.
20. Agent performs correct change that is hard to prove without rendering.

### H. Security/privacy/safety edge cases

1. Annotation payload includes user PII typed into generated form fields.
2. Selected text includes secrets/password accidentally pasted into preview.
3. DOM classes/source paths leak to user-visible chat summary.
4. Hidden payload grows too large and causes request/log bloat.
5. Annotation bridge posts messages to malicious parent/origin.
6. Generated iframe posts fake annotation targets to parent.
7. Third-party script inside generated preview spams postMessage.
8. Public published page includes private annotation bridge.
9. CSP/sandbox changes accidentally allow generated source broader powers.
10. Agent copies hidden selector metadata into rendered website.
11. Logs persist full annotation payload unnecessarily.
12. Validation logs include generated source with user private info.
13. User can annotate cross-origin iframe inside generated site.
14. Click interception blocks browser accessibility unexpectedly.
15. Keyboard-only users cannot exit annotation mode.
16. Pin/overlay z-index hides critical preview UI after mode off.
17. Bridge script crashes generated page.
18. Bridge script mutates generated DOM permanently.
19. Markers remain in screenshots/public artifact.
20. Validation executes generated JS in control plane.

### I. UX/message edge cases

1. UI says success when validation only partially passed.
2. User sees “build failed” when build passed but edit validation failed; wording should say AI belum menerapkan komentar dengan tepat.
3. User loses annotations after validation failure.
4. User cannot retry same annotations.
5. User cannot tell preview is old after failed edit.
6. Spinner/progress remains stuck after validation failure.
7. Completed-build card appears while annotation panel is active.
8. Chat composer reappears during annotation mode.
9. Visual comments panel has no clear exit.
10. Send button allows empty/duplicate comments.
11. Multiple sends create duplicate chat summaries.
12. User edits/deletes a pending annotation while send in flight.
13. Annotation mode active but preview tab switched to code.
14. Mobile viewport annotation unsupported but button visible.
15. Text in status uses formal `Anda/Bapak/Ibu` instead of `aku/kamu`.
16. Developer terms appear in user-facing failure messages.
17. User can't distinguish AI reasoning from applied source changes.
18. Long annotation list becomes unusable.
19. Error message hides latest good preview action.
20. User expects publish but edit only changes private preview.

### J. Test/observability edge cases

1. No test fails for no-op selector.
2. No fixture for visual annotation instruction.
3. No fixture where build passes but validation fails.
4. No fixture where validation passes through parent/theme change.
5. No test for keeping annotations on validation failure.
6. No test for preserving previous deployment on validation failure.
7. No test for public route excluding annotation bridge.
8. No test for latest preview deployment selection after edit.
9. No log differentiates build failure vs validation failure.
10. No operation trace includes validation decision.
11. No metric counts no-op visual edits.
12. No debug endpoint/script to inspect latest project build/deployment/artifact.
13. No deterministic artifact comparison.
14. No screenshot/DOM smoke harness available.
15. No audit script checks whether latest source differs meaningfully from parent.
16. No regression test for `.hero-card`-style no-op selector.
17. No regression test for unreadable contrast after edit.
18. No targeted test for annotation summary not triggering separate chat AI stream.
19. No test for stale iframe ready messages.
20. No cleanup test for bridge markers after mode off.

## Proposed Hardening Layers

### Layer 1: Cheap deterministic source gates

- Reject visual edit success if no user-rendered source files changed.
- Reject CSS-only edits where all newly added selectors match no class/tag/id/text in source.
- Reject edits that only touch comments/whitespace/config/docs for visual annotation requests.
- Require at least one changed file in `src/` except allowed content modules.
- Require operation trace to include meaningful `write_file`/`replace` and successful `check_app`.
- Record validation result in snapshot/build metadata.

### Layer 2: Annotation-aware relevance gates

- Build a target token set from each annotation: visible text, selected text, label words, tag, classes, selector path classes/ids.
- Score changed files against target tokens.
- Require every annotation to be either directly touched or covered by a shared parent/theme/content change with an explanation.
- Ask agent to return a short structured apply report per annotation:
  - `annotationId`
  - `status: applied | not_applicable | needs_user_clarification`
  - `filesChanged`
  - `whatChanged`
  - `whyThisTargetsTheComment`
- Treat missing/empty report as validation failure for visual edits.

### Layer 3: Repair loop before failure

- If build passes but validation fails, run one repair attempt with specific validator errors.
- Example repair prompt: `Your build passed, but selector .hero-card matches no rendered/source element and the requested contrast target was not changed. Fix the annotated target directly.`
- Cap repair attempts to 1 for MVP.
- Preserve annotations during repair/failure.

### Layer 4: Optional rendered DOM/screenshot smoke

- Fetch private preview HTML/assets or inspect built dist statically.
- For contrast-related comments, compute simple foreground/background contrast for matched target when feasible.
- For requested color/readability changes, assert CSS for target or parent changed.
- Avoid full browser automation in MVP unless cheap/reliable.

### Layer 5: Honest UI states

- Distinguish statuses:
  - `building`: AI sedang menerapkan komentar.
  - `validating`: Aku cek perubahan ini nyambung dengan komentarmu.
  - `needs_repair`: AI mencoba memperbaiki perubahan yang belum tepat.
  - `failed_validation`: AI belum berhasil menerapkan komentar dengan tepat; komentarmu tetap aman.
  - `succeeded`: Website sudah direvisi dan siap dicek.
- Only clear annotations on true success.
- On validation failure, keep latest good preview and show retry.

## MVP Acceptance Criteria

1. The `.hero-card` no-op selector case fails validation, not success.
2. A visual annotation edit that changes only docs/config/comments fails validation.
3. A visual annotation edit that changes source and passes build but has zero relevance to annotations fails validation.
4. A CSS edit with new selectors that do not match source fails validation.
5. A valid parent/theme/content change can pass if the agent report explicitly maps it to annotation IDs.
6. Validation failure preserves previous preview and annotations.
7. Validation failure uses user-friendly Indonesian copy and avoids developer terms.
8. Build success alone no longer clears visual annotations.
9. Operation trace/metadata records validation pass/fail reason.
10. Tests cover no-op selector, irrelevant edit, valid mapped edit, failure preservation, and bridge privacy.

## Non-goals

- Perfect visual proof for every subjective design request.
- Full Playwright screenshot diff in MVP.
- React component/source-map tracing.
- Persisted annotation database/history.
- Public site edit mode.
- Automatic publish after visual edit.

## Implementation Order

1. Add validation helpers for changed-file relevance and no-op CSS selectors.
2. Add tests using the `.hero-card` failure fixture.
3. Extend visual edit instruction to request per-annotation apply report.
4. Parse/store agent apply report if available.
5. Gate edit success on build success + validation success.
6. Add one repair attempt when validation fails.
7. Update UI build progress/status copy.
8. Run `bun run check`.
