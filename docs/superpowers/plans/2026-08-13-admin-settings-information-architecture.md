# Admin Settings Information Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/admin/settings` expose only genuine boolean feature flags in its visible Feature flags section, move tuning controls into fitting advanced sections, and hardcode settled rollout/streaming behavior.

**Architecture:** Keep `APP_SETTINGS` as the single source of truth. Remove obsolete registry keys and replace their consumers with settled behavior or the canonical Composer image uploads key. Add one `generated_quality` category and percentage display metadata so the critic sample remains stored as `0..1` while admins edit `0..100%`.

**Tech Stack:** TypeScript, React 19, TanStack Start/Router, TanStack Query, Tailwind CSS, Vitest, Bun.

## Global Constraints

- Use Bun only.
- No new dependency.
- No `any`, `as any`, `ts-ignore`, or unnecessary comments.
- Moderation must remain fail-closed and complete before discuss output starts.
- Interactive apps remain on their existing implementation-spec path.
- User-facing copy is Indonesian; internal admin setting labels remain English.
- Each task follows RED → GREEN and ends in an atomic local commit.

---

## File Structure

- `src/lib/app-settings-registry.ts`: category order, display metadata, and canonical settings entries.
- `src/routes/api.admin.settings.ts`: serializes display metadata to the admin client.
- `src/routes/-_main.admin.settings.helpers.ts`: converts stored numeric values to and from admin display values.
- `src/routes/_main.admin.settings.tsx`: renders percentage-aware numeric controls.
- `src/lib/projects/build-attempt-worker.ts`: always evaluates eligible builds through the quality pipeline and reads the canonical image flag.
- `src/routes/api.projects.preview.ts`: always starts moderation concurrently with safe preparation.
- `src/lib/projects/discuss-turn-worker.ts`: always streams partial structured output.
- `src/lib/projects/discuss-tool.ts` and `src/lib/projects/brief-flow.ts`: read the canonical image flag.
- `DEV.md`: documents the final live settings behavior.

### Task 1: Reshape registry categories and percentage display

**Files:**
- Modify: `src/lib/app-settings-registry.test.ts`
- Modify: `src/routes/-_main.admin.settings.helpers.test.ts`
- Modify: `src/routes/-api.admin.settings.test.ts`
- Modify: `src/lib/app-settings-registry.ts`
- Modify: `src/routes/api.admin.settings.ts`
- Modify: `src/routes/-_main.admin.settings.helpers.ts`
- Modify: `src/routes/_main.admin.settings.tsx`

**Interfaces:**
- Produces: `SettingCategory` including `generated_quality`
- Produces: `ConfigEntry.display?: "percentage"`
- Produces: `toDisplayNumber(entry, value): number | ""`
- Produces: `fromDisplayNumber(entry, value): number | ""`

- [ ] **Step 1: Write failing registry and helper tests**

Assert:

```ts
expect(APP_SETTINGS.filter((entry) => entry.category === "feature_flag").every(
  (entry) => entry.type === "boolean" && entry.tier === "basic",
)).toBe(true);
expect(APP_SETTINGS.find((entry) => entry.key === "feature.thumbnail_capture_enabled")).toMatchObject({
  category: "feature_flag",
  tier: "basic",
});
expect(APP_SETTINGS.find((entry) => entry.key === "discuss.chat.auto_retry_attempts")).toMatchObject({
  category: "ai",
  tier: "advanced",
});
expect(APP_SETTINGS.find((entry) => entry.key === "quality.generated_site_critic_sample_rate")).toMatchObject({
  category: "generated_quality",
  display: "percentage",
  min: 0,
  max: 1,
});
expect(toDisplayNumber(percentageEntry, 0.1)).toBe(10);
expect(fromDisplayNumber(percentageEntry, 25)).toBe(0.25);
```

Update API validation expectations so critic sampling is accepted only with category `generated_quality`, while removed keys return `Invalid key`.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
bunx vitest run --project unit src/lib/app-settings-registry.test.ts src/routes/-_main.admin.settings.helpers.test.ts src/routes/-api.admin.settings.test.ts
```

Expected: FAIL because `generated_quality`, display metadata, and conversion helpers do not exist and obsolete keys remain.

- [ ] **Step 3: Implement registry and percentage presentation**

Add `generated_quality` before `ai` in advanced category order. Move critic sampling there with `display: "percentage"`; move discuss retry to `ai`; make thumbnail capture basic. Remove rollout, builder-photo, parallel-moderation, and partial-streaming entries.

Serialize `display` from the GET API. Extend `SettingEntry` with `display: "percentage" | null`. Convert percentage values at the input boundary only:

```ts
export function toDisplayNumber(entry: SettingEntry, value: unknown): number | "" {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return "";
  return entry.display === "percentage" ? numeric * 100 : numeric;
}

export function fromDisplayNumber(entry: SettingEntry, value: number | ""): number | "" {
  if (value === "") return "";
  return entry.display === "percentage" ? value / 100 : value;
}
```

Render `%` beside percentage controls and continue submitting fractions to the API.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the Step 2 command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/app-settings-registry.ts src/lib/app-settings-registry.test.ts src/routes/api.admin.settings.ts src/routes/-api.admin.settings.test.ts src/routes/_main.admin.settings.tsx src/routes/-_main.admin.settings.helpers.ts src/routes/-_main.admin.settings.helpers.test.ts
git commit -m "refactor(settings): clarify admin control groups"
```

### Task 2: Make generated-site quality the eligible default

