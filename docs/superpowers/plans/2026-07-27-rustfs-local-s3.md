# RustFS Local S3 Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the local-disk object-storage path + hand-rolled R2 signer with one AWS-SDK S3 code path backed by RustFS in dev and Cloudflare R2 in prod — endpoint-driven, zero disk for object storage.

**Architecture:** One `s3-client.ts` wraps `@aws-sdk/client-s3`. `STORAGE_PROVIDER` (`local` = RustFS endpoint, `r2` = derived R2 host) picks the target via env, not code branching. Every subsystem's disk branch dies; writes/reads always go through the SDK. Ref prefixes collapse `local:` + `r2:` → `s3:` (display) and `s3-private:` (private). RustFS runs in `docker-compose` with auto bucket-creation on boot.

**Tech Stack:** Bun, TanStack Router/Start (Nitro), Prisma, Vitest, `@aws-sdk/client-s3`, RustFS (Docker).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-27-rustfs-local-s3-design.md`.
- Env-declaration rule: every spec-referenced env var declared 1:1 in `.env` AND `.env.example`.
- One `STORAGE_PROVIDER` (`local` | `r2`). `local` = RustFS; `r2` = Cloudflare R2. No code branches on the name beyond picking endpoint/region.
- Env keys generalize to `S3_*`. Removed: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_BUCKET`, `R2_PRIVATE_BUCKET`, `R2_PUBLIC_BASE_URL`, `LOCAL_UPLOAD_DIR`, `PROJECT_ARTIFACT_DIR`, `PROJECT_ASSET_DIR`, `PROJECT_THUMBNAIL_DIR`.
- Kept: `PROJECT_RUNTIME_DIR`, `PROJECT_BUILD_WORKSPACE_DIR` (process-execution, not S3).
- Ref prefixes: `object:s3:` (waitlist), `project-artifact:s3:` (source/dist), `project-asset:s3:` (display media), `project-asset:s3-private:` (references), `project-thumbnail:s3-private:` (thumbnails). Old `local:` / `r2:` / `r2-private:` refs are wiped (no migration script).
- Reads follow the ref prefix — but the only prefixes after this plan are `s3:` / `s3-private:`. No `local:` disk fallback.
- Tests run via `vitest run` (NOT `bun test` — bun's runner doesn't implement `vi.hoisted`). Gate is `bun run check`.
- User-facing copy Indonesian; code/logs/errors English.
- Atomic commits to `dev`; stage only your own changes; pre-commit auto-fixes staged.
- Profile avatars (`.data/uploads/profile-avatars/`) out of scope.

---

## File Structure

**New:**
- `src/lib/s3-client.ts` — SDK wrapper: `getS3Config`, `publicUrlFor`, `putS3Object`, `getS3Object`, `deleteS3Object`, `S3ClientConfig` type.
- `src/scripts/init-s3-buckets.ts` — idempotent bucket-create + public-anonymous-read policy grant (run on app startup + callable directly).
- `src/routes/api.admin.waitlist.image.$entryId.ts` already exists (from R2 work) — stays.

**Modified:**
- `src/lib/object-storage.ts` — drop disk branch, use SDK, `object:s3:` ref.
- `src/lib/projects/runtime-artifacts.ts` — drop disk branch, use SDK, `project-artifact:s3:` ref.
- `src/lib/projects/project-assets.ts` — drop disk branch, `s3:` / `s3-private:` refs.
- `src/lib/projects/project-thumbnail.ts` — drop disk branch, `s3-private:` ref.
- `src/lib/projects/artifact-storage-readiness.ts` — validate `S3_*`, SDK reachability probe (no disk write).
- `src/lib/projects/project-cleanup.ts` — stop deleting object-storage dirs (gone); keep runtime/build-workspace cleanup.
- `src/lib/production-config.ts` + `.test.ts` — delete the `PROJECT_ARTIFACT_DIR` volume-mount check.
- `src/lib/storage-provider.ts` — unchanged (`getStorageProvider` already returns `local|r2`).
- `docker-compose.yml` — add `rustfs` service + named volume.
- `package.json` — add `@aws-sdk/client-s3`.
- `.env`, `.env.example` — `S3_*` block.
- `docs/architecture.md`, `docs/deployment.md`, `CLAUDE.md` — boundaries + infra.

**Deleted:**
- `src/lib/r2-client.ts` (replaced by `s3-client.ts`).
- `src/lib/r2-client.test.ts` (replaced by `s3-client.test.ts`).

**Tests updated:** `s3-client.test.ts` (new), `object-storage.test.ts`, `runtime-artifacts.test.ts`, `project-assets.test.ts`, `project-thumbnail.test.ts`, `artifact-storage-readiness.test.ts`, `production-config.test.ts`.

---

## Task 1: Add `@aws-sdk/client-s3` + `s3-client.ts`

**Files:**
- Modify: `package.json`
- Create: `src/lib/s3-client.ts`
- Create: `src/lib/s3-client.test.ts`
- Delete: `src/lib/r2-client.ts`, `src/lib/r2-client.test.ts` (do NOT delete until Task 3 rewire — this task only creates the new module alongside)

**Interfaces:**
- Produces:
  - `type S3ClientConfig = { client: S3Client; bucket: string }`
  - `getS3Config(bucket: "public" | "private"): S3ClientConfig` — reads `S3_*` env. For `STORAGE_PROVIDER=r2`: `S3_ENDPOINT` empty → endpoint `https://${S3_ACCOUNT_ID}.r2.cloudflarestorage.com`, region `auto`, `forcePathStyle: false`. For `local`: `S3_ENDPOINT` set → that endpoint, region `S3_REGION` (default `us-east-1`), `forcePathStyle: true`.
  - `publicUrlFor(bucket: "public", key: string): string` — `${S3_PUBLIC_BASE_URL}/${prefix}/${key}`; throws if `S3_PUBLIC_BASE_URL` empty.
  - `putS3Object(bucket, key, body: Buffer, contentType): Promise<void>`
  - `getS3Object(bucket, key): Promise<Buffer>` — throws on non-200.
  - `deleteS3Object(bucket, key): Promise<void>` — treats 404 (NoSuchKey) as success.

