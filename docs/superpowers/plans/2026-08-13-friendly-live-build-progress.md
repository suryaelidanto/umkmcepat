# Friendly Live Build Progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make generation and edit/rebuild feel like a satisfying live workshop by exposing real stage and per-file progress in friendly Indonesian without simulating activity.

**Architecture:** Keep the existing progress event schema, durable progress persistence, SSE replay/deduplication, per-file rows, timers, stop/retry behavior, and expandable diffs. Change consumer-facing copy at the event producers and UI boundaries, add only real stage events where a real stage is currently silent, and derive any completed count from the existing progress-step list.

**Tech Stack:** Bun, TypeScript, React/TanStack Start, Vitest, existing SSE/pubsub progress pipeline, Motion UI animation already present in `WorkspaceBuildProgress`.

## Global Constraints

- Show meaningful progress; hide implementation details.
- Every visible completion must correspond to a real progress or file operation.
- Keep one real visible step per file operation; do not merge, cap, or deduplicate real operations.
- Keep existing live updates, durations, stop action, retry behavior, terminal states, expandable rows, file paths, and diffs.
- Do not add fake steps, fake delays, fake percentages, token-level noise, or decorative activity that claims work happened when it did not.
- User-facing copy is Indonesian; code, logs, telemetry, admin/debug details, and internal event names remain English/technical as appropriate.
- Do not expose `batched`, `writer`, `agent`, `worker`, `compile`, or implementation `source` terminology to customers.
- Replace unnecessary user-facing `build` with outcome-oriented phrases such as `buat website` or `website sedang dibuat`.
- Initial generation and edit/rebuild must use the same friendly vocabulary.
- Use Bun only; do not add dependencies.
- Run focused tests before the full `bun run check` gate.
- Do not run `bun run build`, E2E, or remote push in this pass unless separately requested.

---

## File map

- Modify `src/lib/projects/build-attempt-worker.ts`: replace technical consumer-facing progress labels/details and add only missing real stage-boundary events.
- Modify `src/lib/projects/batched-generator.ts`: replace the per-file operation detail and generation-stage progress copy without changing writer internals or event shape.
- Modify `src/lib/projects/edit-attempt-worker.ts`: apply the same per-file and edit-stage vocabulary to rebuild/edit progress.
- Modify `src/lib/projects/project-job.ts`: replace fallback and rehydrated job-step copy so reconnects do not reintroduce technical language.
- Modify `src/lib/projects/build-stream-event.ts`: update reducer fallbacks and terminal copy while preserving operation paths/diffs and event identity.
- Modify `src/lib/projects/build-stream-event.test.ts`: assert friendly reducer output and unchanged diff/path preservation.
- Modify `src/lib/projects/build-progress-steps.test.ts`: preserve existing repeated-row, duration, hydration, and deduplication behavior tests; add completed-count fixture coverage if needed.
- Modify `src/components/projects/WorkspaceBuildProgress.tsx`: replace generic fallback/header copy, display a truthful completed-row count, and preserve current active timer/expand behavior.
- Create `src/components/projects/WorkspaceBuildProgress.test.ts`: test fallback, active copy, count, and terminal copy using server-rendered markup.
- Modify `src/components/projects/WorkspacePrimitives.tsx`: update build start/retry/progress copy while preserving controls and existing props.
- Modify `src/components/projects/WorkspacePrimitives.test.tsx`: assert friendly processing copy and existing current-step/path behavior.
- Modify `src/components/projects/BuildNotices.tsx`: update held recommendation, retry/recovery, completion, and action-button copy.
- Create `src/components/projects/BuildNotices.test.ts`: assert consumer copy and unchanged action labels/handlers.
- Modify `src/components/projects/WorkspaceShell.tsx`: update start/retry/error/status strings and current-step fallback only; do not alter build state, stream handling, idempotency, or proof gates.
- Modify `src/lib/projects/batched-edit.test.ts`: keep internal `writer`/`phase` assertions technical, but add consumer event-copy assertions if the edit event sink is exposed there.

---

### Task 1: Lock the real-progress and copy contracts with failing tests

**Files:**
- Create: `src/components/projects/WorkspaceBuildProgress.test.ts`
- Create: `src/components/projects/BuildNotices.test.ts`
- Modify: `src/lib/projects/build-stream-event.test.ts`
- Modify: `src/lib/projects/build-progress-steps.test.ts`
- Modify: `src/components/projects/WorkspacePrimitives.test.tsx`

