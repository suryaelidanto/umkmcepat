# Upload Consistency + Project-Create Moderation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify the three upload surfaces (home create-project, workspace composer, support ticket thread) around one contract: client multipart upload → server magic-byte validation → S3 storage → moderation at the gate. Fix the support-ticket S3 key bug. Add text+image moderation to project-create. Add image-only moderation to workspace upload. Eliminate the short-prompt CLARIFY cache abuse.

**Architecture:** Multipart-from-the-start on `POST /api/projects` — files ride in the same request as the prompt, get validated by magic bytes, moderated together with the prompt via a shared `moderateProjectRequest(prompt, images)` helper, and persisted as `ProjectAsset` rows in the same handler. The existing `POST /api/projects/:id/assets/upload` endpoint gets image-only moderation added before storage. The support flow gets its S3-key bug fixed by making `assetId` itself include the detected extension (no schema change). A new `src/lib/images/format.ts` centralizes magic-byte detection (PNG/JPEG/WEBP/GIF) so both upload endpoints share one source of truth. The combo model is used for moderation today (vision coverage is whatever the combo resolves to; deferred per the user). Retry-once-on-throw with structured logging replaces the bare `catch {}` swallow at the moderation call sites.

**Tech Stack:** TanStack Router (file-based server handlers), AI SDK v7 `generateText` (multimodal content arrays), Prisma + Postgres, S3 (RustFS local / R2 cloud) via `src/lib/s3-client.ts`, sonner for toasts, vitest for unit tests.

## Global Constraints

- User-facing product UI copy is Indonesian; developer docs/code/logs/errors English. No new user-facing strings in this plan; existing Indonesian strings stay verbatim.
- Surgical edits only. Don't refactor adjacent code, don't rename exports, don't reformat unrelated files.
- Atomic commits: one logical unit per commit. Eight commits total, listed in dependency order in the plan.
- `bun run check` (format/lint/typecheck/`test:changed`/Knip) must pass at the end of every task. Run it once per task, not once at the end.
- No new top-level dependencies. AI SDK v7 already supports multimodal content arrays.
- User-facing image limits: 5 MiB per file, 6 files max, PNG/JPEG/WEBP (project + workspace) or PNG/JPEG/WEBP/GIF (support). The 6-image cap is enforced client-side via `MAX_COMPOSER_IMAGES` and server-side by parsing `form.getAll("files")` and truncating to 6.
- Pre-commit runs `bun run check:commit` (Prettier + ESLint on staged files). Do not bypass.
- All `catch (error) { ... }` blocks on moderation call sites must log with `console.error` and structured fields, never bare `catch {}`.
- Never write secrets into tracked files. Use empty `""` values in `.env.example`.
- Don't touch pre-existing dirty files (`Header.tsx`, `MainChrome.tsx`, `waitlist.ts`, `_main.waitlist.tsx`, `api.waitlist.ts`, `verify.tsx`, `bun.lock`, `package.json`, `_main.support.tsx`) — they are from other agents.

---

## File Structure (locked in by this plan)

| File | Role | Action |
|---|---|---|
| `src/lib/images/format.ts` | Shared magic-byte detection (PNG/JPEG/WEBP/GIF) + content-type helpers | Create |
| `src/lib/images/format.test.ts` | Unit tests for `detectImageFormat` | Create |
| `src/lib/projects/input.ts` | `validateProjectRequest` + new `PROJECT_REQUEST_MIN_LENGTH = 8` | Modify (extend) |
| `src/lib/ai-moderation.ts` | `moderateProjectRequest(prompt, images?)` with retry-once + structured logging | Modify (extend) |
| `src/lib/projects/project-assets.ts` | Re-export `detectImageFormat` from `src/lib/images/format.ts` (delete the local copy) | Modify (refactor) |
| `src/routes/api.projects.$id.assets.upload.ts` | Add image-only moderation step before `uploadProjectAsset` | Modify (extend) |
| `src/routes/api.support.assets.ts` | Use magic-byte detection, assetId includes extension, structured logging | Modify (rewrite) |
| `src/routes/api.support.assets.$assetId.ts` | Use the full assetId-with-extension as the S3 key | Modify (one line) |
| `src/routes/api.projects.ts` | Refactor POST to multipart with file validation + image moderation + asset persistence | Modify (rewrite POST) |
| `src/routes/api.moderation.project-request.ts` | Replace bare `catch {}` with structured logging | Modify (one block) |
| `src/routes/api.projects.moderate.ts` | Replace bare `catch {}` with structured logging | Modify (one block) |
| `src/components/projects/HomePromptForm.tsx` | Switch to multipart POST, delete client-side upload loop, clear attachments on every non-2xx | Modify (refactor) |
| `src/components/projects/WorkspaceShell.tsx` | Delete the `sessionStorage` read block in the auto-send effect | Modify (delete block) |

No new dependencies. No new env vars. No DB migrations.

---

## Task 1: Shared image-format detection module