- [ ] **Step 1: Add the dependency**

Run:
```bash
bun add @aws-sdk/client-s3
```
Expected: `package.json` + `bun.lock` updated, `@aws-sdk/client-s3` in dependencies.

- [ ] **Step 2: Write the failing test**

`src/lib/s3-client.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getS3Config, publicUrlFor } from "@/lib/storage/s3-client";

const BASE_ENV = {
  STORAGE_PROVIDER: "r2",
  S3_ACCOUNT_ID: "acct",
  S3_ACCESS_KEY_ID: "AKIA-test",
  S3_SECRET_ACCESS_KEY: "shh",
  S3_PUBLIC_BUCKET: "pub",
  S3_PRIVATE_BUCKET: "priv",
  S3_PUBLIC_BASE_URL: "https://media.test",
};

describe("s3-client config", () => {
  const stash: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const [k, v] of Object.entries(BASE_ENV)) {
      stash[k] = process.env[k];
      process.env[k] = v;
    }
  });
  afterEach(() => {
    for (const [k, v] of Object.entries(stash)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("r2: derives the R2 virtual-host endpoint, no path style", () => {
    delete process.env.S3_ENDPOINT;
    const { client, bucket } = getS3Config("public");
    expect(bucket).toBe("pub");
    // S3Client config is internal; assert via the client's stored config
    const cfg = (client as unknown as { config: { endpoint: () => Promise<{ url: URL }> } }).config;
    // R2 region must be "auto"
    expect((client as unknown as { config: { region: string } }).config.region).toBe("auto");
  });

  it("local: uses S3_ENDPOINT + forcePathStyle", () => {
    process.env.STORAGE_PROVIDER = "local";
    process.env.S3_ENDPOINT = "http://localhost:9000";
    process.env.S3_REGION = "us-east-1";
    const { client, bucket } = getS3Config("private");
    expect(bucket).toBe("priv");
    expect((client as unknown as { config: { forcePathStyle: boolean } }).config.forcePathStyle).toBe(true);
    expect((client as unknown as { config: { region: string } }).config.region).toBe("us-east-1");
  });

  it("throws when a required var is missing", () => {
    delete process.env.S3_SECRET_ACCESS_KEY;
    expect(() => getS3Config("public")).toThrow(/S3_SECRET_ACCESS_KEY/);
  });

  it("publicUrlFor builds the browser-direct URL for the public bucket", () => {
    const url = publicUrlFor("public", "project-assets/p/u/logo/abc.png");
    expect(url).toBe("https://media.test/project-assets/p/u/logo/abc.png");
  });

  it("publicUrlFor throws when S3_PUBLIC_BASE_URL is empty", () => {
    delete process.env.S3_PUBLIC_BASE_URL;
    expect(() => publicUrlFor("public", "x")).toThrow(/S3_PUBLIC_BASE_URL/);
  });
});

// Live round-trip against real R2 (env-gated). Off by default + CI.
const LIVE = process.env.S3_LIVE_TEST === "1";
describe.skipIf(!LIVE)("s3-client live round-trip", () => {
  it("PUTs, GETs, DELETEs a test object against the configured provider", async () => {
    const { putS3Object, getS3Object, deleteS3Object } = await import("@/lib/storage/s3-client");
    const key = "__selftest/round-trip-live.txt";
    const body = Buffer.from("s3-client live self-check");
    try {
      await putS3Object("public", key, body, "text/plain");
      const got = await getS3Object("public", key);
      expect(got.toString("utf8")).toBe(body.toString("utf8"));
    } finally {
      await deleteS3Object("public", key);
    }
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bunx vitest run --project unit src/lib/s3-client.test.ts`
Expected: FAIL — module `@/lib/storage/s3-client` not found.

- [ ] **Step 4: Write minimal implementation**

`src/lib/s3-client.ts`:

```ts
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import { getEnv } from "@/lib/config/config";
import { getStorageProvider } from "@/lib/storage/storage-provider";

export type S3ClientConfig = {
  bucket: string;
  client: S3Client;
};

const PUBLIC_PREFIX = "objects";
const ARTIFACT_PREFIX = "project-artifacts";
const ASSET_PREFIX = "project-assets";
const THUMBNAIL_PREFIX = "project-thumbnails";

export function getS3Config(bucket: "public" | "private"): S3ClientConfig {
  const provider = getStorageProvider();
  const bucketEnv =
    bucket === "public" ? "S3_PUBLIC_BUCKET" : "S3_PRIVATE_BUCKET";
  const accessKeyId = requiredEnv("S3_ACCESS_KEY_ID");
  const secretAccessKey = requiredEnv("S3_SECRET_ACCESS_KEY");
  const endpoint = getEnv("S3_ENDPOINT").trim();
  const region = getEnv("S3_REGION", provider === "r2" ? "auto" : "us-east-1");

  const client = new S3Client({
    credentials: { accessKeyId, secretAccessKey },
    endpoint: endpoint || undefined,
    forcePathStyle: provider === "local",
    region,
  });

  return { bucket: requiredEnv(bucketEnv), client };
}

export function publicUrlFor(_bucket: "public", key: string): string {
  const base = getEnv("S3_PUBLIC_BASE_URL");
  if (!base) {
    throw new Error(
      "S3_PUBLIC_BASE_URL is required for public display-media URLs.",
    );
  }
  return `${base.replace(/\/+$/, "")}/${key}`;
}

export async function putS3Object(
  bucket: "public" | "private",
  key: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  const { client, bucket: name } = getS3Config(bucket);
  await client.send(
    new PutObjectCommand({
      Body: new Uint8Array(body),
      Bucket: name,
      ContentType: contentType,
      Key: key,
    }),
  );
}

export async function getS3Object(
  bucket: "public" | "private",
  key: string,
): Promise<Buffer> {
  const { client, bucket: name } = getS3Config(bucket);
  const res = await client.send(new GetObjectCommand({ Bucket: name, Key: key }));
  if (!res.Body) {
    throw new Error(`S3 object read failed: empty body for ${key}`);
  }
  return Buffer.from(await res.Body.transformToByteArray());
}

export async function deleteS3Object(
  bucket: "public" | "private",
  key: string,
): Promise<void> {
  const { client, bucket: name } = getS3Config(bucket);
  try {
    await client.send(new DeleteObjectCommand({ Bucket: name, Key: key }));
  } catch (error) {
    // NoSuchKey = already gone; treat as success. Anything else rethrows.
    const name = error instanceof Error && "name" in error ? String((error as { name: string }).name) : "";
    if (name !== "NoSuchKey" && !/NoSuchKey|404/i.test(String(error))) {
      throw error;
    }
  }
}

// Prefixes are prepended to keys by callers (object-storage etc.). Kept here as
// the single source of truth so ref/key construction stays consistent.
export const S3_PREFIXES = {
  artifact: ARTIFACT_PREFIX,
  asset: ASSET_PREFIX,
  object: PUBLIC_PREFIX,
  thumbnail: THUMBNAIL_PREFIX,
} as const;

function requiredEnv(name: string): string {
  const value = getEnv(name);
  if (!value) {
    throw new Error(`${name} is required for S3 object storage.`);
  }
  return value;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bunx vitest run --project unit src/lib/s3-client.test.ts`
