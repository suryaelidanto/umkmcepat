# PRD: In-Preview Visual Feedback

Status: active
Created: 2026-07-10
Updated: 2026-07-10
Owner: Surya
Scope: generated preview annotation UX and annotation-to-revision handoff
Read when: changing visual comment mode, generated preview interaction, iframe annotation messaging, annotation drafts, or post-build revision submission
Do not read for: guided brief discussion, initial generation, code editor UX, publishing, public-site feedback, or general chat layout
Current truth: source code + `PRODUCT.md` + `DESIGN.md` + `docs/architecture.md` + this PRD

## Status History

- 2026-07-10: Active. Replaces the sidebar-oriented annotation UX proposed in `visual-annotation-edit-mode-prd.md` with an in-preview interaction and compact review widget.

## Problem Statement

After a website is generated, users need to point at visible UI and explain what should change. The current visual-comment implementation already identifies elements in the private preview, captures structured target context, stores multiple drafts, and sends them through the existing source edit/build flow. However, activating comment mode replaces the left discussion area with a dedicated visual-comments section. This separates feedback from the website being reviewed, reduces preview space on mobile, and makes a direct-manipulation task feel like form administration.

The user expects the core interaction demonstrated by Agentation: activate comment mode, hover and click the website itself, type a note next to the selected element, leave several numbered comments directly on the preview, then use one compact control to review and submit everything. Technical target data should remain hidden. The existing chat/edit/build machinery should be reused rather than replaced.

## Solution

Visual comments become entirely in-preview. The existing `Komentar` control remains in the preview toolbar. Activating it changes preview interaction without replacing, opening, or resizing the left discussion panel.

While comment mode is active:

- Hovering a meaningful website element shows a restrained target outline.
- Clicking the element blocks its normal action and opens a small annotation popover next to that element inside the preview area.
- The popover names the selected part in friendly Indonesian, optionally shows selected text, accepts one required comment, and supports cancel/add.
- Adding a comment places a numbered marker on the selected element.
- Users may repeat this process for several elements.
- A compact floating feedback widget appears over the workspace when at least one comment exists. Its collapsed state shows the comment count and a clear review action.
- Opening the widget shows the collected comments, delete actions, an optional overall note, and one `Kirim revisi` action.
- Sending combines all structured annotations and the optional overall note into one revision request through the existing generated-source edit/build flow.
- The readable summary remains part of chat history. Hidden selector, text, classes, nearby context, and bounding-box data remain available only to edit logic.
- Successful revision clears drafts, closes comment mode, refreshes the preview, and preserves the normal review flow. Failed revision keeps every draft and the optional note so the user can retry.

The left panel remains the normal discussion surface throughout. No visual-comment section, special annotation composer, or forced panel expansion appears there.

## User Stories