**Files:**
- Create: `src/lib/images/format.ts`
- Create: `src/lib/images/format.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `ImageFormat = "png" | "jpeg" | "webp" | "gif"`
  - `detectImageFormat(bytes: Buffer): ImageFormat | null`
  - `contentTypeFromExt(ext: string): string` — returns `image/jpeg` for `jpg`/`jpeg`, `image/png` for `png`, `image/webp` for `webp`, `image/gif` for `gif`, else `application/octet-stream`.
  - `EXT_CONTENT_TYPE: Record<ImageFormat, string>` — strict map, used as the source of truth for S3 `contentType` writes.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/images/format.test.ts
import { describe, expect, it } from "vitest";

import {
  contentTypeFromExt,
  detectImageFormat,
  EXT_CONTENT_TYPE,
} from "@/lib/images/format";

function bytesOf(...values: number[]): Buffer {
  return Buffer.from(values);
}

describe("detectImageFormat", () => {
  it("detects PNG by 8-byte signature", () => {
    const png = bytesOf(
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    );
    expect(detectImageFormat(png)).toBe("png");
  });

  it("detects JPEG by 3-byte signature", () => {
    const jpeg = bytesOf(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10);
    expect(detectImageFormat(jpeg)).toBe("jpeg");
  });

  it("detects WEBP by RIFF/WEBP markers", () => {
    const webp = bytesOf(
      0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
    );
    expect(detectImageFormat(webp)).toBe("webp");
  });

  it("detects GIF87a", () => {
    const gif = bytesOf(0x47, 0x49, 0x46, 0x38, 0x37, 0x61, 0x00, 0x00);
    expect(detectImageFormat(gif)).toBe("gif");
  });

  it("detects GIF89a", () => {
    const gif = bytesOf(0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x00, 0x00);
    expect(detectImageFormat(gif)).toBe("gif");
  });

  it("returns null for a buffer shorter than 12 bytes", () => {
    expect(detectImageFormat(bytesOf(0x89, 0x50))).toBeNull();
  });

  it("returns null for a random buffer that is not a known image format", () => {
    const txt = bytesOf(0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x20, 0x57, 0x6f, 0x72, 0x6c, 0x64, 0x21);
    expect(detectImageFormat(txt)).toBeNull();
  });
});

describe("contentTypeFromExt", () => {
  it("maps jpg/jpeg to image/jpeg", () => {
    expect(contentTypeFromExt("jpg")).toBe("image/jpeg");
    expect(contentTypeFromExt("jpeg")).toBe("image/jpeg");
  });

  it("maps png, webp, gif to their content types", () => {
    expect(contentTypeFromExt("png")).toBe("image/png");
    expect(contentTypeFromExt("webp")).toBe("image/webp");
    expect(contentTypeFromExt("gif")).toBe("image/gif");
  });

  it("falls back to application/octet-stream for unknown extensions", () => {
    expect(contentTypeFromExt("bin")).toBe("application/octet-stream");
    expect(contentTypeFromExt("")).toBe("application/octet-stream");
  });
});

describe("EXT_CONTENT_TYPE", () => {
  it("has entries for all four formats", () => {
    expect(EXT_CONTENT_TYPE.png).toBe("image/png");
    expect(EXT_CONTENT_TYPE.jpeg).toBe("image/jpeg");
    expect(EXT_CONTENT_TYPE.webp).toBe("image/webp");
    expect(EXT_CONTENT_TYPE.gif).toBe("image/gif");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/lib/images/format.test.ts`
Expected: FAIL with "Cannot find module '@/lib/images/format'".

- [ ] **Step 3: Implement the module**

```ts
// src/lib/images/format.ts
export type ImageFormat = "png" | "jpeg" | "webp" | "gif";

export const EXT_CONTENT_TYPE: Record<ImageFormat, string> = {
  gif: "image/gif",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

const EXT_TO_CONTENT_TYPE: Record<string, string> = {
  gif: "image/gif",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export function contentTypeFromExt(ext: string): string {
  return EXT_TO_CONTENT_TYPE[ext.toLowerCase()] ?? "application/octet-stream";
}

export function detectImageFormat(bytes: Buffer): ImageFormat | null {
  if (bytes.length < 12) {
    return null;
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "png";
  }
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpeg";
  }
  // WEBP: "RIFF" .... "WEBP"
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "webp";
  }
  // GIF: "GIF87a" or "GIF89a"
  if (
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return "gif";
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/lib/images/format.test.ts`
Expected: all assertions PASS.

- [ ] **Step 5: Run `bun run check`**

Run: `bun run check`
Expected: PASS (5/5 green).

- [ ] **Step 6: Commit**

```bash
git add src/lib/images/format.ts src/lib/images/format.test.ts
git commit -m "feat(images): shared magic-byte detection (PNG/JPEG/WEBP/GIF)

Centralize image format detection in src/lib/images/format.ts so
project-asset and support-asset upload endpoints share one source
of truth. Exports detectImageFormat, contentTypeFromExt, and
EXT_CONTENT_TYPE."
```

---

## Task 2: Re-export format detection from project-assets.ts

**Files:**
- Modify: `src/lib/projects/project-assets.ts` (lines 40-50, 250-285)

**Interfaces:**
- Consumes: `detectImageFormat` from `src/lib/images/format.ts`.
- Produces: same `detectImageFormat` re-exported from the existing path so call sites don't break.

- [ ] **Step 1: Read the current `detectImageFormat` block**

Read `src/lib/projects/project-assets.ts` lines 40-50 and 250-285. Confirm the local function signature matches the new module's signature.

- [ ] **Step 2: Replace the local definition with a re-export**

In `src/lib/projects/project-assets.ts`, delete the local `FORMAT_CONTENT_TYPES` constant (lines 44-48) and replace it with:

```ts
import { EXT_CONTENT_TYPE as FORMAT_CONTENT_TYPES } from "@/lib/images/format";
```

This keeps the local binding name `FORMAT_CONTENT_TYPES` so all existing call sites continue to work without edits.

Delete the local `detectImageFormat` function (lines 250-285). Replace it with:

```ts
export { detectImageFormat } from "@/lib/images/format";
```

- [ ] **Step 3: Run `bun run check`**

Run: `bun run check`
Expected: PASS. `test:changed` runs the project-assets test (if it exists in the codebase — skip this step if no test file targets it).

- [ ] **Step 4: Commit**

```bash
git add src/lib/projects/project-assets.ts
git commit -m "refactor(assets): re-export detectImageFormat from shared module

Move magic-byte detection to src/lib/images/format.ts (Task 1) and
re-export from the project-assets path so no call site needs to
change. Same FORMAT_CONTENT_TYPES binding name preserved."
```

---

## Task 3: 8-char minimum prompt length

**Files:**
- Modify: `src/lib/projects/input.ts` (lines 1-23)

**Interfaces:**
- Consumes: nothing.
- Produces: `PROJECT_REQUEST_MIN_LENGTH = 8` constant + extended `validateProjectRequest` that rejects prompts shorter than 8 characters with Indonesian message.

- [ ] **Step 1: Read the current `validateProjectRequest`**

Read `src/lib/projects/input.ts` in full. Confirm the function signature and existing return shape.

- [ ] **Step 2: Update the file**

Replace the entire file with:

```ts
export const PROJECT_REQUEST_MAX_LENGTH = 1200;
export const PROJECT_REQUEST_MIN_LENGTH = 8;

export type ProjectRequestValidation =
  { ok: true; value: string } | { ok: false; message: string };

export function validateProjectRequest(
  input: string,
): ProjectRequestValidation {
  const value = input.trim().replace(/\s+/g, " ");

  if (!value) {
    return { ok: false, message: "Tulis kebutuhan usahamu dulu." };
  }

  if (value.length < PROJECT_REQUEST_MIN_LENGTH) {
    return {
      ok: false,
      message: "Tulis kebutuhan usahamu lebih lengkap, minimal 8 karakter.",
    };
  }

  if (value.length > PROJECT_REQUEST_MAX_LENGTH) {
    return {
      ok: false,
      message: "Maksimal 1.200 karakter. Ringkas sedikit, ya.",
    };
  }

  return { ok: true, value };
}
```

- [ ] **Step 3: Run `bun run check`**

Run: `bun run check`
Expected: PASS. If any test targets `validateProjectRequest` with a sub-8-char prompt, the test now fails — review the test and update it to use a 8+ char prompt or accept the new message. Don't blanket-fix tests; only fix ones that target this specific function.

- [ ] **Step 4: Commit**

```bash
git add src/lib/projects/input.ts
git commit -m "feat(input): require minimum 8 characters on project prompt

Stops the moderation CLARIFY cache abuse where short prompts like
'aaaa' cache a CLARIFY response for 30 minutes, blocking the user
from any follow-up. Same validator is used by all three moderation
endpoints (api.projects, api.moderation.project-request,
api.projects.moderate) so the check is consistent everywhere."
```

---

## Task 4: Extend moderateProjectRequest to accept images + retry-once

**Files:**
- Modify: `src/lib/ai-moderation.ts` (lines 32-98)

**Interfaces:**
- Consumes: existing `prompt: string` arg, optional `images: ModerationImage[]`.
- Produces: same `ModerationResult`, but when `images.length > 0` the AI SDK message is built as a multimodal content array (text + file parts). On any thrown error from `generateText`, retry once with a 1s sleep, then re-throw.

- [ ] **Step 1: Read the current file**

Read `src/lib/ai-moderation.ts` in full to confirm the existing structure.

- [ ] **Step 2: Add the image type and update the signature**

In `src/lib/ai-moderation.ts`, add this type near the top of the file (after the existing `ModerationResult` type):

```ts
export type ModerationImage = { bytes: Buffer; mediaType: string };
```

Change the `moderateProjectRequest` signature from:

```ts
export async function moderateProjectRequest(
  prompt: string,
  timeoutMs = getModerationTimeoutMs(),
): Promise<ModerationResult> {
```

to:

```ts
export async function moderateProjectRequest(
  prompt: string,
  images: ModerationImage[] = [],
  timeoutMs = getModerationTimeoutMs(),
): Promise<ModerationResult> {
```

- [ ] **Step 3: Replace the `generateText` call with a multimodal content array when images are present**

Replace the existing `generateText` block (lines 52-69) with:

```ts
const contentParts: Array<
  | { type: "text"; text: string }
  | { type: "file"; data: Buffer; mediaType: string }
> = [];
if (prompt.trim()) {
  contentParts.push({ type: "text", text: prompt.trim() });
}
for (const image of images) {
  contentParts.push({
    type: "file",
    data: image.bytes,
    mediaType: image.mediaType,
  });
}

const abortController = new AbortController();
const result = await callWithRetry(() =>
  withAiTimeout(
    generateText({
      abortSignal: abortController.signal,
      maxOutputTokens: 256,
      model: getAiModel(getDefaultAiModel()),
      temperature: 0,
      timeout: timeoutMs,
      telemetry: getAiTelemetry("project-moderation", {
        model: getDefaultAiModel(),
      }),
      system:
        "You are a fast safety/profanity checker for UMKM Cepat, an AI website and app builder. Reply with exactly ALLOW, BLOCK, or CLARIFY. BLOCK gambling, pornography, sexual services, fraud, phishing, illegal goods, weapons, violence, extremism, self-harm instructions, malware, abusive impersonation of real brands/people/government, and explicit hateful/sexual profanity. CLARIFY only when intent is unclear but potentially unsafe. ALLOW normal small-business websites, landing pages, catalogs, menus, booking intent, contact forms, ordering flows, and calls to action.",
      messages: [{ role: "user", content: contentParts }],
    }),
    "moderation",
    abortController,
    timeoutMs,
  ),
);
```

Note: the original code uses `prompt: key` (a top-level field). Replace it with `messages: [{ role: "user", content: contentParts }]` so multimodal content is supported. The `key` variable is still used for caching, so leave its computation above.

- [ ] **Step 4: Add the retry helper**

Add this private helper at the bottom of the file (before the `normalizePrompt` and `hashPrompt` helpers):

```ts
async function callWithRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (firstError) {
    console.error("[moderation] attempt-1 failed, retrying in 1s", {
      error: firstError instanceof Error ? firstError.message : firstError,
    });
    await new Promise((resolve) => setTimeout(resolve, 1000));
    try {
      return await fn();
    } catch (secondError) {
      console.error("[moderation] attempt-2 failed, giving up", {
        error: secondError instanceof Error ? secondError.message : secondError,
      });
      throw secondError;
    }
  }
}
```

- [ ] **Step 5: Run `bun run check`**

Run: `bun run check`
Expected: PASS. The existing `ai-moderation.test.ts` (if any) should still pass; if it mocks `generateText` with a top-level `prompt` field, the test may need updating to use `messages`. Read the test first and update only the test that breaks for the right reason.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ai-moderation.ts
git commit -m "feat(moderation): accept images, retry once on failure, log errors