**Interfaces:**
- Consumes the existing `BuildProgressStep`, `reduceBuildStreamEvent`, `appendBuildProgressStep`, `BuildProgressPanel`, `ProcessingControl`, `HeldBuildRecommendationNotice`, and `CompletedBuildNotice` APIs.
- Produces executable acceptance tests for friendly copy and unchanged real-progress behavior. No production interface changes are introduced in this task.

- [x] **Step 1: Add a failing reducer-copy test.** Extend `src/lib/projects/build-stream-event.test.ts` with a consumer-facing operation case:

```ts
it("uses friendly file-operation copy while preserving the real path and diff", () => {
  const result = reduceBuildStreamEvent({
    type: "operation",
    title: "Menulis file",
    path: "src/routes/index.tsx",
    detail: "Bagian website selesai ditulis.",
    state: "succeeded",
    diff: [{ type: "add", text: "export const page = true;" }],
  });

  expect(result.kind).toBe("progress");
  if (result.kind !== "progress") {
    throw new Error("expected progress");
  }
  const step = result.update([])[0];
  expect(step.label).toBe("Menulis file");
  expect(step.detail).toContain("src/routes/index.tsx");
  expect(step.detail).not.toMatch(/writer|agent|worker|batched|compile/i);
  expect(step.diff).toHaveLength(1);
});
```

- [x] **Step 2: Add a failing terminal-copy test.** Assert the error result uses `Website belum selesai` or the approved equivalent and does not contain `build` in its user-facing sentence. Keep the retry meaning intact.

- [x] **Step 3: Add a failing progress-panel test.** Render `BuildProgressPanel` with three done steps and one active step using `renderToStaticMarkup`. Assert it contains `3 bagian sudah selesai`, `Website sedang dibuat`, and the active step label.

- [x] **Step 4: Add a failing fallback test.** Render the panel with no steps and `isBuilding=true`. Assert it contains `Menyiapkan website` and does not contain `Memulai build` or technical vocabulary.

- [x] **Step 5: Add a failing notice/control copy test.** Assert:

```ts
expect(markup).toContain("Mulai buat website");
expect(markup).toContain("Buat ulang website");
expect(markup).not.toContain("Mulai build");
```

Keep tests that assert actual current-step labels and file paths, because those prove real operation evidence remains visible.

- [x] **Step 6: Run the focused tests to verify RED.**

Run:

```bash
bunx vitest run \
  src/lib/projects/build-stream-event.test.ts \
  src/lib/projects/build-progress-steps.test.ts \
  src/components/projects/WorkspaceBuildProgress.test.ts \
  src/components/projects/WorkspacePrimitives.test.tsx \
  src/components/projects/BuildNotices.test.ts
```

Expected: the new copy assertions fail against the current technical/generic strings; existing progress-preservation tests pass.

- [x] **Step 7: Commit the red tests only.**

```bash
git add \
  src/lib/projects/build-stream-event.test.ts \
  src/lib/projects/build-progress-steps.test.ts \
  src/components/projects/WorkspaceBuildProgress.test.ts \
  src/components/projects/WorkspacePrimitives.test.tsx \
  src/components/projects/BuildNotices.test.ts
git commit -m "test(progress): define friendly live build feedback"
```

---

### Task 2: Replace server-emitted generation and edit copy

**Files:**
- Modify: `src/lib/projects/build-attempt-worker.ts`
- Modify: `src/lib/projects/batched-generator.ts`
- Modify: `src/lib/projects/edit-attempt-worker.ts`
- Modify: `src/lib/projects/project-job.ts`
- Modify: `src/lib/projects/build-stream-event.ts`
- Modify: `src/lib/projects/build-stream-event.test.ts`
- Modify: `src/lib/projects/batched-edit.test.ts` only for consumer-event assertions; keep internal phase assertions unchanged

**Interfaces:**
- Consumes existing `send("progress", ...)`, `onEvent("operation", ...)`, `publishBuildProgress`, and persisted project-job step objects.
- Produces the same `BuildStreamEvent` shape and same operation identity/path/diff payloads with friendlier `label` and `detail` strings.

- [x] **Step 1: Update initial generation phase copy at real boundaries.** Use this vocabulary in `build-attempt-worker.ts` and `project-job.ts` where the corresponding stage already exists:

| Existing purpose | Consumer-facing copy |
|---|---|
| start/brief preparation | `Menyiapkan website` / `Membaca kebutuhan usaha` |
| structure/topology | `Menyusun struktur halaman` |
| landing generation | `Membuat halaman utama` |
| file generation | `Menulis bagian website` or the existing `Menulis file` operation row |
| validation | `Memeriksa website` |
| successful finish | `Website siap dilihat` |
| interrupted/failed | `Website belum selesai` |
| stopped | `Pembuatan dihentikan` |

Do not change internal status values such as `building`, `repairing`, `writer`, or `compile_error`.

- [x] **Step 2: Update the per-file operation detail in generation and edit paths.** Replace strings such as `File ditulis writer batched.` with `Bagian website selesai ditulis.`. Preserve:

```ts
args.onEvent?.("operation", {
  detail: "Bagian website selesai ditulis.",
  path,
  state: "succeeded",
  title: "Menulis file",
  type: "write_file",
});
```

The path and diff remain unchanged.

- [x] **Step 3: Update edit/rebuild operation copy.** Replace `AI menerapkan revisi ke source website.` and `File ditulis writer batched.` with outcome-oriented Indonesian. Keep edit phases, durable operation rows, staged-file persistence, and failure behavior unchanged.

- [x] **Step 4: Update fallback/hydration copy.** Replace `Worker memvalidasi dan mengompilasi file website.`, `AI menulis source`, `Source disimpan`, and similar consumer-facing fallback strings in `project-job.ts`. Keep fallback steps derived from actual persisted state; do not insert additional synthetic rows.

- [x] **Step 5: Update reducer fallbacks.** In `build-stream-event.ts`, preserve `event.path`, `event.diff`, `durationMs`, `seq`, and statuses. Change only fallback labels/details and error copy to the approved friendly vocabulary.

- [x] **Step 6: Add parity assertions.** Verify both generation and edit operation events produce the same friendly detail and retain the same path/diff. Keep internal test assertions such as `phase === "writer"` because they are not consumer-facing.

- [x] **Step 7: Run focused tests to verify GREEN.**

Run:

```bash
bunx vitest run \
  src/lib/projects/build-stream-event.test.ts \
  src/lib/projects/build-progress-steps.test.ts \
  src/lib/projects/batched-generator.test.ts \
  src/lib/projects/batched-edit.test.ts \
  src/lib/projects/batched-generator.truncated-retry.test.ts
```

Expected: all focused tests pass, including per-file event and repair behavior.

- [x] **Step 8: Commit the producer/reducer copy change.**

```bash
git add \
  src/lib/projects/build-attempt-worker.ts \
  src/lib/projects/batched-generator.ts \
  src/lib/projects/edit-attempt-worker.ts \
  src/lib/projects/project-job.ts \
  src/lib/projects/build-stream-event.ts \
  src/lib/projects/build-stream-event.test.ts \
  src/lib/projects/batched-edit.test.ts
git commit -m "fix(progress): describe real website work to owners"
```

---

### Task 3: Add truthful momentum to the live panel

**Files:**
- Modify: `src/components/projects/WorkspaceBuildProgress.tsx`
- Create or modify: `src/components/projects/WorkspaceBuildProgress.test.ts`
- Modify: `src/components/projects/WorkspacePrimitives.tsx`
- Modify: `src/components/projects/WorkspacePrimitives.test.tsx`
- Modify: `src/lib/projects/build-progress-steps.test.ts` if the count helper is extracted

**Interfaces:**
- Consumes the existing `steps: BuildProgressStep[]`, `isBuilding`, `elapsedFrom`, and `currentStep` props.
- Produces the same components and event interactions, plus a derived completed-row count rendered only from actual `status === "done"` rows.

- [x] **Step 1: Add the completed-count assertion before implementation.** The panel test must pass steps such as:

```ts
const steps = [
  { label: "Menyiapkan website", detail: "", status: "done" as const },
  { label: "Menulis file", detail: "index.tsx", status: "done" as const },
  { label: "Menulis file", detail: "produk.tsx", status: "done" as const },
  { label: "Memeriksa website", detail: "", status: "active" as const },
];
```

Assert the panel says `3 bagian sudah selesai` and never renders a percentage or estimated remaining time.

- [x] **Step 2: Implement the derived count.** Compute:

