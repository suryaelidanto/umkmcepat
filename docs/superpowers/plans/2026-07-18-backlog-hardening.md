# Backlog Hardening & Core Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement critical reliability upgrades, fix the profile picture update system, enable actual R2 uploads, unify data-fetching invalidation via mutations, create a lightweight git-less progress diff viewer, prevent build lockouts with cancel/auto-unlock features, build a robust hybrid auto-scroll component, and enforce error billing safety.

**Architecture:** Use pure-JS diff algorithms and node runtime bindings (no third-party npm deps), utilize transaction safety with `try...finally` blocks for tokens accounting, implement explicit Route action controllers for cancellation, and utilize React lifecycle state/DOM threshold variables for smooth scrolling.

**Tech Stack:** React 19, Next.js / TanStack Start, Prisma Client, Tailwind CSS, AWS SDK (S3 client API for R2), Vitest.

## Global Constraints
- Commit is me: git author configuration MUST be set to `suryaelidanto <suryaelidanto@gmail.com>` for every workspace commit.
- Keep all developer-facing code and comments in English.
- Avoid introducing any new npm packages for diffing, cancellation, or scroll logic. Use standard browser/runtime capabilities.
- Keep user-facing copy in plain Indonesian.

---

### Task 1: Fix Profile Avatar JWT and Hybrid R2 Storage

**Files:**
- Modify: `src/lib/profile.ts`
- Modify: `src/lib/object-storage.ts`
- Modify: `src/lib/auth-config.ts`
- Test: `tests/lib/profile.test.ts` (Create if missing)

**Interfaces:**
- Consumes: `OBJECT_STORAGE_PROVIDER` from env.
- Produces: `replaceStoredObject` and `toPublicProfileImage` handling both AWS S3/R2 signatures and `/api/profile/avatar` paths without returning empty strings.

- [ ] **Step 1: Write a test verifying that `toPublicProfileImage` handles `/api/profile/avatar` path**
Add test in `src/lib/profile.test.ts`:
```ts
import { expect, test } from "vitest";
import { toPublicProfileImage } from "./profile";

test("toPublicProfileImage parses avatar path correctly", () => {
  expect(toPublicProfileImage("/api/profile/avatar")).toBe("/api/profile/avatar");
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `bun test src/lib/profile.test.ts`
Expected: FAIL or verify matches correctly.

- [ ] **Step 3: Modify `src/lib/profile.ts` to allow `/api/profile/avatar` to pass through**
Change `toPublicProfileImage` to:
```ts
export function toPublicProfileImage(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }
  const image = value.trim();
  if (!image) {
    return "";
  }
  if (PROFILE_IMAGE_DATA_URL_PATTERN.test(image) || isObjectStorageRef(image)) {
    return "/api/profile/avatar";
  }
  if (image.startsWith("https://") || image === "/api/profile/avatar") {
    return image;
  }
  return "";
}
```

- [ ] **Step 4: Implement R2 storage client in `src/lib/object-storage.ts` using `@aws-sdk/client-s3` (already available via prisma/other plugins or standard HTTP calls)**
If `@aws-sdk/client-s3` is not imported, use raw S3 HTTP REST API using standard Fetch to keep it package-free, or check if it's already installed. Let's write S3 client configuration for R2:
```ts
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

