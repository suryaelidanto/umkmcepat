Status: active
Created: 2026-07-09
Updated: 2026-07-09
Owner: Surya
Scope: guided Discuss flow reliability, streaming chat, workspace card durability, and retry/debug behavior
Read when: changing project discussion, AI chat streaming, workspace cards, brief memory, chat persistence, or Discuss-mode debugging
Do not read for: generated source implementation, runtime supervisor work, public publishing, auth-only work, or visual redesign unrelated to workspace conversation state
Current truth: source code + `PRODUCT.md` + `PRINCIPLES.md` + `DESIGN.md` + `docs/architecture.md`

## Problem Statement

Users rely on the guided Discuss flow to turn a rough Indonesian business prompt into a build-ready project brief. The current experience has become unreliable: AI text sometimes appears only after the whole response finishes, the interactive workspace card sometimes fails to appear, stale questions can return after a refresh/reload, and a transient error state can flash even when the AI eventually succeeds.

From the user's perspective, this feels broken and untrustworthy. They may answer a real question, see AI start responding, then get an error or an old card instead of the next useful input. They cannot tell whether their answer was saved, whether the AI response was real, or whether the UI is fabricating fallback content. This is especially damaging because the product promise is a calm, guided builder that helps non-technical UMKM owners make progress without technical ambiguity.

The bug class is not just visual. The backend can successfully receive a real model tool output after the response finish handler has already persisted a `none` or stale workspace state. Then the client reloads committed chat/workspace data and shows the wrong state. In logs this appears as `discuss:finish` with `didWorkspaceToolUpdate:false`, followed later by `discuss:tool-output` with the correct workspace card. That race makes the user see failure or a previous question even though the model produced a valid next card.

The product must preserve the newer flexible brief model: canonical `facts[]`, `decisions[]`, AI-owned confidence, open questions, and flexible implementation summaries. It must not regress to old template-like readiness gates based on fields such as business name, audience, CTA button, or other fixed landing-page slots. The goal is to recover the smooth streaming/chat-and-card feel that worked before while keeping the newer richer Discuss model.

## Solution

The guided Discuss flow should feel like one continuous real AI conversation:

- The user's answer is saved immediately enough that it is never lost.
- The AI response text streams progressively in the chat bubble.
- The interactive UI card is distinct from the chat text and appears after the model provides the structured workspace update.
- The UI does not show a scary failure state while the model is still streaming or while the tool output is still resolving.
- If the AI truly fails to provide a usable workspace card, the user sees an explicit retry state with their answer preserved.
- The system never invents dummy/manual question cards to cover failure.
- The system never makes hidden duplicate model calls during the normal success path.
- Repair/retry behavior is allowed only when repairing a real AI failure or user-triggered retry.
- Debug logs clearly show start, streamed response finish, tool output, persistence, and failure boundaries.

The implementation direction is a single streamed AI turn for Discuss mode: text is streamed through the normal chat stream, while structured workspace state is returned through a schema-validated AI tool call. The tool execution is the durable authority for workspace-card state: when a valid tool output is normalized, the server persists the new brief, workspace card, and project title at that boundary, not only in the stream finish callback. The finish callback may persist chat messages and compaction, but it must not be the only place where workspace-card state is saved.

On the client, in-flight assistant messages with text must remain visible even before the workspace tool part reaches `output-available`. Filtering should not hide streaming assistant text just because the workspace tool output has not arrived yet. Missing-card error UI should only appear after the streaming turn has ended and the latest assistant turn still lacks a usable workspace update.

## User Stories

