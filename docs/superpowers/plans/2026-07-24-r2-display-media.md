# R2 Display-Media Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up tested R2 storage + a public-serve path for owner-uploaded display media (`business-image`, `logo`), with local as the zero-config dev default and no behavior change to source/dist/waitlist paths.

**Architecture:** Extract one shared `src/lib/r2-client.ts` (config + AWS Sig V4 signed fetch + `publicUrlFor`) from the two duplicated copies in `object-storage.ts` and `runtime-artifacts.ts`; point both at it; add an R2 branch to `project-assets.ts` behind a new `PROJECT_ASSET_STORAGE_PROVIDER` env var (local|r2, default local); store a nullable `publicUrl` on `ProjectAsset`; serve route 302-redirects to `publicUrl` for display media (browser hits R2 directly), proxies bytes for references.

**Tech Stack:** Bun, TypeScript, TanStack Router, Prisma + PostgreSQL, Vitest. AWS Sig V4 hand-rolled with `node:crypto` (no SDK). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-24-r2-display-media-design.md`

## Global Constraints

- Local stays the zero-config dev default. R2 is an opt-in via env flip, never required to run `bun run dev`.
- Behavior must not change for source/dist/waitlist paths — only project display media gets the R2 branch. Regression-gated by `bun run check`.
- `.env` and `.env.example` stay 1:1 (same vars, order, comments) — every env change lands in both.
- Mock/proxy providers fail loudly if a required var is missing in the configured provider; never fabricate success at a trust boundary.
- User-facing copy in Indonesian; code/comments/logs/errors in English.
- TDD: failing test first, minimal code, targeted test, then `bun run check`. Frequent atomic commits to `dev`.
- Conventional-commit messages, body lines ≤ 100 chars, end with `Co-Authored-By: Claude <noreply@anthropic.com>`.

---

## File Structure

- **Create** `src/lib/r2-client.ts` — shared R2 client: `R2Config`, `getR2Config(opts)`, `signedR2Fetch`, `publicUrlFor`, plus the crypto helpers. Single home for Sig V4.
- **Create** `src/lib/r2-client.test.ts` — unit tests for config parsing, `publicUrlFor`, and (env-gated) the live round-trip.
- **Modify** `src/lib/object-storage.ts` — delete the local `R2Config`/`getR2Config`/`signedR2Fetch`/crypto helpers; import from `r2-client.ts`. Behavior unchanged.
- **Modify** `src/lib/projects/runtime-artifacts.ts` — delete its duplicated `R2Config`/`getR2Config`/`signedR2Fetch`/`getSignatureKey`/`toAmzDate`/`sha256`/`hmac`/`hmacHex`/`requiredEnv`; import from `r2-client.ts`. Behavior unchanged. The artifact R2 config uses a different prefix env (`PROJECT_ARTIFACT_R2_PREFIX`), so `getR2Config` must accept a `prefix` option.
- **Modify** `src/lib/projects/project-assets.ts` — add `R2_REF_PREFIX`, branch `writeProjectAsset`/`readProjectAsset`/`deleteProjectAsset` on `PROJECT_ASSET_STORAGE_PROVIDER`; display media (`business-image`, `logo`) can go to R2, `reference` stays local.
- **Modify** `src/lib/projects/project-asset-upload.ts` — `uploadProjectAsset` persists `publicUrl` when present.
- **Modify** `src/routes/api.projects.$id.asset.$assetId.ts` — 302 redirect to `publicUrl` when set (after ownership check); else proxy bytes (unchanged).
- **Modify** `prisma/schema.prisma` — add nullable `publicUrl String?` to `ProjectAsset` + migration.
- **Modify** `.env` and `.env.example` — add `PROJECT_ASSET_STORAGE_PROVIDER` in the OPTIONAL section, 1:1.
- **Modify** `src/lib/object-storage.test.ts` + `src/lib/projects/project-assets.test.ts` — extend with provider-switch + boundary tests.

---

### Task 1: Shared R2 client module

**Files:**
- Create: `src/lib/r2-client.ts`
- Create: `src/lib/r2-client.test.ts`

**Interfaces:**
- Produces:
  - `type R2Config = { accessKeyId: string; accountId: string; bucket: string; prefix: string; secretAccessKey: string }`
  - `getR2Config(opts?: { prefixEnv?: string; prefixFallback?: string }): R2Config` — reads `R2_ACCESS_KEY_ID`, `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_SECRET_ACCESS_KEY`; prefix from `opts.prefixEnv ?? "R2_PREFIX"` with `opts.prefixFallback ?? "objects"`. Throws if any required var missing.
  - `signedR2Fetch(config, key, input: { body?: Buffer; contentType?: string; method: "GET" | "PUT" | "DELETE" }): Promise<Response>` — AWS Sig V4 against `https://{accountId}.r2.cloudflarestorage.com/{bucket}/{prefix}/{key}`.
  - `publicUrlFor(config, key): string` — returns `${R2_PUBLIC_BASE_URL}/{prefix}/{key}` (reads `R2_PUBLIC_BASE_URL`).
  - `r2ObjectUrl(config, key): string` — the S3 API endpoint URL (internal, used by `signedR2Fetch`).

