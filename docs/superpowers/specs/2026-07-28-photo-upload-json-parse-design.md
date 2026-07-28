# Photo Upload JSON-Parse Fix

## Problem

Uploading a business image in the chat composer and sending a message fails: the file is dropped on the floor, the user sees a red toast `Unexpected token '<', "<!DOCTYPE "... is not valid JSON`, and the assistant's reply contains a placeholder token like `[Image #1]` that refers to nothing.

The root cause is a route-registration trap, not the upload logic.

## Root cause

`src/routes/api.projects.$id.assets.ts` defines a `POST` handler for the bare path `/api/projects/$id/assets` (upload an asset) and is a sibling of `src/routes/api.projects.$id.assets.$.ts` (catch-all GET for the proxy/preview). When TanStack Router sees a `parent.ts` next to a `parent.$.ts`, the parent becomes a **layout** for the child. The bare parent URL is a layout boundary, not a leaf — POST handlers on a layout file are not dispatched on the layout's own path.

In dev, the unrouted POST falls through to the SPA fallback (`__root.tsx`) and returns the index HTML (`200 text/html`). The client then does `await res.json()` on that HTML, which throws. The throw aborts the submit before `sendMessage` runs, so the model never sees the file and the AI emits `[Image #1]` as a hallucinated placeholder.

**Repro (live):**

```
$ curl -i -X POST -F "purpose=business-image" -F "file=@/etc/hostname" \
    http://localhost:3000/api/projects/foo/assets
HTTP/1.1 200
content-type: text/html; charset=utf-8
<!DOCTYPE html>...
```

GET to the catch-all (`/api/projects/foo/assets/foo.png`) correctly returns `401` unauth — the proxy is fine; only the upload POST is unrouted.

**Where this surfaces in the UI:** `src/components/projects/WorkspaceShell.tsx:1971-2019`. The `await res.json()` call after the upload fetch is the line that throws, killing the submit before `sendMessage` is reached.

**Why we move the route, not the file name:** the parent file `api.projects.$id.assets.ts` is currently the layout, the child splat file is `api.projects.$id.assets.$.ts`. We need a leaf sibling of the splat. Renaming the parent to `api.projects.$id.assets.upload.ts` gives a leaf at path `/api/projects/$id/assets/upload` — POST lives on a leaf, the catch-all stays untouched.

## Fix

**Server:** move the POST handler into a new leaf file.

- New file: `src/routes/api.projects.$id.assets.upload.ts`
  - Path: `/api/projects/$id/assets/upload`
  - Exports the same `Route = createFileRoute("/api/projects/$id/assets/upload")({ server: { handlers: { POST: ... } } })`.
  - POST body is byte-for-byte the same as today's `api.projects.$id.assets.ts` POST: `auth()` → `verifyProjectOwnership` → `request.formData()` → purpose allowlist → file presence + size cap (5 MiB) → `uploadProjectAsset` → `Response.json(asset, { status: 201 })` on success or `Response.json({ message }, { status })` on validation failure. No new error strings, no new status codes.

- Convert: `src/routes/api.projects.$id.assets.ts` → `src/routes/api.projects.$id.assets.index.ts` (leaf with no handlers). This file is what `routeTree.gen.ts` would otherwise generate automatically. Explicit empty leaf prevents the router from treating the path as a layout in case the codegen is re-run. Empty stub: `export const Route = createFileRoute("/api/projects/$id/assets")({});`.

  Alternative considered and rejected: just delete `api.projects.$id.assets.ts` and let the router use a virtual layout. Keeping an explicit empty leaf is safer — codegen is stable, and any future route at this exact path is one well-known file. Cost: one trivial 1-line file.

- Keep: `src/routes/api.projects.$id.assets.$.ts` unchanged. It is already a leaf (catch-all) and serves `GET /api/projects/$id/assets/<path>` for the proxy. No risk of recursion — its path is strictly more specific than `/assets/upload`.

**Client:** update the single upload call site to hit the new leaf.

- `src/components/projects/WorkspaceShell.tsx:1983` — change `fetch(\`/api/projects/${projectId}/assets\`, ...)` to `fetch(\`/api/projects/${projectId}/assets/upload\`, ...)`. One URL string. No new headers, no new body shape, no new error handling needed (the existing `!res.ok` + try/catch + `toast.error` stays).

**Client-side safety net:** a single-line content-type guard so the next regression of this kind fails with a real toast (`"Gagal mengunggah <name>."`) instead of a `SyntaxError`. After the fetch, before `res.json()`:

```ts
const contentType = res.headers.get("content-type") ?? "";
if (!contentType.toLowerCase().includes("application/json")) {
  throw new Error(`Gagal mengunggah ${item.file.name}`);
}
```

This makes the failure mode self-explanatory: the user sees the same Indonesian toast they'd see for a real 5xx, and the error makes it into the request log. A future regression that returns HTML/empty body is now caught the same way a 500 is, not as a JSON parse error.

**Out of scope (deliberately not touched):**

