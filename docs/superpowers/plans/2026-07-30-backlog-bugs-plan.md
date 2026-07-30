# Backlog Bugs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 4 independent bugs: custom input disconnect, build preview blink, retry callsite consistency, chat retry-resume after disconnect.

**Architecture:** All four are independent and can be implemented in any order. Each touches different files with no overlap. #4 and #3 are client-side only (WorkspaceShell). #1 is worker/lib side. #2 is mixed client+server (WorkspaceShell + api.projects.preview.ts).

**Tech Stack:** TanStack Start (React), AI SDK, Postgres, Vitest

## Global Constraints

- User-facing product UI copy in Indonesian; developer-facing code/logs/comments in English
- Keep changes small, focused, easy to review
- Surgical edits: touch only what the task requires. Match surrounding style.
- `bun run check` must pass before commit
- TDD first for #2 (chat reconnect). Failing test → implement → passing test
- Prefer deletion, reuse, and platform features before adding new abstractions

---

### Task 1: Custom input disconnect AI (#4)

**Files:**
- Modify: `src/components/projects/WorkspaceShell.tsx` (add byte guard in `submitChatText` + 413 error mapping)
- Modify: `src/components/projects/WorkspacePrimitives.tsx` (add `maxLength` to custom-answer and free-text textareas)
- Test: `src/components/projects/WorkspaceShell.test.ts`

**Interfaces:**
- Consumes: `submitChatText(text, options)` at line 2010 — add early-exit guard
- Consumes: existing 413 response from `api.projects.preview.ts:211` with `code: "chat_turn_too_large"` and `message: "Pesan terlalu panjang. Ringkas dulu sebelum dikirim."`
- Produces: `MAX_CHAT_BYTES = 16 * 1024` constant in WorkspaceShell

- [ ] **Step 1: Add MAX_CHAT_BYTES constant + byte check in submitChatText**

In `src/components/projects/WorkspaceShell.tsx`, add a constant at module level:

```ts
// Must match the server limit in api.projects.preview.ts
const MAX_CHAT_BYTES = 16 * 1024;
```

In `submitChatText` at line 2019, after `const trimmed = text.trim();`, add a byte-size guard. Use `TextEncoder` (available in browser — `Buffer` is Node-only):

```ts
      if (new TextEncoder().encode(trimmed).length > MAX_CHAT_BYTES) {
        toast.error("Pesan terlalu panjang. Maksimal 16.000 karakter.");
        return;
      }
```

- [ ] **Step 2: Add maxLength to textarea inputs in WorkspacePrimitives.tsx**

Find the custom-answer textarea (around line 1484-1497) — it has no `maxLength`. Add `maxLength={16000}`.

Find the free-text `Tulis bebas` textarea (around line 1315-1327) — add `maxLength={16000}`.

These give realtime feedback without needing byte-exact math; the server-enforced limit is 16 KiB ≈ ~16000 chars for Indonesian text, so 16000 is a safe upper bound.

- [ ] **Step 3: Add 413 interception in rateLimitAwareFetch + error rendering**

In `src/components/projects/WorkspaceShell.tsx`, after the `400` handling block at line 3564, add a 413 handler:

```ts
  if (response.status === 413) {
    const clone = response.clone();
    const body = (await clone.json().catch(() => null)) as {
      code?: string;
      message?: string;
    } | null;
    if (body?.code === "chat_turn_too_large") {
      const error = new Error(
        body.message || "Pesan terlalu panjang. Ringkas dulu sebelum dikirim.",
      ) as ChatError;
      error.status = 413;
      error.code = "chat_turn_too_large";
      throw error;
    }
  }
```

Then in the error rendering block (around line 2554-2570), before the generic error block:

```tsx
          ) : error && (error as ChatError).code === "chat_turn_too_large" ? (
            <div className="rounded-[18px] border border-[#ffb4a6]/24 bg-[#ffb4a6]/[0.06] px-spacing-5 py-spacing-4">
              <p className="text-sm font-medium text-[#ffb4a6]">
                Pesan terlalu panjang. Ringkas dulu sebelum dikirim.
              </p>
            </div>
```

- [ ] **Step 4: Write test for byte guard**

In `src/components/projects/WorkspaceShell.test.ts`:

```ts
it("rejects oversized custom input before sendMessage", async () => {
  const longText = "a".repeat(17_000); // > 16 KiB UTF-8
  render(<WorkspaceShell {...defaultProps} />);
  const textarea = screen.getByRole("textbox");
  await userEvent.type(textarea, longText);
  await userEvent.click(screen.getByLabelText("Kirim pesan"));
  // Throttle logs an error; sendMessage should not be called
  expect(mockSendMessage).not.toHaveBeenCalled();
});
```

