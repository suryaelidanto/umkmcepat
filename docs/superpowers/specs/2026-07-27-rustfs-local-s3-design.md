# RustFS Local S3 — Unify Object Storage on One S3 Path

**Status:** Design — awaiting approval.
**Date:** 2026-07-27.

## Context

The unified-R2 work (shipped, `aca65b9..7991f00`) collapsed three storage toggles into one `STORAGE_PROVIDER` (local|r2) with two buckets. But "local" still means **disk under `.data/`** — a second code path that forks every read/write (`if provider === "local"` → `fs` calls; else → S3 signed fetch). Two storage implementations = double the maintenance, and local dev behaves nothing like prod (disk vs S3, different failure modes, no public-access concept).

The goal: **kill the disk path.** Local dev runs **RustFS** (an S3-compatible server in Docker) so local = prod exactly. One S3 code path, endpoint-driven. Migrating dev↔prod = repointing env at a different endpoint, zero code change.

### What's settled (from brainstorming)

- **Wipe existing local data.** The 2 dev projects + thumbnails + uploads under `.data/` are disposable dev data — delete them and their DB rows. No migration script. Nuke `.data/project-assets`, `.data/project-artifacts`, `.data/project-thumbnails`, `.data/uploads`.
- **Use the AWS SDK** (`@aws-sdk/client-s3`). Replace the hand-rolled Sig V4 in `r2-client.ts`. The SDK absorbs RustFS's S3-compat quirks (path-style, region validation, content-sha256) that a hand-rolled signer would force us to debug.
- **Provider toggle stays `local|r2`** (`STORAGE_PROVIDER`). `local` = talk to RustFS; `r2` = talk to Cloudflare R2. Familiar wording.
- **Two-bucket split preserved.** Public bucket → browser-direct via `S3_PUBLIC_BASE_URL`. Private bucket → server-proxy (auth-gated). Same model as the shipped R2 design.
- **Env keys generalize to `S3_*`.** No more `R2_*`-specific keys (except `STORAGE_PROVIDER=r2` as the prod target name).
- **Prod = managed Cloudflare R2** (durable, default). RustFS is the local-dev mirror. RustFS *can* run in prod as a self-hosted failover target if R2 ever has a problem — same code, repoint env. Not built as an automated failover; a manual env switch.
- **Prod public bucket gets a custom domain** (`media.umkmcepat.com`) as `S3_PUBLIC_BASE_URL`. Local dev uses `http://localhost:9000`.

### What stays local (NOT object storage)

Process-execution dirs are not S3-shaped and stay on disk:
- `PROJECT_RUNTIME_DIR` (`.data/project-runtimes`) — preview containers execute here.
- `PROJECT_BUILD_WORKSPACE_DIR` (`.data/project-build-workspaces`) — Vite builds run here.

These are unchanged. Only object-storage dirs go away.

Recovery: if the materialized runtime docroot is removed while the static server
is alive, the health probe receives a 404 and treats the deployment as stopped,
so the next preview request re-materializes the S3 dist
(`materializeProjectDistArtifact`) and restarts automatically. Owners may also
force a restart via `POST /api/projects/:id/restart` (owner-only). Neither path
runs an AI rebuild.

## Design

### Env (one toggle, endpoint-driven)

```env
# Object storage — one S3 path. local = RustFS (dev mirror); r2 = Cloudflare R2 (prod).
STORAGE_PROVIDER="local"

# S3 config (applies to whichever provider STORAGE_PROVIDER names).
# r2: leave S3_ENDPOINT empty (SDK derives the R2 host from the account); region "auto".
# local: RustFS at http://localhost:9000; region "us-east-1".
S3_ENDPOINT="http://localhost:9000"
S3_REGION="us-east-1"
S3_ACCESS_KEY_ID="<rustfs-or-r2 key>"
S3_SECRET_ACCESS_KEY="<rustfs-or-r2 secret>"

# Two buckets (same account, different access policy).
S3_PUBLIC_BUCKET="umkmcepat-public-dev"     # anonymous-read ON — logos, business images, generated artifacts
S3_PRIVATE_BUCKET="umkmcepat-private-dev"    # anonymous-read OFF — waitlist photos, references, thumbnails

# Public bucket's browser-direct URL. dev = RustFS localhost; prod = https://media.umkmcepat.com
S3_PUBLIC_BASE_URL="http://localhost:9000"
```

