# PRD: Dyad-Inspired Agentic File Operations

Status: proposed
Created: 2026-07-07
Updated: 2026-07-07
Owner: Surya
Scope: generated app agent file operations, streaming progress, tool visibility, edit/apply loop
Read when: changing generated app creation, AI coding agent tools, source snapshots, build progress UI, edit loop, preview runtime events, or agent observability
Do not read for: auth, billing, marketing pages, unrelated UI primitives, or production deployment operations
Current truth: source code + `docs/architecture.md` + `docs/prds/custom-vite-tanstack-generated-app-prd.md` + Dyad research at commit `5f57adb5d84d60ab52a6f70e1df979a6dd221279`

## Status History

- 2026-07-07: Proposed after reviewing Dyad's XML/tool-stream architecture, local agent file tools, response processor, and chat UI rendering.

## Problem Statement

UMKM Cepat now has an agentic generated app path, but the user experience still does not make the AI's coding work feel as visible, inspectable, and trustworthy as a mature AI app builder. Users can see build progress, source files, and preview results, but they cannot yet watch the agent progressively read files, write files, replace content, validate source, repair build errors, and explain each file operation in a polished timeline.

From the user's perspective, this creates a trust gap. They want the product to feel like a real coding agent: it should start from a real Vite React TypeScript TanStack starter, inspect the project, make file-level changes, show which files are being read or edited, and then build the result. If the output is poor, users should be able to understand what happened, which files changed, and whether the system used a fallback.

Dyad is valuable prior art because it makes file operations first-class UI events. Its documented request lifecycle is: construct an LLM request with system instructions and code context, stream the response, render custom file-operation blocks in the chat UI, then apply those operations in a privileged process. Dyad originally used XML-like tags such as write, rename, delete, add dependency, and search-replace rather than model-native tool calls. Its newer local agent moves toward AI SDK tool calls while still rendering tool activity as structured XML-like UI cards.

UMKM Cepat should not copy Dyad wholesale. Dyad is an Electron app with local filesystem access, Git commits, Supabase/Neon helpers, MCP, desktop IPC, and many features outside UMKM Cepat's MVP. UMKM Cepat is a Next.js control-plane platform with source snapshots, build artifacts, deployment records, runtime events, package policy, and safe generated project boundaries. The right move is to adopt the essence: structured file operation events, readable tool cards, precise edit semantics, progressive streaming, explicit apply/build/repair lifecycle, and safety gates.

## Solution

UMKM Cepat will evolve its generated app agent into a visible file-operation workflow inspired by Dyad. The product will keep its current control-plane architecture: generated source remains untrusted data, the agent works through constrained tools, builds happen in isolated temporary workspaces, previews serve artifact-backed deployments, and publishing remains explicit.

The user experience will change from a mostly opaque build stream to a step-by-step coding timeline:

1. The system prepares the Vite React TypeScript TanStack starter.
2. The agent lists relevant files.
3. The agent reads specific files.
4. The agent writes new files or applies precise replacements.
5. Each operation appears as a compact, expandable card with path, action, state, and summary.
6. The agent runs source checks.
7. The build runs.
8. If the build fails, the agent receives the build log, repairs files, and rebuilds once.
9. The final snapshot records all touched files, generation mode, fallback reason if any, repair attempts, and operation trace.
10. The preview continues to serve the latest successful artifact without being hidden by failed builds.

UMKM Cepat will use real AI SDK tool calls internally, not Dyad's legacy XML-as-tool protocol. However, the UI and event stream may use Dyad-like structured operation records because they are easy to render, audit, store, and replay. These records are presentation artifacts, not executable instructions from the model.

The main implementation seam should be the generated source generation workflow: brief/schema plus starter files goes into the agent, and final source files plus operation trace come out. This seam is high enough to cover user-visible behavior while avoiding tests that couple to private tool implementation details.

## User Stories

