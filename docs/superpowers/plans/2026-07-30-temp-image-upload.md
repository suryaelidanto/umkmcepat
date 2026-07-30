# Temporary Image Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all user image uploads pre-upload immediately, then submit only uploaded temp asset IDs.

**Architecture:** Add one shared temp image upload API backed by private object storage and signed expiring tokens. Reuse existing final asset persistence by claiming temp uploads into project, support, and waitlist destinations on final submit. No new Prisma model.

**Tech Stack:** TanStack Router routes, React, Bun, Vitest, Prisma existing models, existing S3/MinIO/R2 helpers.

## Global Constraints

- Use Bun only.
- User-facing product UI copy uses Indonesian.
- Developer-facing docs/code/logs/errors use English.
- Do not add new dependencies.
- No new Prisma temp upload model.
- Temp upload TTL is 1 hour.
- Temp objects live under `temp-uploads/<userId>/<expiresEpochMs>/<uuid>.<ext>`.
- Client never treats raw storage keys as authority; use signed opaque tokens.
- Run nearest focused tests during implementation; run `bun run check` before handoff.

---

## File Map

- Create: `src/lib/uploads/temp-image-token.ts` — sign/verify opaque temp upload tokens.
- Create: `src/lib/uploads/temp-image-storage.ts` — validate, write, read, delete, cleanup, claim temp objects.
- Create: `src/lib/uploads/temp-image-client.ts` — small browser helper for temp upload/delete.
- Create: `src/lib/uploads/temp-image-token.test.ts` — token behavior tests.
- Create: `src/lib/uploads/temp-image-storage.test.ts` — storage/claim behavior tests with mocked S3 helpers.
- Create: `src/routes/api.uploads.temp-images.ts` — `POST /api/uploads/temp-images`.
- Create: `src/routes/api.uploads.temp-images.$assetId.ts` — `GET`/`DELETE /api/uploads/temp-images/$assetId`.
- Modify: `src/lib/projects/composer-attachments.ts` — attachment state includes upload status and uploaded `assetId`.
- Modify: `src/components/projects/ComposerAttachments.tsx` — display upload state if not already available.
- Modify: `src/components/projects/HomePromptForm.tsx` — upload on selection, submit `assetIds`.
- Modify: `src/routes/api.projects.ts` — accept/claim `assetIds`.
- Modify: `src/components/projects/WorkspaceShell.tsx` — pre-upload selected chat/project images, disable send while uploading.
- Modify: `src/routes/api.projects.$id.assets.upload.ts` — bridge or replace direct blob path with shared claim path.
- Modify: `src/routes/_main.waitlist.tsx` — pre-upload photos, submit `assetIds`.
- Modify: waitlist submit route in `src/routes/_main.waitlist.tsx` or adjacent server action — accept/claim `assetIds`.
- Modify: `src/routes/_main.support.tsx` — use shared temp upload client.
- Modify: `src/routes/_main.support.$ticketId.tsx` — use shared temp upload client.
- Modify: `src/routes/_main.admin.tickets.$ticketId.tsx` — use shared temp upload client.
- Modify: `src/routes/api.support.assets.ts` — keep compatibility or turn into thin wrapper.
- Modify: `src/routes/api.support.tickets.ts` — claim temp assets.
- Modify: `src/routes/api.support.tickets.$ticketId.ts` — claim temp assets.
- Modify: `src/routes/api.admin.tickets.$ticketId.reply.ts` — claim temp assets.
- Modify tests already covering above routes.

---

### Task 1: Signed temp image tokens

**Files:**
- Create: `src/lib/uploads/temp-image-token.ts`
- Create: `src/lib/uploads/temp-image-token.test.ts`

**Interfaces:**
- Produces: `signTempImageToken(payload: TempImageTokenPayload): string`
- Produces: `verifyTempImageToken(token: string): TempImageTokenPayload | null`
- Produces: `TempImageTokenPayload`

- [ ] **Step 1: Write failing token tests**