- [ ] **Step 5: Run tests, commit**

```bash
bun run check
git add -A
git commit -m "fix(chat): guard oversized custom input and map 413 errors"
```

---

### Task 2: Build preview blink (#3)

**Files:**
- Modify: `src/components/projects/WorkspaceShell.tsx` (reorder preview branch, add banner)
- Modify: `src/lib/projects/workspace-sync.ts` (add `build_in_progress_with_last_good` state)
- Test: `src/lib/projects/workspace-sync.test.ts`

**Interfaces:**
- Consumes: `getWorkspacePreviewIssue()` at workspace-sync.ts:329 — currently returns blocking issue for `building` state
- Consumes: `hasInitialPreview` at WorkspaceShell.tsx:244 — detects if a successful preview exists
- Consumes: `isBuilding` at WorkspaceShell.tsx:1051
- Consumes: `shouldRenderGeneratedPreview` at WorkspaceShell.tsx:1126
- Produces: non-blocking preview issue for "building with last good preview"
- Produces: `CompletedBuildNotice` component with `variant="recovery"` (already exists at line 3418!)

- [ ] **Step 1: Add non-blocking preview issue for building-with-last-good**

In `src/lib/projects/workspace-sync.ts`, in `getWorkspacePreviewIssue()`, change the `building` block at line 354. Instead of returning a blocking issue, return `null` when a last-good preview exists:

```ts
  if (runtimeUserFacingState === "building") {
    // The server retains the last successful preview during active builds.
    // Show the old iframe + a non-blocking progress banner instead of blanking.
    const hasLastGoodPreview = [runtimeBuildStatus, sourceStatus].some((status) =>
      ["passed", "ready", "succeeded"].includes(status ?? ""),
    );
    if (hasLastGoodPreview) {
      return null; // Client will render old preview + progress banner
    }
    return {
      detail: "Tampilan website akan muncul setelah build selesai.",
      title: "Build website sedang berjalan",
    };
  }
```

- [ ] **Step 2: Update existing test + add new tests for new behavior**

In `src/lib/projects/workspace-sync.test.ts`, the existing test at line 331 "maps runtime summary states to clear preview panels" expects `building` to return a blocking issue. After the change, it should expect `null` when `runtimeBuildStatus` is passed. Update it to test both paths:

```ts
  it("maps runtime summary states to clear preview panels", () => {
    // Building without last-good preview → blocking issue
    expect(
      getWorkspacePreviewIssue({
        runtimeUserFacingState: "building",
        runtimeBuildStatus: null,
        sourceStatus: null,
      }),
    ).toEqual({
      detail: "Tampilan website akan muncul setelah build selesai.",
      title: "Build website sedang berjalan",
    });
    expect(
      getWorkspacePreviewIssue({
        runtimeUserFacingState: "preview_starting",
      }),
    ).toBeNull();
    expect(
      getWorkspacePreviewIssue({
        runtimeUserFacingState: "build_failed_without_last_good",
      }),
    ).toEqual({
      detail:
        "Build website belum berhasil dan belum ada tampilan sebelumnya. Tekan Build ulang untuk mencoba lagi.",
      title: "Build website belum selesai",
    });
  });

  it("returns null preview issue for building state when last good preview exists", () => {
    const result = getWorkspacePreviewIssue({
      runtimeUserFacingState: "building",
      runtimeBuildStatus: "succeeded",
      sourceStatus: "succeeded",
    });
    expect(result).toBeNull();
  });

  it("still returns blocking issue for building state when no last good preview", () => {
    const result = getWorkspacePreviewIssue({
      runtimeUserFacingState: "building",
      runtimeBuildStatus: null,
      sourceStatus: null,
    });
    expect(result).not.toBeNull();
    expect(result?.title).toBe("Build website sedang berjalan");
  });
```

- [ ] **Step 3: Update preview panel rendering in WorkspaceShell**

In `src/components/projects/WorkspaceShell.tsx`, at line 3026, change the preview branch. Currently it's:

```tsx
{isBuilding ? (
  <div className="grid min-h-full place-items-center ..."> spinner </div>
) : previewIssue ? (
  <PreviewIssueState ... />
) : shouldRenderGeneratedPreview ? (
  <GeneratedPreviewFrame ... />
) : (
  <EmptyPreviewState />
)}
```