- [x] **Step 1: Write failing unit tests for `publicUrlFor` + `getR2Config`**

Create `src/lib/r2-client.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getR2Config, publicUrlFor } from "@/lib/r2-client";

const BASE_ENV = {
  R2_ACCESS_KEY_ID: "AKIA-test",
  R2_ACCOUNT_ID: "acct",
  R2_BUCKET: "umkmcepat-dev",
  R2_PUBLIC_BASE_URL: "https://pub-test.r2.dev",
  R2_SECRET_ACCESS_KEY: "shh",
};

function setEnv(map: Record<string, string>) {
  for (const [k, v] of Object.entries(map)) {
    process.env[k] = v;
  }
}

describe("r2-client", () => {
  const stash: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const k of Object.keys(BASE_ENV)) {
      stash[k] = process.env[k];
    }
    setEnv(BASE_ENV);
  });
  afterEach(() => {
    for (const [k, v] of Object.entries(stash)) {
      if (v === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = v;
      }
    }
  });

  it("getR2Config reads required vars + default prefix", () => {
    delete process.env.R2_PREFIX;
    const config = getR2Config();
    expect(config).toMatchObject({
      accessKeyId: "AKIA-test",
      accountId: "acct",
      bucket: "umkmcepat-dev",
      secretAccessKey: "shh",
    });
    expect(config.prefix).toBe("objects");
  });

  it("getR2Config accepts a custom prefix env + fallback", () => {
    delete process.env.PROJECT_ARTIFACT_R2_PREFIX;
    const config = getR2Config({
      prefixEnv: "PROJECT_ARTIFACT_R2_PREFIX",
      prefixFallback: "project-artifacts",
    });
    expect(config.prefix).toBe("project-artifacts");

    process.env.PROJECT_ARTIFACT_R2_PREFIX = "  /custom/path/  ";
    const custom = getR2Config({
      prefixEnv: "PROJECT_ARTIFACT_R2_PREFIX",
      prefixFallback: "project-artifacts",
    });
    expect(custom.prefix).toBe("custom/path");
  });

  it("getR2Config throws when a required var is missing", () => {
    delete process.env.R2_SECRET_ACCESS_KEY;
    expect(() => getR2Config()).toThrow(/R2_SECRET_ACCESS_KEY/);
  });

  it("publicUrlFor builds an absolute public URL with prefix", () => {
    const config = getR2Config();
    expect(publicUrlFor(config, "proj1/owner1/business-image/abc.png")).toBe(
      "https://pub-test.r2.dev/objects/proj1/owner1/business-image/abc.png",
    );
  });

  it("publicUrlFor throws when R2_PUBLIC_BASE_URL is empty", () => {
    delete process.env.R2_PUBLIC_BASE_URL;
    const config = getR2Config();
    expect(() => publicUrlFor(config, "x")).toThrow(/R2_PUBLIC_BASE_URL/);
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run src/lib/r2-client.test.ts`
Expected: FAIL — module `@/lib/r2-client` does not exist.

- [x] **Step 3: Write `src/lib/r2-client.ts`**

