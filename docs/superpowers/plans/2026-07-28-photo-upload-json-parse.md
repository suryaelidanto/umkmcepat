# Photo Upload JSON-Parse Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the chat composer's image upload actually upload. Today the `POST /api/projects/$id/assets` handler is unrouted (parent file is a layout, not a leaf) and returns the SPA HTML, which the client tries to `JSON.parse`, throwing before the chat send runs.

**Architecture:** Move the existing `POST` handler to a new leaf route at `api.projects.$id.assets.upload.ts` (path `/api/projects/$id/assets/upload`). Convert the old `api.projects.$id.assets.ts` into an empty leaf stub so the router stops treating it as a layout. Update the single client call site in `WorkspaceShell.tsx` to the new path, plus a one-line content-type guard so a future regression of the same kind fails with the existing Indonesian toast instead of `SyntaxError`. Catch-all `api.projects.$id.assets.$.ts` (preview proxy GET) stays untouched.

**Tech Stack:** TanStack Router (file-based routes, server handlers), existing upload helpers in `src/lib/projects/project-asset-upload.ts` and `src/middleware/ownership.ts`. No new deps, no new env, no schema changes.

## Global Constraints

- User-facing product UI copy is Indonesian; developer docs/code/logs/errors English. No new copy in this plan; existing Indonesian strings stay verbatim.
- Surgical edits only: do not reformat, rename, or "improve" adjacent code. Do not touch `project-asset-upload.ts`, `runtime-proxy.ts`, `ComposerAttachments.tsx`, or the catch-all `api.projects.$id.assets.$.ts`.
- Atomic commits: one logical unit per commit. Order: server leaf first, client URL+guard second, stub-or-delete third.
- `bun run check` (format/lint/typecheck/`test:changed`/Knip) must pass at the end. Run once at the gate step.
- No tests added: the change is a route move + a URL + a content-type guard, all mechanical and self-evident per CLAUDE.md/PRINCIPLES. Verification is `bun run check` + the curl matrix in the spec + a manual browser send-with-image check.
- The empty leaf stub keeps a stable parent; do not delete the old `api.projects.$id.assets.ts` file outright — the spec calls for an explicit empty leaf.
- Trivial one-liner (`fetch` URL change + one `if` guard) needs no test harness.

---

## Task 1: Create the POST leaf route

**Files:**
- Create: `src/routes/api.projects.$id.assets.upload.ts`

**Interfaces:** None. Same POST contract the old file had — multipart form, fields `file` (File, required) + `purpose` (string from `{ business-image, logo, reference }`). Returns `Response.json(asset, { status: 201 })` on success, `Response.json({ message }, { status })` on validation failure with the same status codes (401, 404, 400, 413).

- [ ] **Step 1: Read the source of truth for the POST body**

Read `src/routes/api.projects.$id.assets.ts` in full (it is 86 lines). The `POST` handler is the entire `server.handlers` block (lines 18-83). Do not edit the file in this task — only read it. We are moving the body verbatim.

- [ ] **Step 2: Create the new file with the moved POST body**

Create `src/routes/api.projects.$id.assets.upload.ts` with content that is byte-for-byte the same as the current `api.projects.$id.assets.ts` POST handler, except:

- The `createFileRoute` path argument changes from `"/api/projects/$id/assets"` to `"/api/projects/$id/assets/upload"`.
- File-level comment at the top of the handler updates from "Upload one owner-scoped project asset" to the same sentence, no other text changes.

Concretely, the new file's structure is:

```ts
import { createFileRoute } from "@tanstack/react-router";

import { auth } from "@/lib/auth/auth";
import {
  isAllowedAssetPurpose,
  uploadProjectAsset,
} from "@/lib/projects/project-asset-upload";
import { mapToUserFacingError } from "@/lib/user-facing-error";
import { verifyProjectOwnership } from "@/middleware/ownership";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export const Route = createFileRoute("/api/projects/$id/assets/upload")({
  server: {
    handlers: {
      // Upload one owner-scoped project asset (business image / reference / logo).
      // Multipart form: field `file` (required), `purpose` (required, allowlisted).
      POST: async ({ request, params }) => {
        const session = await auth();
        if (!session?.user?.id) {
          return Response.json(
            { message: "Masuk dulu untuk melanjutkan." },
            { status: 401 },
          );
        }

        const { id } = params;
        const isOwner = await verifyProjectOwnership(id, session.user.id);
        if (!isOwner) {
          return Response.json(
            { message: "Proyek tidak ditemukan." },
            { status: 404 },
          );
        }

        const form = await request.formData().catch(() => null);
        if (!form) {
          return Response.json(
            { message: "Permintaan upload tidak valid." },
            { status: 400 },
          );
        }

        const purpose = String(form.get("purpose") ?? "").trim();
        if (!isAllowedAssetPurpose(purpose)) {
          return Response.json(
            {
              message: `Tujuan aset tidak valid. Gunakan salah satu: business-image, logo, reference.`,
            },
            { status: 400 },
          );
        }

        const file = form.get("file");
        if (!(file instanceof File)) {
          return Response.json(
            { message: "File belum dipilih." },
            { status: 400 },
          );
        }
        if (file.size > MAX_UPLOAD_BYTES) {
          return Response.json(
            { message: `Ukuran file melebihi ${MAX_UPLOAD_BYTES} byte.` },
            { status: 413 },
          );
        }

        const bytes = Buffer.from(await file.arrayBuffer());
        try {
          const asset = await uploadProjectAsset({
            bytes,
            projectId: id,
            purpose,
            userId: session.user.id,
          });
          return Response.json(asset, { status: 201 });
        } catch (error) {
          const message = mapToUserFacingError(
            error instanceof Error ? error.message : "",
          );
          return Response.json({ message }, { status: 400 });
        }
      },
    },
  },
});
```

That is the entire file. No other exports, no helper functions, no new comments beyond what was already in the old file's POST handler comment. Match the existing file's import order, formatting, and indentation (prettier defaults — `bun run check` will format-fix if needed).

- [ ] **Step 3: Verify the new file typechecks**

Run: `bun run check`
Expected: PASS. The new route is a leaf; `routeTree.gen.ts` will regen on the next `bun run verify`, but the typecheck pass only requires the import chain to resolve, which it does. If `routeTree.gen.ts` is stale, `tsc` will still typecheck the new file standalone.

- [ ] **Step 4: Commit**

```bash
git add src/routes/api.projects.$id.assets.upload.ts
git commit -m "feat(api): upload project asset on a leaf route

Move POST /api/projects/:id/assets to /api/projects/:id/assets/upload
so the handler dispatches. The bare assets path is a layout boundary
next to assets.$.ts, which swallowed the POST and let the dev server
fall back to the SPA index HTML."
```

---

## Task 2: Update the client URL + add the content-type guard

**Files:**
- Modify: `src/components/projects/WorkspaceShell.tsx` (lines ~1983 and ~1987-1990)

**Interfaces:** None. The upload `fetch` call's URL changes by one segment. The `await res.json()` call is wrapped in a content-type check that throws before `res.json()` if the body is not JSON.

- [ ] **Step 1: Read the exact call site**

Read `src/components/projects/WorkspaceShell.tsx` around lines 1980-2010. The relevant block (taken from the audited file):

```ts
for (const item of toUploadPlan(pendingAttachments)) {
  const form = new FormData();
  form.append("file", item.file);
  form.append("purpose", "business-image");
  const res = await fetch(`/api/projects/${projectId}/assets`, {
    body: form,
    method: "POST",
  });
  if (!res.ok) {
    throw new Error(`Gagal mengunggah ${item.file.name}`);
  }
  const asset = (await res.json()) as {
    id: string;
    publicUrl: string | null;
  };
```

Confirm the file has not drifted. If the surrounding context has changed (variable names, comment wording), match what's there; do not refactor.

- [ ] **Step 2: Update the URL string**

Change the `fetch` URL on line 1983 (or the equivalent in the current file):

From:
```ts
const res = await fetch(`/api/projects/${projectId}/assets`, {
```

To:
```ts
const res = await fetch(`/api/projects/${projectId}/assets/upload`, {
```

One string. Nothing else changes about the call shape.

- [ ] **Step 3: Add the content-type guard before `res.json()`**

The current code (after Step 2):
```ts
if (!res.ok) {
  throw new Error(`Gagal mengunggah ${item.file.name}`);
}
const asset = (await res.json()) as {
  id: string;
  publicUrl: string | null;
};
```

Add a content-type check between the `!res.ok` guard and the `await res.json()` call. The guard fails with the same Indonesian message the `!res.ok` path already uses, so the toast UX is identical to a real 5xx:

```ts
if (!res.ok) {
  throw new Error(`Gagal mengunggah ${item.file.name}`);
}
const contentType = res.headers.get("content-type") ?? "";
if (!contentType.toLowerCase().includes("application/json")) {
  throw new Error(`Gagal mengunggah ${item.file.name}`);
}
const asset = (await res.json()) as {
  id: string;
  publicUrl: string | null;
};
```

