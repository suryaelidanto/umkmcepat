# Post-Build Discuss None Success Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Treat post-build discuss `workspaceCard: none` as success — skip repair and stop logging `text-only-fallback` / `primaryToolFailed: true` when `hasBuiltSite`.

**Architecture:** In `runDiscussTurn`, gate `primaryToolFailed` and repair on `!hasBuiltSite`. Split the `!hasCard` persist/log branch so built sites emit `discuss:finish` with success flags. Guard `repairDiscussCardWithTool` with early `null` when `hasBuiltSite`. Cover with worker unit tests using `project.status: "ready"`.

**Tech Stack:** TypeScript, Vitest/Bun test, existing discuss turn worker mocks.

## Global Constraints

- Bun only; no new dependencies.
- User-facing copy stays Indonesian where already Indonesian; logs/events English keys as today.
- Surgical: touch discuss worker + repair guard + tests + docs only.
- TDD: failing test first for built-site path.
- Do not wire `/edit` or change pre-build interview repair.
- No per-project migration.

## File map

| File | Role |
|------|------|
| `src/lib/projects/discuss-turn-worker.ts` | Gate failure/repair/log on `hasBuiltSite` |
| `src/lib/projects/discuss-turn-shared.ts` | Early return in repair when `hasBuiltSite` |
| `src/lib/projects/discuss-turn-worker.test.ts` | Built-site success + keep pre-build text-only test |
| Spec/plan under `docs/superpowers/` | Already written alongside this plan |

---

### Task 1: Failing test — built site none is success

**Files:**
- Modify: `src/lib/projects/discuss-turn-worker.test.ts`

**Interfaces:**
- Consumes: `runDiscussTurn`, existing mocks (`streamTextMock`, `normalizeWorkspaceTurnMock`, `generateTextMock`, `writeAiRequestLogMock`, …)
- Produces: regression coverage for post-build path

- [x] **Step 1: Add test**

After the existing `"text-only when card missing and one repair fails"` test, add:

```ts
  it("built site: intentional none is success without repair or text-only-fallback", async () => {
    normalizeWorkspaceTurnMock.mockReturnValue({
      brief: baseBrief,
      projectTitle: "T",
      workspaceCard: { type: "none" },
      readyForBuild: false,
    } as never);
    streamTextMock.mockReturnValueOnce(
      makeStreamResult([
        { type: "text-delta", text: "Siap, aku bikinin varian warna baru." },
      ]),
    );

    await runDiscussTurn({
      turnId: "ct_built_none",
      project: { ...baseProject, status: "ready" },
      chatContext: baseChatContext,
      effectiveBrief: baseBrief,
      memoryFacts: baseMemoryFacts,
      messages: baseMessages,
      summary: baseSummary,
      userId: "u1",
      modelOverride: "test-model" as never,
    });

    expect(generateTextMock).not.toHaveBeenCalled();
    expect(writeAiRequestLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "discuss:finish",
        primaryToolFailed: false,
        workspaceCard: { type: "none" },
      }),
    );
    expect(writeAiRequestLogMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ event: "discuss:text-only-fallback" }),
    );
    expect(finalizeDiscussTurnMock).toHaveBeenCalledWith(
      expect.objectContaining({
        turnId: "ct_built_none",
        status: "succeeded",
      }),
    );
    expect(publishProgressMock).toHaveBeenCalledWith(
      "ct_built_none",
      expect.objectContaining({
        type: "tool-output-available",
        output: expect.objectContaining({
          workspaceCard: { type: "none" },
        }),
      }),
    );
  });
```

Confirm `baseProject` exists and can spread `status: "ready"`. If `baseProject` is a plain object without status, set `status: "ready"` on a full clone matching the type used by other tests.

- [x] **Step 2: Run test — expect FAIL**

```bash
bun test src/lib/projects/discuss-turn-worker.test.ts -t "built site"
```

Expected: FAIL because worker still calls repair / logs text-only-fallback.

---

### Task 2: Worker + repair implementation

**Files:**
- Modify: `src/lib/projects/discuss-turn-worker.ts` (~482–628 and `!chatText` repair block ~356–373)
- Modify: `src/lib/projects/discuss-turn-shared.ts` (`repairDiscussCardWithTool` entry)

- [x] **Step 1: Gate primaryToolFailed**

Replace:

```ts
let primaryToolFailed = workspaceTurn.workspaceCard.type === "none";
```

with:

```ts
// Post-build policy: none is the only allowed card. Do not treat it as a
// missing tool or spend energy on interview-card repair.
let primaryToolFailed =
  workspaceTurn.workspaceCard.type === "none" && !hasBuiltSite;
```

(`if (primaryToolFailed) { repair... }` needs no further change for the main path.)

- [x] **Step 2: Split `!hasCard` logging**

