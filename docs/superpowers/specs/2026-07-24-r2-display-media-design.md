# R2 Display-Media Storage — Design

**Date:** 2026-07-24
**Topic:** 1 of the eight-topic roadmap (see `umkmcepat-eight-topic-roadmap` memory)
**Status:** Design approved; pending plan + implementation.

## Goal

Stand up tested R2 storage and a public-serve path for owner-uploaded **display media** (project `business-image` and `logo` assets). Local stays the zero-config dev default so contributors clone and run with no Cloudflare account. Nothing else changes in this spec: source/dist/thumbnails stay local (rebuildable from the Postgres DB + `bun run build`); waitlist evidence stays private-local; the Supabase migration and photo-upload wiring are separate specs.

## Why

Owner-uploaded photos are the only stored bytes the DB does not already hold — a `ProjectAsset` row stores a reference, not the bytes. A VPS death loses them for good. R2 gives durability (objects survive the VPS) and zero-egress serving for the bytes that actually appear on published sites. Source, dist, and thumbnails rebuild from the DB or a build, so they do not need R2 for safety — only photos do.

## Decisions (locked during brainstorming)

1. **Hybrid serving.** Public R2 for display media; server-proxied for private artifacts and the published dist.
2. **Published dist is server-proxied.** The server reads dist from storage and streams HTML/JS/CSS to the browser; only media goes public-R2. This keeps the server in control of slug routing and HTML and is a minimal change to the existing `/p/<slug>` proxy + URL-rewrite path.
3. **Display media is public; references and the rest stay private.** Only displayable media the published site shows (`business-image`, `logo`) gets public R2 URLs. Reference images (AI-input-only) and waitlist evidence stay server-proxied and auth-gated.
4. **Photos only on R2; source/dist/thumbnails stay local.** Per the durability model: only user-uploaded bytes are truly at risk. One **public** bucket holds display media; waitlist evidence stays local (private).
5. **New env var `PROJECT_ASSET_STORAGE_PROVIDER` (local|r2, default `local`).** Do not reuse `OBJECT_STORAGE_PROVIDER`: R2 public access is bucket-level, and `OBJECT_STORAGE_PROVIDER` already governs private waitlist evidence — reusing it would drop private evidence into the public bucket. Three independent switches (waitlist / display-media / source-dist) each safe to flip alone.
6. **Live R2 round-trip tests + units.** An env-gated (`R2_LIVE_TEST=1`) test PUTs/GETs/DELETEs a small object to the real `umkmcepat-dev` bucket through the real code path and self-cleans on success and failure. Unit tests cover the provider switch, ref format, public/private boundary, and URL building. CI runs only units (no creds).
7. **Consolidate the duplicated Sig V4.** `getR2Config()` and `signedR2Fetch()` are hand-rolled and duplicated across `object-storage.ts` and `runtime-artifacts.ts`; `project-assets.ts` is about to need the same logic. Extract one shared module `src/lib/r2-client.ts` (config + signed fetch + `publicUrlFor`) and point all three consumers at it. This is the single place the live test exercises.

## Architecture

### New shared module — `src/lib/r2-client.ts`

One home for the R2 client. Public surface:

- `getR2Config()` — reads `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE_URL`; fails loudly if required vars are missing when the provider is `r2`.
- `signedR2Fetch(config, key, { method, body, contentType })` — AWS Signature V4 signed `fetch` against `https://{accountId}.r2.cloudflarestorage.com/{bucket}/{key}`. Supports GET / PUT / DELETE.
- `publicUrlFor(key)` — returns `${R2_PUBLIC_BASE_URL}/${key}`. Used only for display media; references never call this.

`object-storage.ts` and `runtime-artifacts.ts` delete their local copies and import from `r2-client.ts`. `ponytail:` if a third distinct R2 config shape appears later (e.g. artifact-specific prefix handling that cannot be parameterized), generalize then; today both configs read the same five vars and share one signing path.

### New env var

`PROJECT_ASSET_STORAGE_PROVIDER` (local | r2, default `local`) controls **only** project display media. Added to `.env` and `.env.example` in the OPTIONAL section, one-liner comment, keeping the 1:1 structure.

The three storage switches and what they govern:

| Switch | Governs | Default | Public bucket safe? |
|---|---|---|---|
| `OBJECT_STORAGE_PROVIDER` | waitlist evidence | `local` | no (private) |
| `PROJECT_ASSET_STORAGE_PROVIDER` | project display media + references | `local` | `r2` = public for display media |
| `PROJECT_ARTIFACT_STORAGE_PROVIDER` | source + dist | `local` | no (rebuildable) |

### `project-assets.ts` gains an R2 branch

`writeProjectAsset` / `readProjectAsset` / `deleteProjectAsset` branch on `PROJECT_ASSET_STORAGE_PROVIDER`:

- `business-image` and `logo` (display media) under `r2`: signed PUT to the public bucket, ref `project-asset:r2:<projectId>/<userId>/<kind>/<ulid>.<ext>`, persist `publicUrl` on the `ProjectAsset` row.
- `reference` (AI-input-only): stays local regardless of provider — never displayed, never public.