```ts
import { describe, expect, it } from "vitest";

import {
  signTempImageToken,
  verifyTempImageToken,
  type TempImageTokenPayload,
} from "./temp-image-token";

const payload: TempImageTokenPayload = {
  contentType: "image/png",
  expiresAt: 1790000000000,
  key: "temp-uploads/user_1/1790000000000/file.png",
  sizeBytes: 123,
  userId: "user_1",
};

describe("temp image tokens", () => {
  it("round-trips a signed payload", () => {
    expect(verifyTempImageToken(signTempImageToken(payload))).toEqual(payload);
  });

  it("rejects a tampered token", () => {
    const token = signTempImageToken(payload);
    const tampered = token.replace("user_1", "user_2");

    expect(verifyTempImageToken(tampered)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify RED**

Run: `bun test src/lib/uploads/temp-image-token.test.ts`

Expected: FAIL because `src/lib/uploads/temp-image-token.ts` does not exist.

- [ ] **Step 3: Implement minimal token helper**

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

import { getEnv } from "@/lib/config";

export type TempImageTokenPayload = {
  contentType: string;
  expiresAt: number;
  key: string;
  sizeBytes: number;
  userId: string;
};

function secret(): string {
  return getEnv("BETTER_AUTH_SECRET") || getEnv("AUTH_SECRET") || "dev-secret";
}

function base64url(value: string): string {
  return Buffer.from(value).toString("base64url");
}

function unbase64url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(body: string): string {
  return createHmac("sha256", secret()).update(body).digest("base64url");
}

export function signTempImageToken(payload: TempImageTokenPayload): string {
  const body = base64url(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

export function verifyTempImageToken(
  token: string,
): TempImageTokenPayload | null {
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  const expected = sign(body);
  const given = Buffer.from(signature);
  const wanted = Buffer.from(expected);
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) {
    return null;
  }

  try {
    const parsed = JSON.parse(unbase64url(body)) as TempImageTokenPayload;
    if (
      typeof parsed.contentType !== "string" ||
      typeof parsed.expiresAt !== "number" ||
      typeof parsed.key !== "string" ||
      typeof parsed.sizeBytes !== "number" ||
      typeof parsed.userId !== "string"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify GREEN**

Run: `bun test src/lib/uploads/temp-image-token.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/uploads/temp-image-token.ts src/lib/uploads/temp-image-token.test.ts
git commit -m "feat: add signed temp image tokens"
```

---

### Task 2: Temp image storage primitive

**Files:**
- Create: `src/lib/uploads/temp-image-storage.ts`
- Create: `src/lib/uploads/temp-image-storage.test.ts`
- Modify: `src/lib/s3-client.ts`

**Interfaces:**
- Consumes: `signTempImageToken`, `verifyTempImageToken`
- Produces: `uploadTempImage(userId: string, file: File): Promise<{ assetId: string; url: string }>`
- Produces: `readTempImage(userId: string, assetId: string): Promise<{ body: Buffer; contentType: string }>`
- Produces: `deleteTempImage(userId: string, assetId: string): Promise<void>`
- Produces: `claimTempImage(userId: string, assetId: string, finalKey: string): Promise<{ contentType: string; sizeBytes: number; ref: string }>`
- Produces: `cleanupExpiredTempImages(userId: string, nowMs?: number): Promise<void>`

- [ ] **Step 1: Write failing storage tests**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  claimTempImage,
  uploadTempImage,
} from "./temp-image-storage";

vi.mock("@/lib/s3-client", () => {
  const objects = new Map<string, { body: Buffer; contentType: string }>();
  return {
    copyS3Object: vi.fn(async (_bucket: string, from: string, to: string) => {
      const object = objects.get(from);
      if (!object) throw new Error("missing source");
      objects.set(to, object);
    }),
    deleteS3Object: vi.fn(async (_bucket: string, key: string) => {
      objects.delete(key);
    }),
    getS3Object: vi.fn(async (_bucket: string, key: string) => {
      const object = objects.get(key);
      if (!object) throw new Error("missing object");
      return object.body;
    }),
    listS3Keys: vi.fn(async () => Array.from(objects.keys())),
    putS3Object: vi.fn(async (_bucket: string, key: string, body: Buffer, contentType: string) => {
      objects.set(key, { body, contentType });
    }),
    __objects: objects,
  };
});

describe("temp image storage", () => {
  beforeEach(async () => {
    const s3 = await import("@/lib/s3-client");
    (s3 as unknown as { __objects: Map<string, unknown> }).__objects.clear();
  });

  it("uploads an image and claims it to a final key", async () => {
    const file = new File(["abc"], "photo.png", { type: "image/png" });
    const uploaded = await uploadTempImage("user_1", file);

    const claimed = await claimTempImage(
      "user_1",
      uploaded.assetId,
      "project-assets/project_1/photo.png",
    );

    expect(claimed).toEqual({
      contentType: "image/png",
      ref: "project-assets/project_1/photo.png",
      sizeBytes: 3,
    });
  });

  it("rejects claim by another user", async () => {
    const file = new File(["abc"], "photo.png", { type: "image/png" });
    const uploaded = await uploadTempImage("user_1", file);

    await expect(
      claimTempImage("user_2", uploaded.assetId, "project-assets/project_1/photo.png"),
    ).rejects.toThrow("Gambar tidak valid.");
  });
});
```

