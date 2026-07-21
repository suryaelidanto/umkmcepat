# Discuss-Mode Chat Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make discuss-mode chat reliably stream text + spawn the workspace card (~95%), with graceful degradation to a plain textbox and diagnosable errors — by forcing the tool call, adding an in-turn repair layer, capping the repair cascade, logging real errors, and reusing the existing `type:"none"` fallback.

**Architecture:** Pure-module extraction (`src/lib/projects/discuss-tool.ts`) gives a single source of truth for the tool + prompt builders that both the route and a 1:1 sim harness import. Server fixes in `api.projects.preview.ts` add `toolChoice:"required"`, wire SDK `repairToolCall` (1 in-turn attempt), cap Layer-3 repair to 3/turn, log real stream errors to the DB, and degrade exhausted failures to `type:"none"` instead of error toasts. A 1:1 Bun `.ts` sim gates shipping: `required` must hit cardOk% ≥ 90% and beat `auto` by ≥ +15pts with no args-error spike.

**Tech Stack:** Vercel AI SDK (`streamText`, `tool`, `repairToolCall`), zod, TanStack Router route, Bun (runs `.ts` natively), Vitest, 9router (OpenAI-compatible gateway, `supportsStructuredOutputs:false`).

## Global Constraints

- Bun only; `bun.lock` canonical. Run `.ts` sim with `bun`.
- Work from `dev`; small focused commits; surgical edits only.
- User-facing UI copy Indonesian; dev-facing code/comments/logs/errors English.
- Never commit `.env`, `.data/tmp/`, secrets, `graphify-out/`.
- Do not touch build mode, the zod schema strictness (keep permissive), or streaming mechanics (already progressive).
- The legacy 2-call `handleDiscussTurn` gets only the R2 logging fix; no other changes.
- 9router model wired with `supportsStructuredOutputs: false` — provider `strict` mode is unavailable; args validation relies on SDK `inputSchema` + `repairToolCall`.

**Spec:** `docs/superpowers/specs/2026-07-21-discuss-mode-reliability-design.md`

---

## File Structure

- **Create** `src/lib/projects/discuss-tool.ts` — pure module: `PRESENT_WORKSPACE_CARD_TOOL_NAME`, `presentWorkspaceCardTool`, `buildOneCallSystemPrompt`, `buildCardSystemPrompt`. Imports `buildChatSystemPrompt` from the route + `DISCUSS_SYSTEM_PROMPT` from `@/lib/projects/prompts/discuss-system`. No side-effects, no DB/auth.
- **Create** `.data/tmp/sim-reliability.ts` — gitignored scratch sim harness (replaces `.data/tmp/sim-reliability.mjs`); imports real pieces from `discuss-tool.ts`; run on-demand, never in CI.
- **Modify** `src/routes/api.projects.preview.ts` — remove the 4 moved declarations, import from `discuss-tool.ts`, re-export `buildOneCallSystemPrompt` (test compat), apply #1–#5 + legacy R2 log.
- **Modify** `src/lib/projects/api.projects.preview.test.ts` — repoint `buildOneCallSystemPrompt` import to `@/lib/projects/discuss-tool`.
- **Delete** `.data/tmp/sim-reliability.mjs` — superseded by the `.ts` sim (scratch, gitignored; deletion is local only).

---

### Task 1: Extract discuss tool + prompt builders to a pure module

**Files:**
- Create: `src/lib/projects/discuss-tool.ts`
- Modify: `src/routes/api.projects.preview.ts:684-875` and `:1770-1793` (remove moved declarations), add import + re-export
- Test: `src/lib/projects/api.projects.preview.test.ts:3-6` (repoint import)