moderateProjectRequest(prompt, images) now passes a multimodal
content array to generateText so image bytes ride alongside the
text prompt. On any thrown error from generateText, retry once
with a 1s sleep before re-throwing, so transient 9Router blips
don't surface to the user. Structured console.error on each
failure replaces the previous silent swallow."
```

---

## Task 5: Replace bare `catch {}` with structured logging at the three moderation call sites

**Files:**
- Modify: `src/routes/api.moderation.project-request.ts` (line 69)
- Modify: `src/routes/api.projects.moderate.ts` (line 76)

**Interfaces:**
- Consumes: nothing new.
- Produces: same response shapes, but the catch blocks log the actual error so future debugging is possible.

- [ ] **Step 1: Update `api.moderation.project-request.ts`**

In `src/routes/api.moderation.project-request.ts`, change the bare `catch {` (line 69) to:

```ts
} catch (error) {
  console.error("[moderation] api.moderation.project-request failed", {
    error: error instanceof Error ? error.message : error,
  });
  return Response.json(
    {
      allowed: false,
      code: "moderation_unavailable",
      message:
        "Checker keamanan lagi lambat. Coba kirim lagi sebentar ya.",
    },
    { status: 503, headers: { "Retry-After": "3" } },
  );
}
```

- [ ] **Step 2: Update `api.projects.moderate.ts`**

In `src/routes/api.projects.moderate.ts`, change the bare `catch {` (line 76) to:

```ts
} catch (error) {
  console.error("[moderation] api.projects.moderate failed", {
    error: error instanceof Error ? error.message : error,
  });
  return Response.json(
    {
      allowed: false,
      code: "moderation_unavailable",
      message:
        "Checker keamanan lagi lambat. Coba kirim lagi sebentar ya.",
    },
    { status: 503, headers: { "Retry-After": "3" } },
  );
}
```

- [ ] **Step 3: Update `api.projects.ts` POST catch**

In `src/routes/api.projects.ts`, change the `} catch (error) {` (line 195) to log as well — preserve the existing `console.error` call (already there) and add the structured field. The current code is:

```ts
} catch (error) {
  console.error(
    "[moderation] failed:",
    error instanceof Error ? error.message : error,
  );
```

Leave this as-is (it already has structured logging). Do not change.

- [ ] **Step 4: Run `bun run check`**

Run: `bun run check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/api.moderation.project-request.ts src/routes/api.projects.moderate.ts
git commit -m "fix(moderation): log actual error instead of silent swallow

Replace bare catch {} in two moderation endpoints with structured
console.error so future 'Checker keamanan lagi lambat' incidents
show up in the dev log with the underlying error message. Response
shapes and status codes are unchanged."
```

---

## Task 6: Workspace upload gets image-only moderation

**Files:**
- Modify: `src/routes/api.projects.$id.assets.upload.ts` (lines 67-82)

**Interfaces:**
- Consumes: existing handler flow + `moderateProjectRequest` from Task 4.
- Produces: same response shapes, with a new moderation step inserted between file validation and `uploadProjectAsset`. On moderation BLOCK/CLARIFY, returns 400 with the moderation message and never reaches storage.

- [ ] **Step 1: Read the current handler**

Read `src/routes/api.projects.$id.assets.upload.ts` lines 60-83 to see the current `uploadProjectAsset` call site.

- [ ] **Step 2: Add the moderation import**

Add to the top of the file (with the other imports):

```ts
import { moderateProjectRequest } from "@/lib/ai-moderation";
import { contentTypeFromExt, detectImageFormat } from "@/lib/images/format";
```

- [ ] **Step 3: Insert the moderation step**

Replace the block:

```ts
const bytes = Buffer.from(await file.arrayBuffer());
try {
  const asset = await uploadProjectAsset({
    bytes,
    projectId: id,
    purpose,
    userId: session.user.id,
  });
  return Response.json(asset, { status: 201 });
} catch (error) {
  const message = mapToUserFacingError(
    error instanceof Error ? error.message : "",
  );
  return Response.json({ message }, { status: 400 });
}
```

with:

```ts
const bytes = Buffer.from(await file.arrayBuffer());
const detectedFormat = detectImageFormat(bytes);
if (!detectedFormat) {
  return Response.json(
    {
      message:
        "Format gambar tidak didukung. Gunakan PNG, JPEG, atau WEBP.",
    },
    { status: 400 },
  );
}
const contentType = contentTypeFromExt(detectedFormat);

try {
  const moderation = await moderateProjectRequest("", [
    { bytes, mediaType: contentType },
  ]);
  if (!moderation.allowed) {
    return Response.json(
      {
        message:
          "message" in moderation
            ? moderation.message
            : "Gambar tidak memenuhi syarat.",
      },
      { status: 400 },
    );
  }
  const asset = await uploadProjectAsset({
    bytes,
    projectId: id,
    purpose,
    userId: session.user.id,
  });
  return Response.json(asset, { status: 201 });
} catch (error) {
  console.error("[moderation] assets.upload failed", {
    error: error instanceof Error ? error.message : error,
  });
  const message = mapToUserFacingError(
    error instanceof Error ? error.message : "",
  );
  return Response.json({ message }, { status: 503 });
}
```

The `detectImageFormat` here is technically redundant with the magic-byte check inside `uploadProjectAsset` / `writeProjectAsset`, but doing it once at the boundary gives us a clean 400 message with the correct content type, and avoids a wasted S3 write when the format is wrong.

- [ ] **Step 4: Run `bun run check`**

Run: `bun run check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/api.projects.$id.assets.upload.ts
git commit -m "feat(assets): moderate image uploads on the workspace endpoint

Before persisting a project asset, run the image through
moderateProjectRequest with an empty prompt. On BLOCK or CLARIFY,
return 400 and never reach storage. Magic-byte detection runs at
the boundary so a non-image file is rejected with a clear
Indonesian message before any 9Router call is made.

The combo model is used as today; if it resolves to a text-only
model, the image content is silently ignored (documented gap)."
```

---

## Task 7: Support ticket upload — fix S3 key bug + use magic-byte detection

**Files:**
- Modify: `src/routes/api.support.assets.ts` (rewrite the POST handler body)
- Modify: `src/routes/api.support.assets.$assetId.ts` (line 41)

**Interfaces:**
- Consumes: `detectImageFormat`, `contentTypeFromExt` from `src/lib/images/format.ts`.
- Produces: same response shape `{ assetId, ref, url, contentType }` with `assetId = "<uuid>.<ext>"` (e.g. `abc123.png`). The GET route uses the assetId verbatim as the S3 key suffix.

- [ ] **Step 1: Read both files**

Read `src/routes/api.support.assets.ts` and `src/routes/api.support.assets.$assetId.ts` in full to see the current key construction.

- [ ] **Step 2: Rewrite the POST handler**

Replace the entire `src/routes/api.support.assets.ts` file with:

```ts
import { randomUUID } from "node:crypto";

import { createFileRoute } from "@tanstack/react-router";

import { auth } from "@/lib/auth";
import {
  contentTypeFromExt,
  detectImageFormat,
} from "@/lib/images/format";
import { putStoredObject } from "@/lib/object-storage";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export const Route = createFileRoute("/api/support/assets")({
  server: {
    handlers: {
      // POST /api/support/assets: Upload support ticket attachments (both user and admin).
      // Multipart form field: `file`. assetId is the full S3 key suffix
      // including the detected extension so GET can reconstruct the key.
      POST: async ({ request }) => {
        const session = await auth();
        if (!session?.user?.id) {
          return Response.json(
            { message: "Masuk dulu untuk melanjutkan." },
            { status: 401 },
          );
        }

        const form = await request.formData().catch(() => null);
        if (!form) {
          return Response.json(
            { message: "Permintaan upload tidak valid." },
            { status: 400 },
          );
        }

        const file = form.get("file");
        if (!(file instanceof File)) {
          return Response.json(
            { message: "File belum dipilih." },
            { status: 400 },
          );
        }

        if (file.size > MAX_UPLOAD_BYTES) {
          return Response.json(
            { message: `Ukuran file melebihi 5 MB.` },
            { status: 413 },
          );
        }

        const bytes = Buffer.from(await file.arrayBuffer());
        const format = detectImageFormat(bytes);
        if (!format) {
          return Response.json(
            {
              message:
                "Format file tidak didukung. Gunakan PNG, JPEG, WEBP, atau GIF.",
            },
            { status: 400 },
          );
        }

        const assetId = `${randomUUID()}.${format}`;
        const key = `support/assets/${assetId}`;
        const contentType = contentTypeFromExt(format);

        try {
          const ref = await putStoredObject({
            body: bytes,
            contentType,
            key,
          });

          return Response.json(
            {
              assetId,
              contentType,
              ref,
              url: `/api/support/assets/${assetId}`,
            },
            { status: 201 },
          );
        } catch (error) {
          console.error("[support-upload] S3 write error", {
            assetId,
            error: error instanceof Error ? error.message : error,
          });
          return Response.json(
            { message: "Gagal menyimpan file ke storage." },
            { status: 500 },
          );
        }
      },
    },
  },
});
```

- [ ] **Step 3: Update the GET handler key construction**

In `src/routes/api.support.assets.$assetId.ts`, change line 41 from:

```ts
const key = `support/assets/${assetId}`;
```

(it's already this — but `assetId` from the URL is now the full `uuid.ext` string thanks to Task 7 Step 2, so the key matches what the upload wrote). No change needed to the GET handler. Confirm by reading line 41.

If the GET handler is reading `support/assets/${assetId}` (without extension) and the new assetId is `support/assets/uuid.png`, then `support/assets/${assetId}` evaluates to `support/assets/uuid.png` — the correct key. So no change. The bug is fixed by the upload-side change.

- [ ] **Step 4: Run `bun run check`**

Run: `bun run check`
Expected: PASS.

- [ ] **Step 5: Smoke test the GET route**

With dev server running, run:

```bash
curl -sS -i -X POST -F "file=@/some/test.png" -F "purpose=business-image" \
  -b "session.txt" http://localhost:3000/api/support/assets
```

Expected: `201 application/json` with body containing `assetId` ending in `.png`. Then `curl -i` against the returned `url` to confirm the image streams back.

(If you don't have a session, just verify that `POST` returns `401 application/json` with `"Masuk dulu untuk melanjutkan."` — the auth gate fires before the new code, confirming the route is reachable.)

- [ ] **Step 6: Commit**

```bash
git add src/routes/api.support.assets.ts
git commit -m "fix(support): align S3 key with the detected extension

assetId is now '<uuid>.<ext>' so the GET route can reconstruct
the exact S3 key the upload wrote. The previous code wrote
'.../<uuid>.<ext>' and read '.../<uuid>' (no extension) which
caused every uploaded image to 404.

Also switches to magic-byte detection (was trusting the
client-supplied MIME) and uses the detected contentType for the
S3 object metadata."
```

---

## Task 8: Home create-project becomes multipart + persists files in one handler

**Files:**
- Modify: `src/routes/api.projects.ts` (rewrite the POST handler)

**Interfaces:**
- Consumes: `moderateProjectRequest` from Task 4, `uploadProjectAsset` from `src/lib/projects/project-asset-upload.ts`.
- Produces: response `{ id, path, assetIds, projectCount, projectLimit }` with `assetIds: string[]` (empty array if no files uploaded).

- [ ] **Step 1: Read the current POST handler**

Read `src/routes/api.projects.ts` lines 103-274 in full to see the existing structure.

- [ ] **Step 2: Update imports at the top of the file**

Replace the top of `src/routes/api.projects.ts` (lines 1-31) with the same imports plus three new ones:

```ts
import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";
import { createFileRoute } from "@tanstack/react-router";

import { getDefaultAiModel } from "@/lib/ai-models";
import { moderateProjectRequest, type ModerationImage } from "@/lib/ai-moderation";
import { apiError } from "@/lib/api-errors";
import { auth } from "@/lib/auth";
import { isBoundedJsonError, readBoundedJson } from "@/lib/bounded-json";
import {
  contentTypeFromExt,
  detectImageFormat,
} from "@/lib/images/format";
import { prisma } from "@/lib/prisma";
import { createInitialBrief } from "@/lib/projects/brief";
import { createFallbackWorkspaceCard } from "@/lib/projects/brief-flow";
import { validateProjectRequest } from "@/lib/projects/input";
import {
  uploadProjectAsset,
} from "@/lib/projects/project-asset-upload";
import {
  decodeProjectCursor,
  encodeProjectCursor,
  PROJECT_PAGE_SIZE,
} from "@/lib/projects/pagination";
import { getProjectTitle, type WorkspaceMode } from "@/lib/projects/workspace";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  assertUnderProjectLimit,
  chargeEnergyForAiUsage,
  checkEnergy,
  getProjectCount,
  getProjectLimit,
  isAtOrOverProjectLimit,
  MIN_ENERGY_MODERATION,
  ProjectLimitExceededError,
} from "@/lib/user-credits";
```

(Add `moderateProjectRequest`, `type ModerationImage`, `contentTypeFromExt`, `detectImageFormat`, `uploadProjectAsset` imports. Keep everything else as-is.)

- [ ] **Step 3: Replace the POST handler**

Replace the POST handler (lines 103-274) with:

```ts
POST: async ({ request }) => {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json(
      { message: "Masuk dulu untuk melanjutkan." },
      { status: 401 },
    );
  }

  const userId = session.user.id;
  const rateLimitResponse = await checkRateLimit(request, "ai", userId).catch(
    () =>
      apiError({
        code: "rate_limit_unavailable",
        message: "Sistem pembatasan request belum siap. Coba lagi sebentar.",
        status: 503,
      }),
  );
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const energy = await checkEnergy(userId, MIN_ENERGY_MODERATION);
  if (!energy.allowed) {
    return Response.json(
      {
        code: "energy_exhausted",
        message: "Energi harian habis. Coba lagi besok.",
        remaining: energy.remaining,
      },
      { status: 429 },
    );
  }

  const form = await request.formData().catch(() => null);
  if (!form) {
    return Response.json(
      { message: "Permintaan tidak valid." },
      { status: 400 },
    );
  }

  const prompt = String(form.get("prompt") ?? "").trim();
  const mode = form.get("mode") === "build" ? "build" : "discuss";
  const idempotencyKey = getIdempotencyKeyFromForm(form);
  const validation = validateProjectRequest(prompt);

  if (!validation.ok) {
    return Response.json({ message: validation.message }, { status: 400 });
  }

  const rawFiles = form.getAll("files").filter((f): f is File => f instanceof File);
  if (rawFiles.length > 6) {
    return Response.json(
      { message: "Maksimal 6 gambar." },
      { status: 400 },
    );
  }

  const imageParts: ModerationImage[] = [];
  const validatedFiles: { bytes: Buffer; contentType: string }[] = [];
  for (const file of rawFiles) {
    if (file.size > 5 * 1024 * 1024) {
      return Response.json(
        { message: "Ukuran file melebihi 5 MB." },
        { status: 413 },
      );
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    const format = detectImageFormat(bytes);
    if (!format) {
      return Response.json(
        {
          message:
            "Format gambar tidak didukung. Gunakan PNG, JPEG, atau WEBP.",
        },
        { status: 400 },
      );
    }
    const contentType = contentTypeFromExt(format);
    imageParts.push({ bytes, mediaType: contentType });
    validatedFiles.push({ bytes, contentType });
  }

  const existingProject = idempotencyKey
    ? await findIdempotentProject(userId, idempotencyKey)
    : null;
  if (existingProject) {
    return Response.json({
      assetIds: [],
      id: existingProject.id,
      path: `/projects/${existingProject.id}`,
    });
  }

  try {
    const moderation = await moderateProjectRequest(validation.value, imageParts);
    if (moderation.usage) {
      await chargeEnergyForAiUsage({
        userId,
        modelId: moderation.modelId || "default-combo",
        inputTokens: moderation.usage.inputTokens,
        outputTokens: moderation.usage.outputTokens,
        reason: "moderation",
      });
    }
    if (!moderation.allowed) {
      return Response.json(
        {
          code: "project_request_blocked",
          message: moderation.message || "Permintaan belum bisa diproses.",
        },
        { status: 400 },
      );
    }
  } catch (error) {
    console.error("[moderation] api.projects failed", {
      error: error instanceof Error ? error.message : error,
    });
    return Response.json(
      {
        code: "moderation_unavailable",
        message: "Pemeriksaan keamanan belum berhasil. Coba lagi sebentar.",
        retryAfter: 3,
      },
      { status: 503 },
    );
  }

  const brief = createInitialBrief(validation.value);
  const workspaceCard = createFallbackWorkspaceCard(brief);
  let project: { id: string } | null;
  try {
    project = await createProjectOnce({
      brief,
      idempotencyKey,
      mode,
      prompt: validation.value,
      sessionUserId: userId,
      workspaceCard,
    });
  } catch (error) {
    if (error instanceof ProjectLimitExceededError) {
      return Response.json(
        {
          code: "project_limit_exceeded",
          message: `Kamu sudah punya ${error.count} website (batas ${error.limit}). Hapus yang tidak terpakai dulu.`,
          projectCount: error.count,
          projectLimit: error.limit,
        },
        { status: 403 },
      );
    }
    if (idempotencyKey) {
      project = await findIdempotentProject(userId, idempotencyKey);
    } else {
      throw error;
    }
  }
  if (!project) {
    return apiError({
      code: "project_create_unavailable",
      message: "Proyek belum bisa dibuat. Coba lagi sebentar.",
      status: 503,
    });
  }

  const assetIds: string[] = [];
  for (const f of validatedFiles) {
    const asset = await uploadProjectAsset({
      bytes: f.bytes,
      projectId: project.id,
      purpose: "business-image",
      userId,
    });
    assetIds.push(asset.id);
  }

  return Response.json({
    assetIds,
    id: project.id,
    path: `/projects/${project.id}`,
    projectCount: await getProjectCount(userId),
    projectLimit: getProjectLimit(),
  });
},
```

- [ ] **Step 4: Add the idempotency-key-from-form helper**

Above the existing `getIdempotencyKey` function (currently at line 279), add this new helper:

```ts
function getIdempotencyKeyFromForm(form: FormData) {
  const value = String(form.get("idempotencyKey") ?? "").trim();
  if (!value || value.length > IDEMPOTENCY_KEY_MAX_LENGTH) {
    return "";
  }
  return /^[A-Za-z0-9._:-]+$/.test(value) ? value : "";
}
```

The existing `getIdempotencyKey(request, bodyKey?)` reads from headers; the new helper reads from the form. Keep the existing helper too (other call sites may use it).

- [ ] **Step 5: Run `bun run check`**

Run: `bun run check`
Expected: PASS. If any test mocks `POST /api/projects` with a JSON body, the test will need to be updated to multipart — only update tests that target this specific endpoint. Don't blanket-fix.

- [ ] **Step 6: Commit**

```bash
git add src/routes/api.projects.ts
git commit -m "feat(api): create-project is multipart, persists files in one handler

