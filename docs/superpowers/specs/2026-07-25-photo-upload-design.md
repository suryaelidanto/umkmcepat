# Photo-Upload → Generation + Published Site — Design

**Date:** 2026-07-25
**Topic:** 2 of the eight-topic roadmap (see `umkmcepat-eight-topic-roadmap` memory)
**Status:** Shipped — plan complete (`4ca14ee`). `src/routes/media.$assetId.ts` (302 to `publicUrl`, 404 on miss, immutable cache), `ComposerAttachments.tsx` with `MAX_COMPOSER_IMAGES` cap, commit-on-send to R2 via `pendingAttachments` in `WorkspaceShell.tsx`.
**Depends on:** R2 display-media storage (topic 1) — uses `ProjectAsset.publicUrl` + the R2 client.

## Goal

Let a site owner attach images in the workspace chat composer (generation or "Ubah" edit mode). Attached images stay client-side previews until the message is sent; on send they commit to R2, the agent reads them via a vision-capable combo model, and autonomously places them into the generated/edited source. Published sites serve owner photos through a stable, slug-independent, vendor-neutral public route that 302-redirects to the R2 public URL.

## Why

The upload plumbing already exists (`POST /api/projects/$id/assets`, magic-byte validation, `ProjectAsset` rows) but nothing consumes it — the `FileUpload` component lives only in Storybook, and uploaded photos never reach the generation agent, the edit agent, or the published site. This spec wires the last mile: the composer attachment strip → R2 commit-on-send → VL-agent placement → public `/media/` serve route → published-site embedding.

## Decisions (locked during brainstorming)