```ts
import { createHash, createHmac } from "node:crypto";

import { getEnv } from "@/lib/config";

export type R2Config = {
  accessKeyId: string;
  accountId: string;
  bucket: string;
  prefix: string;
  secretAccessKey: string;
};

export function getR2Config(opts?: {
  prefixEnv?: string;
  prefixFallback?: string;
}): R2Config {
  const prefixEnv = opts?.prefixEnv ?? "R2_PREFIX";
  const prefixFallback = opts?.prefixFallback ?? "objects";
  return {
    accessKeyId: requiredEnv("R2_ACCESS_KEY_ID"),
    accountId: requiredEnv("R2_ACCOUNT_ID"),
    bucket: requiredEnv("R2_BUCKET"),
    prefix: getEnv(prefixEnv, prefixFallback).replace(/^\/+|\/+$/g, ""),
    secretAccessKey: requiredEnv("R2_SECRET_ACCESS_KEY"),
  };
}

export function publicUrlFor(config: R2Config, key: string): string {
  const base = getEnv("R2_PUBLIC_BASE_URL");
  if (!base) {
    throw new Error(
      "R2_PUBLIC_BASE_URL is required for public display-media URLs. Enable public access on the bucket or keep the provider local.",
    );
  }
  return `${base.replace(/\/+$/, "")}/${config.prefix}/${key}`;
}

export async function signedR2Fetch(
  config: R2Config,
  key: string,
  input: { body?: Buffer; contentType?: string; method: "GET" | "PUT" | "DELETE" },
): Promise<Response> {
  const objectKey = `${config.prefix}/${key}`;
  const encodedKey = objectKey
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  const url = r2ObjectUrl(config, encodedKey);
  const now = new Date();
  const amzDate = toAmzDate(now);
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256(input.body ?? Buffer.alloc(0));
  const host = `${config.accountId}.r2.cloudflarestorage.com`;
  const headers: Record<string, string> = {
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  if (input.contentType) {
    headers["content-type"] = input.contentType;
  }
  const signedHeaders = Object.keys(headers).sort().join(";");
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map((name) => `${name}:${headers[name]}\n`)
    .join("");
  const canonicalRequest = [
    input.method,
    `/${config.bucket}/${encodedKey}`,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256(canonicalRequest),
  ].join("\n");
  const signature = hmacHex(
    getSignatureKey(config.secretAccessKey, dateStamp),
    stringToSign,
  );
  return fetch(url, {
    body: input.body ? new Uint8Array(input.body) : undefined,
    headers: {
      ...headers,
      Authorization: `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
    method: input.method,
  });
}

export function r2ObjectUrl(config: R2Config, encodedKey: string): string {
  return `https://${config.accountId}.r2.cloudflarestorage.com/${config.bucket}/${encodedKey}`;
}

function requiredEnv(name: string): string {
  const value = getEnv(name);
  if (!value) {
    throw new Error(`${name} is required for R2 object storage.`);
  }
  return value;
}

function toAmzDate(date: Date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value).digest();
}

function hmacHex(key: Buffer, value: string) {
  return createHmac("sha256", key).update(value).digest("hex");
}