**Interfaces:**
- Consumes: `buildChatSystemPrompt({ brief, context, hasBuiltSite }) => string` (stays in route, exported), `DISCUSS_SYSTEM_PROMPT` string from `@/lib/projects/prompts/discuss-system`, `tool` + `z` from `ai`/`zod`.
- Produces: `PRESENT_WORKSPACE_CARD_TOOL_NAME: string = "presentWorkspaceCard"`, `presentWorkspaceCardTool` (AI SDK tool), `buildOneCallSystemPrompt({ brief, context, hasBuiltSite }) => string`, `buildCardSystemPrompt() => string` — all exported.

- [ ] **Step 1: Write the failing test**

Replace the import block in `src/lib/projects/api.projects.preview.test.ts:3-6`:

```ts
import { buildChatSystemPrompt } from "@/routes/api.projects.preview";
import { buildOneCallSystemPrompt } from "@/lib/projects/discuss-tool";
```

(The existing two `it(...)` cases stay unchanged — they assert on `buildOneCallSystemPrompt` output, which must remain byte-identical after the move.)

- [ ] **Step 2: Run test to verify it fails**

Run: `bun vitest run src/lib/projects/api.projects.preview.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/projects/discuss-tool"` (module doesn't exist yet).

- [ ] **Step 3: Create the pure module**

Create `src/lib/projects/discuss-tool.ts`. Copy **verbatim** from `api.projects.preview.ts`:
- `PRESENT_WORKSPACE_CARD_TOOL_NAME` (from `:684`)
- `presentWorkspaceCardTool` (from `:686-836`, the full nested zod schema — do not alter any field)
- `buildOneCallSystemPrompt` (from `:838-875`, including the `hasBuiltSite` branch)
- `buildCardSystemPrompt` (from `:1770-1793`)

Add these imports at the top (matching the route's existing imports for these symbols):

```ts
import { tool } from "ai";
import { z } from "zod";

import { DISCUSS_SYSTEM_PROMPT } from "@/lib/projects/prompts/discuss-system";
import { buildChatSystemPrompt } from "@/routes/api.projects.preview";
```

Export all four moved declarations (`export const` / `export function`). Do not change any logic or string content.

- [ ] **Step 4: Remove moved declarations from the route + wire import**

In `src/routes/api.projects.preview.ts`:
- Delete the `PRESENT_WORKSPACE_CARD_TOOL_NAME` const (`:684`), the `presentWorkspaceCardTool` const (`:686-836`), `buildOneCallSystemPrompt` (`:838-875`), and `buildCardSystemPrompt` (`:1770-1793`).
- Add to the import block (near `:14-46`):
```ts
import {
  buildCardSystemPrompt,
  buildOneCallSystemPrompt,
  PRESENT_WORKSPACE_CARD_TOOL_NAME,
  presentWorkspaceCardTool,
} from "@/lib/projects/discuss-tool";
```
- Add a re-export so the test's `buildChatSystemPrompt` import and any other external importers keep resolving (place near other exports):
```ts
export { buildOneCallSystemPrompt } from "@/lib/projects/discuss-tool";
```
(`buildChatSystemPrompt` stays defined and exported in the route — unchanged.)

- [ ] **Step 5: Run test to verify it passes**

Run: `bun vitest run src/lib/projects/api.projects.preview.test.ts`
Expected: PASS — both `it(...)` cases green (byte-identical prompt output).

- [ ] **Step 6: Run the fast gate**

Run: `bun run check`
Expected: PASS — typecheck/lint/format/affected tests/Knip all green. Knip must report no unused exports (the re-export keeps `buildOneCallSystemPrompt` reachable; `presentWorkspaceCardTool`/`buildCardSystemPrompt`/`PRESENT_WORKSPACE_CARD_TOOL_NAME` are used in-route).

- [ ] **Step 7: Graphify no-duplicate check**

Run: `graphify update .` then `graphify query "presentWorkspaceCardTool"`
Expected: single definition node in `src/lib/projects/discuss-tool.ts`; no duplicate node in the route.

- [ ] **Step 8: Commit**

```bash
git add src/lib/projects/discuss-tool.ts src/routes/api.projects.preview.ts src/lib/projects/api.projects.preview.test.ts
git commit -m "refactor(discuss): extract tool + prompt builders to pure discuss-tool module"
```

---

### Task 2: Force the tool call on the primary discuss path (#1, R1)

**Files:**
- Modify: `src/routes/api.projects.preview.ts:922`

**Interfaces:**
- Consumes: `presentWorkspaceCardTool`, `PRESENT_WORKSPACE_CARD_TOOL_NAME` from Task 1.
- Produces: primary `streamText` now forces a tool call every discuss turn.

- [ ] **Step 1: Change toolChoice**

In `handleDiscussTurnOneCall`, at the `streamText` call (`:913-941`), change line `:922`:

```ts
    // Force a tool call every discuss turn. The tool is always expected
    // (question / build_recommendation / type:"none" for edits), so "auto"
    // letting the model skip it was the dominant reliability failure.
    toolChoice: "required",
```

(Replaces `toolChoice: "auto",`.)

- [ ] **Step 2: Typecheck**

Run: `bun run check`
Expected: PASS — `"required"` is a valid `toolChoice` literal for `streamText`.

- [ ] **Step 3: Commit**

```bash
git add src/routes/api.projects.preview.ts
git commit -m "fix(discuss): force toolChoice required on one-call streamText"
```

---

### Task 3: Stop swallowing stream-consumption errors + log to DB (#2, R2)

**Files:**
- Modify: `src/routes/api.projects.preview.ts:958-990` (one-call path) and `:518-526` (legacy path)

**Interfaces:**
- Consumes: `writeAiRequestLog` (already imported `:17`), `getSafeAiErrorLog` (already imported).
- Produces: real errors logged with model + projectId to stdout AND `writeAiRequestLog({ event: "discuss:stream_error" })`; `hadError` boolean preserved for downstream branching.

- [ ] **Step 1: Capture the serving model eagerly for the error log**

In `handleDiscussTurnOneCall`, just before the `for await` loop (`:958`), kick off the response promise so it's readable in the catch. After the `writer.write({ type: "text-start", ... })` line (`:951`) and before `let fullText = ""` (`:953`), add:

```ts
        // Resolve the serving model eagerly so stream-consume errors can log it.
        const primaryResponsePromise = Promise.resolve(primary.response).catch(
          () => null,
        );
```

- [ ] **Step 2: Replace the bare catch in the one-call path**

Replace `src/routes/api.projects.preview.ts:988-990`:

```ts
        } catch (error) {
          hadError = true;
          const servedModel =
            (await primaryResponsePromise)?.modelId ?? modelName;
          const safeError = getSafeAiErrorLog(error);
          console.error("[preview-chat] one-call stream consume error", {
            projectId: project.id,
            model: servedModel,
            error: safeError,
          });
          await writeAiRequestLog({
            event: "discuss:stream_error",
            model: servedModel,
            mode: "one_call_tools",
            projectId: project.id,
            error: safeError,
          });
        }
```

(Replaces `} catch { hadError = true; }`.)

- [ ] **Step 3: Apply the same fix to the legacy path**

Find the legacy `for await (const delta of phase1.textStream)` loop's bare catch (around `:522`, `} catch { hadError = true; }`) and replace with the same shape — log real error + model + `writeAiRequestLog({ event: "discuss:stream_error", mode: "legacy" })`. Use the legacy path's own model variable (the `modelName` in scope at `handleDiscussTurn`).

- [ ] **Step 4: Typecheck**

Run: `bun run check`
Expected: PASS. If `writeAiRequestLog`'s signature doesn't accept `error`/`mode` strings, check `src/lib/ai-request-log.ts` and pass only accepted fields (the function accepts an arbitrary event + projectId + model at minimum per existing `discuss:start`/`discuss:finish` calls at `:904`/`:1084`).

- [ ] **Step 5: Commit**

```bash
git add src/routes/api.projects.preview.ts
git commit -m "fix(discuss): log real stream-consume errors to stdout + ai-request-log"
```

---

### Task 4: Add SDK repairToolCall as the in-turn repair layer (#3, R3)

**Files:**
- Modify: `src/routes/api.projects.preview.ts:913-941` (the primary `streamText` call)

**Interfaces:**
- Consumes: `presentWorkspaceCardTool`, `PRESENT_WORKSPACE_CARD_TOOL_NAME`, `model`, `modelMessages`, `getSafeAiErrorLog`, `getDefaultAiModel`/`getAiModel`.
- Produces: malformed tool args trigger one in-turn re-prompt; returns a repaired `ToolCall` or `null` (null → falls through to existing Layer-3 `repairDiscussCardWithTool`).

- [ ] **Step 1: Write the repairToolCall callback**

In `handleDiscussTurnOneCall`, add a module-scope (or function-scope) async helper above the `streamText` call. It re-prompts the same turn once with `toolChoice: { type: "tool", toolName }` (matching the existing repair path's forcing at `:1343`), validates, and returns the repaired call or `null`:

```ts
async function repairToolCallInTurn({
  error,
  messages,
  model,
  modelName,
  projectId,
  toolCall,
}: {
  error: unknown;
  messages: Parameters<typeof streamText>[0]["messages"];
  model: ReturnType<typeof getAiModel>;
  modelName: string;
  projectId: string;
  toolCall: { toolCallId: string; toolName: string; input?: unknown };
}) {
  console.error("[preview-chat] invalid tool args, attempting in-turn repair", {
    projectId,
    model: modelName,
    error: getSafeAiErrorLog(error),
  });
  try {
    const result = await generateText({
      model,
      messages,
      tools: { [PRESENT_WORKSPACE_CARD_TOOL_NAME]: presentWorkspaceCardTool },
      toolChoice: { type: "tool", toolName: PRESENT_WORKSPACE_CARD_TOOL_NAME },
      maxRetries: 2,
      maxOutputTokens: 1024,
      temperature: 0.25,
      timeout: getAiTimeoutMs("discussCard"),
    });
    const repaired = result.toolCalls[0];
    if (!repaired) {
      return null;
    }
    return repaired;
  } catch (repairError) {
    console.error("[preview-chat] in-turn repair failed", {
      projectId,
      model: modelName,
      error: getSafeAiErrorLog(repairError),
    });
    return null;
  }
}
```

- [ ] **Step 2: Wire repairToolCall into the primary streamText**

At the primary `streamText` call (`:913-941`), add the `repairToolCall` option (AI SDK passes `{ toolCall, tools, inputSchema, error, messages, instructions }` to the callback). Insert after `toolChoice: "required",`:

```ts
    repairToolCall: async ({ toolCall, error, messages }) =>
      repairToolCallInTurn({
        error,
        messages,
        model,
        modelName,
        projectId: project.id,
        toolCall,
      }),
```

- [ ] **Step 3: Verify the fallback-through behavior**

Confirm by reading the code: when `repairToolCall` returns `null`, the SDK treats the call as unrepaired; the existing `for await` loop sets `toolInput` only if a `tool-call` part arrives. If the repaired call is returned by the SDK as a new `tool-call` part, `toolInput` is captured normally (`:980`); if `null`, `toolInput` stays `null` → `primaryToolFailed` (`:1135`) → existing Layer-3 `repairDiscussCardWithTool` fires. No new branching needed.

- [ ] **Step 4: Typecheck**

Run: `bun run check`
Expected: PASS. If `getAiTimeoutMs` isn't imported in scope, add `getAiTimeoutMs` to the `@/lib/ai-timeouts` import (it's already used elsewhere in the file at `:926`).

- [ ] **Step 5: Commit**

```bash
git add src/routes/api.projects.preview.ts
git commit -m "feat(discuss): add SDK repairToolCall in-turn arg repair layer"
```

---

### Task 5: Cap the Layer-3 repair cascade to 3 per turn (#4, R4)

**Files:**
- Modify: `src/routes/api.projects.preview.ts:1029-1130` (`!chatText` branch) and `:1138+` (`primaryToolFailed` branch)

**Interfaces:**
- Consumes: `repairDiscussCardWithTool` (unchanged signature), `DISCUSS_CARD_SEMANTIC_ATTEMPTS` (already imported `:19`).
- Produces: a shared `repairsUsedThisTurn` counter ensures total Layer-3 attempts across both branches ≤ `DISCUSS_CARD_SEMANTIC_ATTEMPTS` (3).

- [ ] **Step 1: Hoist a shared repair budget**

In `handleDiscussTurnOneCall`, before the `if (!chatText)` branch (`:1029`), add:

```ts
        let repairsUsedThisTurn = 0;
        const REPAIR_BUDGET = DISCUSS_CARD_SEMANTIC_ATTEMPTS;
```

- [ ] **Step 2: Guard the !chatText branch repair**

At the `!chatText` branch's `repairDiscussCardWithTool` call (`:1033`), wrap so it only fires if budget remains, and track usage. Replace the call site:

```ts
          let repaired: Awaited<ReturnType<typeof repairDiscussCardWithTool>> = null;
          if (repairsUsedThisTurn < REPAIR_BUDGET) {
            repaired = await repairDiscussCardWithTool({
              brief: effectiveBrief,
              cardSystemPrompt,
              chatText: "",
              hasBuiltSite: project.status === "ready",
              model,
              modelMessages,
              modelName,
              projectId: project.id,
              userId,
            });
            repairsUsedThisTurn += repaired?.repairsUsed ?? 1;
          }
```

(Keep the existing `if (repaired) { ... return; }` block below it unchanged.)

- [ ] **Step 3: Guard the primaryToolFailed branch repair**

At the `primaryToolFailed` branch (`:1138`), wrap the existing `repairDiscussCardWithTool` call so it only fires if budget remains:

```ts
        if (primaryToolFailed && repairsUsedThisTurn < REPAIR_BUDGET) {
          const repaired = await repairDiscussCardWithTool({
            // ...existing args unchanged...
          });
          repairsUsedThisTurn += repaired?.repairsUsed ?? 1;
          // ...existing handling of repaired result unchanged...
        }
```

(Preserve the existing logic that consumes `repaired.workspaceCard` / `repaired.repairsUsed` / persistence / writer writes — only add the budget guard + counter increment.)

- [ ] **Step 4: Typecheck + run discuss tests**

Run: `bun run check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/api.projects.preview.ts
git commit -m "fix(discuss): cap Layer-3 repair to DISCUSS_CARD_SEMANTIC_ATTEMPTS per turn"
```

---

### Task 6: Degrade exhausted failures to plain textbox (#5, R5)

**Files:**
- Modify: `src/routes/api.projects.preview.ts:1117-1129` (`!chatText` branch all-repair-failed) and the `primaryToolFailed` branch's all-repair-failed tail, and the `hadError` branch (`:1012-1027`).

**Interfaces:**
- Consumes: `createFallbackWorkspaceCard` from `@/lib/projects/brief-flow` (returns `{ type: "none" }`), `effectiveBrief`, `project.title`.
- Produces: when repair exhausts AND any text streamed, emit text + `type:"none"` tool output (client renders plain textbox); only emit the error toast when nothing streamed.

- [ ] **Step 1: Add a degradation helper**

Add a function-scope helper in `handleDiscussTurnOneCall` that emits the streamed text (if any) + a `type:"none"` card, persists, charges, and finishes — instead of the error toast:

```ts
async function degradeToTextbox({
  writer,
  messageId,
  toolCallId,
  streamToolCallId,
  chatText,
  project,
  messages,
  effectiveBrief,
  modelName,
  discussModelId,
  totalInputTokens,
  totalOutputTokens,
  userId,
}: {
  writer: Parameters<NonNullable<Parameters<typeof createUIMessageStream>[0]["execute"]>[0]["writer"]>;
  messageId: string;
  toolCallId: string;
  streamToolCallId: string | null;
  chatText: string;
  project: { id: string; title: string; status: string };
  messages: UIMessage[];
  effectiveBrief: ReturnType<typeof parseProjectBrief>;
  modelName: string;
  discussModelId: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  userId: string;
}) {
  const fallbackCard = createFallbackWorkspaceCard(effectiveBrief);
  const repairedToolCallId = streamToolCallId || toolCallId;
  if (chatText) {
    // Text already streamed live; just emit the none-card so the client
    // renders the plain textbox instead of an error toast.
    writer.write({
      type: "tool-input-available",
      toolCallId: repairedToolCallId,
      toolName: PRESENT_WORKSPACE_CARD_TOOL_NAME,
      input: {},
    });
    writer.write({
      type: "tool-output-available",
      toolCallId: repairedToolCallId,
      output: {
        workspaceCard: fallbackCard,
        projectTitle: project.title,
        repairsUsed: 0,
      },
    });
  } else {
    writer.write({
      type: "error",
      errorText: "AI lagi gangguan. Coba lagi sebentar.",
    });
  }
  await chargeEnergyForAiUsage({
    userId,
    modelId: discussModelId,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    reason: "discuss_turn",
  });
  await writeAiRequestLog({
    event: "discuss:degraded",
    model: modelName,
    mode: "one_call_tools",
    projectId: project.id,
    hadText: Boolean(chatText),
  });
  writer.write({ type: "finish" });
}
```

(If `createFallbackWorkspaceCard` isn't imported, add it to the `@/lib/projects/brief-flow` import — it's exported there at `brief-flow.ts:203`.)

- [ ] **Step 2: Route the !chatText all-repair-failed tail to degradation**

At `:1117-1129` (the `// All repair attempts failed. Charge once, surface a clean error.` block), replace the error-toast `writer.write` + `return` with a call to `degradeToTextbox(...)`. Pass `chatText: ""` (this branch has no text by definition) → it will emit the error toast (honest total failure). Keep the `chargeEnergyForAiUsage` removal from that block since `degradeToTextbox` charges.

- [ ] **Step 3: Route the primaryToolFailed all-repair-failed tail to degradation**

At the `primaryToolFailed` branch's tail (where repair returned null/failed), replace the error-toast with `degradeToTextbox(...)`, passing `chatText` (the streamed text, which IS present in this branch). This is the key UX win: user sees their streamed text + a plain textbox.

- [ ] **Step 4: Route the hadError branch to degradation**

At `:1012-1027` (the `if (hadError)` block), replace the error toast with `degradeToTextbox(...)`, passing `chatText` (whatever streamed before the error). If the stream died immediately with no text, it emits the error toast honestly.

- [ ] **Step 5: Typecheck**

Run: `bun run check`
Expected: PASS. Resolve any `createFallbackWorkspaceCard` / `parseProjectBrief` type import issues by reusing the route's existing imports of those types.

- [ ] **Step 6: Commit**

```bash
git add src/routes/api.projects.preview.ts
git commit -m "feat(discuss): degrade exhausted repair failures to plain textbox"
```

---

### Task 7: Build the 1:1 reliability sim harness

**Files:**
- Create: `.data/tmp/sim-reliability.ts` (gitignored scratch)
- Create: `.data/tmp/sim-discuss.env` (gitignored scratch — 9router creds)
- Delete: `.data/tmp/sim-reliability.mjs` (superseded)

**Interfaces:**
- Consumes: `buildOneCallSystemPrompt`, `buildCardSystemPrompt`, `presentWorkspaceCardTool`, `PRESENT_WORKSPACE_CARD_TOOL_NAME` from `@/lib/projects/discuss-tool` (Task 1). 9router creds from `.env` (`NINE_ROUTER_BASE_URL`, `NINE_ROUTER_API_KEY`, `AI_MODELS`).
- Produces: a JSON report at `.data/tmp/sim-reliability-report.json` with `byMode.auto` / `byMode.required` cardOk% / textOk% / orderOk% / error% / latency + per-run failure reasons; exit 0 if `required` cardOk% ≥ 90 AND beats `auto` by ≥ 15 AND no args-error spike, else exit 3.

- [ ] **Step 1: Create the env scratch file**

Create `.data/tmp/sim-discuss.env` by copying the three values from `.env` (never commit):
```
NINE_ROUTER_BASE_URL=<from .env>
NINE_ROUTER_API_KEY=<from .env>
AI_MODELS=<from .env>
```

- [ ] **Step 2: Write the sim harness**

Create `.data/tmp/sim-reliability.ts` based on the existing `.data/tmp/sim-reliability.mjs` but rewritten to import the real pieces. Key differences from the old `.mjs`:
- Import `buildOneCallSystemPrompt`, `buildCardSystemPrompt`, `presentWorkspaceCardTool`, `PRESENT_WORKSPACE_CARD_TOOL_NAME` from `@/lib/projects/discuss-tool`.
- Use the real `presentWorkspaceCardTool` (full nested schema) instead of the stripped schema — delete the local `presentWorkspaceCard` tool definition.
- Build the system prompt via `buildOneCallSystemPrompt({ brief, context, hasBuiltSite })` per fixture instead of the static `system` string.
- Fixtures: array of `{ messages, brief, hasBuiltSite }` covering (1) turn-1 empty brief `hasBuiltSite:false`, (2) mid-interview partial brief confidence ~45, (3) near-complete confidence ~90, (4) edit turn `hasBuiltSite:true` expecting `type:"none"`, (5-6) repeat variants.
- Two arms: `auto` (`toolChoice: "auto"`) vs `required` (`toolChoice: "required"`). Run each fixture N times (default 25, `process.argv[2]`).
- Score against the real schema shape: `workspaceCard.type` ∈ {`question`,`build_recommendation`,`none`}; for `question`: `.question.id` + `.question.options[]` with label/description; for edit fixtures accept `type:"none"`.
- Failure reason breakdown: `no_tool_call` | `bad_args` | `stream_error` | `bad_order` | `text_too_short`.
- Model wiring mirrors prod: `createOpenAICompatible({ name: "9router", baseURL, apiKey, includeUsage: true, supportsStructuredOutputs: false })`.
- Output report JSON to `.data/tmp/sim-reliability-report.json`; print `byMode` summary.
- Exit code: 0 if `required.cardOkPct >= 90` AND `required.cardOkPct - auto.cardOkPct >= 15` AND `required` `bad_args` count ≤ `auto` `bad_args` count; else 3.

Keep the existing percentile/latency helpers from the `.mjs`. Use `bun` to run (Bun executes `.ts` natively, so the `@/` path alias resolves via the project's tsconfig).

- [ ] **Step 3: Delete the old .mjs**

```bash
git rm --cached .data/tmp/sim-reliability.mjs 2>/dev/null; rm -f .data/tmp/sim-reliability.mjs
```
(The file is gitignored scratch; `git rm --cached` is a no-op if untracked — that's fine. The point is the local `.mjs` is gone.)

- [ ] **Step 4: Smoke-run the sim (2 runs, just to confirm it executes)**

Run: `bun .data/tmp/sim-reliability.ts 2`
Expected: prints `{ phase: "start", ... }` then 4 run lines (2 fixtures × 2 arms) then a `byMode` summary; writes the report JSON. No crash. (Numbers from 2 runs are not meaningful — this is a wiring smoke test only.)

- [ ] **Step 5: Commit the harness (NOT the env or report)**

The sim harness is gitignored scratch per `CLAUDE.md` (`.data/tmp/`). Do **not** commit. This step is a no-op commit-wise — just confirm `.gitignore` covers `.data/tmp/` (it should already). No commit.

---

### Task 8: Run the shipping-gate sim and decide

**Files:** none (verification only)

- [ ] **Step 1: Run the full sim at 25 runs/fixture**

Run: `bun .data/tmp/sim-reliability.ts 25`
Expected: completes in ~5-15 min (50 model calls per arm × 2 arms). Writes `.data/tmp/sim-reliability-report.json`.

- [ ] **Step 2: Read the report + check the gate**

Open `.data/tmp/sim-reliability-report.json`. Check `byMode.required.cardOkPct` and `byMode.auto.cardOkPct` and the `bad_args` counts. The script's exit code encodes the gate (0 = pass, 3 = fail).

- [ ] **Step 3: Decide**

- **If exit 0 (gate passes):** proceed to Task 9 (final verification).
- **If exit 3 (gate fails — `required` backfired or didn't beat `auto` by 15pts):** STOP. Do not ship Tasks 2-6 to `main`. Revert the `toolChoice:"required"` change (Task 2) locally if needed and return to brainstorm with the real numbers — the fix hypothesis was wrong against this model combo, and we need a different approach (e.g. `prepareStep`-conditional forcing, or a model combo reorder in 9router).

- [ ] **Step 4: Record the result**

Append a one-line note to the spec's "Shipping gate" section with the actual `auto`/`required` cardOk% and the decision. No commit needed (spec is uncommitted per `CLAUDE.md`).

---

### Task 9: Final verification before handoff

**Files:** none (verification only)

- [ ] **Step 1: Full local gate**

Run: `bun run check`
Expected: PASS (format/lint/typecheck/affected tests/Knip).

- [ ] **Step 2: Full verify (no push)**

Run: `bun run verify`
Expected: PASS (lockfile guard + route regen + format/lint/typecheck/full tests/Knip). Do NOT run `bun run build` unless asked.

- [ ] **Step 3: Graphify final no-duplicate check**

Run: `graphify update .` then `graphify query "presentWorkspaceCardTool"` and `graphify query "buildOneCallSystemPrompt"`
Expected: single definitions in `src/lib/projects/discuss-tool.ts`; route only imports/re-exports.

- [ ] **Step 4: Summarize for handoff**

Report: which tasks shipped, the sim `auto` vs `required` numbers, the net-effect table from the spec, and the explicit out-of-scope follow-up (client race in `WorkspaceShell.tsx`, browser-validated separately).

---

## Self-Review (run after writing — results recorded here)

**1. Spec coverage:**
- R1 (auto lets model skip) → Task 2 ✅
- R2 (swallowed errors) → Task 3 ✅
- R3 (missing repairToolCall) → Task 4 ✅
- R4 (cascade stacks) → Task 5 ✅
- R5 (error toast vs degradation) → Task 6 ✅
- Pure-module extraction (Part 1) → Task 1 ✅
- 1:1 sim (Part 4) → Task 7 ✅
- Shipping gate → Task 8 ✅
- Final verify → Task 9 ✅
- Out-of-scope client race → noted in Task 9 handoff, not implemented (correct) ✅

**2. Placeholder scan:** No TBD/TODO. All code steps show actual code. One judgment call in Task 3 Step 4 ("if signature doesn't accept error/mode, pass accepted fields") — this is a real runtime check, not a placeholder; the existing `discuss:start` call at `:904` proves the accepted shape.

**3. Type consistency:** `repairToolCallInTurn` returns `Promise<ToolCall | null>`; `degradeToTextbox` consumes `createFallbackWorkspaceCard` (returns `WorkspaceCard` with `type:"none"`); `repairsUsedThisTurn` counter shared across both Layer-3 branches. `PRESENT_WORKSPACE_CARD_TOOL_NAME` / `presentWorkspaceCardTool` consistent across Tasks 1-7. `buildOneCallSystemPrompt` + `buildCardSystemPrompt` import paths consistent (`@/lib/projects/discuss-tool`).

**4. Scope:** single plan, server-side discuss reliability + sim, one working deliverable per task, frequent commits. Client race correctly deferred.
