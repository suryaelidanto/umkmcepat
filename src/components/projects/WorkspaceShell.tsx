"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import {
  ArrowLeft,
  ArrowUp,
  Check,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  FormEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { type PanelImperativeHandle } from "react-resizable-panels";

import {
  BuildProgressPanel,
  EmptyPreviewState,
  GeneratedPreviewFrame,
  ModePill,
  PreviewIssueState,
  ProcessingControl,
  QuestionComposer,
  VisualFeedbackWidget,
  WorkspaceCardView,
  WorkspaceTopBar,
  type BuildProgressStep,
  type BuildTab,
  type WorkspaceAnswerPayload,
  type WorkspaceRuntimeControl,
} from "@/components/projects/WorkspacePrimitives";
import { Button } from "@/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { type WorkspaceCard } from "@/lib/projects/brief";
import { type GeneratedProjectFile } from "@/lib/projects/generated-source";
import {
  createVisualAnnotationEditInstruction,
  createVisualAnnotationId,
  createVisualAnnotationSummary,
  type VisualAnnotationDraft,
} from "@/lib/projects/visual-annotations";
import {
  getBuildRecommendationHoldSignature,
  getWorkspaceComposerState,
  getWorkspacePreviewIssue,
  hasAnsweredWorkspaceQuestion,
  hasMissingWorkspaceUiTurn,
  isBuildRecommendationHeld,
  isWorkspaceBuildComplete,
  shouldRefreshWorkspaceAfterChatStatus,
  shouldUseGeneratedPreviewFrame,
  isUserVisibleAssistantText,
} from "@/lib/projects/workspace-sync";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
});

type WorkspaceShellProps = {
  projectId: string;
  initialTitle: string;
  initialPrompt?: string;
  initialStatus: string;
  initialMessages: UIMessage[];
  initialChatCursor: number | null;
  initialChatHasMore: boolean;
  initialWorkspaceCard: WorkspaceCard;
};

type RuntimeWorkspaceState = {
  activePreviewDeployment?: {
    id: string;
    lastRequestAt?: string | null;
    publicPath?: string | null;
    status: string;
  } | null;
  build: {
    artifactRef?: string | null;
    finishedAt?: string | null;
    id: string;
    logText?: string | null;
    startedAt?: string | null;
    status: string;
  } | null;
  deployment: {
    id: string;
    lastRequestAt?: string | null;
    publicPath?: string | null;
    status: string;
  } | null;
  events: Array<{
    id: string;
    message?: string | null;
    type: string;
  }>;
  publishedDeployment: {
    id: string;
    publicPath: string | null;
    slug: string | null;
    status: string;
  } | null;
  canPreview?: boolean;
  canPublish?: boolean;
  canRetry?: boolean;
  latestAttempt?: {
    id: string;
    status: string;
  } | null;
  latestFailedAttempt?: {
    id: string;
    status: string;
  } | null;
  latestSuccessfulBuild?: {
    id: string;
    status: string;
  } | null;
  message?: string | null;
  userFacingState?: string | null;
};

type WorkspaceStateResponse = {
  projectId: string;
  projectTitle: string;
  workspaceCard: WorkspaceCard;
};

