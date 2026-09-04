"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import { useWorkspaceAnnotations } from "./useWorkspaceAnnotations";
import { useWorkspaceBuild } from "./useWorkspaceBuild";
import { useWorkspaceChat } from "./useWorkspaceChat";
import { useWorkspaceDirectEdit } from "./useWorkspaceDirectEdit";
import { buildWorkspaceRuntimeControl } from "./workspace-helpers";
import { WorkspaceChatPane } from "./WorkspaceChatPane";
import { WorkspaceNavigation } from "./WorkspaceNavigation";
import { WorkspacePreviewPane } from "./WorkspacePreviewPane";

import type { BuildTab } from "@/components/projects/workspace/WorkspacePrimitives";
import type { ProjectBrief, WorkspaceCard } from "@/lib/projects/brief";
import type { UIMessage } from "ai";
import type { PanelImperativeHandle } from "react-resizable-panels";

import {
  VisualFeedbackWidget,
  WorkspaceMobileMenuSheet,
} from "@/components/projects/workspace/WorkspacePrimitives";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { useSession } from "@/lib/auth/auth-client";
import { useFeatureFlag } from "@/lib/config/use-feature-flag";
import {
  getWorkspacePreviewIssue,
  isWorkspaceBuildComplete,
  shouldUseGeneratedPreviewFrame,
} from "@/lib/projects/workspace-sync";
import { queryKeys, useCacheMutation } from "@/lib/query-client";
import { uploadTempImageFile } from "@/lib/storage/uploads/temp-image-client";
import { useIsDesktopViewport } from "@/lib/use-is-desktop-viewport";

export {
  MAX_CHAT_BYTES,
  canStartBuild,
  canStartBuildFromBrief,
  chatBubbleClass,
  resolveBuildAction,
  resolveBuildRequestMode,
  resolvePendingEditInstruction,
  resolvePrimaryComposerIntent,
  sanitizeWorkspaceCard,
} from "./workspace-helpers";

export type WorkspaceShellProps = {
  autoRetryAttempts?: number;
  autoRetryDelayMs?: number;
  initialBrief?: ProjectBrief;
  initialChatCursor: number | null;
  initialChatHasMore: boolean;
  initialMessages: UIMessage[];
  initialPrompt?: string;
  initialStatus: string;
  initialTitle: string;
  initialWorkspaceCard: WorkspaceCard;
  projectId: string;
  readOnly?: boolean;
};