Two new lines (the `const contentType` and the `if`). No new error string, no new toast — the existing `catch (error) { toast.error(error instanceof Error ? error.message : "Gagal mengunggah gambar.") }` already handles it. The guard's only job is to translate "the server returned HTML" into a real error before `JSON.parse` blows up.

- [ ] **Step 4: Verify**

Run: `bun run check`
Expected: PASS. No type signatures changed; the `if` is a guard, not a control-flow refactor.

- [ ] **Step 5: Commit**

```bash
git add src/components/projects/WorkspaceShell.tsx
git commit -m "fix(workspace): upload to /assets/upload leaf + content-type guard

Point the client at the new leaf route and translate a non-JSON
response into the existing Indonesian error toast before res.json()
runs, so a future regression surfaces as a real error instead of
'Unexpected token <'."
```

---

## Task 3: Convert the old parent to an empty leaf stub

**Files:**
- Modify: `src/routes/api.projects.$id.assets.ts` — replace the entire file body with an empty `Route` definition.
- Verify: `src/routes/api.projects.$id.assets.$.ts` (catch-all) is unchanged.

**Interfaces:** None. The old file currently exports `Route` with a `server.handlers.POST`. We are removing that export entirely and replacing it with a leaf stub. No other file imports from this route — confirmed via grep (`grep -rln "from.*api.projects.\\\$id.assets" src/` returns no importers, only the routeTree).

- [ ] **Step 1: Confirm no other file imports from the old route**

Run: `grep -rn "from.*['\"]@/routes/api\.projects\.\$id\.assets['\"]" /mnt/data/code/side/umkmcepat/src`
Expected: empty. The old file is only consumed by `routeTree.gen.ts`. If any test or helper imports from it, stop and surface that as a finding before continuing — the spec assumes the route is a self-contained handler.

- [ ] **Step 2: Replace the file with an empty leaf stub**

The current `api.projects.$id.assets.ts` is 86 lines (POST handler + imports). Replace its full contents with the following 3 lines:

```ts
import { createFileRoute } from "@tanstack/react-router";

// Empty leaf so /api/projects/$id/assets is no longer a layout boundary
// for the splat sibling. The real handler lives at /assets/upload.
export const Route = createFileRoute("/api/projects/$id/assets")({});
```

The comment is the only English in the file — it explains the "why" for the next capable agent (per CLAUDE.md "self-explanatory code, no comment noise" rule: this comment is the non-obvious why, since an empty file looks like a mistake to a future reader). The two import + comment lines + the empty route are the entire file.

- [ ] **Step 3: Verify the catch-all is unchanged**

Run: `git diff --stat src/routes/api.projects.$id.assets.\$.ts`
Expected: empty output. If anything changed, revert (we should not have touched this file in this task).

- [ ] **Step 4: Verify routeTree regenerates cleanly**