```ts
const completedStepCount = steps.filter(
  (step) => (step.status ?? "active") === "done",
).length;
```

Render the count only while running and only when it is greater than zero. Do not count the fallback row because it is not a completed operation.

- [x] **Step 3: Replace the empty-state fallback.** Use:

```ts
{
  detail: "Setiap bagian akan muncul saat selesai.",
  label: "Menyiapkan website",
  status: "active" as const,
}
```

Keep the active pulse and 100ms timer behavior unchanged.

- [x] **Step 4: Update panel header copy.** Use `Website sedang dibuat` while active, `Riwayat pembuatan terakhir` while inactive, and `Website siap dilihat` for the successful terminal context where the existing component receives that state. Keep elapsed time and existing layout.

- [x] **Step 5: Update `ProcessingControl` copy.** Use `Membuat website` or the newest real step label during generation, and a plain detail such as `Website sedang disiapkan.` when no real step exists. Preserve `Hentikan`, the `Diskusi` behavior, and the newest path/detail when available.

- [x] **Step 6: Run component and progress tests.**

Run:

```bash
bunx vitest run \
  src/components/projects/WorkspaceBuildProgress.test.ts \
  src/components/projects/WorkspacePrimitives.test.tsx \
  src/lib/projects/build-progress-steps.test.ts
```

Expected: all rows, durations, active state, count, fallback, and controls pass.

- [x] **Step 7: Commit the live-panel change.**

```bash
git add \
  src/components/projects/WorkspaceBuildProgress.tsx \
  src/components/projects/WorkspaceBuildProgress.test.ts \
  src/components/projects/WorkspacePrimitives.tsx \
  src/components/projects/WorkspacePrimitives.test.tsx \
  src/lib/projects/build-progress-steps.test.ts
git commit -m "feat(progress): show truthful build momentum"
```

---

### Task 4: Clean buttons, notices, shell statuses, and recovery copy

**Files:**
- Modify: `src/components/projects/BuildNotices.tsx`
- Create: `src/components/projects/BuildNotices.test.ts`
- Modify: `src/components/projects/WorkspacePrimitives.tsx`
- Modify: `src/components/projects/WorkspacePrimitives.test.tsx`
- Modify: `src/components/projects/WorkspaceShell.tsx`
- Modify: any exact-string test identified by targeted search

**Interfaces:**
- Consumes existing callbacks and state props; no callback, route, API, or proof-gate changes.
- Produces friendlier Indonesian actions and states while preserving the same click handlers and disabled behavior.

- [x] **Step 1: Add exact copy assertions.** Cover these minimum strings:

| Surface | Expected copy |
|---|---|
| recommendation action | `Mulai buat website` |
| rebuild action | `Buat ulang website` |
| saved recommendation | `Rancangan website disimpan` |
| running header | `Website sedang dibuat` |
| completion | `Website siap dilihat` |
| failed/recovery | explains the last successful version is safe and offers retry without saying `build` unnecessarily |

Also assert the existing `Buka rancangan`, `Lihat website`, `Chat dengan AI`, and stop/retry callbacks remain rendered.

- [x] **Step 2: Update `BuildNotices.tsx`.** Replace user-facing `build` phrases with the approved outcome language. Do not rename component/function identifiers or internal props.

- [x] **Step 3: Update `WorkspacePrimitives.tsx`.** Replace the recommendation button and any visible completion phrase near the progress panel. Keep exact layout, button sizes, and handlers.

- [x] **Step 4: Update `WorkspaceShell.tsx`.** Change only visible fallback/error/status text such as `Build belum mulai`, `Build dihentikan`, `Koneksi build terputus`, and retry instructions. Do not modify state transitions, stream subscriptions, handoff validation, idempotency keys, or local-storage signatures.

- [x] **Step 5: Run component/shell tests.**

Run:

```bash
bunx vitest run \
  src/components/projects/BuildNotices.test.ts \
  src/components/projects/WorkspacePrimitives.test.tsx \
  src/components/projects/WorkspaceShell.test.tsx
```

Expected: copy assertions and existing build-card/proof behavior pass together.

- [x] **Step 6: Commit the user-action copy change.**

```bash
git add \
  src/components/projects/BuildNotices.tsx \
  src/components/projects/BuildNotices.test.ts \
  src/components/projects/WorkspacePrimitives.tsx \
  src/components/projects/WorkspacePrimitives.test.tsx \
  src/components/projects/WorkspaceShell.tsx \
  src/components/projects/WorkspaceShell.test.tsx
git commit -m "fix(progress): make build actions friendlier"
```