The problem: `shouldRenderGeneratedPreview` returns `false` during build (because `buildComplete` is `false`), so the `isBuilding` branch always catches first. Even if `getWorkspacePreviewIssue` returns `null`, the spinner wins.

Fix: change to four branches — building-without-preview (spinner), building-with-preview (old frame + banner), issue, frame, empty:

First, compute `hasLastGoodPreview` near the existing preview variables at line 1118:

```ts
  const hasLastGoodPreview = Boolean(runtimeState?.deployment);
```

Then replace the render block at line 3026:

```tsx
              {isBuilding && !hasLastGoodPreview ? (
                <div className="grid min-h-full place-items-center bg-[#10100f] p-spacing-10 text-center">
                  <div className="flex flex-col items-center gap-spacing-4 text-center">
                    <div className="size-9 animate-spin rounded-full border-2 border-surface-warm-white/12 border-t-surface-warm-white/82" />
                    <p className="text-sm font-medium text-surface-warm-white/78">
                      Menyiapkan pratinjau website...
                    </p>
                  </div>
                </div>
              ) : previewIssue && !(isBuilding && hasLastGoodPreview) ? (
                <PreviewIssueState
                  detail={previewIssue.detail}
                  onRebuild={readOnly ? undefined : () => void startBuild()}
                  onRetry={recoverPreviewRuntime}
                  title={previewIssue.title}
                />
              ) : shouldRenderGeneratedPreview || (isBuilding && hasLastGoodPreview) ? (
                <div className="relative h-full">
                  <GeneratedPreviewFrame
                    annotationActive={annotationMode}
                    annotationMarkers={annotations}
                    onAnnotationTarget={handleAnnotationTarget}
                    onLoad={() => void loadRuntimeState()}
                    onRecover={recoverPreviewRuntime}
                    onStuck={() => void loadRuntimeState()}
                    pendingAnnotation={...}
                    projectId={projectId}
                    reloadKey={previewReloadKey}
                    viewport={viewport}
                  />
                  {isBuilding && hasLastGoodPreview && (
                    <div className="absolute inset-x-0 top-0 z-10 flex items-center gap-2 bg-[#10100f]/80 px-4 py-2 text-xs text-surface-warm-white/78 backdrop-blur-sm">
                      <div className="size-3 animate-spin rounded-full border-2 border-surface-warm-white/12 border-t-surface-warm-white/82" />
                      Membangun ulang website...
                    </div>
                  )}
                </div>
              ) : (
                <EmptyPreviewState />
              )}

- [ ] **Step 4: Add failure banner for ready_with_failed_latest_attempt**

The `CompletedBuildNotice` already exists at line 3418 with `variant="recovery"` showing "Build terbaru gagal, tapi tampilan terakhir yang berhasil tetap aman." This needs to be shown on the preview panel when runtime reports `ready_with_failed_latest_attempt`.

In WorkspaceShell, after the preview panel content, add a condition to show this notice:

```tsx
{runtimeState?.userFacingState === "ready_with_failed_latest_attempt" && (
  <CompletedBuildNotice
    variant="recovery"
    onDiscuss={focusChat}
    onPreview={focusPreview}
  />
)}
```

Place this after the preview panel content wrapper but inside the preview tab panel div.

- [ ] **Step 5: Run tests, commit**

```bash
bun run check
git add -A
git commit -m "fix(ui): keep last-good preview visible during build and after failure"
```

---

### Task 3: Consistent retry callsites (#1)

**Files:**
- Modify: `src/lib/projects/discuss-turn-worker.ts:111` (remove explicit `maxRetries: 2`)
- Modify: `src/lib/projects/discuss-turn-shared.ts:160` (change `maxRetries: 1` to omit)
- Modify: `src/lib/projects/discuss-turn-shared.ts:253` (remove explicit `maxRetries: 2`)
- Modify: `src/lib/projects/custom-source-generator.ts` (add explicit `maxRetries: 2`)
- Modify: `src/lib/projects/source-edit-agent.ts` (add explicit `maxRetries: 2`)
- Modify: `src/lib/projects/build-attempt-worker.ts` (add explicit `maxRetries: 2` or verify implicit default)
- Test: Existing test coverage — no new tests needed (behavior-preserving)

**Interfaces:**
- No new interfaces; all changes are mechanical inline modifications

- [ ] **Step 1: Remove explicit `maxRetries: 2` in discuss-turn-worker.ts:111**

SDK default is also `2`. Removing it is a pure no-op.

In `src/lib/projects/discuss-turn-worker.ts:111`:
```diff
-     maxRetries: 2,
      temperature: 0.25,
