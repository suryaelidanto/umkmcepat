"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import type { BuildProgressStep } from "@/components/projects/workspace/WorkspacePrimitives";
import type { WorkspaceCard } from "@/lib/projects/brief";

import {
  appendBuildProgressStep,
  completeBuildProgressSteps,
} from "@/lib/projects/build-progress-steps";
import {
  buildDirectEditInstruction,
  buildDirectEditIntentInstruction,
  editHistoryPush,
  editHistoryRedo,
  editHistoryUndo,
  intentHistoryPush,
  intentHistoryRedo,
  intentHistoryUndo,
  type DirectEditIntent,
  type DirectEditIntentHistory,
  type EditHistory,
  type EditLayout,
} from "@/lib/projects/direct-edit";
import { getBuildOperationCardTransition } from "@/lib/projects/workspace-sync";
import { queryKeys } from "@/lib/query-client";

export type UseWorkspaceDirectEditOptions = {
  directEditFlagEnabled: boolean;
  isProcessing: boolean;
  onAnnotationTarget: (target: unknown) => void;
  onAppendBuildProgressStep?: (
    updater: (current: BuildProgressStep[]) => BuildProgressStep[],
  ) => void;
  onBuildStatusChange?: (status: string) => void;
  onCollapseChatPanel?: () => void;
  onCompleteBuildProgress?: () => void;
  onExpandChatPanel?: () => void;
  onModeChange?: (mode: "build" | "discuss") => void;
  onReloadPreview?: () => void;
  onResetProgress?: () => void;
  onSetBuildStartedAt?: (timestamp: number) => void;
  onSetChatCollapsed?: (collapsed: boolean) => void;
  onSetWorkspaceCard?: (card: WorkspaceCard) => void;
  onWorkspaceCardConsumed?: (signature: string | null) => void;
  projectId: string;
  readOnly?: boolean;
  workspaceCardRef: React.MutableRefObject<WorkspaceCard>;
};