1. As a project owner, I want to activate comment mode from the preview toolbar, so that I can review the generated website visually.
2. As a project owner, I want the website to remain fully visible when comment mode starts, so that I do not lose the context I am reviewing.
3. As a project owner, I want the discussion panel to remain unchanged, so that visual feedback does not interrupt my chat history or composer.
4. As a project owner, I want hover feedback over selectable elements, so that I know what my click will target.
5. As a project owner, I want clicks in comment mode to select instead of navigate, so that links and CTAs can be reviewed safely.
6. As a project owner, I want clicks inside nested text or icons to resolve to a meaningful button, link, heading, card, or section, so that comments target useful UI concepts.
7. As a project owner, I want a comment popover beside the clicked element, so that writing feedback feels connected to what I selected.
8. As a project owner, I want the popover to use friendly labels such as `Judul utama`, `Tombol`, `Teks`, or `Bagian`, so that I never need DOM terminology.
9. As a project owner, I want selected text reflected in the popover, so that copy feedback is precise.
10. As a project owner, I want comment text to be required before adding a marker, so that empty feedback is not stored.
11. As a project owner, I want to cancel a pending comment, so that accidental selections do not create noise.
12. As a project owner, I want keyboard focus to move into the comment field, so that writing is immediate.
13. As a project owner, I want keyboard submission where appropriate, so that repeated review is fast.
14. As a project owner, I want Escape to cancel the pending popover, so that leaving an accidental target is easy.
15. As a project owner, I want a numbered marker on every commented element, so that I can see which parts already have feedback.
16. As a project owner, I want several comments in one review pass, so that AI can revise related problems together.
17. As a project owner, I want a compact widget after my first comment, so that collected feedback is accessible without a permanent panel.
18. As a project owner, I want the collapsed widget to show the number of comments, so that I can track progress at a glance.
19. As a project owner, I want opening the widget to show all collected comments, so that I can review the batch before sending.
20. As a project owner, I want each widget item to show its friendly target label and note, so that I can verify intent without technical metadata.
21. As a project owner, I want to delete a collected comment, so that mistakes are removable before revision.
22. As a project owner, I want an optional overall note, so that I can add cross-cutting direction such as “buat semuanya lebih tenang.”
23. As a project owner, I want the overall note clearly marked optional, so that it never blocks submission.
24. As a project owner, I want one `Kirim revisi` action, so that the entire feedback batch becomes one coherent AI edit request.
25. As a project owner, I want the send action disabled while no saved comments exist, so that invalid requests are prevented.
26. As a project owner, I want the send action disabled during another build, edit, or AI operation, so that concurrent mutations do not conflict.
27. As a project owner, I want a readable summary of submitted visual comments in chat, so that the revision request remains understandable later.
28. As a project owner, I want technical targeting context hidden from chat, so that the experience stays non-technical.
29. As a project owner, I want successful revision to remove old markers, so that resolved feedback does not remain stale.
30. As a project owner, I want successful revision to exit comment mode, so that the revised website returns to normal interaction.
31. As a project owner, I want successful revision to reload the newest safe preview, so that I can inspect the result.
32. As a project owner, I want failed revision to preserve comments and the optional note, so that feedback is never lost.
33. As a project owner, I want the latest successful preview preserved after a failed revision, so that the website never regresses to a blank or broken state.
34. As a project owner, I want unsent comments restored after accidental reload during the same browser session, so that review work survives common mistakes.
35. As a project owner, I want turning comment mode off to close any unfinished popover, so that no detached editor remains visible.
36. As a project owner, I want saved markers to remain available when comment mode is reactivated, so that drafts can be resumed.
37. As a project owner, I want switching to the Code tab to suspend comment interaction, so that annotation clicks never affect code navigation.
38. As a project owner, I want comment mode unavailable before a successful preview exists, so that the control is never misleading.
39. As a project owner, I want comment mode to work against the last good preview after a failed attempt, so that revision can continue safely.
40. As a desktop keyboard user, I want visible focus states and reachable controls, so that the flow is operable without a mouse after target selection.
41. As a screen-reader user, I want mode, count, errors, and send progress announced, so that state is not communicated only visually.
42. As a user at 200% zoom, I want the popover and widget to stay within the viewport, so that controls remain usable.
43. As a user in a narrow workspace, I want the popover to flip or clamp away from viewport edges, so that it is not clipped.
44. As a user reviewing a long page, I want markers to remain attached to document coordinates while scrolling, so that they continue pointing at the intended elements.
45. As a user reviewing a responsive preview, I want comments to retain viewport context, so that desktop and mobile feedback are distinguishable to the AI.
46. As a user, I want normal preview interaction restored immediately when mode is disabled, so that links and controls work again.
47. As a maintainer, I want annotation UI owned by the control plane, so that generated source does not permanently include product editor chrome.
48. As a maintainer, I want the private preview bridge to provide target discovery and marker geometry only, so that the interface boundary remains narrow.
49. As a maintainer, I want public published pages excluded from annotation instrumentation, so that private editing capability is never exposed publicly.
50. As a maintainer, I want parent messages accepted only from the active preview frame, so that unrelated windows cannot create comments.
51. As a maintainer, I want iframe messages schema-checked and size-capped, so that generated code cannot flood control-plane state.
52. As a maintainer, I want comments sanitized before local persistence and API submission, so that malformed target data cannot escape trust boundaries.
53. As a maintainer, I want no annotation content in telemetry by default, so that user feedback and page text are not copied into observability systems unnecessarily.
54. As a maintainer, I want annotation edits to reuse existing ownership, rate-limit, operation-lease, snapshot, build, deployment, and last-good-preview guarantees, so that visual feedback does not create a weaker mutation path.
55. As a maintainer, I want the feature implemented without the Agentation package, so that licensing and product integration remain controlled.
56. As a maintainer, I want a small state seam for draft collection and submission behavior, so that tests do not depend on pixel coordinates or private component structure.
57. As a future agent, I want canonical terms for `annotation mode`, `pending annotation`, `visual annotation draft`, `feedback widget`, and `visual revision`, so that implementation language remains consistent.
58. As a future agent, I want the old sidebar-oriented proposal explicitly superseded, so that it is not accidentally rebuilt.
59. As a future agent, I want richer Agentation features deferred, so that the first implementation stays focused on direct click, comment, collect, and send.
60. As a product owner, I want this interaction to feel like commenting on the website rather than filling a separate form, so that visual revision is obvious and lightweight.