function getR2Client() {
  return new S3Client({
    region: "auto",
    endpoint: `https://${getEnv("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: getEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: getEnv("R2_SECRET_ACCESS_KEY"),
    },
  });
}
```
Update `putStoredObject` in `src/lib/object-storage.ts` to perform actual R2 put operations when provider is `"r2"`.

- [ ] **Step 5: Run tests and commit**
Run: `bun run check`
Expected: PASS
Commit:
```bash
git add src/lib/profile.ts src/lib/object-storage.ts
git commit -m "fix(profile): enable hybrid r2 storage & preserve avatar route in jwt"
```

---

### Task 2: Refactor Mutations to useCacheMutation

**Files:**
- Modify: `src/components/profile/ProfileNameForm.tsx`
- Modify: `src/components/projects/ProjectList.tsx`
- Modify: `src/components/projects/HomePromptForm.tsx`

**Interfaces:**
- Consumes: `useCacheMutation` from `@/lib/query-client`.

- [ ] **Step 1: Modify `ProfileNameForm.tsx` to use `useCacheMutation`**
Refactor the profile update mutation to hook into `useCacheMutation` for invalidating session queries and showing consistent toasts.

- [ ] **Step 2: Modify `ProjectList.tsx` to handle Project deletion invalidations**
Use `useCacheMutation` to ensure that deleting a project automatically updates the home page limits and project grid without requiring manual refreshes.

- [ ] **Step 3: Run check suite to verify it works**
Run: `bun run check`
Expected: PASS
Commit:
```bash
git add src/components/profile/ProfileNameForm.tsx src/components/projects/ProjectList.tsx
git commit -m "refactor(mutations): use useCacheMutation for consistent cache updates"
```

---

### Task 3: Progressive Diff Generation and Integration

**Files:**
- Create: `src/lib/projects/diff.ts`
- Modify: `src/lib/projects/agent-tool-runner.ts`
- Modify: `src/components/projects/WorkspacePrimitives.tsx`
- Test: `src/lib/projects/diff.test.ts`

- [ ] **Step 1: Create a lightweight line-by-line diff engine in `src/lib/projects/diff.ts`**
Write a simple function:
```ts
export type DiffLine = { type: "add" | "delete" | "normal"; text: string };

export function generateDiff(oldStr: string, newStr: string): DiffLine[] {
  const oldLines = oldStr.split("\n");
  const newLines = newStr.split("\n");
  // Simple diff generator logic comparing line addition and deletions
  // ...
}
```

- [ ] **Step 2: Add unit tests for `diff.ts`**
Write unit test cases verifying output formats.

- [ ] **Step 3: Modify `agent-tool-runner.ts` to log file diffs**
In the edit loop, when a file is edited/written, calculate the line-by-line diff and append it to the `build.progress` event metadata in the database.

- [ ] **Step 4: Update `BuildProgressPanel` in `WorkspacePrimitives.tsx` to render the diff dropdown**
Create an Accordion/FAQ style toggle inside the steps. If `step.metadata.diff` exists, render green (added) and red (removed) lines inside the expandable dropdown.

- [ ] **Step 5: Run verify and commit**
Run: `bun run check`
Expected: PASS
Commit:
```bash
git add src/lib/projects/diff.ts src/lib/projects/agent-tool-runner.ts src/components/projects/WorkspacePrimitives.tsx
git commit -m "feat(diff): generate and display code progression diffs inline"
```

---

### Task 4: Stale Build Auto-Unlock and Cancel API

**Files:**
- Create: `src/routes/api.projects.$id.cancel.ts`
- Modify: `src/routes/api.projects.preview.ts` (discussion endpoint)
- Modify: `src/components/projects/WorkspacePrimitives.tsx` (TopBar buttons)

- [ ] **Step 1: Create the POST route `/api/projects/$id/cancel`**
Handle cancellation requests by locating running builds/edit attempts and forcing them to `"failed"` / `"canceled"`, then calling `finalizeProjectOperation` to release the locked lease token.

- [ ] **Step 2: Implement Auto-unlock Middleware check**
In `src/routes/api.projects.preview.ts`, check if a lease token was claimed more than 3 minutes ago without any update. If so, automatically prune the lease and set project status back to `"ready"`.

- [ ] **Step 3: Add "Hentikan Build" cancellation button in `WorkspaceTopBar`**
Expose a button that sends a POST to `/api/projects/$id/cancel` when build state is active.

- [ ] **Step 4: Run verify and commit**
Run: `bun run check`
Expected: PASS
Commit:
```bash
git add src/routes/api.projects.$id.cancel.ts src/routes/api.projects.preview.ts src/components/projects/WorkspacePrimitives.tsx
git commit -m "feat(lock): cancel stuck builds and prune stale leases automatically"
```

---

### Task 5: Try-Finally Billing and Request-Level Moderation

**Files:**
- Modify: `src/routes/api.projects.$id.edit.ts`
- Modify: `src/routes/api.projects.preview.ts`

- [ ] **Step 1: Wrap edit operations with try-finally for energy debiting**
Ensure `chargeEnergyForAiUsage` runs inside the `finally` block in `edit.ts` to charge users under all conditions.

- [ ] **Step 2: Add request-level moderation in Preview/Discuss route**
Intersect all incoming preview chats with `moderateProjectRequest` first. If blocked, return safety warning directly and debit the moderation credits.

- [ ] **Step 3: Run verify and commit**
Run: `bun run check`
Expected: PASS
Commit:
```bash
git add src/routes/api.projects.$id.edit.ts src/routes/api.projects.preview.ts
git commit -m "security(billing): try-finally energy debiting and preview moderation gate"
```

---

### Task 6: Scroll Progress and Web Preview Error Page Fix

**Files:**
- Modify: `src/components/projects/WorkspacePrimitives.tsx`
- Modify: `src/routes/p.$slug.$.ts`

- [ ] **Step 1: Implement hybrid sticky scroll in `BuildProgressPanel`**
Add scrolling height check. If user scroll position is within `20px` of container bottom, trigger a smooth scroll to bottom when new steps arrive. If they scroll up, suspend auto-scroll.

- [ ] **Step 2: Implement HTML error panel fallback on failed previews**
Update `/p/$slug` and `/api/projects/$id/preview` routes so that on 503 or missing build outputs, they return a clean HTML error frame containing a detailed Indonesian description instead of a blank page or raw JSON.

- [ ] **Step 3: Run verify and commit**
Run: `bun run check`
Expected: PASS
Commit:
```bash
git add src/components/projects/WorkspacePrimitives.tsx src/routes/p.$slug.$.ts
git commit -m "fix(preview): sticky auto-scroll and render HTML panel on failed builds"
```