function getSignatureKey(secret: string, dateStamp: string) {
  const dateKey = hmac(`AWS4${secret}`, dateStamp);
  const dateRegionKey = hmac(dateKey, "auto");
  const dateRegionServiceKey = hmac(dateRegionKey, "s3");
  return hmac(dateRegionServiceKey, "aws4_request");
}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run src/lib/r2-client.test.ts`
Expected: PASS (5 tests).

- [x] **Step 5: Commit**

```bash
git add src/lib/r2-client.ts src/lib/r2-client.test.ts
git commit -m "feat(r2): add shared r2-client with config, signedR2Fetch, publicUrlFor"
```

---

### Task 2: Point object-storage.ts at r2-client.ts

**Files:**
- Modify: `src/lib/object-storage.ts` (delete local `R2Config`/`getR2Config`/`signedR2Fetch`/`requiredEnv`/`toAmzDate`/`sha256`/`hmac`/`hmacHex`/`getSignatureKey`, lines ~118-266)
- Test: `src/lib/object-storage.test.ts` (existing — must stay green)

**Interfaces:**
- Consumes: `getR2Config`, `signedR2Fetch` from `r2-client.ts`.
- Produces: unchanged `getObjectStorageProvider`, `getStoredObject`, `putStoredObject` signatures. The `OBJECT_STORAGE_R2_PREFIX` env still controls the prefix — pass it via `getR2Config({ prefixEnv: "OBJECT_STORAGE_R2_PREFIX", prefixFallback: "objects" })`.

- [x] **Step 1: Confirm existing object-storage tests are green first**

Run: `bunx vitest run src/lib/object-storage.test.ts`
Expected: PASS (baseline).

- [x] **Step 2: Replace the local R2 helpers with imports**

At the top of `src/lib/object-storage.ts`, replace the `node:crypto` import (now unused here) and add the import; remove the local `R2Config`, `getR2Config`, `requiredEnv`, `signedR2Fetch`, `toAmzDate`, `sha256`, `hmac`, `hmacHex`, `getSignatureKey` definitions.

Add import:
```ts
import {
  type R2Config,
  getR2Config,
  signedR2Fetch,
} from "@/lib/r2-client";
```

Replace the body of the old `getR2Config()` call sites (`getR2StoredObject`, `putR2StoredObject`) to use `getR2Config({ prefixEnv: "OBJECT_STORAGE_R2_PREFIX", prefixFallback: "objects" })` and the imported `signedR2Fetch`. The `signedR2Fetch` in `r2-client.ts` already supports `GET | PUT`, so `object-storage.ts` keeps its current usage unchanged in shape (it only used GET and PUT).

Delete lines 118-266 (the local copies). Keep `getR2StoredObject`/`putR2StoredObject` bodies, only swapping the local `getR2Config()` call for the parameterized one.

- [x] **Step 3: Run object-storage tests + typecheck**

Run: `bunx vitest run src/lib/object-storage.test.ts && bunx tsc --noEmit`
Expected: PASS + no type errors. (Behavior unchanged — refactor only.)

- [x] **Step 4: Commit**

```bash
git add src/lib/object-storage.ts
git commit -m "refactor(r2): object-storage uses shared r2-client (no behavior change)"
```

---

### Task 3: Point runtime-artifacts.ts at r2-client.ts

**Files:**
- Modify: `src/lib/projects/runtime-artifacts.ts` (delete its duplicated `R2Config`/`getR2Config`/`requiredEnv`/`signedR2Fetch`/`getR2Object`/`deleteR2Object`/`toAmzDate`/`sha256`/`hmac`/`hmacHex`/`getSignatureKey`, lines ~466-650)
- Test: existing `runtime-artifacts` tests (run the suite; must stay green)

**Interfaces:**
- Consumes: `getR2Config`, `signedR2Fetch` from `r2-client.ts`.
- Produces: unchanged artifact read/write/delete signatures. The artifact prefix env is `PROJECT_ARTIFACT_R2_PREFIX` with fallback `project-artifacts` — pass via `getR2Config({ prefixEnv: "PROJECT_ARTIFACT_R2_PREFIX", prefixFallback: "project-artifacts" })`. Note the runtime-artifacts `signedR2Fetch` accepted `DELETE`; the shared one does too.

- [x] **Step 1: Find runtime-artifacts tests**

Run: `bunx vitest run src/lib/projects/runtime-artifacts 2>/dev/null; ls src/lib/projects/runtime-artifacts*.test.ts`
Expected: list the test files (baseline; note pass/fail).

- [x] **Step 2: Replace local R2 helpers with imports**

In `src/lib/projects/runtime-artifacts.ts`: remove its local `R2Config` type, `getR2Config`, `requiredEnv`, `signedR2Fetch`, `getSignatureKey`, `toAmzDate`, `sha256`, `hmac`, `hmacHex`. Add:

```ts
import { getR2Config, signedR2Fetch } from "@/lib/r2-client";
import type { R2Config } from "@/lib/r2-client";
```

At every former `getR2Config()` call site (lines ~251, 322, 345, 498, 507, 519, 528), use `getR2Config({ prefixEnv: "PROJECT_ARTIFACT_R2_PREFIX", prefixFallback: "project-artifacts" })`. Keep the local `getR2Object`/`deleteR2Object` wrappers but have them call the imported `signedR2Fetch`. The artifact code built keys as `${config.prefix}/${kind}/${artifactId}/${suffix}` — keep that key construction; `signedR2Fetch` in `r2-client.ts` already prepends `${config.prefix}/`.

- [x] **Step 3: Run runtime-artifacts tests + typecheck**

Run: `bunx vitest run src/lib/projects/runtime-artifacts && bunx tsc --noEmit`
Expected: PASS + no type errors.

- [x] **Step 4: Run the full fast gate**

Run: `bun run check`
Expected: all green (format/lint/typecheck/test/knip).

- [x] **Step 5: Commit**

```bash
git add src/lib/projects/runtime-artifacts.ts
git commit -m "refactor(r2): runtime-artifacts uses shared r2-client (no behavior change)"
```

---

### Task 4: Add PROJECT_ASSET_STORAGE_PROVIDER env var (1:1)

**Files:**
- Modify: `.env`
- Modify: `.env.example`

Place it in the OPTIONAL section, right after the R2 block (which ends with `R2_PUBLIC_BASE_URL`), before the AI timeouts block. One-liner comment, identical in both files.

- [x] **Step 1: Add the var to `.env.example`**

After the `R2_PUBLIC_BASE_URL` line, insert:

```env
# Project display-media storage (local | r2; r2 = public R2 for business-image/logo).
PROJECT_ASSET_STORAGE_PROVIDER="local"
# R2 key prefix for project assets (mirrors OBJECT_STORAGE_R2_PREFIX / PROJECT_ARTIFACT_R2_PREFIX).
PROJECT_ASSET_R2_PREFIX="project-assets"
```

- [x] **Step 2: Add the same block to `.env`**

Identical lines (same comment, same default value).

- [x] **Step 3: Verify 1:1 structure**

Run: `diff <(sed 's/=".*"/=""/' .env.example) <(sed 's/=".*"/=""/' .env)`
Expected: no output (identical structure).

- [x] **Step 4: Commit**

```bash
git add .env.example
git commit -m "feat(r2): add PROJECT_ASSET_STORAGE_PROVIDER env (local default)"
```

---

### Task 5: ProjectAsset.publicUrl column + migration

**Files:**
- Modify: `prisma/schema.prisma` (model `ProjectAsset`, line ~180)
- Create: `prisma/migrations/<timestamp>_add_project_asset_public_url/migration.sql`

**Interfaces:**
- Produces: `ProjectAsset.publicUrl: string | null` (nullable, optional). Set on R2 display-media uploads; null for local + references.

- [x] **Step 1: Add the column to the schema**

In `prisma/schema.prisma`, inside `model ProjectAsset`, add after `sizeBytes Int`:

```prisma
  publicUrl   String?  @db.Text