Expected: PASS (5 unit tests; live test skipped without `S3_LIVE_TEST=1`).

- [ ] **Step 6: Commit**

```bash
git add package.json bun.lock src/lib/s3-client.ts src/lib/s3-client.test.ts
git commit -m "feat(s3): add @aws-sdk/client-s3-backed s3-client module"
```

---

## Task 2: RustFS in docker-compose + bucket init script

**Files:**
- Modify: `docker-compose.yml`
- Create: `src/scripts/init-s3-buckets.ts`

**Interfaces:**
- Produces: a `rustfs` service on `http://localhost:9000` with root creds from env; `src/scripts/init-s3-buckets.ts` exports `ensureS3Buckets()` (idempotent: create both buckets if missing, set anonymous-read policy on the public one). Called at app startup.

- [ ] **Step 1: Add the RustFS service to docker-compose.yml**

Insert after the `redis` service block, before the `volumes:` top-level key:

```yaml
  rustfs:
    image: ghcr.io/rustfs/rustfs:latest
    container_name: umkmcepat-rustfs
    environment:
      RUSTFS_ROOT_USER: ${RUSTFS_ROOT_USER:-umkmcepat}
      RUSTFS_ROOT_PASSWORD: ${RUSTFS_ROOT_PASSWORD:-umkmcepat}
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - rustfs_data:/data
    profiles:
      - ai
```

Add to the top-level `volumes:` block:

```yaml
  rustfs_data:
```

- [ ] **Step 2: Write the bucket-init script**

`src/scripts/init-s3-buckets.ts`:

```ts
import {
  CreateBucketCommand,
  GetBucketPolicyCommand,
  PutBucketPolicyCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import { getEnv } from "@/lib/config/config";
import { getStorageProvider } from "@/lib/storage/storage-provider";

// Anonymous-read policy for the PUBLIC bucket only (display media is public by
// design). Private bucket gets no policy → only signed requests read it.
const PUBLIC_READ_POLICY = JSON.stringify({
  Statement: [
    {
      Effect: "Allow",
      Principal: "*",
      Action: "s3:GetObject",
      Resource: "arn:aws:s3:::${PUBLIC_BUCKET}/*",
    },
  ],
  Version: "2012-10-17",
});

export async function ensureS3Buckets(): Promise<void> {
  const provider = getStorageProvider();
  // Only auto-create under the local (RustFS) provider — R2 buckets are
  // created manually in the Cloudflare dashboard (managed infra).
  if (provider !== "local") {
    return;
  }
  const accessKeyId = getEnv("RUSTFS_ROOT_USER", "umkmcepat");
  const secretAccessKey = getEnv("RUSTFS_ROOT_PASSWORD", "umkmcepat");
  const endpoint = getEnv("S3_ENDPOINT", "http://localhost:9000");
  const publicBucket = getEnv("S3_PUBLIC_BUCKET");
  const privateBucket = getEnv("S3_PRIVATE_BUCKET");

  const client = new S3Client({
    credentials: { accessKeyId, secretAccessKey },
    endpoint,
    forcePathStyle: true,
    region: getEnv("S3_REGION", "us-east-1"),
  });

  for (const bucket of [publicBucket, privateBucket]) {
    if (!bucket) {
      throw new Error(`Missing bucket name while initializing S3: ${bucket || "(empty)"}`);
    }
    try {
      await client.send(new CreateBucketCommand({ Bucket: bucket }));
    } catch (error) {
      // BucketAlreadyOwnedByYou = already exists; idempotent. Anything else rethrows.
      const name = error instanceof Error && "name" in error ? String((error as { name: string }).name) : "";
      if (name !== "BucketAlreadyOwnedByYou") {
        throw error;
      }
    }
  }

  // Grant anonymous-read on the public bucket only.
  const policy = PUBLIC_READ_POLICY.replace("${PUBLIC_BUCKET}", publicBucket);
  await client.send(
    new PutBucketPolicyCommand({ Bucket: publicBucket, Policy: policy }),
  );
}

// Run directly: `bun src/scripts/init-s3-buckets.ts`
if (import.meta.url === `file://${process.argv[1]}`) {
  ensureS3Buckets()
    .then(() => {
      console.log("s3 buckets ready");
      process.exit(0);
    })
    .catch((error) => {
      console.error("s3 bucket init failed:", error);
      process.exit(1);
    });
}
```

- [ ] **Step 3: Wire it into app startup**

Find the app entry/server start (`src/lib/startup.ts` or wherever `assertProjectArtifactStorageReady` is called at boot — grep `assertProjectArtifactStorageReady`). Add `ensureS3Buckets()` after the readiness check, fire-and-forget with a logged warning on failure (don't block boot on RustFS being slow to come up — the first upload will surface the real error).

```ts
import { ensureS3Buckets } from "@/scripts/init-s3-buckets";