```

- [ ] **Step 2: Change `maxRetries: 1` to omit in discuss-turn-shared.ts:160**

This changes 1 retry → SDK default 2 retries (more tolerant, strictly safer).

In `src/lib/projects/discuss-turn-shared.ts:160`:
```diff
-          maxRetries: 1,
          tools: {
```

- [ ] **Step 3: Remove explicit `maxRetries: 2` in discuss-turn-shared.ts:253**

SDK default is also `2`. Pure no-op.

- [ ] **Step 4: Add explicit `maxRetries: 2` to custom-source-generator.ts**

In `src/lib/projects/custom-source-generator.ts`, find `ToolLoopAgent` constructor calls for generation (line ~182), rewrite (~376), and subagent (~560). Add `maxRetries: 2` to each:

```diff
      const agent = new ToolLoopAgent({
        model: getAiGenerationModel(),
+       maxRetries: 2,
        maxSteps: getAiAgentSteps("generate"),
      });
```

Match this pattern for all three Agent constructors in the file.

- [ ] **Step 5: Add explicit `maxRetries: 2` to source-edit-agent.ts**

Same pattern: find `ToolLoopAgent` constructor calls (around lines 66 and 135), add `maxRetries: 2`:

```diff
      const agent = new ToolLoopAgent({
        model,
+       maxRetries: 2,
        maxSteps: AI_EDIT_MAX_STEPS,
      });
```

- [ ] **Step 6: Add explicit `maxRetries: 2` to build-attempt-worker.ts**

Find the `generateText` call for spec generation (around line 438), add `maxRetries: 2`:

```diff
      const specResult = await generateText({
        model: getAiGenerationModel(),
+       maxRetries: 2,
        system: specSystemPrompt,
```

- [ ] **Step 7: Run tests, commit**

```bash
bun run check
git add -A
git commit -m "chore(ai): standardize maxRetries across all AI callsites"
```

---

### Task 4: Chat retry should resume, not restart (#2)

**Files:**
- Modify: `src/components/projects/WorkspaceShell.tsx` (retryChat checks /chat/turn first)
- Modify: `src/routes/api.projects.preview.ts` (guard assistant-as-user claim)
- Test: `src/components/projects/WorkspaceShell.test.ts`
- Test: `src/routes/-api.projects.preview.discuss.test.ts`

**Interfaces:**
- Consumes: `GET /api/projects/$id/chat/turn` — returns `{ turnId, status, userMessageId, errorMessage }`
- Consumes: `reloadLatestChat()` — already defined in WorkspaceShell
- Consumes: `regenerate()` — AI SDK, currently called directly
- Produces: `retryChat()` checks `/chat/turn` before falling back to regenerate

- [ ] **Step 1: Write failing test — retryChat with succeeded turn**

In `src/components/projects/WorkspaceShell.test.ts`:

```ts
it("reloads chat on retry when /chat/turn returns succeeded", async () => {
  const mockFetch = vi.spyOn(globalThis, "fetch");
  // First call will be /chat/turn — return succeeded
  mockFetch.mockImplementationOnce(() =>
    Promise.resolve(
      new Response(
        JSON.stringify({ turnId: "t1", status: "succeeded", userMessageId: "u1" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    ),
  );
  // Second call will be /chat — return persisted messages
  mockFetch.mockImplementationOnce(() =>
    Promise.resolve(
      new Response(
        JSON.stringify({ messages: [{ id: "u1", role: "user", content: "hello" }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    ),
  );

  render(<WorkspaceShell {...defaultProps} />);

  // Simulate chat error state
  const retryButton = await screen.findByText("Kirim ulang");
  await userEvent.click(retryButton);

  // Should NOT have called regenerate — should have fetched /chat/turn + /chat
  expect(mockFetch).toHaveBeenCalledWith(
    expect.stringContaining("/chat/turn"),
    expect.any(Object),
  );
  expect(mockFetch).toHaveBeenCalledWith(
    expect.stringContaining("/chat?limit="),
    expect.any(Object),
  );
});
```

Run it: `bun vitest run src/components/projects/WorkspaceShell.test.ts -- -t "retryChat.*succeeded"` — should FAIL (current `retryChat` calls `regenerate()` directly).

- [ ] **Step 2: Write failing test — retryChat with running turn**

In same test file:

```ts
it("polls on retry when /chat/turn returns running", async () => {
  vi.useFakeTimers();
  const mockFetch = vi.spyOn(globalThis, "fetch");
  mockFetch.mockImplementationOnce(() =>
    Promise.resolve(
      new Response(
        JSON.stringify({ turnId: "t1", status: "running", userMessageId: "u1" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    ),
  );

  render(<WorkspaceShell {...defaultProps} />);

  const retryButton = await screen.findByText("Kirim ulang");
  await userEvent.click(retryButton);

  // Should poll, not regenerate
  await vi.advanceTimersByTimeAsync(2000);
  expect(mockFetch).toHaveBeenCalledWith(
    expect.stringContaining("/chat/turn"),
    expect.any(Object),
  );

  vi.useRealTimers();
});
```

Run: should FAIL.

- [ ] **Step 3: Implement retryChat with /chat/turn check**

In `src/components/projects/WorkspaceShell.tsx`, replace `retryChat` at line 2201:

```ts
  const retryChat = useCallback(async () => {
    if (status === "streaming" || status === "submitted" || isRetrying) {
      return;
    }

    setIsRetrying(true);
    clearError();

    try {
      const turnRes = await fetch(`/api/projects/${projectId}/chat/turn`, {
        cache: "no-store",
      });

      if (turnRes.ok) {
        const turn = await turnRes.json() as {
          status: string;
          userMessageId?: string;
          errorMessage?: string;
        };

        if (turn.status === "succeeded") {
          // Reload persisted chat rather than regenerating
          await reloadLatestChat();
          return;
        }

        if (turn.status === "running") {
          // Poll until turn finishes
          const pollTurn = async () => {
            const pollRes = await fetch(`/api/projects/${projectId}/chat/turn`, {
              cache: "no-store",
            });
            if (!pollRes.ok) return;
            const pollTurn = await pollRes.json() as { status: string };
            if (pollTurn.status === "succeeded") {
              await reloadLatestChat();
            } else if (pollTurn.status === "running") {
              setTimeout(pollTurn, 2000);
            }
            // failed/cancelled — don't auto-retry, user clicks again
          };
          setTimeout(pollTurn, 2000);
          return;
        }

        // Failed/cancelled turn — fall through to regenerate
      }
    } catch {
      // Network error fetching turn — fall through to regenerate below
    }

    // Fallback: regenerate as before
    try {
      await regenerate();
    } catch {
      // Error panel remains visible
    } finally {
      setIsRetrying(false);
    }
  }, [
    clearError,
    isRetrying,
    projectId,
    regenerate,
    reloadLatestChat,
    status,
  ]);
```

- [ ] **Step 4: Write failing test — server rejects assistant-as-user claim**

In `src/routes/-api.projects.preview.discuss.test.ts`:

```ts
it("rejects turn claim when last effective message is assistant", async () => {
  // Stored: [user u1, assistant a1]
  // Incoming retry: [user u1] (duplicate)
  const res = await makeDiscussRequest({
    projectId: testProject.id,
    messages: [
      { id: "u1", role: "user", content: "hello" },
      { id: "a1", role: "assistant", content: "hi" },
    ],
    // The client sends only the duplicates after dedupe sees
    // the assistant as last message
  });
  expect(res.status).toBe(409);
  const body = await res.json();
  expect(body.code).toBe("chat_turn_not_user");
});
```

Run: `bun vitest run src/routes/-api.projects.preview.discuss.test.ts -- -t "rejects.*assistant"` — should FAIL.

- [ ] **Step 5: Add server guard against assistant-as-user claim**

In `src/routes/api.projects.preview.ts`, after the dedupe at line ~410-428, add a role check:

```ts
  // After dedupe, the last effective message must be a user message.
  // If dedupe removed the user message and left assistant as last,
  // the client should reload via /chat/turn instead of claiming with wrong id.
  const lastMsg = merged[messages.length - 1];
  if (lastMsg && lastMsg.role !== "user") {
    return Response.json(
      {
        code: "chat_turn_not_user",
        message: "Sesi chat perlu dimuat ulang. Silakan refresh.",
      },
      { status: 409 },
    );
  }
```

Place this right before the `claimDiscussTurn` call (around line 430).

- [ ] **Step 6: Run tests, full verify, commit**

```bash
bun vitest run src/components/projects/WorkspaceShell.test.ts -- -t "retryChat"
bun vitest run src/routes/-api.projects.preview.discuss.test.ts -- -t "rejects.*assistant"
bun run check
git add -A
git commit -m "fix(chat): resume instead of regenerate on retry after disconnect"
```
