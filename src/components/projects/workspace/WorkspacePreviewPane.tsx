"use client";

import { useRef } from "react";

import type { GeneratedProjectFile } from "@/lib/projects/generated-types";
import type { VisualAnnotationDraft } from "@/lib/projects/visual-annotations";

import { CodeView } from "@/components/projects/workspace/CodeViewer";
import { WorkspaceMediaGallery } from "@/components/projects/workspace/WorkspaceMediaGallery";
import {
  EmptyPreviewState,
  GeneratedPreviewFrame,
  PreviewIssueState,
  WorkspaceTopBar,
  type BuildTab,
  type WorkspaceRuntimeControl,
} from "@/components/projects/workspace/WorkspacePrimitives";
import {
  canRedoDirectEdit,
  canUndoDirectEdit,
  type DirectEditIntent,
  type DirectEditIntentHistory,
  type EditHistory,
  type EditLayout,
} from "@/lib/projects/direct-edit";
import { uploadTempImageFile } from "@/lib/storage/uploads/temp-image-client";

export type WorkspacePreviewPaneProps = {
  activeTab: BuildTab;
  addPendingAnnotation: () => void;
  annotations: VisualAnnotationDraft[];
  buildStatus: string;
  chatCollapsed: boolean;
  closeChatPanel: () => void;
  directEditFlagEnabled: boolean;
  editHistory: EditHistory;
  editIntentHistory: DirectEditIntentHistory;
  editLayoutSignal: number;
  effectiveDirectEditMode: boolean;
  handleAnnotationTarget: (target: unknown) => void;
  handleDiscard: () => void;
  handleRedo: () => void;
  handleUndo: () => void;
  hasInitialPreview: boolean;
  hasLastGoodPreview: boolean;
  initialTitle: string;
  isBuilding: boolean;
  isLoadingSource: boolean;
  loadRuntimeState: () => void;
  onRefreshPreview: () => void;
  onRetrySource: () => void;
  openChatPanel: () => void;
  pendingAnnotationComment: string;
  pendingAnnotationTarget: Omit<VisualAnnotationDraft, "comment" | "id"> | null;
  pendingEditLayout: EditLayout | null;
  previewIssue: { detail?: string; title: string } | null;
  previewReloadKey: number;
  projectId: string;
  queueDirectEditIntent: (intent: DirectEditIntent) => void;
  readOnly?: boolean;
  recoverPreviewRuntime: () => void;
  runtimeControl: WorkspaceRuntimeControl;
  saveDirectEdit: () => Promise<void>;
  sendFrameAction: (payload: Record<string, unknown>) => void;
  setActiveTab: (tab: BuildTab) => void;
  setEditIntentHistory: React.Dispatch<
    React.SetStateAction<DirectEditIntentHistory>
  >;
  setMobileSurface: (surface: "chat" | "preview") => void;
  setPendingAnnotationComment: (comment: string) => void;
  setPendingAnnotationTarget: (
    target: Omit<VisualAnnotationDraft, "comment" | "id"> | null,
  ) => void;
  setViewport: (viewport: "desktop" | "mobile") => void;
  shouldRenderGeneratedPreview: boolean;
  sourceError: string | null;
  sourceFiles: GeneratedProjectFile[];
  sourceStatus: string;
  startBuild: () => void;
  toggleDirectEdit: () => void;
  viewport: "desktop" | "mobile";
};

