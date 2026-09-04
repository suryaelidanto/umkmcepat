"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function WorkspaceRenameContent({
  draftTitle,
  onOpenChange,
  onSave,
  setDraftTitle,
}: {
  draftTitle: string;
  onOpenChange: (open: boolean) => void;
  onSave: () => void;
  setDraftTitle: (title: string) => void;
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Ubah nama website</DialogTitle>
        <DialogDescription>
          Beri nama yang mudah dikenali untuk website usahamu.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-3 py-2">
        <input
          autoFocus
          className="h-11 w-full rounded-xl border border-border/40 bg-muted/20 px-3.5 text-sm font-semibold text-foreground outline-none focus:border-foreground/40"
          onChange={(e) => setDraftTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              onSave();
              onOpenChange(false);
            }
          }}
          placeholder="Nama website..."
          type="text"
          value={draftTitle}
        />
        <div className="flex justify-end gap-2 pt-1">
          <button
            className="h-9 cursor-pointer rounded-lg px-3.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted"
            onClick={() => onOpenChange(false)}
            type="button"
          >
            Batal
          </button>
          <button
            className="h-9 cursor-pointer rounded-lg bg-foreground px-4 text-xs font-semibold text-background transition-colors hover:bg-foreground/90"
            onClick={() => {
              onSave();
              onOpenChange(false);
            }}
            type="button"
          >
            Simpan
          </button>
        </div>
      </div>
    </>
  );
}

export function WorkspaceRenameModal({
  draftTitle,
  onOpenChange,
  onSave,
  open,
  setDraftTitle,
}: {
  draftTitle: string;
  onOpenChange: (open: boolean) => void;
  onSave: () => void;
  open: boolean;
  setDraftTitle: (title: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <WorkspaceRenameContent
          draftTitle={draftTitle}
          onOpenChange={onOpenChange}
          onSave={onSave}
          setDraftTitle={setDraftTitle}
        />
      </DialogContent>
    </Dialog>
  );
}