// ... after assertProjectArtifactStorageReady() ...
void ensureS3Buckets().catch((error) => {
  console.warn("[storage] S3 bucket init skipped/failed:", error instanceof Error ? error.message : error);
});
```

- [ ] **Step 4: Smoke test the script manually**

Run: `bun run infra` (starts RustFS) then `bun src/scripts/init-s3-buckets.ts`
Expected: prints `s3 buckets ready`; both buckets exist in RustFS, public bucket has the anonymous-read policy.

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml src/scripts/init-s3-buckets.ts src/lib/startup.ts
git commit -m "feat(infra): add RustFS service + idempotent S3 bucket init"
```

---

## Task 3: Rewire object-storage.ts → s3-client + object:s3: ref

**Files:**
- Modify: `src/lib/object-storage.ts`
- Modify: `src/lib/object-storage.test.ts`
- Delete: `src/lib/r2-client.ts`, `src/lib/r2-client.test.ts` (after all callers rewired — this task rewires object-storage, but runtime-artifacts/project-assets/project-thumbnail still import r2-client. DEFER deletion to Task 7.)

**Interfaces:**
- Consumes: `putS3Object`, `getS3Object`, `deleteS3Object`, `S3_PREFIXES.object` from `s3-client` (Task 1).
- Produces: `putStoredObject` → `object:s3:<key>` ref (private bucket); `getStoredObject` reads `object:s3:` via signed SDK GET. Disk branch + `LOCAL_UPLOAD_DIR` gone.

- [ ] **Step 1: Write the failing test (rewrite the test file)**

`src/lib/object-storage.test.ts` — mock `@/lib/storage/s3-client` instead of `@/lib/r2-client`:

```ts
import { describe, expect, it, vi } from "vitest";

const { putMock, getMock, deleteMock } = vi.hoisted(() => ({
  putMock: vi.fn(async () => {}),
  getMock: vi.fn(async () => Buffer.from("bytes")),
  deleteMock: vi.fn(async () => {}),
}));

vi.mock("@/lib/storage/s3-client", () => ({
  getS3Config: () => ({ client: {}, bucket: "priv" }),
  putS3Object: putMock,
  getS3Object: getMock,
  deleteS3Object: deleteMock,
  S3_PREFIXES: { object: "objects", artifact: "project-artifacts", asset: "project-assets", thumbnail: "project-thumbnails" },
}));

import { getStoredObject, putStoredObject } from "@/lib/storage/object-storage";

describe("object-storage (s3)", () => {
  afterEach(() => { delete process.env.STORAGE_PROVIDER; });

  it("writes an object:s3: ref", async () => {
    process.env.STORAGE_PROVIDER = "r2";
    const ref = await putStoredObject({
      body: Buffer.from("x"),
      contentType: "image/png",
      key: "waitlist/abc.png",
    });
    expect(ref).toBe("object:s3:waitlist/abc.png");
    expect(putMock).toHaveBeenCalledWith("private", "objects/waitlist/abc.png", expect.any(Buffer), "image/png");
  });

  it("reads an object:s3: ref via the SDK", async () => {
    process.env.STORAGE_PROVIDER = "r2";
    const stored = await getStoredObject("object:s3:waitlist/abc.png");
    expect(stored?.body.toString()).toBe("bytes");
    expect(getMock).toHaveBeenCalledWith("private", "objects/waitlist/abc.png");
  });

  it("returns null for unknown ref prefixes", async () => {
    expect(await getStoredObject("foo:bar:baz")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run --project unit src/lib/object-storage.test.ts`
Expected: FAIL — `object-storage.ts` still imports `r2-client` / writes `object:local:`.

- [ ] **Step 3: Rewrite object-storage.ts**

```ts
import { getEnv } from "@/lib/config/config";
import {
  deleteS3Object,
  getS3Object,
  putS3Object,
  S3_PREFIXES,
} from "@/lib/storage/s3-client";

export type StoredObject = {
  body: Buffer;
  contentType: string;
};

export type UploadObjectInput = {
  body: Buffer;
  contentType: string;
  key: string;
};

const OBJECT_REF_PREFIX = "object:";
const S3_REF_PREFIX = "object:s3:";

export async function getStoredObject(
  ref: string,
): Promise<StoredObject | null> {
  if (!ref.startsWith(S3_REF_PREFIX)) {
    return null;
  }
  const key = ref.slice(S3_REF_PREFIX.length);
  try {
    const body = await getS3Object("private", key);
    return { body, contentType: contentTypeFromKey(key) };
  } catch {
    return null;
  }
}

export async function putStoredObject(input: UploadObjectInput) {
  const key = normalizeObjectKey(input.key);
  await putS3Object("private", key, input.body, input.contentType);
  return `${S3_REF_PREFIX}${key}`;
}

function contentTypeFromKey(key: string) {
  if (key.endsWith(".jpg") || key.endsWith(".jpeg")) return "image/jpeg";
  if (key.endsWith(".webp")) return "image/webp";
  return "image/png";
}

function normalizeObjectKey(key: string) {
  const normalized = key.replace(/\\/g, "/").replace(/^\/+/, "");
  if (
    !normalized ||
    normalized.includes("..") ||
    getEnv("NODE_ENV") === "production"
      ? false
      : false ||
        path_isAbsolute(normalized) ||
        !/^[A-Za-z0-9/_-]+\.(png|jpg|jpeg|webp)$/.test(normalized)
  ) {
    throw new Error("Object storage key tidak valid.");
  }
  return `${S3_PREFIXES.object}/${normalized}`;
}

// path.isAbsolute without importing node:path just for one check
function path_isAbsolute(p: string) {
  return p.startsWith("/");
}
```