Replace the `} else {` text-only-fallback block after `if (hasCard)` with:

```ts
    } else if (hasBuiltSite) {
      await writeAiRequestLog({
        event: "discuss:finish",
        model: modelName,
        mode: "one_call_tools",
        projectId: project.id,
        didWorkspaceToolUpdate: true,
        primaryToolFailed: false,
        repairsUsed,
        workspaceCard: { type: "none" },
      });
      await persistProjectChatTurn({
        messages: safeMessages,
        projectId: project.id,
        userId,
        workspaceCard: { type: "none" },
      });
    } else {
      devLog("discuss", "text-only-fallback", {
        projectId: project.id,
        repairsUsed,
        primaryMs,
        repairMs,
      });
      await writeAiRequestLog({
        event: "discuss:text-only-fallback",
        model: modelName,
        mode: "one_call_tools",
        projectId: project.id,
        didWorkspaceToolUpdate: false,
        primaryToolFailed: true,
        repairsUsed,
        workspaceCard: { type: "none" },
      });
      await persistProjectChatTurn({
        messages: safeMessages,
        projectId: project.id,
        userId,
        workspaceCard: { type: "none" },
      });
    }
```

- [x] **Step 3: `!chatText` path — skip repair when built**

Find the block:

```ts
if (!chatText) {
  const repaired = await repairDiscussCardWithTool({
    ...
    hasBuiltSite,
    ...
  });
```

Change to only call repair when `!hasBuiltSite`. When `hasBuiltSite && !chatText`, emit protocol none + persist + finish without repair (mirror structure of intentional none / degraded text path without inventing chat text). Minimal shape:

```ts
if (!chatText) {
  if (hasBuiltSite) {
    const resolvedToolCallId = streamToolCallId || toolCallId;
    publishProgress(turnId, {
      type: "tool-input-available",
      toolCallId: resolvedToolCallId,
      toolName: PRESENT_WORKSPACE_CARD_TOOL_NAME,
      input: {},
    });
    publishProgress(turnId, {
      type: "tool-output-available",
      toolCallId: resolvedToolCallId,
      output: {
        workspaceCard: { type: "none" },
        projectTitle: project.title,
        repairsUsed: 0,
      },
    });
    const assistantMessage: UIMessage = {
      id: messageId,
      role: "assistant",
      parts: [
        {
          type: `tool-${PRESENT_WORKSPACE_CARD_TOOL_NAME}`,
          toolCallId: resolvedToolCallId,
          state: "output-available",
          input: {},
          output: {
            workspaceCard: { type: "none" },
            projectTitle: project.title,
          },
        } as UIMessage["parts"][number],
      ],
    };
    const safeMessages = stripTransportDiagnosticMessages(
      dedupeUiMessages([...messages, assistantMessage]),
    );
    await writeAiRequestLog({
      event: "discuss:finish",
      model: modelName,
      mode: "one_call_tools",
      projectId: project.id,
      didWorkspaceToolUpdate: true,
      primaryToolFailed: false,
      repairsUsed: 0,
      workspaceCard: { type: "none" },
    });
    await persistProjectChatTurn({
      messages: safeMessages,
      projectId: project.id,
      userId,
      workspaceCard: { type: "none" },
    });
    await chargeEnergyForAiUsage({
      userId,
      modelId: discussModelId,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      reason: "discuss:step",
    });
    publishProgress(turnId, { type: "finish" });
    await finalizeDiscussTurn({ turnId, status: "succeeded" });
    return;
  }

  // existing repairDiscussCardWithTool path for !hasBuiltSite
  ...
}
```

- [x] **Step 4: Repair guard**

At top of `repairDiscussCardWithTool` body (after params):

```ts
if (hasBuiltSite) {
  return null;
}
```

- [x] **Step 5: Run tests — expect PASS**

```bash
bun test src/lib/projects/discuss-turn-worker.test.ts
```

Expected: all pass including new built-site test and existing pre-build text-only test.

---

### Task 3: Verify

- [x] **Step 1:** `bun test src/lib/projects/discuss-turn-worker.test.ts`
- [x] **Step 2:** `bun run check` (or format + lint + typecheck on touched files)
- [x] **Step 3:** Commit only if user asks

---

## Spec coverage

| Spec requirement | Task |
|------------------|------|
| `primaryToolFailed` only pre-build | Task 2 Step 1 |
| Skip repair when `hasBuiltSite` | Task 2 Steps 1, 3, 4 |
| Log finish not text-only-fallback post-build | Task 2 Step 2 |
| Pre-build unchanged | Task 1 existing test + Task 2 |
| Unit tests | Task 1 |

## Self-review

- No placeholders.
- Does not implement edit-pipeline product change.
- Event names match existing `writeAiRequestLog` usage.