Removed: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_BUCKET`, `R2_PRIVATE_BUCKET`, `R2_PUBLIC_BASE_URL`, `LOCAL_UPLOAD_DIR`, `PROJECT_ARTIFACT_DIR`, `PROJECT_ASSET_DIR`, `PROJECT_THUMBNAIL_DIR` (the four object-storage dirs).

Kept: `PROJECT_RUNTIME_DIR`, `PROJECT_BUILD_WORKSPACE_DIR` (process-execution, not S3).

### `s3-client.ts` (replaces `r2-client.ts`)

One module built on `@aws-sdk/client-s3`:

- `getS3Config(bucket: "public" | "private")` → returns a configured `S3Client` + bucket name. Reads `S3_*` env. For `r2`: `S3_ENDPOINT` empty → client uses the R2 virtual-host (`https://<account>.r2.cloudflarestorage.com`), region `auto`. For `local`: `S3_ENDPOINT` set → `forcePathStyle: true`, region from `S3_REGION`.
- `publicUrlFor(bucket, key)` → builds `${S3_PUBLIC_BASE_URL}/${prefix}/${key}`. Only for public bucket; throws if `S3_PUBLIC_BASE_URL` empty.
- `putS3Object`, `getS3Object`, `deleteS3Object` — thin wrappers over `PutObjectCommand`/`GetObjectCommand`/`DeleteObjectCommand`. `deleteS3Object` treats 404 as success (object already gone).

The hand-rolled Sig V4 (`sha256`, `hmac`, `getSignatureKey`, `toAmzDate`, `signedR2Fetch`) is **deleted** — the SDK signs. ~135 lines removed.

### Infra: RustFS in `bun run infra`

RustFS joins the `docker-compose` `ai` profile alongside Postgres + 9Router. Single container, a named volume for durability across restarts, env-configured root credentials.

**Bucket auto-creation on boot:** a small init script (or an app-startup idempotent check) runs `CreateBucketCommand` for `S3_PUBLIC_BUCKET` + `S3_PRIVATE_BUCKET` if they don't exist, then sets the public bucket's anonymous-read policy (RustFS bucket policy JSON granting `s3:GetObject` to `*` on the public bucket only). `bun run infra` → ready-to-use S3, zero manual bucket creation locally.

### Provider resolution

`getStorageProvider()` unchanged — returns `"local" | "r2"` from `STORAGE_PROVIDER`. Every subsystem already calls it (shipped in the R2 work). No change to the call sites; only the underlying `r2-client` → `s3-client` swap.

### Subsystem wiring (the disk path dies everywhere)

Each subsystem's `local` branch (fs `writeFile`/`readFile`/`rm`) is deleted. Write/read/delete now always go through `s3-client`:

- **`object-storage.ts`** (waitlist images) → private bucket. `object:local:` and `object:r2:` ref prefixes collapse to one `object:s3:` prefix. `getStoredObject`/`putStoredObject` use the SDK.
- **`runtime-artifacts.ts`** (source/dist) → public bucket. `project-artifact:local:` and `project-artifact:r2:` collapse to `project-artifact:s3:`. The `{...config, prefix: ""}` double-prefix pattern goes away (SDK takes bucket + key directly).
- **`project-assets.ts`** (display media + references) → display kinds to public bucket (`publicUrl` set, `project-asset:s3:` ref), references to private bucket (`publicUrl: null`, `project-asset:s3-private:` ref). `parseProjectAssetRef` + read/delete branch on `s3-private:` before `s3:`.
- **`project-thumbnail.ts`** (screenshots) → private bucket, `project-thumbnail:s3-private:` ref.

### Ref prefix migration (wipe, no script)

Old `local:` and `r2:` refs in the DB are invalid after this change. The spec accepts this:
- Delete the 2 dev projects + their `ProjectAsset`/`ProjectBuild` rows + thumbnails.
- Nuke `.data/` object-storage dirs.
- Fresh dev DB has no storage refs. New uploads get `s3:` / `s3-private:` refs.

No migration script. (If real prod data ever needed porting, a separate one-shot script — walk DB rows, upload bytes, rewrite ref — is out of scope.)

### Serve routes (unchanged behavior, new ref prefixes)

- `/media/$assetId` — public display media → 302 redirect to `publicUrlFor()` (browser-direct to S3). No auth (assetId is the gate, display media is public by design).
- `/api/projects/$id/asset/$assetId` — owner authed display media → 302 to public R2/S3 URL; references → server-proxy (signed GET + stream).
- `/api/projects/$id/thumbnail` — owner authed → server-proxy (signed GET + stream).
- `/api/admin/waitlist/image/$entryId` — admin authed → server-proxy.

The proxy routes sign a GET server-side and stream bytes; the browser never sees the S3 URL. Privacy holds on both providers (RustFS and R2 private buckets both have anonymous-read off; only the server with creds can read).

### `production-config.ts` cleanup