export function WorkspacePreviewPane({
  activeTab,
  addPendingAnnotation,
  annotations,
  buildStatus: _buildStatus,
  chatCollapsed,
  closeChatPanel,
  directEditFlagEnabled,
  editHistory,
  editIntentHistory,
  editLayoutSignal,
  effectiveDirectEditMode,
  handleAnnotationTarget,
  handleDiscard,
  handleRedo,
  handleUndo,
  hasInitialPreview: _hasInitialPreview,
  hasLastGoodPreview,
  initialTitle,
  isBuilding,
  isLoadingSource,
  loadRuntimeState,
  onRefreshPreview,
  onRetrySource,
  openChatPanel,
  pendingAnnotationComment,
  pendingAnnotationTarget,
  pendingEditLayout,
  previewIssue,
  previewReloadKey,
  projectId,
  queueDirectEditIntent,
  readOnly = false,
  recoverPreviewRuntime,
  runtimeControl,
  saveDirectEdit,
  sendFrameAction,
  setActiveTab,
  setEditIntentHistory,
  setMobileSurface,
  setPendingAnnotationComment,
  setPendingAnnotationTarget,
  setViewport,
  shouldRenderGeneratedPreview,
  sourceError,
  sourceFiles,
  sourceStatus,
  startBuild,
  toggleDirectEdit,
  viewport,
}: WorkspacePreviewPaneProps) {
  const replaceImageFileInputRef = useRef<HTMLInputElement | null>(null);
  const replaceTargetRef = useRef<VisualAnnotationDraft["target"] | null>(null);

  function openReplaceImage(target: VisualAnnotationDraft["target"]) {
    replaceTargetRef.current = target;
    replaceImageFileInputRef.current?.click();
  }

  async function handleReplaceImageFile(file: File) {
    const target = replaceTargetRef.current;
    if (!target || !target.src) {
      return;
    }
    const uploaded = await uploadTempImageFile(file);
    const claimForm = new FormData();
    claimForm.append("assetId", uploaded.assetId);
    claimForm.append("purpose", "business-image");
    const claimRes = await fetch(`/api/projects/${projectId}/assets/upload`, {
      method: "POST",
      body: claimForm,
    });
    if (!claimRes.ok) {
      return;
    }
    const asset = (await claimRes.json()) as { id: string };
    const mediaPath = `/api/media/${asset.id}`;
    setPendingAnnotationTarget(null);
    queueDirectEditIntent({
      action: "replace-image",
      newSrc: mediaPath,
      target: {
        label: "Gambar",
        selectorPath: target.selectorPath,
        tag: target.tag,
      },
    });
  }

  return (
    <section className="h-full min-h-0 min-w-0">
      <div className="flex h-full min-h-0 flex-col bg-[#10100f] text-surface-warm-white">
        <WorkspaceTopBar
          annotationAvailable={!readOnly && shouldRenderGeneratedPreview}
          directEditActive={effectiveDirectEditMode}
          directEditFlagEnabled={directEditFlagEnabled}
          onToggleDirectEdit={toggleDirectEdit}
          directEditActions={
            effectiveDirectEditMode
              ? {
                  canUndo:
                    Boolean(editIntentHistory.present.length) ||
                    canUndoDirectEdit(editHistory),
                  canRedo:
                    Boolean(editIntentHistory.future.length) ||
                    canRedoDirectEdit(editHistory),
                  intents: editIntentHistory.present,
                  onUndo: handleUndo,
                  onRedo: handleRedo,
                  onRemoveIntent: (idx: number) => {
                    const intent = editIntentHistory.present[idx];
                    if (intent) {
                      if (intent.action === "update-text") {
                        sendFrameAction({
                          action: "update-text",
                          newText: intent.target.text || "",
                          selectorPath: intent.target.selectorPath,
                        });
                      } else if (intent.action === "move-up") {
                        sendFrameAction({
                          action: "move-down",
                          selectorPath: intent.target.selectorPath,
                        });
                      } else if (intent.action === "move-down") {
                        sendFrameAction({
                          action: "move-up",
                          selectorPath: intent.target.selectorPath,
                        });
                      } else if (intent.action === "remove") {
                        sendFrameAction({
                          action: "restore",
                          selectorPath: intent.target.selectorPath,
                        });
                      }
                    }
                    setEditIntentHistory((current) => ({
                      ...current,
                      present: current.present.filter((_, i) => i !== idx),
                    }));
                  },
                  onSave: () => void saveDirectEdit(),
                  onDiscard: handleDiscard,
                }
              : undefined
          }
          projectId={projectId}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          viewport={viewport}
          setViewport={setViewport}
          chatCollapsed={chatCollapsed}
          openChatPanel={openChatPanel}
          closeChatPanel={closeChatPanel}
          runtime={runtimeControl}
          title={initialTitle}
          onRefreshPreview={onRefreshPreview}
          onPickTab={(tab) => {
            setActiveTab(tab);
            setMobileSurface("preview");
          }}
        />
        <div className="min-h-0 flex-1 overflow-hidden bg-background">
          {activeTab === "preview" ? (
            <div
              id="workspace-preview-panel"
              role="tabpanel"
              aria-labelledby="workspace-preview-tab"
              className="h-full min-h-0"
            >
              {isBuilding && !hasLastGoodPreview ? (
                <div className="grid min-h-full place-items-center bg-background p-spacing-10 text-center">
                  <div className="flex flex-col items-center gap-spacing-4 text-center">
                    <div className="size-9 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
                    <p className="text-sm font-medium text-foreground">
                      Menyiapkan pratinjau website...
                    </p>
                  </div>
                </div>
              ) : previewIssue && !(isBuilding && hasLastGoodPreview) ? (
                <PreviewIssueState
                  detail={previewIssue.detail ?? ""}
                  onRecover={
                    readOnly ? undefined : () => void recoverPreviewRuntime()
                  }
                  onRebuild={readOnly ? undefined : () => void startBuild()}
                  title={previewIssue.title}
                />
              ) : shouldRenderGeneratedPreview ||
                (isBuilding && hasLastGoodPreview) ? (
                <div className="relative h-full">
                  <GeneratedPreviewFrame
                    annotationMarkers={annotations}
                    directEditActive={effectiveDirectEditMode}
                    directEditFlagEnabled={directEditFlagEnabled}
                    directEditIntents={editIntentHistory.present}
                    editLayoutSignal={editLayoutSignal}
                    editLayout={pendingEditLayout}
                    onAnnotationTarget={handleAnnotationTarget}
                    onDirectEditAction={(action, target) => {
                      queueDirectEditIntent({
                        action,
                        target: {
                          label: target.label,
                          selectorPath: target.target.selectorPath,
                          tag: target.target.tag,
                          text: target.target.text,
                        },
                      });
                    }}
                    onLoad={() => void loadRuntimeState()}
                    onRecover={recoverPreviewRuntime}
                    onStuck={() => void loadRuntimeState()}
                    pendingAnnotation={
                      effectiveDirectEditMode && pendingAnnotationTarget
                        ? {
                            comment: pendingAnnotationComment,
                            onArrange: (
                              action: "move-up" | "move-down" | "remove",
                            ) => {
                              const target = pendingAnnotationTarget;
                              setPendingAnnotationTarget(null);
                              setPendingAnnotationComment("");
                              queueDirectEditIntent({
                                action,
                                target: {
                                  label: target.label,
                                  selectorPath: target.target.selectorPath,
                                  tag: target.target.tag,
                                  text: target.target.text,
                                },
                              });
                            },
                            onCancel: () => {
                              setPendingAnnotationTarget(null);
                              setPendingAnnotationComment("");
                            },
                            onChange: setPendingAnnotationComment,
                            onDirectTextSubmit: (newText: string) => {
                              const target = pendingAnnotationTarget;
                              setPendingAnnotationTarget(null);
                              setPendingAnnotationComment("");
                              queueDirectEditIntent({
                                action: "update-text",
                                newText,
                                target: {
                                  label: target.label,
                                  selectorPath: target.target.selectorPath,
                                  tag: target.target.tag,
                                  text: target.target.text,
                                },
                              });
                            },
                            onReplaceImage: () =>
                              openReplaceImage(pendingAnnotationTarget.target),
                            onSave: addPendingAnnotation,
                            target: pendingAnnotationTarget,
                          }
                        : null
                    }
                    projectId={projectId}
                    reloadKey={previewReloadKey}
                    viewport={viewport}
                  />
                  <input
                    ref={replaceImageFileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) {
                        void handleReplaceImageFile(file);
                      }
                      event.target.value = "";
                    }}
                  />
                </div>
              ) : (
                <EmptyPreviewState />
              )}
            </div>
          ) : null}

          <div
            id="workspace-code-panel"
            role="tabpanel"
            aria-labelledby="workspace-code-tab"
            hidden={activeTab !== "code"}
            className="h-full min-h-0"
          >
            <CodeView
              files={sourceFiles}
              buildStatus={sourceStatus}
              error={sourceError}
              isLoading={isLoadingSource}
              isBuilding={isBuilding}
              onRetry={onRetrySource}
            />
          </div>

          <div
            id="workspace-media-panel"
            role="tabpanel"
            aria-labelledby="workspace-media-tab"
            hidden={activeTab !== "media"}
            className="h-full min-h-0"
          >
            {activeTab === "media" ? (
              <WorkspaceMediaGallery
                projectId={projectId}
                readOnly={readOnly}
              />
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
