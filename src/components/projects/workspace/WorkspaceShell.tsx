"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { useWorkspaceAnnotations } from "./useWorkspaceAnnotations";
import { useWorkspaceBuild } from "./useWorkspaceBuild";
import { useWorkspaceChat } from "./useWorkspaceChat";
import { useWorkspaceDirectEdit } from "./useWorkspaceDirectEdit";
import { useWorkspaceLayout } from "./useWorkspaceLayout";
import { useWorkspaceTitle } from "./useWorkspaceTitle";
import { buildWorkspaceRuntimeControl } from "./workspace-helpers";
import { WorkspaceChatPane } from "./WorkspaceChatPane";
import { WorkspaceNavigation } from "./WorkspaceNavigation";
import { WorkspacePreviewPane } from "./WorkspacePreviewPane";
import { WorkspaceRenameModal } from "./WorkspaceRenameModal";

import type { ProjectBrief, WorkspaceCard } from "@/lib/projects/brief";
import type { UIMessage } from "ai";

import {
  VisualFeedbackWidget,
  WorkspaceMobileMenuSheet,
  type BuildTab,
} from "@/components/projects/workspace/WorkspacePrimitives";
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
import { queryKeys } from "@/lib/query-client";
import { uploadTempImageFile } from "@/lib/storage/uploads/temp-image-client";

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
  const queryClient = useQueryClient();
  const { status: authStatus } = useSession();

  const [mode, setMode] = useState<"build" | "discuss">("discuss");
  const [viewport, setViewport] = useState<"desktop" | "mobile">("desktop");
  const [activeTab, setActiveTab] = useState<BuildTab>("preview");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [latestBrief, setLatestBrief] = useState<ProjectBrief | null>(
    initialBrief ?? null,
  );
  const [sessionExpired, setSessionExpired] = useState(false);

  const hasInitialPreview = ["passed", "ready", "succeeded"].includes(
    initialStatus,
  );
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

  const layout = useWorkspaceLayout({ activeTab, hasInitialPreview });
  const title = useWorkspaceTitle({ initialTitle, projectId, readOnly });

  useEffect(() => {
    if (authStatus === "unauthenticated") {
      setSessionExpired(true);
    }
    return () => {
      document.body.style.cursor = "";
      document.documentElement.style.cursor = "";
    };
  }, [authStatus]);

  const build = useWorkspaceBuild({
    activeTab,
    initialStatus,
    onBuildError: () => {
      setMode("discuss");
      layout.setMobileSurface("chat");
      layout.setChatCollapsed(false);
    },
    onBuildSuccess: () => {
      setPostBuildChatOpen(true);
      setMode("discuss");
      layout.setMobileSurface("chat");
    },
    onEnergyInvalidate: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.energy });
    },
    onSetChatCollapsed: layout.setChatCollapsed,
    onSetMobileSurface: layout.setMobileSurface,
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
    onCollapseChatPanel: () => layout.chatPanelRef.current?.collapse(),
    onCompleteBuildProgress: () => build.setBuildProgress([]),
    onExpandChatPanel: () => layout.chatPanelRef.current?.expand(),
    onModeChange: setMode,
    onReloadPreview: build.reloadPreview,
    onSetBuildStartedAt: build.setBuildStartedAt,
    onSetChatCollapsed: layout.setChatCollapsed,
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
    onCompleteBuildProgress: () => build.setBuildProgress([]),
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
    setDraftTitle: title.setDraftTitle,
    setLatestBrief,
    setMode,
    setPostBuildChatOpen,
    setProjectTitle: title.setProjectTitle,
    startBuild: async () => {
      build.setBuildStatus("building");
      build.setBuildStartedAt(Date.now());
      build.setBuildProgress([]);
      build.resetProgressDeduper();
      setMode("build");
      layout.setMobileSurface("chat");
    },
    submitDirectEdit: directEdit.submitDirectEdit,
  });

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
  const showPreviewPanel = !layout.previewCollapsed || hasPreview || isBuilding;

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
      {...chat}
      authStatus={authStatus}
      buildComplete={buildComplete}
      buildProgress={build.buildProgress}
      buildStartedAt={build.buildStartedAt}
      closeChatPanel={layout.closeChatPanel}
      composerUploadsEnabled={composerUploadsEnabled}
      draftTitle={title.draftTitle}
      hasPreview={hasPreview}
      isBuilding={isBuilding}
      isRenaming={title.isRenaming}
      openPreviewPanel={layout.openPreviewPanel}
      projectId={projectId}
      projectTitle={title.projectTitle}
      readOnly={readOnly}
      saveProjectTitle={title.saveProjectTitle}
      sessionExpired={sessionExpired}
      setActiveTab={setActiveTab}
      setDraftTitle={title.setDraftTitle}
      setIsRenaming={title.setIsRenaming}
      setMode={setMode}
      setPostBuildChatOpen={setPostBuildChatOpen}
      signOut={async () => {}}
      stopCurrentJob={chat.stop}
      uploadTempImageFile={uploadTempImageFile}
    />
  );

  const previewPane = (
    <WorkspacePreviewPane
      {...directEdit}
      {...annotations}
      activeTab={activeTab}
      buildStatus={build.buildStatus}
      chatCollapsed={layout.chatCollapsed}
      closeChatPanel={layout.closeChatPanel}
      directEditFlagEnabled={directEditFlagEnabled}
      hasInitialPreview={hasInitialPreview}
      hasLastGoodPreview={hasLastGoodPreview}
      initialTitle={title.projectTitle}
      isBuilding={isBuilding}
      isLoadingSource={build.isLoadingSource}
      loadRuntimeState={() => void build.loadRuntimeState()}
      onRefreshPreview={build.reloadPreview}
      onRetrySource={build.reloadSource}
      openChatPanel={layout.openChatPanel}
      previewIssue={previewIssue}
      previewReloadKey={build.previewReloadKey}
      projectId={projectId}
      readOnly={readOnly}
      recoverPreviewRuntime={() => void build.recoverPreviewRuntime()}
      runtimeControl={runtimeControl}
      setActiveTab={setActiveTab}
      setMobileSurface={layout.setMobileSurface}
      setViewport={setViewport}
      shouldRenderGeneratedPreview={shouldRenderGeneratedPreview}
      sourceError={build.sourceError}
      sourceFiles={build.sourceFiles}
      sourceStatus={build.sourceStatus}
      startBuild={() => void chat.handleStartBuild()}
      viewport={viewport}
    />
  );

  return (
    <div
      className="flex h-dvh flex-col overflow-hidden bg-background text-foreground transition-colors duration-200"
      onTouchEnd={layout.handleTouchEnd}
      onTouchStart={layout.handleTouchStart}
    >
      {readOnly ? (
        <div className="shrink-0 border-b border-border/40 bg-muted/30 px-spacing-4 py-spacing-3 text-sm text-muted-foreground">
          Mode admin baca-saja. Kamu melihat proyek seperti pengguna, tanpa izin
          mengubah atau mengirim aksi.
        </div>
      ) : null}

      <WorkspaceNavigation
        hasPreview={hasPreview}
        mobileSurface={layout.mobileSurface}
        onOpenChat={layout.openChatPanel}
        onOpenMenu={() => setMobileMenuOpen(true)}
        onOpenPreview={layout.openPreviewPanel}
        onOpenRename={() => {
          title.setDraftTitle(title.projectTitle);
          title.setMobileRenameOpen(true);
        }}
        projectTitle={title.projectTitle}
        readOnly={readOnly}
      />

      {!layout.isDesktop ? (
        <div className="min-h-0 flex-1 overflow-hidden lg:hidden">
          {layout.mobileSurface === "chat" && chatPane}
          {layout.mobileSurface === "preview" && showPreviewPanel
            ? previewPane
            : null}
        </div>
      ) : null}

      {layout.isDesktop ? (
        <ResizablePanelGroup
          orientation="horizontal"
          className="min-h-0 flex-1 overflow-hidden"
        >
          <ResizablePanel
            id="chat"
            panelRef={layout.chatPanelRef}
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
                className="bg-border/20 transition-colors hover:bg-border/40"
              />
              <ResizablePanel
                id="preview"
                panelRef={layout.previewPanelRef}
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

      <WorkspaceRenameModal
        draftTitle={title.draftTitle}
        onOpenChange={title.setMobileRenameOpen}
        onSave={() => void title.saveProjectTitle()}
        open={title.mobileRenameOpen}
        setDraftTitle={title.setDraftTitle}
      />

      <WorkspaceMobileMenuSheet
        activeTab={activeTab}
        annotationAvailable={!readOnly && shouldRenderGeneratedPreview}
        directEditActive={directEdit.effectiveDirectEditMode}
        directEditFlagEnabled={directEditFlagEnabled}
        hasPreview={hasPreview}
        onOpenChange={setMobileMenuOpen}
        onPickTab={(tab) => {
          setActiveTab(tab);
          layout.setMobileSurface("preview");
          layout.openPreviewPanel();
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