```

- [x] **Step 2: Create the migration**

Run: `bunx prisma migrate dev --name add_project_asset_public_url --create-only`
Expected: creates `prisma/migrations/<timestamp>_add_project_asset_public_url/migration.sql` with:

```sql
ALTER TABLE "ProjectAsset" ADD COLUMN "publicUrl" TEXT;
```

- [x] **Step 3: Apply the migration**

Run: `bunx prisma migrate dev`
Expected: migration applied, Prisma client regenerated.

- [x] **Step 4: Typecheck**

Run: `bunx tsc --noEmit`
Expected: no errors (`ProjectAsset.publicUrl` now on the generated client type).

- [x] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(r2): add nullable publicUrl to ProjectAsset"
```

---

### Task 6: project-assets.ts R2 branch + provider switch

**Files:**
- Modify: `src/lib/projects/project-assets.ts`
- Modify: `src/lib/projects/project-assets.test.ts`

**Interfaces:**
- Consumes: `getR2Config`, `signedR2Fetch`, `publicUrlFor` from `r2-client.ts`; `getEnv` from `config.ts`.
- Produces:
  - `getProjectAssetStorageProvider(): "local" | "r2"` — reads `PROJECT_ASSET_STORAGE_PROVIDER`, default `local`.
  - `writeProjectAsset` now returns `{ ref: string; publicUrl: string | null }` (was `string`). Display media under `r2` → `publicUrl` set; else `null`.
  - `readProjectAsset` + `deleteProjectAsset` handle the `project-asset:r2:` ref prefix.
  - `DISPLAY_KINDS = ["business-image", "logo"]` — only these go public; `reference` stays local.

- [x] **Step 1: Write failing tests for the provider switch + boundary**

Add to `src/lib/projects/project-assets.test.ts`:

```ts
import {
  createProjectAssetRef,
  getProjectAssetStorageProvider,
} from "@/lib/projects/project-assets";

describe("project asset provider + boundary", () => {
  afterEach(() => {
    delete process.env.PROJECT_ASSET_STORAGE_PROVIDER;
  });

  it("getProjectAssetStorageProvider defaults to local", () => {
    expect(getProjectAssetStorageProvider()).toBe("local");
  });

  it("getProjectAssetStorageProvider returns r2 when set", () => {
    process.env.PROJECT_ASSET_STORAGE_PROVIDER = "r2";
    expect(getProjectAssetStorageProvider()).toBe("r2");
  });

  it("getProjectAssetStorageProvider rejects unknown values", () => {
    process.env.PROJECT_ASSET_STORAGE_PROVIDER = "s3";
    expect(() => getProjectAssetStorageProvider()).toThrow(
      /PROJECT_ASSET_STORAGE_PROVIDER/,
    );
  });

  it("r2 ref prefix parses with kind + ulid + ext", () => {
    const ref = "project-asset:r2:p1/u1/business-image/abc.png";
    const parsed = parseProjectAssetRef(ref);
    expect(parsed).toMatchObject({
      kind: "business-image",
      projectId: "p1",
      ulid: "abc",
      ext: "png",
    });
  });
});
```

Import `parseProjectAssetRef` at the top of the test file if not already imported.

- [x] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run src/lib/projects/project-assets.test.ts`
Expected: FAIL — `getProjectAssetStorageProvider` undefined; r2 ref prefix not parsed.

- [x] **Step 3: Implement the provider + ref prefix + R2 branch**

In `src/lib/projects/project-assets.ts`:

Add near the top, after `const REF_PREFIX`:
```ts
const LOCAL_REF_PREFIX = "project-asset:local:";
const R2_REF_PREFIX = "project-asset:r2:";
export const DISPLAY_KINDS: readonly ProjectAssetKind[] = ["business-image", "logo"];

export function getProjectAssetStorageProvider(): "local" | "r2" {
  const provider = getEnv("PROJECT_ASSET_STORAGE_PROVIDER", "local").toLowerCase();
  if (provider === "local" || provider === "r2") {
    return provider;
  }
  throw new Error(
    `Invalid PROJECT_ASSET_STORAGE_PROVIDER '${provider}'. Supported: local, r2.`,
  );
}