1. As a business owner, I want to see that AI is editing real files, so that I trust the generated website more.
2. As a business owner, I want to see which files are being changed, so that the build process feels concrete instead of magical.
3. As a business owner, I want to see the agent reading files before editing them, so that I know it understands the project structure.
4. As a business owner, I want a readable summary for each file operation, so that I can follow progress without reading code.
5. As a business owner, I want file operation cards to be expandable, so that I can inspect code only when I care.
6. As a business owner, I want progress to update while generation is running, so that I do not stare at a spinner for minutes.
7. As a business owner, I want to know when the AI is checking the app, so that I understand why generation takes time.
8. As a business owner, I want to know when the AI is repairing a failed build, so that a temporary failure feels recoverable.
9. As a business owner, I want the latest successful preview preserved when a new generation fails, so that I do not lose a working site.
10. As a business owner, I want fallback usage to be clearly marked, so that I know whether the result was agent-authored or deterministic.
11. As a business owner, I want the final generated site to feel specific to my business, so that I can share it with customers.
12. As a business owner, I want user-facing copy in Indonesian, so that the website is usable by local customers.
13. As a business owner, I want the AI to avoid fake checkout, fake auth, fake payment, or fake backend behavior, so that customers are not misled.
14. As a business owner, I want edits after preview to show the same file-operation progress, so that iteration feels consistent.
15. As a business owner, I want visual edits to affect structure and style, not only text tokens, so that the site can actually improve.
16. As a business owner, I want failed operations to show understandable errors, so that I know whether to retry or change the brief.
17. As a beta tester, I want to compare generated operation traces across business types, so that I can spot template-like behavior.
18. As a beta tester, I want to see touched files after generation, so that I can judge whether the agent did meaningful work.
19. As a beta tester, I want build repair steps to be visible, so that I can tell whether the system recovered or used fallback.
20. As a maintainer, I want file operations represented as structured events, so that UI, tests, logs, and metadata use one contract.
21. As a maintainer, I want read/list/search/write/replace/check operations to stay constrained, so that generated source cannot escape project boundaries.
22. As a maintainer, I want precise replacement semantics, so that small edits do not require full-file rewrites.
23. As a maintainer, I want write operations to remain available for new files and complete rewrites, so that generation can create custom structure.
24. As a maintainer, I want operation summaries to be generated or supplied with each tool call, so that the UI can stay understandable.
25. As a maintainer, I want the agent operation trace stored with snapshots, so that future debugging does not require chat history.
26. As a maintainer, I want build logs attached to repair attempts, so that repairs are auditable.
27. As a maintainer, I want deterministic fallback preserved, so that reliability does not depend entirely on model behavior.
28. As a maintainer, I want fallback to be explicitly marked, so that quality metrics can separate agent output from fallback output.
29. As a maintainer, I want package policy to remain the dependency gate, so that the agent cannot add unsafe packages.
30. As a maintainer, I want source checks required after writes, so that the agent cannot claim success after unchecked changes.
31. As a maintainer, I want operation events to be safe for client rendering, so that generated code never executes in the control plane.
32. As a maintainer, I want operation output capped, so that reading large files does not explode token, payload, or UI cost.
33. As a maintainer, I want path labels and action labels normalized, so that operation cards are consistent.
34. As a maintainer, I want no raw model XML or JSON visible to users, so that the interface feels polished.
35. As a maintainer, I want operation state transitions to be explicit, so that pending, succeeded, failed, skipped, and repaired states are testable.
36. As a maintainer, I want the generated app builder skill updated with the operation protocol, so that future agents follow the same rules.
37. As a maintainer, I want edit route and initial generate route to share the same operation runner, so that behavior does not diverge.
38. As a maintainer, I want future backend-like features to use platform-owned modules, so that arbitrary generated backend code stays out of scope.
39. As a platform operator, I want every expensive agent loop bounded by step, time, output, and build-repair limits, so that one request cannot drain resources.
40. As a platform operator, I want operation telemetry, so that we can measure agent quality, fallback rate, repair rate, and build success rate.
41. As a platform operator, I want no production dependency on cloning Dyad, so that UMKM Cepat remains its own architecture.
42. As a future agent, I want one canonical PRD and architecture entry, so that I can continue implementation without reading this chat.
43. As a future agent, I want Dyad research summarized with source references, so that I know exactly which ideas were borrowed and which were rejected.
44. As a designer, I want file-operation cards to reuse existing workspace primitives where possible, so that the UI does not feel bolted on.
45. As a designer, I want operation cards to stay compact by default, so that progress remains scannable.
46. As a designer, I want expanded cards to show code or diffs in a readable way, so that advanced users can inspect details.
47. As a designer, I want repair/fallback states to be visually distinct, so that users do not confuse normal progress with degraded mode.
48. As a developer, I want tests at the generation workflow seam, so that refactors of internal tools do not break user-visible guarantees.
49. As a developer, I want tool-specific tests for path safety and replacement semantics, so that trust-boundary bugs are caught early.
50. As a developer, I want route tests for streamed progress events, so that the UI contract stays stable.