---

### Task 5: Run the forbidden-copy audit and final local verification

**Files:**
- Modify only files discovered by the focused consumer-copy audit.
- Test: all progress and notice tests from Tasks 1–4.

**Interfaces:**
- No new production interface. This task verifies that technical vocabulary remains internal and that generation/edit/rebuild copy is consistent.

- [x] **Step 1: Audit only consumer-facing surfaces.** Run:

```bash
rg -n -i "batch|batched|writer|agent|worker|compile|compilasi|source|mulai build|build ulang" \
  src/components/projects/WorkspaceBuildProgress.tsx \
  src/components/projects/WorkspacePrimitives.tsx \
  src/components/projects/BuildNotices.tsx \
  src/components/projects/WorkspaceShell.tsx \
  src/lib/projects/build-stream-event.ts \
  src/lib/projects/build-attempt-worker.ts \
  src/lib/projects/batched-generator.ts \
  src/lib/projects/edit-attempt-worker.ts \
  src/lib/projects/project-job.ts
```

Review each match manually. Internal identifiers/comments/test phase names may remain; consumer-visible strings must not.

- [x] **Step 2: Run the focused suite.**

```bash
bunx vitest run \
  src/lib/projects/build-stream-event.test.ts \
  src/lib/projects/build-progress-steps.test.ts \
  src/lib/projects/batched-generator.test.ts \
  src/lib/projects/batched-edit.test.ts \
  src/lib/projects/batched-generator.truncated-retry.test.ts \
  src/components/projects/WorkspaceBuildProgress.test.ts \
  src/components/projects/WorkspacePrimitives.test.tsx \
  src/components/projects/BuildNotices.test.ts \
  src/components/projects/WorkspaceShell.test.tsx
```

Expected: all tests pass with no changes to actual file/diff/retry behavior.

- [x] **Step 3: Run targeted formatting, lint, and typecheck.**

```bash
bunx prettier --check \
  src/components/projects/WorkspaceBuildProgress.tsx \
  src/components/projects/WorkspaceBuildProgress.test.ts \
  src/components/projects/WorkspacePrimitives.tsx \
  src/components/projects/WorkspacePrimitives.test.tsx \
  src/components/projects/BuildNotices.tsx \
  src/components/projects/BuildNotices.test.ts \
  src/components/projects/WorkspaceShell.tsx \
  src/lib/projects/build-stream-event.ts \
  src/lib/projects/build-stream-event.test.ts \
  src/lib/projects/build-attempt-worker.ts \
  src/lib/projects/batched-generator.ts \
  src/lib/projects/edit-attempt-worker.ts \
  src/lib/projects/project-job.ts
bunx eslint \
  src/components/projects/WorkspaceBuildProgress.tsx \
  src/components/projects/WorkspaceBuildProgress.test.ts \
  src/components/projects/WorkspacePrimitives.tsx \
  src/components/projects/WorkspacePrimitives.test.tsx \
  src/components/projects/BuildNotices.tsx \
  src/components/projects/BuildNotices.test.ts \
  src/components/projects/WorkspaceShell.tsx \
  src/lib/projects/build-stream-event.ts \
  src/lib/projects/build-stream-event.test.ts \
  src/lib/projects/build-attempt-worker.ts \
  src/lib/projects/batched-generator.ts \
  src/lib/projects/edit-attempt-worker.ts \
  src/lib/projects/project-job.ts
bun run typecheck
```

- [x] **Step 4: Run the repository gate.**

```bash
bun run check
```

Expected: format, lint, typecheck, changed tests, Knip, and docs all pass.

- [x] **Step 5: Inspect the final local diff.**

```bash
git status --short --untracked-files=all
git diff --stat HEAD~4..HEAD
git log --oneline --decorate -8
```

Confirm no screenshots, logs, secrets, generated artifacts, or unrelated peer-agent changes are included.

- [x] **Step 6: Commit any final focused correction separately.** If the audit finds a missed consumer-facing string, add a failing exact-string test, fix only that string, rerun the focused test and `bun run check`, then use:

```bash
git add <only-corrected-files>
git commit -m "fix(progress): remove technical build wording"
```

Do not run E2E or push in this pass.
