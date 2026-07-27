# Unified R2 Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse three storage toggles into one `STORAGE_PROVIDER` (local|r2) backed by two R2 buckets (public + private), extending thumbnails and references to R2-private so nothing stays on local disk in r2 mode.

**Architecture:** One validated toggle drives every storage subsystem. Public bucket (public access ON) holds display media + generated artifacts, served browser-direct via redirect. Private bucket (public access OFF) holds waitlist photos, references, thumbnails, served via auth-gated server-proxy routes that sign GETs with the shared Sig V4 client. Reads branch on the ref prefix (`local:` vs `r2:` vs `r2-private:`), so local + R2 coexist with no migration.

**Tech Stack:** Bun, TanStack Router/Start (Nitro server), Prisma, Vitest, AWS Sig V4 over `fetch` (shared `r2-client.ts`).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-27-unified-r2-storage-design.md`.
- Env-declaration rule: every spec-referenced env var declared 1:1 in `.env` AND `.env.example`.
- One `STORAGE_PROVIDER` toggle replaces `OBJECT_STORAGE_PROVIDER`, `PROJECT_ASSET_STORAGE_PROVIDER`, `PROJECT_ARTIFACT_STORAGE_PROVIDER`. `R2_BUCKET` replaced by `R2_PUBLIC_BUCKET` + `R2_PRIVATE_BUCKET`. The three `*_R2_PREFIX` env vars removed; prefixes hardcoded.
- Reads follow ref prefix — never orphan existing local data. Local mode behavior unchanged.
- User-facing copy Indonesian; code/logs/errors English.
- Atomic commits to `dev`; stage only your own changes; pre-commit auto-fixes staged.
- `PROJECT_RUNTIME_SUPERVISOR` is NOT storage — leave untouched.
- Profile avatars out of scope — separate code path, do not touch.

---

## File Structure

**Modified:**
- `src/lib/r2-client.ts` — `getR2Config({ bucket })` selects public/private; removes `R2_BUCKET` single-bucket read.
- `src/lib/storage-provider.ts` (NEW, tiny) — single `getStorageProvider()` validator; the one place the toggle is read.
- `src/lib/object-storage.ts` — waitlist images → private bucket; use `getStorageProvider()`.
- `src/lib/projects/runtime-artifacts.ts` — artifacts → public bucket; use `getStorageProvider()`.
- `src/lib/projects/project-assets.ts` — display media → public, references → private; new `r2-private:` ref prefix; use `getStorageProvider()`.
- `src/lib/projects/project-thumbnail.ts` — add R2-private write/read/delete; use `getStorageProvider()`.
- `src/lib/projects/artifact-storage-readiness.ts` — validate both buckets when r2; use `getStorageProvider()`.
- `src/lib/production-config.ts` — update env name reference if it checks the old var.
- `src/routes/_main.admin.tsx` — render waitlist image via new route.
- `.env`, `.env.example` — collapse env block.
- `docs/architecture.md`, `docs/deployment.md` — storage table + prod env list.

**New:**
- `src/lib/storage-provider.ts` — the toggle reader.
- `src/routes/api.admin.waitlist.image.$entryId.ts` — admin-only serve route (proxy private-bucket bytes).

**Tests (update):**
- `src/lib/r2-client.test.ts`, `src/lib/object-storage.test.ts`, `src/lib/projects/project-assets.test.ts`, `src/lib/projects/runtime-artifacts.test.ts`, `src/lib/projects/project-thumbnail.test.ts`, `src/lib/projects/artifact-storage-readiness.test.ts`, `src/lib/production-config.test.ts`.

---

## Task 1: Storage-provider toggle reader

**Files:**
- Create: `src/lib/storage-provider.ts`
- Test: `src/lib/storage-provider.test.ts`

**Interfaces:**
- Produces: `getStorageProvider(): "local" | "r2"` — reads `STORAGE_PROVIDER` (default `"local"`), lowercased, validated; throws on unknown values. Single source of truth; all subsystems import this.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/storage-provider.test.ts
import { afterEach, describe, expect, it } from "vitest";

import { getStorageProvider } from "@/lib/storage-provider";

describe("storage provider", () => {
  afterEach(() => {
    delete process.env.STORAGE_PROVIDER;
  });

  it("defaults to local", () => {
    delete process.env.STORAGE_PROVIDER;
    expect(getStorageProvider()).toBe("local");
  });

  it("returns r2 when set", () => {
    process.env.STORAGE_PROVIDER = "r2";
    expect(getStorageProvider()).toBe("r2");
  });

  it("rejects unknown values", () => {
    process.env.STORAGE_PROVIDER = "s3";
    expect(() => getStorageProvider()).toThrow(/STORAGE_PROVIDER/);
  });

  it("is case-insensitive", () => {
    process.env.STORAGE_PROVIDER = "R2";
    expect(getStorageProvider()).toBe("r2");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/lib/storage-provider.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/storage-provider.ts
import { getEnv } from "@/lib/config";

export type StorageProvider = "local" | "r2";

export function getStorageProvider(): StorageProvider {
  const provider = getEnv("STORAGE_PROVIDER", "local").toLowerCase();
  if (provider === "local" || provider === "r2") {
    return provider;
  }
  throw new Error(
    `Invalid STORAGE_PROVIDER '${provider}'. Supported values: local, r2.`,
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/lib/storage-provider.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage-provider.ts src/lib/storage-provider.test.ts
git commit -m "feat(storage): add single STORAGE_PROVIDER toggle reader"
```

---