**Files:**
- Modify: `src/lib/projects/build-attempt-worker.batched.test.ts`
- Modify: `src/lib/projects/build-attempt-worker.ts`
- Delete: `src/lib/projects/generated-site-rollout.ts`
- Delete: `src/lib/projects/generated-site-rollout.test.ts`

**Interfaces:**
- Consumes: accepted handoff and app kind from the existing build worker
- Produces: quality-path eligibility based only on accepted handoff plus `landing | marketing_site`

- [ ] **Step 1: Write a failing worker test**

Change the batched-path fixture so no rollout key is mocked. Assert a landing build with accepted handoff enters the quality path, while an interactive app stays on the implementation-spec path.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
bunx vitest run --project unit src/lib/projects/build-attempt-worker.batched.test.ts src/lib/projects/generated-site-rollout.test.ts
```

Expected: FAIL because the worker still reads the rollout setting.

- [ ] **Step 3: Remove rollout selection**

Delete the owner/admin/waitlist rollout lookup. Load the accepted handoff directly, then retain the existing app-kind eligibility condition. Remove the now-unused rollout module and imports.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the worker test plus its nearest generation tests. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/projects/build-attempt-worker.ts src/lib/projects/build-attempt-worker.batched.test.ts src/lib/projects/generated-site-rollout.ts src/lib/projects/generated-site-rollout.test.ts
git commit -m "refactor(generation): make quality pipeline standard"
```

### Task 3: Settle discuss moderation and streaming behavior

**Files:**
- Modify: `src/routes/-api.projects.preview.discuss.test.ts`
- Modify: `src/lib/projects/discuss-turn-worker.test.ts`
- Modify: `src/routes/api.projects.preview.ts`
- Modify: `src/lib/projects/discuss-turn-worker.ts`

**Interfaces:**
- Produces: moderation begins before safe request preparation and is awaited before `handleDiscussTurnOneCall`
- Produces: partial tool text/card deltas always publish when parsable

- [ ] **Step 1: Write failing behavior tests**

Assert the preview route starts moderation without consulting `discuss.parallel_moderation`, awaits its result, and does not start the discuss worker for denied requests. Assert partial tool JSON emits deltas without consulting `discuss.partial_tool_streaming`.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
bunx vitest run --project unit src/routes/-api.projects.preview.discuss.test.ts src/lib/projects/discuss-turn-worker.test.ts
```

Expected: FAIL because both production paths still read removed settings.

- [ ] **Step 3: Hardcode the approved behavior**

Always create the moderation promise for non-empty text, preserve the existing fail-closed await block, and remove the sequential branch. Remove the partial-stream setting lookup and always parse/publish best-effort tool deltas.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the Step 2 command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/api.projects.preview.ts src/routes/-api.projects.preview.discuss.test.ts src/lib/projects/discuss-turn-worker.ts src/lib/projects/discuss-turn-worker.test.ts
git commit -m "refactor(discuss): settle moderation and streaming defaults"
```

### Task 4: Unify photo behavior under Composer image uploads

**Files:**
- Modify: `src/lib/projects/discuss-tool.test.ts`
- Modify: `src/lib/projects/brief-flow.test.ts`
- Modify: `src/lib/projects/build-attempt-worker.batched.test.ts`
- Modify: `src/lib/projects/discuss-tool.ts`
- Modify: `src/lib/projects/brief-flow.ts`
- Modify: `src/lib/projects/build-attempt-worker.ts`
- Modify: `DEV.md`

**Interfaces:**
- Consumes: `feature.composer_uploads_enabled`
- Produces: one setting for upload UI/API, photo questions, image cards, and generated-site photo mode

- [ ] **Step 1: Write failing canonical-key tests**

Update mocks and assertions so photo-enabled paths request only `feature.composer_uploads_enabled`; fail the test if `feature.builder_photo_enabled` is requested.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
bunx vitest run --project unit src/lib/projects/discuss-tool.test.ts src/lib/projects/brief-flow.test.ts src/lib/projects/build-attempt-worker.batched.test.ts
```

Expected: FAIL because production consumers still read `feature.builder_photo_enabled`.

- [ ] **Step 3: Replace every builder-photo consumer and update docs**

Replace all `feature.builder_photo_enabled` reads with `feature.composer_uploads_enabled`. Update prompts and `DEV.md` so the canonical setting and settled generated-quality/discuss behavior are explicit. Remove stale rollout instructions.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the Step 2 command, then:

```bash
rg "builder_photo_enabled|generated_site_quality_rollout|discuss\.parallel_moderation|discuss\.partial_tool_streaming" src DEV.md
```

Expected: tests PASS; search returns no matches.

- [ ] **Step 5: Commit**

```bash
git add src/lib/projects/discuss-tool.ts src/lib/projects/discuss-tool.test.ts src/lib/projects/brief-flow.ts src/lib/projects/brief-flow.test.ts src/lib/projects/build-attempt-worker.ts src/lib/projects/build-attempt-worker.batched.test.ts DEV.md
git commit -m "refactor(images): unify composer photo control"
```

### Task 5: Verify the complete change

**Files:**
- Modify only if verification exposes a defect in touched behavior.

- [ ] **Step 1: Run the manual fast gate**

```bash
bun run check
```

Expected: format, lint, typecheck, affected tests, Knip, and docs all pass.

- [ ] **Step 2: Inspect repository state and commit any verification-only fix atomically**

```bash
git status --short --untracked-files=all
git log --oneline -8
```

Expected: no accidental artifacts or uncommitted changes. If a focused fix was required, rerun its failing check and commit only that fix with an appropriate Conventional Commit message.