## Implementation Decisions

- Keep UMKM Cepat's current architecture. Do not turn the platform into an Electron-style local app. The control plane remains Next.js, generated source remains data/artifacts, builds remain isolated, and previews remain artifact-backed or supervised runtimes.
- Borrow Dyad's visible operation model, not its whole runtime. Dyad's legacy flow uses XML-like tags rendered in chat and processed later; UMKM Cepat should use AI SDK tool calls internally and emit safe structured operation events for UI and audit.
- Use one operation event contract shared by generation, edit, repair, build progress, snapshot metadata, and workspace UI. The contract should represent action, path, state, summary, optional preview content, optional error, and timing.
- Keep current generated app tools as the authority layer. The tool runner should remain the only place where read/list/search/write/replace/check operations mutate generated source.
- Add operation tracing to the tool runner. Each command should emit an operation event with stable IDs and state transitions instead of only returning a final output array.
- Preserve current package policy and manifest checks. Dyad supports dependency installation, but UMKM Cepat should only allow dependencies through the existing generated package policy.
- Prefer precise replacement for existing files. Dyad's current search-replace tool requires old/new strings and emphasizes uniqueness with surrounding context. UMKM Cepat should strengthen its replacement tool toward that model instead of relying only on broad replace-all behavior.
- Keep full-file writes for new files or deliberate rewrites. The agent should not rewrite every file by default if a small replacement is enough.
- Add line-window reads. Dyad's read tool supports start and end line parameters. UMKM Cepat should add bounded line reads so agents can inspect large files without huge payloads.
- Add richer list semantics. Dyad's list tool supports directory, recursive, ignored-file controls, result caps, and truncated output. UMKM Cepat should add enough of this for generated source trees while keeping ignored/system files unavailable.
- Add operation output caps. File reads, search results, and list output must be capped and clearly marked truncated.
- Add visible streaming operation cards. During generation, the workspace should show cards like reading file, writing file, editing file, checking app, build failed, repairing build, fallback used, and build succeeded.
- Do not stream raw model tool JSON to the UI. Dyad converts tools into XML cards. UMKM Cepat should convert tool events into typed UI events/cards.
- Store final operation trace in snapshot metadata. The trace should be summarized enough for audit but capped enough to avoid storing large source content redundantly.
- Keep source files as the canonical artifact. Operation traces explain how a snapshot was produced, but the snapshot files remain the source of truth.
- Add one build repair attempt initially. More retries increase cost and complexity; one repair pass gives visible recovery without runaway loops.
- Repair should use the build log plus operation trace, not a fresh opaque generation. This helps the agent patch the actual failing source.
- If repair fails, use deterministic fallback only if configured for that flow and record the fallback reason. Do not pretend the agent path succeeded.
- Update streamed progress labels to be file-operation aware. The current generic labels should become a more explicit sequence: preparing starter, reading files, writing files, checking source, building preview, repairing build, storing snapshot, preview ready.
- Keep UI copy Indonesian for user-facing progress labels, while operation types, metadata keys, tests, and internal docs stay English.
- Use existing workspace primitives before adding new UI components. If operation cards become reusable visual patterns, add Storybook coverage in the same change.
- Do not add SQL, Supabase, Neon, MCP, Git commit, or local shell execution features from Dyad in this PRD. Those belong to different future product modules or remain out of scope.
- Do not copy Dyad's automatic Git commit behavior. UMKM Cepat already has source snapshots, build records, deployments, and runtime events as first-class audit records.
- Do not copy Dyad's desktop IPC boundaries. UMKM Cepat should map the idea to API route streaming, server-side generation, and artifact storage.
- Keep human approval boundaries. Secrets, money, publishing, deletion, production deployment, and irreversible external effects must remain human-approved.
- Add docs to the architecture notes after implementation so future agents know operation events are part of the generated app workflow.
- Treat Dyad as reference material only. The implementation should be clean-room and adapted to UMKM Cepat's data model, safety rules, and Bun/Next stack.