## Implementation Decisions

- Canonical terms:
  - **Annotation mode**: temporary preview interaction mode where generated-site clicks select targets rather than execute actions.
  - **Pending annotation**: one selected target with an open unsaved comment popover.
  - **Visual annotation draft**: a saved user comment plus hidden target context.
  - **Feedback widget**: compact floating workspace control used to review drafts, add an optional overall note, delete drafts, and submit.
  - **Visual revision**: one existing edit/build operation created from a batch of visual annotation drafts.
- The existing sidebar-oriented visual annotation PRD is superseded only for presentation. Its iframe bridge, target payload, sanitization, edit handoff, failure preservation, and last-good-preview decisions remain valid unless contradicted here.
- Annotation mode remains a toolbar toggle available only for a rendered generated preview.
- Activating annotation mode must not change mobile surface, expand the chat panel, resize panels, hide chat, or replace the discussion composer.
- The pending annotation editor renders over the preview surface, positioned from the target bounding box reported by the private preview bridge. Position is clamped to the visible preview bounds and may flip above/left near edges.
- The pending popover contains a target label, selected-text excerpt when present, comment textarea, cancel, and add actions. It does not show selectors, classes, tags, coordinates, or source paths.
- Saved markers remain rendered by private-preview instrumentation because only the iframe knows document scroll coordinates. Marker content is limited to an ordinal number.
- The feedback widget renders in control-plane workspace chrome, not inside generated HTML. It is compact/collapsed by default after the first annotation and expands on explicit click.
- The feedback widget shows saved comments, delete controls, optional overall note, send status, and `Kirim revisi`. It is the only batch-management UI; no sidebar annotation section exists.
- The optional overall note is stored with unsent annotation drafts in browser local storage. It is omitted from payload and summary when blank.
- Existing draft caps remain: maximum 20 comments; comment 1,000 characters; selected text 500; element text 300; nearby text 500; classes and selector path 300. The UI prevents adding beyond the comment cap and communicates the limit in Indonesian.
- The existing annotation summary and hidden edit-instruction builders remain the single formatting seam for submission.
- The existing source edit endpoint remains the mutation seam. No new annotation endpoint or persistence table is introduced.
- The user-visible chat entry includes friendly labels/comments and optional overall direction. Hidden target metadata is submitted separately as annotations/edit context.
- A successful visual revision means the existing edit/build path reports a successful safe build/deployment, not merely that the request was accepted.
- On success, annotations, pending editor, optional note, local-storage draft, and annotation mode clear. Preview reloads to the newest successful deployment.
- On any transport, validation, edit, build, artifact, deployment, or runtime failure, annotations and optional note remain. The feedback widget shows a recoverable error and retry remains available.
- The bridge continues to be injected into private previews only. Public/published output must remain untouched.
- Parent/iframe messaging should move toward the architecture hardening requirement: validate `event.source`, expected message type, payload shape/size, and a per-preview nonce where sandbox-origin constraints permit. Wildcard messaging is not accepted as a final production boundary.
- Normal generated-site navigation, buttons, and form controls are intercepted only while annotation mode is active.
- Disabling annotation mode hides hover state and pending editor immediately. Saved drafts remain until removed, successfully sent, or explicitly discarded.
- Switching away from preview disables active interception and closes the pending editor; saved drafts remain.
- The first version remains desktop-first. Existing responsive workspace behavior must not regress, but full mobile target annotation is not required.
- Agentation is interaction prior art only. No package dependency or copied source is introduced.
- No database migration is required. Browser-local draft recovery and existing chat/edit-attempt records are sufficient for this scope.
- User-facing copy remains Indonesian; internal types, logs, errors, tests, and docs remain English.
- `PRODUCT.md` and `DESIGN.md` remain canonical for product language and visual style. This feature uses restrained workspace chrome, no new accent palette, no decorative animation, and WCAG AA controls.