The POST /api/projects endpoint now accepts multipart/form-data with
a 'prompt' text field and an optional 'files' array (≤6, ≤5 MiB each,
PNG/JPEG/WEBP by magic-byte). Files are validated, moderated together
with the prompt, and persisted as ProjectAsset rows in the same handler
— so the response includes the assetIds the client needs.

The previous flow had to do a second round trip from the client to
upload images AFTER project creation, and the image was never
moderated. This is a strict improvement on both axes."
```

---

## Task 9: HomePromptForm switches to multipart, deletes the client upload loop

**Files:**
- Modify: `src/components/projects/HomePromptForm.tsx` (lines 117-211)

**Interfaces:**
- Consumes: `fetch` POST multipart.
- Produces: same UX (redirect on success, inline error on failure) but attachments are cleared on every non-2xx response, and the client-side upload loop is gone.

- [ ] **Step 1: Read the current `createMutation` and `onSuccess`**

Read `src/components/projects/HomePromptForm.tsx` lines 117-211 to see the current JSON-based fetch and the `onSuccess` upload loop.

- [ ] **Step 2: Replace the `mutationFn` and `onSuccess`**

Replace the entire `createMutation` config (lines 117-211) with:

```ts
const createMutation = useCacheMutation<
  { assetIds: string[]; id: string; path: string },
  string