## Task 2: r2-client two-bucket config

**Files:**
- Modify: `src/lib/r2-client.ts:13-28`
- Test: `src/lib/r2-client.test.ts` (env shape updated for two buckets)

**Interfaces:**
- Produces: `getR2Config({ bucket: "public" | "private", prefix: string }): R2Config` — `R2Config.bucket` now sourced from `R2_PUBLIC_BUCKET` or `R2_PRIVATE_BUCKET`. Prefix is now a required explicit arg (no env-based prefix). `publicUrlFor` and `signedR2Fetch` unchanged (they already use `config.bucket`/`config.prefix`).
- Removes: `R2_PREFIX`, `prefixEnv`, `prefixFallback` options.

- [ ] **Step 1: Write the failing test (update existing test env + add private-bucket case)**

Replace `BASE_ENV` in `src/lib/r2-client.test.ts`:

```ts
const BASE_ENV = {
  R2_ACCESS_KEY_ID: "AKIA-test",
  R2_ACCOUNT_ID: "acct",
  R2_PUBLIC_BUCKET: "umkmcepat-public",
  R2_PRIVATE_BUCKET: "umkmcepat-private",
  R2_PUBLIC_BASE_URL: "https://pub-test.r2.dev",
  R2_SECRET_ACCESS_KEY: "shh",
};
```

Replace the `getR2Config` tests:

```ts
it("getR2Config reads required vars + public bucket", () => {
  const config = getR2Config({ bucket: "public", prefix: "objects" });
  expect(config).toMatchObject({
    accessKeyId: "AKIA-test",
    accountId: "acct",
    bucket: "umkmcepat-public",
    prefix: "objects",
    secretAccessKey: "shh",
  });
});

it("getR2Config selects the private bucket", () => {
  const config = getR2Config({ bucket: "private", prefix: "objects" });
  expect(config.bucket).toBe("umkmcepat-private");
});

it("getR2Config throws when the public bucket var is missing", () => {
  delete process.env.R2_PUBLIC_BUCKET;
  expect(() => getR2Config({ bucket: "public", prefix: "x" })).toThrow(
    /R2_PUBLIC_BUCKET/,
  );
});

it("getR2Config throws when the private bucket var is missing", () => {
  delete process.env.R2_PRIVATE_BUCKET;
  expect(() => getR2Config({ bucket: "private", prefix: "x" })).toThrow(
    /R2_PRIVATE_BUCKET/,
  );
});

it("publicUrlFor builds an absolute public URL with prefix", () => {
  const config = getR2Config({ bucket: "public", prefix: "project-assets" });
  expect(publicUrlFor(config, "proj1/owner1/business-image/abc.png")).toBe(
    "https://pub-test.r2.dev/project-assets/proj1/owner1/business-image/abc.png",
  );
});

it("publicUrlFor throws when R2_PUBLIC_BASE_URL is empty", () => {
  delete process.env.R2_PUBLIC_BASE_URL;
  const config = getR2Config({ bucket: "public", prefix: "x" });
  expect(() => publicUrlFor(config, "x")).toThrow(/R2_PUBLIC_BASE_URL/);
});
```

Update the live round-trip test to hit the public bucket:

```ts
const config = getR2Config({ bucket: "public", prefix: "objects" });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/lib/r2-client.test.ts`
Expected: FAIL — `getR2Config` still reads `R2_BUCKET`, signature mismatch.

- [ ] **Step 3: Write minimal implementation**

Replace `getR2Config` in `src/lib/r2-client.ts`:

```ts
export function getR2Config(opts: {
  bucket: "public" | "private";
  prefix: string;
}): R2Config {
  const bucketEnv =
    opts.bucket === "public" ? "R2_PUBLIC_BUCKET" : "R2_PRIVATE_BUCKET";
  return {
    accessKeyId: requiredEnv("R2_ACCESS_KEY_ID"),
    accountId: requiredEnv("R2_ACCOUNT_ID"),
    bucket: requiredEnv(bucketEnv),
    prefix: opts.prefix.trim().replace(/^\/+|\/+$/g, ""),
    secretAccessKey: requiredEnv("R2_SECRET_ACCESS_KEY"),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/lib/r2-client.test.ts`
Expected: PASS (all unit tests). Live test still skipped without `R2_LIVE_TEST=1`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/r2-client.ts src/lib/r2-client.test.ts
git commit -m "feat(r2): select public/private bucket in getR2Config"
```

---

## Task 3: Env + docs collapse (1:1)

**Files:**
- Modify: `.env` and `.env.example` — replace the 3 provider toggles + `R2_BUCKET` + 3 `*_R2_PREFIX` vars with `STORAGE_PROVIDER` + two buckets. Keep `*_DIR` local paths.
- Modify: `docs/architecture.md` storage table (~line 200-210), `docs/deployment.md` prod env list (~line 90).

**Interfaces:**
- Produces: the canonical env block all later tasks read.

- [ ] **Step 1: Edit `.env`**

Replace the existing object-storage + R2 block. Find the lines:

```env
# Object storage (local | r2; R2 reserved for the Cloudflare adapter).
OBJECT_STORAGE_PROVIDER="local"
LOCAL_UPLOAD_DIR=".data/uploads"
```
and
```env
# Generated source/dist storage (local path for dev; prod mounts /app/.data/project-artifacts).
PROJECT_ARTIFACT_STORAGE_PROVIDER="local"
PROJECT_ARTIFACT_DIR=".data/project-artifacts"
```
and
```env
# R2 object storage (used when OBJECT_STORAGE_PROVIDER=r2).
R2_ACCOUNT_ID=""
R2_ACCESS_KEY_ID=""
R2_SECRET_ACCESS_KEY=""
R2_BUCKET="umkmcepat-dev"
R2_PUBLIC_BASE_URL=""
```
and
```env
# Project display-media storage (local | r2; r2 = public R2 for business-image/logo).
PROJECT_ASSET_STORAGE_PROVIDER="local"
# R2 key prefix for project assets (mirrors OBJECT_STORAGE_R2_PREFIX / PROJECT_ARTIFACT_R2_PREFIX).
PROJECT_ASSET_R2_PREFIX="project-assets"
```
and the `PROJECT_ARTIFACT_R2_PREFIX="project-artifacts"` line.

Replace with (keep `LOCAL_UPLOAD_DIR` and the `*_DIR` paths where they already are):

```env
# Object storage — one toggle for everything. local = disk (.data/), r2 = Cloudflare.
STORAGE_PROVIDER="local"
LOCAL_UPLOAD_DIR=".data/uploads"
PROJECT_ARTIFACT_DIR=".data/project-artifacts"
PROJECT_ASSET_DIR=".data/project-assets"
PROJECT_THUMBNAIL_DIR=".data/project-thumbnails"

