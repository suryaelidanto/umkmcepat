# Unified R2 Storage — Two Buckets, One Toggle

**Status:** Design — awaiting approval.
**Date:** 2026-07-27.
**Author:** brainstorming session.

## Context

Today, three independent env toggles each govern a storage subsystem, all defaulting to `local`:

| Subsystem | Env var | File | What it stores |
|---|---|---|---|
| Waitlist evidence images | `OBJECT_STORAGE_PROVIDER` | `src/lib/object-storage.ts` | `waitlist/<uuid>.png` |
| Generated source/dist artifacts | `PROJECT_ARTIFACT_STORAGE_PROVIDER` | `src/lib/projects/runtime-artifacts.ts` | built website files |
| Project display media + references | `PROJECT_ASSET_STORAGE_PROVIDER` | `src/lib/projects/project-assets.ts` | business-image, logo, reference |

The user wants one thing: flip one toggle → everything cloud, nothing on local disk. Reasons: local disk is fragile (wipes on redeploy, no backup, ties the app to one box); R2 is durable and survives restarts.

Two subsystems have **no R2 path at all** today and were silently stuck on local regardless of any toggle:

- **Thumbnails** (`src/lib/projects/project-thumbnail.ts`) — server-side screenshot `.jpg`s, `project-thumbnail:local:` prefix only, served via the auth'd `/api/projects/$id/thumbnail` route. No R2 code.
- **References** (`writeProjectAsset` with `kind: "reference"`) — hardcoded to local even when `PROJECT_ASSET_STORAGE_PROVIDER=r2`, by design (AI-input-only, never displayed). No R2 path.

A latent bug also surfaced: **waitlist evidence images are stored but never rendered.** `src/routes/_main.admin.tsx` receives `imageRef` (line 32) and renders nothing — no `<img>`, no serve route exists. So moving waitlist images to a *private* bucket means we must also add an auth-gated serve route, or the admin feature stays dead data.

### Privacy constraint

R2 public access is **bucket-level** — one public bucket makes every object in it publicly fetchable by URL. Display media (logos, business images) must be public (they appear on live sites and the server redirects the browser straight to R2 for zero egress). That forces two buckets:

- **Public bucket** — public access ON. Logos, business images, generated artifacts. Browser-direct via `R2_PUBLIC_BASE_URL`.
- **Private bucket** — public access OFF. Waitlist evidence, references, thumbnails. Server-proxied reads only.

### Coexistence (non-negotiable)

Every stored object carries a **ref** in the DB encoding where it lives:

```
object:local:waitlist/abc.png          → local disk
object:r2:waitlist/abc.png              → private R2 bucket
project-asset:local:p/u/business-image/x.png  → local disk
project-asset:r2:p/u/business-image/x.png     → public R2 bucket
project-asset:local:p/u/reference/x.png       → local disk (reference)
project-asset:r2-private:p/u/reference/x.png   → private R2 bucket (reference)
project-artifact:local:dist:xyz        → local disk
project-artifact:r2:dist:xyz           → public R2 bucket
project-thumbnail:local:proj           → local disk
project-thumbnail:r2-private:proj      → private R2 bucket
```

**Read follows the ref prefix, not the env toggle.** Old local data keeps reading from disk after the toggle flips to R2; new writes go to R2. No migration script, no orphaned data, local + R2 coexist forever. This is already true for the three existing subsystems; the new R2 paths for thumbnails and references follow the same pattern.

## Design

### Env (one toggle, two buckets)

Collapse three provider toggles into one. Keep credentials shared.

```env
# Object storage — one toggle for everything. local = disk (.data/), r2 = Cloudflare.
STORAGE_PROVIDER="local"

# R2 (used when STORAGE_PROVIDER=r2). Same account/credentials, two buckets.
R2_ACCOUNT_ID="..."
R2_ACCESS_KEY_ID="..."
R2_SECRET_ACCESS_KEY="..."
R2_PUBLIC_BUCKET="umkmcepat-public"     # public access ON — logos, business images, generated sites
R2_PRIVATE_BUCKET="umkmcepat-private"   # public access OFF — waitlist photos, references, thumbnails
R2_PUBLIC_BASE_URL="https://pub-xxx.r2.dev"   # public bucket's public domain (for browser-direct)
```