export function useWorkspaceDirectEdit({
  directEditFlagEnabled,
  isProcessing,
  onAnnotationTarget,
  onAppendBuildProgressStep,
  onBuildStatusChange,
  onCollapseChatPanel,
  onCompleteBuildProgress,
  onExpandChatPanel,
  onModeChange,
  onReloadPreview,
  onSetBuildStartedAt,
  onSetChatCollapsed,
  onSetWorkspaceCard,
  onWorkspaceCardConsumed,
  projectId,
  readOnly = false,
  workspaceCardRef,
}: UseWorkspaceDirectEditOptions) {
  const queryClient = useQueryClient();

  const patchProjectInList = useCallback(
    (patch: Partial<{ buildStatus: string }>) => {
      queryClient.setQueryData(queryKeys.projects, (old: unknown) => {
        const data = old as
          | {
              pages: Array<{
                projects: Array<{ id: string; buildStatus?: string }>;
              }>;
            }
          | undefined;
        if (!data) {
          return data;
        }
        return {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            projects: page.projects.map((p) =>
              p.id === projectId ? { ...p, ...patch } : p,
            ),
          })),
        };
      });
    },
    [projectId, queryClient],
  );

  const [directEditMode, setDirectEditMode] = useState(false);
  const effectiveDirectEditMode = directEditMode && directEditFlagEnabled;

  const [editHistory, setEditHistory] = useState<EditHistory>({
    present: null,
    past: [],
    future: [],
  });
  const [editIntentHistory, setEditIntentHistory] =
    useState<DirectEditIntentHistory>({
      present: [],
      past: [],
      future: [],
    });
  const [editLayoutSignal, setEditLayoutSignal] = useState(0);
  const [pendingEditLayout, setPendingEditLayout] = useState<EditLayout | null>(
    null,
  );
  const lastEditLayoutRef = useRef<EditLayout | null>(null);
  const [isEditingPreview, setIsEditingPreview] = useState(false);

  function applyHistoryLayout(layout: EditLayout | null) {
    setPendingEditLayout(layout);
    setEditLayoutSignal((current) => current + 1);
  }

  function sendFrameAction(actionPayload: Record<string, unknown>) {
    const frame = document.querySelector(
      'iframe[title="Tampilan website"]',
    ) as HTMLIFrameElement | null;
    frame?.contentWindow?.postMessage(
      { ...actionPayload, type: "umkmcepat-edit-action" },
      "*",
    );
  }

  const handleDirectEditMessage = useCallback(
    (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== "object") {
        return;
      }
      if (data.type === "umkmcepat-edit-ready") {
        const layout = data.payload as EditLayout;
        lastEditLayoutRef.current = layout;
        setEditHistory((current) => editHistoryPush(current, layout));
      }
      if (data.type === "umkmcepat-edit-state") {
        const layout = data.payload as EditLayout;
        lastEditLayoutRef.current = layout;
        setEditHistory((current) => editHistoryPush(current, layout));
      }
      if (data.type === "umkmcepat-edit-comment") {
        onAnnotationTarget(data.payload);
      }
    },
    [onAnnotationTarget],
  );

  useEffect(() => {
    window.addEventListener("message", handleDirectEditMessage);
    return () => window.removeEventListener("message", handleDirectEditMessage);
  }, [handleDirectEditMessage]);

  const toggleDirectEdit = useCallback(() => {
    setDirectEditMode((current) => {
      const next = !current;
      if (next) {
        onSetChatCollapsed?.(true);
        window.requestAnimationFrame(() => {
          onCollapseChatPanel?.();
        });
      } else {
        onSetChatCollapsed?.(false);
        window.requestAnimationFrame(() => {
          onExpandChatPanel?.();
        });
      }
      return next;
    });
  }, [onCollapseChatPanel, onExpandChatPanel, onSetChatCollapsed]);

  const handleUndo = useCallback(() => {
    if (editIntentHistory.present.length > 0) {
      const lastIntent =
        editIntentHistory.present[editIntentHistory.present.length - 1];
      if (lastIntent) {
        if (lastIntent.action === "update-text") {
          sendFrameAction({
            action: "update-text",
            newText: lastIntent.target.text || "",
            selectorPath: lastIntent.target.selectorPath,
          });
        } else if (lastIntent.action === "move-up") {
          sendFrameAction({
            action: "move-down",
            selectorPath: lastIntent.target.selectorPath,
          });
        } else if (lastIntent.action === "move-down") {
          sendFrameAction({
            action: "move-up",
            selectorPath: lastIntent.target.selectorPath,
          });
        } else if (lastIntent.action === "remove") {
          sendFrameAction({
            action: "restore",
            selectorPath: lastIntent.target.selectorPath,
          });
        }
      }
      setEditIntentHistory((current) => intentHistoryUndo(current));
      return;
    }
    setEditHistory((current) => {
      const next = editHistoryUndo(current);
      if (next !== current) {
        applyHistoryLayout(next.present);
      }
      return next;
    });
  }, [editIntentHistory.present]);

  const handleRedo = useCallback(() => {
    if (editIntentHistory.future.length > 0) {
      const nextIntent =
        editIntentHistory.future[0]?.[editIntentHistory.future[0].length - 1];
      if (nextIntent) {
        if (nextIntent.action === "update-text" && nextIntent.newText) {
          sendFrameAction({
            action: "update-text",
            newText: nextIntent.newText,
            selectorPath: nextIntent.target.selectorPath,
          });
        } else if (
          nextIntent.action === "move-up" ||
          nextIntent.action === "move-down" ||
          nextIntent.action === "remove"
        ) {
          sendFrameAction({
            action: nextIntent.action,
            selectorPath: nextIntent.target.selectorPath,
          });
        }
      }
      setEditIntentHistory((current) => intentHistoryRedo(current));
      return;
    }
    setEditHistory((current) => {
      const next = editHistoryRedo(current);
      if (next !== current) {
        applyHistoryLayout(next.present);
      }
      return next;
    });
  }, [editIntentHistory.future]);

  const handleDiscard = useCallback(() => {
    setEditHistory({ present: null, past: [], future: [] });
    setEditIntentHistory({ present: [], past: [], future: [] });
    setPendingEditLayout(null);
    setDirectEditMode(false);
    onReloadPreview?.();
  }, [onReloadPreview]);

  const queueDirectEditIntent = useCallback((intent: DirectEditIntent) => {
    const frame = document.querySelector(
      'iframe[title="Tampilan website"]',
    ) as HTMLIFrameElement | null;

    if (intent.action === "update-text" && intent.newText) {
      frame?.contentWindow?.postMessage(
        {
          action: "update-text",
          newText: intent.newText,
          selectorPath: intent.target.selectorPath,
          type: "umkmcepat-edit-action",
        },
        "*",
      );
    } else if (intent.action === "replace-image" && intent.newSrc) {
      frame?.contentWindow?.postMessage(
        {
          action: "replace-image",
          newSrc: intent.newSrc,
          selectorPath: intent.target.selectorPath,
          type: "umkmcepat-edit-action",
        },
        "*",
      );
    } else if (
      intent.action === "move-up" ||
      intent.action === "move-down" ||
      intent.action === "remove"
    ) {
      frame?.contentWindow?.postMessage(
        {
          action: intent.action,
          selectorPath: intent.target.selectorPath,
          type: "umkmcepat-edit-action",
        },
        "*",
      );
    }

    setEditIntentHistory((current) => intentHistoryPush(current, intent));
  }, []);

  const submitDirectEdit = useCallback(
    async ({
      instruction,
      summary,
    }: {
      instruction: string;
      summary: string;
    }) => {
      if (readOnly || isProcessing) {
        return false;
      }
      const operationCard = getBuildOperationCardTransition(
        workspaceCardRef.current,
      );
      const consumedSignature = operationCard.consumedSignature;
      onSetWorkspaceCard?.(operationCard.workspaceCard);
      onWorkspaceCardConsumed?.(consumedSignature);
      onBuildStatusChange?.("building");
      onModeChange?.("build");
      setIsEditingPreview(true);
      onSetBuildStartedAt?.(Date.now());
      onAppendBuildProgressStep?.((current) =>
        appendBuildProgressStep(current, {
          detail:
            "Menerapkan perubahan struktur ke tampilan website sebelumnya.",
          label: "Merevisi struktur dari ubah langsung",
          status: "active",
        }),
      );

      try {
        const response = await fetch(`/api/projects/${projectId}/visual-edit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ instruction, kind: "instruction", summary }),
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
          onBuildStatusChange?.("ready");
          onAppendBuildProgressStep?.((current) =>
            appendBuildProgressStep(current, {
              detail:
                result?.message ||
                "Perubahan belum berhasil diterapkan. Coba lagi.",
              label: "Revisi belum selesai",
              status: "error",
            }),
          );
          return false;
        }

        onBuildStatusChange?.("ready");
        if (onCompleteBuildProgress) {
          onCompleteBuildProgress();
        } else {
          onAppendBuildProgressStep?.((current) =>
            completeBuildProgressSteps(current),
          );
        }
        setEditHistory({ present: null, past: [], future: [] });
        setEditIntentHistory({ present: [], past: [], future: [] });
        setPendingEditLayout(null);
        setDirectEditMode(false);
        onReloadPreview?.();
        patchProjectInList({ buildStatus: "ready" });
        window.dispatchEvent(new Event("umkm:energy-changed"));
        void queryClient.invalidateQueries({
          queryKey: queryKeys.projects,
          refetchType: "active",
        });
        void queryClient.invalidateQueries({ queryKey: queryKeys.energy });
        return true;
      } finally {
        setIsEditingPreview(false);
      }
    },
    [
      isProcessing,
      onAppendBuildProgressStep,
      onBuildStatusChange,
      onCompleteBuildProgress,
      onModeChange,
      onReloadPreview,
      onSetBuildStartedAt,
      onSetWorkspaceCard,
      onWorkspaceCardConsumed,
      patchProjectInList,
      projectId,
      queryClient,
      readOnly,
      workspaceCardRef,
    ],
  );

  const saveDirectEdit = useCallback(async () => {
    const intentInstruction = buildDirectEditIntentInstruction(
      editIntentHistory.present,
    );
    if (intentInstruction) {
      setDirectEditMode(false);
      onSetChatCollapsed?.(false);
      window.requestAnimationFrame(() => {
        onExpandChatPanel?.();
      });
      await submitDirectEdit({
        instruction: intentInstruction,
        summary: intentInstruction,
      });
      return;
    }

    const original = editHistory.past[0] ?? null;
    const current = lastEditLayoutRef.current;
    if (!current || !original) {
      return;
    }
    const instruction = buildDirectEditInstruction(original, current);
    if (!instruction) {
      handleDiscard();
      return;
    }
    setDirectEditMode(false);
    onSetChatCollapsed?.(false);
    window.requestAnimationFrame(() => {
      onExpandChatPanel?.();
    });
    await submitDirectEdit({ instruction, summary: instruction });
  }, [
    editHistory.past,
    editIntentHistory.present,
    handleDiscard,
    onExpandChatPanel,
    onSetChatCollapsed,
    submitDirectEdit,
  ]);

  return {
    directEditMode,
    editHistory,
    editIntentHistory,
    editLayoutSignal,
    effectiveDirectEditMode,
    handleDiscard,
    handleRedo,
    handleUndo,
    isEditingPreview,
    pendingEditLayout,
    queueDirectEditIntent,
    saveDirectEdit,
    sendFrameAction,
    setDirectEditMode,
    setEditIntentHistory,
    submitDirectEdit,
    toggleDirectEdit,
  };
}
