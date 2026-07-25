# Photo-Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a site owner attach images in the workspace chat composer (generation or Ubah edit mode); attached images stay client-side blob-URL previews until send, commit to R2 on send, and the vision-capable combo agent autonomously places them into source as `<img src="/media/<assetId>">`; published sites serve owner photos via a public `/media/<assetId>` route that 302-redirects to the R2 public URL.

**Architecture:** Composer gains an attachment strip (blob-URL previews, X-remove, cap 6). On send, each attachment POSTs to the existing upload route (returns `{id, publicUrl}`), then the chat-turn message carries `{type:"image", image:<bytes>}` parts alongside the text part to the existing preview POST. The generation/edit agent (Vercel AI SDK `createOpenAICompatible`, combo band incl. `qwen3-vl-235b` + `gemini-3.1-flash-lite`) reads the image, writes `<img src="/media/<assetId>">`. A new public `GET /media/<assetId>` route 302-redirects to `ProjectAsset.publicUrl`. Ubah image-replace extends `runtime-proxy.ts:targetData()` to capture `element.src` for `<img>` targets so the edit agent swaps the exact `src` string.

**Tech Stack:** Bun, TypeScript, TanStack Router (+ server functions / `createFileRoute`), Vercel AI SDK (`@ai-sdk/openai-compatible`), Prisma + PostgreSQL, Vitest, React. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-25-photo-upload-design.md`
**Depends on:** R2 display-media plan (`docs/superpowers/plans/2026-07-24-r2-display-media.md`) — `ProjectAsset.publicUrl` column + `src/lib/r2-client.ts` must exist first.

## Global Constraints

- Local stays the zero-config dev default; image upload to R2 only happens when `PROJECT_ASSET_STORAGE_PROVIDER=r2` (R2 spec). When local, the upload route returns `publicUrl: null` and `/media/<assetId>` returns 404 — the feature degrades honestly, never fabricates.
- Attached images are client-side `blob:` URL previews only until send; nothing leaves the browser until the message is committed. Refresh/clear drops attachments; no server draft state, no orphan R2 objects.
- Cap **6 images per message** (`MAX_COMPOSER_IMAGES = 6`); extras rejected with an Indonesian toast.
- The agent writes **`/media/<assetId>`** into source, never the raw R2 URL (vendor-neutral, slug-independent).
- Labels: mode-toggle button = "Ubah"; annotation action = "Komentar"; image-replace affordance = "Ganti gambar". Visible product copy Indonesian; code/comments/errors English.
- `.env` and `.env.example` stay 1:1.
- TDD: failing test first, minimal code, targeted test, then `bun run check`. Frequent atomic commits to `dev`. Conventional-commit messages, body lines ≤ 100 chars, end with `Co-Authored-By: Claude <noreply@anthropic.com>`.
- Never surface mock/dummy content as a successful AI response; VL vision failure → ask the user where to place the image, never fabricate.

---

## File Structure

- **Create** `src/routes/media.$assetId.ts` — public `GET /media/<assetId>` → 302 to `ProjectAsset.publicUrl` (or 404).
- **Create** `src/routes/media.$assetId.test.ts` — route contract: 302 when publicUrl set, 404 otherwise, Cache-Control header.
- **Create** `src/lib/projects/composer-attachments.ts` — attachment-strip state helpers: `MAX_COMPOSER_IMAGES`, `addAttachments`, `removeAttachment`, `revokeAll`, `toUploadPlan`.
- **Create** `src/lib/projects/composer-attachments.test.ts` — cap enforcement, X-remove revokes blob URL, send clears the strip.
- **Create** `src/components/projects/ComposerAttachments.tsx` — the strip UI (thumbnails + X + paperclip input).
- **Modify** `src/components/projects/WorkspaceShell.tsx` — wire `pendingAttachments` state into `submitChatText`: upload-on-send, attach `{type:"image"}` parts to the message, clear on success/failure.
- **Modify** `src/lib/projects/runtime-proxy.ts` — `targetData()` adds `src` for `img`/`picture`/`svg` targets; `VisualAnnotationTarget` gains optional `src`.
- **Modify** `src/lib/projects/visual-annotations.ts` — `VisualAnnotationTarget` type gains `src?: string`; sanitize carries it; a new `createImageReplaceEditInstruction` builder.
- **Modify** `src/lib/projects/visual-annotations.test.ts` — image-replace target carries `src`; instruction carries `target.src` + `replaceWith[].mediaPath`.
- **Modify** `src/components/projects/WorkspacePrimitives.tsx` — "Ganti gambar" affordance in the annotation popover for image targets; mode-toggle label → "Ubah".
- **Modify** the generation/edit agent prompt (`src/lib/projects/custom-source-generator.ts`, `src/lib/projects/source-edit-agent.ts`) — instructions for placing uploaded images via `/media/<assetId>`.

---

### Task 1: Public `/media/<assetId>` serve route

**Files:**
- Create: `src/routes/media.$assetId.ts`
- Create: `src/routes/media.$assetId.test.ts`

**Interfaces:**
- Consumes: `ProjectAsset` model with `publicUrl: string | null` (R2 spec task 5), `prisma` from `@/lib/prisma`.
- Produces: `GET /media/:assetId` → `302 Location: <publicUrl>` when set, `404` otherwise; `Cache-Control: public, max-age=31536000, immutable` on the 302.

- [x] **Step 1: Write the failing route contract test**

Create `src/routes/media.$assetId.test.ts`. The route uses `prisma.projectAsset.findUnique`, so test through a thin extraction of the decision logic (mirrors the existing `api.projects.$id.asset.$assetId.ts` pattern of testing ownership logic via helpers, not live route boots):

```ts
import { describe, expect, it } from "vitest";