The prod-only check that `PROJECT_ARTIFACT_DIR` matches the volume mount (`production-config.ts:126`) becomes obsolete — artifacts live in S3, not on a volume. Delete that check + its test. (The volume mount in prod Compose for `.data/project-runtimes` + `.data/project-build-workspaces` stays — those are still disk.)

### Readiness check

`artifact-storage-readiness.ts` validates `S3_*` env presence when `STORAGE_PROVIDER` is set (both providers now need the same vars). The local writable-probe (mkdir/write/read/rm a temp file) is **deleted** — there's no local disk path to probe. A lightweight "can the SDK reach the endpoint?" probe (HEAD bucket, or a no-op `ListBucketsCommand`) replaces it.

## Files to change

**Code:**
- `src/lib/s3-client.ts` (new, replaces `r2-client.ts`) — SDK wrapper, `getS3Config`, `publicUrlFor`, `put/get/deleteS3Object`.
- Delete `src/lib/r2-client.ts`.
- `src/lib/object-storage.ts` — drop local branch, use SDK, `object:s3:` ref.
- `src/lib/projects/runtime-artifacts.ts` — drop local branch, use SDK, `project-artifact:s3:` ref.
- `src/lib/projects/project-assets.ts` — drop local branch, `project-asset:s3:` / `s3-private:` refs.
- `src/lib/projects/project-thumbnail.ts` — drop local branch, `project-thumbnail:s3-private:` ref.
- `src/lib/projects/artifact-storage-readiness.ts` — validate `S3_*`, replace local probe with SDK reachability check.
- `src/lib/projects/project-cleanup.ts` — stop deleting object-storage dirs (they don't exist); keep runtime/build-workspace cleanup.
- `src/lib/production-config.ts` + `.test.ts` — delete the `PROJECT_ARTIFACT_DIR` volume-mount check.
- `package.json` — add `@aws-sdk/client-s3`.

**Infra:**
- `docker-compose.yml` (or the compose file `bun run infra` uses) — add RustFS service (named volume, root creds, the ai profile).
- New init script (e.g. `scripts/init-s3-buckets.ts`) or an app-startup idempotent bucket-create + public-policy grant.

**Env + docs:**
- `.env`, `.env.example` — `S3_*` block, remove `R2_*` + the four object-storage dirs.
- `docs/architecture.md` — storage table + boundaries (`r2-client.ts` → `s3-client.ts`, RustFS in infra).
- `docs/deployment.md` — prod env list (R2 creds under `S3_*` names, `S3_PUBLIC_BASE_URL=https://media.umkmcepat.com`).
- `CLAUDE.md` boundaries — note `s3-client.ts` + RustFS service.

**Tests:**
- `s3-client.test.ts` (renamed from `r2-client.test.ts`) — live round-trip against real R2 (env-gated) + mocked-SDK unit cases for both provider configs.
- `object-storage.test.ts`, `runtime-artifacts.test.ts`, `project-assets.test.ts`, `project-thumbnail.test.ts`, `artifact-storage-readiness.test.ts`, `production-config.test.ts` — update ref prefixes to `s3:` / `s3-private:`, drop local-disk test cases.

## Verification

1. `bun run check` green (format/lint/typecheck/test/Knip).
2. `S3_LIVE_TEST=1 bunx vitest run src/lib/s3-client.test.ts` — live round-trip against real R2 (public + private buckets).
3. Local RustFS smoke (`STORAGE_PROVIDER=local`):
   - `bun run infra` → RustFS container up, buckets auto-created, public bucket anonymous-readable.
   - Upload a logo → appears in `S3_PUBLIC_BUCKET`; `/media/$assetId` 302s to `http://localhost:9000/...`; renders in workspace.
   - Submit waitlist entry with photo → `S3_PRIVATE_BUCKET`; direct RustFS URL → 403; admin serve route returns bytes.
   - Generate a project → `project-artifact:s3:` artifacts in public bucket; preview serves.
   - Capture thumbnail → private bucket; `/api/projects/$id/thumbnail` returns it.
4. Prod R2 smoke (`STORAGE_PROVIDER=r2`): same flows against real R2 + `media.umkmcepat.com`.
5. Coexistence NOT required — old `local:`/`r2:` refs are wiped (no migration). Confirm a fresh DB has no storage refs.
6. `bun run verify` before handoff; CI runs build + full suite.

## Out of scope

- Automated R2→RustFS failover (manual env switch only).
- Migrating existing prod data between providers (one-shot script, not requested).
- Profile avatars (`.data/uploads/profile-avatars/`) — separate code path; migrate to S3 only if requested.
- Custom RustFS build/pinning — use the official RustFS image.
