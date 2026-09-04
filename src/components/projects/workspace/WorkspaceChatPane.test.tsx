import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { WorkspaceChatPane } from "./WorkspaceChatPane";

describe("WorkspaceChatPane", () => {
  it("renders composer with persistent action button 'Buat Website'", () => {
    const queryClient = new QueryClient();

    const html = renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(WorkspaceChatPane, {
          authStatus: "authenticated",
          buildComplete: false,
          buildProgress: [],
          buildRecommendationSignature: null,
          buildRecommendationStorageKey: "test-key",
          buildStartedAt: null,
          canStartBuildNow: false,
          chatScrollRef: { current: null },
          closeChatPanel: vi.fn(),
          composerState: "free_chat",
          composerUploadsEnabled: true,
          consumedBuildRecommendationSignatures: new Set<string>(),
          dismissBuildRecommendation: vi.fn(),
          draftTitle: "Kopi Nusantara",
          draggedComposerFileCount: 0,
          firstTurnPending: false,
          handleComposerDragEnter: vi.fn(),
          handleComposerDragLeave: vi.fn(),
          handleComposerDragOver: vi.fn(),
          handleComposerDrop: vi.fn(),
          handleMessageKeyDown: vi.fn(),
          handleMessageSubmit: vi.fn(),
          handlePrimaryComposerAction: vi.fn(),
          handleStartBuild: vi.fn().mockResolvedValue(undefined),
          hasActionableRecommendation: false,
          hasActiveTurnAssistantText: false,
          hasAnsweredActiveQuestion: false,
          hasMoreChat: false,
          hasPreview: false,
          holdBuildRecommendation: vi.fn(),
          ignoreNextScrollRef: { current: false },
          isBuilding: false,
          isChatNearBottom: () => true,
          isDraggingComposerFiles: false,
          isLoadingOlderChat: false,
          isPreparingNextQuestion: false,
          isProcessing: false,
          isRenaming: false,
          isResponding: false,
          isRetrying: false,
          isSubmittingTurn: false,
          loadOlderChat: vi.fn().mockResolvedValue(undefined),
          message: "",
          openBuildRecommendation: vi.fn(),
          openPreviewPanel: vi.fn(),
          pendingAttachments: [],
          preflightBlockedByCard: false,
          projectId: "test-proj",
          projectTitle: "Kopi Nusantara",
          questionComposerMode: "card",
          rateLimitError: null,
          readOnly: false,
          resumeError: null,
          retryChat: vi.fn().mockResolvedValue(undefined),
          retryWorkspaceCard: vi.fn().mockResolvedValue(undefined),
          saveProjectTitle: vi.fn().mockResolvedValue(undefined),
          scrollChatToBottom: vi.fn(),
          sessionExpired: false,
          setActiveTab: vi.fn(),
          setDraftTitle: vi.fn(),
          setHeldBuildRecommendationSignature: vi.fn(),
          setIsRenaming: vi.fn(),
          setMessage: vi.fn(),
          setMode: vi.fn(),
          setPendingAttachments: vi.fn(),
          setPostBuildChatOpen: vi.fn(),
          setQuestionComposerMode: vi.fn(),
          setShowScrollToBottom: vi.fn(),
          shouldStickToBottomRef: { current: true },
          showScrollToBottom: false,
          signOut: vi.fn().mockResolvedValue(undefined),
          stopCurrentJob: vi.fn(),
          submitChatText: vi.fn().mockResolvedValue(undefined),
          uploadTempImageFile: vi.fn().mockResolvedValue({ assetId: "a1" }),
          visibleMessages: [],
          workspaceCard: { type: "none" },
          workspaceCardError: false,
        }),
      ),
    );

    expect(html).toContain("Buat Website");
    expect(html).toContain("Kopi Nusantara");
  });
});
