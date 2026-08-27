"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Loader2, Trash2, UploadCloud, ZoomIn } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ImageLightbox } from "@/components/ui/image-lightbox";
import { type ProjectAssetItem } from "@/lib/projects/project-assets";
import { fetchJson } from "@/lib/query-client";
import { cn } from "@/lib/utils";

const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB

type MediaAssetsResponse = {
  assets: ProjectAssetItem[];
  count: number;
  maxBytes: number;
  maxCount: number;
  totalBytes: number;
};

export function WorkspaceMediaGallery({
  projectId,
  readOnly = false,
}: {
  projectId: string;
  readOnly?: boolean;
}) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [assetToDelete, setAssetToDelete] = useState<ProjectAssetItem | null>(
    null,
  );
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const { data, isLoading, error, refetch } = useQuery<MediaAssetsResponse>({
    queryKey: ["projects", projectId, "assets"],
    queryFn: () => fetchJson(`/api/projects/${projectId}/assets`),
    staleTime: 5000,
  });

  const deleteMutation = useMutation({
    mutationFn: async (assetId: string) => {
      const res = await fetch(
        `/api/projects/${projectId}/assets?assetId=${assetId}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Gagal menghapus foto.");
      }
      return res.json();
    },
    onSuccess: () => {
      setAssetToDelete(null);
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "assets"],
      });
    },
  });

  async function handleUploadFiles(files: FileList | File[]) {
    setUploadError(null);
    const validFiles: File[] = [];

    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) {
        setUploadError(
          `File "${file.name}" bukan gambar (hanya JPG, PNG, WEBP).`,
        );
        return;
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        setUploadError(`Ukuran file "${file.name}" melebihi 2 MB.`);
        return;
      }
      validFiles.push(file);
    }

    if (validFiles.length === 0) {
      return;
    }

    const currentCount = data?.count ?? 0;
    const maxCount = data?.maxCount ?? 10;
    if (currentCount + validFiles.length > maxCount) {
      setUploadError(
        `Maksimal ${maxCount} foto per proyek. Sisa slot: ${Math.max(0, maxCount - currentCount)}.`,
      );
      return;
    }

    setIsUploading(true);
    try {
      for (const file of validFiles) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("purpose", "business-image");

        const res = await fetch(`/api/projects/${projectId}/assets/upload`, {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || `Gagal mengunggah ${file.name}.`);
        }
      }

      await queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "assets"],
      });
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Gagal mengunggah foto.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      handleUploadFiles(e.target.files);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    if (readOnly || isUploading) {
      return;
    }
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleUploadFiles(e.dataTransfer.files);
    }
  }

  function formatBytes(bytes: number) {
    if (bytes < 1024) {
      return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  const assets = data?.assets ?? [];
  const count = data?.count ?? 0;
  const maxCount = data?.maxCount ?? 10;
  const totalBytes = data?.totalBytes ?? 0;
  const maxBytes = data?.maxBytes ?? 8 * 1024 * 1024;
  const percentUsed = Math.min(100, Math.round((totalBytes / maxBytes) * 100));

  const lightboxImages = assets.map((a) => ({
    src: a.mediaUrl,
    alt: `Foto Usaha ${a.id}`,
  }));

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto bg-background p-4 sm:p-6 lg:p-8">
      {/* Header Info & Actions */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Galeri Media Proyek
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Semua foto usaha yang tersimpan untuk website ini. Foto aktif
            otomatis terpasang pada tampilan.
          </p>
        </div>

        {!readOnly ? (
          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/png,image/jpeg,image/webp"
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              type="button"
              disabled={isUploading || count >= maxCount}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-foreground px-4 text-xs font-semibold text-background shadow-xs hover:bg-foreground/90 transition-all active:scale-95 disabled:pointer-events-none disabled:opacity-50 cursor-pointer"
            >
              {isUploading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ImagePlus className="size-4" />
              )}
              Upload Foto
            </button>
          </div>
        ) : null}
      </div>

      {/* Storage Quota Bar */}
      <div className="mb-6 rounded-xl border border-border/80 bg-card p-3.5 shadow-2xs">
        <div className="flex items-center justify-between text-xs font-medium text-foreground mb-2">
          <span>Kapasitas Penyimpanan</span>
          <span className="text-muted-foreground">
            {count} / {maxCount} Foto • {formatBytes(totalBytes)} /{" "}
            {formatBytes(maxBytes)}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full transition-all duration-300 rounded-full",
              percentUsed > 85 ? "bg-amber-500" : "bg-primary",
            )}
            style={{ width: `${Math.max(4, percentUsed)}%` }}
          />
        </div>
      </div>

      {uploadError ? (
        <div className="mb-4 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
          {uploadError}
        </div>
      ) : null}

      {/* Loading state */}
      {isLoading ? (
        <div className="grid flex-1 place-items-center py-20">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
            <p className="text-xs text-muted-foreground">
              Memuat daftar foto usaha...
            </p>
          </div>
        </div>
      ) : null}

      {/* Error state */}
      {error ? (
        <div className="grid flex-1 place-items-center py-20 text-center">
          <p className="text-xs text-destructive mb-2">
            Gagal memuat galeri media.
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="text-xs underline text-foreground hover:opacity-80"
          >
            Coba lagi
          </button>
        </div>
      ) : null}

      {/* Empty State / Dropzone */}
      {!isLoading && !error && assets.length === 0 ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          className={cn(
            "flex flex-1 flex-col items-center justify-center rounded-2xl border-2 border-dashed p-10 text-center transition-all",
            isDragOver
              ? "border-primary bg-primary/5"
              : "border-border bg-card/40 hover:bg-card/70",
          )}
        >
          <div className="grid size-14 place-items-center rounded-full bg-muted text-muted-foreground mb-4">
            <UploadCloud className="size-7" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">
            Belum ada foto usaha
          </h3>
          <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
            Unggah foto produk, tempat usaha, atau dokumentasi kerja asli agar
            website Anda tampil meyakinkan bagi calon pembeli.
          </p>

          {!readOnly ? (
            <button
              type="button"
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
              className="mt-5 inline-flex h-9 items-center gap-2 rounded-lg bg-foreground px-4 text-xs font-semibold text-background shadow-xs hover:bg-foreground/90 transition-all active:scale-95 cursor-pointer"
            >
              {isUploading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ImagePlus className="size-4" />
              )}
              Pilih Foto dari Perangkat
            </button>
          ) : null}
        </div>
      ) : null}

      {/* Grid of Media Assets */}
      {!isLoading && !error && assets.length > 0 ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          className={cn(
            "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 rounded-xl transition-all",
            isDragOver && "ring-2 ring-primary ring-offset-2",
          )}
        >
          {assets.map((asset, index) => {
            return (
              <div
                key={asset.id}
                className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xs transition-all hover:border-foreground/20 hover:shadow-xs"
              >
                {/* Thumbnail Preview */}
                <div
                  className="relative aspect-video w-full overflow-hidden bg-muted cursor-pointer"
                  onClick={() => setLightboxIndex(index)}
                >
                  <img
                    src={asset.mediaUrl}
                    alt={`Foto ${asset.id}`}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-103"
                  />

                  {/* Usage Badge Overlay */}
                  <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                    {asset.isUsed ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600/90 px-2.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-md shadow-2xs">
                        <span className="size-1.5 rounded-full bg-white animate-pulse" />
                        Terpasang di Website
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-black/60 px-2.5 py-0.5 text-[10px] font-medium text-white/90 backdrop-blur-md">
                        Belum Terpakai
                      </span>
                    )}
                  </div>

                  {/* Zoom Hover Indicator */}
                  <div className="absolute inset-0 grid place-items-center bg-black/30 opacity-0 backdrop-blur-[2px] transition-opacity group-hover:opacity-100">
                    <div className="grid size-9 place-items-center rounded-full bg-black/60 text-white shadow-md">
                      <ZoomIn className="size-4" />
                    </div>
                  </div>
                </div>

                {/* Card Meta & Actions */}
                <div className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="font-mono">
                      {formatBytes(asset.sizeBytes)}
                    </span>
                    <span>•</span>
                    <span>
                      {new Date(asset.createdAt).toLocaleDateString("id-ID")}
                    </span>
                  </div>

                  {!readOnly ? (
                    <button
                      type="button"
                      onClick={() => setAssetToDelete(asset)}
                      className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors cursor-pointer"
                      title="Hapus Foto"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={Boolean(assetToDelete)}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) {
            setAssetToDelete(null);
          }
        }}
      >
        <DialogContent showCloseButton={!deleteMutation.isPending}>
          <DialogHeader>
            <DialogTitle>Hapus foto ini?</DialogTitle>
            <DialogDescription>
              Foto ini akan dihapus permanen dari proyek dan tidak bisa
              dikembalikan.
            </DialogDescription>
          </DialogHeader>

          {assetToDelete?.isUsed ? (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400">
              Perhatian: Foto ini sedang aktif digunakan di tampilan website.
            </div>
          ) : null}

          <div className="flex justify-end gap-spacing-3 mt-4">
            <Button
              type="button"
              variant="outline"
              disabled={deleteMutation.isPending}
              onClick={() => setAssetToDelete(null)}
            >
              Batal
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (assetToDelete) {
                  deleteMutation.mutate(assetToDelete.id);
                }
              }}
            >
              {deleteMutation.isPending ? "Menghapus..." : "Hapus Foto"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Lightbox Component */}
      {lightboxIndex !== null ? (
        <ImageLightbox
          open={lightboxIndex !== null}
          onOpenChange={(open) => {
            if (!open) {
              setLightboxIndex(null);
            }
          }}
          images={lightboxImages}
          initialIndex={lightboxIndex}
        />
      ) : null}
    </div>
  );
}