# R2 (used when STORAGE_PROVIDER=r2). Same account/credentials, two buckets.
R2_ACCOUNT_ID=""
R2_ACCESS_KEY_ID=""
R2_SECRET_ACCESS_KEY=""
R2_PUBLIC_BUCKET="umkmcepat-public"
R2_PRIVATE_BUCKET="umkmcepat-private"
R2_PUBLIC_BASE_URL=""
```

Note: `R2_PUBLIC_BUCKET`/`R2_PRIVATE_BUCKET` values here are placeholders — the user must create both buckets in Cloudflare and set public access ON for the public one. Flag this in the commit body.

- [ ] **Step 2: Mirror exactly in `.env.example`**

Apply the identical edit, but with empty/redacted secret values where the example redacts (match the existing redaction style — the `.env.example` already redacts `R2_SECRET_ACCESS_KEY`).

- [ ] **Step 3: Update `docs/architecture.md` storage table**

Replace the row referencing `PROJECT_ASSET_STORAGE_PROVIDER` and add the unified model. Update the table (~line 200-210) to:

```md
| Storage provider | `STORAGE_PROVIDER` | `local` | `src/lib/storage-provider.ts` — single toggle drives waitlist images, project artifacts, project assets, thumbnails |
| Public R2 bucket | `R2_PUBLIC_BUCKET` | — | `src/lib/r2-client.ts` — logos, business images, generated artifacts (browser-direct via `R2_PUBLIC_BASE_URL`) |
| Private R2 bucket | `R2_PRIVATE_BUCKET` | — | `src/lib/r2-client.ts` — waitlist photos, references, thumbnails (server-proxied, auth-gated) |
```

- [ ] **Step 4: Update `docs/deployment.md` prod env list (~line 90)**

Replace `PROJECT_ASSET_STORAGE_PROVIDER="local"` and adjacent storage lines with:

```env
STORAGE_PROVIDER="r2"
R2_PUBLIC_BUCKET="umkmcepat-prod-public"
R2_PRIVATE_BUCKET="umkmcepat-prod-private"
R2_PUBLIC_BASE_URL=""
```

- [ ] **Step 5: Verify 1:1 invariant**

Run: `diff <(sed 's/=".*"/=""/' .env.example) <(sed 's/=".*"/=""/' .env)`
Expected: empty (keys match 1:1; only values differ). If a key appears in one but not the other, fix it.

- [ ] **Step 6: Commit**

```bash
git add .env.example docs/architecture.md docs/deployment.md
git commit -m "docs(env): collapse 3 storage toggles to one STORAGE_PROVIDER + two buckets

Note: R2_PUBLIC_BUCKET/R2_PRIVATE_BUCKET in .env are placeholders; create both
buckets in Cloudflare and enable public access on the public one."
```

(Do NOT commit `.env` — it is gitignored. Only `.env.example` is committed.)

---

## Task 4: object-storage.ts → private bucket + getStorageProvider

**Files:**
- Modify: `src/lib/object-storage.ts:5,23-33,118-158`
- Test: `src/lib/object-storage.test.ts`

**Interfaces:**
- Consumes: `getStorageProvider()` (Task 1), `getR2Config({ bucket: "private", prefix: "objects" })` (Task 2).
- Produces: `putStoredObject` writes private-bucket ref `object:r2:<key>`; `getStoredObject` reads `object:r2:` via signed GET. `getObjectStorageProvider` deleted (callers move to `getStorageProvider`).

- [ ] **Step 1: Write the failing test**

Add to `src/lib/object-storage.test.ts` a provider-switch + R2 prefix test (mock `signedR2Fetch` to avoid network):

```ts
import { vi } from "vitest";
import { putStoredObject } from "@/lib/object-storage";

vi.mock("@/lib/r2-client", () => ({
  getR2Config: () => ({ accessKeyId: "a", accountId: "b", bucket: "priv", prefix: "objects", secretAccessKey: "s" }),
  signedR2Fetch: vi.fn(async () => new Response(null, { status: 200 })),
}));