- [ ] **Step 2: Run test to verify RED**

Run: `bun test src/lib/uploads/temp-image-storage.test.ts`

Expected: FAIL because storage helper does not exist.

- [ ] **Step 3: Add S3 copy/list helpers**

Modify `src/lib/s3-client.ts` imports:

```ts
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
```

Add:

```ts
export async function copyS3Object(
  bucket: "public" | "private",
  fromKey: string,
  toKey: string,
): Promise<void> {
  const { client, bucket: name } = getS3Config(bucket);
  await client.send(
    new CopyObjectCommand({
      Bucket: name,
      CopySource: `${name}/${fromKey}`,
      Key: toKey,
    }),
  );
}

export async function listS3Keys(
  bucket: "public" | "private",
  prefix: string,
): Promise<string[]> {
  const { client, bucket: name } = getS3Config(bucket);
  const keys: string[] = [];
  let ContinuationToken: string | undefined;

  do {
    const response = await client.send(
      new ListObjectsV2Command({ Bucket: name, ContinuationToken, Prefix: prefix }),
    );
    keys.push(...(response.Contents ?? []).map((item) => item.Key).filter(Boolean));
    ContinuationToken = response.NextContinuationToken;
  } while (ContinuationToken);

  return keys;
}
```

- [ ] **Step 4: Implement temp storage helper**

```ts
import { randomUUID } from "node:crypto";

import {
  copyS3Object,
  deleteS3Object,
  getS3Object,
  listS3Keys,
  putS3Object,
} from "@/lib/s3-client";

import {
  signTempImageToken,
  verifyTempImageToken,
} from "./temp-image-token";

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const TEMP_IMAGE_TTL_MS = 60 * 60 * 1000;

function extensionFor(contentType: string): string {
  if (contentType === "image/jpeg") return "jpg";
  if (contentType === "image/png") return "png";
  return "webp";
}

function assertValidImage(file: File): void {
  if (!ALLOWED_IMAGE_TYPES.has(file.type) || file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
    throw new Error("Maksimal 5MB per gambar. Gunakan PNG, JPG, atau WebP.");
  }
}

function verifyOwnedTempToken(userId: string, assetId: string) {
  const payload = verifyTempImageToken(assetId);
  if (!payload || payload.userId !== userId) {
    throw new Error("Gambar tidak valid.");
  }
  if (payload.expiresAt <= Date.now()) {
    throw new Error("Upload gambar sudah kedaluwarsa. Pilih gambar lagi.");
  }
  if (!payload.key.startsWith(`temp-uploads/${userId}/`)) {
    throw new Error("Gambar tidak valid.");
  }
  if (!ALLOWED_IMAGE_TYPES.has(payload.contentType) || payload.sizeBytes > MAX_IMAGE_BYTES) {
    throw new Error("Gambar tidak valid.");
  }
  return payload;
}

export async function uploadTempImage(userId: string, file: File) {
  assertValidImage(file);
  await cleanupExpiredTempImages(userId);

  const expiresAt = Date.now() + TEMP_IMAGE_TTL_MS;
  const key = `temp-uploads/${userId}/${expiresAt}/${randomUUID()}.${extensionFor(file.type)}`;
  const body = Buffer.from(await file.arrayBuffer());

  await putS3Object("private", key, body, file.type);

  const assetId = signTempImageToken({
    contentType: file.type,
    expiresAt,
    key,
    sizeBytes: file.size,
    userId,
  });

  return {
    assetId,
    url: `/api/uploads/temp-images/${encodeURIComponent(assetId)}`,
  };
}

export async function readTempImage(userId: string, assetId: string) {
  const payload = verifyOwnedTempToken(userId, assetId);
  return {
    body: await getS3Object("private", payload.key),
    contentType: payload.contentType,
  };
}

export async function deleteTempImage(userId: string, assetId: string): Promise<void> {
  const payload = verifyTempImageToken(assetId);
  if (!payload || payload.userId !== userId || !payload.key.startsWith(`temp-uploads/${userId}/`)) {
    return;
  }
  await deleteS3Object("private", payload.key);
}

export async function claimTempImage(userId: string, assetId: string, finalKey: string) {
  const payload = verifyOwnedTempToken(userId, assetId);
  await copyS3Object("private", payload.key, finalKey);
  await deleteS3Object("private", payload.key).catch(() => undefined);
  return {
    contentType: payload.contentType,
    ref: finalKey,
    sizeBytes: payload.sizeBytes,
  };
}

export async function cleanupExpiredTempImages(userId: string, nowMs = Date.now()): Promise<void> {
  const prefix = `temp-uploads/${userId}/`;
  const keys = await listS3Keys("private", prefix).catch(() => []);
  await Promise.all(
    keys.map(async (key) => {
      const expiresAt = Number(key.slice(prefix.length).split("/")[0]);
      if (Number.isFinite(expiresAt) && expiresAt <= nowMs) {
        await deleteS3Object("private", key).catch(() => undefined);
      }
    }),
  );
}
```

