# Temporary Image Upload Design

## Goal

Make every user image upload feel immediate: selecting an image uploads it first, submit sends only uploaded image IDs, and submit buttons stay disabled while uploads are still running.

## Scope

Standardize these surfaces:

- Home project creation: `src/components/projects/HomePromptForm.tsx`
- Project workspace chat/uploads: `src/components/projects/WorkspaceShell.tsx`
- Waitlist photos: `src/routes/_main.waitlist.tsx`
- Support ticket creation: `src/routes/_main.support.tsx`
- Support user replies: `src/routes/_main.support.$ticketId.tsx`
- Support admin replies: `src/routes/_main.admin.tickets.$ticketId.tsx`

Do not change unrelated `FormData` use such as project deletion/actions.

## Architecture

Use one shared server-mediated temporary image upload flow. No new Prisma model. Temporary upload state lives in the private object store and in a signed opaque token returned to the browser.

Temporary object keys use an expiring prefix:

```text
temp-uploads/<userId>/<expiresEpochMs>/<uuid>.<ext>
```

The upload endpoint returns:

```ts
type TempImageUploadResult = {
  assetId: string; // signed temp token, not a raw storage key
  url: string; // preview URL served by the app
};
```

Submit endpoints accept uploaded `assetIds`. On submit, the server claims each temp upload: verify token, verify owner, verify expiry, verify content type/size/count, copy the object into the final destination, then delete the temp object best-effort.

## Security

The client never gets storage authority. `assetId` is a signed token containing only:

- `key`
- `userId`
- `contentType`
- `sizeBytes`
- `expiresAt`

Every claim verifies:

- token signature is valid
- token user matches current user
- token is not expired
- key starts with `temp-uploads/<userId>/`
- content type is `image/png`, `image/jpeg`, or `image/webp`
- size is within the surface limit
- count is within the surface limit

Preview/delete endpoints also verify ownership. Cleanup only deletes under `temp-uploads/`.

## Upload UX

When a user selects images:

1. Show local blob preview immediately.
2. Start upload immediately.
3. Mark attachment as uploading.
4. Disable submit while any attachment is uploading.
5. On upload success, store the returned `assetId` on the attachment.
6. On upload failure, remove the attachment and show Indonesian error copy.
7. On remove before submit, revoke blob URL and call best-effort temp delete if an `assetId` exists.

Button/loading copy:

- while temp upload runs: `Mengunggah gambar...`
- while final submit runs: existing submit copy, e.g. `Menyiapkan...`

## Server API

Create shared temp upload routes:

- `POST /api/uploads/temp-images`
  - body: `FormData` with one `file`
  - auth required
  - validates image type/size
  - writes to private storage under `temp-uploads/`
  - returns `TempImageUploadResult`
  - opportunistically cleans expired temp objects for the current user

- `GET /api/uploads/temp-images/$assetId`
  - auth required
  - verifies token owner and expiry
  - streams private object for preview

- `DELETE /api/uploads/temp-images/$assetId`
  - auth required
  - verifies token owner
  - deletes temp object best-effort

## Claim destinations

- Project creation claims temp assets into `ProjectAsset` rows after project creation.
- Project workspace chat claims temp assets into project assets using the existing project asset final storage path.
- Support ticket create/reply/admin reply claims temp assets into support final refs and keeps `SupportMessage.assetIds` behavior.
- Waitlist claims temp assets into waitlist image refs and keeps `WaitlistEntry.imageRef` behavior.

## Cleanup

Use app-level cleanup, not bucket lifecycle, for local/R2 parity.

- On upload and claim, delete expired temp objects under `temp-uploads/<userId>/`.
- TTL is 1 hour.
- If cleanup misses an object, it remains private and unreachable after token expiry.
- Add a small script only if orphan temp uploads become visible in storage usage.

## Compatibility

During migration, submit endpoints may accept existing blob uploads where tests or older UI still use them, but new UI must send temp `assetIds`. Remove legacy blob paths only after all callers are migrated and tests prove no remaining use.

## Tests

Add focused tests for:

- token signing rejects tampering
- token claim rejects wrong user
- token claim rejects expired uploads
- temp upload rejects non-images and oversized images
- claim copies final object and deletes temp object best-effort
- project create accepts `assetIds` without `files`
- support ticket/reply accepts shared temp `assetIds`
- waitlist accepts shared temp `assetIds`
- client submit button disables while image upload is pending

## Deliberate skips

- No new Prisma temp upload model.
- No presigned browser-to-S3 upload.
- No bucket lifecycle configuration.
- No resumable uploads.

Add those only when upload traffic, audit requirements, or cleanup cost justify them.