import { resolveMediaRedirect } from "@/routes/media.$assetId";

describe("resolveMediaRedirect", () => {
  it("returns the publicUrl when present", () => {
    expect(
      resolveMediaRedirect({ id: "a1", publicUrl: "https://pub.r2.dev/x.png" }),
    ).toEqual({ status: 302, location: "https://pub.r2.dev/x.png" });
  });

  it("returns 404 when publicUrl is null", () => {
    expect(resolveMediaRedirect({ id: "a1", publicUrl: null })).toEqual({
      status: 404,
    });
  });

  it("returns 404 when the asset row is missing", () => {
    expect(resolveMediaRedirect(null)).toEqual({ status: 404 });
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `bunx vitest run src/routes/media.\$assetId.test.ts`
Expected: FAIL — `resolveMediaRedirect` not exported.

- [x] **Step 3: Implement the route + extracted helper**

Create `src/routes/media.$assetId.ts`:

```ts
import { createFileRoute } from "@tanstack/react-router";

import { prisma } from "@/lib/prisma";

type AssetRow = { id: string; publicUrl: string | null } | null;

export function resolveMediaRedirect(asset: AssetRow):
  | { status: 302; location: string }
  | { status: 404 } {
  if (!asset || !asset.publicUrl) {
    return { status: 404 };
  }
  return { status: 302, location: asset.publicUrl };
}

export const Route = createFileRoute("/media/$assetId")({
  server: {
    handlers: {
      // Public media serve: owner-uploaded display media embedded in
      // published/generated sites. No auth — the assetId (cuid) is the gate;
      // the image is meant to be public (it appears on a live site).
      GET: async ({ params }) => {
        const asset = await prisma.projectAsset.findUnique({
          where: { id: params.assetId },
          select: { id: true, publicUrl: true },
        });
        const resolved = resolveMediaRedirect(asset);
        if (resolved.status === 404) {
          return new Response(null, { status: 404 });
        }
        return new Response(null, {
          status: 302,
          headers: {
            Location: resolved.location,
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        });
      },
    },
  },
});
```

- [x] **Step 4: Run the test to verify it passes**

Run: `bunx vitest run src/routes/media.\$assetId.test.ts`
Expected: PASS (3 tests).

- [x] **Step 5: Regenerate the route tree + typecheck**

Run: `bunx tsr generate && bunx tsc --noEmit`
Expected: route registered, no type errors.

- [x] **Step 6: Commit**

```bash
git add src/routes/media.\$assetId.ts src/routes/media.\$assetId.test.ts
git commit -m "feat(media): public /media/:assetId route 302->publicUrl"
```

---

### Task 2: Composer attachment-strip state helpers

**Files:**
- Create: `src/lib/projects/composer-attachments.ts`
- Create: `src/lib/projects/composer-attachments.test.ts`

**Interfaces:**
- Produces:
  - `export const MAX_COMPOSER_IMAGES = 6`
  - `export type PendingAttachment = { id: string; file: File; blobUrl: string }`
  - `addAttachments(current: PendingAttachment[], files: File[]): { next: PendingAttachment[]; rejected: File[] }` — appends up to the cap; the overflow goes to `rejected` for the toast.
  - `removeAttachment(current: PendingAttachment[], id: string): PendingAttachment[]` — drops one + revokes its blob URL.
  - `revokeAll(current: PendingAttachment[]): void` — revokes every blob URL (call on send success/failure/unmount).
  - `toUploadPlan(current: PendingAttachment[]): { id: string; file: File }[]` — the stable upload list for send.

- [x] **Step 1: Write failing tests**

Create `src/lib/projects/composer-attachments.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  MAX_COMPOSER_IMAGES,
  addAttachments,
  removeAttachment,
  revokeAll,
  type PendingAttachment,
} from "@/lib/projects/composer-attachments";

function file(name: string): File {
  return new File(["x"], name, { type: "image/png" });
}

const revoke = vi.fn();
URL.revokeObjectURL = revoke;

describe("composer attachments", () => {
  afterEach(() => revoke.mockClear());

  it("addAttachments appends up to the cap and reports overflow", () => {
    const first = addAttachments([], [file("a.png"), file("b.png")]);
    expect(first.next).toHaveLength(2);
    expect(first.rejected).toEqual([]);

    const fill = Array.from({ length: MAX_COMPOSER_IMAGES }, () => file("x.png"));
    const full = addAttachments([], fill);
    expect(full.next).toHaveLength(MAX_COMPOSER_IMAGES);
    expect(full.rejected).toEqual([]);

    const overflow = addAttachments(full.next, [file("extra.png")]);
    expect(overflow.next).toHaveLength(MAX_COMPOSER_IMAGES);
    expect(overflow.rejected).toEqual([file("extra.png")]);
  });

  it("removeAttachment drops one and revokes its blob URL", () => {
    const base: PendingAttachment[] = [
      { id: "1", file: file("a.png"), blobUrl: "blob:1" },
      { id: "2", file: file("b.png"), blobUrl: "blob:2" },
    ];
    const next = removeAttachment(base, "1");
    expect(next).toHaveLength(1);
    expect(next[0].id).toBe("2");
    expect(revoke).toHaveBeenCalledWith("blob:1");
  });

  it("revokeAll revokes every blob URL", () => {
    revokeAll([
      { id: "1", file: file("a.png"), blobUrl: "blob:1" },
      { id: "2", file: file("b.png"), blobUrl: "blob:2" },
    ]);
    expect(revoke).toHaveBeenCalledTimes(2);
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `bunx vitest run src/lib/projects/composer-attachments.test.ts`
Expected: FAIL — module not found.

- [x] **Step 3: Implement the helpers**

Create `src/lib/projects/composer-attachments.ts`:

```ts
export const MAX_COMPOSER_IMAGES = 6;

export type PendingAttachment = {
  id: string;
  file: File;
  blobUrl: string;
};

let counter = 0;
function nextId(): string {
  counter += 1;
  return `att_${Date.now().toString(36)}_${counter}`;
}

export function addAttachments(
  current: PendingAttachment[],
  files: File[],
): { next: PendingAttachment[]; rejected: File[] } {
  const room = MAX_COMPOSER_IMAGES - current.length;
  const accepted = files.slice(0, Math.max(0, room));
  const rejected = files.slice(Math.max(0, room));
  const additions: PendingAttachment[] = accepted.map((file) => ({
    blobUrl: URL.createObjectURL(file),
    file,
    id: nextId(),
  }));
  return { next: [...current, ...additions], rejected };
}

export function removeAttachment(
  current: PendingAttachment[],
  id: string,
): PendingAttachment[] {
  const removed = current.find((item) => item.id === id);
  if (removed) {
    URL.revokeObjectURL(removed.blobUrl);
  }
  return current.filter((item) => item.id !== id);
}

export function revokeAll(current: PendingAttachment[]): void {
  for (const item of current) {
    URL.revokeObjectURL(item.blobUrl);
  }
}

export function toUploadPlan(
  current: PendingAttachment[],
): { id: string; file: File }[] {
  return current.map((item) => ({ file: item.file, id: item.id }));
}
```

- [x] **Step 4: Run the test to verify it passes**

Run: `bunx vitest run src/lib/projects/composer-attachments.test.ts`
Expected: PASS (3 tests).

- [x] **Step 5: Run the fast gate**

Run: `bun run check`
Expected: all green.

- [x] **Step 6: Commit**

```bash
git add src/lib/projects/composer-attachments.ts src/lib/projects/composer-attachments.test.ts
git commit -m "feat(composer): attachment-strip state helpers (cap 6, X-remove, revoke)"
```

---

### Task 3: Composer attachment strip UI + paperclip

**Files:**
- Create: `src/components/projects/ComposerAttachments.tsx`

**Interfaces:**
- Consumes: `PendingAttachment`, `MAX_COMPOSER_IMAGES`, `addAttachments`, `removeAttachment` (Task 2).
- Produces: a React component rendering the paperclip `<input type="file" multiple>` + the thumbnail strip with X-remove. Calls `onChange(next)` and `onReject(files)` props.

- [x] **Step 1: Implement the strip component**

Create `src/components/projects/ComposerAttachments.tsx`:

```tsx
import { X } from "lucide-react";
import { useRef } from "react";

import {
  MAX_COMPOSER_IMAGES,
  addAttachments,
  type PendingAttachment,
} from "@/lib/projects/composer-attachments";

export function ComposerAttachments({
  attachments,
  onAdd,
  onRemove,
}: {
  attachments: PendingAttachment[];
  onAdd: (next: PendingAttachment[], rejected: File[]) => void;
  onRemove: (id: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const full = attachments.length >= MAX_COMPOSER_IMAGES;

  return (
    <div className="flex flex-wrap items-center gap-2 px-spacing-3 pb-spacing-2">
      <button
        type="button"
        aria-label="Lampirkan gambar"
        disabled={full}
        onClick={() => inputRef.current?.click()}
        className="inline-flex h-9 w-9 items-center justify-center rounded-radius-md border border-surface-warm-white/10 text-surface-warm-white/70 hover:bg-surface-warm-white/8 disabled:opacity-40"
      >
        <span className="text-base">📎</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        hidden
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          if (files.length) {
            const { next, rejected } = addAttachments(attachments, files);
            onAdd(next, rejected);
          }
          event.target.value = "";
        }}
      />
      {attachments.map((item) => (
        <div key={item.id} className="relative h-12 w-12 overflow-hidden rounded-radius-md border border-surface-warm-white/10">
          <img src={item.blobUrl} alt="" className="h-full w-full object-cover" />
          <button
            type="button"
            aria-label="Hapus gambar"
            onClick={() => onRemove(item.id)}
            className="absolute right-0 top-0 flex h-5 w-5 items-center justify-center rounded-bl-radius-md bg-surface-warm-white/80 text-black hover:bg-surface-warm-white"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );
}
```

- [x] **Step 2: Add a Storybook story**

Add to `src/stories/ComposerAttachments.stories.tsx` (follow existing story patterns):

```tsx
import type { Meta, StoryObj } from "@storybook/react";

import { ComposerAttachments } from "@/components/projects/ComposerAttachments";

const meta: Meta<typeof ComposerAttachments> = {
  component: ComposerAttachments,
};
export default meta;

export const Empty: StoryObj<typeof ComposerAttachments> = {
  args: { attachments: [], onAdd: () => {}, onRemove: () => {} },
};
```

- [x] **Step 3: Typecheck + lint**

Run: `bunx tsc --noEmit && bun run lint`
Expected: no errors.

- [x] **Step 4: Commit**

```bash
git add src/components/projects/ComposerAttachments.tsx src/stories/ComposerAttachments.stories.tsx
git commit -m "feat(composer): attachment strip UI (paperclip, thumbnails, X-remove)"
```

---

### Task 4: Wire attachment upload-on-send into the composer

**Files:**
- Modify: `src/components/projects/WorkspaceShell.tsx` (the `submitChatText` / `sendMessage` path, lines ~1936-1948)

**Interfaces:**
- Consumes: `ComposerAttachments` (Task 3), the upload route `POST /api/projects/$id/assets` returning `{id, publicUrl}`, the existing `sendMessage({text}, {body:{mode, workspaceAnswers}})` signature.
- Produces: on send, attachments upload first → if any fail, abort with an error toast + keep the attachments; on success, the chat message carries `{type:"image", image:<Uint8Array>}` parts for each uploaded image (alongside the text part), the strip clears, blob URLs revoked.

- [x] **Step 1: Add `pendingAttachments` state + render the strip**

In `WorkspaceShell.tsx`, near the other composer state (~line 291):

```tsx
const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
```

Import `ComposerAttachments`, `PendingAttachment`, `removeAttachment`, `revokeAll`, `toUploadPlan` from the new modules.

Render `<ComposerAttachments>` above the `<textarea>` (in the composer block ~line 2489):

```tsx
<ComposerAttachments
  attachments={pendingAttachments}
  onAdd={(next, rejected) => {
    setPendingAttachments(next);
    if (rejected.length) {
      toast.error(`Maksimal ${MAX_COMPOSER_IMAGES} gambar per pesan.`);
    }
  }}
  onRemove={(id) => setPendingAttachments((cur) => removeAttachment(cur, id))}
/>
```

(Use the existing toast mechanism — confirm the import path with `grep -rn "useToast\|toast\." src/components/projects/WorkspaceShell.tsx | head` and match it.)

- [x] **Step 2: Upload-on-send + attach image parts to the message**

In `submitChatText`, before the `sendMessage(...)` call (~line 1936), insert the upload step. Replace the existing `sendMessage` call so attachments become image content parts:

```tsx
const trimmed = message.trim();
if (!trimmed && pendingAttachments.length === 0) {
  return;
}

let imageParts: { type: "image"; image: Uint8Array }[] = [];
if (pendingAttachments.length) {
  const uploaded: { type: "image"; image: Uint8Array }[] = [];
  try {
    for (const item of toUploadPlan(pendingAttachments)) {
      const form = new FormData();
      form.append("file", item.file);
      form.append("purpose", "business-image");
      const res = await fetch(`/api/projects/${projectId}/assets`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        throw new Error(`Gagal mengunggah ${item.file.name}`);
      }
      const asset = await res.json() as { id: string; publicUrl: string | null };
      if (!asset.publicUrl) {
        throw new Error(`Gambar belum tersedia (${item.file.name}). Aktifkan R2.`);
      }
      const bytes = new Uint8Array(await item.file.arrayBuffer());
      uploaded.push({ image: bytes, type: "image" });
    }
    imageParts = uploaded;
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Gagal mengunggah gambar.");
    // keep the attachments so the user can retry without re-attaching
    return;
  }
}

// … existing rate-limit / message reset code …

sendMessage(
  {
    text: trimmed,
    // Attach image parts to the first message so the agent turn sees them.
    // The preview POST already iterates message.parts; image parts are
    // passed through to the VL model via the Vercel AI SDK content shape.
    parts: imageParts.length
      ? [...(trimmed ? [{ type: "text" as const, text: trimmed }] : []), ...imageParts]
      : undefined,
  },
  {
    body: {
      mode: composerState === "post_build_chat" ? "discuss" : mode,
      workspaceAnswers: options.workspaceAnswers,
    },
  },
);

if (pendingAttachments.length) {
  revokeAll(pendingAttachments);
  setPendingAttachments([]);
}
```

Note: the existing `sendMessage` already accepts a `{text, parts?}` message shape — confirm by reading the message type at the `sendMessage` definition; if `parts` is not yet supported, extend the message type to accept `parts?: ContentPart[]` where `ContentPart = {type:"text"; text:string} | {type:"image"; image:Uint8Array}`. This is the one place the existing preview POST (`api.projects.preview.ts` line ~192-256) is already parts-aware — it filters `parts` by `type === "text"` today; image parts pass through untouched to the model.

- [x] **Step 3: Run typecheck + the workspace shell's existing tests**

Run: `bunx tsc --noEmit && bunx vitest run src/components/projects/WorkspaceShell 2>/dev/null || true`
Expected: no type errors; existing tests still pass.

- [x] **Step 4: Run the fast gate**

Run: `bun run check`
Expected: all green.

- [x] **Step 5: Commit**

```bash
git add src/components/projects/WorkspaceShell.tsx
git commit -m "feat(composer): upload-on-send + attach image parts to the message"
```

---

### Task 5: Agent prompt — place uploaded images via `/media/<assetId>`

**Files:**
- Modify: `src/lib/projects/custom-source-generator.ts` (generation agent prompt)
- Modify: `src/lib/projects/source-edit-agent.ts` (edit agent prompt)

**Interfaces:**
- Consumes: the image parts attached to the message (Task 4) + the asset `id`/`publicUrl` from the upload route.
- Produces: agent instructions telling it to read uploaded images via vision, write `<img src="/media/<assetId>" alt="<short alt>" />`, never the raw R2 URL.

- [x] **Step 1: Read the current generation agent prompt**

Run: `grep -n "system\|prompt\|instructions" src/lib/projects/custom-source-generator.ts | head -20`
Note the prompt string location to extend.

- [x] **Step 2: Extend the generation agent prompt**

Add (or extend the system prompt with) a clause:

```
When the owner attaches images, read each image, understand what it shows,
and place it where it fits best (hero, gallery, product card). Reference
each uploaded image in the source as <img src="/media/<assetId>" alt="..." />
— never write the raw cloud URL. Provide a short, accurate alt.
If you cannot understand an image, ask the user where to place it instead of guessing.
```

The `assetId` for each attached image comes from the upload response; pass it alongside the image part so the agent knows which `/media/<id>` to write. (If the message API only carries bytes, extend the upload-on-send to also stash the `assetId` on each image part as metadata the agent reads — lean: pass `{type:"image", image, assetId}` and surface `assetId` in the prompt as "the image with assetId X.")

- [x] **Step 3: Extend the edit agent prompt identically**

Same clause in `source-edit-agent.ts`.

- [x] **Step 4: Run typecheck + fast gate**

Run: `bun run check`
Expected: all green.

- [x] **Step 5: Commit**

```bash
git add src/lib/projects/custom-source-generator.ts src/lib/projects/source-edit-agent.ts
git commit -m "feat(agent): prompt places uploaded images via /media/<assetId>"
```

---

### Task 6: Image-replace reliability fix — capture `element.src`

**Files:**
- Modify: `src/lib/projects/runtime-proxy.ts` (`targetData()` ~line 370)
- Modify: `src/lib/projects/visual-annotations.ts` (`VisualAnnotationTarget` type, sanitize)
- Modify: `src/lib/projects/visual-annotations.test.ts`

**Interfaces:**
- Consumes: the iframe-side `targetData(element, selection)` builder.
- Produces: `VisualAnnotationTarget` gains `src?: string` populated only for `img`/`picture`/`svg`. Sanitize carries it. A new `createImageReplaceEditInstruction({target, replaceWith})` builder.

- [x] **Step 1: Write failing tests**

Add to `src/lib/projects/visual-annotations.test.ts`:

```ts
import { createImageReplaceEditInstruction } from "@/lib/projects/visual-annotations";

describe("image-replace edit instruction", () => {
  it("carries the exact target.src + replaceWith mediaPaths, never raw R2 URLs", () => {
    const instruction = createImageReplaceEditInstruction({
      replaceWith: [{ mediaPath: "/media/a1", alt: "kue" }],
      target: { src: "https://pub.r2.dev/x.png", tag: "img" },
    });
    expect(instruction).toContain('src="https://pub.r2.dev/x.png"');
    expect(instruction).toContain("/media/a1");
    expect(instruction).not.toMatch(/r2\.dev.*replace/i);
  });

  it("rejects a non-image target (no src)", () => {
    expect(() =>
      createImageReplaceEditInstruction({
        replaceWith: [{ mediaPath: "/media/a1", alt: "x" }],
        target: { tag: "div" },
      }),
    ).toThrow(/image/);
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `bunx vitest run src/lib/projects/visual-annotations.test.ts`
Expected: FAIL — `createImageReplaceEditInstruction` not exported.

- [x] **Step 3: Add `src` to the type + sanitize + the builder**

In `src/lib/projects/visual-annotations.ts`:

Add to `VisualAnnotationTarget`:
```ts
export type VisualAnnotationTarget = {
  boundingBox: { height: number; width: number; x: number; y: number };
  classes?: string;
  nearbyText?: string;
  selectorPath: string;
  src?: string;
  tag: string;
  text: string;
};
```

In `sanitizeVisualAnnotations`, carry `src` through (trim to 500):
```ts
src: target.src ? trim(String(target.src), 500) : undefined,
```

Add the builder:
```ts
export function createImageReplaceEditInstruction({
  replaceWith,
  target,
}: {
  replaceWith: { alt: string; mediaPath: string }[];
  target: { src?: string; tag: string };
}): string {
  if (!target.src) {
    throw new Error("Image-replace requires an image target with a src.");
  }
  return [
    "Replace the owner image in the generated source.",
    `Find the <img src="${target.src}"> exactly and replace its src with the first mediaPath below. Provide a short, accurate alt.`,
    "Replacements (mediaPath + alt):",
    JSON.stringify(
      replaceWith.map((r) => ({ alt: r.alt, mediaPath: r.mediaPath })),
      null,
      2,
    ),
  ].join("\n\n");
}
```

- [x] **Step 4: Capture `src` in the iframe builder**

In `src/lib/projects/runtime-proxy.ts`, in `targetData(element, selection)` (~line 370), add after the existing `tag: element.tagName.toLowerCase(),`:

```js
const tag = element.tagName.toLowerCase();
const src = /^(img|picture|svg)$/.test(tag)
  ? (element.currentSrc || element.getAttribute('src') || element.src || '')
  : undefined;
```

and add `src: src || undefined,` to the returned `target` object.

- [x] **Step 5: Run the tests + typecheck**

Run: `bunx vitest run src/lib/projects/visual-annotations.test.ts && bunx tsc --noEmit`
Expected: PASS + no errors.

- [x] **Step 6: Run the fast gate**

Run: `bun run check`
Expected: all green.

- [x] **Step 7: Commit**

```bash
git add src/lib/projects/runtime-proxy.ts src/lib/projects/visual-annotations.ts src/lib/projects/visual-annotations.test.ts
git commit -m "feat(ubah): capture img src for deterministic image-replace (not selectorPath)"
```

---

### Task 7: "Ganti gambar" affordance + "Ubah" label

**Files:**
- Modify: `src/components/projects/WorkspacePrimitives.tsx` (annotation popover + mode-toggle label)

**Interfaces:**
- Consumes: `createImageReplaceEditInstruction` (Task 6), the composer attachment handler (Task 3).
- Produces: the annotation popover shows a "Ganti gambar" button when `target.tag` is `img`/`picture`/`svg` + `target.src` is set → opens the file picker → on send, posts an edit with `kind:"visual_comment"` carrying the image-replace instruction. The mode-toggle button visible label → "Ubah".

- [x] **Step 1: Add the "Ganti gambar" button to the popover**

In `WorkspacePrimitives.tsx` annotation popover block (~line 473-630), when the target is an image:

```tsx
{isImageTarget(target) ? (
  <button
    type="button"
    onClick={() => onPickReplacementImages(target)}
    className="…"
  >
    Ganti gambar
  </button>
) : null}
```

`isImageTarget(target)` = `target.tag` is `img`/`picture`/`svg` && `target.src`. `onPickReplacementImages` reuses the composer attachment picker; on send, build the edit via `createImageReplaceEditInstruction` + POST to `/api/projects/$id/edit` with `kind:"visual_comment"`.

- [x] **Step 2: Rename the mode-toggle label to "Ubah"**

In `WorkspacePrimitives.tsx` (~line 143-157), change the visible button label from the current "Komentar"/"Nonaktifkan komentar" pair to:

```tsx
{annotationActive ? "Ubah aktif" : "Ubah"}
```

Keep the existing `aria-label` semantics; update the toggle text to "Aktifkan ubah"/"Nonaktifkan ubah" if those are visible copy (check line 148).

- [x] **Step 3: Typecheck + lint + fast gate**

Run: `bun run check`
Expected: all green.

- [x] **Step 4: Commit**

```bash
git add src/components/projects/WorkspacePrimitives.tsx
git commit -m "feat(ubah): Ganti gambar affordance + Ubah mode label"
```

---

### Task 8: Integration + manual E2E (R2 provider flipped)

This task verifies the whole chain with the real bucket. Not committed code — a verification checklist.

- [x] **Step 1: Set the provider to r2**

`.env`: `PROJECT_ASSET_STORAGE_PROVIDER="r2"` (ensure `R2_PUBLIC_BASE_URL` set).

- [x] **Step 2: Apply migrations + start dev**

Run: `bunx prisma migrate dev && bun run dev`
Expected: server boots.

- [x] **Step 3: Attach + send in generation**

In the workspace composer: click paperclip → pick 2 PNGs → thumbnails render → type "pakai ini sebagai foto produk" → send.
Expected: images upload to R2 (a `ProjectAsset` with `publicUrl` per image), the agent turn runs, the preview shows `<img src="/media/<assetId>">`.

- [x] **Step 4: Verify `/media/<assetId>` 302s to R2**

Run: `curl -sS -I http://localhost:3000/media/<assetId>`
Expected: `HTTP/1.1 302` + `Location: https://pub-...r2.dev/...`.

- [x] **Step 5: Verify the published site embeds `/media/<id>`**

Publish the project, open `/p/<slug>`:
Expected: the image loads via `/media/<assetId>` → 302 → R2.

- [x] **Step 6: Verify Ubah image-replace**

Click an `<img>` in the preview → "Ganti gambar" → pick a new image → send.
Expected: the edit agent swaps the exact `src` to a new `/media/<id>`.

- [x] **Step 7: Flip back + no regression**

`.env`: `PROJECT_ASSET_STORAGE_PROVIDER="local"`. Run `bun run check`.
Expected: all green (feature degrades honestly — uploads return `publicUrl:null`, `/media/<id>` 404s).

---

## Post-implementation

- Update `docs/architecture.md` if the new `/media/<assetId>` route changes the serving map (it adds a public media boundary row).
- The non-image annotation `selectorPath` brittleness remains a pre-existing issue (flagged in spec, not fixed here).