- [ ] **Step 5: Run test to verify GREEN**

Run: `bun test src/lib/uploads/temp-image-storage.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/s3-client.ts src/lib/uploads/temp-image-storage.ts src/lib/uploads/temp-image-storage.test.ts
git commit -m "feat: add temp image storage primitive"
```

---

### Task 3: Temp image API routes

**Files:**
- Create: `src/routes/api.uploads.temp-images.ts`
- Create: `src/routes/api.uploads.temp-images.$assetId.ts`
- Create or modify: route tests near existing API route tests

**Interfaces:**
- Consumes: `uploadTempImage`, `readTempImage`, `deleteTempImage`
- Produces: `POST /api/uploads/temp-images`
- Produces: `GET /api/uploads/temp-images/$assetId`
- Produces: `DELETE /api/uploads/temp-images/$assetId`

- [ ] **Step 1: Write failing route test**

Use existing route test style from `src/routes/-api.support.assets.test.ts`. Add a test that authenticated POST with `image/png` returns `assetId` and `url`, and POST without a file returns `400` with `message`.

- [ ] **Step 2: Run test to verify RED**

Run: `bun test src/routes/-api.uploads.temp-images.test.ts`

Expected: FAIL because route does not exist.

- [ ] **Step 3: Implement POST route**

```ts
import { createFileRoute } from "@tanstack/react-router";

import { requireUser } from "@/lib/auth-server";
import { uploadTempImage } from "@/lib/uploads/temp-image-storage";

export const Route = createFileRoute("/api/uploads/temp-images")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const user = await requireUser(request);
        const form = await request.formData();
        const file = form.get("file");

        if (!(file instanceof File)) {
          return Response.json({ message: "Pilih gambar dulu." }, { status: 400 });
        }

        try {
          return Response.json(await uploadTempImage(user.id, file));
        } catch (error) {
          return Response.json(
            { message: error instanceof Error ? error.message : "Gagal mengunggah gambar." },
            { status: 400 },
          );
        }
      },
    },
  },
});
```

- [ ] **Step 4: Implement GET/DELETE route**

```ts
import { createFileRoute } from "@tanstack/react-router";

import { requireUser } from "@/lib/auth-server";
import {
  deleteTempImage,
  readTempImage,
} from "@/lib/uploads/temp-image-storage";

export const Route = createFileRoute("/api/uploads/temp-images/$assetId")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const user = await requireUser(request);
        try {
          const image = await readTempImage(user.id, params.assetId);
          return new Response(new Uint8Array(image.body), {
            headers: { "Content-Type": image.contentType },
          });
        } catch {
          return new Response("Not found", { status: 404 });
        }
      },
      DELETE: async ({ params, request }) => {
        const user = await requireUser(request);
        await deleteTempImage(user.id, params.assetId);
        return new Response(null, { status: 204 });
      },
    },
  },
});
```

- [ ] **Step 5: Run test to verify GREEN**

Run: `bun test src/routes/-api.uploads.temp-images.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/routes/api.uploads.temp-images.ts src/routes/api.uploads.temp-images.\$assetId.ts src/routes/-api.uploads.temp-images.test.ts
git commit -m "feat: add temp image upload API"
```

