"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronRight, History, RotateCcw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fetchJson, queryKeys, useCacheMutation } from "@/lib/query-client";

type SnapshotSummary = {
  buildStatus: string | null;
  buildId: string | null;
  createdAt: string;
  fileCount: number | null;
  id: string;
  kind: string;
  parentSnapshotId: string | null;
  restorable: boolean;
};

const KIND_LABEL: Record<string, string> = {
  edit: "Edit",
  initial: "Pembuatan",
  repair: "Perbaikan",
  restore: "Pemulihan",
};

const BUILD_STATUS_LABEL: Record<string, string> = {
  succeeded: "Berhasil",
  failed: "Gagal",
  not_started: "Belum",
  running: "Proses",
  cancelled: "Batal",
};

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  }).format(date);
}

export function WorkspaceHistoryButton({
  projectId,
  variant = "pill",
  onActivate,
}: {
  projectId: string;
  variant?: "pill" | "row";
  onActivate?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const isRow = variant === "row";
  return (
    <>
      <button
        type="button"
        onClick={() => {
          onActivate?.();
          setOpen(true);
        }}
        aria-label="Lihat riwayat versi"
        className={
          isRow
            ? "inline-flex h-11 w-full items-center gap-spacing-3 rounded-radius-md px-spacing-3 text-sm text-surface-warm-white/82 hover:bg-surface-warm-white/8"
            : "inline-flex min-h-9 items-center gap-spacing-3 rounded-radius-md border border-surface-warm-white/10 bg-surface-warm-white/5 px-spacing-5 text-xs font-[480] text-surface-warm-white/80 hover:bg-surface-warm-white/10 hover:text-surface-warm-white"
        }
      >
        <History
          className={
            isRow ? "size-4 shrink-0 text-surface-warm-white/64" : "size-4"
          }
        />
        <span className={isRow ? "flex-1 text-left" : "hidden sm:inline"}>
          Riwayat
        </span>
        {isRow ? (
          <ChevronRight className="size-4 text-surface-warm-white/40" />
        ) : null}
      </button>
      <WorkspaceHistoryDrawer
        projectId={projectId}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}

export function WorkspaceHistoryDrawer({
  projectId,
  open,
  onOpenChange,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    enabled: open,
    queryKey: queryKeys.projectSnapshots(projectId),
    queryFn: () =>
      fetchJson<{ snapshots: SnapshotSummary[] }>(
        `/api/projects/${projectId}/snapshots`,
      ),
  });

  const restoreMutation = useCacheMutation<{ snapshotId: string }, string>({
    errorMessage: "Gagal memulihkan riwayat.",
    invalidateKeys: [
      queryKeys.projectSnapshots(projectId),
      queryKeys.projectSource(projectId),
    ],
    mutationFn: async (snapshotId: string) => {
      const response = await fetch(
        `/api/projects/${projectId}/snapshots/${snapshotId}/restore`,
        { method: "POST" },
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          message?: string;
        };
        throw new Error(body.message ?? "Gagal memulihkan riwayat.");
      }
      return response.json() as Promise<{ snapshotId: string }>;
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Gagal memulihkan riwayat.",
      );
    },
    onSuccess: () => {
      toast.success("Riwayat dipulihkan sebagai versi baru.");
    },
  });

  const snapshots = data?.snapshots ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[80dvh] flex-col gap-spacing-7 overflow-hidden sm:max-w-lg">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-spacing-3">
            <History className="size-4" />
            Riwayat versi
          </DialogTitle>
          <DialogDescription>
            Setiap pembuatan dan edit membuat versi baru. Memulihkan membuat
            versi baru dari riwayat lama — versi saat ini tetap tersimpan.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
          {isLoading ? (
            <p className="text-body-small text-muted-foreground">
              Memuat riwayat...
            </p>
          ) : null}

          {error ? (
            <p className="text-body-small text-destructive" role="alert">
              Gagal memuat riwayat.
            </p>
          ) : null}

          {!isLoading && !error && snapshots.length === 0 ? (
            <p className="text-body-small text-muted-foreground">
              Belum ada riwayat tersimpan.
            </p>
          ) : null}

          <ol className="flex flex-col gap-spacing-2">
            {snapshots.map((snapshot) => {
              const label = KIND_LABEL[snapshot.kind] ?? snapshot.kind;
              const buildLabel = snapshot.buildStatus
                ? (BUILD_STATUS_LABEL[snapshot.buildStatus] ??
                  snapshot.buildStatus)
                : "Tanpa build";
              return (
                <li
                  key={snapshot.id}
                  className="flex items-center justify-between gap-spacing-4 rounded-radius-md border border-white/[0.08] bg-white/[0.03] px-spacing-6 py-spacing-5"
                >
                  <div className="flex min-w-0 flex-col gap-spacing-1">
                    <span className="text-body-small font-[480] text-surface-warm-white">
                      {label}
                      {snapshot.fileCount != null
                        ? ` · ${snapshot.fileCount} file`
                        : ""}
                    </span>
                    <span className="text-body-small text-surface-warm-white/55">
                      {formatDate(snapshot.createdAt)} · {buildLabel}
                    </span>
                    {!snapshot.restorable ? (
                      <span className="text-body-small text-red-400">
                        Sumber tidak tersimpan — tidak bisa dipulihkan.
                      </span>
                    ) : null}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-white/15 bg-transparent text-surface-warm-white/80 hover:bg-white/5 hover:text-surface-warm-white"
                    disabled={
                      !snapshot.restorable ||
                      restoringId === snapshot.id ||
                      restoreMutation.isPending
                    }
                    onClick={async () => {
                      setRestoringId(snapshot.id);
                      await restoreMutation.mutateAsync(snapshot.id);
                      setRestoringId(null);
                      onOpenChange(false);
                    }}
                  >
                    <RotateCcw className="size-4" />
                    Kembalikan
                  </Button>
                </li>
              );
            })}
          </ol>
        </div>
      </DialogContent>
    </Dialog>
  );
}
