# PRD: Structured Discuss Turn with Graceful Free-Chat Fallback

Status: active
Created: 2026-07-13
Updated: 2026-07-13
Owner: Surya
Scope: discuss-turn AI output strategy, tool calling elimination, structured output with free-text fallback
Read when: changing the discuss route AI call shape, workspace card delivery, chat text streaming, or any guided-discuss reliability architecture
Do not read for: build generation, runtime supervisor, preview proxy, publishing, auth, moderation, AI model selection, or 9Router combo configuration
Current truth: source code + `docs/architecture.md` + `docs/prds/guided-discuss-reliability-prd.md` + `docs/prds/ai-streaming-reliability-hardening-prd.md` + `docs/prds/confidence-driven-discussion-and-ai-decided-output-prd.md` + `docs/prds/workspace-card-reliability-hardening-prd.md` + this PRD

## Status History

- 2026-07-13: Proposed after live testing revealed `tool_choice: "required"` is silently ignored by the 9Router → DeepSeek path, and `response_format: json_schema` strict mode is not enforced (constrained decoding not active). Combines Option 1 (structured output) with Option 2 (free-chat fallback) to reach zero-error UX.

## Problem Statement

The guided discuss turn uses one `streamText` call with `toolChoice: "required"` and a `setWorkspaceUi` tool. The model must emit both visible chat text and a structured tool call carrying the next workspace card. DeepSeek V4 Pro via the 9Router combo silently ignores `tool_choice: "required"` on ~5-10% of turns, returning text-only with `finishReason: stop` and no tool call. The server then runs a repair pass that re-calls the model with a forced tool choice, which can also fail, and the repair race causes the client to reload stale state from the database.

A live test confirmed that `response_format: json_schema` strict mode is also not enforced by the 9Router → DeepSeek path: the model returned plain prose instead of a JSON object despite a strict schema. This means `Output.object` via the OpenAI-compatible provider is not guaranteed to use constrained decoding, and the same ~5-10% failure rate applies.

From the user's perspective, the product feels unreliable: the chat text appears, but the next question card sometimes does not, the previous question reappears, or the chat history vanishes momentarily. The user should never see any of this. The chat must always work, the guided interview card must appear when the model produces valid structured output, and when it does not, the user must still be able to type freely and continue the conversation without any error state.

## Solution

Replace the tool-calling discuss turn with a structured-output discuss turn that uses `Output.object` as the primary path, and gracefully degrades to free-chat when the model's output is not valid structured data.

Primary path (~90-95% of turns): the server calls `streamText` with `Output.object` and a schema that includes `chatText`, `briefPatch`, `workspaceCard`, and `projectTitle`. The model produces a single JSON object. The server streams the `chatText` field to the client as visible text and delivers the `workspaceCard` as the next interactive card. No tool calling, no `toolChoice: "required"`, no repair pass.

Fallback path (~5-10% of turns): if the model's output is not valid JSON or is missing required fields, the server treats the raw text as a free-chat response. The client shows the text normally and the composer stays open for the user to type freely. No error state, no retry button, no broken card. The next turn tries structured output again.

The existing repair pass (`repairMissingWorkspaceTool`, `repairWorkspaceCard`) is removed. The existing preparing-state poll loop from the workspace-card-reliability PRD is simplified: it is no longer needed for the repair race, but it remains as a safety net for the brief window between stream completion and workspace state reload.

## User Stories