## Testing Decisions

- The highest-value test seam is the generated source workflow: structured brief/schema plus starter files enters the custom source generator, and final files plus operation trace, metadata, and fallback state come out.
- Route-level tests should cover streamed generation progress at the API boundary. They should assert that operation events are emitted in order and that final snapshot metadata includes generation mode, touched files, repair attempts, and fallback reason when applicable.
- Tool runner tests should cover external behavior only: safe path enforcement, bounded read/list output, write behavior, precise replace behavior, check required after writes, blocked packages, and no success after tool errors.
- Operation trace tests should assert stable user-visible events, not private implementation details. A refactor from AI SDK tool calls to another internal loop should not break tests if events remain the same.
- Build repair tests should mock a failing first build and passing second build. Assert that the agent receives a repair prompt, touches files again, and records one repair attempt.
- Fallback tests should mock agent failure, insufficient edits, failed checks, and failed repair. Assert deterministic fallback files are used and fallback metadata is explicit.
- UI tests should cover operation cards at the component seam if reusable cards are added. Cards should render pending/succeeded/failed states, paths, summaries, and expandable content.
- Existing prior art in UMKM Cepat includes generated source tests, package policy tests, manifest tests, agent tool runner tests, build worker tests, build log tests, source route tests, preview route tests, edit route tests, and workspace UI primitives.
- Dyad's own prior art includes response processor tests, local agent handler tests, tool tests, file operation processor tests, and E2E fixtures for simulated engine tool calls. UMKM Cepat should adopt the testing spirit without copying its desktop test harness.
- Browser visual review remains human-owned. Automated tests can prove operation visibility and safety, but they cannot judge whether the final generated site looks good enough.

## Out of Scope

- Replacing UMKM Cepat with Dyad or embedding Dyad as a dependency.
- Electron desktop architecture.
- Local filesystem app folders outside generated project artifacts.
- Automatic Git commits for generated apps.
- Supabase/Neon SQL execution tools.
- MCP tool marketplace/search.
- Arbitrary shell command execution by generated app agents.
- Arbitrary backend code generation.
- Fake auth, fake checkout, fake payment, fake booking persistence, or fake databases.
- User-controlled dependency installation outside package policy.
- Production deployment, DNS, secret rotation, or VPS changes.
- Full code editor parity.
- Multi-step high-cost autonomous agent loops beyond bounded generate/repair.
- Long-term operation log storage of full file contents beyond source snapshots.
- Publishing generated changes without explicit user action.

## Further Notes

Dyad findings at commit `5f57adb5d84d60ab52a6f70e1df979a6dd221279`:

- Dyad documents its core lifecycle as request construction, response streaming, UI rendering of custom tags, then privileged response processing in its architecture guide: https://github.com/dyad-sh/dyad/blob/5f57adb5d84d60ab52a6f70e1df979a6dd221279/docs/architecture.md#L13-L22
- Dyad explicitly explains why it used XML-like pseudo tools instead of formal tool calls in the legacy build flow: https://github.com/dyad-sh/dyad/blob/5f57adb5d84d60ab52a6f70e1df979a6dd221279/docs/architecture.md#L25-L34
- Dyad's newer local agent architecture points to a tool-calling loop and tool definitions as the heart of the local agent: https://github.com/dyad-sh/dyad/blob/5f57adb5d84d60ab52a6f70e1df979a6dd221279/docs/agent_architecture.md#L5-L12
- Dyad parses XML-like write and search-replace tags in its tag parser: https://github.com/dyad-sh/dyad/blob/5f57adb5d84d60ab52a6f70e1df979a6dd221279/src/ipc/utils/dyad_tag_parser.ts#L8-L45 and https://github.com/dyad-sh/dyad/blob/5f57adb5d84d60ab52a6f70e1df979a6dd221279/src/ipc/utils/dyad_tag_parser.ts#L183-L222
- Dyad applies deletes, renames, search-replace edits, copies, writes, dependency changes, and SQL actions in a response processor: https://github.com/dyad-sh/dyad/blob/5f57adb5d84d60ab52a6f70e1df979a6dd221279/src/ipc/processors/response_processor.ts#L331-L573
- Dyad renders custom operation tags such as read, write, search-replace, and list-files in its chat markdown parser: https://github.com/dyad-sh/dyad/blob/5f57adb5d84d60ab52a6f70e1df979a6dd221279/src/components/chat/DyadMarkdownParser.tsx#L507-L617 and https://github.com/dyad-sh/dyad/blob/5f57adb5d84d60ab52a6f70e1df979a6dd221279/src/components/chat/DyadMarkdownParser.tsx#L779-L923
- Dyad's write-file tool defines schema, consent preview, XML rendering, and actual filesystem write behavior: https://github.com/dyad-sh/dyad/blob/5f57adb5d84d60ab52a6f70e1df979a6dd221279/src/pro/main/ipc/handlers/local_agent/tools/write_file.ts#L18-L74
- Dyad's search-replace tool is especially relevant because it demands unique old strings with context and uses structured SEARCH/REPLACE markers: https://github.com/dyad-sh/dyad/blob/5f57adb5d84d60ab52a6f70e1df979a6dd221279/src/pro/main/ipc/handlers/local_agent/tools/search_replace.ts#L19-L87
- Dyad's read-file tool supports bounded line reads: https://github.com/dyad-sh/dyad/blob/5f57adb5d84d60ab52a6f70e1df979a6dd221279/src/pro/main/ipc/handlers/local_agent/tools/read_file.ts#L14-L47
- Dyad's list-files tool supports directory, recursive, ignored-file options, result caps, and abbreviated UI output: https://github.com/dyad-sh/dyad/blob/5f57adb5d84d60ab52a6f70e1df979a6dd221279/src/pro/main/ipc/handlers/local_agent/tools/list_files.ts#L13-L90 and https://github.com/dyad-sh/dyad/blob/5f57adb5d84d60ab52a6f70e1df979a6dd221279/src/pro/main/ipc/handlers/local_agent/tools/list_files.ts#L169-L208
- Dyad streams partial tool input into UI XML previews and commits final XML when tool input completes: https://github.com/dyad-sh/dyad/blob/5f57adb5d84d60ab52a6f70e1df979a6dd221279/src/pro/main/ipc/handlers/local_agent/local_agent_handler.ts#L664-L681 and https://github.com/dyad-sh/dyad/blob/5f57adb5d84d60ab52a6f70e1df979a6dd221279/src/pro/main/ipc/handlers/local_agent/local_agent_handler.ts#L1261-L1298
- Dyad registers a broad tool set, but UMKM Cepat should only adopt the safe file-operation subset now: https://github.com/dyad-sh/dyad/blob/5f57adb5d84d60ab52a6f70e1df979a6dd221279/src/pro/main/ipc/handlers/local_agent/tool_definitions.ts#L71-L107

Recommended implementation order:

1. Define operation event contract.
2. Add operation tracing to generated app tool runner.
3. Add bounded line reads and richer file listing.
4. Replace broad replace-all semantics with unique-context search-replace semantics.
5. Stream operation events from generate/edit routes.
6. Render operation cards in workspace using existing primitives.
7. Store operation trace summaries in snapshot metadata.
8. Add build repair trace events.
9. Add route/tool/UI tests.
10. Update architecture docs after implementation.

Issue tracker publication was not performed because no issue tracker credentials or command contract were available in this session. The PRD is saved in the repo for review and can be copied into the tracker with the `ready-for-agent` label.