## Testing Decisions

- **Primary/highest seam:** test the project workspace as a stateful interaction: enabling annotation mode leaves discussion UI intact; receiving a target opens an in-preview pending editor; adding comments creates markers/widget state; submitting calls the existing visual edit flow; success clears drafts; failure preserves them. This is the preferred acceptance seam.
- Unit-test pure annotation formatting/sanitization at the existing visual-annotation module. Assert caps, malformed payload rejection, optional overall note omission/inclusion, readable summary, and hidden target serialization.
- Component tests should assert externally visible behavior and accessible names rather than Tailwind classes or exact pixel positions.
- Preview-frame tests should assert that only messages from the active iframe are accepted and that target events are forwarded to the pending editor.
- Runtime-proxy tests should assert private preview bridge injection, no duplicate injection, mode activation/deactivation, meaningful target selection, normal click interception only while active, and marker updates.
- Edit-route tests should assert ownership, bounded request handling, annotation sanitization, summary persistence, `visual_comment` edit kind, and reuse of safe snapshot/build/deployment behavior.
- Failure tests must prove annotations and optional overall note remain after non-2xx responses, failed build status, thrown network errors, or validation failure.
- Success tests must prove annotations, optional note, pending target, local-storage draft, and annotation mode clear only after successful visual revision.
- Regression test the key product decision: annotation mode must never render a dedicated left-panel `Komentar visual` section or force the chat panel open/resize.
- Test widget count grammar for one and multiple comments using clear Indonesian copy.
- Test pending popover clamping logically through a pure position helper if positioning complexity warrants extraction. Do not assert browser layout coordinates in unit tests.
- Test mode-off cleanup: hover overlay hidden, pending editor closed, generated-site interaction restored, saved markers/drafts preserved.
- Test accessibility contracts: toggle `aria-pressed`, dialog/popover label, focused textarea after selection, Escape cancellation, disabled submit, live send/error status, and 44px minimum action targets.
- Prior art includes workspace sync tests, visual annotation utility tests, edit-route tests, runtime proxy tests, and workspace Storybook/component patterns. Extend these seams before creating new harnesses.
- Manual QA remains required for hover fidelity, meaningful element selection, popover placement at viewport edges, long-page scrolling, responsive preview widths, marker alignment, multiple comments, failure recovery, and revised preview refresh.
- Final quality gate: `bun run check`.

## Out of Scope

- Dedicated left-panel visual-comments section.
- Replacing or redesigning normal discussion/chat UI.
- Persisted annotation database, multi-device sync, teams, assignees, threads, replies, resolution history, or approval workflow.
- Public published-site annotation mode.
- Anonymous customer feedback.
- Mobile-first annotation interaction.
- Area selection, drag selection, multi-element selection, lasso selection, or freehand drawing.
- Animation pause, design mode, direct DOM editing, drag/drop rearrangement, color picker, spacing controls, or computed-style inspector.
- React component-tree inspection, source maps, source file/line display, or developer-visible selectors.
- Screenshots, image attachments, video, voice notes, MCP, webhooks, issue-tracker export, or copy-to-markdown output.
- Automatic publish after revision.
- A new visual-edit API route, new database model, or new background job system.
- Adding Agentation as a dependency or copying its licensed implementation.
- Broad hardening of edit acceptance beyond the separate visual-annotation hardening PRD.

## Further Notes

- Agentation validates the interaction model: activate, target, annotate, collect, output structured context. UMKM Cepat adapts the output step into an immediate safe visual revision rather than a developer clipboard workflow.
- Existing code already provides most technical foundations: toolbar toggle, private-preview bridge injection, hover target detection, target metadata, numbered markers, local draft storage, annotation sanitization/summary generation, and visual-comment edit submission. The primary implementation change is moving pending input and batch review out of the left panel into preview-adjacent overlays.
- The narrowest implementation should delete the sidebar branch, remove forced chat-panel resizing from target selection, add an in-preview pending popover, and add one compact feedback widget. Avoid broader annotation architecture work unless needed to preserve correctness.
- Security hardening for sandboxed iframe messaging remains important. Follow the relevant architecture and holistic hardening requirements when touching the bridge.
- Issue tracker publication was not performed because no active issue-tracker configuration or authenticated GitHub CLI is available in this session. This in-repo PRD is the execution contract; publish it later with the `ready-for-agent` label if tracker setup becomes available.