- `src/components/projects/ComposerAttachments.tsx` — the picker, drag-drop, and `MAX_COMPOSER_IMAGES = 6` cap are correct; the failure happens after the user hits send.
- `src/lib/projects/composer-attachments.ts` — pure helpers, no fetch.
- `src/lib/projects/project-asset-upload.ts` — server-side writer; verified clean.
- `src/lib/projects/runtime-proxy.ts:202` — the proxy string `/api/projects/${id}/assets/${path}` is the GET catch-all path, not the upload POST; no change.
- `src/stories/FileUpload.stories.tsx:24` — Storybook demo string `/api/projects/demo/assets`. This is a mock endpoint, never called for real. Will continue to "fail" in Storybook (which is fine — the story simulates a UI, not a real upload). Leaving as-is to avoid touching Storybook for a non-bug. If the story needs to keep working, it can be updated in a follow-up — not blocking this fix.
- AI model — the `[Image #1]` text is an assistant-side hallucination when no file part arrives. It is a *symptom*, not a bug. Once the upload actually works, the model sees the file part and stops emitting the placeholder.
- Route tree regeneration — `bun run verify` already regenerates `routeTree.gen.ts`; nothing manual to do.

## Files touched

- **New:** `src/routes/api.projects.$id.assets.upload.ts` (POST leaf, ~85 lines, same body as today's `api.projects.$id.assets.ts` POST)
- **Modify:** `src/routes/api.projects.$id.assets.ts` — convert to leaf stub (or delete; pick stub, see "Convert" above)
- **Modify:** `src/components/projects/WorkspaceShell.tsx:1983` (one URL string) and `:1987-1990` (one content-type guard before `res.json()`)

Three files. One of them is a rename + body copy. No schema/data/env/Storybook/design changes. No new error strings, no new dependencies, no new colors.

## Done means

- `bun run check` (format/lint/typecheck/`test:changed`/Knip) is green.
- A live `curl -i -X POST -F "purpose=business-image" -F "file=@/some.jpg" /api/projects/<owned-id>/assets/upload` against the dev server returns `201 application/json` with `{ id, publicUrl, ref, contentType, sizeBytes, url }` for an authenticated owner of that project.
- A live `curl -i -X POST .../assets/upload` with an unauthenticated request returns `401 application/json` with `{ message: "Masuk dulu untuk melanjutkan." }` (same response shape as the current 401 path).
- A live `curl -i -X POST .../assets/upload` with a `purpose` not in `{ business-image, logo, reference }` returns `400 application/json` with `{ message: "Tujuan aset tidak valid. ..." }`.
- `curl -i -X POST .../assets` (the old path) returns the SPA HTML (status 200) — the layout behavior is unchanged, just no longer the path the client uses. Acceptable; do not block on this.
- In the browser, after the fix lands: pick a JPEG in the chat composer, type a message, hit send. The image is uploaded (visible in `bun run dev` request log as a `POST /api/projects/<id>/assets/upload` 201), the message goes through with a `files` part, the AI reply contains a real `<img>` rendering, and the red JSON-parse toast does not appear.
- For a 3 MiB JPEG (under the 5 MiB cap): upload + send round-trip succeeds end to end.
- For a 6 MiB JPEG (over the cap): server returns `413 application/json`, client `toast.error` shows `Ukuran file melebihi 5242880 byte.`, the file stays in the pending-attachments list so the user can retry (existing behavior, not regressed).

## Verification

- Manual: run `bun run dev`, log in, open a project, attach an image, type, send. Confirm image renders in the AI reply. Confirm toast does not appear.
- Manual: repeat with a 6 MiB image and confirm the 413 toast.
- Automated: `bun run check` is the local gate; CI runs `bun run verify` (regen routeTree + format/lint/typecheck/full tests/Knip). No new tests required — the change is a route move + one URL + one content-type guard, all mechanical and self-evident. The end-to-end happy path is covered by the manual browser check; the failure paths are covered by the existing `api.projects.$id.assets.upload` server code (the same code that used to live at the broken path).
- Adversarial check (one-liner, not a test): from the browser devtools network panel, post a malformed multipart to `/api/projects/<id>/assets/upload` and confirm the response is JSON `{ message: "..." }` with a `4xx` status, not HTML.

## Notes for the implementer

- Atomic commits: one commit for the new POST route file, one for the client URL+guard change, one for the empty leaf stub. Three commits max.
- The empty leaf stub's path is `/api/projects/$id/assets`. If the codegen later treats it as a layout (parent of the splat), it remains a no-op; if codegen changes to ignore empty parents, the stub is the right shape. Either way, behavior is correct.
- Do not touch `src/lib/projects/project-asset-upload.ts` or the catch-all `api.projects.$id.assets.$.ts`. The bug is in the parent file, not the writer.
- Do not change the `401` / `413` / `400` response shapes. Existing user-facing strings in Indonesian stay verbatim.
- Surgical edits only: do not reformat adjacent code, do not rename exports, do not "improve" the catch block. The `ponytail:` ceiling on this fix is: "If the server ever starts returning non-JSON again, the client says so in Indonesian." The current ceiling already covers that with the content-type guard. No abstraction needed.