1. As a small-business owner, I want AI text to stream as it is written, so that I know the system is actively working.
2. As a small-business owner, I want the next question card to appear after the AI response, so that I can continue without guessing what to type.
3. As a small-business owner, I want my answer to be preserved even if AI fails, so that I do not have to repeat myself.
4. As a small-business owner, I want the app to avoid scary error flashes during normal AI thinking, so that I do not lose confidence.
5. As a small-business owner, I want every question to feel specific to my business, so that the builder does not feel like a generic template.
6. As a small-business owner, I want to answer exact-value questions with text, so that names, WhatsApp numbers, addresses, menus, and opening hours are not forced into fake options.
7. As a small-business owner, I want to choose from options only when options make sense, so that strategic decisions are easier but exact details remain free-form.
8. As a small-business owner, I want the chat response and input card to feel connected, so that I understand why the next question matters.
9. As a small-business owner, I want a clear retry button only when AI truly fails, so that I can recover without hidden fake content.
10. As a small-business owner, I want refresh to keep the latest correct card, so that progress is durable.
11. As a small-business owner, I want browser reloads to show the same conversation state, so that the workspace feels stable.
12. As a small-business owner, I want old answered questions not to come back, so that the discussion feels like it is progressing.
13. As a small-business owner, I want the AI to ask one question at a time, so that I am not overwhelmed.
14. As a small-business owner, I want the AI to keep asking until it is genuinely ready, so that the generated website is not shallow.
15. As a small-business owner, I want the AI to recommend build only when the brief is strong or I force it, so that I do not get premature output.
16. As a small-business owner, I want the AI to use friendly Indonesian with aku/kamu, so that the product feels approachable.
17. As a small-business owner, I want the system to avoid formal labels like Anda/Bapak/Ibu/Kak, so that the conversation does not feel stiff.
18. As a small-business owner, I want no dummy fallback questions, so that I can trust that the visible content came from real AI.
19. As a small-business owner, I want no hidden normal-path double AI call, so that responses feel fast and consistent.
20. As a small-business owner, I want the workspace card to appear only when it is backed by real structured AI output, so that UI choices are trustworthy.
21. As a small-business owner, I want a failed AI turn to explain what happened in plain Indonesian, so that I know what to do next.
22. As a small-business owner, I want partial progress to remain visible during slow model responses, so that long waits do not feel frozen.
23. As a small-business owner, I want model latency not to break the UI state, so that slow but valid responses still work.
24. As a small-business owner, I want the build recommendation to remain stable after it appears, so that I can decide when to build.
25. As a small-business owner, I want continuing discussion after a recommendation to preserve context, so that I can refine without losing the build path.
26. As a returning user, I want the project page to load the latest committed chat and workspace card, so that I can resume from the correct state.
27. As a returning user, I want the latest assistant text and workspace UI to match, so that the chat history does not contradict the active card.
28. As a tester, I want verbose logs for every Discuss turn, so that failures can be diagnosed from terminal output.
29. As a tester, I want AI request logs to show start, tool output, finish, and persistence order, so that races are visible.
30. As a tester, I want a reproducible route-level test for tool/finish ordering, so that this regression cannot return unnoticed.
31. As a developer, I want one high-level test seam around the Discuss API route, so that behavior is verified without brittle private implementation tests.
32. As a developer, I want client behavior tested at the message filtering/composer-state seam, so that streaming text is not hidden before tool output.
33. As a developer, I want the AI SDK stream contract documented in the PRD, so that future agents do not reintroduce non-streaming JSON generation.
34. As a developer, I want workspace-card persistence tied to tool execution, so that `onFinish` ordering cannot lose the card.
35. As a developer, I want chat-message persistence to stay in the finish path, so that complete assistant messages are saved when the stream completes.
36. As a developer, I want brief memory updates to stay flexible, so that new business-specific decisions do not require schema changes.
37. As a developer, I want legacy fields to remain compatibility caches only, so that readiness is not forced back into a template model.
38. As a developer, I want rate-limit, auth, and ownership behavior preserved, so that reliability fixes do not weaken boundaries.
39. As a developer, I want no generated/manual fallback card code added, so that product integrity remains clear.
40. As a developer, I want failed tool outputs to produce explicit retry states, so that the user sees recoverable truth instead of fake progress.
41. As an operator, I want verbose Discuss logs to avoid secrets, so that debugging is safe to run locally and in controlled environments.
42. As an operator, I want logs to distinguish model failure from UI merge failure, so that incidents are not misdiagnosed.
43. As an operator, I want every project route involved to keep user ownership checks, so that one user's chat state cannot leak to another.
44. As a product reviewer, I want the final flow to feel as smooth as the older working streaming implementation, so that usability improves without rolling back product depth.
45. As a product reviewer, I want the new flexible questions, text answers, aliases, facts, and decisions to remain, so that the builder can handle richer projects.
46. As a product reviewer, I want no template-y labels or fixed landing-page checklist to drive the conversation, so that the AI can adapt to the business.
47. As a future agent, I want this PRD to explain the exact race condition, so that I do not repeat the same failed fix.
48. As a future agent, I want clear out-of-scope boundaries, so that I do not turn this into a generator, runtime, or redesign project.

## Implementation Decisions