1. As a UMKM owner, I want the chat to always work, so that I never feel like the app is broken.
2. As a UMKM owner, I want the next question card to appear when the AI produces it, so that the guided interview feels smooth.
3. As a UMKM owner, when the AI does not produce a question card, I want to still be able to type my answer freely, so that the conversation continues without interruption.
4. As a UMKM owner, I never want to see the previous question reappear after I answered it, so that I do not think the app reset.
5. As a UMKM owner, I never want my chat message to disappear, so that I trust the app remembers what I said.
6. As a UMKM owner, I never want to see a red error panel during a normal discuss turn, so that the experience feels calm and reliable.
7. As a UMKM owner, I want the chat text to stream smoothly, so that the response feels real-time.
8. As a UMKM owner, I want the question card to appear shortly after the chat text finishes, so that I know what to answer next.
9. As a UMKM owner, if the AI cannot produce a structured card, I want the composer to stay open, so that I can type my answer in my own words.
10. As a UMKM owner, I want the free-chat fallback to feel natural, so that I do not realize the AI skipped the structured output.
11. As a UMKM owner, I want the next turn to try the structured card again, so that the guided interview resumes normally.
12. As a UMKM owner, I want the build recommendation card to appear as reliably as a question card, so that the transition to build feels smooth.
13. As a UMKM owner, I want the brief review card to appear when the AI thinks the brief is ready, so that I can confirm or adjust before building.
14. As a UMKM owner, I want the chat scroll to stay at the bottom during the turn, so that I do not lose my place.
15. As a UMKM owner, I want the composer to lock while the AI is responding and unlock when the response is done, so that I cannot send duplicate messages.
16. As a developer, I want the discuss route to use `Output.object` instead of tool calling, so that the model's entire output is a structured object and there is no tool-choice to ignore.
17. As a developer, I want the server to validate the model's output and fall back to free text when it is invalid, so that a malformed response never breaks the UX.
18. As a developer, I want the repair pass removed, so that the server is simpler and the repair race is eliminated.
19. As a developer, I want the `setWorkspaceUi` tool and all tool-calling logic removed from the discuss route, so that the code is simpler and there is one less failure mode.
20. As a developer, I want the chat text to stream from the `chatText` field of the partial object, so that the user sees the response in real time.
21. As a developer, I want the workspace card delivered from the `workspaceCard` field of the final object, so that the card is always consistent with the chat text.
22. As a developer, I want the existing `normalizeWorkspaceTurn` helper reused, so that the server remains the single authority for validation and fallback.
23. As a developer, I want the `workspaceTurnToolInputSchema` reused as the `Output.object` schema, so that the schema definition stays in one place.
24. As a developer, I want the `onFinish` persistence to save the chat text as a user-visible assistant message and the structured fields as project state, so that the database stays consistent.
25. As a developer, I want the client to handle the structured output transparently, so that the `useChat` hook still works for text streaming.
26. As a developer, I want the free-chat fallback to persist the raw text as the assistant message without a workspace card, so that the conversation history stays complete.
27. As a developer, I want the preparing-state poll to remain as a safety net, so that the brief reload window is covered.
28. As a developer, I want the AI system prompt updated to instruct the model to produce the JSON object, so that the model knows the output format.
29. As a developer, I want the confidence gate and brief patch logic unchanged, so that the readiness model stays stable.
30. As a developer, I want the 9Router combo and model selection unchanged, so that the provider path stays stable.
31. As a developer, I want the discuss route tests updated to verify both the structured-output path and the free-chat fallback, so that regressions are caught.
32. As a developer, I want no new server endpoints, so that the API surface stays small.
33. As a developer, I want no new dependencies, so that the lockfile stays stable.
34. As a developer, I want the generate route's existing `Output.object` pattern as prior art, so that the approach is proven in the codebase.
35. As a developer, I want the `response_format` behavior verified per provider, so that we know whether constrained decoding is active and can adjust the fallback rate.
36. As a UMKM owner, I want the guided interview to feel like the AI is always in control, so that I trust the process even when the AI falls back to free chat.

## Implementation Decisions

- The discuss route replaces `streamText({ tools, toolChoice: "required" })` with `streamText({ output: Output.object({ schema }) })`. The schema is `workspaceTurnToolInputSchema` extended with a `chatText` string field. The `setWorkspaceUi` tool, all tool-calling logic, `repairMissingWorkspaceTool`, and `repairWorkspaceCard` are removed from the discuss route.

- The `Output.object` schema adds a `chatText` field to the existing `WorkspaceTurnToolInput` shape. The schema stays permissive (no strict mode, no additionalProperties: false) because the 9Router → DeepSeek path does not enforce constrained decoding. The server validates and normalizes via the existing `normalizeWorkspaceTurn` helper, which already degrades gracefully to a fallback card.

- The server streams the chat text to the client via a custom SSE event shape. The `streamText` `partialOutputStream` is consumed server-side. For each partial, the server extracts `chatText` and sends it as a text delta to the client. The workspace card is sent as a separate event when the final object is available. This preserves the `useChat` text streaming experience on the client.

- When the model output is not valid JSON or is missing `chatText`, the server falls back to free chat: it persists the raw model text (or a generic acknowledgment if the output is empty) as the assistant message, does not set a workspace card, and the client shows the composer open for free text. No error state is surfaced.

- The `onFinish` handler persists: (1) the assistant chat message (chatText or raw text), (2) the brief patch, (3) the workspace card, and (4) the project title — all atomically, using the existing persistence helpers introduced in the codebase-hardening pass. When the fallback fires, only the chat message is persisted.