>({
  mutationFn: async (value) => {
    const idempotencyKey = getProjectCreateIdempotencyKey(value);
    const form = new FormData();
    form.append("prompt", value);
    form.append("mode", "discuss");
    form.append("idempotencyKey", idempotencyKey);
    for (const attachment of attachments) {
      form.append("files", attachment.file);
    }

    const response = await fetch("/api/projects", {
      body: form,
      method: "POST",
    });

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) {
      throw new Error("Gagal membuat website.");
    }

    const result = (await response.json().catch(() => null)) as {
      assetIds?: string[];
      id?: string;
      message?: string;
      path?: string;
    } | null;

    if (!response.ok || !result?.id || !result?.path) {
      throw new Error(result?.message || "Gagal membuat website.");
    }

    return {
      assetIds: result.assetIds ?? [],
      id: result.id,
      path: result.path,
    };
  },
  invalidateKeys: [queryKeys.projects, queryKeys.energy],
  onSuccess: () => {
    // Server persisted files (if any) and returned the project. Clear
    // attachments client-side and navigate to the new project.
    revokeAll(attachments);
    setAttachments([]);
    window.localStorage.removeItem(PROJECT_DRAFT_STORAGE_KEY);
    router.push(`/projects/${createMutation.variables}`);
  },
  onError: (error) => {
    setErrorMessage(
      error instanceof Error ? error.message : "Gagal membuat website.",
    );
    isSubmittingRef.current = false;
  },
});
```

Note: `createMutation.variables` is the latest value passed to `mutateAsync`. The router push is to `/projects/${prompt}` (the value), which is what `data.path` would be. To avoid capturing stale closure, read `createMutation.variables` at call time. If `useCacheMutation` doesn't expose `variables`, fall back to capturing the latest via a ref. Inspect the type to confirm; if not available, restructure to read the result instead:

```ts
onSuccess: (data) => {
  revokeAll(attachments);
  setAttachments([]);
  window.localStorage.removeItem(PROJECT_DRAFT_STORAGE_KEY);
  router.push(data.path);
},
```

This is the simpler form. Use this one. The `data` parameter is the return value of `mutationFn`, so `data.path` is the project path.

- [ ] **Step 3: Update `handleSubmit` to clear attachments on every non-2xx (defensive)**

The `onError` already handles error display. The `onSuccess` already clears attachments on success. But if the server returns 201 with no files, we still need to clear. The simpler `onSuccess(data) { ... router.push(data.path) }` already does this.

For non-2xx paths: `onError` fires and shows the message; attachments stay in state because the user might want to retry. **But the spec said "clear attachments on every non-2xx response."** Add this to `onError`:

```ts
onError: (error) => {
  setErrorMessage(
    error instanceof Error ? error.message : "Gagal membuat website.",
  );
  revokeAll(attachments);
  setAttachments([]);
  isSubmittingRef.current = false;
},
```

This clears attachments on any non-2xx. The user re-attaches after fixing their prompt.

- [ ] **Step 4: Run `bun run check`**

Run: `bun run check`
Expected: PASS. The `format:check` will reformat the longer `mutationFn` body — let it.

- [ ] **Step 5: Commit**

```bash
git add src/components/projects/HomePromptForm.tsx
git commit -m "refactor(home): multipart POST, server persists files

