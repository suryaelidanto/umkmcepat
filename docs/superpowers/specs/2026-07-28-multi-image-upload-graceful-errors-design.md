# Graceful Multi-Image Upload Error Handling

**Date:** 2026-07-28
**Status:** Draft
**Scope:** Workspace chat + support ticket multi-image uploads

## Problem

When a user attaches multiple images and sends them in the workspace chat, the upload loop processes files sequentially. If **any single file fails** (size, format, rate limit, moderation reject, server error), the entire batch is discarded with a generic "Gagal mengunggah gambar" toast. The user has no idea which file failed or why, and successful uploads are lost.

The same pattern exists in the support ticket multi-image upload flow.

## Design

### Workspace (`WorkspaceShell.tsx`)

Change the upload loop (currently around line 2031) to:

```ts
let fileParts: FileUIPart[] = [];
let mediaPaths: string[] = [];
const uploadErrors: string[] = [];

if (pendingAttachments.length) {
  for (const item of toUploadPlan(pendingAttachments)) {
    try {
      const form = new FormData();
      form.append("file", item.file);
      form.append("purpose", "business-image");
      const res = await fetch(`/api/projects/${projectId}/assets/upload`, { ... });
      // ... existing upload logic, append to fileParts/mediaPaths on success
    } catch (err) {
      uploadErrors.push(`${item.file.name}: ${errMessage(err)}`);
    }
  }
}

if (uploadErrors.length > 0) {
  toast.error(
    `Gagal mengunggah ${uploadErrors.length} file:\n${uploadErrors.join("\n")}`,
    { duration: 8000 }
  );
}
```

- Each file upload is wrapped in try/catch.
- Successful files proceed to `fileParts` / `mediaPaths` as today.
- Failed files are collected with their file name + error message.
- If any uploads failed, show one toast listing all failures, not a batch-killing throw.
- **Partial send:** If at least one file succeeded, the chat message sends with those files. If zero succeeded, block send and show "Gagal mengunggah semua file. Periksa ukuran/format dan coba lagi."
- The `pendingAttachments` state is NOT cleared on failure so the user can retry.

### Support Ticket (`_main.support.tsx`)

The support ticket form already uses per-file `uploadMutation.mutateAsync()` in `handleFileChange` (line 166). On failure, it removes that file from local state and shows a per-file toast. This is already graceful — **no changes needed** for the support ticket.

### Support Ticket Thread (`_main.support.$ticketId.tsx`)

Same pattern as the ticket creation form — per-file try/catch in `handleFileChange`. If a file fails, it's removed from attachments and a toast is shown per file. **No changes needed** for the thread reply form either.

## Files Changed

| File | Change |
|------|--------|
| `src/components/projects/WorkspaceShell.tsx` | Wrap per-file upload in try/catch, collect errors, partial send on success |