1. **Dummy until send.** An attached image is a client-side `blob:` URL preview only; it never leaves the browser until the message is sent. On send → upload to R2 → `publicUrl` → feed to the agent. Refresh or clearing the message drops attachments (no server draft state, no orphan R2 objects).
2. **Client-side blob-URL previews.** No server temp store, no draft rows, no TTL sweep. The cost: a refresh mid-draft loses the previews (re-attach). Acceptable — drafts are ephemeral.
3. **Single shared attachment strip.** One strip above the composer input; the paperclip opens the native file picker, which accepts single or multi-select (one handler accepts `FileList`). Each thumbnail has an `X` remove. Cap **6 images per message** (beyond that, send two messages). Not one-per-line, not two code paths.
4. **Agent-autonomous placement.** On send, the uploaded images go to the agent as image content alongside the user's text. The vision-capable combo model reads each image, understands it (e.g. "product photo of a cake"), and decides where to place it (hero, gallery, product card) — emitting source changes referencing the media path. One round-trip, no per-image confirm. Falls back to guess+confirm only if vision fails (the model returns no image understanding); VL is in the combo band so the happy path is autonomous.
5. **Labels.** The mode-toggle button = **"Ubah"** (non-dev Indonesian for "change/edit"). The point-click-annotate action = **"Komentar"**. The image-replace affordance on a clicked `<img>` = **"Ganti gambar"**. Three distinct concepts, three clear labels.
6. **Image-replace reliability fix.** Extend `runtime-proxy.ts:targetData()` to capture `element.currentSrc || element.src` for `img`/`picture`/`svg` targets. The agent then swaps the **exact `src` string** in the source (deterministic grep-replace) instead of mapping a brittle runtime `selectorPath` to JSX — the current unreliability root cause. Non-image annotations (text, sections) keep the existing `selectorPath` flow; their brittleness is a pre-existing issue flagged, not fixed here.
7. **Stable public media route — `/media/<assetId>`** (NOT under `/p/<slug>`, which is reserved for the published site created by "Terbitkan"; NOT the auth-gated `/api/projects/.../asset/...`). The agent bakes `<img src="/media/<assetId>" alt="..." />` into source. At request time the route looks up `ProjectAsset.publicUrl` and **302-redirects** to the R2 public URL — zero byte-egress through the server, vendor-neutral source (swap CDN later = update the redirect target, source untouched), slug-independent (rename the site, media URLs don't break).
8. **Public route, no auth.** `/media/<assetId>` is public (these images appear on live published sites). The unguessable cuid `assetId` is the only gate. The R2 public URL behind the redirect is defense-in-depth, not access control.

## Architecture

### Composer attachment strip

A new composer attachment control in the workspace shell:

- Paperclip button → `<input type="file" accept="image/png,image/jpeg,image/webp" multiple>`.
- On change, append each `File` to a `pendingAttachments` array (max 6; extras ignored with a toast "Maksimal 6 gambar per pesan").
- Each pending file renders as a thumbnail via `URL.createObjectURL(file)` (blob URL). Each thumbnail has an `X` that removes it from the array + `URL.revokeObjectURL`.
- On send: for each pending attachment, POST the bytes to `POST /api/projects/$id/assets` (`purpose=business-image`) → returns `{ id, publicUrl }`. Collect the results. Only after all uploads succeed (or fail loudly) is the message + image-contents sent to the agent turn.
- Clearing the composer (send success, reset button, or unmount) empties `pendingAttachments` and revokes all blob URLs.

`MAX_COMPOSER_IMAGES = 6` — one constant, tunable.

### Send payload to the agent

The agent turn receives, alongside the user's text instruction:

```
images: [
  { assetId: "c2k...", publicUrl: "https://pub-...r2.dev/...", mediaPath: "/media/c2k...", alt: "<VL one-line description>" }
]
```

The `mediaPath` is what the agent bakes into source (`/media/<assetId>`). The agent never sees or writes the raw R2 URL — it writes the stable media path. The `alt` comes from the VL model's understanding of the image (generated in the same turn).

### VL vision in the agent

The generation/edit agent (`src/lib/projects/custom-source-generator.ts` generate agent; `src/lib/projects/source-edit-agent.ts` edit agent) gains a tool or message-content path to receive image bytes. The combo band includes vision-capable models (`qwen/qwen3-vl-235b-a22b-instruct`, `google/gemini-3.1-flash-lite` — confirmed `src/lib/model-pricing.ts:25-33`), so the Vercel AI SDK's image-content support carries the uploaded image into the model call.

The agent prompt is extended with: "These images were uploaded by the owner. Read each, understand what it shows, and place it appropriately (hero, gallery, product card). Reference each via its `mediaPath` in an `<img>` — never the raw URL. Provide a short `alt`."

### `/media/<assetId>` serve route

New route `src/routes/media.$assetId.ts`:

- `GET /media/<assetId>` → look up `ProjectAsset` by id → if `publicUrl` set, `302` to it; else `404`.
- Public (no auth) — these are published-site images.
- `Cache-Control: public, max-age=31536000, immutable` on the 302 response (the R2 object is immutable per ULID).
- If the asset row doesn't exist or has no `publicUrl` → `404` (honest empty state, no fabrication).

### Image-replace in Ubah mode

The existing komentar flow (`/api/projects/$id/edit` with `kind: "visual_comment"`) is extended for image targets:

- `runtime-proxy.ts:targetData()` adds, for `img`/`picture`/`svg` tags: `src: element.currentSrc || element.src` to the target payload (alongside the existing `selectorPath`, `boundingBox`, etc.).
- The "Ganti gambar" affordance in the annotation popover opens the file picker (same attachment handler); on send, the edit instruction carries `{ target: { tag: "img", src: "<the-exact-src>" }, replaceWith: [{ mediaPath, alt }] }`.
- The edit-agent instruction for image-replace: "Find the `<img src=\"...\">` matching `target.src` exactly, replace its `src` with `replaceWith[0].mediaPath`." Deterministic; no selectorPath-to-JSX guessing.

## Data flow

**Attach (generation or Ubah):**
1. User clicks paperclip → picks 1–6 images.
2. `pendingAttachments` array holds `{file, blobUrl}` for each; thumbnails render.
3. User types a message.

**Send (generation):**
1. For each pending attachment: POST `/api/projects/$id/assets` with the bytes → `{id, publicUrl}`.
2. Collect `images: [{assetId, publicUrl, mediaPath, alt}]` (alt populated by the VL pass below).
3. Send the agent turn: user text + `images` (image content + metadata).
4. VL model reads each image → returns a one-line description → populates `alt`.
5. Agent writes `<img src={mediaPath} alt={alt} />` into the source at an autonomously-chosen location.
6. Build proceeds as today; dist embeds `/media/<assetId>`.

**Send (Ubah image-replace):**
1. User clicks an `<img>` in the preview → "Ganti gambar" → picks 1+ images (blob previews).
2. On send: upload to R2 as above → `images: [{mediaPath, alt}]`.
3. Edit instruction: `{kind: "visual_comment", target: {tag:"img", src:"<exact current src>"}, replaceWith: images}`.
4. Edit agent finds the matching `<img src>` and swaps to `replaceWith[0].mediaPath`.

**Published site serving:**
1. Visitor loads `/p/<slug>` → dist has `<img src="/media/<assetId>">`.
2. Browser requests `/media/<assetId>` → route looks up `ProjectAsset.publicUrl` → `302` to R2.
3. Browser follows → fetches from R2 directly (zero server byte-egress).

## Error handling

- **Upload fails on send (R2 PUT non-OK):** the message send is aborted; an honest error is shown ("Gagal mengunggah gambar. Coba lagi."); no `ProjectAsset` row is persisted for the failed image (R2 spec's no-dangling-ref rule). Pending attachments remain in the strip so the user can retry without re-attaching.
- **VL model returns no image understanding (vision failure):** the agent falls back to asking the user where to place each un-understood image ("Aku tidak yakin gambar ini untuk apa — hero, galeri, atau kartu produk?") instead of guessing silently. Honest, not fabricated.
- **`/media/<assetId>` lookup misses (row gone, or no publicUrl):** `404`. The published site shows a broken image — this spec does not add dist-rebuild-on-missing (separate resilience spec).
- **Too many attachments (>6):** extras are rejected with a toast; the first 6 remain.

## Testing (TDD)

1. **Unit — attachment strip:** `MAX_COMPOSER_IMAGES` cap enforced, `X` removes + revokes blob URL, send clears the strip.
2. **Unit — `/media/<assetId>` route:** asset with `publicUrl` → `302` to it; missing row or null `publicUrl` → `404`; `Cache-Control` header present.
3. **Unit — image-replace target:** `targetData()` for an `<img>` includes `src`; for a `<div>` it does not.
4. **Unit — edit instruction builder:** image-replace instruction carries `target.src` + `replaceWith[].mediaPath` (not the raw R2 URL).
5. **Integration (env-gated, like R2's live test):** attach a real image → send → confirm a `ProjectAsset` with `publicUrl` exists → confirm the agent turn received image content → confirm `/media/<assetId>` 302s to R2.

## Out of scope

- The R2 storage primitives + `publicUrl` column (topic 1, already specced/planned).
- dist-rebuild-on-missing resilience (separate spec).
- Reordering attachments via drag (flagged as a possible later enhancement; not now).
- Fixing non-image annotation `selectorPath` brittleness (pre-existing, flagged not fixed).
- The Supabase migration (separate spec).

## Open questions for implementation

- Exact Vercel AI SDK image-content shape for the combo's VL models (verify `streamText`/`generateText` accepts `image` content parts through the 9Router OpenAI-compatible transport). Resolve at impl time against `src/lib/ai.ts`.
- Whether the VL `alt` description is generated in a separate cheap pre-pass or inline with the agent turn. Lean inline (one round-trip) unless the combo routes the VL model inconsistently.