Switch HomePromptForm's createProject mutation from JSON to
multipart, with files appended under the 'files' field. Delete
the onSuccess client-side upload loop (the server now persists
files before returning 201) and the related sessionStorage
handoff (the response includes assetIds). Clear attachments on
every non-2xx response so the user starts clean on retry."
```

---

## Task 10: Delete the sessionStorage handoff in WorkspaceShell

**Files:**
- Modify: `src/components/projects/WorkspaceShell.tsx` (lines ~1077-1108)

**Interfaces:**
- Consumes: nothing new.
- Produces: same auto-send behavior, but without the sessionStorage read. The assetIds from the project creation are now persisted server-side, so the workspace's first chat turn can read them from the project state when it loads.

- [ ] **Step 1: Read the current auto-send effect**

Read `src/components/projects/WorkspaceShell.tsx` lines 1060-1110 to see the current `sessionStorage` handoff.

- [ ] **Step 2: Remove the sessionStorage block**

Replace the `setTimeout` body (lines 1078-1108) with:

```ts
const timer = setTimeout(() => {
  autoSentProjectIds.add(projectId);
  sendMessage({ text: prompt }, { body: { mode } });
}, 0);
```

This removes the `try { ... sessionStorage.getItem("umkmcepat:initial-assets:...") } catch { ... }` block and the `files`/`mediaPaths` arguments to `sendMessage`. The auto-send is now plain text-only.

**The follow-up question:** how does the first chat turn on the workspace know about the uploaded assets? Two options:

- **Option 1 (deferred):** The chat turn's `body.mediaPaths` stays empty for the first send. The model's tool calls later in the chat can fetch from `ProjectAsset` if needed. The first build pass doesn't see the images. This is the simpler, "do nothing more" choice.
- **Option 2 (out of scope for this plan):** Add a server-side first-turn enrichment that reads `ProjectAsset` rows for the project and injects them into the chat turn's `body.mediaPaths`. Spec a follow-up.

Per the spec, the assetIds are now in the project's `ProjectAsset` table. The model's tool calls can reference them. We accept that the FIRST auto-send is text-only; if the model needs the image, it'll either ask or look it up via tools. Document this in a `ponytail:` comment above the auto-send:

```ts
// ponytail: first-turn asset inclusion. The home form's images are
// persisted as ProjectAsset rows. We could fetch them here and pass
// mediaPaths in the body, but that requires a sync query at mount
// time and races with the project loader. The AI tool can resolve
// assets from the project state when it needs them. Add this only
// if first-turn asset inclusion becomes a UX requirement.
```

- [ ] **Step 3: Run `bun run check`**

Run: `bun run check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/projects/WorkspaceShell.tsx
git commit -m "refactor(workspace): drop sessionStorage asset handoff