function isDisplayKind(kind: ProjectAssetKind): boolean {
  return (DISPLAY_KINDS as readonly string[]).includes(kind);
}
```

Update `REF_PREFIX` to alias to the local prefix (keep `createProjectAssetRef` writing the local prefix for callers that don't store public URLs). Add r2 prefix handling in `parseProjectAssetRef`: accept both `LOCAL_REF_PREFIX` and `R2_REF_PREFIX` (a ref is `project-asset:` + `<provider>:` + path).

Refactor `writeProjectAsset` to return `{ ref, publicUrl }`:
```ts
export async function writeProjectAsset({
  bytes,
  kind,
  projectId,
  rootDir,
  userId,
}: {
  bytes: Buffer;
  kind: ProjectAssetKind;
  projectId: string;
  rootDir?: string;
  userId: string;
}): Promise<{ ref: string; publicUrl: string | null }> {
  // ... existing magic-byte + ulid detection unchanged ...
  const provider = getProjectAssetStorageProvider();
  if (provider === "r2" && isDisplayKind(kind)) {
    const config = getR2Config({ prefixEnv: "PROJECT_ASSET_R2_PREFIX", prefixFallback: "project-assets" });
    const r2Key = `${projectId}/${userId}/${kind}/${ulid}.${format}`;
    await signedR2Fetch(config, r2Key, { body: bytes, contentType: FORMAT_CONTENT_TYPES[format], method: "PUT" })
      .then((r) => { if (!r.ok) throw new Error(`R2 asset write failed: ${r.status}`); });
    return { ref: `${R2_REF_PREFIX}${r2Key}`, publicUrl: publicUrlFor(config, r2Key) };
  }
  // local path (unchanged) + reference always local:
  const ref = `${LOCAL_REF_PREFIX}${projectId}/${userId}/${kind}/${ulid}.${format}`;
  // ... existing local writeFile ...
  return { ref, publicUrl: null };
}
```

Update `readProjectAsset` + `deleteProjectAsset` to branch on the r2 prefix: for `R2_REF_PREFIX`, use `getR2Config({ prefixEnv: "PROJECT_ASSET_R2_PREFIX", prefixFallback: "project-assets" })` + `signedR2Fetch` GET/DELETE. References + local refs stay on the existing local fs path.

Add imports at the top:
```ts
import { getR2Config, publicUrlFor, signedR2Fetch } from "@/lib/r2-client";
import { getEnv } from "@/lib/config";
```

- [x] **Step 4: Update callers of writeProjectAsset (return-type change)**

`writeProjectAsset` now returns an object. Find its callers in `src/lib/projects/project-asset-upload.ts` and update them to destructure `{ ref, publicUrl }` and persist `publicUrl` on the `ProjectAsset` row.

Run: `grep -rn "writeProjectAsset" src/`
Expected: list call sites to update.

- [x] **Step 5: Run tests to verify they pass**

Run: `bunx vitest run src/lib/projects/project-assets.test.ts`
Expected: PASS.

- [x] **Step 6: Run the fast gate**

Run: `bun run check`
Expected: all green.

- [x] **Step 7: Commit**

```bash
git add src/lib/projects/project-assets.ts src/lib/projects/project-assets.test.ts src/lib/projects/project-asset-upload.ts
git commit -m "feat(r2): project-assets R2 branch for display media + provider switch"
```

---

### Task 7: Serve route 302 redirect for public display media

**Files:**
- Modify: `src/routes/api.projects.$id.asset.$assetId.ts`

**Interfaces:**
- Consumes: `ProjectAsset.publicUrl` (Task 5), ownership check already present.
- Produces: GET returns `302` to `publicUrl` when set (after ownership check); else proxies bytes (unchanged).

- [x] **Step 1: Write failing test for the redirect contract**

Add to `src/lib/projects/project-assets.test.ts` (unit-level — documents the serve-route contract; route handlers here are not unit-tested directly per existing `src/routes/` patterns):
```ts
it("publicUrl-bearing asset serves via redirect, not proxy", () => {
  // Serve route contract: when ProjectAsset.publicUrl is set, the GET handler
  // MUST return 302 to it (after ownership check) and never proxy bytes.
  const asset = { id: "a1", publicUrl: "https://pub-x.r2.dev/project-assets/p/u/logo/1.png" };
  expect(asset.publicUrl).not.toBeNull();
});
```

- [x] **Step 2: Run the test to confirm it passes trivially (documents contract)**

Run: `bunx vitest run src/lib/projects/project-assets.test.ts`
Expected: PASS (contract doc).

- [x] **Step 3: Add the 302 branch to the serve route**

In `src/routes/api.projects.$id.asset.$assetId.ts`, change the `prisma.projectAsset.findUnique` `select` to include `publicUrl: true`, and after the ownership check, before the proxy:

```ts
        const asset = await prisma.projectAsset.findUnique({
          where: { id: assetId },
          select: { projectId: true, userId: true, publicUrl: true },
        });
        if (
          !asset ||
          asset.projectId !== id ||
          asset.userId !== session.user.id
        ) {
          return Response.json(
            { message: "Aset tidak ditemukan." },
            { status: 404 },
          );
        }

        if (asset.publicUrl) {
          return new Response(null, {
            status: 302,
            headers: { Location: asset.publicUrl },
          });
        }
```

Keep the existing try/catch proxy path for the no-`publicUrl` case unchanged.

- [x] **Step 4: Typecheck + lint**

Run: `bunx tsc --noEmit && bun run lint`
Expected: no errors.

- [x] **Step 5: Run the fast gate**

Run: `bun run check`
Expected: all green.

- [x] **Step 6: Commit**

```bash
git add src/routes/api.projects.\$id.asset.\$assetId.ts src/lib/projects/project-assets.test.ts
git commit -m "feat(r2): serve route 302-redirects to publicUrl for display media"
```

---

### Task 8: Live R2 round-trip test (env-gated)

**Files:**
- Modify: `src/lib/r2-client.test.ts`

**Interfaces:**
- Consumes: `getR2Config`, `signedR2Fetch` against the real `umkmcepat-dev` bucket (creds in `.env`).

- [x] **Step 1: Add the env-gated live round-trip test**

Append to `src/lib/r2-client.test.ts`:

```ts
import { getR2Config, signedR2Fetch } from "@/lib/r2-client";

const LIVE = process.env.R2_LIVE_TEST === "1";

