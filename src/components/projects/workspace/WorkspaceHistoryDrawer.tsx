"use client";

import { useQuery } from "@tanstack/react-query";
import { Check, ChevronRight, Globe, History, Layout } from "lucide-react";
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
  published: boolean;
  restorable: boolean;
};

const KIND_LABEL: Record<string, string> = {
  edit: "Edit",
  initial: "Pembuatan",
  repair: "Perbaikan",
  restore: "Versi Sebelumnya",
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
            ? "inline-flex h-11 w-full items-center gap-spacing-3 rounded-radius-md px-spacing-3 text-sm text-[#1c1c1c] hover:bg-black/5 dark:text-surface-warm-white/82 dark:hover:bg-surface-warm-white/8"
            : "inline-flex h-9 items-center gap-1.5 rounded-lg border border-black/10 bg-transparent px-2.5 text-xs font-medium text-[#5f5f5d] transition-colors hover:border-black/20 hover:bg-black/[0.04] hover:text-[#1c1c1c] dark:border-surface-warm-white/10 dark:bg-transparent dark:text-surface-warm-white/70 dark:hover:bg-surface-warm-white/8 dark:hover:text-surface-warm-white"
        }
      >
        <History
          className={
            isRow
              ? "size-4 shrink-0 text-[#5f5f5d] dark:text-surface-warm-white/64"
              : "size-4"
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
  const [checkingOutId, setCheckingOutId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    enabled: open,
    queryKey: queryKeys.projectSnapshots(projectId),
    queryFn: () =>
      fetchJson<{ snapshots: SnapshotSummary[] }>(
        `/api/projects/${projectId}/snapshots`,
      ),
  });

  const checkoutMutation = useCacheMutation<{ snapshotId: string }, string>({
    errorMessage: "Gagal memilih versi ini.",
    invalidateKeys: [
      queryKeys.projectSnapshots(projectId),
      queryKeys.projectSource(projectId),
      queryKeys.projectRuntime(projectId),
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
        throw new Error(body.message ?? "Gagal memilih versi ini.");
      }
      return response.json() as Promise<{ snapshotId: string }>;
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Gagal memilih versi ini.",
      );
    },
    onSuccess: () => {
      toast.success("Versi ini aktif dan siap dilihat di Preview.");
    },
  });

  const snapshots = data?.snapshots ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85dvh] flex-col gap-spacing-6 overflow-hidden sm:max-w-xl">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-spacing-3">
            <History className="size-4" />
            Riwayat versi
          </DialogTitle>
          <DialogDescription>
            Pilih versi yang ingin dilihat di Preview untuk melanjutkan edit
            atau menerbitkannya.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
          {isLoading ? (
            <p className="py-6 text-center text-body-small text-muted-foreground">
              Memuat riwayat...
            </p>
          ) : null}

          {error ? (
            <p
              className="py-6 text-center text-body-small text-destructive"
              role="alert"
            >
              Gagal memuat riwayat.
            </p>
          ) : null}

          {!isLoading && !error && snapshots.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
              <Layout className="mb-2 size-8 opacity-40" />
              <p className="text-sm">
                Belum ada versi website yang berhasil dibuat.
              </p>
            </div>
          ) : null}

          <ol className="flex flex-col gap-3">
            {snapshots.map((snapshot) => {
              const label = KIND_LABEL[snapshot.kind] ?? snapshot.kind;

              return (
                <li
                  key={snapshot.id}
                  className="flex items-center justify-between gap-4 rounded-xl border border-border bg-muted/30 p-3.5 transition-colors hover:border-foreground/20 hover:bg-muted/50 dark:border-white/[0.08] dark:bg-white/[0.02]"
                >
                  <div className="flex min-w-0 items-center gap-3.5">
                    {/* Visual Thumbnail */}
                    <div className="relative size-14 shrink-0 overflow-hidden rounded-lg border border-border bg-card shadow-2xs">
                      <img
                        src={`/api/projects/${projectId}/snapshots/${snapshot.id}/thumbnail`}
                        alt={`Thumbnail ${label}`}
                        className="h-full w-full object-cover object-top"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                          e.currentTarget.parentElement?.classList.add(
                            "flex",
                            "items-center",
                            "justify-center",
                          );
                        }}
                      />
                    </div>

                    {/* Metadata */}
                    <div className="flex min-w-0 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-semibold text-foreground dark:text-surface-warm-white">
                          {label}
                          {snapshot.fileCount != null
                            ? ` · ${snapshot.fileCount} file`
                            : ""}
                        </span>
                        {snapshot.published ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                            <Globe className="size-2.5" />
                            Produksi
                          </span>
                        ) : null}
                      </div>

                      <span className="text-[11px] text-muted-foreground dark:text-surface-warm-white/55">
                        {formatDate(snapshot.createdAt)}
                      </span>
                    </div>
                  </div>

                  {/* Action */}
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="default"
                      className="cursor-pointer font-medium text-xs shadow-2xs"
                      disabled={
                        !snapshot.restorable ||
                        checkingOutId === snapshot.id ||
                        checkoutMutation.isPending
                      }
                      onClick={async () => {
                        setCheckingOutId(snapshot.id);
                        await checkoutMutation.mutateAsync(snapshot.id);
                        setCheckingOutId(null);
                        onOpenChange(false);
                      }}
                    >
                      <Check className="size-3.5" />
                      Pilih Versi Ini
                    </Button>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </DialogContent>
    </Dialog>
  );
}