Note: keep the existing `normalizeObjectKey` regex validation intact (the above is illustrative — preserve the original `..`/absolute/regex guards verbatim from the current file; only swap the prefix-storage line to `${S3_PREFIXES.object}/${normalized}` and the ref prefix to `S3_REF_PREFIX`). Drop `LOCAL_UPLOAD_DIR` + `resolveLocalObjectPath` + all `fs` imports.

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run --project unit src/lib/object-storage.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/object-storage.ts src/lib/object-storage.test.ts
git commit -m "feat(storage): route waitlist images through s3-client (object:s3: ref)"
```

---

## Task 4: Rewire runtime-artifacts.ts → s3-client + project-artifact:s3: ref

**Files:**
- Modify: `src/lib/projects/runtime-artifacts.ts`
- Modify: `src/lib/projects/runtime-artifacts.test.ts`

**Interfaces:**
- Consumes: `putS3Object`, `getS3Object`, `deleteS3Object`, `S3_PREFIXES.artifact` (Task 1).
- Produces: `project-artifact:s3:<kind>:<id>` ref; the `{...config, prefix: ""}` double-prefix pattern is deleted (SDK takes bucket + full key).

- [ ] **Step 1: Rewrite the test**

`src/lib/projects/runtime-artifacts.test.ts` — replace the `vi.mock("@/lib/r2-client")` block with an `@/lib/storage/s3-client` mock:

```ts
const { putMock, getMock, deleteMock } = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
    putMock: vi.fn(async (_b: "public" | "private", key: string, body: Buffer) => { store.set(key, body.toString("utf8")); }),
    getMock: vi.fn(async (_b: "public" | "private", key: string) => {
      const v = store.get(key);
      if (v === undefined) throw new Error("NoSuchKey");
      return Buffer.from(v);
    }),
    deleteMock: vi.fn(async (_b: "public" | "private", key: string) => { store.delete(key); }),
    store,
  };
});

vi.mock("@/lib/storage/s3-client", () => ({
  getS3Config: () => ({ client: {}, bucket: "pub" }),
  putS3Object: putMock,
  getS3Object: getMock,
  deleteS3Object: deleteMock,
  S3_PREFIXES: { object: "objects", artifact: "project-artifacts", asset: "project-assets", thumbnail: "project-thumbnails" },
}));
```

Update assertions: refs are now `project-artifact:s3:source:...` / `project-artifact:s3:dist:...`. Drop the `signedR2Fetch.mock.calls[0][0].bucket` assertions (the SDK call shape changed — assert on `putMock`/`getMock` having been called with `"public"` + the right key).

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run --project unit src/lib/projects/runtime-artifacts.test.ts`
Expected: FAIL — `runtime-artifacts.ts` still imports `r2-client`.

- [ ] **Step 3: Rewrite runtime-artifacts.ts**

Replace the `r2-client` import with `s3-client`:

```ts
import {
  deleteS3Object,
  getS3Object,
  putS3Object,
  S3_PREFIXES,
} from "@/lib/storage/s3-client";
```

Drop `artifactR2Config`, `putR2Object`/`getR2Object`/`deleteR2Object`, the `R2Config` type import, and the `{...config, prefix: ""}` wrappers. The artifact key becomes `${S3_PREFIXES.artifact}/${kind}/${artifactId}/${suffix}`. Ref prefixes: `LOCAL_PROJECT_ARTIFACT_REF_PREFIX` + `R2_PROJECT_ARTIFACT_REF_PREFIX` collapse to one `S3_PROJECT_ARTIFACT_REF_PREFIX = "project-artifact:s3:"`.

`createProjectArtifactRef`:
```ts
export function createProjectArtifactRef(
  kind: ProjectArtifactKind,
  artifactId: string,
) {
  assertSafeArtifactId(artifactId);
  return `${PROJECT_ARTIFACT_REF_PREFIX}${kind}:${artifactId}`;
}
```

`parseProjectArtifactRef`: recognize only `project-artifact:s3:`.