describe("object-storage provider switch", () => {
  afterEach(() => {
    delete process.env.STORAGE_PROVIDER;
  });

  it("writes an r2 ref when STORAGE_PROVIDER=r2", async () => {
    process.env.STORAGE_PROVIDER = "r2";
    const ref = await putStoredObject({
      body: Buffer.from("x"),
      contentType: "image/png",
      key: "waitlist/abc.png",
    });
    expect(ref).toBe("object:r2:waitlist/abc.png");
  });
});
```

Also update existing tests that set `OBJECT_STORAGE_PROVIDER` to instead set `STORAGE_PROVIDER` (replace `process.env.OBJECT_STORAGE_PROVIDER = "local"` → `process.env.STORAGE_PROVIDER = "local"`, and `delete process.env.OBJECT_STORAGE_PROVIDER` → `delete process.env.STORAGE_PROVIDER`).

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/lib/object-storage.test.ts`
Expected: FAIL — still reads `OBJECT_STORAGE_PROVIDER`, ref is `object:local:...`.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/object-storage.ts`, replace the provider reader and `r2Config`:

```ts
import { getStorageProvider } from "@/lib/storage-provider";
import { getR2Config, signedR2Fetch } from "@/lib/r2-client";

// ... delete getObjectStorageProvider entirely ...

function r2Config() {
  return getR2Config({ bucket: "private", prefix: "objects" });
}

export async function putStoredObject(input: UploadObjectInput) {
  const provider = getStorageProvider();
  const key = normalizeObjectKey(input.key);

  if (provider === "r2") {
    await putR2StoredObject(key, input.body, input.contentType);
    return `${R2_REF_PREFIX}${key}`;
  }
  // ... local branch unchanged ...
}
```

Delete the `getObjectStorageProvider` export. Update `getStoredObject`'s r2 branch to use the private `r2Config()` (already does — just confirm). Search for any external `getObjectStorageProvider` import and switch it to `getStorageProvider` (run `grep -rn "getObjectStorageProvider" src/` — fix all hits).

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/lib/object-storage.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/object-storage.ts src/lib/object-storage.test.ts
git commit -m "feat(storage): route waitlist images to private R2 bucket"
```

---

## Task 5: runtime-artifacts.ts → public bucket + getStorageProvider

**Files:**
- Modify: `src/lib/projects/runtime-artifacts.ts:14,411-424,473-487`
- Test: `src/lib/projects/runtime-artifacts.test.ts`

**Interfaces:**
- Consumes: `getStorageProvider()` (Task 1), `getR2Config({ bucket: "public", prefix: "project-artifacts" })` (Task 2).
- Produces: `getProjectArtifactProvider` deleted; `artifactR2Config()` targets public bucket. Existing `{...config, prefix: ""}` double-prefix pattern preserved.

- [ ] **Step 1: Write the failing test**

In `src/lib/projects/runtime-artifacts.test.ts`, mock `signedR2Fetch` and `getR2Config`, then assert writes target a bucket named `"pub-artifacts"`:

```ts
import { vi } from "vitest";

vi.mock("@/lib/r2-client", () => ({
  getR2Config: () => ({ accessKeyId: "a", accountId: "b", bucket: "pub-artifacts", prefix: "project-artifacts", secretAccessKey: "s" }),
  signedR2Fetch: vi.fn(async (_c: unknown, _k: string, i: { method: string }) =>
    i.method === "GET" ? new Response("{}", { status: 200 }) : new Response(null, { status: 200 }),
  ),
  R2Config: {} as never,
}));
```

Add a test setting `STORAGE_PROVIDER=r2` (replacing existing `process.env.PROJECT_ARTIFACT_STORAGE_PROVIDER = "r2"` lines at 206 and 236) and assert the mock `signedR2Fetch` was called and the returned ref starts with `project-artifact:r2:`. Confirm `signedR2Fetch` received a config with `bucket: "pub-artifacts"`.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/lib/projects/runtime-artifacts.test.ts`
Expected: FAIL — reads `PROJECT_ARTIFACT_STORAGE_PROVIDER`.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/projects/runtime-artifacts.ts`:

```ts
import { getStorageProvider } from "@/lib/storage-provider";
import { getR2Config, signedR2Fetch } from "@/lib/r2-client";

// replace getProjectArtifactProvider():
function getProjectArtifactProvider(): ProjectArtifactProvider {
  return getStorageProvider();
}

// artifactR2Config():
function artifactR2Config(): R2Config {
  return getR2Config({ bucket: "public", prefix: "project-artifacts" });
}
```

The `putR2Object`/`getR2Object`/`deleteR2Object` wrappers already pass `{ ...config, prefix: "" }` — leave that intact.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/lib/projects/runtime-artifacts.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/projects/runtime-artifacts.ts src/lib/projects/runtime-artifacts.test.ts
git commit -m "feat(storage): route project artifacts to public R2 bucket"
```

---

## Task 6: project-assets.ts → split public/private by kind + r2-private ref

**Files:**
- Modify: `src/lib/projects/project-assets.ts:8-11,27-38,44-49,160-216,218-272`
- Test: `src/lib/projects/project-assets.test.ts`

**Interfaces:**
- Consumes: `getStorageProvider()` (Task 1), `getR2Config({ bucket: "public"|"private", prefix: "project-assets" })` (Task 2).
- Produces:
  - `writeProjectAsset`: display kinds → public bucket, ref `project-asset:r2:<key>`, returns `publicUrl`; `reference` kind → private bucket, ref `project-asset:r2-private:<key>`, `publicUrl: null`.
  - `readProjectAsset`/`deleteProjectAsset`: branch on `r2:` (public) vs `r2-private:` (private).
  - `parseProjectAssetRef` accepts `project-asset:r2-private:...`.
  - `getProjectAssetStorageProvider` deleted.

- [ ] **Step 1: Write the failing test**

In `src/lib/projects/project-assets.test.ts`, mock the r2 client and add:

```ts
import { vi } from "vitest";