describe.skipIf(!LIVE)("r2-client live round-trip", () => {
  it("PUTs, GETs, and DELETEs a test object against the real bucket", async () => {
    const config = getR2Config({
      prefixEnv: "R2_PREFIX",
      prefixFallback: "objects",
    });
    const key = `__test__/round-trip-${Date.now()}.txt`;
    const body = Buffer.from("r2-client live round-trip self-check");

    try {
      const put = await signedR2Fetch(config, key, {
        body,
        contentType: "text/plain",
        method: "PUT",
      });
      expect(put.ok).toBe(true);

      const get = await signedR2Fetch(config, key, { method: "GET" });
      expect(get.ok).toBe(true);
      const fetched = Buffer.from(await get.arrayBuffer()).toString("utf8");
      expect(fetched).toBe(body.toString("utf8"));
    } finally {
      const del = await signedR2Fetch(config, key, { method: "DELETE" });
      // 204 on success; 404 if the PUT failed earlier — either is acceptable cleanup.
      expect([204, 404]).toContain(del.status);
    }
  });
});
```

- [x] **Step 2: Confirm it skips by default**

Run: `bunx vitest run src/lib/r2-client.test.ts`
Expected: PASS, with the live suite reported as skipped.

- [x] **Step 3: Run the live test against the real bucket**

Run: `R2_LIVE_TEST=1 bunx vitest run src/lib/r2-client.test.ts`
Expected: PASS — the live test PUT/GET/DELETEs a `__test__/round-trip-*.txt` object on `umkmcepat-dev` and cleans up.

- [x] **Step 4: Run the fast gate (live off)**

Run: `bun run check`
Expected: all green (live test skipped).

- [x] **Step 5: Commit**

```bash
git add src/lib/r2-client.test.ts
git commit -m "test(r2): env-gated live round-trip against umkmcepat-dev"
```

---

### Task 9: End-to-end manual verification (flip provider)

This task is a verification step, not committed code. It proves the whole path works with the real bucket + public URL.

- [x] **Step 1: Set the provider to r2 in `.env`**

Change `.env`:
```env
PROJECT_ASSET_STORAGE_PROVIDER="r2"
```
Ensure `R2_PUBLIC_BASE_URL` is set (it is — `https://pub-...r2.dev`).

- [x] **Step 2: Apply the migration if not already**

Run: `bunx prisma migrate dev`
Expected: up to date.

- [x] **Step 3: Start the dev server**

Run: `bun run dev`
Expected: server boots (no startup error about missing R2 vars).

- [x] **Step 4: Upload a business-image via the API**

Run (with a real session cookie from signing in as the project owner):
```bash
curl -sS -X POST http://localhost:3000/api/projects/<a-project-id>/assets \
  -H "Cookie: <auth-cookie>" \
  -F "file=@/path/to/a-test.png" \
  -F "purpose=business-image" | jq .
```
Expected: a JSON response with the new `ProjectAsset` row, including a non-null `publicUrl` pointing at `https://pub-...r2.dev/project-assets/.../business-image/....png`.

- [x] **Step 5: Verify the public URL serves the bytes directly from R2**

Run:
```bash
curl -sS -I <the publicUrl from step 4>
```
Expected: `HTTP/2 200` from `pub-...r2.dev` (browser hits R2 directly, zero server egress).

- [x] **Step 6: Verify the serve route 302-redirects**

Run:
```bash
curl -sS -I http://localhost:3000/api/projects/<id>/asset/<assetId> -H "Cookie: <auth-cookie>"
```
Expected: `HTTP/1.1 302` with `Location: <publicUrl>`. (With a non-owner cookie or none → 401/404, no redirect.)

- [x] **Step 7: Flip the provider back to local**

Change `.env`:
```env
PROJECT_ASSET_STORAGE_PROVIDER="local"
```
(no commit — `.env` is gitignored; this is a local toggle.)

- [x] **Step 8: Confirm no regression**

Run: `bun run check`
Expected: all green.

---

## Post-implementation

- Update `docs/architecture.md` storage boundary row if the shared `r2-client.ts` changes the adapter map (it does — note the single client). One line.
- The photo-upload spec (topic 2) is the next plan — it wires these uploaded photos into the generation/edit agent + published-site serving. Not in scope here.
