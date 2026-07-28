# Graceful Multi-Image Upload Error Handling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make workspace chat upload multiple images gracefully — per-file error handling, partial send of successful images, clear per-file error messages.

**Architecture:** Wrap each per-file upload in try/catch instead of throwing on first failure. Collect errors, let successful files through, report failures as one toast with file names + reasons.

**Tech Stack:** TypeScript, React, TanStack Query, sonner toasts

## Global Constraints

- Workspace upload endpoint (`api.projects.$id.assets.upload.ts`) stays unchanged — it's correct.
- Support ticket upload already handles per-file errors gracefully — no changes needed.
- `pendingAttachments` state is NOT cleared on failure so user can retry.
- Zeroth file success → still send chat with successful images. Zero successes → block send and show toast.

---
### Task 1: Wrap workspace upload loop in per-file error handling

**Files:**
- Modify: `src/components/projects/WorkspaceShell.tsx` (around line 2027-2075)
- Test: manual — attach 3+ images in workspace, make one fail (oversize file), verify partial send + error toast

- [ ] **Step 1: Read the current code around line 2027-2075**

Run: `grep -n "pendingAttachments.length\|for.*item.*toUploadPlan\|throw new Error" src/components/projects/WorkspaceShell.tsx`
Verify: Confirm line numbers match expected.

- [ ] **Step 2: Replace the upload loop with per-file try/catch**

Current code (lines 2027-2075):
```tsx
let fileParts: FileUIPart[] = [];
let mediaPaths: string[] = [];
if (pendingAttachments.length) {
  try {
    const parts: FileUIPart[] = [];
    const paths: string[] = [];
    for (const item of toUploadPlan(pendingAttachments)) {
      const form = new FormData();
      form.append("file", item.file);
      form.append("purpose", "business-image");
      const res = await fetch(
        `/api/projects/${projectId}/assets/upload`,
        {
          body: form,
          method: "POST",
        },
      );
      if (!res.ok) {
        throw new Error(`Gagal mengunggah ${item.file.name}`);
      }
      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.toLowerCase().includes("application/json")) {
        throw new Error(`Gagal mengunggah ${item.file.name}`);
      }
      const asset = (await res.json()) as {
        id: string;
        publicUrl: string | null;
      };
      if (!asset.publicUrl) {
        throw new Error(
          `Gambar belum tersedia (${item.file.name}). Aktifkan R2.`,
        );
      }
      const bytes = new Uint8Array(await item.file.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      }
      const base64 = btoa(binary);
      parts.push({
        filename: item.file.name,
        mediaType: item.file.type || "image/png",
        type: "file",
        url: `data:${item.file.type || "image/png"};base64,${base64}`,
      });
      paths.push(`/media/${asset.id}`);
    }
    fileParts = parts;
    mediaPaths = paths;
  } catch (error) {
    toast.error(
      error instanceof Error ? error.message : "Gagal mengunggah gambar.",
    );
  }
}
```

Replace with per-file try/catch + partial send:
```tsx
let fileParts: FileUIPart[] = [];
let mediaPaths: string[] = [];
const uploadErrors: { name: string; message: string }[] = [];

if (pendingAttachments.length) {
  for (const item of toUploadPlan(pendingAttachments)) {
    try {
      const form = new FormData();
      form.append("file", item.file);
      form.append("purpose", "business-image");
      const res = await fetch(
        `/api/projects/${projectId}/assets/upload`,
        {
          body: form,
          method: "POST",
        },
      );
      if (!res.ok) {
        throw new Error(
          (await res.json().catch(() => null))?.message ||
            `Gagal mengunggah ${item.file.name}`,
        );
      }
      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.toLowerCase().includes("application/json")) {
        throw new Error(
          `Respons tidak valid saat mengunggah ${item.file.name}.`,
        );
      }
      const asset = (await res.json()) as {
        id: string;
        publicUrl: string | null;
      };
      if (!asset.publicUrl) {
        throw new Error(
          `Gambar belum tersedia (${item.file.name}). Aktifkan R2.`,
        );
      }
      const bytes = new Uint8Array(await item.file.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      }
      const base64 = btoa(binary);
      fileParts.push({
        filename: item.file.name,
        mediaType: item.file.type || "image/png",
        type: "file",
        url: `data:${item.file.type || "image/png"};base64,${base64}`,
      });
      mediaPaths.push(`/media/${asset.id}`);
    } catch (error) {
      uploadErrors.push({
        name: item.file.name,
        message: error instanceof Error ? error.message : "Error tidak diketahui",
      });
    }
  }

  if (uploadErrors.length > 0) {
    const lines = uploadErrors.map(
      (e) => `• ${e.name}: ${e.message}`,
    );
    toast.error(
      `Gagal mengunggah ${uploadErrors.length} file:\n${lines.join("\n")}`,
      { duration: 8000 },
    );
  }
}
```

- [ ] **Step 3: Block send when zero files succeeded**

After the loop, add a check after the upload block and before `setPendingAttachments(...)`:

```tsx
if (fileParts.length === 0 && uploadErrors.length > 0) {
  toast.error(
    "Gagal mengunggah semua file. Periksa ukuran/format dan coba lagi.",
  );
  setPendingAttachments([]);
  setIsUploading(false);
  return;
}
```

Insert this right after the upload loop closes (after the `uploadErrors.length > 0` block) and before the existing `setPendingAttachments([])` call.

- [ ] **Step 4: Type check**

Run: `bun run typecheck`
Expected: No errors.

- [ ] **Step 5: Run full test suite**

Run: `bun run test`
Expected: All existing tests pass (no behavior change for single-image uploads).

- [ ] **Step 6: Commit**

```bash
git add src/components/projects/WorkspaceShell.tsx
git commit -m "fix(workspace): graceful per-file error handling for multi-image upload

Co-Authored-By: Claude <noreply@anthropic.com>"
```