const r2FetchMock = vi.fn(async (_c: unknown, _k: string, i: { method: string }) =>
  i.method === "GET"
    ? new Response(pngBytes(), { status: 200 })
    : new Response(null, { status: 200 }),
);

vi.mock("@/lib/r2-client", () => ({
  getR2Config: vi.fn(({ bucket }: { bucket: string }) => ({
    accessKeyId: "a", accountId: "b",
    bucket: bucket === "public" ? "pub" : "priv",
    prefix: "project-assets",
    secretAccessKey: "s",
  })),
  publicUrlFor: (_c: unknown, key: string) => `https://pub-x.r2.dev/project-assets/${key}`,
  signedR2Fetch: r2FetchMock,
  R2Config: {} as never,
}));
```

Add tests (after the existing provider-switch block):

```ts
it("writes a logo to the public bucket with a publicUrl when r2", async () => {
  process.env.STORAGE_PROVIDER = "r2";
  const { publicUrl, ref } = await writeProjectAsset({
    bytes: pngBytes(), kind: "logo", projectId: "p1", userId: USER,
  });
  expect(ref).toMatch(/^project-asset:r2:/);
  expect(publicUrl).toMatch(/^https:\/\/pub-x/);
  const calledConfig = r2FetchMock.mock.calls[0][0];
  expect(calledConfig.bucket).toBe("pub");
});

it("writes a reference to the private bucket with no publicUrl when r2", async () => {
  process.env.STORAGE_PROVIDER = "r2";
  const { publicUrl, ref } = await writeProjectAsset({
    bytes: pngBytes(), kind: "reference", projectId: "p1", userId: USER,
  });
  expect(ref).toMatch(/^project-asset:r2-private:/);
  expect(publicUrl).toBeNull();
  const calledConfig = r2FetchMock.mock.calls.at(-1)?.[0];
  expect(calledConfig.bucket).toBe("priv");
});

it("parseProjectAssetRef accepts the r2-private prefix", () => {
  const parsed = parseProjectAssetRef(
    "project-asset:r2-private:p1/u1/reference/abc.png",
  );
  expect(parsed).toMatchObject({ kind: "reference", projectId: "p1", userId: "u1", ext: "png" });
});
```

Update the existing "rejects refs" / boundary tests: replace `process.env.PROJECT_ASSET_STORAGE_PROVIDER` with `process.env.STORAGE_PROVIDER`, and the `"s3"` rejection test to check `STORAGE_PROVIDER`.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/lib/projects/project-assets.test.ts`
Expected: FAIL — `getProjectAssetStorageProvider` still reads old var; no `r2-private` handling.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/projects/project-assets.ts`:

```ts
import { getStorageProvider } from "@/lib/storage-provider";

const REF_PREFIX = "project-asset:local:";
const LOCAL_REF_PREFIX = "project-asset:local:";
const R2_REF_PREFIX = "project-asset:r2:";
const R2_PRIVATE_REF_PREFIX = "project-asset:r2-private:";

// delete getProjectAssetStorageProvider; callers use getStorageProvider().

function assetR2Config(bucket: "public" | "private") {
  return getR2Config({ bucket, prefix: "project-assets" });
}
```

Update `writeProjectAsset`:

```ts
  const provider = getStorageProvider();
  if (provider === "r2" && isDisplayKind(kind)) {
    const config = assetR2Config("public");
    const response = await signedR2Fetch(config, relativeKey, {
      body: bytes, contentType: FORMAT_CONTENT_TYPES[format], method: "PUT",
    });
    if (!response.ok) throw new Error(`R2 asset write failed: ${response.status}`);
    return { publicUrl: publicUrlFor(config, relativeKey), ref: `${R2_REF_PREFIX}${relativeKey}` };
  }
  if (provider === "r2") {
    // reference → private bucket, never public
    const config = assetR2Config("private");
    const response = await signedR2Fetch(config, relativeKey, {
      body: bytes, contentType: FORMAT_CONTENT_TYPES[format], method: "PUT",
    });
    if (!response.ok) throw new Error(`R2 asset write failed: ${response.status}`);
    return { publicUrl: null, ref: `${R2_PRIVATE_REF_PREFIX}${relativeKey}` };
  }
  // local branch unchanged
```

Update `readProjectAsset` and `deleteProjectAsset` to branch:

```ts
  if (ref.startsWith(R2_PRIVATE_REF_PREFIX)) {
    const config = assetR2Config("private");
    // signed GET/DELETE on `${parsed.projectId}/${parsed.userId}/${parsed.kind}/${parsed.ulid}${ext}`
  } else if (ref.startsWith(R2_REF_PREFIX)) {
    const config = assetR2Config("public");
    // signed GET/DELETE (existing branch)
  }
```

Update `parseProjectAssetRef` to recognize `R2_PRIVATE_REF_PREFIX` (set `isR2` for both, prefix selection accordingly). Add `"r2-private"`-aware logic so the rest of parsing works.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/lib/projects/project-assets.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/projects/project-assets.ts src/lib/projects/project-assets.test.ts
git commit -m "feat(storage): split project assets — display to public, references to private R2"
```

---

## Task 7: project-thumbnail.ts → R2-private path