Run: `bun run verify` (this is the only task that needs the route tree regen, since the route file's identity has changed).

Expected: PASS. `routeTree.gen.ts` regenerates with the new `ApiProjectsIdAssetsUpload` import + the empty `ApiProjectsIdAssets` leaf + the unchanged `ApiProjectsIdAssetsSplat` catch-all.

If the regen fails because the empty leaf is rejected by the router codegen, fall back to deleting the file entirely (`git rm src/routes/api.projects.$id.assets.ts`) and re-run `bun run verify`. The router will synthesize a virtual layout for the splat child. Update this task's step 2 commit message to reflect the deletion (see fallback commit below). The spec's "alternative considered and rejected" note covers why we prefer the stub, but functional correctness is what matters.

- [ ] **Step 5: Commit (stub path)**

```bash
git add src/routes/api.projects.$id.assets.ts src/routeTree.gen.ts
git commit -m "refactor(api): turn assets parent into empty leaf stub

Stop /api/projects/:id/assets from acting as a layout for the splat
sibling. The real upload POST now lives at /assets/upload (the leaf);
this file is a no-op placeholder so the router has a stable parent."
```

Fallback (deletion path) commit if Step 4 codegen rejects the empty leaf:

```bash
git rm src/routes/api.projects.$id.assets.ts
git add src/routeTree.gen.ts
git commit -m "refactor(api): drop unused assets parent file

The layout vs leaf trap is fixed by the new /assets/upload POST route;
this empty parent is no longer needed."
```

---

## Task 4: Live verification — curl matrix + manual send

**Files:** None modified — verification only.

- [ ] **Step 1: Run the local gate**

Run: `bun run check`
Expected: PASS (format/lint/typecheck/`test:changed`/Knip all green). If anything fails, fix only the failing item — do not reformat unrelated files.

- [ ] **Step 2: Verify the new route responds to POST**

With `bun run dev` running and a project + user available, run:

```bash
# Get a real projectId owned by the signed-in user (one-liner via prisma).
PROJECT_ID=$(bunx --bun prisma db execute --stdin <<<'SELECT id FROM "Project" LIMIT 1' 2>/dev/null | tail -1)
# Or from the running dev server's network panel after a manual send.
```

Then with a real session cookie (sign in once, copy the cookie):

```bash
curl -i -X POST \
  -b "cookie.txt" \
  -F "purpose=business-image" \
  -F "file=@/some/test.jpg" \
  http://localhost:3000/api/projects/$PROJECT_ID/assets/upload
```

Expected:
- `HTTP/1.1 201`
- `content-type: application/json`
- Body: `{"id":"...","ref":"...","publicUrl":"...","contentType":"image/jpeg","sizeBytes":N,"url":"/api/projects/.../assets/<id>"}`

If you do not have a real project / session at hand, fall back to the unauthenticated matrix in Step 3 (which exercises the same code path through the 401/400 branches).

- [ ] **Step 3: Verify error responses are JSON**

Without auth (drop the cookie):

```bash
curl -i -X POST -F "purpose=business-image" -F "file=@/etc/hostname" \
  http://localhost:3000/api/projects/foo/assets/upload
```

Expected:
- `HTTP/1.1 401`
- `content-type: application/json`
- Body: `{"message":"Masuk dulu untuk melanjutkan."}`

```bash
curl -i -X POST -b "cookie.txt" \
  -F "purpose=bogus" -F "file=@/etc/hostname" \
  http://localhost:3000/api/projects/$PROJECT_ID/assets/upload
```

Expected: `400 application/json` with `{"message":"Tujuan aset tidak valid. ..."}`

- [ ] **Step 4: Verify the old path is now harmless**

```bash
curl -i -X POST -F "purpose=business-image" -F "file=@/etc/hostname" \
  http://localhost:3000/api/projects/foo/assets
```

Expected: `HTTP/1.1 200` with `content-type: text/html` (the SPA fallback). This is unchanged behavior — the layout path still returns the index HTML on POST. The client no longer uses this path, so it does not matter. Acceptable; do not block on this.

- [ ] **Step 5: Manual browser check**

With `bun run dev` running and signed in:

1. Open a project workspace.
2. Click the paperclip in the chat composer; pick a JPEG under 5 MiB.
3. Type a message ("tolong tambahkan ini ke hero") and hit send.
4. Confirm in the browser devtools network panel: one `POST /api/projects/<id>/assets/upload` returns `201 application/json`.
5. Confirm in the chat: no red toast appears; the AI reply contains a real image render (not a `[Image #1]` token).
6. Click the paperclip, pick a 6 MiB JPEG, send. Confirm the Indonesian `413` toast and that the file remains in the pending list (existing UX, not regressed).

If the `[Image #1]` token still appears in the AI reply, the model is hallucinating despite the file part arriving — that is a model-prompt concern, not a route concern. Surface it; do not block this fix on it.

- [ ] **Step 6: Confirm clean git state**

Run: `git status`
Expected: clean working tree. Three commits on `dev`:
1. `feat(api): upload project asset on a leaf route` (Task 1)
2. `fix(workspace): upload to /assets/upload leaf + content-type guard` (Task 2)
3. `refactor(api): turn assets parent into empty leaf stub` (Task 3) — or the deletion fallback

---

## Self-review

**Spec coverage:**
- "Server: move the POST handler into a new leaf file" → Task 1 (creates the new file) + Task 3 (converts the old parent to a stub).
- "Client: update the single upload call site" → Task 2 (URL + content-type guard).
- "Catch-all api.projects.$id.assets.$.ts stays untouched" → Task 3 Step 3 explicitly verifies.
- "Out of scope: ComposerAttachments, project-asset-upload, runtime-proxy, FileUpload.stories" → not touched in any task.
- "Done means" curl matrix → Task 4 Steps 2-4.
- "Done means" browser send-with-image check → Task 4 Step 5.
- "bun run check" gate → Task 4 Step 1.

**Placeholder scan:** No "TBD"/"TODO"/"add appropriate"/"similar to Task N". Every step has the exact code or exact command. Task 3 Step 4 has a documented fallback (delete instead of stub) for the unlikely codegen rejection — both paths are committed here.

**Type consistency:** No new types, no signature changes, no new exports from any module. The new route file imports the same modules the old one did. The client change is one string + one `if` — no types touched.

**Atomicity:** Three commits, each independently revertable. If the empty-leaf stub path is rejected by the router codegen, the fallback commit message is pre-written.
