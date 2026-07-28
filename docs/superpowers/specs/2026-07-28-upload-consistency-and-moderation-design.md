# Upload Consistency + Project-Create Moderation Fix

## Problem

Three separate upload flows in the app behave inconsistently and have real bugs:

1. **Home create-project (`HomePromptForm.tsx`)** uploads images AFTER the project exists, AFTER text-only moderation has already run. The image is never moderated. The flow also runs `String.fromCharCode(...bytes)` on a 5 MiB buffer which crashes (already fixed by `50d2c22`) and `TextDecoder("latin1")` which fails on Windows-1252 mapped bytes (already fixed by `50d2c22`). Short prompts ("aaaa") are not blocked and trigger the 30-min moderation CLARIFY cache, blocking the user for half an hour.

2. **Workspace composer (`WorkspaceShell.tsx`)** uploads images with the same client-side encoding (now fixed) but no moderation at all on the image. Text in chat turns is not moderated (intentional — chat model is the user's choice and IS the moderation layer for text).

3. **Support ticket thread (`/admin/tickets/:id`, `/support/:id`)** has a hard S3-key mismatch: upload writes `support/assets/${assetId}.${ext}` to S3 but GET reads `support/assets/${assetId}` without extension. The image is always 404. The endpoint also uses the client-supplied MIME for `Content-Type` (the client can lie) and accepts GIF which the rest of the app does not.

Result: a user who attaches an image on the home page is gated by text-only moderation, the image slips through ungated, and on the support flow the image simply doesn't render. Three flows, three different shapes, three different bugs.

## Goal

One consistent upload contract across all three surfaces:
- Client sends multipart with a `file` field and clear size + format limits.
- Server validates by magic-byte (not by client MIME), enforces 5 MiB and PNG/JPEG/WEBP uniformly, and persists to S3.
- Project-create gate and workspace-upload gate also run image moderation via a single shared helper, using the same combo model the user already has (vision coverage = whatever the combo model can see; documented as a known gap until you swap to a dedicated vision moderation model later).
- Support flow gets the S3 key bug fixed and aligned with the project-asset pattern.

## Non-Goals

- A dedicated vision-only moderation model (deferred per user "later" — combo model is used as today).
- A temp-folder staging pattern for image moderation (rejected by user after discussion; the multipart-at-create approach gives the server the bytes without staging).
- A migration of existing broken support ticket image rows (data-fix is a follow-up; new uploads work, old ones stay 404).
- Removing GIF support from support tickets (out of scope; documented in the new file format allowlist).
- Auth changes.

## Design

### A. Shared moderation helper

`src/lib/ai-moderation.ts` — extend the existing `moderateProjectRequest` signature:

```ts
export type ModerationImage = { bytes: Buffer; mediaType: string };

export async function moderateProjectRequest(
  prompt: string,
  images: ModerationImage[] = [],
  timeoutMs = getModerationTimeoutMs(),
): Promise<ModerationResult>
```

When `images.length > 0`, build the AI SDK message as a multimodal content array:

```ts
content: [
  ...(prompt.trim() ? [{ type: "text", text: prompt.trim() }] : []),
  ...images.map((img) => ({
    type: "file",
    data: img.bytes,
    mediaType: img.mediaType,
  })),
]
```

When `images.length === 0`, behavior is identical to today (text-only). The combo model is the same model used everywhere; if the combo resolves to a text-only model, the image content is silently ignored by that model, which is the documented "later I'll fix" gap.

**Retry-once-on-throw:** wrap the inner `generateText` call so that on caught error we sleep 1s and retry once. After the second failure, re-throw. The caller maps the throw to a 503.

**Logging on failure:** replace the bare `catch {}` at the call sites (e.g. `api.projects.ts:195`, `api.moderation.project-request.ts:69`, `api.projects.moderate.ts:76`) with `catch (error) { console.error("[moderation] failed", { code, error: error instanceof Error ? error.message : error }); throw; }`. The current `catch {}` discards the actual error message, which is why the user's screenshot showed a generic 503 with no underlying cause.

### B. Project create — `POST /api/projects` becomes multipart

**Wire format change.** Today the body is JSON `{ prompt, mode, idempotencyKey }`. New body is `multipart/form-data` with fields:
- `prompt` (text, required)
- `mode` (text, optional, default `discuss`)
- `idempotencyKey` (text, optional)
- `files` (file, optional, 0–6 entries, each ≤5 MiB, PNG/JPEG/WEBP only)

**Server flow in `src/routes/api.projects.ts`:**
1. `auth()` → 401.
2. `checkRateLimit("ai", userId)` → 429.
3. `checkEnergy(userId, MIN_ENERGY_MODERATION)` → 429.
4. `await request.formData().catch(() => null)` → 400 if null. Reject if total form size > 16 KiB for non-file fields (existing `readBoundedJson` cap is replaced by a similar `readBoundedForm` cap; for now just trust the multipart parser).
5. `prompt = String(form.get("prompt") ?? "").trim()`. Reject if < 8 chars or > 1200 chars.
6. For each `form.getAll("files")`: must be `File` instance, ≤5 MiB, magic-byte-detected as PNG/JPEG/WEBP (using the same `detectImageFormat` in `src/lib/projects/project-assets.ts`). Reject with 400 + clear message on any failure.
7. `mode = form.get("mode") === "build" ? "build" : "discuss"`.
8. `idempotencyKey` from form field, validated same as today.
9. `validateProjectRequest(prompt)` — extended to enforce the 8-char minimum. Same Indonesian error string for "too short" and "too long".
10. If files present: `moderateProjectRequest(prompt, images)` with retry-once. On BLOCK → 400 with `BLOCK_MESSAGE`. On CLARIFY → 400 with `CLARIFY_MESSAGE`. On throw after retry → 503 with `CLARIFY_MESSAGE` (existing user-facing string, used here for the moderation-unavailable case as well — no new strings).
11. If files absent: `moderateProjectRequest(prompt)` as today. Same retry behavior.
12. Find/create idempotent project as today.
13. If files present AND moderation approved: persist each as `ProjectAsset` with `purpose: "business-image"`, store ids in a `assetIds: string[]` array.
14. Return `Response.json({ id, path, assetIds }, { status: 201 })`. The `assetIds` is new — today the response is just `{id, path, projectCount, projectLimit}`. The two extra fields are added; existing consumers (only `HomePromptForm.tsx`) ignore the new fields.

**Client change in `src/components/projects/HomePromptForm.tsx`:**
- Replace the JSON `fetch` with a `FormData` `fetch`. Browser sets `Content-Type` with the multipart boundary.
- Delete the entire `onSuccess` upload loop (current `onSuccess` at lines 142-202) — server persists files before returning 201.
- Delete the `useEffect` for cleanup of attachment blob URLs (only needed if attachments outlive the component; on submit they're cleared by setState, on unmount the browser revokes). Keep the `revokeAll(attachments)` call in `finally` to be safe.
- The `sessionStorage` handoff in `WorkspaceShell.tsx` (lines 1077-1108) is **deleted** — the server returns assetIds and the chat turn's `body.mediaPaths` is populated from the loader, not from session storage.

### C. Workspace upload — `POST /api/projects/:id/assets/upload` gets moderation

**Server flow in `src/routes/api.projects.$id.assets.upload.ts`:**
1. Auth, ownership, form parsing, file validation, magic-byte detection (already exists for these steps).
2. **New step:** before `uploadProjectAsset`, call `moderateProjectRequest("", [image])` with retry-once. The prompt is empty; only the image is sent. On BLOCK/CLARIFY → 400 with the moderation message. On throw after retry → 503.
3. Then `uploadProjectAsset(...)` as today.

**Client change:** none. `WorkspaceShell.tsx` already calls this endpoint and the existing chunked base64 fix stays. The error surfaces via the existing `toast.error` path. A moderation failure on the workspace composer leaves other attachments in the list; only the failed image is removed (existing pattern: caller passes one image, the toast fires, the user retries the picker).

**Why empty prompt for workspace image moderation:** the chat turn's text is not moderated (chat model is the user's moderation layer for text). Only the image bytes go through the safety check at the upload boundary.

### D. Support ticket upload — fix S3 key bug, align with project-asset pattern

**The bug:** `api.support.assets.ts:65` writes S3 key `support/assets/${assetId}.${ext}` but `api.support.assets.$assetId.ts:41` reads `support/assets/${assetId}` (no extension). GET always 404s.

**Fix — `src/routes/api.support.assets.ts`:**
- Compute `extension` from the magic-byte detection result (using the same `detectImageFormat` from `project-assets.ts`), NOT from `file.name` and NOT from `file.type`. The user-controlled name/type can lie.
- Reject if the detected format is not in the allowlist.
- Construct `ref` as `object:s3:support/assets/${assetId}.${ext}` and write the S3 object with the correct `contentType` (the detected one, not the client-supplied one).
- Return `{ assetId, ref, url, contentType }` so the GET route has the extension.

**Fix — `src/routes/api.support.assets.$assetId.ts`:**
- Use the `ref` returned at upload time to look up the object, instead of reconstructing the key from `assetId`. Pass `ref` through the asset id mapping or store the extension on the message row.
- **Implementation choice:** simplest is to store the extension on the upload response and thread it through. Add a `SupportAsset` row (or extend the existing `SupportMessage.assetIds` to `SupportMessage.assets: { id, ext }[]`). To avoid a schema change, store the extension as part of the assetId string: `assetId = randomUUID() + "." + detectedExt` (e.g. `abc123.png`). The client sees the full string, the GET route parses it, the S3 key matches.

**Chosen approach (no schema change):** assetId IS the S3 key suffix including extension. The client passes the full assetId back in `assetIds` to the message; the GET route parses the extension off the end and uses it to construct the S3 key.

So:
- `api.support.assets.ts:64-65` becomes:
  ```ts
  const detectedExt = detectImageFormat(bytes); // returns "png" | "jpeg" | "webp" | "gif" or null
  if (!detectedExt) return 400 "Format file tidak didukung.";
  const assetId = `${randomUUID()}.${detectedExt}`;
  const key = `support/assets/${assetId}`;
  ```
- `api.support.assets.$assetId.ts:41` becomes:
  ```ts
  const key = `support/assets/${assetId}`; // assetId already contains extension
  ```
- The client (`_main.admin.tickets.$ticketId.tsx`, `_main.support.$ticketId.tsx`) doesn't change — it still uses `assetId` as the URL slug, but now the slug is `abc123.png` instead of `abc123`, which is what the S3 key is.

**GIF support:** keep GIF in the allowlist because the existing code accepts it (`ALLOWED_MIME_TYPES` line 9-14). The magic-byte detector in `project-assets.ts:250-285` does NOT detect GIF. Add GIF detection to a new exported helper, or add a separate `detectImageFormat` overload in `support/assets` that handles GIF. Choose: extract `detectImageFormat` to a shared `src/lib/images/format.ts` module and extend it to handle PNG/JPEG/WEBP/GIF. Both upload endpoints use it.

**Other consistency fixes in the support endpoint:**
- Use `Buffer.from(await file.arrayBuffer())` once (already done).
- Log S3 write errors with structured fields (already done at line 84; minor improvement to include `assetId`).
- Use the same Indonesian error strings as project-asset upload (already aligned on most).

### E. Validation helper change

`src/lib/projects/input.ts` — add minimum length check:

```ts
export const PROJECT_REQUEST_MIN_LENGTH = 8;

export function validateProjectRequest(input: string): ProjectRequestValidation {
  const value = input.trim().replace(/\s+/g, " ");
  if (!value) return { ok: false, message: "Tulis kebutuhan usahamu dulu." };
  if (value.length < PROJECT_REQUEST_MIN_LENGTH) {
    return { ok: false, message: "Tulis kebutuhan usahamu lebih lengkap, minimal 8 karakter." };
  }
  if (value.length > PROJECT_REQUEST_MAX_LENGTH) {
    return { ok: false, message: "Maksimal 1.200 karakter. Ringkas sedikit, ya." };
  }
  return { ok: true, value };
}
```

This is a new constant. The same validator is also used in `api.moderation.project-request.ts` and `api.projects.moderate.ts`. Both benefit from the min check (consistent).

### F. Client-side attachment UX

Both `HomePromptForm.tsx` and `WorkspaceShell.tsx` use the same `ComposerAttachments` + `ComposerAttachButton` components. No client-side change beyond what's already in those components.

**On moderation failure on home:** clear all attachments. User re-attaches after fixing their prompt.
**On moderation failure on workspace upload:** only the failed image is removed. Other attachments stay.

This is the behavior I committed to earlier in the conversation (option 2c).

### G. Move shared image-format detection to one place

`src/lib/images/format.ts` (new) — `detectImageFormat(bytes: Buffer): "png" | "jpeg" | "webp" | "gif" | null`, plus `EXT_CONTENT_TYPE: Record<string, string>` and `contentTypeFromExt(ext: string): string`. Re-export from the new path. Update `src/lib/projects/project-assets.ts` to import from the new module (keep the local re-export so existing call sites don't break). Update `src/routes/api.support.assets.ts` to import the same module.

## Files Touched

**New:**
- `src/lib/images/format.ts` — shared magic-byte detection + content-type helpers.

**Modified:**
- `src/lib/ai-moderation.ts` — extend signature, multimodal content array, retry-once, structured logging.
- `src/lib/projects/input.ts` — add `PROJECT_REQUEST_MIN_LENGTH = 8`, update `validateProjectRequest`.
- `src/routes/api.projects.ts` — refactor POST to multipart, file validation, image moderation, project-asset persistence in one handler, return `assetIds`.
- `src/routes/api.projects.$id.assets.upload.ts` — add image-only moderation step.
- `src/routes/api.support.assets.ts` — magic-byte detection, assetId includes extension, structured logging.
- `src/routes/api.support.assets.$assetId.ts` — use the full assetId-with-extension as the S3 key.
- `src/components/projects/HomePromptForm.tsx` — switch to multipart POST, delete the client-side upload loop and the `sessionStorage` handoff (it moved server-side), clear attachments on every non-2xx response.
- `src/components/projects/WorkspaceShell.tsx` — delete the `sessionStorage` read block in the auto-send effect (the assetIds are returned by the project loader now).
- `src/lib/projects/project-assets.ts` — import shared format helpers; keep the local re-export.
- `src/routes/api.moderation.project-request.ts`, `src/routes/api.projects.moderate.ts` — structured error logging on moderation catch (replace bare `catch {}`).

**Not touched:**
- `src/components/projects/ComposerAttachments.tsx`, `src/lib/projects/composer-attachments.ts` — already correct after the previous commits.
- 9Router config — model selection unchanged.
- Database schema — no migrations. assetIds is a new JSON field returned in the create-project response, not a column.

## Done Means

**Server:**
- `bun run check` is green.
- `POST /api/projects` (unauthenticated) → 401.
- `POST /api/projects` with `prompt: "a"` → 400 with `{"message":"Tulis kebutuhan usahamu lebih lengkap, minimal 8 karakter."}`.
- `POST /api/projects` with `prompt: "halo" + 1 image` → 201 with `{id, path, assetIds: ["..."]}` and the image persisted as a `ProjectAsset` row.
- `POST /api/projects` with `prompt: "halo" + 1 image that is 6 MiB` → 413 with `{"message":"Ukuran file melebihi 5 MB."}`.
- `POST /api/projects` with `prompt: "halo" + 1 file with .txt extension` → 400 with `{"message":"Format gambar tidak didukung. Gunakan PNG, JPEG, atau WEBP."}` (server detects by magic bytes, not by extension).
- `POST /api/projects` with `prompt: "halo" + 1 image` (mocked moderation returns BLOCK) → 400 with the BLOCK_MESSAGE; no project created, no asset row.
- `POST /api/projects/:id/assets/upload` with a 4 MiB PNG → 201 + the moderation call is made (visible in 9Router logs as a multimodal request). Moderation BLOCK → 400, no asset row.
- `POST /api/projects/:id/assets/upload` mocked to fail moderation with a 503 from 9Router → request retries once after 1s, then returns 503 with `{"message":"Checker keamanan lagi lambat. Coba kirim lagi sebentar ya."}`.
- `GET /api/support/assets/{assetIdWithExt}` returns the image bytes with the correct `Content-Type`. (Old `assetId` without extension still 404s — that's a pre-existing data issue, not a regression.)

**Client:**
- Home page: type "aaaa" → form shows "Tulis kebutuhan usahamu lebih lengkap, minimal 8 karakter." inline, no network call.
- Home page: type "halo" + attach 1 image → POST multipart, server creates project + persists image, redirect to project, image appears in the chat turn automatically.
- Home page: type "halo" + attach 1 image, server returns 400 (moderation) → form shows the moderation message, attachments cleared.
- Workspace composer: attach 1 image, send → image uploads, chat turn fires, image renders in the AI reply.
- Workspace composer: attach 1 image, server returns 400 (moderation) → toast shows moderation message, only that image is removed.
- Support ticket thread (admin + user): attach 1 image, send → image appears inline in the message bubble. (Today it 404s; after the fix it renders.)

## Verification

- `bun run check` (format/lint/typecheck/test/Knip) green. CI runs the full `bun run verify` plus build + Storybook.
- Manual smoke test in browser for each of the three upload surfaces.
- One vitest unit test in `src/lib/images/format.test.ts` covering `detectImageFormat` for PNG/JPEG/WEBP/GIF positive cases, random-byte negative cases, and a 1-byte-short negative case.
- No new top-level dependencies. AI SDK v7 already supports multimodal content arrays.

## Open Questions Deferred (intentionally)

- **Dedicated vision-capable moderation model.** The combo model is used; if it resolves to text-only DeepSeek, image moderation is effectively a no-op for the image content. User committed to addressing this later. The architecture is ready for a one-line env var swap when they do.
- **Migration of pre-fix support ticket image rows.** Old uploads have assetIds without extension; they remain 404 until a follow-up script backfills the extensions. Not blocking.
- **GIF removal from support tickets.** Out of scope. The shared format detector includes GIF to keep support behavior unchanged. If we want to drop GIF, that's a follow-up.

## Why "Approach A: Multipart from the start" (vs temp folder or no-moderation)

- The user originally proposed a temp folder + cron. I pushed back. The multipart refactor is a strictly smaller change: one endpoint becomes multipart, files persist in the same handler, no new endpoints, no cron, no orphans. Image bytes are available to moderation in the same request.
- Compared to "skip image moderation": a user can attach an inappropriate image and slip through text-only moderation. Even with a text-only combo model today (vision gap is documented), the architecture is ready when the user swaps to a vision model.
- Compared to retrying the moderation only on 5xx from 9Router: the retry-once wrapper is a 6-line change in the helper. All callers benefit.