The home form's images are now persisted server-side as ProjectAsset
rows during project creation, so the workspace's first auto-send
no longer needs to thread them via sessionStorage. First-turn
asset inclusion is documented as a deliberate defer (ponytail).
The AI tool can resolve assets from the project state on demand."
```

---

## Task 11: Final gate + manual smoke test

**Files:** None modified — verification only.

- [ ] **Step 1: Run the full local gate**

Run: `bun run check`
Expected: PASS (format/lint/typecheck/`test:changed`/Knip all green). If anything fails, fix only the failing item — do not reformat unrelated files.

- [ ] **Step 2: Manual smoke test — home page**

With `bun run dev` running and signed in:

1. Open `http://localhost:3000`.
2. Type `"a"` (1 char) in the prompt → submit. Expected: form shows "Tulis kebutuhan usahamu lebih lengkap, minimal 8 karakter." inline. No network call. Attachments (if any) cleared.
3. Type `"halo"` (4 chars) → submit. Same message, no network call.
4. Type `"halo semua"` (10 chars) → submit. Expected: project created, redirect to `/projects/<id>`, NO images uploaded (none attached).
5. Back to home. Type `"halo semua"` + attach 1 PNG image. Submit. Expected: project created, redirect, image appears in the workspace's first chat turn or via tool call (per the ponytail comment in Task 10).
6. Back to home. Type `"halo semua"` + attach 1 file with `.txt` extension (or any non-image). Submit. Expected: form shows "Format gambar tidak didukung. Gunakan PNG, JPEG, atau WEBP." inline.

- [ ] **Step 3: Manual smoke test — workspace composer**

1. Inside a project, scroll to the chat composer.
2. Type a message + attach 1 image → submit. Expected: image uploads (201), chat turn fires, image renders in the AI reply.
3. Repeat with a 6 MiB image. Expected: 413 toast, file stays in pending list, no chat send.

- [ ] **Step 4: Manual smoke test — support ticket**

1. As a user, open a support ticket thread at `/support/<id>`.
2. Attach 1 image, send. Expected: image appears inline in the message bubble (the previously broken flow).
3. As an admin, open the same ticket at `/admin/tickets/<id>`. Expected: the user's image renders in the thread.
4. Refresh the admin page. Expected: the image still renders (not 404).

- [ ] **Step 5: Confirm clean git state**

Run: `git log --oneline dev ^origin/dev | head -12`
Expected: ten new commits on `dev` (8 code + 1 spec + 1 plan, or similar — the spec/plan commits were from earlier in the session).

---

## Self-Review

**Spec coverage check:**

| Spec section | Implemented in |
|---|---|
| A. Shared moderation helper | Task 4 (signature, images, retry, logging) |
| B. Project create multipart | Task 8 (server) + Task 9 (client) |
| C. Workspace upload moderation | Task 6 |
| D. Support ticket fix | Task 7 |
| E. Validation helper change | Task 3 |
| F. Client-side attachment UX | Task 9 (clear on error) + Task 10 (delete session handoff) |
| G. Shared image-format detection | Tasks 1, 2 |
| Done Means — server curl matrix | Task 11 Step 2-4 |
| Done Means — client UX | Task 11 Step 2-4 |

All spec sections covered.

**Placeholder scan:** Searched plan for "TBD", "TODO", "later", "similar to", "implement later", "add appropriate". None in code steps. The one `ponytail:` comment in Task 10 explicitly documents the deferred first-turn asset inclusion with the reason and the upgrade path — not a placeholder, an explicit deferral.

**Type consistency:** 
- `ModerationImage` defined in Task 4, used in Task 8 — same name, same shape.
- `detectImageFormat` / `contentTypeFromExt` defined in Task 1, used in Tasks 2, 6, 7, 8 — same imports throughout.
- `assetIds: string[]` in Task 8's response and Task 9's mutation return type — same shape.
- Indonesian error messages copied verbatim from the codebase: "Tulis kebutuhan usahamu lebih lengkap, minimal 8 karakter.", "Maksimal 6 gambar.", "Ukuran file melebihi 5 MB.", "Format gambar tidak didukung. Gunakan PNG, JPEG, atau WEBP.", "Format file tidak didukung. Gunakan PNG, JPEG, WEBP, atau GIF.", "Checker keamanan lagi lambat. Coba kirim lagi sebentar ya." — all match existing strings where they exist, the new ones are Indonesian and consistent in tone.

**Atomicity:** Ten commits, each independently shippable:
1. Shared format detection
2. Re-export from project-assets
3. Min-length validation
4. Moderation helper extension
5. Logging on bare catch blocks
6. Workspace upload moderation
7. Support ticket S3 fix
8. Project create multipart
9. HomePromptForm multipart
10. WorkspaceShell sessionStorage cleanup

If Task 8 lands without Task 9, the server expects multipart but the client still sends JSON — `formData()` returns null on a JSON body, so the server returns 400. Both must land together. Tasks 8 and 9 are sequenced (8 first, 9 second) but should be merged into a single commit if your CI runs against `dev` between them. The plan's commit ordering handles that.

**Done.**