Removed: `OBJECT_STORAGE_PROVIDER`, `PROJECT_ASSET_STORAGE_PROVIDER`, `PROJECT_ARTIFACT_STORAGE_PROVIDER`, `R2_BUCKET`. The three `*_R2_PREFIX` vars (`OBJECT_STORAGE_R2_PREFIX`, `PROJECT_ASSET_R2_PREFIX`, `PROJECT_ASSET_R2_PREFIX`) collapse into per-subsystem **hardcoded prefixes** (they never varied in practice): `objects/`, `project-artifacts/`, `project-assets/`, `project-thumbnails/`. Local mode keeps the existing `*_DIR` paths unchanged.

### `r2-client.ts` (shared, extended)

`getR2Config` gains a `bucket: "public" | "private"` selector instead of one `R2_BUCKET`. Returns a config pointing at the chosen bucket. `signedR2Fetch`, `publicUrlFor`, `r2ObjectUrl` all already operate on `config.bucket` — no signature logic changes. `publicUrlFor` keeps requiring `R2_PUBLIC_BASE_URL` (public bucket only).

New helper for private reads: `signedR2Fetch` already supports `GET`; no new signing needed. Private reads just call `signedR2Fetch(privateConfig, key, { method: "GET" })` — no public base URL involved.

### Provider resolution

One function reads the single toggle, validated:

```ts
export function getStorageProvider(): "local" | "r2" { /* STORAGE_PROVIDER, default "local" */ }
```

Each subsystem calls this instead of its own `getObjectStorageProvider` / `getProjectArtifactProvider` / `getProjectAssetStorageProvider`. The three old functions are deleted (deletion over addition).

### Subsystem wiring

**1. `object-storage.ts` (waitlist images) → private bucket.**
- `putStoredObject`: provider=r2 → write to **private** bucket under `objects/` prefix (keep current prefix logic, hardcoded now). Ref becomes `object:r2:<key>`.
- `getStoredObject`: ref `object:r2:` → signed GET from private bucket.
- New auth-gated serve route `src/routes/api.admin.waitlist.image.$entryId.ts` (admin-only): loads entry, `getStoredObject(imageRef)`, streams bytes. `src/routes/_main.admin.tsx` renders `<img src={`/api/admin/waitlist/image/${entry.id}`}>` when `imageRef` set. Fixes the dead-data bug.

**2. `runtime-artifacts.ts` (source/dist artifacts) → public bucket.**
- `writeProjectArtifactFiles`: provider=r2 → write to **public** bucket (so generated sites are browser-servable). Existing `{...config, prefix: ""}` double-prefix pattern preserved. Ref `project-artifact:r2:<kind>:<id>` unchanged.
- `readR2ProjectArtifact` / `deleteR2ProjectArtifact`: target public bucket.
- Readiness check (`artifact-storage-readiness.ts`): when provider=r2, validate both buckets' creds exist.

**3. `project-assets.ts` (display media + references) → split buckets.**
- `writeProjectAsset`:
  - `isDisplayKind(kind)` (business-image, logo) → **public** bucket, returns `publicUrl` (browser-direct). Ref `project-asset:r2:<key>`.
  - `kind === "reference"` → **private** bucket, no publicUrl. Ref `project-asset:r2-private:<key>` (new prefix for private assets).
- `readProjectAsset` / `deleteProjectAsset`: branch on ref prefix — `r2:` → public bucket, `r2-private:` → private bucket.

**4. `project-thumbnail.ts` (screenshots) → private bucket (NEW R2 path).**
- Add `R2_REF_PREFIX = "project-thumbnail:r2-private:"` alongside existing `local:`.
- `writeProjectThumbnail`: provider=r2 → write `.jpg` to **private** bucket under `project-thumbnails/` prefix. Ref `project-thumbnail:r2-private:<projectId>`.
- `readProjectThumbnail` / `deleteProjectThumbnail`: branch on ref prefix. The existing auth'd `/api/projects/$id/thumbnail` route already proxies bytes — it just calls `readProjectThumbnail(ref)`, so it works for R2 refs unchanged (server signs GET, streams to browser). No new route needed.

### What stays local always

Nothing, in r2 mode. Local mode (`STORAGE_PROVIDER=local`) keeps the current `.data/` layout and behavior exactly as today — zero-config dev default, every path already local-first. The `PROJECT_RUNTIME_SUPERVISOR` var is **not** storage and stays untouched (it picks the preview-container runner, unrelated to R2).

