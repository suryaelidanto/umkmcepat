"use client";

import { ImagePlus, RefreshCw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { type EditLayout } from "@/lib/projects/direct-edit";
import { type VisualAnnotationDraft } from "@/lib/projects/visual-annotations";
import {
  previewReadyState,
  PREVIEW_STUCK_MAX_ATTEMPTS,
} from "@/lib/projects/workspace-sync";

export type PreviewEditTarget = Omit<VisualAnnotationDraft, "comment" | "id">;

export function GeneratedPreviewFrame({
  annotationMarkers = [],
  directEditActive = false,
  directEditFlagEnabled = true,
  directEditIntents = [],
  editLayout = null,
  editLayoutSignal = 0,
  onAnnotationTarget,
  onDirectEditAction,
  onLoad,
  onRecover,
  onStuck,
  pendingAnnotation,
  projectId,
  reloadKey,
  viewport,
}: {
  annotationMarkers?: Array<{
    id: string;
    target: {
      boundingBox: { height: number; width: number; x: number; y: number };
    };
  }>;
  directEditActive?: boolean;
  directEditFlagEnabled?: boolean;
  directEditIntents?: Array<{
    action: "remove" | "move-up" | "move-down";
    target: { selectorPath: string };
  }>;
  editLayout?: EditLayout | null;
  editLayoutSignal?: number;
  onAnnotationTarget?: (target: unknown) => void;
  onDirectEditAction?: (
    action: "remove" | "move-up" | "move-down",
    target: PreviewEditTarget,
  ) => void;
  onLoad?: () => void;
  onRecover?: () => void;
  onStuck?: () => void;
  pendingAnnotation?: {
    comment: string;
    onCancel: () => void;
    onChange: (value: string) => void;
    onReplaceImage?: () => void;
    onSave: () => void;
    target: Omit<VisualAnnotationDraft, "comment" | "id">;
  } | null;
  projectId: string;
  reloadKey?: number;
  viewport: "desktop" | "mobile";
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [ready, setReady] = useState(false);
  const [hoverTarget, setHoverTarget] = useState<PreviewEditTarget | null>(
    null,
  );
  const [selectedTarget, setSelectedTarget] =
    useState<PreviewEditTarget | null>(null);
  // Consecutive 12s silent-recovery timeouts that fired without the generated app
  const [silentRecoveries, setSilentRecoveries] = useState(0);

  useEffect(() => {
    setReady(false);
    setSilentRecoveries(0);

    // Cold starts can exceed a single frame load. Retry quietly up to the
    const recovery = window.setTimeout(() => {
      setSilentRecoveries((current) => {
        const next = current + 1;
        if (next < PREVIEW_STUCK_MAX_ATTEMPTS) {
          onRecover?.();
        }
        return next;
      });
    }, 12_000);

    function handleMessage(event: MessageEvent) {
      // Sandboxed WITHOUT allow-same-origin (deliberate — see security
      const readyTypes = new Set([
        "umkmcepat-preview-ready",
        "generated-app-preview-ready",
      ]);
      const isReadySignal =
        event.data &&
        typeof event.data === "object" &&
        readyTypes.has(event.data.type);
      if (isReadySignal) {
        setReady(true);
        setSilentRecoveries(0);
        window.clearTimeout(recovery);
        return;
      }

      if (event.data?.type === "umkmcepat-annotation-target") {
        onAnnotationTarget?.(event.data.payload);
        return;
      }

      if (event.data?.type === "umkmcepat-edit-hover") {
        setHoverTarget(event.data.payload ?? null);
        return;
      }

      if (event.data?.type === "umkmcepat-edit-target") {
        setSelectedTarget(event.data.payload ?? null);
        onAnnotationTarget?.(event.data.payload);
        return;
      }

      if (
        event.data?.type !== "umkmcepat-preview-ready" &&
        event.data?.type !== "generated-app-preview-ready"
      ) {
        return;
      }
    }

    window.addEventListener("message", handleMessage);

    return () => {
      window.clearTimeout(recovery);
      window.removeEventListener("message", handleMessage);
    };
  }, [onAnnotationTarget, onRecover, projectId, reloadKey]);

  useEffect(() => {
    if (!directEditActive) {
      setHoverTarget(null);
      setSelectedTarget(null);
    }
  }, [directEditActive]);

  const previewState = previewReadyState({
    readyReached: ready,
    silentRecoveries,
  });

  // Surface the terminal stuck state so the parent can refresh runtime state;
  useEffect(() => {
    if (previewState === "stuck") {
      onStuck?.();
    }
  }, [onStuck, previewState]);

  useEffect(() => {
    iframeRef.current?.contentWindow?.postMessage(
      { active: directEditActive, type: "umkmcepat-edit-mode" },
      "*",
    );
  }, [directEditActive, ready, reloadKey]);

  useEffect(() => {
    if (editLayoutSignal > 0) {
      iframeRef.current?.contentWindow?.postMessage(
        { layout: editLayout, type: "umkmcepat-edit-layout" },
        "*",
      );
    }
  }, [editLayoutSignal, editLayout, ready, reloadKey]);

  useEffect(() => {
    iframeRef.current?.contentWindow?.postMessage(
      {
        annotations: annotationMarkers.map((annotation, index) => ({
          ...annotation,
          index: index + 1,
        })),
        type: "umkmcepat-annotation-markers",
      },
      "*",
    );
  }, [annotationMarkers, ready, reloadKey]);

  return (
    <div className="relative flex h-full min-h-0 justify-center overflow-hidden bg-background">
      <div
        className={`${viewport === "mobile" ? "max-w-[min(100%,430px)]" : "max-w-none"} relative h-full w-full`}
      >
        <iframe
          ref={iframeRef}
          key={reloadKey}
          title="Tampilan website"
          src={`/api/projects/${projectId}/preview/?v=${reloadKey ?? 0}`}
          onLoad={() => {
            // iframe load fires after subresources finish. By then the bundle
            onLoad?.();
            window.setTimeout(() => setReady(true), 0);
          }}
          sandbox="allow-scripts allow-forms"
          className="h-full w-full border-0 bg-white"
        />
        {pendingAnnotation ? (
          <PreviewAnnotationPopover
            comment={pendingAnnotation.comment}
            onCancel={pendingAnnotation.onCancel}
            onChange={pendingAnnotation.onChange}
            onReplaceImage={pendingAnnotation.onReplaceImage}
            onSave={pendingAnnotation.onSave}
            target={pendingAnnotation.target}
          />
        ) : null}
        {directEditFlagEnabled && directEditActive ? (
          <PreviewEditOverlay
            hoverTarget={hoverTarget}
            intents={directEditIntents}
            onComment={(target) => onAnnotationTarget?.(target)}
            onDirectEditAction={(action, target) => {
              iframeRef.current?.contentWindow?.postMessage(
                { action, type: "umkmcepat-edit-action" },
                "*",
              );
              onDirectEditAction?.(action, target);
            }}
            selectedTarget={selectedTarget}
          />
        ) : null}
      </div>
      {previewState === "stuck" ? (
        <div className="absolute inset-0">
          <PreviewIssueState
            detail="Tampilan belum bisa dimuat otomatis. Mungkin server preview sedang dimatikan atau website belum sempat selesai dibuat. Coba muat ulang tampilan, atau buat ulang website kalau masih gagal."
            onRecover={onRecover}
            title="Tampilan tidak bisa dimuat"
          />
        </div>
      ) : !ready ? (
        <div className="absolute inset-0 grid place-items-center bg-background">
          <div className="flex flex-col items-center gap-spacing-4 text-center">
            <div className="size-9 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
            <div>
              <p className="text-sm font-medium text-foreground">
                Menyiapkan tampilan website...
              </p>
              <p className="mt-spacing-1 text-xs text-muted-foreground">
                Preview akan muncul setelah website selesai render.
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function PreviewEditOverlay({
  hoverTarget,
  intents,
  onComment,
  onDirectEditAction,
  selectedTarget,
}: {
  hoverTarget: PreviewEditTarget | null;
  intents: Array<{
    action: "remove" | "move-up" | "move-down";
    target: { selectorPath: string };
  }>;
  onComment: (target: PreviewEditTarget) => void;
  onDirectEditAction?: (
    action: "remove" | "move-up" | "move-down",
    target: PreviewEditTarget,
  ) => void;
  selectedTarget: PreviewEditTarget | null;
}) {
  const visibleTarget = selectedTarget ?? hoverTarget;
  const rect = visibleTarget?.target.boundingBox;
  const chipTop = Math.max(8, (rect?.y ?? 0) - 44);
  const selectedIntentCount = selectedTarget
    ? intents.filter(
        (intent) =>
          intent.target.selectorPath === selectedTarget.target.selectorPath,
      ).length
    : 0;

  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      {rect ? (
        <div
          className="absolute rounded-radius-lg border-2 border-[#0d9488] bg-[#0d9488]/10"
          style={{
            height: rect.height,
            left: rect.x,
            top: rect.y,
            width: rect.width,
          }}
        />
      ) : null}
      {selectedTarget && rect ? (
        <div
          className="pointer-events-auto absolute flex max-w-[calc(100%-16px)] flex-wrap items-center gap-spacing-1 rounded-radius-lg bg-[#0d9488] p-spacing-1 text-xs font-semibold text-white shadow-[0_12px_36px_rgba(0,0,0,0.28)]"
          style={{ left: Math.max(8, rect.x), top: chipTop }}
        >
          <button
            type="button"
            onClick={() => onComment(selectedTarget)}
            className="rounded-radius-md px-spacing-2 py-spacing-1 hover:bg-white/18"
          >
            Komentar
          </button>
          <button
            type="button"
            onClick={() => onDirectEditAction?.("move-up", selectedTarget)}
            className="rounded-radius-md px-spacing-2 py-spacing-1 hover:bg-white/18"
          >
            Naik
          </button>
          <button
            type="button"
            onClick={() => onDirectEditAction?.("move-down", selectedTarget)}
            className="rounded-radius-md px-spacing-2 py-spacing-1 hover:bg-white/18"
          >
            Turun
          </button>
          <button
            type="button"
            onClick={() => onDirectEditAction?.("remove", selectedTarget)}
            className="rounded-radius-md px-spacing-2 py-spacing-1 hover:bg-white/18"
          >
            Hapus
          </button>
        </div>
      ) : null}
      {selectedTarget && selectedIntentCount ? (
        <div
          className="absolute rounded-radius-md border border-[#0d9488]/70 bg-[#0d9488] px-spacing-2 py-spacing-1 text-[11px] font-semibold text-white shadow-[0_8px_24px_rgba(0,0,0,0.24)]"
          style={{
            left: Math.max(8, rect?.x ?? 8),
            top: (rect?.y ?? 0) + (rect?.height ?? 0) + 8,
          }}
        >
          {selectedIntentCount} perubahan siap disimpan
        </div>
      ) : null}
      <div className="absolute bottom-spacing-4 left-1/2 w-[min(32rem,calc(100%-24px))] -translate-x-1/2 rounded-radius-xl border border-white/16 bg-[#171715]/92 px-spacing-4 py-spacing-3 text-center text-xs font-semibold leading-5 text-white shadow-[0_18px_60px_rgba(0,0,0,0.34)]">
        {intents.length
          ? `${intents.length} perubahan siap disimpan. Klik Simpan untuk menerapkan.`
          : "Arahkan kursor untuk memilih bagian. Klik untuk mengunci pilihan, lalu beri komentar atau tandai perubahan."}
      </div>
    </div>
  );
}

function PreviewAnnotationPopover({
  comment,
  onCancel,
  onChange,
  onReplaceImage,
  onSave,
  target,
}: {
  comment: string;
  onCancel: () => void;
  onChange: (value: string) => void;
  onReplaceImage?: () => void;
  onSave: () => void;
  target: Omit<VisualAnnotationDraft, "comment" | "id">;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const position = getAnnotationPopoverPosition(target.target.boundingBox);

  useEffect(() => {
    textareaRef.current?.focus();
  }, [target]);

  return (
    <div
      role="dialog"
      aria-label={`Komentar untuk ${target.label}`}
      className="absolute z-40 w-[min(22rem,calc(100%-1.5rem))] rounded-[18px] border border-surface-warm-white/14 bg-[#1b1b19] p-spacing-4 text-surface-warm-white shadow-[0_18px_60px_rgba(0,0,0,0.42)]"
      style={position}
    >
      <div className="flex items-start justify-between gap-spacing-4">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-[#d6f0ff]">
            {target.label}
          </p>
          {target.selectedText ? (
            <p className="mt-spacing-1 line-clamp-2 text-xs leading-5 text-surface-warm-white/50">
              Teks dipilih: {target.selectedText}
            </p>
          ) : null}
          {target.target.tag === "img" && target.target.src ? (
            <div className="mt-spacing-3 flex items-center gap-2">
              <button
                type="button"
                onClick={onReplaceImage}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-surface-warm-white px-3 text-xs font-semibold text-foreground-primary shadow-xs hover:bg-surface-warm-white/90 active:scale-95 transition-all cursor-pointer"
              >
                <ImagePlus className="size-3.5" />
                <span>Upload Foto Pengganti</span>
              </button>
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="grid size-9 shrink-0 place-items-center rounded-full text-surface-warm-white/52 hover:bg-surface-warm-white/8 hover:text-surface-warm-white"
          aria-label="Batalkan komentar"
        >
          <X className="size-4" />
        </button>
      </div>
      <textarea
        ref={textareaRef}
        rows={3}
        maxLength={1000}
        value={comment}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }

          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            onSave();
          }
        }}
        placeholder="Apa yang ingin kamu ubah di bagian ini?"
        className="mt-spacing-3 w-full resize-none rounded-[14px] border border-surface-warm-white/10 bg-[#111110] px-spacing-4 py-spacing-3 text-sm leading-6 text-surface-warm-white outline-none placeholder:text-surface-warm-white/38 focus:border-surface-warm-white/30"
      />
      <div className="mt-spacing-3 flex items-center justify-between gap-spacing-4">
        <span className="text-xs text-surface-warm-white/38">
          Ctrl/⌘ + Enter
        </span>
        <Button
          type="button"
          disabled={!comment.trim()}
          onClick={onSave}
          className="h-9 rounded-[12px] bg-surface-warm-white px-spacing-4 text-xs text-foreground-primary hover:bg-surface-warm-white/86 disabled:opacity-45"
        >
          Tambah komentar
        </Button>
      </div>
    </div>
  );
}

function getAnnotationPopoverPosition(
  box: VisualAnnotationDraft["target"]["boundingBox"],
) {
  const horizontal =
    box.x > 420 ? { right: 12 } : { left: Math.max(12, box.x) };
  const shouldOpenAbove = box.y > 360;

  return shouldOpenAbove
    ? {
        ...horizontal,
        bottom: `calc(100% - ${Math.max(12, box.y - 10)}px)`,
      }
    : { ...horizontal, top: Math.max(12, box.y + box.height + 10) };
}

export function PreviewIssueState({
  detail,
  onRecover,
  onRebuild,
  title,
}: {
  detail: string;
  onRecover?: () => void;
  onRebuild?: () => void;
  title: string;
}) {
  return (
    <div className="grid min-h-full place-items-center bg-muted/20 p-spacing-10 text-center">
      <div className="max-w-lg rounded-[24px] border border-border bg-card px-spacing-7 py-spacing-7 shadow-sm">
        <div className="mx-auto grid size-11 place-items-center rounded-full border border-destructive/30 bg-destructive/10 text-destructive">
          <RefreshCw className="size-5" aria-hidden="true" />
        </div>
        <h2 className="mt-spacing-5 text-2xl font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        <p className="mx-auto mt-spacing-3 max-w-md text-sm leading-6 text-muted-foreground">
          {detail}
        </p>
        {onRecover || onRebuild ? (
          <div className="mt-spacing-5 flex flex-wrap justify-center gap-spacing-3">
            {onRecover ? (
              <Button type="button" onClick={onRecover}>
                Muat ulang tampilan
              </Button>
            ) : null}
            {onRebuild ? (
              <Button type="button" variant="outline" onClick={onRebuild}>
                Buat ulang website
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