export function WorkspaceShell({
  initialBrief,
  initialChatCursor,
  initialChatHasMore,
  initialMessages,
  initialPrompt = "",
  initialStatus,
  initialTitle,
  initialWorkspaceCard,
  projectId,
  readOnly = false,
}: WorkspaceShellProps) {
  const isDesktop = useIsDesktopViewport();
  const queryClient = useQueryClient();
  const { status: authStatus } = useSession();

  const [mode, setMode] = useState<"build" | "discuss">("discuss");
  const [viewport, setViewport] = useState<"desktop" | "mobile">("desktop");
  const [activeTab, setActiveTab] = useState<BuildTab>("preview");

  const hasInitialPreview = ["passed", "ready", "succeeded"].includes(
    initialStatus,
  );
  const [mobileSurface, setMobileSurface] = useState<"chat" | "preview">(
    hasInitialPreview ? "preview" : "chat",
  );
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [previewCollapsed, setPreviewCollapsed] = useState(!hasInitialPreview);

  const [projectTitle, setProjectTitle] = useState(initialTitle);
  const [draftTitle, setDraftTitle] = useState(initialTitle);
  const [isRenaming, setIsRenaming] = useState(false);
  const [mobileRenameOpen, setMobileRenameOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [latestBrief, setLatestBrief] = useState<ProjectBrief | null>(
    initialBrief ?? null,
  );
  const [sessionExpired, setSessionExpired] = useState(false);
  const [postBuildChatOpen, setPostBuildChatOpen] = useState(
    () =>
      hasInitialPreview ||
      initialMessages.length > 0 ||
      initialWorkspaceCard.type === "build_recommendation",
  );

  const directEditFlagEnabled = useFeatureFlag("feature.visual_edit_enabled");
  const composerUploadsEnabled = useFeatureFlag(
    "feature.composer_uploads_enabled",
  );

  const chatPanelRef = useRef<PanelImperativeHandle | null>(null);
  const previewPanelRef = useRef<PanelImperativeHandle | null>(null);
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (authStatus === "unauthenticated") {
      setSessionExpired(true);
    }
  }, [authStatus]);

  useEffect(() => {
    return () => {
      document.body.style.cursor = "";
      document.documentElement.style.cursor = "";
    };
  }, []);

  const build = useWorkspaceBuild({
    activeTab,
    initialStatus,
    onBuildError: () => {
      setMode("discuss");
      setMobileSurface("chat");
      setChatCollapsed(false);
    },
    onBuildSuccess: () => {
      setPostBuildChatOpen(true);
      setMode("discuss");
      setMobileSurface("chat");
    },
    onEnergyInvalidate: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.energy });
    },
    onSetChatCollapsed: setChatCollapsed,
    onSetMobileSurface: setMobileSurface,
    onSetMode: setMode,
    onSetPostBuildChatOpen: setPostBuildChatOpen,
    projectId,
    readOnly,
  });

  const buildComplete = isWorkspaceBuildComplete({
    buildStatus: build.buildStatus,
    runtimeBuildStatus: build.runtimeState?.build?.status,
    sourceStatus: build.sourceStatus,
  });

  const isBuilding = build.buildStatus === "building";

  const workspaceCardRef = useRef<WorkspaceCard>(initialWorkspaceCard);

  const directEdit = useWorkspaceDirectEdit({
    directEditFlagEnabled,
    isProcessing: false,
    onAnnotationTarget: (target) => annotations.handleAnnotationTarget(target),
    onAppendBuildProgressStep: build.setBuildProgress,
    onBuildStatusChange: build.setBuildStatus,
    onCollapseChatPanel: () => chatPanelRef.current?.collapse(),
    onCompleteBuildProgress: () => {
      build.setBuildProgress([]);
    },
    onExpandChatPanel: () => chatPanelRef.current?.expand(),
    onModeChange: setMode,
    onReloadPreview: build.reloadPreview,
    onSetBuildStartedAt: build.setBuildStartedAt,
    onSetChatCollapsed: setChatCollapsed,
    onSetWorkspaceCard: (card) => {
      workspaceCardRef.current = card;
      chat.setWorkspaceCard(card);
    },
    onWorkspaceCardConsumed: (sig) => {
      if (sig) {
        chat.setConsumedBuildRecommendationSignatures((prev) =>
          new Set(prev).add(sig),
        );
      }
    },
    projectId,
    readOnly,
    workspaceCardRef,
  });

  const annotations = useWorkspaceAnnotations({
    isProcessing: false,
    onAppendBuildProgressStep: build.setBuildProgress,
    onBuildStatusChange: build.setBuildStatus,
    onCompleteBuildProgress: () => {
      build.setBuildProgress([]);
    },
    onDirectEditModeChange: directEdit.setDirectEditMode,
    onEnergyInvalidate: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.energy });
    },
    onSetBuildStartedAt: build.setBuildStartedAt,
    onUserMessageAdded: (msg) => {
      chat.setMessages((current) => [...current, msg]);
    },
    projectId,
    readOnly,
  });

  const chat = useWorkspaceChat({
    authStatus,
    buildComplete,
    buildStatus: build.buildStatus,
    composerUploadsEnabled,
    initialChatCursor,
    initialChatHasMore,
    initialMessages,
    initialPrompt,
    initialWorkspaceCard,
    isBuilding,
    isEditingPreview:
      annotations.isEditingPreview || directEdit.isEditingPreview,
    latestBrief,
    mode,
    postBuildChatOpen,
    projectId,
    readOnly,
    sessionExpired,
    setBuildProgress: build.setBuildProgress,
    setDraftTitle,
    setLatestBrief,
    setMode,
    setPostBuildChatOpen,
    setProjectTitle,
    startBuild: async () => {
      build.setBuildStatus("building");
      build.setBuildStartedAt(Date.now());
      build.setBuildProgress([]);
      build.resetProgressDeduper();
      setMode("build");
      setMobileSurface("chat");
    },
    submitDirectEdit: directEdit.submitDirectEdit,
  });

  const saveTitleMutation = useCacheMutation<
    { title: string },
    { title: string }
  >({
    invalidateKeys: [queryKeys.projects],
    mutationFn: async ({ title }) => {
      const response = await fetch(`/api/projects/${projectId}/title`, {
        body: JSON.stringify({ title }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      const result = (await response.json().catch(() => null)) as {
        title?: string;
      } | null;

      if (!response.ok || !result?.title) {
        throw new Error("Judul belum berhasil disimpan.");
      }

      return { title: result.title };
    },
    onSuccess: ({ title }) => {
      setProjectTitle(title);
      setDraftTitle(title);
    },
  });

  const saveProjectTitle = useCallback(async () => {
    if (readOnly) {
      setIsRenaming(false);
      setDraftTitle(projectTitle);
      return;
    }

    const title = draftTitle.trim();
    if (!title || title === projectTitle) {
      setIsRenaming(false);
      setDraftTitle(projectTitle);
      return;
    }

    setProjectTitle(title);
    setDraftTitle(title);

    try {
      await saveTitleMutation.mutateAsync({ title });
    } catch {
      setProjectTitle(projectTitle);
      setDraftTitle(projectTitle);
    } finally {
      setIsRenaming(false);
    }
  }, [draftTitle, projectTitle, readOnly, saveTitleMutation]);

  const previewIssue = getWorkspacePreviewIssue({
    buildStatus: build.buildStatus,
    deploymentStatus: build.runtimeState?.deployment?.status,
    runtimeBuildStatus: build.runtimeState?.build?.status,
    runtimeError: build.runtimeError,
    runtimeUserFacingState: build.runtimeState?.userFacingState,
    sourceStatus: build.sourceStatus,
  });

  const hasLastGoodPreview = Boolean(build.runtimeState?.deployment);
  const shouldRenderGeneratedPreview = shouldUseGeneratedPreviewFrame({
    buildComplete,
    sourceStatus: build.sourceStatus,
  });

  const hasPreview = shouldRenderGeneratedPreview || hasLastGoodPreview;
  const showPreviewPanel = !previewCollapsed || hasPreview || isBuilding;

  const openPreviewPanel = useCallback(() => {
    setMobileSurface("preview");
    setPreviewCollapsed(false);
    window.requestAnimationFrame(() => {
      chatPanelRef.current?.resize("25%");
      previewPanelRef.current?.resize("75%");
    });
  }, []);

  const openChatPanel = useCallback(() => {
    setMobileSurface("chat");
    setChatCollapsed(false);
    setPreviewCollapsed(false);
    window.requestAnimationFrame(() => {
      chatPanelRef.current?.resize("25%");
      previewPanelRef.current?.resize("75%");
    });
  }, []);

  const closeChatPanel = useCallback(() => {
    setChatCollapsed(true);
    window.requestAnimationFrame(() => {
      chatPanelRef.current?.collapse();
      previewPanelRef.current?.resize("100%");
    });
  }, []);

  function handleTouchStart(event: React.TouchEvent) {
    const touch = event.touches[0];
    if (touch) {
      swipeStartRef.current = { x: touch.clientX, y: touch.clientY };
    }
  }

  function handleTouchEnd(event: React.TouchEvent) {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!start) {
      return;
    }
    if (mobileSurface === "preview" && activeTab === "code") {
      return;
    }
    const touch = event.changedTouches[0];
    if (!touch) {
      return;
    }
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < 60 || Math.abs(dy) > 40) {
      return;
    }
    if (dx < 0 && mobileSurface === "chat") {
      openPreviewPanel();
    } else if (dx > 0 && mobileSurface === "preview") {
      openChatPanel();
    }
  }

  const runtimeControl = buildWorkspaceRuntimeControl({
    buildStatus: build.buildStatus,
    isPublishing: build.isPublishing,
    onPublish: () => void build.publishProject(),
    onReload: build.reloadPreview,
    publishedPath: build.publishedPath,
    runtimeState: build.runtimeState,
    sourceStatus: build.sourceStatus,
  });

  const chatPane = (
    <WorkspaceChatPane
      authStatus={authStatus}
      buildComplete={buildComplete}
      buildProgress={build.buildProgress}
      buildRecommendationSignature={chat.buildRecommendationSignature}
      buildRecommendationStorageKey={chat.buildRecommendationStorageKey}
      buildStartedAt={build.buildStartedAt}
      canStartBuildNow={chat.canStartBuildNow}
      chatScrollRef={chat.chatScrollRef}
      closeChatPanel={closeChatPanel}
      composerState={chat.composerState}
      composerUploadsEnabled={composerUploadsEnabled}
      consumedBuildRecommendationSignatures={
        chat.consumedBuildRecommendationSignatures
      }
      dismissBuildRecommendation={chat.dismissBuildRecommendation}
      draftTitle={draftTitle}
      draggedComposerFileCount={chat.draggedComposerFileCount}
      error={chat.error}
      firstTurnPending={chat.firstTurnPending}
      handleComposerDragEnter={chat.handleComposerDragEnter}
      handleComposerDragLeave={chat.handleComposerDragLeave}
      handleComposerDragOver={chat.handleComposerDragOver}
      handleComposerDrop={chat.handleComposerDrop}
      handleMessageKeyDown={chat.handleMessageKeyDown}
      handleMessageSubmit={chat.handleMessageSubmit}
      handlePrimaryComposerAction={chat.handlePrimaryComposerAction}
      handleStartBuild={chat.handleStartBuild}
      hasActionableRecommendation={chat.hasActionableRecommendation}
      hasActiveTurnAssistantText={chat.hasActiveTurnAssistantText}
      hasAnsweredActiveQuestion={chat.hasAnsweredActiveQuestion}
      hasMoreChat={chat.hasMoreChat}
      hasPreview={hasPreview}
      holdBuildRecommendation={chat.holdBuildRecommendation}
      ignoreNextScrollRef={chat.ignoreNextScrollRef}
      isBuilding={isBuilding}
      isChatNearBottom={chat.isChatNearBottom}
      isDraggingComposerFiles={chat.isDraggingComposerFiles}
      isLoadingOlderChat={chat.isLoadingOlderChat}
      isPreparingNextQuestion={chat.isPreparingNextQuestion}
      isProcessing={chat.isProcessing}
      isRenaming={isRenaming}
      isResponding={chat.isResponding}
      isRetrying={chat.isRetrying}
      isSubmittingTurn={chat.isSubmittingTurn}
      loadOlderChat={chat.loadOlderChat}
      message={chat.message}
      openBuildRecommendation={chat.openBuildRecommendation}
      openPreviewPanel={openPreviewPanel}
      pendingAttachments={chat.pendingAttachments}
      preflightBlockedByCard={chat.preflightBlockedByCard}
      projectId={projectId}
      projectTitle={projectTitle}
      questionComposerMode={chat.questionComposerMode}
      rateLimitError={chat.rateLimitError}
      readOnly={readOnly}
      resumeError={chat.resumeError}
      retryChat={chat.retryChat}
      retryWorkspaceCard={chat.retryWorkspaceCard}
      saveProjectTitle={saveProjectTitle}
      scrollChatToBottom={chat.scrollChatToBottom}
      sessionExpired={sessionExpired}
      setActiveTab={setActiveTab}
      setDraftTitle={setDraftTitle}
      setHeldBuildRecommendationSignature={
        chat.setHeldBuildRecommendationSignature
      }
      setIsRenaming={setIsRenaming}
      setMessage={chat.setMessage}
      setMode={setMode}
      setPendingAttachments={chat.setPendingAttachments}
      setPostBuildChatOpen={setPostBuildChatOpen}
      setQuestionComposerMode={chat.setQuestionComposerMode}
      setShowScrollToBottom={chat.setShowScrollToBottom}
      shouldStickToBottomRef={chat.shouldStickToBottomRef}
      showScrollToBottom={chat.showScrollToBottom}
      signOut={async () => {}}
      stopCurrentJob={chat.stop}
      submitChatText={chat.submitChatText}
      uploadTempImageFile={uploadTempImageFile}
      visibleMessages={chat.visibleMessages}
      workspaceCard={chat.workspaceCard}
      workspaceCardError={chat.workspaceCardError}
    />
  );

  const previewPane = (
    <WorkspacePreviewPane
      activeTab={activeTab}
      addPendingAnnotation={annotations.addPendingAnnotation}
      annotations={annotations.annotations}
      buildStatus={build.buildStatus}
      chatCollapsed={chatCollapsed}
      closeChatPanel={closeChatPanel}
      directEditFlagEnabled={directEditFlagEnabled}
      editHistory={directEdit.editHistory}
      editIntentHistory={directEdit.editIntentHistory}
      editLayoutSignal={directEdit.editLayoutSignal}
      effectiveDirectEditMode={directEdit.effectiveDirectEditMode}
      handleAnnotationTarget={annotations.handleAnnotationTarget}
      handleDiscard={directEdit.handleDiscard}
      handleRedo={directEdit.handleRedo}
      handleUndo={directEdit.handleUndo}
      hasInitialPreview={hasInitialPreview}
      hasLastGoodPreview={hasLastGoodPreview}
      initialTitle={projectTitle}
      isBuilding={isBuilding}
      isLoadingSource={build.isLoadingSource}
      loadRuntimeState={() => void build.loadRuntimeState()}
      onRefreshPreview={build.reloadPreview}
      onRetrySource={build.reloadSource}
      openChatPanel={openChatPanel}
      pendingAnnotationComment={annotations.pendingAnnotationComment}
      pendingAnnotationTarget={annotations.pendingAnnotationTarget}
      pendingEditLayout={directEdit.pendingEditLayout}
      previewIssue={previewIssue}
      previewReloadKey={build.previewReloadKey}
      projectId={projectId}
      queueDirectEditIntent={directEdit.queueDirectEditIntent}
      readOnly={readOnly}
      recoverPreviewRuntime={() => void build.recoverPreviewRuntime()}
      runtimeControl={runtimeControl}
      saveDirectEdit={directEdit.saveDirectEdit}
      sendFrameAction={directEdit.sendFrameAction}
      setActiveTab={setActiveTab}
      setEditIntentHistory={directEdit.setEditIntentHistory}
      setMobileSurface={setMobileSurface}
      setPendingAnnotationComment={annotations.setPendingAnnotationComment}
      setPendingAnnotationTarget={annotations.setPendingAnnotationTarget}
      setViewport={setViewport}
      shouldRenderGeneratedPreview={shouldRenderGeneratedPreview}
      sourceError={build.sourceError}
      sourceFiles={build.sourceFiles}
      sourceStatus={build.sourceStatus}
      startBuild={() => void chat.handleStartBuild()}
      toggleDirectEdit={directEdit.toggleDirectEdit}
      viewport={viewport}
    />
  );

  return (
    <div
      className="flex h-dvh flex-col overflow-hidden bg-[#eceae4] text-[#1c1c1c] transition-colors duration-200 dark:bg-[#10100f] dark:text-surface-warm-white"
      onTouchEnd={handleTouchEnd}
      onTouchStart={handleTouchStart}
    >
      {readOnly ? (
        <div className="shrink-0 border-b border-black/10 bg-black/[0.04] px-spacing-4 py-spacing-3 text-sm text-[#5f5f5d] dark:border-surface-warm-white/10 dark:bg-surface-warm-white/8 dark:text-surface-warm-white/82">
          Mode admin baca-saja. Kamu melihat proyek seperti pengguna, tanpa izin
          mengubah atau mengirim aksi.
        </div>
      ) : null}

      <WorkspaceNavigation
        hasPreview={hasPreview}
        mobileSurface={mobileSurface}
        onOpenChat={openChatPanel}
        onOpenMenu={() => setMobileMenuOpen(true)}
        onOpenPreview={openPreviewPanel}
        onOpenRename={() => {
          setDraftTitle(projectTitle);
          setMobileRenameOpen(true);
        }}
        projectTitle={projectTitle}
        readOnly={readOnly}
      />

      {/* Mobile/tablet: single full-screen surface toggled by bottom nav */}
      {!isDesktop ? (
        <div className="min-h-0 flex-1 overflow-hidden lg:hidden">
          {mobileSurface === "chat" && chatPane}
          {mobileSurface === "preview" && showPreviewPanel ? previewPane : null}
        </div>
      ) : null}

      {/* Desktop: side-by-side resizable panels */}
      {isDesktop ? (
        <ResizablePanelGroup
          orientation="horizontal"
          className="min-h-0 flex-1 overflow-hidden"
        >
          <ResizablePanel
            id="chat"
            panelRef={chatPanelRef}
            defaultSize="28%"
            minSize="20%"
            maxSize="45%"
            collapsible
            collapsedSize={0}
          >
            {chatPane}
          </ResizablePanel>
          {showPreviewPanel ? (
            <>
              <ResizableHandle
                withHandle
                className="bg-surface-warm-white/8 transition-colors hover:bg-surface-warm-white/16"
              />
              <ResizablePanel
                id="preview"
                panelRef={previewPanelRef}
                defaultSize="75%"
                minSize="8%"
                collapsible
                collapsedSize={0}
              >
                {previewPane}
              </ResizablePanel>
            </>
          ) : null}
        </ResizablePanelGroup>
      ) : null}

      {!readOnly && annotations.annotations.length ? (
        <VisualFeedbackWidget
          annotations={annotations.annotations}
          instruction={annotations.annotationInstruction}
          isSending={annotations.isEditingPreview}
          onClose={annotations.clearAnnotations}
          onInstructionChange={annotations.setAnnotationInstruction}
          onRemove={annotations.removeAnnotation}
          onSend={() => void annotations.sendVisualAnnotations()}
        />
      ) : null}

      {/* Mobile Rename Modal */}
      <Dialog open={mobileRenameOpen} onOpenChange={setMobileRenameOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ubah nama website</DialogTitle>
            <DialogDescription>
              Beri nama yang mudah dikenali untuk website usahamu.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <input
              type="text"
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  void saveProjectTitle();
                  setMobileRenameOpen(false);
                }
              }}
              className="h-11 w-full rounded-xl border border-black/15 bg-black/[0.02] px-3.5 text-sm font-semibold text-[#1c1c1c] outline-none focus:border-black/40 dark:border-surface-warm-white/15 dark:bg-surface-warm-white/5 dark:text-surface-warm-white"
              placeholder="Nama website..."
              autoFocus
            />
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setMobileRenameOpen(false)}
                className="h-9 rounded-lg px-3.5 text-xs font-semibold text-[#5f5f5d] transition-colors hover:bg-black/5 dark:text-surface-warm-white/70 dark:hover:bg-surface-warm-white/8 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  void saveProjectTitle();
                  setMobileRenameOpen(false);
                }}
                className="h-9 rounded-lg bg-[#1c1c1c] px-4 text-xs font-semibold text-white transition-colors hover:bg-black dark:bg-surface-warm-white dark:text-[#10100f] dark:hover:bg-white cursor-pointer"
              >
                Simpan
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <WorkspaceMobileMenuSheet
        activeTab={activeTab}
        annotationAvailable={!readOnly && shouldRenderGeneratedPreview}
        directEditActive={directEdit.effectiveDirectEditMode}
        directEditFlagEnabled={directEditFlagEnabled}
        hasPreview={hasPreview}
        onOpenChange={setMobileMenuOpen}
        onPickTab={(tab) => {
          setActiveTab(tab);
          setMobileSurface("preview");
          openPreviewPanel();
        }}
        onToggleDirectEdit={directEdit.toggleDirectEdit}
        open={mobileMenuOpen}
        projectId={projectId}
        runtime={runtimeControl}
        setActiveTab={setActiveTab}
        setViewport={setViewport}
        viewport={viewport}
      />
    </div>
  );
}