### Data model

`ProjectAsset` gains a nullable `publicUrl String?` column (migration). For R2 display media it is set on upload; for local and reference assets it is `null`. Serve routes read `publicUrl` first; if set, redirect (302) the browser to the public R2 URL; otherwise proxy bytes server-side behind auth + ownership. Published-site builds embed the `publicUrl` so dist serves display media directly from R2.

`ponytail:` storing `publicUrl` rather than deriving on read — chosen because published HTML embeds the URL and a stored value is stable across `R2_PUBLIC_BASE_URL` changes only via a backfill. If a backfill feels cheaper than the column, revisit at implementation; lean to storing.

### Serve path

`GET /api/projects/$id/asset/$assetId` (`api.projects.$id.asset.$assetId.ts`):

- If `ProjectAsset.publicUrl` is set → `302` redirect to it. The browser fetches R2 directly (zero server egress). **Ownership is always checked before redirecting** — the unguessable ULID URL is defense-in-depth, not the access control; a non-owner never gets the redirect (they get 403).
- Else → proxy bytes server-side (local read or signed R2 GET) with `Cache-Control: private, max-age=31536000, immutable` (unchanged).

Published dist referencing owner photos embeds the `publicUrl` directly; the `/p/<slug>/*` proxy is unchanged because the browser resolves the absolute R2 URL.

## Data flow

**Upload (display media, provider=r2):**
1. Browser multipart POST `/api/projects/$id/assets` with `file` + `purpose=business-image|logo`.
2. `uploadProjectAsset` validates magic bytes (PNG/JPEG/WEBP), size cap (5 MiB unchanged).
3. `writeProjectAsset` → `signedR2Fetch(PUT)` to `pub-…r2.dev/<projectId>/<userId>/<kind>/<ulid>.<ext>`.
4. Persist `ProjectAsset { ref, publicUrl, kind, purpose, projectId, userId }`.

**Serve (public):** `GET /api/projects/$id/asset/$assetId` → ownership check → `302` to `publicUrl` → browser → R2.

**Serve (private / reference):** ownership check → proxy bytes server-side.

**Published site:** built dist references `publicUrl` as an absolute URL; browser hits R2 directly; `/p/<slug>/*` proxy unchanged.

## Error handling

- **R2 PUT fails (auth, network, bucket misconfig):** surface an honest error; **do not** persist a `ProjectAsset` row (no dangling reference). One bounded retry for transient errors; then fail the upload.
- **`R2_PUBLIC_BASE_URL` empty but provider=r2:** hard-fail at startup with a clear message ("set `R2_PUBLIC_BASE_URL` (enable public access on the bucket) or keep `PROJECT_ASSET_STORAGE_PROVIDER=local`"). No silent public-URL-less state — a missing public URL on display media is a broken feature, not a degraded one.
- **Missing display media on a published site:** R2 returns 404; the browser shows a broken image. This spec does not add dist-rebuild-on-missing (separate resilience spec).

## Testing (TDD)

1. **Unit:** provider switch (local/r2), ref format, public/private boundary (display=public, reference=private), `publicUrlFor` URL building, serve-route redirect-vs-proxy logic, `ProjectAsset.publicUrl` read path.
2. **Live round-trip** (env-gated `R2_LIVE_TEST=1`, off in CI, off by default): PUT a `__test__/round-trip-<n>.txt` object to the real `umkmcepat-dev` bucket through `r2-client.ts` → GET → assert bytes → DELETE → assert gone. Self-cleans in `try/finally` on both success and failure so the dev bucket does not accumulate test junk.

Behavior tests, not private-implementation tests. Trivial one-liners (e.g. `publicUrlFor`) need no dedicated test beyond the URL-building unit.

## Migration / rollout

1. Add `src/lib/r2-client.ts`; point `object-storage.ts` and `runtime-artifacts.ts` at it. Behavior unchanged — regression-gated by the existing suite (`bun run check`).
2. Add `PROJECT_ASSET_STORAGE_PROVIDER` to `.env` and `.env.example` (OPTIONAL section, 1:1 structure).
3. Prisma migration: `ProjectAsset.publicUrl` nullable column.
4. Implement the R2 branch in `project-assets.ts` + the serve-route 302 redirect.
5. Add unit + live tests.
6. Flip `PROJECT_ASSET_STORAGE_PROVIDER=r2` locally → upload a `business-image` → confirm it serves from `https://pub-…r2.dev/…`.
7. Prod (later, config-only): `umkmcepat-prod` bucket + custom domain; repoint prod `.env`. No code change.

## Out of scope

- Wiring uploaded photos into the generation / edit agent so they appear on sites (next spec — photo-upload, topic 2).
- Migrating source/dist/thumbnails to R2 (rebuildable; not needed for durability).
- dist-rebuild-on-missing resilience (separate spec).
- Supabase migration for Postgres durability (separate spec).
- Waitlist evidence moving to R2 (stays local; private).

## Open questions for implementation

- Confirm which models in the 9Router `umkmcepat-combo` are multimodal — needed for the **photo-upload** spec (topic 2), not this one. Tracked there, not here.
