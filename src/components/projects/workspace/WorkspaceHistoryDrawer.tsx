"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Globe,
  History,
  Layout,
  ListChecks,
} from "lucide-react";
import { useEffect, useState } from "react";
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
  changes?: string[];
  createdAt: string;
  fileCount: number | null;
  id: string;
  kind: string;
  parentSnapshotId: string | null;
  published: boolean;
  restorable: boolean;
  summary?: string | null;
};

const KIND_LABEL: Record<string, string> = {
  edit: "Pembaruan Website",
  initial: "Pembuatan Awal",
  repair: "Pembaruan Website",
  restore: "Versi Dipilih",
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
  activeSnapshotId,
  onActivate,
  onCheckout,
}: {
  projectId: string;
  variant?: "pill" | "row";
  activeSnapshotId?: string | null;
  onActivate?: () => void;
  onCheckout?: () => void;
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
        activeSnapshotId={activeSnapshotId}
        onCheckout={onCheckout}
      />
    </>
  );
}

export function WorkspaceHistoryDrawer({
  projectId,
  open,
  onOpenChange,
  activeSnapshotId,
  onCheckout,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeSnapshotId?: string | null;
  onCheckout?: () => void;
}) {
  const [checkingOutId, setCheckingOutId] = useState<string | null>(null);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(
    activeSnapshotId ?? null,
  );
  const [expandedDetails, setExpandedDetails] = useState<
    Record<string, boolean>
  >({});

  const { data, isLoading, error } = useQuery({
    enabled: open,
    queryKey: queryKeys.projectSnapshots(projectId),
    queryFn: () =>
      fetchJson<{ snapshots: SnapshotSummary[] }>(
        `/api/projects/${projectId}/snapshots`,
      ),
  });

  const snapshots = data?.snapshots ?? [];

  useEffect(() => {
    if (activeSnapshotId) {
      setSelectedSnapshotId(activeSnapshotId);
    } else if (snapshots.length > 0 && !selectedSnapshotId) {
      setSelectedSnapshotId(snapshots[0]?.id ?? null);
    }
  }, [activeSnapshotId, snapshots, selectedSnapshotId]);

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
    onSuccess: (_, snapshotId) => {
      setSelectedSnapshotId(snapshotId);
      toast.success("Versi ini aktif dan sedang dimuat di Preview.");
      onCheckout?.();
    },
  });

  const currentActiveId = selectedSnapshotId ?? snapshots[0]?.id;

  const toggleDetails = (id: string) => {
    setExpandedDetails((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85dvh] flex-col gap-spacing-6 overflow-hidden sm:max-w-2xl">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-spacing-3 text-lg font-bold">
            <History className="size-5 text-primary" />
            Riwayat Versi Website
          </DialogTitle>
          <DialogDescription className="text-sm">
            Pilih versi yang ingin ditampilkan di Preview. Kamu bisa melanjutkan
            edit atau menerbitkan versi mana pun yang kamu pilih.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1 [scrollbar-width:thin]">
          {isLoading ? (
            <p className="py-10 text-center text-body-small text-muted-foreground">
              Memuat riwayat...
            </p>
          ) : null}

          {error ? (
            <p
              className="py-10 text-center text-body-small text-destructive"
              role="alert"
            >
              Gagal memuat riwayat.
            </p>
          ) : null}

          {!isLoading && !error && snapshots.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
              <Layout className="mb-2 size-10 opacity-30" />
              <p className="text-sm font-medium">
                Belum ada versi website yang berhasil dibuat.
              </p>
            </div>
          ) : null}

          <ol className="flex flex-col gap-4">
            {snapshots.map((snapshot) => {
              const label = KIND_LABEL[snapshot.kind] ?? snapshot.kind;
              const isActive = snapshot.id === currentActiveId;
              const changes = snapshot.changes ?? [];
              const isExpanded = Boolean(expandedDetails[snapshot.id]);

              return (
                <li
                  key={snapshot.id}
                  className="group relative flex flex-col rounded-2xl border border-border bg-card p-4 transition-all hover:border-foreground/20 hover:bg-muted/40 dark:border-white/[0.08] dark:bg-[#1a1a18] dark:hover:bg-[#222220]"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-4">
                      {/* Large Crisp Landscape Thumbnail (16:10) */}
                      <div className="relative aspect-[16/10] w-28 shrink-0 overflow-hidden rounded-xl border border-border/80 bg-muted/40 shadow-xs sm:w-36">
                        <img
                          src={`/api/projects/${projectId}/snapshots/${snapshot.id}/thumbnail`}
                          alt={`Thumbnail ${label}`}
                          className="h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-105"
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
                      <div className="flex min-w-0 flex-col gap-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-bold tracking-tight text-foreground dark:text-surface-warm-white">
                            {label}
                          </span>
                          {snapshot.fileCount != null ? (
                            <span className="text-xs text-muted-foreground">
                              ({snapshot.fileCount} file)
                            </span>
                          ) : null}
                          {snapshot.published ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold tracking-wide text-emerald-600 dark:text-emerald-400">
                              <Globe className="size-3" />
                              Produksi
                            </span>
                          ) : null}
                        </div>

                        <span className="text-xs text-muted-foreground dark:text-surface-warm-white/55">
                          Dibuat {formatDate(snapshot.createdAt)}
                        </span>
                      </div>
                    </div>

                    {/* Action Button */}
                    <div className="flex shrink-0 items-center justify-end sm:pl-2">
                      {isActive ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled
                          className="h-9 px-4 text-xs font-semibold text-foreground/75 opacity-90"
                        >
                          <Check className="mr-1.5 size-4 text-emerald-600 dark:text-emerald-400" />
                          Aktif
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="default"
                          className="h-9 cursor-pointer px-4 text-xs font-semibold shadow-xs transition-transform active:scale-95"
                          disabled={
                            !snapshot.restorable ||
                            checkingOutId === snapshot.id ||
                            checkoutMutation.isPending
                          }
                          onClick={async () => {
                            setCheckingOutId(snapshot.id);
                            await checkoutMutation.mutateAsync(snapshot.id);
                            setCheckingOutId(null);
                          }}
                        >
                          <Check className="mr-1.5 size-4" />
                          Pilih Versi Ini
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Changelog & AI Details Accordion */}
                  {changes.length > 0 ? (
                    <div className="mt-3 border-t border-border/60 pt-2.5">
                      <button
                        type="button"
                        onClick={() => toggleDetails(snapshot.id)}
                        className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <ListChecks className="size-3.5 text-primary" />
                        <span>Rincian perubahan ({changes.length})</span>
                        {isExpanded ? (
                          <ChevronUp className="size-3.5" />
                        ) : (
                          <ChevronDown className="size-3.5" />
                        )}
                      </button>

                      {isExpanded ? (
                        <ul className="mt-2.5 space-y-1.5 rounded-xl bg-muted/40 p-3 text-xs leading-relaxed text-foreground/85 dark:bg-black/20 dark:text-surface-warm-white/80">
                          {changes.map((item, idx) => (
                            <li key={idx} className="flex items-start gap-2">
                              <span className="mt-1 size-1.5 shrink-0 rounded-full bg-primary" />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </div>
      </DialogContent>
    </Dialog>
  );
}