---

### Task 4: Shared browser upload helper and composer state

**Files:**
- Create: `src/lib/uploads/temp-image-client.ts`
- Modify: `src/lib/projects/composer-attachments.ts`
- Modify: `src/components/projects/ComposerAttachments.tsx`
- Modify: `src/lib/projects/chat-file-parts.test.ts` if attachment type changes affect tests

**Interfaces:**
- Produces: `uploadTempImageFile(file: File): Promise<{ assetId: string; url: string }>`
- Produces: `deleteTempImageAsset(assetId: string): Promise<void>`
- Produces attachment fields: `status: "uploading" | "uploaded"`, `assetId?: string`

- [ ] **Step 1: Write failing attachment test**

Add to existing composer attachment tests or create a focused test:

```ts
import { describe, expect, it, vi } from "vitest";

import { addAttachments, hasUploadingAttachments } from "./composer-attachments";

describe("composer attachments upload state", () => {
  it("marks newly added attachments as uploading", () => {
    const file = new File(["x"], "a.png", { type: "image/png" });
    const result = addAttachments([], [file]);

    expect(result.next[0]).toMatchObject({ status: "uploading" });
    expect(hasUploadingAttachments(result.next)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify RED**

Run: `bun test src/lib/projects/composer-attachments.test.ts`

Expected: FAIL because `status`/`hasUploadingAttachments` do not exist.

- [ ] **Step 3: Implement client helper**

```ts
export async function uploadTempImageFile(file: File) {
  const form = new FormData();
  form.append("file", file);

  const response = await fetch("/api/uploads/temp-images", {
    body: form,
    method: "POST",
  });
  const json = (await response.json().catch(() => null)) as {
    assetId?: string;
    message?: string;
    url?: string;
  } | null;

  if (!response.ok || !json?.assetId || !json.url) {
    throw new Error(json?.message || "Gagal mengunggah gambar.");
  }

  return { assetId: json.assetId, url: json.url };
}

export async function deleteTempImageAsset(assetId: string): Promise<void> {
  await fetch(`/api/uploads/temp-images/${encodeURIComponent(assetId)}`, {
    method: "DELETE",
  }).catch(() => undefined);
}
```

- [ ] **Step 4: Extend attachment state minimally**

```ts
export type PendingAttachment = {
  assetId?: string;
  blobUrl: string;
  file: File;
  id: string;
  status: "uploading" | "uploaded";
};