**Files:**
- Modify: `src/lib/projects/project-thumbnail.ts:11,18-21,34-72,310-318`
- Test: `src/lib/projects/project-thumbnail.test.ts`

**Interfaces:**
- Consumes: `getStorageProvider()` (Task 1), `getR2Config({ bucket: "private", prefix: "project-thumbnails" })` (Task 2).
- Produces:
  - `createProjectThumbnailRef` — unchanged (still local-prefixed; r2 ref built in write).
  - `writeProjectThumbnail`: provider=r2 → signed PUT to private bucket, ref `project-thumbnail:r2-private:<projectId>`.
  - `readProjectThumbnail`: branch on prefix; r2-private → signed GET.
  - `deleteProjectThumbnail`: branch on prefix; r2-private → signed DELETE.
  - `parseProjectThumbnailRef` accepts `project-thumbnail:r2-private:`.

- [ ] **Step 1: Write the failing test**

In `src/lib/projects/project-thumbnail.test.ts`, mock the r2 client and add:

```ts
import { vi } from "vitest";

const r2FetchMock = vi.fn(async (_c: unknown, _k: string, i: { method: string }) =>
  i.method === "GET"
    ? new Response(Buffer.from("jpeg-bytes"), { status: 200 })
    : new Response(null, { status: 200 }),
);

vi.mock("@/lib/r2-client", () => ({
  getR2Config: () => ({ accessKeyId: "a", accountId: "b", bucket: "priv", prefix: "project-thumbnails", secretAccessKey: "s" }),
  signedR2Fetch: r2FetchMock,
  R2Config: {} as never,
}));
```

Add tests:

```ts
it("writes a thumbnail to the private bucket when r2", async () => {
  process.env.STORAGE_PROVIDER = "r2";
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00, 0xff, 0xd9]); // minimal jpeg-ish; use a real minimal JPEG fixture as the file already does
  const ref = await writeProjectThumbnail({ bytes: realJpegFixture(), projectId: "proj-r2" });
  expect(ref).toBe("project-thumbnail:r2-private:proj-r2");
});

it("reads a thumbnail from the private bucket by r2-private ref", async () => {
  const bytes = await readProjectThumbnail("project-thumbnail:r2-private:proj-r2");
  expect(bytes.length).toBeGreaterThan(0);
});

it("parseProjectThumbnailRef accepts r2-private", () => {
  expect(parseProjectThumbnailRef("project-thumbnail:r2-private:proj-1")).toBe("proj-1");
});
```

Use the existing JPEG fixture builder already in the test file for `realJpegFixture()`.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/lib/projects/project-thumbnail.test.ts`
Expected: FAIL — no r2-private handling.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/projects/project-thumbnail.ts`:

```ts
import { getStorageProvider } from "@/lib/storage-provider";
import { getR2Config, signedR2Fetch } from "@/lib/r2-client";

const REF_PREFIX = "project-thumbnail:local:";
const R2_REF_PREFIX = "project-thumbnail:r2-private:";

export function parseProjectThumbnailRef(ref: string): string | null {
  const r2 = ref.startsWith(R2_REF_PREFIX);
  const local = !r2 && ref.startsWith(REF_PREFIX);
  if (!r2 && !local) return null;
  const id = ref.slice((r2 ? R2_REF_PREFIX : REF_PREFIX).length);
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(id)) return null;
  return id;
}

function thumbnailR2Config() {
  return getR2Config({ bucket: "private", prefix: "project-thumbnails" });
}
```

`writeProjectThumbnail`:

```ts
  if (getStorageProvider() === "r2") {
    const config = thumbnailR2Config();
    const key = `${projectId}.jpg`;
    const response = await signedR2Fetch(config, key, {
      body: bytes, contentType: "image/jpeg", method: "PUT",
    });
    if (!response.ok) throw new Error(`R2 thumbnail write failed: ${response.status}`);
    return `${R2_REF_PREFIX}${projectId}`;
  }
  // ... existing local branch ...
```

`readProjectThumbnail`:

```ts
  const projectId = parseRef(ref);
  if (ref.startsWith(R2_REF_PREFIX)) {
    const config = thumbnailR2Config();
    const response = await signedR2Fetch(config, `${projectId}.jpg`, { method: "GET" });
    if (!response.ok) throw new Error(`R2 thumbnail read failed: ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  }
  return readFile(path.join(resolveRoot(rootDir), `${projectId}.jpg`));
```

`deleteProjectThumbnail`:

```ts
  const projectId = parseRef(ref);
  if (ref.startsWith(R2_REF_PREFIX)) {
    const config = thumbnailR2Config();
    const response = await signedR2Fetch(config, `${projectId}.jpg`, { method: "DELETE" });
    if (!response.ok && response.status !== 404)
      throw new Error(`R2 thumbnail delete failed: ${response.status}`);
    return;
  }
  await rm(path.join(resolveRoot(rootDir), `${projectId}.jpg`), { force: true });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/lib/projects/project-thumbnail.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/projects/project-thumbnail.ts src/lib/projects/project-thumbnail.test.ts
