"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { BuildProgressStep } from "@/components/projects/workspace/WorkspacePrimitives";
import type { UIMessage } from "ai";

import {
  appendBuildProgressStep,
  completeBuildProgressSteps,
} from "@/lib/projects/build-progress-steps";
import {
  createVisualAnnotationEditInstruction,
  createVisualAnnotationId,
  createVisualAnnotationSummary,
  type VisualAnnotationDraft,
} from "@/lib/projects/visual-annotations";

export type UseWorkspaceAnnotationsOptions = {
  isProcessing: boolean;
  onAppendBuildProgressStep?: (
    updater: (current: BuildProgressStep[]) => BuildProgressStep[],
  ) => void;
  onBuildStatusChange?: (status: string) => void;
  onCompleteBuildProgress?: () => void;
  onDirectEditModeChange?: (mode: boolean) => void;
  onEnergyInvalidate?: () => void;
  onSetBuildStartedAt?: (timestamp: number) => void;
  onUserMessageAdded?: (message: UIMessage) => void;
  projectId: string;
  readOnly?: boolean;
};

export function useWorkspaceAnnotations({
  isProcessing,
  onAppendBuildProgressStep,
  onBuildStatusChange,
  onCompleteBuildProgress,
  onDirectEditModeChange,
  onEnergyInvalidate,
  onSetBuildStartedAt,
  onUserMessageAdded,
  projectId,
  readOnly = false,
}: UseWorkspaceAnnotationsOptions) {
  const [annotations, setAnnotations] = useState<VisualAnnotationDraft[]>([]);
  const [pendingAnnotationTarget, setPendingAnnotationTarget] = useState<Omit<
    VisualAnnotationDraft,
    "comment" | "id"
  > | null>(null);
  const [pendingAnnotationComment, setPendingAnnotationComment] = useState("");
  const [annotationInstruction, setAnnotationInstruction] = useState("");
  const [isEditingPreview, setIsEditingPreview] = useState(false);

  const visualAnnotationStorageKey = `umkmcepat:visual-comments:${projectId}`;
  const visualAnnotationsLoadedRef = useRef(false);
  const visualEditInFlightRef = useRef(false);
  const pendingVisualRevisionRef = useRef(false);

  // Load visual annotations from server on mount
  useEffect(() => {
    let cancelled = false;

    async function loadVisualAnnotations() {
      const response = await fetch(
        `/api/projects/${projectId}/visual-annotations`,
      ).catch(() => null);
      if (!response?.ok || cancelled) {
        return;
      }
      const body = (await response.json().catch(() => null)) as {
        annotations?: VisualAnnotationDraft[];
      } | null;
      if (Array.isArray(body?.annotations)) {
        setAnnotations(body.annotations);
      }
      visualAnnotationsLoadedRef.current = true;
    }

    void loadVisualAnnotations();

    return () => {
      cancelled = true;
    };
  }, [projectId, readOnly]);

  // Persist visual annotations to server with debounce
  useEffect(() => {
    if (readOnly || !visualAnnotationsLoadedRef.current) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void fetch(`/api/projects/${projectId}/visual-annotations`, {
        body: JSON.stringify({ annotations }),
        headers: { "Content-Type": "application/json" },
        method: "PUT",
      });
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [annotations, projectId, readOnly]);

  // Read local storage draft on mount
  useEffect(() => {
    if (readOnly) {
      return;
    }

    const raw = window.localStorage.getItem(visualAnnotationStorageKey);
    if (!raw) {
      return;
    }

    try {
      const draft = JSON.parse(raw) as {
        annotations?: VisualAnnotationDraft[];
        instruction?: string;
        pendingRevision?: boolean;
      };

      if (Array.isArray(draft.annotations)) {
        setAnnotations(draft.annotations);
      }

      if (typeof draft.instruction === "string") {
        setAnnotationInstruction(draft.instruction);
      }

      if (draft.pendingRevision) {
        pendingVisualRevisionRef.current = true;
      }
    } catch {
      window.localStorage.removeItem(visualAnnotationStorageKey);
    }
  }, [readOnly, visualAnnotationStorageKey]);

  const handleAnnotationTarget = useCallback((target: unknown) => {
    if (!target || typeof target !== "object") {
      return;
    }

    const item = target as Partial<
      Omit<VisualAnnotationDraft, "comment" | "id">
    >;

    if (!item.label || !item.target?.boundingBox) {
      return;
    }

    setPendingAnnotationTarget({
      label: String(item.label),
      selectedText:
        typeof item.selectedText === "string" ? item.selectedText : undefined,
      target: item.target,
    });
    setPendingAnnotationComment("");
  }, []);

  const addPendingAnnotation = useCallback(() => {
    const comment = pendingAnnotationComment.trim();

    if (!pendingAnnotationTarget || !comment) {
      return;
    }

    setAnnotations((current) =>
      current.length >= 20
        ? current
        : [
            ...current,
            {
              ...pendingAnnotationTarget,
              comment,
              id: createVisualAnnotationId(),
            },
          ],
    );
    setPendingAnnotationTarget(null);
    setPendingAnnotationComment("");
  }, [pendingAnnotationComment, pendingAnnotationTarget]);

  const removeAnnotation = useCallback((id: string) => {
    setAnnotations((current) => current.filter((item) => item.id !== id));
  }, []);

  const clearAnnotations = useCallback(() => {
    setAnnotations([]);
    setAnnotationInstruction("");
    pendingVisualRevisionRef.current = false;
    window.localStorage.removeItem(visualAnnotationStorageKey);
    setPendingAnnotationTarget(null);
    setPendingAnnotationComment("");
    onDirectEditModeChange?.(false);
  }, [onDirectEditModeChange, visualAnnotationStorageKey]);

  const sendVisualAnnotations = useCallback(async () => {
    if (
      readOnly ||
      !annotations.length ||
      isProcessing ||
      visualEditInFlightRef.current
    ) {
      return;
    }

    visualEditInFlightRef.current = true;
    pendingVisualRevisionRef.current = true;

    const summary = createVisualAnnotationSummary({
      annotations,
      instruction: annotationInstruction,
    });
    const instruction = createVisualAnnotationEditInstruction({
      annotations,
      instruction: annotationInstruction,
    });

    window.localStorage.setItem(
      visualAnnotationStorageKey,
      JSON.stringify({
        annotations,
        instruction: annotationInstruction,
        pendingRevision: true,
      }),
    );

    setIsEditingPreview(true);
    onSetBuildStartedAt?.(Date.now());
    onAppendBuildProgressStep?.((current) =>
      appendBuildProgressStep(current, {
        detail: "Menerapkan komentar visual ke tampilan website sebelumnya.",
        label: "Merevisi dari komentar visual",
        status: "active",
      }),
    );
    onUserMessageAdded?.({
      id: createVisualAnnotationId(),
      parts: [{ text: summary, type: "text" }],
      role: "user",
    });

    try {
      const response = await fetch(`/api/projects/${projectId}/visual-edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          annotations,
          instruction,
          kind: "visual_comment",
          summary,
        }),
      });
      let result: { buildStatus?: string; message?: string } | null = null;

      if (response.ok && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() || "";

          for (const rawEvent of events) {
            const eventName = rawEvent.match(/^event: (.+)$/m)?.[1];
            const dataText = rawEvent.match(/^data: (.+)$/m)?.[1];
            if (!eventName || !dataText) {
              continue;
            }

            const data = JSON.parse(dataText) as {
              buildStatus?: string;
              detail?: string;
              label?: string;
              message?: string;
            };

            if (eventName === "progress" && data.label) {
              onAppendBuildProgressStep?.((current) =>
                appendBuildProgressStep(current, {
                  detail: data.detail || "",
                  label: data.label as string,
                  status: "active",
                }),
              );
            } else if (eventName === "done" || eventName === "error") {
              result = data;
            }
          }
        }
      } else if (!response.ok) {
        result = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
      }

      if (!response.ok || result?.buildStatus !== "succeeded") {
        pendingVisualRevisionRef.current = false;
        onAppendBuildProgressStep?.((current) =>
          appendBuildProgressStep(current, {
            detail:
              result?.message ||
              "Komentar visual belum berhasil diterapkan. Komentar tetap aman.",
            label: "Revisi visual belum selesai",
            status: "error",
          }),
        );
        return;
      }

      pendingVisualRevisionRef.current = false;
      await fetch(`/api/projects/${projectId}/visual-annotations`, {
        body: JSON.stringify({ annotations: [] }),
        headers: { "Content-Type": "application/json" },
        method: "PUT",
      }).catch(() => undefined);

      setAnnotations([]);
      setAnnotationInstruction("");
      setPendingAnnotationTarget(null);
      setPendingAnnotationComment("");
      window.localStorage.removeItem(visualAnnotationStorageKey);
      onDirectEditModeChange?.(false);
      onBuildStatusChange?.("ready");
      if (onCompleteBuildProgress) {
        onCompleteBuildProgress();
      } else {
        onAppendBuildProgressStep?.((current) =>
          completeBuildProgressSteps(current),
        );
      }
      onEnergyInvalidate?.();
    } finally {
      visualEditInFlightRef.current = false;
      setIsEditingPreview(false);
    }
  }, [
    annotationInstruction,
    annotations,
    isProcessing,
    onAppendBuildProgressStep,
    onBuildStatusChange,
    onCompleteBuildProgress,
    onDirectEditModeChange,
    onEnergyInvalidate,
    onSetBuildStartedAt,
    onUserMessageAdded,
    projectId,
    readOnly,
    visualAnnotationStorageKey,
  ]);

  return {
    addPendingAnnotation,
    annotationInstruction,
    annotations,
    clearAnnotations,
    handleAnnotationTarget,
    isEditingPreview,
    pendingAnnotationComment,
    pendingAnnotationTarget,
    removeAnnotation,
    sendVisualAnnotations,
    setAnnotationInstruction,
    setAnnotations,
    setPendingAnnotationComment,
    setPendingAnnotationTarget,
    visualAnnotationStorageKey,
  };
}