- The AI system prompt is updated. The streaming contract ("always emit visible text first, then call tool") is replaced with "produce a JSON object with chatText, briefPatch, workspaceCard, and projectTitle". The interview discipline, tone contract, confidence gate, and option design rules remain unchanged. The prompt instructs the model that `chatText` is the user-visible response and `workspaceCard` is the hidden interactive card.

- The client `useChat` transport stays the same (`DefaultChatTransport` to `/api/projects/preview`). The client no longer looks for `tool-setWorkspaceUi` parts in messages. Instead, it receives the workspace card via the existing workspace state reload (which fetches `/api/projects/{id}/workspace`) or via a custom SSE event. The `getLatestWorkspaceUpdateFromMessages` helper is simplified to no longer scan for tool parts.

- The preparing-state poll loop from the workspace-card-reliability PRD remains as a safety net. It covers the brief window between stream completion and workspace state reload. It is no longer the primary reliability mechanism (the structured output is), but it prevents the stale-card flash if the reload races with persistence.

- The build mode path (`toolChoice: "auto"`) in the same route is also updated to use `Output.object` for consistency, but its schema is the same `WorkspaceTurnToolInput` shape. The build mode does not need the free-chat fallback because it always produces a build recommendation.

- The `repairWorkspace` request body flag (`repairWorkspace: true`) and the `retryWorkspaceCard` client callback are removed. The retry button UI is removed from the discuss composer area. The preparing-state loading indicator remains. If the structured output genuinely fails and free-chat fires, there is no retry button — the user simply types freely.

- No new server endpoints. No schema changes. No new dependencies. No changes to the 9Router combo, model selection, confidence gate, brief patch logic, or generate route.

- State machine for the discuss turn (prototype-derived, decision-rich parts only):

  ```
  user sends answer
    -> server: streamText with Output.object
    -> partialOutputStream: stream chatText deltas to client
    -> onFinish:
       -> if valid object with chatText:
          -> persist chatText + briefPatch + workspaceCard + title
          -> client reloads workspace -> card appears
       -> if invalid / missing chatText:
          -> persist raw text (or generic ack) as assistant message
          -> no workspace card update
          -> client shows composer open, user types freely
    -> next turn: try structured output again
  ```

## Testing Decisions

- The highest seam is the existing preview route test layer (`src/app/api/projects/preview/route.test.ts`). Tests are updated to verify: (1) the structured-output path produces chat text + workspace card, (2) the free-chat fallback persists raw text without a card, (3) the repair pass is no longer called.

- The `workspace-sync` unit tests are updated to remove tool-part scanning assertions and verify the simplified card delivery path.

- A good test in this pass asserts external behavior only: given a model that returns a valid JSON object, the response includes chat text and a workspace card; given a model that returns plain text, the response includes the text and no card, and no error is surfaced. It never asserts on the internal streaming mechanism.

- Prior art: the generate route test (`src/app/api/projects/[id]/generate/route.test.ts`) already tests `Output.object` with `streamText` and verifies partial output streaming. The discuss route tests follow the same pattern.

- Manual verification: send a discuss answer, observe chat text stream smoothly, then the next card appears. Force a malformed model output (e.g., via a mock that returns plain text), observe the chat text appear and the composer stay open for free text, with no error panel.

## Out of Scope

- No changes to the generate route's `Output.object` usage (it already works).
- No changes to the 9Router combo, model selection, or provider configuration.
- No changes to the confidence gate, brief patch logic, or workspace card schema.
- No changes to build generation, runtime supervisor, preview proxy, or publishing.
- No changes to the AI moderation path.
- No new server endpoints or schema migrations.
- No task-based model routing (deferred per prior decision).
- No `supportsStructuredOutputs` config change (already `true`; verified that the 9Router path does not enforce it, so the fallback handles the gap).

## Further Notes

- The combination of Option 1 (structured output) and Option 2 (free-chat fallback) means the product never shows an error during a discuss turn. The guided interview is the default experience (~90-95% of turns). The free-chat fallback (~5-10%) is a natural degradation that feels like the AI simply chose to ask the next question in plain text. The user does not know the structured output failed.
- The repair pass elimination simplifies the server significantly: `repairMissingWorkspaceTool`, `repairWorkspaceCard`, and the `repairWorkspace` request flag are all removed. The preparing-state poll remains as a lightweight safety net but is no longer the primary reliability mechanism.
- The `workspace-card-reliability-hardening-prd.md` is superseded by this PRD for the discuss route. The preparing-state poll and stale-card suppression from that PRD are kept as a safety net but the root cause (tool calling) is eliminated.
- After this work, the discuss turn should feel fully reliable: the chat always works, the card appears when the model produces it, and the user types freely when it does not. No error states, no retry buttons, no broken UX.