### Backward compatibility / migration

None required. Existing DB rows with `local:` refs keep reading from disk. New uploads in r2 mode get `r2:` / `r2-private:` refs and read from R2. A user who flips local→r2 mid-life sees old assets still serve (from disk) and new assets serve from R2. No migration script, no data move. (If someone *wants* to migrate old local objects to R2, that's a separate one-shot script — out of scope here, YAGNI until requested.)

## Files to change

**Code (7):**
- `src/lib/r2-client.ts` — `getR2Config` takes `bucket: "public"|"private"`; reads `R2_PUBLIC_BUCKET`/`R2_PRIVATE_BUCKET`.
- `src/lib/object-storage.ts` — use `getStorageProvider()`, write/read private bucket, hardcoded `objects/` prefix.
- `src/lib/projects/runtime-artifacts.ts` — use `getStorageProvider()`, target public bucket.
- `src/lib/projects/project-assets.ts` — use `getStorageProvider()`, split public/private by kind, new `r2-private:` ref prefix.
- `src/lib/projects/project-thumbnail.ts` — add R2-private write/read/delete path.
- `src/lib/projects/artifact-storage-readiness.ts` — validate both buckets when r2.
- `src/routes/_main.admin.tsx` — render waitlist image via new route.

**New (1):**
- `src/routes/api.admin.waitlist.image.$entryId.ts` — admin-only serve route (proxy private-bucket bytes).

**Tests (update to new env shape, add R2-private cases):**
- `src/lib/r2-client.test.ts`, `src/lib/object-storage.test.ts`, `src/lib/projects/project-assets.test.ts`, `src/lib/projects/runtime-artifacts.test.ts`, `src/lib/projects/project-thumbnail.test.ts`, `src/lib/projects/artifact-storage-readiness.test.ts`, `src/lib/production-config.test.ts`.

**Env + docs (must stay 1:1 per the env-declaration rule):**
- `.env`, `.env.example` — collapse to `STORAGE_PROVIDER` + two buckets; remove 3 old toggles + `R2_BUCKET`; keep `*_DIR` local paths.
- `docs/architecture.md` (~line 200-210 storage table) — new single-toggle + two-bucket model.
- `docs/deployment.md` (~line 90) — prod env list updated.
- `CLAUDE.md` / `AGENTS.md` boundaries section — note `r2-client.ts` now two-bucket.

## Verification

1. `bun run check` — format/lint/typecheck/affected tests/Knip green.
2. `R2_LIVE_TEST=1 bun test src/lib/r2-client.test.ts` — live round-trip against **both** buckets (extend the live test to PUT/GET/DELETE on public and private).
3. Local mode smoke: `STORAGE_PROVIDER=local` → upload a logo (local), generate a project (local artifact), confirm `.data/` writes happen and existing tests pass unchanged.
4. R2 mode smoke: `STORAGE_PROVIDER=r2` →
   - Upload a logo → confirm `project-assets/<...>/logo/<id>.png` appears in **public** bucket; `/media/<assetId>` 302s to the public R2 URL; image renders in workspace.
   - Submit a waitlist entry with a photo → confirm `objects/waitlist/<id>.png` in **private** bucket; direct R2 URL returns 403; `/api/admin/waitlist/image/<entryId>` (as admin) returns the bytes; admin page renders it.
   - Generate a project → confirm `project-artifacts/dist/<id>/...` in **public** bucket; preview serves.
   - Capture a thumbnail → confirm `project-thumbnails/<id>.jpg` in **private** bucket; `/api/projects/$id/thumbnail` (auth'd) returns it.
   - Reference image upload (purpose `reference`) → confirm it lands in **private** bucket under `project-assets/`; ref is `project-asset:r2-private:...`.
5. Coexistence: flip local→r2, confirm an old local-ref asset still serves (read follows ref).
6. `bun run verify` before handoff; CI runs build + full suite.

## Out of scope

- Migrating existing local objects to R2 (separate script, not requested).
- `PROJECT_RUNTIME_SUPERVISOR` (not storage).
- Profile avatars (`.data/uploads/profile-avatars/`) — separate code path, not touched unless requested.