export function WorkspaceShell({
  projectId,
  initialTitle,
  initialPrompt = "",
  initialStatus,
  initialMessages,
  initialChatCursor,
  initialChatHasMore,
  initialWorkspaceCard,
}: WorkspaceShellProps) {
  const [mode, setMode] = useState<"build" | "discuss">("discuss");
  const [viewport, setViewport] = useState<"desktop" | "mobile">("desktop");
  const [message, setMessage] = useState("");
  const [projectTitle, setProjectTitle] = useState(initialTitle);
  const [isRenaming, setIsRenaming] = useState(false);
  const [draftTitle, setDraftTitle] = useState(initialTitle);
  const [buildStatus, setBuildStatus] = useState(initialStatus);
  const hasInitialPreview = ["passed", "ready", "succeeded"].includes(
    initialStatus,
  );
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [previewCollapsed, setPreviewCollapsed] = useState(!hasInitialPreview);
  const [activeTab, setActiveTab] = useState<BuildTab>("preview");
  const [sourceFiles, setSourceFiles] = useState<GeneratedProjectFile[]>([]);
  const [sourceStatus, setSourceStatus] = useState("not_started");
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [isLoadingSource, setIsLoadingSource] = useState(false);
  const [sourceReloadKey, setSourceReloadKey] = useState(0);
  const [buildProgress, setBuildProgress] = useState<BuildProgressStep[]>([]);
  const [buildStartedAt, setBuildStartedAt] = useState<number | null>(null);
  const [runtimeState, setRuntimeState] =
    useState<RuntimeWorkspaceState | null>(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishedPath, setPublishedPath] = useState<string | null>(null);
  const [previewReloadKey, setPreviewReloadKey] = useState(0);
  const [workspaceCard, setWorkspaceCard] =
    useState<WorkspaceCard>(initialWorkspaceCard);
  const [
    heldBuildRecommendationSignature,
    setHeldBuildRecommendationSignature,
  ] = useState<string | null>(null);
  const [postBuildChatOpen, setPostBuildChatOpen] = useState(false);
  const [olderMessages, setOlderMessages] = useState<UIMessage[]>([]);
  const [chatCursor, setChatCursor] = useState<number | null>(
    initialChatCursor,
  );
  const [hasMoreChat, setHasMoreChat] = useState(initialChatHasMore);
  const [isLoadingOlderChat, setIsLoadingOlderChat] = useState(false);
  const prompt = initialPrompt.trim();
  const buildRecommendationStorageKey = `umkmcepat:build-recommendation-hold:${projectId}`;
  const visualAnnotationStorageKey = `umkmcepat:visual-comments:${projectId}`;
  const hasStartedChat = useRef(false);
  const hasStartedBuild = useRef(false);
  const modeRef = useRef(mode);
  const buildAbortRef = useRef<AbortController | null>(null);
  const chatPanelRef = useRef<PanelImperativeHandle | null>(null);
  const previewPanelRef = useRef<PanelImperativeHandle | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const olderChatSentinelRef = useRef<HTMLDivElement | null>(null);
  const hasAutoOpenedPreview = useRef(hasInitialPreview);
  const previousLiveMessageCount = useRef(initialMessages.length);
  const runtimeRequestRef = useRef<Promise<void> | null>(null);
  const runtimeRetryAfterRef = useRef(0);
  const previousScrollHeight = useRef<number | null>(null);
  const shouldStickToBottomRef = useRef(true);
  const ignoreNextScrollRef = useRef(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isEditingPreview, setIsEditingPreview] = useState(false);
  const visualEditInFlightRef = useRef(false);
  const [annotationMode, setAnnotationMode] = useState(false);
  const [annotationInstruction, setAnnotationInstruction] = useState("");
  const [annotations, setAnnotations] = useState<VisualAnnotationDraft[]>([]);
  const [pendingAnnotationTarget, setPendingAnnotationTarget] = useState<Omit<
    VisualAnnotationDraft,
    "comment" | "id"
  > | null>(null);
  const [pendingAnnotationComment, setPendingAnnotationComment] = useState("");
  const [rateLimitError, setRateLimitError] = useState<{
    message: string;
    retryAfter: number;
  } | null>(null);
  const [questionComposerMode, setQuestionComposerMode] = useState<
    "options" | "free"
  >("options");
  const [mobileSurface, setMobileSurface] = useState<"chat" | "preview">(
    hasInitialPreview ? "preview" : "chat",
  );
  const {
    messages,
    sendMessage,
    setMessages,
    status,
    error,
    stop,
    regenerate,
    clearError,
  } = useChat({
    id: projectId,
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: "/api/projects/preview",
      fetch: rateLimitAwareFetch,
      prepareSendMessagesRequest({ messages }) {
        return {
          body: {
            message: messages[messages.length - 1],
            mode: modeRef.current,
            projectId,
          },
        };
      },
    }),
  });
  const previousChatStatus = useRef(status);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    return () => {
      document.body.style.cursor = "";
      document.documentElement.style.cursor = "";
    };
  }, []);

  useEffect(() => {
    setHeldBuildRecommendationSignature(
      window.localStorage.getItem(buildRecommendationStorageKey),
    );
  }, [buildRecommendationStorageKey]);

  useEffect(() => {
    const raw = window.localStorage.getItem(visualAnnotationStorageKey);

    if (!raw) {
      return;
    }

    try {
      const draft = JSON.parse(raw) as {
        annotations?: VisualAnnotationDraft[];
        instruction?: string;
      };

      if (Array.isArray(draft.annotations)) {
        setAnnotations(draft.annotations);
      }

      if (typeof draft.instruction === "string") {
        setAnnotationInstruction(draft.instruction);
      }
    } catch {
      window.localStorage.removeItem(visualAnnotationStorageKey);
    }
  }, [visualAnnotationStorageKey]);

  useEffect(() => {
    if (!annotations.length && !annotationInstruction.trim()) {
      window.localStorage.removeItem(visualAnnotationStorageKey);
      return;
    }

    window.localStorage.setItem(
      visualAnnotationStorageKey,
      JSON.stringify({ annotations, instruction: annotationInstruction }),
    );
  }, [annotationInstruction, annotations, visualAnnotationStorageKey]);

  const loadRuntimeState = useCallback(async () => {
    if (runtimeRequestRef.current) {
      return runtimeRequestRef.current;
    }

    if (Date.now() < runtimeRetryAfterRef.current) {
      return;
    }

    const request = (async () => {
      try {
        const response = await fetch(`/api/projects/${projectId}/runtime`, {
          cache: "no-store",
        });

        if (response.status === 503) {
          const retryAfter = Number(response.headers.get("Retry-After") || "3");
          runtimeRetryAfterRef.current = Date.now() + retryAfter * 1000;
          return;
        }

        if (!response.ok) {
          return;
        }

        const result = (await response.json()) as RuntimeWorkspaceState;

        setRuntimeState(result);
        setRuntimeError(null);

        if (result.latestSuccessfulBuild) {
          setSourceStatus("passed");
        }

        if (result.publishedDeployment?.publicPath) {
          setPublishedPath(result.publishedDeployment.publicPath);
        }
      } catch {
        runtimeRetryAfterRef.current = Date.now() + 3000;
      } finally {
        runtimeRequestRef.current = null;
      }
    })();

    runtimeRequestRef.current = request;
    return request;
  }, [projectId]);

  const loadWorkspaceState = useCallback(async () => {
    const response = await fetch(`/api/projects/${projectId}/workspace`, {
      cache: "no-store",
    });

    if (!response.ok) {
      return;
    }

    const result = (await response.json()) as WorkspaceStateResponse;

    setWorkspaceCard(result.workspaceCard);
    setProjectTitle(result.projectTitle);
    setDraftTitle(result.projectTitle);
  }, [projectId]);

  const retryPreviewRuntime = useCallback(() => {
    setRuntimeError(null);
    setPreviewReloadKey((current) => current + 1);
    void loadRuntimeState();
  }, [loadRuntimeState]);

  const publishProject = useCallback(async () => {
    if (isPublishing) {
      return;
    }

    setIsPublishing(true);
    setRuntimeError(null);

    try {
      const response = await fetch(`/api/projects/${projectId}/publish`, {
        method: "POST",
      });
      const result = (await response.json().catch(() => null)) as {
        message?: string;
        path?: string;
      } | null;

      if (!response.ok || !result?.path) {
        setRuntimeError(result?.message || "Website belum bisa diterbitkan.");
        return;
      }

      setPublishedPath(result.path);
      await loadRuntimeState();
    } catch {
      setRuntimeError("Website belum bisa diterbitkan.");
    } finally {
      setIsPublishing(false);
    }
  }, [isPublishing, loadRuntimeState, projectId]);

  const startBuild = useCallback(async () => {
    if (buildStatus === "building") {
      return;
    }

    window.localStorage.removeItem(buildRecommendationStorageKey);
    setHeldBuildRecommendationSignature(null);
    setPostBuildChatOpen(false);
    setMode("build");
    setBuildStatus("building");
    setSourceStatus("not_started");
    setBuildProgress([]);
    setBuildStartedAt(Date.now());
    setActiveTab("preview");
    setMobileSurface("preview");

    const abortController = new AbortController();
    buildAbortRef.current = abortController;

    try {
      const response = await fetch(`/api/projects/${projectId}/generate`, {
        method: "POST",
        signal: abortController.signal,
      });

      if (!response.ok || !response.body) {
        setBuildStatus("failed");
        setBuildProgress((current) =>
          addBuildProgressStep(current, {
            detail: "Server belum bisa memulai proses build. Coba ulangi.",
            label: "Build belum mulai",
            status: "error",
          }),
        );
        return;
      }

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
            detail?: string;
            label?: string;
            message?: string;
            path?: string;
            state?: "failed" | "succeeded";
            title?: string;
            type?: string;
          };

          if (eventName === "progress" && "label" in data && data.label) {
            const label = data.label;

            setBuildProgress((current) =>
              addBuildProgressStep(current, {
                detail: data.detail || "",
                label,
                status: "active",
              }),
            );
          }

          if (eventName === "operation" && data.title) {
            const title = data.title;
            setBuildProgress((current) =>
              addBuildProgressStep(current, {
                detail: data.path
                  ? `${data.path} — ${data.detail || "Operasi selesai."}`
                  : (data.detail ?? "Operasi selesai."),
                label: title,
                status: data.state === "failed" ? "error" : "done",
              }),
            );
          }

          if (eventName === "schema" || eventName === "done") {
            setActiveTab("preview");
          }

          if (eventName === "done") {
            setBuildStatus("ready");
            setBuildProgress((current) => completeBuildProgress(current));
            void loadRuntimeState();
          }

          if (eventName === "error") {
            setBuildStatus("failed");
            void loadRuntimeState();
            setBuildProgress((current) =>
              addBuildProgressStep(current, {
                detail:
                  "Build berhenti sebelum tampilan website siap. Coba ulangi build.",
                label: "Build belum selesai",
                status: "error",
              }),
            );
          }
        }
      }
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        setBuildStatus("failed");
        void loadRuntimeState();
        setBuildProgress((current) =>
          addBuildProgressStep(current, {
            detail: "Koneksi build terputus. Coba jalankan build lagi.",
            label: "Build terputus",
            status: "error",
          }),
        );
      }
    } finally {
      buildAbortRef.current = null;
    }
  }, [buildRecommendationStorageKey, buildStatus, loadRuntimeState, projectId]);

  useEffect(() => {
    if (
      hasStartedBuild.current ||
      initialStatus === "ready" ||
      initialStatus === "discussing" ||
      initialStatus === "failed"
    ) {
      return;
    }

    hasStartedBuild.current = true;
    void startBuild();
  }, [initialStatus, startBuild]);

  useEffect(() => {
    if (hasStartedChat.current || !prompt || initialMessages.length) {
      return;
    }

    hasStartedChat.current = true;
    sendMessage({ text: prompt }, { body: { mode } });
  }, [initialMessages.length, mode, prompt, sendMessage]);

  const isResponding = status === "submitted" || status === "streaming";
  const isBuilding = buildStatus === "building";
  const isProcessing = isResponding || isBuilding || isEditingPreview;
  const allMessages = useMemo(
    () => dedupeUiMessages([...olderMessages, ...messages]),
    [messages, olderMessages],
  );
  const visibleMessages = useMemo(
    () =>
      filterDiscussionMessagesWithWorkspaceUi(allMessages, mode === "discuss"),
    [allMessages, mode],
  );
  const buildRecommendationSignature =
    getBuildRecommendationHoldSignature(workspaceCard);
  const buildRecommendationHeld = isBuildRecommendationHeld(
    workspaceCard,
    heldBuildRecommendationSignature,
  );
  const buildComplete = isWorkspaceBuildComplete({
    buildStatus,
    runtimeBuildStatus: runtimeState?.build?.status,
    sourceStatus,
  });
  const hasFailedLatestAttemptWithLastGood =
    runtimeState?.userFacingState === "ready_with_failed_latest_attempt" &&
    Boolean(runtimeState.build || runtimeState.deployment);
  const composerState = getWorkspaceComposerState({
    buildComplete,
    card: workspaceCard,
    hasFailedLatestAttemptWithLastGood,
    held: buildRecommendationHeld,
    postBuildChatOpen,
  });
  const activeQuestionKey =
    workspaceCard.type === "question"
      ? workspaceCard.question.id
      : workspaceCard.type;
  const previewIssue = getWorkspacePreviewIssue({
    buildStatus,
    deploymentStatus: runtimeState?.deployment?.status,
    runtimeBuildStatus: runtimeState?.build?.status,
    runtimeError,
    runtimeUserFacingState: runtimeState?.userFacingState,
    sourceStatus,
  });
  const shouldRenderGeneratedPreview = shouldUseGeneratedPreviewFrame({
    buildComplete,
    sourceStatus,
  });
  const hasPreview = shouldRenderGeneratedPreview;
  const showPreviewPanel = !previewCollapsed;
  const showChatPanel = !chatCollapsed;
  const missingWorkspaceUiTurn = hasMissingWorkspaceUiTurn({
    card: workspaceCard,
    messages: allMessages,
    mode,
  });
  const hasAnsweredActiveQuestion = hasAnsweredWorkspaceQuestion({
    card: workspaceCard,
    messages: allMessages,
    mode,
  });
  const runtimeControl = createRuntimeControl({
    buildStatus,
    isPublishing,
    onPublish: publishProject,
    onRetryPreview: retryPreviewRuntime,
    publishedPath,
    runtimeError,
    runtimeState,
    sourceStatus,
  });

  useEffect(() => {
    void loadRuntimeState();

    if (
      buildStatus !== "building" &&
      runtimeState?.deployment?.status !== "starting" &&
      runtimeState?.deployment?.status !== "running"
    ) {
      return;
    }

    const interval = window.setInterval(() => {
      void loadRuntimeState();
    }, 7000);

    return () => window.clearInterval(interval);
  }, [buildStatus, loadRuntimeState, runtimeState?.deployment?.status]);

  useEffect(() => {
    if (!hasPreview || hasAutoOpenedPreview.current) {
      return;
    }

    hasAutoOpenedPreview.current = true;
    setMobileSurface("preview");
    setChatCollapsed(false);
    setPreviewCollapsed(false);

    const frame = window.requestAnimationFrame(() => {
      chatPanelRef.current?.resize("25%");
      previewPanelRef.current?.resize("75%");
    });

    return () => window.cancelAnimationFrame(frame);
  }, [hasPreview]);

  useEffect(() => {
    if (activeTab !== "code") {
      return;
    }

    const controller = new AbortController();

    async function loadSource() {
      setIsLoadingSource(true);
      setSourceError(null);

      try {
        const response = await fetch(`/api/projects/${projectId}/source`, {
          signal: controller.signal,
        });
        const result = (await response.json()) as {
          buildStatus?: string;
          files?: GeneratedProjectFile[];
        };

        if (controller.signal.aborted) {
          return;
        }

        if (!response.ok) {
          setSourceError(
            "Kode website belum bisa dimuat. Coba lagi tanpa kehilangan tampilan terakhir.",
          );
          return;
        }

        setSourceFiles(result.files ?? []);
        setSourceStatus(result.buildStatus ?? "not_started");
      } catch {
        if (!controller.signal.aborted) {
          setSourceError(
            "Kode website belum bisa dimuat. Coba lagi tanpa kehilangan tampilan terakhir.",
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingSource(false);
        }
      }
    }

    void loadSource();

    return () => controller.abort();
  }, [activeTab, buildStatus, projectId, sourceReloadKey]);

  const reloadLatestChat = useCallback(async () => {
    const response = await fetch(`/api/projects/${projectId}/chat?limit=20`, {
      cache: "no-store",
    });
    const result = (await response.json()) as {
      messages?: UIMessage[];
      nextCursor?: number | null;
      hasMore?: boolean;
    };

    if (!response.ok) {
      return;
    }

    setMessages(result.messages || []);
    setOlderMessages([]);
    setChatCursor(result.nextCursor ?? null);
    setHasMoreChat(Boolean(result.hasMore));
  }, [projectId, setMessages]);

  const loadOlderChat = useCallback(async () => {
    if (!hasMoreChat || isLoadingOlderChat || chatCursor === null) {
      return;
    }

    setIsLoadingOlderChat(true);
    previousScrollHeight.current = chatScrollRef.current?.scrollHeight ?? null;
    try {
      const response = await fetch(
        `/api/projects/${projectId}/chat?before=${chatCursor}`,
      );
      const result = (await response.json()) as {
        messages?: UIMessage[];
        nextCursor?: number | null;
        hasMore?: boolean;
      };

      if (response.ok) {
        setOlderMessages((current) => [...(result.messages || []), ...current]);
        setChatCursor(result.nextCursor ?? null);
        setHasMoreChat(Boolean(result.hasMore));
      }
    } finally {
      setIsLoadingOlderChat(false);
    }
  }, [chatCursor, hasMoreChat, isLoadingOlderChat, projectId]);

  function stopCurrentJob() {
    if (isResponding) {
      stop();
      return;
    }

    buildAbortRef.current?.abort();
    buildAbortRef.current = null;
    void fetch(`/api/projects/${projectId}/stop`, { method: "POST" });
    setBuildStatus("draft");
    setMode("discuss");
  }

  useEffect(() => {
    const sentinel = olderChatSentinelRef.current;
    const root = chatScrollRef.current;

    if (!sentinel || !root || !hasMoreChat) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadOlderChat();
        }
      },
      { root, rootMargin: "160px 0px 0px 0px" },
    );

    observer.observe(sentinel);

    return () => observer.disconnect();
  }, [chatCursor, hasMoreChat, isLoadingOlderChat, loadOlderChat]);

  useEffect(() => {
    const element = chatScrollRef.current;

    if (element && previousScrollHeight.current !== null) {
      element.scrollTop += element.scrollHeight - previousScrollHeight.current;
      previousScrollHeight.current = null;
    }
  }, [olderMessages.length]);

  const scrollChatToBottom = useCallback(() => {
    const element = chatScrollRef.current;

    if (!element) {
      return;
    }

    ignoreNextScrollRef.current = true;
    element.scrollTop = element.scrollHeight;
    window.setTimeout(() => {
      ignoreNextScrollRef.current = false;
    }, 80);
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(scrollChatToBottom);
    const timeout = window.setTimeout(scrollChatToBottom, 120);

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [scrollChatToBottom]);

  useEffect(() => {
    const element = chatScrollRef.current;

    if (!element || messages.length <= previousLiveMessageCount.current) {
      previousLiveMessageCount.current = messages.length;
      return;
    }

    if (shouldStickToBottomRef.current) {
      scrollChatToBottom();
    }

    previousLiveMessageCount.current = messages.length;
  }, [messages.length, scrollChatToBottom]);

  useEffect(() => {
    setQuestionComposerMode("options");
    setMessage("");
  }, [activeQuestionKey]);

  useEffect(() => {
    if (!isResponding || !shouldStickToBottomRef.current) {
      return;
    }

    const frame = requestAnimationFrame(scrollChatToBottom);
    const timeout = window.setTimeout(scrollChatToBottom, 120);

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [isResponding, messages, scrollChatToBottom]);

  useEffect(() => {
    if (shouldStickToBottomRef.current) {
      requestAnimationFrame(scrollChatToBottom);
    }
  }, [questionComposerMode, workspaceCard, scrollChatToBottom]);

  useEffect(() => {
    const workspaceUpdate = getLatestWorkspaceUpdateFromMessages(messages);

    if (workspaceUpdate?.workspaceCard) {
      setWorkspaceCard(workspaceUpdate.workspaceCard);
      clearError();
      setRateLimitError(null);
    }

    if (workspaceUpdate?.projectTitle) {
      setProjectTitle(workspaceUpdate.projectTitle);
      setDraftTitle(workspaceUpdate.projectTitle);
    }
  }, [clearError, messages]);

  useEffect(() => {
    const previous = previousChatStatus.current;

    previousChatStatus.current = status;

    if (!shouldRefreshWorkspaceAfterChatStatus(previous, status)) {
      return;
    }

    void loadWorkspaceState();
    void reloadLatestChat();
    const timeout = window.setTimeout(() => {
      void loadWorkspaceState();
      void reloadLatestChat();
    }, 500);

    return () => window.clearTimeout(timeout);
  }, [loadWorkspaceState, reloadLatestChat, status]);

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

  function addPendingAnnotation() {
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
  }

  function removeAnnotation(id: string) {
    setAnnotations((current) => current.filter((item) => item.id !== id));
  }

  async function sendVisualAnnotations() {
    if (!annotations.length || isProcessing || visualEditInFlightRef.current) {
      return;
    }

    visualEditInFlightRef.current = true;

    const summary = createVisualAnnotationSummary({
      annotations,
      instruction: annotationInstruction,
    });
    const instruction = createVisualAnnotationEditInstruction({
      annotations,
      instruction: annotationInstruction,
    });

    setIsEditingPreview(true);
    setBuildStartedAt(Date.now());
    setBuildProgress((current) =>
      addBuildProgressStep(current, {
        detail: "AI menerapkan komentar visual ke source preview terakhir.",
        label: "Merevisi dari komentar visual",
        status: "active",
      }),
    );
    setMessages((current) => [
      ...current,
      {
        id: createVisualAnnotationId(),
        metadata: undefined,
        parts: [{ text: summary, type: "text" }],
        role: "user",
      },
    ]);

    try {
      const response = await fetch(`/api/projects/${projectId}/edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          annotations,
          instruction,
          kind: "visual_comment",
          summary,
        }),
      });
      const result = (await response.json().catch(() => null)) as {
        buildStatus?: string;
        message?: string;
      } | null;

      if (!response.ok || result?.buildStatus !== "succeeded") {
        setBuildProgress((current) =>
          addBuildProgressStep(current, {
            detail:
              result?.message ||
              "Komentar visual belum berhasil dibuild. Komentar tetap aman.",
            label: "Revisi visual belum selesai",
            status: "error",
          }),
        );
        return;
      }

      setAnnotations([]);
      setAnnotationInstruction("");
      window.localStorage.removeItem(visualAnnotationStorageKey);
      setAnnotationMode(false);
      setBuildStatus("ready");
      setBuildProgress((current) => completeBuildProgress(current));
      setActiveTab("preview");
      setPreviewCollapsed(false);
      setPreviewReloadKey((current) => current + 1);
      void loadRuntimeState();
    } finally {
      visualEditInFlightRef.current = false;
      setIsEditingPreview(false);
    }
  }

  async function saveProjectTitle() {
    const title = draftTitle.trim();

    if (!title || title === projectTitle) {
      setIsRenaming(false);
      setDraftTitle(projectTitle);
      return;
    }

    setProjectTitle(title);
    setDraftTitle(title);

    const response = await fetch(`/api/projects/${projectId}/title`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    const result = (await response.json().catch(() => null)) as {
      title?: string;
    } | null;

    if (response.ok && result?.title) {
      setProjectTitle(result.title);
      setDraftTitle(result.title);
    } else {
      setProjectTitle(projectTitle);
      setDraftTitle(projectTitle);
    }

    setIsRenaming(false);
  }

  const submitChatText = useCallback(
    (
      text: string,
      options: { workspaceAnswers?: WorkspaceAnswerPayload[] } = {},
    ) => {
      const trimmed = text.trim();

      if (!trimmed || isProcessing || rateLimitError) {
        return;
      }

      shouldStickToBottomRef.current = true;
      setRateLimitError(null);
      setMessage("");
      requestAnimationFrame(scrollChatToBottom);

      if (composerState === "post_build_chat") {
        setIsEditingPreview(true);
        setBuildStartedAt(Date.now());
        setBuildProgress((current) =>
          addBuildProgressStep(current, {
            detail:
              "AI menerapkan perubahan ke source preview terakhir yang berhasil.",
            label: "Mengedit website",
            status: "active",
          }),
        );
        void fetch(`/api/projects/${projectId}/edit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ instruction: trimmed }),
        })
          .then(async (response) => {
            const result = (await response.json().catch(() => null)) as {
              buildStatus?: string;
              message?: string;
            } | null;

            if (!response.ok || result?.buildStatus !== "succeeded") {
              setBuildProgress((current) =>
                addBuildProgressStep(current, {
                  detail:
                    result?.message ||
                    "Edit belum berhasil dibuild. Tampilan terakhir tetap aman.",
                  label: "Edit belum selesai",
                  status: "error",
                }),
              );
              return;
            }

            setBuildStatus("ready");
            setBuildProgress((current) => completeBuildProgress(current));
            setActiveTab("preview");
            setChatCollapsed(false);
            setPreviewCollapsed(false);
            chatPanelRef.current?.resize("25%");
            previewPanelRef.current?.resize("75%");
            setPreviewReloadKey((current) => current + 1);
            void loadRuntimeState();
          })
          .catch(() => {
            setBuildProgress((current) =>
              addBuildProgressStep(current, {
                detail: "Koneksi edit terputus. Tampilan terakhir tetap aman.",
                label: "Edit terputus",
                status: "error",
              }),
            );
          })
          .finally(() => setIsEditingPreview(false));
        return;
      }

      sendMessage(
        { text: trimmed },
        { body: { mode, workspaceAnswers: options.workspaceAnswers } },
      );
    },
    [
      composerState,
      isProcessing,
      loadRuntimeState,
      mode,
      projectId,
      rateLimitError,
      scrollChatToBottom,
      sendMessage,
    ],
  );

  const holdBuildRecommendation = useCallback(() => {
    if (!buildRecommendationSignature) {
      return;
    }

    window.localStorage.setItem(
      buildRecommendationStorageKey,
      buildRecommendationSignature,
    );
    setHeldBuildRecommendationSignature(buildRecommendationSignature);
    setMode("discuss");
  }, [buildRecommendationSignature, buildRecommendationStorageKey]);

  const openBuildRecommendation = useCallback(() => {
    window.localStorage.removeItem(buildRecommendationStorageKey);
    setHeldBuildRecommendationSignature(null);
  }, [buildRecommendationStorageKey]);

  function handleMessageSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submitChatText(message);
  }

  function handleMessageKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.nativeEvent.isComposing
    ) {
      return;
    }

    event.preventDefault();
    submitChatText(message);
  }

  const retryLastTurn = useCallback(async () => {
    if (status === "streaming" || status === "submitted" || isRetrying) {
      return;
    }

    setIsRetrying(true);
    clearError();
    try {
      // Re-run the last turn server-side. The user's answer was already
      // persisted before the failed stream, so this never loses input and the
      // existing AI rate limit still applies (no abuse via spam retries).
      await regenerate().catch((error) => {
        if (!captureRateLimitError(error, setRateLimitError)) {
          throw error;
        }
      });
    } finally {
      setIsRetrying(false);
    }
  }, [clearError, isRetrying, regenerate, status]);

  useEffect(() => {
    if (error) {
      captureRateLimitError(error, setRateLimitError);
    }
  }, [error]);

  function closePreviewPanel() {
    if (!showChatPanel) {
      return;
    }

    chatPanelRef.current?.resize("100%");
    previewPanelRef.current?.collapse();
    window.setTimeout(() => setPreviewCollapsed(true), 300);
  }

  function closeChatPanel() {
    if (!showPreviewPanel) {
      return;
    }

    setChatCollapsed(true);
    chatPanelRef.current?.collapse();
    previewPanelRef.current?.resize("100%");
  }

  const openPreviewPanel = useCallback(() => {
    setMobileSurface("preview");
    setChatCollapsed(false);
    setPreviewCollapsed(false);
    window.requestAnimationFrame(() => {
      chatPanelRef.current?.resize("25%");
      previewPanelRef.current?.resize("75%");
    });
  }, []);

  function openChatPanel() {
    setMobileSurface("chat");
    setChatCollapsed(false);
    setPreviewCollapsed(false);
    window.requestAnimationFrame(() => {
      chatPanelRef.current?.resize("25%");
      previewPanelRef.current?.resize("75%");
    });
  }

  const chatPanelClass =
    "flex h-full min-h-0 min-w-0 overflow-x-hidden flex-col bg-[#1b1b19] p-spacing-5";
  const previewPanelClass = "h-full min-h-0 min-w-0";

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[#10100f] text-surface-warm-white">
      <nav
        aria-label="Pilih tampilan ruang kerja"
        className="flex h-12 shrink-0 items-center gap-spacing-2 border-b border-surface-warm-white/10 bg-[#1b1b19] px-spacing-4 md:hidden"
      >
        <button
          type="button"
          aria-pressed={mobileSurface === "chat"}
          onClick={openChatPanel}
          className="min-h-11 flex-1 rounded-radius-lg px-spacing-4 text-sm font-medium aria-pressed:bg-surface-warm-white aria-pressed:text-foreground-primary"
        >
          Diskusi
        </button>
        <button
          type="button"
          aria-pressed={mobileSurface === "preview"}
          disabled={!hasPreview && !isBuilding}
          onClick={openPreviewPanel}
          className="min-h-11 flex-1 rounded-radius-lg px-spacing-4 text-sm font-medium aria-pressed:bg-surface-warm-white aria-pressed:text-foreground-primary disabled:opacity-40"
        >
          Tampilan
        </button>
      </nav>
      <ResizablePanelGroup
        orientation="horizontal"
        className="min-h-0 flex-1 overflow-hidden"
      >
        <ResizablePanel
          id="chat"
          className={
            mobileSurface === "chat"
              ? "transition-[flex-grow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none max-md:!flex-1"
              : "transition-[flex-grow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none max-md:hidden"
          }
          panelRef={chatPanelRef}
          defaultSize={showPreviewPanel ? "25%" : "100%"}
          minSize="20%"
          collapsible
          collapsedSize={0}
        >
          <aside className={chatPanelClass}>
            <div className="flex min-w-0 items-start justify-between gap-spacing-5 px-spacing-1">
              <div className="min-w-0 flex-1">
                <Link
                  href="/"
                  className="inline-flex items-center gap-spacing-2 text-xs text-surface-warm-white/58 hover:text-surface-warm-white"
                >
                  <ArrowLeft className="size-3.5" />
                  Dashboard
                </Link>
                <div className="mt-spacing-3 flex items-center gap-spacing-2">
                  {isRenaming ? (
                    <input
                      value={draftTitle}
                      onChange={(event) => setDraftTitle(event.target.value)}
                      onBlur={() => void saveProjectTitle()}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          void saveProjectTitle();
                        }

                        if (event.key === "Escape") {
                          setDraftTitle(projectTitle);
                          setIsRenaming(false);
                        }
                      }}
                      autoFocus
                      className="min-w-0 flex-1 rounded-radius-md border border-surface-warm-white/12 bg-surface-warm-white/8 px-spacing-3 py-spacing-2 text-base font-semibold text-surface-warm-white outline-none focus:border-surface-warm-white/30"
                    />
                  ) : (
                    <h1 className="truncate text-base font-semibold tracking-[-0.02em]">
                      {projectTitle}
                    </h1>
                  )}
                  {isRenaming ? (
                    <button
                      type="button"
                      onClick={() => void saveProjectTitle()}
                      className="rounded-full p-spacing-2 text-[#8ce99a] hover:bg-surface-warm-white/8"
                      aria-label="Simpan nama proyek"
                    >
                      <Check className="size-3.5" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsRenaming(true)}
                      className="rounded-full p-spacing-2 text-surface-warm-white/44 hover:bg-surface-warm-white/8 hover:text-surface-warm-white"
                      aria-label="Ubah nama proyek"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-spacing-2">
                <button
                  type="button"
                  onClick={
                    showPreviewPanel ? closePreviewPanel : openPreviewPanel
                  }
                  className="hidden rounded-full border border-surface-warm-white/10 p-spacing-3 text-surface-warm-white/62 hover:bg-surface-warm-white/8 hover:text-surface-warm-white lg:block"
                  aria-label={
                    showPreviewPanel ? "Tutup tampilan" : "Buka tampilan"
                  }
                >
                  {showPreviewPanel ? (
                    <PanelRightClose className="size-4" />
                  ) : (
                    <PanelRightOpen className="size-4" />
                  )}
                </button>
              </div>
            </div>

            <div
              ref={chatScrollRef}
              onScroll={(event) => {
                if (ignoreNextScrollRef.current) {
                  return;
                }

                const element = event.currentTarget;
                shouldStickToBottomRef.current =
                  element.scrollHeight -
                    element.scrollTop -
                    element.clientHeight <
                  120;
              }}
              className="mt-spacing-5 min-h-0 flex-1 space-y-spacing-6 overflow-y-auto overflow-x-hidden px-spacing-1 pr-spacing-2 [scrollbar-color:#6f6a60_transparent] [scrollbar-width:thin]"
            >
              {hasMoreChat ? (
                <div
                  ref={olderChatSentinelRef}
                  className="py-spacing-3 text-center"
                >
                  {isLoadingOlderChat ? (
                    <span className="text-xs text-surface-warm-white/42">
                      Memuat chat lama...
                    </span>
                  ) : null}
                </div>
              ) : null}
              <ChatMessages messages={visibleMessages} />

              {isBuilding || buildProgress.length ? (
                <BuildProgressPanel
                  elapsedFrom={buildStartedAt}
                  isBuilding={isBuilding}
                  steps={buildProgress}
                />
              ) : null}

              {isResponding ? (
                <p className="text-sm text-surface-warm-white/46">
                  AI sedang menyiapkan jawaban...
                </p>
              ) : null}
              {rateLimitError ? (
                <div className="rounded-[18px] border border-[#ffb4a6]/24 bg-[#ffb4a6]/[0.06] px-spacing-5 py-spacing-4">
                  <p className="text-sm font-medium text-[#ffb4a6]">
                    {rateLimitError.message}
                  </p>
                </div>
              ) : error || (!isResponding && missingWorkspaceUiTurn) ? (
                <div className="rounded-[18px] border border-[#ffb4a6]/24 bg-[#ffb4a6]/[0.06] px-spacing-5 py-spacing-4">
                  <p className="text-sm font-medium text-[#ffb4a6]">
                    {isRetrying
                      ? "AI sempat terputus. Mencoba menyambung ulang..."
                      : "AI belum sempat menyiapkan pilihan. Jawabanmu sudah tersimpan, jadi kamu bisa coba lagi."}
                  </p>
                  {!isRetrying ? (
                    <Button
                      type="button"
                      onClick={() => void retryLastTurn()}
                      className="mt-spacing-3 h-9 rounded-full bg-surface-warm-white px-spacing-5 text-xs text-foreground-primary hover:bg-surface-warm-white/86"
                    >
                      Coba lagi
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="mt-spacing-5">
              {isProcessing ? (
                <ProcessingControl
                  mode={isBuilding ? "Buat" : "Diskusi"}
                  onStop={stopCurrentJob}
                />
              ) : rateLimitError ? (
                <div className="mt-spacing-3 rounded-[22px] border border-surface-warm-white/10 bg-[#242421] px-spacing-5 py-spacing-4 text-sm text-surface-warm-white/62">
                  Tunggu sebentar sebelum mengirim jawaban berikutnya.
                </div>
              ) : !missingWorkspaceUiTurn &&
                !hasAnsweredActiveQuestion &&
                composerState === "question" &&
                workspaceCard.type === "question" ? (
                <AnimatePresence mode="wait" initial={false}>
                  {questionComposerMode === "options" ? (
                    <motion.div
                      key="question-options"
                      initial={{
                        opacity: 0,
                        y: 12,
                        scale: 0.985,
                        filter: "blur(6px)",
                      }}
                      animate={{
                        opacity: 1,
                        y: 0,
                        scale: 1,
                        filter: "blur(0px)",
                      }}
                      exit={{
                        opacity: 0,
                        y: -10,
                        scale: 0.985,
                        filter: "blur(6px)",
                      }}
                      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                    >
                      <QuestionComposer
                        question={workspaceCard.question}
                        onClose={() => setQuestionComposerMode("free")}
                        onSubmit={(answer, workspaceAnswers) =>
                          submitChatText(answer, { workspaceAnswers })
                        }
                      />
                    </motion.div>
                  ) : (
                    <motion.form
                      key="question-free"
                      initial={{
                        opacity: 0,
                        y: 12,
                        scale: 0.985,
                        filter: "blur(6px)",
                      }}
                      animate={{
                        opacity: 1,
                        y: 0,
                        scale: 1,
                        filter: "blur(0px)",
                      }}
                      exit={{
                        opacity: 0,
                        y: -10,
                        scale: 0.985,
                        filter: "blur(6px)",
                      }}
                      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                      onSubmit={handleMessageSubmit}
                      className="mt-spacing-3 min-w-0 rounded-[28px] border border-surface-warm-white/12 bg-[#262622] p-spacing-4 shadow-[0_18px_48px_rgba(0,0,0,0.22)]"
                    >
                      <div className="mb-spacing-2 flex items-center justify-between gap-spacing-3 px-spacing-2">
                        <button
                          type="button"
                          onClick={() => {
                            setQuestionComposerMode("options");
                            setMessage("");
                          }}
                          className="rounded-full border border-surface-warm-white/12 px-spacing-4 py-spacing-2 text-xs font-medium text-surface-warm-white/70 hover:bg-surface-warm-white/8 hover:text-surface-warm-white"
                        >
                          Lihat pilihan
                        </button>
                      </div>
                      <label htmlFor="workspace-message" className="sr-only">
                        Pesan untuk AI
                      </label>
                      <textarea
                        id="workspace-message"
                        rows={3}
                        value={message}
                        onChange={(event) => setMessage(event.target.value)}
                        onKeyDown={handleMessageKeyDown}
                        placeholder="Tulis bebas..."
                        className="w-full resize-none bg-transparent px-spacing-3 py-spacing-3 text-sm leading-6 text-surface-warm-white outline-none [scrollbar-width:none] placeholder:text-surface-warm-white/38 disabled:opacity-60 [&::-webkit-scrollbar]:hidden"
                      />
                      <div className="flex items-center justify-between gap-spacing-4">
                        <ModePill mode="Diskusi" tone="idle" />
                        <Button
                          type="submit"
                          size="icon"
                          disabled={!message.trim()}
                          className="size-9 rounded-full bg-surface-warm-white text-foreground-primary hover:bg-surface-warm-white/86 disabled:opacity-50"
                          aria-label="Kirim pesan"
                        >
                          <ArrowUp className="size-4" />
                        </Button>
                      </div>
                    </motion.form>
                  )}
                </AnimatePresence>
              ) : composerState === "build_recommendation" ||
                composerState === "brief_review" ? (
                <WorkspaceCardView
                  card={workspaceCard}
                  onAction={submitChatText}
                  onBuild={() => void startBuild()}
                  onDiscuss={holdBuildRecommendation}
                />
              ) : composerState === "post_build_review" ||
                composerState === "build_failed_with_last_good" ? (
                <CompletedBuildNotice
                  onDiscuss={() => {
                    setMode("discuss");
                    setPostBuildChatOpen(true);
                  }}
                  onPreview={() => {
                    setActiveTab("preview");
                    openPreviewPanel();
                  }}
                  variant={
                    composerState === "build_failed_with_last_good"
                      ? "recovery"
                      : "ready"
                  }
                />
              ) : (
                <>
                  {composerState === "held_build_recommendation" ? (
                    <HeldBuildRecommendationNotice
                      onBuild={() => void startBuild()}
                      onOpen={openBuildRecommendation}
                    />
                  ) : null}
                  <form
                    onSubmit={handleMessageSubmit}
                    className="mt-spacing-3 min-w-0 rounded-[28px] border border-surface-warm-white/12 bg-[#262622] p-spacing-4 shadow-[0_18px_48px_rgba(0,0,0,0.22)]"
                  >
                    <label htmlFor="workspace-message" className="sr-only">
                      Pesan untuk AI
                    </label>
                    <textarea
                      id="workspace-message"
                      rows={3}
                      value={message}
                      onChange={(event) => setMessage(event.target.value)}
                      onKeyDown={handleMessageKeyDown}
                      placeholder={
                        mode === "build"
                          ? "Minta perubahan, contoh: buat lebih premium..."
                          : "Jawab pilihan atau tulis kebutuhanmu..."
                      }
                      className="w-full resize-none bg-transparent px-spacing-3 py-spacing-3 text-sm leading-6 text-surface-warm-white outline-none [scrollbar-width:none] placeholder:text-surface-warm-white/38 disabled:opacity-60 [&::-webkit-scrollbar]:hidden"
                    />
                    <div className="flex items-center justify-between gap-spacing-4">
                      <ModePill mode="Diskusi" tone="idle" />
                      <Button
                        type="submit"
                        size="icon"
                        disabled={!message.trim()}
                        className="size-9 rounded-full bg-surface-warm-white text-foreground-primary hover:bg-surface-warm-white/86 disabled:opacity-50"
                        aria-label="Kirim pesan"
                      >
                        <ArrowUp className="size-4" />
                      </Button>
                    </div>
                  </form>
                </>
              )}
            </div>
          </aside>
        </ResizablePanel>
        {showPreviewPanel ? (
          <>
            <ResizableHandle
              withHandle
              className="bg-surface-warm-white/8 transition-colors hover:bg-surface-warm-white/16 max-md:hidden"
            />

            <ResizablePanel
              id="preview"
              className={
                mobileSurface === "preview"
                  ? "transition-[flex-grow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none max-md:!flex-1"
                  : "transition-[flex-grow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none max-md:hidden"
              }
              panelRef={previewPanelRef}
              defaultSize="75%"
              minSize="8%"
              collapsible
              collapsedSize={0}
            >
              <section className={previewPanelClass}>
                <div className="flex h-full min-h-0 flex-col bg-[#10100f] text-surface-warm-white">
                  <WorkspaceTopBar
                    annotationActive={annotationMode}
                    annotationAvailable={shouldRenderGeneratedPreview}
                    onToggleAnnotation={() => {
                      setAnnotationMode((current) => {
                        if (current) {
                          setPendingAnnotationTarget(null);
                          setPendingAnnotationComment("");
                        }

                        return !current;
                      });
                      setActiveTab("preview");
                    }}
                    activeTab={activeTab}
                    setActiveTab={setActiveTab}
                    viewport={viewport}
                    setViewport={setViewport}
                    chatCollapsed={chatCollapsed}
                    openChatPanel={openChatPanel}
                    closeChatPanel={closeChatPanel}
                    runtime={runtimeControl}
                  />
                  <div className="min-h-0 flex-1 overflow-hidden bg-[#10100f]">
                    {activeTab === "preview" ? (
                      <div
                        id="workspace-preview-panel"
                        role="tabpanel"
                        aria-labelledby="workspace-preview-tab"
                        className="h-full min-h-0"
                      >
                        {isBuilding ? (
                          <div className="grid min-h-full place-items-center p-spacing-6">
                            <div className="w-full max-w-3xl">
                              <BuildProgressPanel
                                elapsedFrom={buildStartedAt}
                                isBuilding={isBuilding}
                                steps={buildProgress}
                              />
                            </div>
                          </div>
                        ) : previewIssue ? (
                          <PreviewIssueState
                            detail={previewIssue.detail}
                            title={previewIssue.title}
                            onRetry={retryPreviewRuntime}
                          />
                        ) : shouldRenderGeneratedPreview ? (
                          <GeneratedPreviewFrame
                            annotationActive={annotationMode}
                            annotationMarkers={annotations}
                            onAnnotationTarget={handleAnnotationTarget}
                            onLoad={() => void loadRuntimeState()}
                            onRetry={retryPreviewRuntime}
                            pendingAnnotation={
                              annotationMode && pendingAnnotationTarget
                                ? {
                                    comment: pendingAnnotationComment,
                                    onCancel: () => {
                                      setPendingAnnotationTarget(null);
                                      setPendingAnnotationComment("");
                                    },
                                    onChange: setPendingAnnotationComment,
                                    onSave: addPendingAnnotation,
                                    target: pendingAnnotationTarget,
                                  }
                                : null
                            }
                            projectId={projectId}
                            reloadKey={previewReloadKey}
                            viewport={viewport}
                          />
                        ) : (
                          <EmptyPreviewState />
                        )}
                      </div>
                    ) : null}

                    {activeTab === "code" ? (
                      <div
                        id="workspace-code-panel"
                        role="tabpanel"
                        aria-labelledby="workspace-code-tab"
                        className="h-full min-h-0"
                      >
                        <CodeView
                          files={sourceFiles}
                          buildStatus={sourceStatus}
                          error={sourceError}
                          isLoading={isLoadingSource}
                          onRetry={() =>
                            setSourceReloadKey((current) => current + 1)
                          }
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
              </section>
            </ResizablePanel>
          </>
        ) : null}
      </ResizablePanelGroup>
      {annotations.length ? (
        <VisualFeedbackWidget
          annotations={annotations}
          instruction={annotationInstruction}
          isSending={isEditingPreview}
          onClose={() => {
            setAnnotationMode(false);
            setPendingAnnotationTarget(null);
            setPendingAnnotationComment("");
          }}
          onInstructionChange={setAnnotationInstruction}
          onRemove={removeAnnotation}
          onSend={() => void sendVisualAnnotations()}
        />
      ) : null}
    </div>
  );
}

function createRuntimeControl({
  buildStatus,
  isPublishing,
  onPublish,
  onRetryPreview,
  publishedPath,
  runtimeError,
  runtimeState,
  sourceStatus,
}: {
  buildStatus: string;
  isPublishing: boolean;
  onPublish: () => void;
  onRetryPreview: () => void;
  publishedPath: string | null;
  runtimeError: string | null;
  runtimeState: RuntimeWorkspaceState | null;
  sourceStatus: string;
}): WorkspaceRuntimeControl {
  const runtimeBuildStatus =
    runtimeState?.build?.status ||
    (sourceStatus === "passed"
      ? "succeeded"
      : buildStatus === "building"
        ? "running"
        : buildStatus === "ready"
          ? "succeeded"
          : buildStatus);
  const runtimePublishedPath =
    publishedPath || runtimeState?.publishedDeployment?.publicPath || null;

  return {
    buildStatus: runtimeBuildStatus,
    canPublish:
      runtimeBuildStatus === "succeeded" || runtimeBuildStatus === "passed",
    deploymentStatus: runtimeState?.deployment?.status ?? null,
    errorMessage: runtimeError,
    isPublishing,
    onPublish,
    onRetryPreview,
    publishedPath: runtimePublishedPath,
  };
}

function addBuildProgressStep(
  current: BuildProgressStep[],
  next: BuildProgressStep,
) {
  const previous = current[current.length - 1];

  if (previous?.label === next.label) {
    return [
      ...current.slice(0, -1),
      { ...next, status: next.status || previous.status },
    ];
  }

  return [
    ...current.map((step) =>
      step.status === "active" ? { ...step, status: "done" as const } : step,
    ),
    next,
  ].slice(-8);
}

function completeBuildProgress(current: BuildProgressStep[]) {
  return current.map((step) =>
    step.status === "active" ? { ...step, status: "done" as const } : step,
  );
}

function dedupeUiMessages(messages: UIMessage[]) {
  const seen = new Set<string>();

  return messages.filter((message) => {
    const text = message.parts
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n");
    const key = message.id || `${message.role}:${text}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function filterDiscussionMessagesWithWorkspaceUi(
  messages: UIMessage[],
  enabled: boolean,
) {
  if (!enabled) {
    return messages;
  }

  return messages.filter((message) => {
    if (message.role !== "assistant") {
      return true;
    }

    return message.parts.some((part) => {
      if (part.type === "text") {
        return isUserVisibleAssistantText(part.text);
      }

      return (
        part.type === "tool-setWorkspaceUi" &&
        (part as { state?: unknown }).state === "output-available"
      );
    });
  });
}

function getLatestWorkspaceUpdateFromMessages(messages: UIMessage[]) {
  for (const message of [...messages].reverse()) {
    for (const part of [...message.parts].reverse()) {
      if (
        part.type !== "tool-setWorkspaceUi" ||
        part.state !== "output-available"
      ) {
        continue;
      }

      const output = part.output as {
        projectTitle?: string;
        workspaceCard?: WorkspaceCard;
      } | null;

      if (output?.workspaceCard?.type === "none") {
        if (output.projectTitle) {
          return { projectTitle: output.projectTitle };
        }
        continue;
      }

      if (output?.workspaceCard || output?.projectTitle) {
        return output;
      }
    }
  }

  return null;
}

function ChatMessages({ messages }: { messages: UIMessage[] }) {
  if (!messages.length) {
    return (
      <div className="rounded-[22px] border border-surface-warm-white/10 bg-surface-warm-white/6 px-spacing-6 py-spacing-5 text-sm leading-6 text-surface-warm-white/70">
        AI siap bantu merapikan brief. Tulis jawabanmu, lalu AI akan menentukan
        pertanyaan berikutnya.
      </div>
    );
  }

  return (
    <div className="space-y-spacing-8">
      {messages.map((message, messageIndex) => {
        const textParts = message.parts.filter(
          (
            part,
          ): part is Extract<
            (typeof message.parts)[number],
            { type: "text" }
          > => part.type === "text" && Boolean(part.text.trim()),
        );
        const fallbackText = textParts.length
          ? ""
          : getToolOnlyAssistantFallback(message);

        if (!textParts.length && !fallbackText) {
          return null;
        }

        return (
          <div
            key={`${message.id || message.role}-${messageIndex}`}
            className={`flex max-w-full text-base leading-7 ${message.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[88%] overflow-hidden break-words [overflow-wrap:anywhere] rounded-[22px] px-spacing-6 py-spacing-5 ${message.role === "user" ? "border border-surface-warm-white/12 bg-[#30302c] text-surface-warm-white/88" : "border border-surface-warm-white/10 bg-[#242421] text-surface-warm-white/80"}`}
            >
              {textParts.length ? (
                textParts.map((part, index) => (
                  <MessageText key={index} text={part.text} />
                ))
              ) : (
                <MessageText text={fallbackText} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function getToolOnlyAssistantFallback(message: UIMessage) {
  if (message.role !== "assistant") {
    return "";
  }

  for (const part of [...message.parts].reverse()) {
    if (
      part.type !== "tool-setWorkspaceUi" ||
      part.state !== "output-available"
    ) {
      continue;
    }

    const output = part.output as { workspaceCard?: WorkspaceCard } | null;
    const card = output?.workspaceCard;

    if (!card) {
      continue;
    }

    if (card.type === "question") {
      return card.question.question;
    }

    if (card.type === "brief_review") {
      return "Oke, aku rangkum dulu biar kamu bisa cek sebelum websitenya dibuat.";
    }

    if (card.type === "build_recommendation") {
      return "Brief sudah cukup. Aku siap mulai bikin websitenya kalau kamu setuju.";
    }
  }

  return "";
}

function HeldBuildRecommendationNotice({
  onBuild,
  onOpen,
}: {
  onBuild: () => void;
  onOpen: () => void;
}) {
  return (
    <div className="rounded-[22px] border border-surface-warm-white/10 bg-[#1d1d1a] px-spacing-5 py-spacing-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
      <div className="flex flex-wrap items-center justify-between gap-spacing-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-surface-warm-white">
            Rancangan build disimpan
          </p>
          <p className="mt-spacing-1 text-xs leading-5 text-surface-warm-white/52">
            Lanjutkan diskusi dulu, atau buka rancangan saat siap mulai build.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-spacing-2">
          <Button
            type="button"
            variant="outline"
            onClick={onOpen}
            className="h-9 rounded-[12px] border-surface-warm-white/12 bg-transparent px-spacing-4 text-xs text-surface-warm-white/78 hover:bg-surface-warm-white/8"
          >
            Buka rancangan
          </Button>
          <Button
            type="button"
            onClick={onBuild}
            className="h-9 rounded-[12px] bg-surface-warm-white px-spacing-4 text-xs text-foreground-primary hover:bg-surface-warm-white/86"
          >
            Mulai build
          </Button>
        </div>
      </div>
    </div>
  );
}

function CompletedBuildNotice({
  onDiscuss,
  onPreview,
  variant = "ready",
}: {
  onDiscuss: () => void;
  onPreview: () => void;
  variant?: "ready" | "recovery";
}) {
  const isRecovery = variant === "recovery";

  return (
    <div
      className={`rounded-[22px] border px-spacing-5 py-spacing-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] ${
        isRecovery
          ? "border-[#f6d365]/18 bg-[#242015]"
          : "border-[#8ce99a]/18 bg-[#1d211c]"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-spacing-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-surface-warm-white">
            {isRecovery ? "Website terakhir masih aman" : "Website siap dicek"}
          </p>
          <p className="mt-spacing-1 text-xs leading-5 text-surface-warm-white/52">
            {isRecovery
              ? "Build terbaru gagal, tapi tampilan terakhir yang berhasil tetap aman. Kamu bisa cek hasil lama atau lanjut ngobrol dengan AI."
              : "Cek hasilnya dulu. Kalau ada yang kurang pas, lanjut ngobrol dengan AI."}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-spacing-2">
          <Button
            type="button"
            onClick={onPreview}
            className="h-9 rounded-[12px] bg-surface-warm-white px-spacing-4 text-xs text-foreground-primary hover:bg-surface-warm-white/86"
          >
            Lihat website
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onDiscuss}
            className="h-9 rounded-[12px] border-surface-warm-white/12 bg-transparent px-spacing-4 text-xs text-surface-warm-white/78 hover:bg-surface-warm-white/8"
          >
            Chat dengan AI
          </Button>
        </div>
      </div>
    </div>
  );
}

function MessageText({ text }: { text: string }) {
  const lines = stripDecorativeSymbols(text)
    .split("\n")
    .filter((line) => line.trim());

  return (
    <div className="space-y-spacing-4">
      {lines.map((line, index) => {
        const trimmed = line.trim();
        const listMatch = trimmed.match(/^(\d+\.|[-*])\s+(.*)$/);

        if (listMatch) {
          return (
            <p
              key={index}
              className="break-words pl-spacing-4 text-surface-warm-white/72"
            >
              <span className="text-[#ffb38d]">{listMatch[1]}</span>{" "}
              {formatInlineMarkdown(listMatch[2])}
            </p>
          );
        }

        if (trimmed.startsWith("###")) {
          return (
            <p
              key={index}
              className="break-words font-semibold text-surface-warm-white"
            >
              {formatInlineMarkdown(trimmed.replace(/^#+\s*/, ""))}
            </p>
          );
        }

        return (
          <p key={index} className="break-words">
            {formatInlineMarkdown(trimmed)}
          </p>
        );
      })}
    </div>
  );
}

function stripDecorativeSymbols(text: string) {
  return text.replace(
    /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu,
    "",
  );
}

type RateLimitChatError = Error & {
  retryAfter?: number;
  status?: number;
};

async function rateLimitAwareFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
) {
  const response = await fetch(input, init);

  if (response.status !== 429) {
    return response;
  }

  const body = (await response.json().catch(() => null)) as {
    message?: string;
    retryAfter?: number;
  } | null;
  const retryAfter =
    (body?.retryAfter ?? Number(response.headers.get("Retry-After"))) || 60;
  const error = new Error(
    body?.message ||
      `Terlalu banyak percobaan. Coba lagi dalam ${retryAfter} detik.`,
  ) as RateLimitChatError;

  error.status = 429;
  error.retryAfter = retryAfter;
  throw error;
}

function captureRateLimitError(
  error: unknown,
  setRateLimitError: (value: { message: string; retryAfter: number }) => void,
) {
  const candidate = error as RateLimitChatError;

  if (candidate?.status !== 429) {
    return false;
  }

  setRateLimitError({
    message: candidate.message,
    retryAfter: candidate.retryAfter ?? 60,
  });
  return true;
}

function formatInlineMarkdown(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);

  return parts.map((part, index) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={index} className="font-semibold text-surface-warm-white">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <span key={index}>{part}</span>
    ),
  );
}

function getEditorLanguage(path = "") {
  if (path.endsWith(".tsx") || path.endsWith(".ts")) {
    return "typescript";
  }

  if (path.endsWith(".css")) {
    return "css";
  }

  if (path.endsWith(".json")) {
    return "json";
  }

  if (path.endsWith(".html")) {
    return "html";
  }

  if (path.endsWith(".md")) {
    return "markdown";
  }

  return "plaintext";
}

const ZIP_ENCODER = new TextEncoder();
const ZIP_DOS_TIME = 0;
const ZIP_DOS_DATE = 33;
const CRC32_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;

  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }

  return value >>> 0;
});

type FileTreeNode = {
  children: Map<string, FileTreeNode>;
  path: string;
  type: "directory" | "file";
};

function FileTree({
  files,
  onSelect,
  selectedPath,
}: {
  files: GeneratedProjectFile[];
  onSelect: (path: string) => void;
  selectedPath: string;
}) {
  const root = buildFileTree(files);

  if (!files.length) {
    return (
      <p className="px-spacing-4 py-spacing-3 text-sm text-surface-warm-white/42">
        Source belum tersedia.
      </p>
    );
  }

  return (
    <div className="select-none">
      {sortFileTreeEntries(root.children).map(([name, node]) => (
        <FileTreeItem
          key={node.path || name}
          name={name}
          node={node}
          onSelect={onSelect}
          selectedPath={selectedPath}
        />
      ))}
    </div>
  );
}

function FileTreeItem({
  name,
  node,
  onSelect,
  selectedPath,
}: {
  name: string;
  node: FileTreeNode;
  onSelect: (path: string) => void;
  selectedPath: string;
}) {
  if (node.type === "file") {
    const selected = node.path === selectedPath;

    return (
      <button
        type="button"
        onClick={() => onSelect(node.path)}
        className={`block w-full truncate px-spacing-4 py-spacing-1.5 text-left text-sm transition ${selected ? "bg-surface-warm-white/12 text-surface-warm-white" : "text-surface-warm-white/62 hover:bg-surface-warm-white/7 hover:text-surface-warm-white"}`}
        title={node.path}
      >
        <span className="pl-spacing-6">{name}</span>
      </button>
    );
  }

  return (
    <details open className="group">
      <summary className="cursor-pointer list-none px-spacing-4 py-spacing-1.5 text-sm font-medium text-surface-warm-white/72 hover:bg-surface-warm-white/7 hover:text-surface-warm-white [&::-webkit-details-marker]:hidden">
        <span className="mr-spacing-2 inline-block text-surface-warm-white/38 group-open:rotate-90">
          ›
        </span>
        {name}
      </summary>
      <div className="border-l border-surface-warm-white/8 pl-spacing-3 ml-spacing-5">
        {sortFileTreeEntries(node.children).map(([childName, child]) => (
          <FileTreeItem
            key={child.path || `${node.path}/${childName}`}
            name={childName}
            node={child}
            onSelect={onSelect}
            selectedPath={selectedPath}
          />
        ))}
      </div>
    </details>
  );
}

function sortFileTreeEntries(children: Map<string, FileTreeNode>) {
  return Array.from(children.entries()).sort(
    ([nameA, nodeA], [nameB, nodeB]) => {
      if (nodeA.type !== nodeB.type) {
        return nodeA.type === "directory" ? -1 : 1;
      }

      return nameA.localeCompare(nameB, undefined, {
        numeric: true,
        sensitivity: "base",
      });
    },
  );
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function createZipBlob(files: GeneratedProjectFile[]) {
  const localFileParts: Uint8Array[] = [];
  const centralDirectoryParts: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const name = ZIP_ENCODER.encode(file.path);
    const content = ZIP_ENCODER.encode(file.content);
    const crc = crc32(content);
    const localHeader = createZipHeader(0x04034b50, name, content, crc, offset);
    const centralHeader = createZipHeader(
      0x02014b50,
      name,
      content,
      crc,
      offset,
    );

    localFileParts.push(localHeader, content);
    centralDirectoryParts.push(centralHeader);
    offset += localHeader.length + content.length;
  }

  const centralDirectorySize = centralDirectoryParts.reduce(
    (size, part) => size + part.length,
    0,
  );
  const end = new Uint8Array(22);
  const view = new DataView(end.buffer);

  view.setUint32(0, 0x06054b50, true);
  view.setUint16(8, files.length, true);
  view.setUint16(10, files.length, true);
  view.setUint32(12, centralDirectorySize, true);
  view.setUint32(16, offset, true);

  return new Blob(
    [...localFileParts, ...centralDirectoryParts, end].map(toBlobPart),
    { type: "application/zip" },
  );
}

function toBlobPart(part: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(part.length);

  copy.set(part);
  return copy.buffer;
}

function createZipHeader(
  signature: number,
  name: Uint8Array,
  content: Uint8Array,
  crc: number,
  offset: number,
) {
  const isCentralDirectory = signature === 0x02014b50;
  const header = new Uint8Array(isCentralDirectory ? 46 : 30);
  const view = new DataView(header.buffer);

  view.setUint32(0, signature, true);

  if (isCentralDirectory) {
    view.setUint16(4, 20, true);
    view.setUint16(6, 20, true);
    view.setUint16(12, ZIP_DOS_TIME, true);
    view.setUint16(14, ZIP_DOS_DATE, true);
    view.setUint32(16, crc, true);
    view.setUint32(20, content.length, true);
    view.setUint32(24, content.length, true);
    view.setUint16(28, name.length, true);
    view.setUint32(42, offset, true);
  } else {
    view.setUint16(4, 20, true);
    view.setUint16(10, ZIP_DOS_TIME, true);
    view.setUint16(12, ZIP_DOS_DATE, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, content.length, true);
    view.setUint32(22, content.length, true);
    view.setUint16(26, name.length, true);
  }

  const fullHeader = new Uint8Array(header.length + name.length);
  fullHeader.set(header);
  fullHeader.set(name, header.length);

  return fullHeader;
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function buildFileTree(files: GeneratedProjectFile[]) {
  const root: FileTreeNode = {
    children: new Map(),
    path: "",
    type: "directory",
  };

  for (const file of files) {
    const parts = file.path.split("/").filter(Boolean);
    let current = root;

    parts.forEach((part, index) => {
      const path = parts.slice(0, index + 1).join("/");
      const type = index === parts.length - 1 ? "file" : "directory";
      const existing = current.children.get(part);

      if (existing) {
        current = existing;
        return;
      }

      const next: FileTreeNode = { children: new Map(), path, type };
      current.children.set(part, next);
      current = next;
    });
  }

  return root;
}

function EmptyCodeState({ buildStatus }: { buildStatus: string }) {
  return (
    <div className="grid h-full min-h-0 place-items-center bg-[#10100f] p-spacing-6 text-center text-surface-warm-white">
      <div className="max-w-sm rounded-[24px] border border-surface-warm-white/10 bg-[#181816] px-spacing-6 py-spacing-6">
        <p className="text-sm font-semibold">Belum ada source yang dibuat</p>
        <p className="mt-spacing-2 text-sm leading-6 text-surface-warm-white/54">
          Kode website akan muncul setelah build pertama berhasil dibuat.
        </p>
        <p className="mt-spacing-4 text-xs text-surface-warm-white/34">
          Status: {buildStatus}
        </p>
      </div>
    </div>
  );
}

function CodeView({
  files,
  buildStatus,
  error,
  isLoading,
  onRetry,
}: {
  files: GeneratedProjectFile[];
  buildStatus: string;
  error: string | null;
  isLoading: boolean;
  onRetry: () => void;
}) {
  const sortedFiles = useMemo(
    () =>
      [...files].sort((a, b) =>
        a.path.localeCompare(b.path, undefined, {
          numeric: true,
          sensitivity: "base",
        }),
      ),
    [files],
  );
  const [selectedPath, setSelectedPath] = useState(sortedFiles[0]?.path || "");
  const selectedFile =
    sortedFiles.find((file) => file.path === selectedPath) ?? sortedFiles[0];

  useEffect(() => {
    if (!sortedFiles.length) {
      setSelectedPath("");
      return;
    }

    if (
      !selectedPath ||
      !sortedFiles.some((file) => file.path === selectedPath)
    ) {
      setSelectedPath(sortedFiles[0].path);
    }
  }, [selectedPath, sortedFiles]);

  const exportCurrentFile = useCallback(() => {
    if (!selectedFile) {
      return;
    }

    downloadBlob(
      new Blob([selectedFile.content], { type: "text/plain;charset=utf-8" }),
      selectedFile.path.split("/").at(-1) || "generated-file.txt",
    );
  }, [selectedFile]);

  const exportProjectZip = useCallback(() => {
    if (!sortedFiles.length) {
      return;
    }

    downloadBlob(
      createZipBlob(sortedFiles),
      `umkmcepat-generated-project-${new Date().toISOString().slice(0, 10)}.zip`,
    );
  }, [sortedFiles]);

  if (!sortedFiles.length && isLoading) {
    return (
      <div
        role="status"
        className="grid h-full min-h-0 place-items-center bg-[#10100f] p-spacing-6 text-sm text-surface-warm-white/64"
      >
        Memuat kode website...
      </div>
    );
  }

  if (!sortedFiles.length && error) {
    return (
      <div className="grid h-full min-h-0 place-items-center bg-[#10100f] p-spacing-6 text-center text-surface-warm-white">
        <div className="max-w-sm rounded-[24px] border border-[#ffb4a6]/25 bg-[#ffb4a6]/8 px-spacing-6 py-spacing-6">
          <p className="text-sm font-semibold">Kode belum bisa dimuat</p>
          <p className="mt-spacing-2 text-sm leading-6 text-surface-warm-white/64">
            {error}
          </p>
          <Button type="button" onClick={onRetry} className="mt-spacing-4">
            Coba lagi
          </Button>
        </div>
      </div>
    );
  }

  if (!sortedFiles.length) {
    return <EmptyCodeState buildStatus={buildStatus} />;
  }

  return (
    <div className="grid h-full min-h-0 overflow-hidden border-t border-surface-warm-white/10 bg-[#10100f] text-surface-warm-white md:grid-cols-[280px_1fr]">
      <aside className="min-h-0 overflow-y-auto border-r border-surface-warm-white/10 bg-[#181816] py-spacing-3">
        <div className="border-b border-surface-warm-white/8 px-spacing-4 pb-spacing-3">
          <p className="text-[11px] uppercase tracking-[0.16em] text-surface-warm-white/34">
            Explorer
          </p>
          <p className="mt-spacing-2 text-xs text-surface-warm-white/44">
            Build: {buildStatus}
          </p>
          {error ? (
            <button
              type="button"
              onClick={onRetry}
              className="mt-spacing-2 text-left text-xs leading-5 text-[#ffb4a6] underline underline-offset-4"
            >
              Kode lama tetap ditampilkan. Coba muat ulang.
            </button>
          ) : null}
          <Button
            type="button"
            size="sm"
            onClick={exportProjectZip}
            disabled={!sortedFiles.length}
            className="mt-spacing-3 h-8 w-full justify-start rounded-radius-md bg-surface-warm-white text-xs text-foreground-primary hover:bg-surface-warm-white/90"
          >
            Export semua (.zip)
          </Button>
        </div>
        <div className="py-spacing-3 text-sm">
          <FileTree
            files={sortedFiles}
            selectedPath={selectedFile?.path || ""}
            onSelect={setSelectedPath}
          />
        </div>
      </aside>
      <section className="flex min-h-0 min-w-0 flex-col">
        <div className="flex items-center justify-between gap-spacing-4 border-b border-surface-warm-white/10 bg-[#111110] px-spacing-5 py-spacing-3 text-sm text-surface-warm-white/58">
          <span
            className="min-w-0 truncate"
            title={selectedFile?.path || undefined}
          >
            {selectedFile?.path || "Belum ada file"}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={exportCurrentFile}
            disabled={!selectedFile}
            className="h-8 shrink-0 rounded-radius-md border-surface-warm-white/14 bg-transparent text-xs text-surface-warm-white hover:bg-surface-warm-white/8"
          >
            Export file ini
          </Button>
        </div>
        <div className="min-h-0 flex-1">
          <MonacoEditor
            height="100%"
            language={getEditorLanguage(selectedFile?.path)}
            value={selectedFile?.content || ""}
            theme="vs-dark"
            options={{
              readOnly: true,
              domReadOnly: true,
              minimap: { enabled: false },
              fontSize: 13,
              lineHeight: 22,
              padding: { top: 16, bottom: 16 },
              scrollBeyondLastLine: false,
              wordWrap: "on",
              automaticLayout: true,
              contextmenu: false,
              glyphMargin: false,
              folding: true,
              links: false,
              overviewRulerLanes: 0,
              renderLineHighlight: "line",
              scrollbar: {
                verticalScrollbarSize: 10,
                horizontalScrollbarSize: 10,
              },
            }}
          />
        </div>
      </section>
    </div>
  );
}
