import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { WorkspacePreviewPane } from "./WorkspacePreviewPane";

describe("WorkspacePreviewPane", () => {
  it("renders preview container cleanly in static SSR render", () => {
    const queryClient = new QueryClient();

    const html = renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(WorkspacePreviewPane, {
          activeTab: "preview",
          addPendingAnnotation: vi.fn(),
          annotations: [],
          buildStatus: "ready",
          chatCollapsed: false,
          closeChatPanel: vi.fn(),
          directEditFlagEnabled: false,
          editHistory: { present: null, past: [], future: [] },
          editIntentHistory: { present: [], past: [], future: [] },
          editLayoutSignal: 0,
          effectiveDirectEditMode: false,
          handleAnnotationTarget: vi.fn(),
          handleDiscard: vi.fn(),
          handleRedo: vi.fn(),
          handleUndo: vi.fn(),
          hasInitialPreview: true,
          hasLastGoodPreview: true,
          initialTitle: "Warung Makan Enak",
          isBuilding: false,
          isLoadingSource: false,
          loadRuntimeState: vi.fn(),
          onRefreshPreview: vi.fn(),
          onRetrySource: vi.fn(),
          openChatPanel: vi.fn(),
          pendingAnnotationComment: "",
          pendingAnnotationTarget: null,
          pendingEditLayout: null,
          previewIssue: null,
          previewReloadKey: 0,
          projectId: "test-proj",
          queueDirectEditIntent: vi.fn(),
          readOnly: false,
          recoverPreviewRuntime: vi.fn(),
          runtimeControl: {
            activeSnapshotId: null,
            canPublish: false,
            hasUnpublishedPreview: false,
            isPublishing: false,
            onPublish: vi.fn(),
            onReload: vi.fn(),
            publishedPath: null,
            publishedState: "not_live",
          },
          saveDirectEdit: vi.fn().mockResolvedValue(undefined),
          sendFrameAction: vi.fn(),
          setActiveTab: vi.fn(),
          setEditIntentHistory: vi.fn(),
          setMobileSurface: vi.fn(),
          setPendingAnnotationComment: vi.fn(),
          setPendingAnnotationTarget: vi.fn(),
          setViewport: vi.fn(),
          shouldRenderGeneratedPreview: true,
          sourceError: null,
          sourceFiles: [],
          sourceStatus: "passed",
          startBuild: vi.fn(),
          toggleDirectEdit: vi.fn(),
          viewport: "desktop",
        }),
      ),
    );

    expect(html).toContain("workspace-preview-panel");
    expect(html).toContain("iframe");
  });
});