git commit -m "feat(storage): add R2-private path for project thumbnails"
```

---

## Task 8: artifact-storage-readiness.ts → both buckets + getStorageProvider

**Files:**
- Modify: `src/lib/projects/artifact-storage-readiness.ts:7-22,61-72`
- Test: `src/lib/projects/artifact-storage-readiness.test.ts`

**Interfaces:**
- Consumes: `getStorageProvider()` (Task 1).
- Produces: `assertProjectArtifactStorageReady` validates both `R2_PUBLIC_BUCKET` + `R2_PRIVATE_BUCKET` when r2.

- [ ] **Step 1: Write the failing test**

Update `src/lib/projects/artifact-storage-readiness.test.ts`: replace `vi.stubEnv("PROJECT_ARTIFACT_STORAGE_PROVIDER", ...)` with `vi.stubEnv("STORAGE_PROVIDER", ...)`. Add:

```ts
it("validates both R2 buckets when r2", () => {
  vi.stubEnv("STORAGE_PROVIDER", "r2");
  vi.stubEnv("R2_PUBLIC_BUCKET", "pub");
  vi.stubEnv("R2_PRIVATE_BUCKET", "priv");
  vi.stubEnv("R2_ACCESS_KEY_ID", "a");
  vi.stubEnv("R2_ACCOUNT_ID", "acct");
  vi.stubEnv("R2_SECRET_ACCESS_KEY", "s");
  expect(assertProjectArtifactStorageReady()).resolves.toBeUndefined();
});

