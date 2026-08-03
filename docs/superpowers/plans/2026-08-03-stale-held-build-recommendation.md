# Stale Held Build Recommendation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop post-build workspaces from showing "Rancangan build disimpan" by treating latest `workspaceCard: none` as terminal in message scan and hardening hold/consume after successful builds.

**Architecture:** Extract pure `getWorkspaceCardFromMessages` into `workspace-sync` (or a small sibling module), make `type: "none"` return null without scanning older tool cards, wire `WorkspaceShell` to it, clear hold when build is complete and never re-hold consumed signatures on post-build discuss.

**Tech Stack:** TypeScript, Bun test, existing `UIMessage` / `WorkspaceCard` types, React client shell.

## Global Constraints

- Bun only; no new dependencies.
- User-facing product UI copy stays Indonesian; code/docs/tests English.
- Surgical edits: no drive-by refactors in `WorkspaceShell` beyond the scan/hold paths.
- TDD: failing tests first for scan semantics, then implement.
- Do not special-case any project ID; no DB migration.
- Pre-commit uses `check:commit`; before handoff run focused tests + `bun run check` if practical.

## File map

| File | Role |
|------|------|
| `src/lib/projects/workspace-sync.ts` | Export pure `getWorkspaceCardFromMessages`; keep composer helpers |
| `src/lib/projects/workspace-sync.test.ts` | Unit tests for scan + any hold-related composer cases |
| `src/components/projects/WorkspaceShell.tsx` | Import shared helper; delete private duplicate; harden hold/clear |

---

### Task 1: Failing tests for terminal `none` scan

**Files:**
- Modify: `src/lib/projects/workspace-sync.ts` (export stub if needed so tests import a real symbol)
- Modify: `src/lib/projects/workspace-sync.test.ts`

**Interfaces:**
- Produces: `getWorkspaceCardFromMessages(messages: UIMessage[]): { projectTitle?: string; workspaceCard: WorkspaceCard } | null`

- [x] **Step 1: Add failing tests**

Add to `workspace-sync.test.ts` (import `getWorkspaceCardFromMessages` and `UIMessage` as needed):

```ts
describe("getWorkspaceCardFromMessages", () => {
  const present = (
    card: WorkspaceCard,
    projectTitle?: string,
  ): UIMessage["parts"][number] =>
    ({
      type: "tool-presentWorkspaceCard",
      state: "output-available",
      output: { workspaceCard: card, projectTitle },
    }) as UIMessage["parts"][number];

  const assistant = (
    id: string,
    parts: UIMessage["parts"],
  ): UIMessage => ({ id, role: "assistant", parts });

  it("returns the latest non-none workspace card", () => {
    const card: WorkspaceCard = {
      type: "build_recommendation",
      title: "Siap dibangun!",
      summary: ["A"],
    };
    expect(
      getWorkspaceCardFromMessages([
        assistant("a1", [present(card, "Title")]),
      ]),
    ).toEqual({ workspaceCard: card, projectTitle: "Title" });
  });

  it("treats a later none card as terminal and ignores older recommendations", () => {
    const old: WorkspaceCard = {
      type: "build_recommendation",
      title: "Siap dibangun!",
      summary: ["A"],
    };
    expect(
      getWorkspaceCardFromMessages([
        assistant("a1", [present(old)]),
        assistant("a2", [present({ type: "none" })]),
        {
          id: "u1",
          role: "user",
          parts: [{ type: "text", text: "ganti warnanya" }],
        },
      ]),
    ).toBeNull();
  });

  it("returns a newer real card that appears after a none", () => {
    const next: WorkspaceCard = {
      type: "question",
      question: {
        id: "color",
        question: "Warna apa?",
        answerMode: "text",
        options: [],
        placeholder: "",
        selectionMode: "single",
        whyThisQuestionMatters: "",
      },
    };
    expect(
      getWorkspaceCardFromMessages([
        assistant("a1", [
          present({
            type: "build_recommendation",
            title: "Old",
            summary: ["x"],
          }),
        ]),
        assistant("a2", [present({ type: "none" })]),
        assistant("a3", [present(next)]),
      ])?.workspaceCard,
    ).toEqual(next);
  });
});
```

Adjust `question` fields if `WorkspaceCard` type requires different required keys — match existing test helpers in the same file (`questionCard`).

- [x] **Step 2: Run tests — expect FAIL**

```bash
bun test src/lib/projects/workspace-sync.test.ts
```

Expected: import/export missing or tests fail until implementation.

- [x] **Step 3: Implement `getWorkspaceCardFromMessages` in `workspace-sync.ts`**

Port logic from `WorkspaceShell.tsx` private function, with the critical change:

```ts
const card = output?.workspaceCard;
if (!card || typeof card !== "object") {
  continue;
}
if (card.type === "none") {
  return null; // terminal — do not scan older messages
}
return {
  workspaceCard: card,
  projectTitle:
    typeof output?.projectTitle === "string" ? output.projectTitle : undefined,
};
```

Keep tool detection:

- `part.type === "tool-presentWorkspaceCard"` OR `part.toolInvocation?.toolName === "presentWorkspaceCard"`
- state must be `output-available` (from `part.state` or `part.toolInvocation?.state`)
- prefer `part.output` then `part.toolInvocation?.output`

- [x] **Step 4: Re-run tests — expect PASS**

```bash
bun test src/lib/projects/workspace-sync.test.ts
```

---

### Task 2: Wire WorkspaceShell + hold hardening

**Files:**
- Modify: `src/components/projects/WorkspaceShell.tsx`

**Interfaces:**
- Consumes: `getWorkspaceCardFromMessages` from `@/lib/projects/workspace-sync`

- [x] **Step 1: Import shared helper; delete private function**

Add to existing `workspace-sync` import list:

```ts
getWorkspaceCardFromMessages,
```

Delete the private `getWorkspaceCardFromMessages` function (~line 3449–3512) and the local `PRESENT_WORKSPACE_CARD_TOOL_TYPE` constant if only used by that function.

- [x] **Step 2: Clear hold when build is complete**

Near other effects that depend on `buildComplete` / runtime, add a small effect:

```ts
useEffect(() => {
  if (!buildComplete) {
    return;
  }
  // Stale hold from pre-build discuss must not survive a finished build
  // unless the user parks a brand-new unconsumed recommendation later.
  if (!heldBuildRecommendationSignature) {
    return;
  }
  const signature = getBuildRecommendationHoldSignature(workspaceCard);
  const consumed =
    signature &&
    consumedBuildRecommendationSignatures.has(signature);
  // Clear hold when there is no active recommendation card, or it was already used.
  if (
    workspaceCard.type !== "build_recommendation" ||
    consumed ||
    !signature
  ) {
    window.localStorage.removeItem(buildRecommendationStorageKey);
    setHeldBuildRecommendationSignature(null);
  }
}, [
  buildComplete,
  buildRecommendationStorageKey,
  consumedBuildRecommendationSignatures,
  heldBuildRecommendationSignature,
  workspaceCard,
]);
```

If effect order / exhaustive-deps is noisy, equivalent: clear hold inside existing success settle where `buildComplete` flips true — keep one place only.

- [x] **Step 3: Post-build discuss — do not hold consumed cards**

In both `CompletedBuildNotice` `onDiscuss` handlers (~3020 and ~3252), change:

```ts
onDiscuss={() => {
  if (
    buildRecommendationSignature &&
    !consumedBuildRecommendationSignatures.has(buildRecommendationSignature)
  ) {
    window.localStorage.setItem(
      buildRecommendationStorageKey,
      buildRecommendationSignature,
    );
    setHeldBuildRecommendationSignature(buildRecommendationSignature);
  }
  setMode("discuss");
  setPostBuildChatOpen(true);
}}
```

- [x] **Step 4: Run focused tests**

```bash
bun test src/lib/projects/workspace-sync.test.ts
```

Optional: if shell has unit tests for pure exports only, leave them; do not add heavy React RTL unless already easy.

---

### Task 3: Verify gate

- [x] **Step 1: Focused + existing suite slice**

```bash
bun test src/lib/projects/workspace-sync.test.ts
```

- [x] **Step 2: Lint/typecheck on touched files if full check is heavy**

```bash
bun run check
```

Or at least ESLint on edited files + `bunx tsc --noEmit` if `check` is too long — prefer `bun run check` before handoff.

- [ ] **Step 3: Manual acceptance (when dev server available)**

1. Open a built project with history `build_recommendation` → `none` → free chat.
2. Confirm no "Rancangan build disimpan" after "Chat dengan AI".
3. Spot-check pre-build hold still works on a draft project if one exists.

- [x] **Step 4: Commit only if user asks**

Do not commit unless explicitly requested. Docs (spec + plan) ship with the code change when committing.

---

## Spec coverage

| Spec requirement | Task |
|------------------|------|
| Terminal `none` in message scan | Task 1 |
| Shell uses shared helper | Task 2 Step 1 |
| Hold clear / no hold consumed post-build | Task 2 Steps 2–3 |
| Unit tests | Task 1 |
| No per-project migration | All tasks |

## Self-review notes

- No placeholders.
- Signatures match `WorkspaceCard` / existing `getBuildRecommendationHoldSignature`.
- YAGNI: no server consume store, no chat history rewrite.