export function hasUploadingAttachments(current: PendingAttachment[]): boolean {
  return current.some((item) => item.status === "uploading");
}
```

Ensure `addAttachments` sets `status: "uploading"`.

- [ ] **Step 5: Show upload state in component**

In `ComposerAttachments`, add Indonesian status text/badge for uploading items: `Mengunggah...`.

- [ ] **Step 6: Run test to verify GREEN**

Run: `bun test src/lib/projects/composer-attachments.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/uploads/temp-image-client.ts src/lib/projects/composer-attachments.ts src/components/projects/ComposerAttachments.tsx src/lib/projects/composer-attachments.test.ts
git commit -m "feat: add shared temp image client state"
```

---

### Task 5: Home project create uses pre-uploaded image IDs

**Files:**
- Modify: `src/components/projects/HomePromptForm.tsx`
- Modify: `src/routes/api.projects.ts`
- Modify: `src/routes/-api.projects.test.ts`
- Modify: `src/lib/projects/api-projects.test.ts` if duplicate route tests exist

**Interfaces:**
- Consumes: `uploadTempImageFile`, `deleteTempImageAsset`, `hasUploadingAttachments`
- Consumes: `claimTempImage`
- Produces: `/api/projects` accepts `assetIds` via JSON or form field without `files`

- [ ] **Step 1: Write failing API test**

Add a test to project API tests proving project create accepts `assetIds` and does not need `files`.

```ts
it("creates a project from pre-uploaded asset ids", async () => {
  const formData = new FormData();
  formData.append("prompt", "Buat website untuk toko roti rumahan.");
  formData.append("mode", "discuss");
  formData.append("idempotencyKey", "idem_preuploaded");
  formData.append("assetIds", "temp-token-1");

  const res = await callPost(formData);

  expect(res.status).toBe(200);
});
```

Mock `claimTempImage` to return `{ ref: "project-assets/project_1/photo.png", contentType: "image/png", sizeBytes: 3 }`.

- [ ] **Step 2: Run API test to verify RED**

Run: `bun test src/routes/-api.projects.test.ts`

Expected: FAIL because `assetIds` are ignored or claim helper is not wired.

- [ ] **Step 3: Update `/api/projects` parsing**

In `src/routes/api.projects.ts`, parse:

```ts
const tempAssetIds = formData.getAll("assetIds").filter((value): value is string => typeof value === "string");
```

After project exists, for each `tempAssetId`, call `claimTempImage(user.id, tempAssetId, finalProjectAssetKey)` and create `ProjectAsset` from returned metadata. Keep legacy `files` handling until all clients migrate.

- [ ] **Step 4: Update `HomePromptForm.tsx` upload flow**

On `ComposerAttachButton.onAdd`, set attachments immediately, then upload only newly added items:

```ts
void Promise.all(
  added.map(async (item) => {
    try {
      const uploaded = await uploadTempImageFile(item.file);
      setAttachments((current) =>
        current.map((candidate) =>
          candidate.id === item.id
            ? { ...candidate, assetId: uploaded.assetId, status: "uploaded" }
            : candidate,
        ),
      );
    } catch (error) {
      setAttachments((current) => removeAttachment(current, item.id));
      toast.error(error instanceof Error ? error.message : "Gagal mengunggah gambar.");
    }
  }),
);
```

Use actual returned additions from `addAttachments`; adjust helper if needed.

Submit appends:

```ts
for (const attachment of attachments) {
  if (attachment.assetId) form.append("assetIds", attachment.assetId);
}
```

Do not append `files`.

Disable submit when:

```ts
const isUploading = hasUploadingAttachments(attachments);
```

Button disabled condition includes `isUploading`. Copy shows `Mengunggah gambar...` while `isUploading`.

- [ ] **Step 5: Run focused tests**

Run: `bun test src/routes/-api.projects.test.ts src/lib/projects/composer-attachments.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/projects/HomePromptForm.tsx src/routes/api.projects.ts src/routes/-api.projects.test.ts src/lib/projects/api-projects.test.ts
git commit -m "feat(projects): pre-upload home prompt images"
```

---

### Task 6: Project workspace uploads use shared temp flow

**Files:**
- Modify: `src/components/projects/WorkspaceShell.tsx`
- Modify: `src/routes/api.projects.$id.assets.upload.ts`
- Modify or add focused tests for project asset upload route

**Interfaces:**
- Consumes: `uploadTempImageFile`, `claimTempImage`
- Produces: workspace send/upload disabled while image upload is pending

- [ ] **Step 1: Write failing route test**

Add a test proving `/api/projects/$id/assets/upload` accepts `assetId` and claims it without a blob file.

- [ ] **Step 2: Run test to verify RED**

Run the focused project asset upload route test.

Expected: FAIL because only `file` is accepted.

- [ ] **Step 3: Update route compatibility**

In `src/routes/api.projects.$id.assets.upload.ts`, support `assetId` form field or JSON body. If present, claim it into the same final project asset destination currently used for uploaded `file`.

- [ ] **Step 4: Update `WorkspaceShell.tsx`**

Change file selection to call `uploadTempImageFile` immediately. Keep existing preview UI. Store returned `assetId`. When sending/adding to chat, call project asset route with `assetId`, not `file`. Disable the send/submit button while any selected image is uploading and show `Mengunggah gambar...`.

- [ ] **Step 5: Run focused test**

Run route/component-adjacent focused tests available for workspace asset upload.

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/projects/WorkspaceShell.tsx src/routes/api.projects.\$id.assets.upload.ts
git commit -m "feat(projects): pre-upload workspace images"
```

---

### Task 7: Waitlist photos use shared temp flow

**Files:**
- Modify: `src/routes/_main.waitlist.tsx`
- Modify tests covering waitlist submit if present

**Interfaces:**
- Consumes: `uploadTempImageFile`, `deleteTempImageAsset`, `claimTempImage`
- Produces: waitlist submit accepts `assetIds` and disables while uploads run

- [ ] **Step 1: Write failing waitlist test**

Add or update a waitlist submit test so `assetIds` are accepted and no `File` objects are required in submit `FormData`.

- [ ] **Step 2: Run test to verify RED**

Run focused waitlist route/form test.