- Discuss mode uses one streamed AI turn for the normal success path. The assistant text should be produced through streaming chat output, not by waiting for a complete JSON blob.
- Structured workspace UI is produced through an AI SDK tool call. The tool output is normalized by the server before it becomes durable workspace state.
- The workspace card, brief update, and project title are persisted when the workspace tool execution produces a normalized result. This prevents loss when the stream finish callback fires before the tool execution promise has completed.
- The stream finish callback persists chat messages and chat compaction. It may also observe the latest workspace state, but it must not be the only persistence path for workspace cards.
- The client reads in-flight assistant text even when the matching workspace tool output is not yet available. Assistant-message filtering must not hide text parts during streaming.
- The client shows missing-workspace-card retry UI only after the response is no longer submitted/streaming and the latest assistant turn still lacks a usable workspace update.
- The client may reload committed workspace/chat state after a stream completes, but reload should be a reconciliation aid, not the only way to recover the active card.
- The server remains the single authority for normalizing model-produced workspace cards. Malformed cards degrade to `none` or explicit retry behavior; they do not become fabricated deterministic questions.
- The AI prompt continues to require exactly one visible assistant response and exactly one workspace update tool call in Discuss mode.
- The prompt continues to ask one question per turn and to prefer text answer mode for exact values.
- The flexible brief model remains: `facts[]`, `decisions[]`, `confidence`, `openQuestions`, and `forcedBuild` are canonical. Legacy metadata fields are compatibility caches only.
- Existing auth, ownership, rate-limit, chat-memory, and compaction boundaries remain in place.
- Verbose AI logs should include at least Discuss start, tool output, finish, whether a workspace update happened, and enough normalized card summary to diagnose state transitions. Logs must not include secrets.
- Normal Discuss success must not use hidden double AI calls. A second call is allowed only for explicit retry or a narrowly scoped repair of real model failure.
- Explicit retry is user-visible and must not erase the user's stored answer.
- No database schema change is required for this reliability work.
- No new UI visual language is required. The work uses existing workspace chat, composer, card, and error surfaces.

A prototype finding from debugging describes the target state machine:

```txt
user answer submitted
  -> server persists effective brief/user answer
  -> AI streams assistant text
  -> setWorkspaceUi tool normalizes workspace turn
  -> tool execution persists brief/workspaceCard/title
  -> stream finish persists complete chat messages + compaction
  -> client reconciles live tool output and committed workspace state
```

The important decision is that `tool execution persists workspaceCard` happens before or independently of `stream finish persists chatMessages`; the system must be correct even if those callbacks are observed in the opposite order.

## Testing Decisions

- Prefer one highest useful seam: the project preview Discuss API route with mocked auth, Prisma, AI model, and AI SDK stream/tool behavior. This seam can reproduce the real race by making finish fire before the tool output resolves.
- Add or update a route-level test that proves a valid tool output persists the workspace card even if stream finish has already run.
- Add or update a route-level test that proves chat messages still persist on finish without overwriting a later valid workspace card with `none`.
- Add or update a route-level test that proves user answers are applied to the effective brief before the AI turn starts.
- Add or update a route-level test that proves Discuss uses the streaming API path, not the complete JSON generation path, for normal success.
- Reuse existing route tests for project preview behavior as prior art.
- Reuse existing brief-flow tests for normalization, aliases, text answer mode, free-form question ids, and no fabricated fallback questions.
- Add a focused pure/client seam if needed around message filtering/workspace-sync behavior. The test should assert that an assistant message with a text part remains visible even before a tool part reaches output-available.
- If a UI component test is needed, keep it behavior-level: visible streaming text, no premature missing-card error while status is submitted/streaming, retry state after completion without a workspace tool output.
- Do not test private implementation details such as exact log line formatting unless logs are the only observable seam for a bug.
- Do not require full browser automation for this PRD unless route/client seam tests fail to catch the regression.
- Manual validation should use verbose dev mode and a real Discuss turn. Expected behavior: text appears progressively, no error flash during streaming, the next card appears after tool output, refresh shows the same card.
- Quality gate before handoff is at least targeted TypeScript and relevant tests. Full `bun run check` is required before PR/handoff unless the user explicitly asks for rapid local iteration only.

## Out of Scope

- Rebuilding the generated source pipeline.
- Removing fake/dummy generated source fallbacks outside the Discuss flow.
- Changing project runtime supervisor, preview proxy, artifact storage, or publish behavior.
- Introducing a new database schema for brief or chat state.
- Replacing AI SDK or 9Router.
- Adding Langfuse or another observability product.
- Redesigning the workspace UI visual system.
- Adding new reusable visual components unless a follow-up UI change requires them.
- Reverting to fixed template readiness fields such as business name, audience, CTA button, offer, or style as hard gates.
- Adding deterministic/manual fallback question cards.
- Adding hidden normal-path duplicate AI calls.
- Supporting arbitrary generated backend code.
- Changing auth/session provider behavior.

## Further Notes

The current failure was diagnosed from local verbose logs. The key evidence was a valid `discuss:tool-output` event appearing after a `discuss:finish` event that had already recorded `didWorkspaceToolUpdate:false` and `workspaceCard:none`. Any future implementation should preserve a log shape that makes this order obvious.

The older working flow around commit `561523a9e40ef4523ce65c280c804a4272bc4df8` is useful as a UX reference because it used streaming text and a workspace UI tool. It should not be copied wholesale because the product has since moved to a richer flexible brief model and away from template-like generated-site fields.

The desired user experience is: chat feels alive first, then the card lands confidently. The card should feel like a continuation of the AI's question, not a duplicate paragraph or a generic form. If the card cannot land, the product should say so clearly and offer retry without pretending.

## Status History

- 2026-07-09: Created after diagnosing Discuss text streaming and workspace-card persistence race.