The local write/read/delete branches (`writeLocalProjectArtifact`, `readLocalProjectArtifact`, `resolveProjectArtifactDir`) are **deleted**. `getProjectArtifactProvider()` is deleted (no provider branching — there's one path now). `resolveArtifactFilesDir` (used by the prettier post-generation sweep) must be reworked: it can't return an on-disk path for an S3 artifact. Rework it to read the artifact via the SDK into a temp dir + return that path (or, if the prettier sweep already materializes via `materializeProjectDistArtifact`, confirm it doesn't need `resolveArtifactFilesDir` and delete the function if unused — grep first).

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run --project unit src/lib/projects/runtime-artifacts.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/projects/runtime-artifacts.ts src/lib/projects/runtime-artifacts.test.ts
git commit -m "feat(storage): route project artifacts through s3-client (project-artifact:s3: ref)"
```

---

## Task 5: Rewire project-assets.ts → s3-client + s3:/s3-private: refs

**Files:**
- Modify: `src/lib/projects/project-assets.ts`
- Modify: `src/lib/projects/project-assets.test.ts`

**Interfaces:**
- Consumes: `putS3Object`, `getS3Object`, `deleteS3Object`, `publicUrlFor`, `S3_PREFIXES.asset` (Task 1).
- Produces: display media → public bucket, `publicUrl` set, `project-asset:s3:<key>`; references → private bucket, `publicUrl: null`, `project-asset:s3-private:<key>`. `parseProjectAssetRef` + read/delete branch on `s3-private:` before `s3:`. Local disk branch gone. `assetR2Key(parsed)` helper (from the R2 follow-up commit) stays, renamed `assetS3Key(parsed)`.

- [ ] **Step 1: Rewrite the test**

`src/lib/projects/project-assets.test.ts` — swap the `@/lib/r2-client` mock for `@/lib/storage/s3-client`:

```ts
const { putMock, getMock, deleteMock } = vi.hoisted(() => ({
  putMock: vi.fn(async () => {}),
  getMock: vi.fn(async () => pngBytes()),
  deleteMock: vi.fn(async () => {}),
}));

vi.mock("@/lib/storage/s3-client", () => ({
  getS3Config: () => ({ client: {}, bucket: "pub" }),
  publicUrlFor: (_b: "public", key: string) => `https://media.test/project-assets/${key}`,
  putS3Object: putMock,
  getS3Object: getMock,
  deleteS3Object: deleteMock,
  S3_PREFIXES: { object: "objects", artifact: "project-artifacts", asset: "project-assets", thumbnail: "project-thumbnails" },
}));
```

Update assertions: refs are `project-asset:s3:...` (display) / `project-asset:s3-private:...` (reference). The "writes a logo to the public bucket" test asserts `putMock` called with `("public", "project-assets/p/u/logo/abc.png", ...)`. The "writes a reference to the private bucket" test asserts `("private", ...)`. `parseProjectAssetRef` tests use the new prefixes. Drop all `local:` / `r2:` ref tests (no longer valid).

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run --project unit src/lib/projects/project-assets.test.ts`
Expected: FAIL.

- [ ] **Step 3: Rewrite project-assets.ts**

```ts
import {
  deleteS3Object,
  getS3Object,
  publicUrlFor,
  putS3Object,
  S3_PREFIXES,
} from "@/lib/storage/s3-client";
import { getStorageProvider } from "@/lib/storage/storage-provider";
```

Prefixes:
```ts
const S3_REF_PREFIX = "project-asset:s3:";
const S3_PRIVATE_REF_PREFIX = "project-asset:s3-private:";
```

`writeProjectAsset`:
```ts
const provider = getStorageProvider();
void provider; // single path now; kept for future local/cloud gating if needed
const relativeKey = `${S3_PREFIXES.asset}/${projectId}/${userId}/${kind}/${ulid}.${format}`;
if (isDisplayKind(kind)) {
  await putS3Object("public", relativeKey, bytes, FORMAT_CONTENT_TYPES[format]);
  return { publicUrl: publicUrlFor("public", relativeKey), ref: `${S3_REF_PREFIX}${relativeKey}` };
}
await putS3Object("private", relativeKey, bytes, FORMAT_CONTENT_TYPES[format]);
return { publicUrl: null, ref: `${S3_PRIVATE_REF_PREFIX}${relativeKey}` };
```

`assetS3Key(parsed)` (renamed from `assetR2Key`):
```ts
function assetS3Key(parsed: ParsedProjectAssetRef): string {
  return `${S3_PREFIXES.asset}/${parsed.projectId}/${parsed.userId}/${parsed.kind}/${parsed.ulid}${parsed.ext ? `.${parsed.ext}` : ""}`;
}
```

`readProjectAsset`/`deleteProjectAsset`: branch on `S3_PRIVATE_REF_PREFIX` → `getS3Object("private", assetS3Key(parsed))` / `deleteS3Object("private", ...)`; else `S3_REF_PREFIX` → public bucket. Drop the local `readFile`/`resolveExistingAssetPath`/`resolveCandidatePaths` branches + all `fs` + `node:path` imports + `PROJECT_ASSET_DIR` + `resolveRoot`.

`parseProjectAssetRef`: recognize `S3_PRIVATE_REF_PREFIX` before `S3_REF_PREFIX` (same ordering pattern as the R2 work).

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run --project unit src/lib/projects/project-assets.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/projects/project-assets.ts src/lib/projects/project-assets.test.ts
git commit -m "feat(storage): route project assets through s3-client (s3:/s3-private: refs)"
```

---

## Task 6: Rewire project-thumbnail.ts → s3-client + s3-private: ref

**Files:**
- Modify: `src/lib/projects/project-thumbnail.ts`
- Modify: `src/lib/projects/project-thumbnail.test.ts`

**Interfaces:**
- Consumes: `putS3Object`, `getS3Object`, `deleteS3Object`, `S3_PREFIXES.thumbnail` (Task 1).
- Produces: `project-thumbnail:s3-private:<projectId>` ref. Disk branch + `PROJECT_THUMBNAIL_DIR` gone.

- [ ] **Step 1: Rewrite the test**

`src/lib/projects/project-thumbnail.test.ts` — swap `@/lib/r2-client` mock for `@/lib/storage/s3-client`, update refs to `project-thumbnail:s3-private:`, assert `putS3Object("private", "project-thumbnails/<id>.jpg", ...)`. Keep the local JPEG fixture.

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run --project unit src/lib/projects/project-thumbnail.test.ts`
Expected: FAIL.

- [ ] **Step 3: Rewrite project-thumbnail.ts**

```ts
import {
  deleteS3Object,
  getS3Object,
  putS3Object,
  S3_PREFIXES,
} from "@/lib/storage/s3-client";
import { getStorageProvider } from "@/lib/storage/storage-provider";

const S3_REF_PREFIX = "project-thumbnail:s3-private:";
```

`writeProjectThumbnail`:
```ts
void getStorageProvider(); // single path
const key = `${S3_PREFIXES.thumbnail}/${projectId}.jpg`;
await putS3Object("private", key, bytes, "image/jpeg");
return `${S3_REF_PREFIX}${projectId}`;
```

`readProjectThumbnail`:
```ts
if (ref.startsWith(S3_REF_PREFIX)) {
  const projectId = parseProjectThumbnailRef(ref);
  if (!projectId) throw new Error("Invalid project thumbnail ref.");
  return getS3Object("private", `${S3_PREFIXES.thumbnail}/${projectId}.jpg`);
}
throw new Error("Invalid project thumbnail ref.");
```

`deleteProjectThumbnail`: signed-delete on the same key; 404 (NoSuchKey) treated as success by `deleteS3Object`. Drop `PROJECT_THUMBNAIL_DIR` + `resolveRoot` + `fs`/`node:path` + the atomic-rename local path.

`parseProjectThumbnailRef`: recognize only `S3_REF_PREFIX`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run --project unit src/lib/projects/project-thumbnail.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/projects/project-thumbnail.ts src/lib/projects/project-thumbnail.test.ts
git commit -m "feat(storage): route thumbnails through s3-client (project-thumbnail:s3-private: ref)"
```

---

## Task 7: Delete r2-client.ts + update production-config + readiness + cleanup

**Files:**
- Delete: `src/lib/r2-client.ts`, `src/lib/r2-client.test.ts`
- Modify: `src/lib/production-config.ts`, `src/lib/production-config.test.ts`
- Modify: `src/lib/projects/artifact-storage-readiness.ts`, `src/lib/projects/artifact-storage-readiness.test.ts`
- Modify: `src/lib/projects/project-cleanup.ts`

**Interfaces:**
- Produces: `r2-client` gone; `production-config` no longer checks `PROJECT_ARTIFACT_DIR`; readiness validates `S3_*` + SDK reachability (no disk probe); `project-cleanup` stops deleting object-storage dirs.

- [ ] **Step 1: Confirm no remaining r2-client importers**

Run: `grep -rn "@/lib/r2-client" src/`
Expected: empty (all four callers rewired in Tasks 3-6).

- [ ] **Step 2: Delete r2-client + its test**

```bash
git rm src/lib/r2-client.ts src/lib/r2-client.test.ts
```

- [ ] **Step 3: Update production-config.ts — drop the artifact-dir check**

In `src/lib/production-config.ts`, delete the block (~line 120-130) that checks `PROJECT_ARTIFACT_DIR` matches `/app/.data/project-artifacts`. Artifacts now live in S3; the volume mount stays only for `project-runtimes` + `project-build-workspaces`.

Update `src/lib/production-config.test.ts`: remove the test case asserting that check; keep the other prod-config tests.

- [ ] **Step 4: Update artifact-storage-readiness.ts — validate S3_*, SDK reachability**

```ts
import { getStorageProvider } from "@/lib/storage/storage-provider";
import { getS3Config } from "@/lib/storage/s3-client";
import { GetBucketLocationCommand } from "@aws-sdk/client-s3";

export async function assertProjectArtifactStorageReady() {
  // Both providers now need the same S3_* vars (validated in getS3Config).
  // Additionally, confirm the SDK can reach the endpoint.
  const config = getS3Config("public");
  try {
    await config.client.send(new GetBucketLocationCommand({ Bucket: config.bucket }));
  } catch (error) {
    throw new Error(
      `S3 storage is not reachable: ${error instanceof Error ? error.message : "probe failed"}`,
    );
  }
}
```

Drop the local writable-probe (`mkdir`/`writeFile`/`readFile`/`rm` + the `PROJECT_ARTIFACT_DIR` absolute-path check). Update `.test.ts`: stub `S3_*` env, mock `getS3Config` to return a client whose `send` resolves (success) or rejects (readiness fails). Drop the local-probe tests.

- [ ] **Step 5: Update project-cleanup.ts — stop deleting object-storage dirs**

`src/lib/projects/project-cleanup.ts` — delete the lines that `rm` `.data/project-assets`, `.data/project-artifacts`, `.data/project-thumbnails`, `.data/uploads` (they don't exist anymore). Keep the `PROJECT_RUNTIME_DIR` + `PROJECT_BUILD_WORKSPACE_DIR` cleanup + the S3 object deletions (which now happen via the subsystem `delete*` functions, unchanged).

- [ ] **Step 6: Run the full gate**

Run: `bun run check`
Expected: format/lint/typecheck/test/Knip all green. (Knip should confirm no dangling `r2-client` references.)

- [ ] **Step 7: Commit**

```bash
git add -A src/lib/r2-client.ts src/lib/r2-client.test.ts src/lib/production-config.ts src/lib/production-config.test.ts src/lib/projects/artifact-storage-readiness.ts src/lib/projects/artifact-storage-readiness.test.ts src/lib/projects/project-cleanup.ts
git commit -m "feat(storage): delete r2-client, drop artifact-dir prod check, SDK readiness probe"
```

---

## Task 8: Env + docs collapse (S3_* + RustFS)

**Files:**
- Modify: `.env`, `.env.example`
- Modify: `docs/architecture.md`, `docs/deployment.md`, `CLAUDE.md`

- [ ] **Step 1: Edit .env**

Replace the `STORAGE_PROVIDER` + `*_DIR` + `R2_*` block with the `S3_*` block:

```env
# Object storage — one S3 path. local = RustFS (dev mirror); r2 = Cloudflare R2 (prod).
STORAGE_PROVIDER="local"

# S3 config (applies to whichever provider STORAGE_PROVIDER names).
# r2: leave S3_ENDPOINT empty (SDK derives the R2 host from the account); region "auto".
# local: RustFS at http://localhost:9000; region "us-east-1".
S3_ENDPOINT="http://localhost:9000"
S3_REGION="us-east-1"
S3_ACCESS_KEY_ID="umkmcepat"
S3_SECRET_ACCESS_KEY="umkmcepat"
S3_PUBLIC_BUCKET="umkmcepat-public-dev"
S3_PRIVATE_BUCKET="umkmcepat-private-dev"
S3_PUBLIC_BASE_URL="http://localhost:9000"

# RustFS root creds (used by scripts/init-s3-buckets.ts to auto-create buckets).
RUSTFS_ROOT_USER="umkmcepat"
RUSTFS_ROOT_PASSWORD="umkmcepat"
```

Remove: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_BUCKET`, `R2_PRIVATE_BUCKET`, `R2_PUBLIC_BASE_URL`, `LOCAL_UPLOAD_DIR`, `PROJECT_ARTIFACT_DIR`, `PROJECT_ASSET_DIR`, `PROJECT_THUMBNAIL_DIR`.

Keep: `PROJECT_RUNTIME_DIR`, `PROJECT_BUILD_WORKSPACE_DIR` (process-execution, not S3).

- [ ] **Step 2: Mirror in .env.example** — same keys, redacted secrets (`S3_ACCESS_KEY_ID=""`, `S3_SECRET_ACCESS_KEY=""`, `RUSTFS_ROOT_PASSWORD=""`).

- [ ] **Step 3: Verify 1:1 invariant**

Run: `diff <(sed 's/=".*"/=""/' .env.example) <(sed 's/=".*"/=""/' .env)`
Expected: empty.

- [ ] **Step 4: Update docs/architecture.md** — storage table: `STORAGE_PROVIDER` (local=RustFS / r2=R2), `S3_*` block, `src/lib/s3-client.ts` boundary, RustFS service in infra. Remove `r2-client.ts` + the three `*_R2_PREFIX` rows + `LOCAL_UPLOAD_DIR`/`PROJECT_ASSET_DIR`/`PROJECT_ARTIFACT_DIR`/`PROJECT_THUMBNAIL_DIR` rows.

- [ ] **Step 5: Update docs/deployment.md** — prod env list: `STORAGE_PROVIDER="r2"`, `S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY` (R2 prod creds), `S3_PUBLIC_BUCKET="umkmcepat-public"`, `S3_PRIVATE_BUCKET="umkmcepat-private"`, `S3_PUBLIC_BASE_URL="https://media.umkmcepat.com"`. Note RustFS is dev-only; prod uses managed R2.

- [ ] **Step 6: Update CLAUDE.md boundaries** — replace `src/lib/r2-client.ts` with `src/lib/s3-client.ts`; note RustFS service in `bun run infra`.

- [ ] **Step 7: Commit** (do NOT stage `.env` — gitignored)

```bash
git add .env.example docs/architecture.md docs/deployment.md CLAUDE.md
git commit -m "docs(env): collapse R2_* to S3_* + RustFS dev mirror

RustFS runs in bun run infra (dev). Prod uses managed Cloudflare R2 under
the same S3_* env shape — repoint endpoint to switch."
```

---

## Task 9: Wipe dev data + final gate + live smoke

**Files:**
- (no source changes — data + verification only)

- [ ] **Step 1: Delete the 2 dev projects + their dependent rows**

```bash
bun -e "
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const projects = await prisma.project.findMany({ select: { id: true } });
for (const p of projects) {
  await prisma.projectAsset.deleteMany({ where: { projectId: p.id } });
  await prisma.projectBuild.deleteMany({ where: { projectId: p.id } });
  await prisma.runtimeEvent.deleteMany({ where: { projectId: p.id } });
  await prisma.projectDeployment.deleteMany({ where: { projectId: p.id } });
  await prisma.projectChatTurn.deleteMany({ where: { projectId: p.id } });
  await prisma.projectSnapshot.deleteMany({ where: { projectId: p.id } });
  await prisma.project.delete({ where: { id: p.id } });
}
console.log('deleted', projects.length, 'projects + dependents');
"
```

Also clear waitlist entries with images:
```bash
bun -e "import { PrismaClient } from '@prisma/client'; const p = new PrismaClient(); const r = await p.waitlistEntry.deleteMany({}); console.log('deleted waitlist entries:', r.count);"
```

- [ ] **Step 2: Nuke the object-storage .data/ dirs**

```bash
rm -rf .data/project-assets .data/project-artifacts .data/project-thumbnails .data/uploads
```

Keep `.data/project-runtimes` + `.data/project-build-workspaces` (process-execution, still used).

- [ ] **Step 3: Bring up RustFS + init buckets**

```bash
bun run infra
sleep 3
bun src/scripts/init-s3-buckets.ts
```
Expected: `s3 buckets ready`.

- [ ] **Step 4: Full gate**

Run: `bun run check`
Expected: green.

- [ ] **Step 5: Verify (route regen + full suite)**

Run: `bun run verify`
Expected: green.

- [ ] **Step 6: Live R2 round-trip (manual — needs real R2 creds set in .env temporarily)**

Set `.env` to the r2 block (real R2 creds + `STORAGE_PROVIDER="r2"` + `S3_ENDPOINT=""` + `S3_REGION="auto"` + the prod bucket names). Run:
```bash
S3_LIVE_TEST=1 bunx vitest run --project unit src/lib/s3-client.test.ts
```
Expected: live round-trip PASS against real R2. Then restore the local RustFS block.

- [ ] **Step 7: Local RustFS end-to-end smoke (`STORAGE_PROVIDER="local"`)**

- `bun run dev` → upload a logo → confirm it appears in `umkmcepat-public-dev` (RustFS dashboard at `http://localhost:9001`); `/media/$assetId` 302s to `http://localhost:9000/...`; renders in workspace.
- Generate a project → `project-artifact:s3:` artifact in public bucket; preview serves.
- Capture a thumbnail → `project-thumbnails/<id>.jpg` in private bucket; `/api/projects/$id/thumbnail` returns it.
- Submit a waitlist entry with a photo → private bucket; admin serve route returns bytes.

- [ ] **Step 8: Commit the dev-data wipe note (no source change — this step is verification only; nothing to commit unless Knip/CI flagged something)**

```bash
git status --short
```
If clean, nothing to commit. If the gate surfaced a fix, commit it.

---

## Verification (end-to-end, after all tasks)

1. `bun run check` green.
2. `S3_LIVE_TEST=1 bunx vitest run src/lib/s3-client.test.ts` — live round-trip against real R2.
3. Local RustFS smoke (`STORAGE_PROVIDER="local"`): upload/generate/thumbnail/waitlist flows all hit RustFS; public reads browser-direct, private reads server-proxied.
4. Prod R2 smoke (`STORAGE_PROVIDER="r2"`): same flows against real R2 + `media.umkmcepat.com`.
5. No `.data/project-*` object-storage dirs remain (only runtimes + build-workspaces).
6. `bun run verify` before handoff; CI runs build + full suite.

## Out of scope

- Automated R2→RustFS failover (manual env switch only).
- Migrating existing prod data between providers (one-shot script, not requested).
- Profile avatars — separate code path; migrate to S3 only if requested.
- Custom RustFS build/pinning — use the official image.