Expected: FAIL because schema currently requires `File` values at submit.

- [ ] **Step 3: Update waitlist client state**

Replace `photo: File[]` submit payload with an attachment array that includes local preview plus temp `assetId`. Keep validation: at least 1, max 3, all uploaded before submit.

- [ ] **Step 4: Update waitlist submit payload**

Submit text fields plus:

```ts
for (const attachment of photoAttachments) {
  fd.append("assetIds", attachment.assetId);
}
```

Disable submit while any photo is uploading. Show `Mengunggah gambar...`.

- [ ] **Step 5: Update waitlist server handling**

Read `assetIds`, claim each temp image into waitlist final refs, store refs in existing `WaitlistEntry.imageRef` JSON array format.

- [ ] **Step 6: Run focused waitlist tests**

Run focused waitlist tests.

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/routes/_main.waitlist.tsx
git commit -m "feat(waitlist): pre-upload waitlist photos"
```

---

### Task 8: Support uploads use shared temp flow

**Files:**
- Modify: `src/routes/_main.support.tsx`
- Modify: `src/routes/_main.support.$ticketId.tsx`
- Modify: `src/routes/_main.admin.tickets.$ticketId.tsx`
- Modify: `src/routes/api.support.assets.ts`
- Modify: `src/routes/api.support.tickets.ts`
- Modify: `src/routes/api.support.tickets.$ticketId.ts`
- Modify: `src/routes/api.admin.tickets.$ticketId.reply.ts`
- Modify: `src/routes/-api.support.assets.test.ts`
- Modify: `src/lib/support/service.test.ts`

**Interfaces:**
- Consumes: `uploadTempImageFile`, `claimTempImage`
- Produces: support create/reply/admin reply all use shared temp `assetIds`

- [ ] **Step 1: Write failing support claim test**

Update support route tests so ticket create and reply call `claimTempImage` for incoming `assetIds` and keep max count validation.

- [ ] **Step 2: Run test to verify RED**

Run: `bun test src/lib/support/service.test.ts src/routes/-api.support.assets.test.ts`

Expected: FAIL because shared claim is not wired.

- [ ] **Step 3: Update support clients**

Replace direct POST to `/api/support/assets` in all three support route components with `uploadTempImageFile`. Keep existing pre-upload UX, but normalize disabled/loading copy to `Mengunggah gambar...`.

- [ ] **Step 4: Update support server routes**

For create/reply/admin reply, claim incoming temp `assetIds` into final support asset refs before storing `SupportMessage.assetIds`. Keep `/api/support/assets` only as compatibility wrapper around shared temp upload or leave until no tests/callers use it.

- [ ] **Step 5: Run focused support tests**

Run: `bun test src/lib/support/service.test.ts src/routes/-api.support.assets.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/routes/_main.support.tsx src/routes/_main.support.\$ticketId.tsx src/routes/_main.admin.tickets.\$ticketId.tsx src/routes/api.support.assets.ts src/routes/api.support.tickets.ts src/routes/api.support.tickets.\$ticketId.ts src/routes/api.admin.tickets.\$ticketId.reply.ts src/routes/-api.support.assets.test.ts src/lib/support/service.test.ts
git commit -m "feat(support): use shared temp image uploads"
```

---

### Task 9: Final cleanup and verification

**Files:**
- Modify: route tree generated files if `bun run verify` updates them
- Modify: docs only if implementation deviates from this plan

**Interfaces:**
- Consumes: all prior tasks
- Produces: verified consistent image upload flow

- [ ] **Step 1: Search for remaining submit-time image uploads**

Run:

```bash
rg -n "append\(\"file|append\(\"files|/api/support/assets|assets/upload|instanceof\(File|type=\"file\"" src
```

Expected: only file inputs and compatibility route/tests remain; no product submit path appends image blobs.

- [ ] **Step 2: Run focused tests**

Run:

```bash
bun test src/lib/uploads/temp-image-token.test.ts src/lib/uploads/temp-image-storage.test.ts src/routes/-api.uploads.temp-images.test.ts src/routes/-api.projects.test.ts src/lib/support/service.test.ts src/routes/-api.support.assets.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run manual gate**

Run:

```bash
bun run check
```

Expected: PASS.

- [ ] **Step 4: Commit final cleanup**

```bash
git add .
git commit -m "chore: verify shared temp image uploads"
```

Only commit if this task made additional cleanup changes.