it("throws when the private bucket var is missing under r2", async () => {
  vi.stubEnv("STORAGE_PROVIDER", "r2");
  vi.stubEnv("R2_PUBLIC_BUCKET", "pub");
  delete process.env.R2_PRIVATE_BUCKET;
  await expect(assertProjectArtifactStorageReady()).rejects.toThrow(/R2_PRIVATE_BUCKET/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/lib/projects/artifact-storage-readiness.test.ts`
Expected: FAIL — reads old var, only checks one bucket.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/projects/artifact-storage-readiness.ts`:

```ts
import { getStorageProvider } from "@/lib/storage-provider";

export async function assertProjectArtifactStorageReady() {
  if (getStorageProvider() === "r2") {
    assertRequiredR2Config();
    return;
  }
  // local branch unchanged (delete the old var-read + invalid-value branch)
}

function assertRequiredR2Config() {
  for (const name of [
    "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY",
    "R2_PUBLIC_BUCKET", "R2_PRIVATE_BUCKET",
  ]) {
    if (!getEnv(name)) {
      throw new Error(`${name} is required for R2 project artifact storage.`);
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/lib/projects/artifact-storage-readiness.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/projects/artifact-storage-readiness.ts src/lib/projects/artifact-storage-readiness.test.ts
git commit -m "feat(storage): readiness validates both R2 buckets under STORAGE_PROVIDER"
```

---

## Task 9: admin waitlist image serve route + render

**Files:**
- Create: `src/routes/api.admin.waitlist.image.$entryId.ts`
- Modify: `src/routes/_main.admin.tsx:13,32,100-130`
- Test: `src/routes/-api.admin.waitlist.image.$entryId.test.ts`

**Interfaces:**
- Consumes: `requireAdmin()` (from `src/lib/waitlist.ts` admin path), `prisma.waitlistEntry.findUnique`, `getStoredObject` (Task 4).
- Produces: `GET /api/admin/waitlist/image/$entryId` → admin-only, returns the entry's image bytes with `Content-Type`, or 404 if no image.

- [ ] **Step 1: Write the failing test**

```ts
// src/routes/-api.admin.waitlist.image.$entryId.test.ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    waitlistEntry: {
      findUnique: vi.fn(async ({ where: { id } }: { where: { id: string } }) =>
        id === "has-img"
          ? { id: "has-img", imageRef: "object:local:waitlist/abc.png" }
          : id === "no-img"
            ? { id: "no-img", imageRef: null }
            : null,
      ),
    },
  },
}));

describe("admin waitlist image serve", () => {
  it("404s when the entry has no image", async () => {
    const { Route } = await import("@/routes/api.admin.waitlist.image.$entryId");
    const handler = Route.options.server!.handlers!.GET;
    const res = await handler({ params: { entryId: "no-img" } });
    expect(res.status).toBe(404);
  });
});
```

Mock `getStoredObject` to return bytes for the `has-img` case and assert a 200 + `Content-Type: image/png`. Mock `requireAdmin`/`auth` to return an admin session.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/routes/-api.admin.waitlist.image.$entryId.test.ts`
Expected: FAIL — route does not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/routes/api.admin.waitlist.image.$entryId.ts
import { createFileRoute } from "@tanstack/react-router";

import { prisma } from "@/lib/prisma";
import { getStoredObject } from "@/lib/object-storage";
import { requireAdmin } from "@/lib/waitlist"; // confirm exact export name

export const Route = createFileRoute("/api/admin/waitlist/image/$entryId")({
  server: {
    handlers: {
      // Admin-only: stream a waitlist entry's evidence image from storage.
      // Private bucket reads are server-proxied; the browser never sees the R2 URL.
      GET: async ({ params }) => {
        const admin = await requireAdmin();
        if (!admin.ok) {
          return new Response(null, { status: 401 });
        }
        const entry = await prisma.waitlistEntry.findUnique({
          where: { id: params.entryId },
          select: { imageRef: true },
        });
        if (!entry?.imageRef) {
          return new Response(null, { status: 404 });
        }
        const stored = await getStoredObject(entry.imageRef);
        if (!stored) {
          return new Response(null, { status: 404 });
        }
        return new Response(new Uint8Array(stored.body), {
          headers: {
            "Cache-Control": "private, max-age=31536000, immutable",
            "Content-Type": stored.contentType,
            "X-Content-Type-Options": "nosniff",
          },
        });
      },
    },
  },
});
```

Confirm the exact `requireAdmin` export by reading `src/lib/waitlist.ts` (grep `export.*requireAdmin|AdminCheck`); match the actual signature. If `requireAdmin` returns a redirect-style result, adapt the guard to its real shape.

- [ ] **Step 4: Render in admin page**

In `src/routes/_main.admin.tsx`, inside the `<li>` map (after the story paragraph, before the buttons), add:

```tsx
{entry.imageRef ? (
  <img
    alt={entry.businessName}
    className="mt-spacing-2 max-h-48 rounded-radius-md border border-surface-warm-white/10"
    src={`/api/admin/waitlist/image/${entry.id}`}
  />
) : null}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test src/routes/-api.admin.waitlist.image.$entryId.test.ts && bun run routes:generate`
Expected: test PASS; route tree regenerates without error.

- [ ] **Step 6: Commit**

```bash
git add src/routes/api.admin.waitlist.image.$entryId.ts src/routes/-api.admin.waitlist.image.$entryId.test.ts src/routes/_main.admin.tsx src/routeTree.gen.ts
git commit -m "feat(waitlist): admin-only serve route for waitlist evidence images"
```

---

## Task 10: production-config + stragglers + final gate

**Files:**
- Modify: `src/lib/production-config.ts:120` (if it reads the old var), `src/lib/production-config.test.ts:15`.
- Verify: no remaining references to removed env vars or deleted functions.

**Interfaces:**
- Produces: no broken references to `OBJECT_STORAGE_PROVIDER`, `PROJECT_ASSET_STORAGE_PROVIDER`, `PROJECT_ARTIFACT_STORAGE_PROVIDER`, `R2_BUCKET`, `getObjectStorageProvider`, `getProjectAssetStorageProvider`, `getProjectArtifactProvider`.

- [ ] **Step 1: Grep for stragglers**

Run: `grep -rn "OBJECT_STORAGE_PROVIDER\|PROJECT_ASSET_STORAGE_PROVIDER\|PROJECT_ARTIFACT_STORAGE_PROVIDER\|R2_BUCKET\|getObjectStorageProvider\|getProjectAssetStorageProvider\|getProjectArtifactProvider\|OBJECT_STORAGE_R2_PREFIX\|PROJECT_ASSET_R2_PREFIX\|PROJECT_ARTIFACT_R2_PREFIX" src/`
Expected: only matches inside test files being migrated this task (if any remain). Fix each to the new names.

- [ ] **Step 2: Update production-config if needed**

Read `src/lib/production-config.ts:120`. If it checks `PROJECT_ARTIFACT_STORAGE_PROVIDER !== "local"`, change it to `getStorageProvider() === "r2"`. Update `src/lib/production-config.test.ts` accordingly (set `STORAGE_PROVIDER` not the old var).

- [ ] **Step 3: Run the full local gate**

Run: `bun run check`
Expected: format + lint + typecheck + affected tests + Knip all green.

- [ ] **Step 4: Run the full test suite**

Run: `bun run test:full`
Expected: PASS.

- [ ] **Step 5: Live R2 round-trip against BOTH buckets (manual, requires real buckets)**

Create both buckets in Cloudflare (`umkmcepat-public` public access ON, `umkmcepat-private` public access OFF). Set in `.env`:
```env
STORAGE_PROVIDER="r2"
R2_PUBLIC_BUCKET="umkmcepat-public"
R2_PRIVATE_BUCKET="umkmcepat-private"
```
Run: `R2_LIVE_TEST=1 bun test src/lib/r2-client.test.ts`
Expected: live round-trip PASS on the public bucket. Then temporarily extend the live test to also PUT/GET/DELETE against `{ bucket: "private", prefix: "objects" }` and confirm the private bucket rejects unsigned (public) GETs (curl the `r2ObjectUrl` without signing → 403).

- [ ] **Step 6: Run verify before handoff**

Run: `bun run verify`
Expected: locks + route regen + format + lint + typecheck + full tests + Knip green.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore(storage): migrate production-config + clear straggler env refs"
```

---

## Verification (end-to-end, after all tasks)

1. `bun run check` green.
2. `R2_LIVE_TEST=1 bun test src/lib/r2-client.test.ts` — both buckets.
3. Local-mode smoke (`STORAGE_PROVIDER=local`): upload logo (local), generate project (local artifact), capture thumbnail (local) — `.data/` writes happen, existing tests pass.
4. R2-mode smoke (`STORAGE_PROVIDER=r2`):
   - Upload logo → `project-assets/.../logo/<id>.png` in **public** bucket; `/media/<assetId>` 302s to public R2 URL; renders in workspace.
   - Submit waitlist entry with photo → `objects/waitlist/<id>.png` in **private** bucket; direct R2 URL → 403; `/api/admin/waitlist/image/<entryId>` as admin returns bytes; admin page renders `<img>`.
   - Generate project → `project-artifacts/dist/<id>/...` in **public** bucket; preview serves.
   - Capture thumbnail → `project-thumbnails/<id>.jpg` in **private** bucket; `/api/projects/$id/thumbnail` (auth'd) returns it.
   - Reference upload (purpose `reference`) → **private** bucket under `project-assets/`; ref `project-asset:r2-private:...`.
5. Coexistence: flip local→r2; an old `local:`-ref asset still serves (read follows ref).
6. `bun run verify` before handoff; CI runs build + full suite.

## Out of scope

- Migrating existing local objects to R2 (separate script, not requested).
- `PROJECT_RUNTIME_SUPERVISOR` (not storage).
- Profile avatars (`.data/uploads/profile-avatars/`) — separate code path, not touched.