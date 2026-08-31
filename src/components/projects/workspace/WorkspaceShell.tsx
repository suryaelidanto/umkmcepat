"use client";

import { useChat } from "@ai-sdk/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DefaultChatTransport, type FileUIPart, type UIMessage } from "ai";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  Globe2,
  Loader2,
  Menu,
  MessageCircle,
  Pencil,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
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
import { toast } from "sonner";

import { AuthButton } from "@/components/common/AuthButton";
import { EnergyDisplay } from "@/components/common/EnergyDisplay";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import {
  CompletedBuildNotice,
  HeldBuildRecommendationNotice,
} from "@/components/projects/build/BuildNotices";
import {
  useBuildAttemptStream,
  type BuildStreamEvent,
} from "@/components/projects/build/useBuildAttemptStream";
import { ChatMessages } from "@/components/projects/chat/ChatMessage";
import {
  ComposerAttachButton,
  ComposerAttachments,
} from "@/components/projects/chat/ComposerAttachments";
import { settleDiscussAfterChatReady } from "@/components/projects/chat/discuss-chat-settle";
import { CodeView } from "@/components/projects/workspace/CodeViewer";
import { WorkspaceMediaGallery } from "@/components/projects/workspace/WorkspaceMediaGallery";
import {
  BuildProgressPanel,
  EmptyPreviewState,
  GeneratedPreviewFrame,
  PreviewIssueState,
  ProcessingControl,
  QuestionComposer,
  ImageUploadComposer,
  VisualFeedbackWidget,
  WorkspaceCardView,
  WorkspaceMobileMenuSheet,
  WorkspaceTopBar,
  type BuildProgressStep,
  type BuildTab,
  type WorkspaceAnswerPayload,
  type WorkspaceRuntimeControl,
} from "@/components/projects/workspace/WorkspacePrimitives";
import { Button } from "@/components/ui/button";
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
import { track } from "@/lib/analytics";
import { signOut, useSession } from "@/lib/auth/auth-client";
import { useFeatureFlag } from "@/lib/config/use-feature-flag";
import { type ProjectBrief, type WorkspaceCard } from "@/lib/projects/brief";
import {
  appendBuildProgressStep,
  completeBuildProgressSteps,
  mergeHydratedBuildProgress,
  resolveCurrentBuildProgressStep,
} from "@/lib/projects/build-progress-steps";
import {
  completeBuildStreamProgress,
  createBuildStreamDeduper,
  reduceBuildStreamEvent,
} from "@/lib/projects/build-stream-event";
import { createUploadedImageFilePart } from "@/lib/projects/chat-file-parts";
import { dedupeUiMessages } from "@/lib/projects/chat-memory";
import {
  hasUploadingAttachments,
  MAX_COMPOSER_IMAGES,
  removeAttachment,
  revokeAll,
  tempImageUrl,
  type PendingAttachment,
} from "@/lib/projects/composer-attachments";
import {
  buildDirectEditInstruction,
  buildDirectEditIntentInstruction,
  canRedoDirectEdit,
  canUndoDirectEdit,
  intentHistoryPush,
  intentHistoryRedo,
  intentHistoryUndo,
  editHistoryPush,
  editHistoryRedo,
  editHistoryUndo,
  type DirectEditIntent,
  type DirectEditIntentHistory,
  type EditHistory,
  type EditLayout,
} from "@/lib/projects/direct-edit";
import {
  isTerminalChatError,
  nextRetryAttempt,
} from "@/lib/projects/discuss-chat-error";
import { type GeneratedProjectFile } from "@/lib/projects/generated-types";
import {
  createImageReplaceEditInstruction,
  createVisualAnnotationEditInstruction,
  createVisualAnnotationId,
  createVisualAnnotationSummary,
  type VisualAnnotationDraft,
} from "@/lib/projects/visual-annotations";
import { getWorkspaceReleaseState } from "@/lib/projects/workspace-release";
import {
  RESUME_POLL_INTERVAL_MS,
  resolveDiscussResume,
  toUserFacingDiscussError,
  type TurnState,
} from "@/lib/projects/workspace-resume";
import {
  getBuildRecommendationHoldSignature,
  getWorkspaceCardFromMessages,
  getWorkspaceComposerState,
  getWorkspacePreviewIssue,
  hasAnsweredWorkspaceQuestion,
  isBuildRecommendationHeld,
  isFreshWorkspaceCard,
  isWorkspaceBuildComplete,
  messagesEqualForRender,
  PREPARING_POLL_INTERVAL_MS,
  PREPARING_TIMEOUT_MS,
  shouldRefreshWorkspaceAfterChatStatus,
  shouldUseGeneratedPreviewFrame,
  isUserVisibleAssistantText,
} from "@/lib/projects/workspace-sync";
import { fetchJson, queryKeys, useCacheMutation } from "@/lib/query-client";
import { uploadTempImageFile } from "@/lib/storage/uploads/temp-image-client";
import { useIsDesktopViewport } from "@/lib/use-is-desktop-viewport";
import { cn } from "@/lib/utils";

// Must match the server limit in api.projects.preview.ts
export const MAX_CHAT_BYTES = 16 * 1024;

type WorkspaceShellProps = {
  projectId: string;
  initialTitle: string;
  initialPrompt?: string;
  initialStatus: string;
  initialMessages: UIMessage[];
  initialChatCursor: number | null;
  initialChatHasMore: boolean;
  initialWorkspaceCard: WorkspaceCard;
  initialBrief?: ProjectBrief;
  readOnly?: boolean;
  autoRetryAttempts?: number;
  autoRetryDelayMs?: number;
};

type RuntimeWorkspaceState = {
  activeJob?: {
    attemptId?: string | null;
    buildId?: string | null;
    kind?: string;
    message?: string | null;
    phase?: string;
    startedAt?: string;
    steps?: Array<{
      detail: string;
      diff?: BuildProgressStep["diff"];
      durationMs?: number;
      label: string;
      startedAt?: number;
      status?: "active" | "done" | "error";
    }>;
    updatedAt?: string;
  } | null;
  activePreviewDeployment?: {
    build?: {
      id: string;
      status: string;
    } | null;
    buildId?: string | null;
    id: string;
    lastRequestAt?: string | null;
    publicPath?: string | null;
    snapshotId?: string | null;
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
    build?: {
      id: string;
      status: string;
    } | null;
    buildId?: string | null;
    id: string;
    lastRequestAt?: string | null;
    publicPath?: string | null;
    snapshotId?: string | null;
    status: string;
  } | null;
  events: Array<{
    id: string;
    message?: string | null;
    type: string;
  }>;
  publishedDeployment: {
    build?: {
      id: string;
      status: string;
    } | null;
    buildId?: string | null;
    id: string;
    publicPath: string | null;
    publicState?: "live" | "not_live";
    snapshotId?: string | null;
    slug: string | null;
    status: string;
  } | null;
  canPreview?: boolean;
  canPublish?: boolean;
  canRetry?: boolean;
  hasPersistedSource?: boolean;
  latestAttempt?: {
    id: string;
    startedAt?: string | null;
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
  brief?: ProjectBrief;
  projectId: string;
  projectTitle: string;
  workspaceCard: WorkspaceCard;
};

// Module-scope guard survives React.StrictMode remount in dev to avoid duplicate auto-send
const autoSentProjectIds = new Set<string>();

export { chatBubbleClass } from "@/components/projects/chat/ChatMessage";

const COMPOSER_TRANSITION = {
  initial: { opacity: 0, y: 12, scale: 0.985, filter: "blur(6px)" },
  animate: { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" },
  exit: { opacity: 0, y: -10, scale: 0.985, filter: "blur(6px)" },
  transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const },
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
  initialBrief,
  readOnly = false,
  autoRetryAttempts: _autoRetryAttempts = 2,
  autoRetryDelayMs = 4000,
}: WorkspaceShellProps) {
  const [mode, setMode] = useState<"build" | "discuss">("discuss");
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [viewport, setViewport] = useState<"desktop" | "mobile">("desktop");
  const [message, setMessage] = useState("");
  const [projectTitle, setProjectTitle] = useState(initialTitle);
  const [isRenaming, setIsRenaming] = useState(false);
  const [mobileRenameOpen, setMobileRenameOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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
  const buildStreamDeduperRef = useRef(createBuildStreamDeduper());
  const [buildStartedAt, setBuildStartedAt] = useState<number | null>(null);
  const [runtimeState, setRuntimeState] =
    useState<RuntimeWorkspaceState | null>(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishedPath, setPublishedPath] = useState<string | null>(null);
  const [isCanceling, setIsCanceling] = useState(false);
  const [previewReloadKey, setPreviewReloadKey] = useState(0);
  const [workspaceCard, setWorkspaceCard] =
    useState<WorkspaceCard>(initialWorkspaceCard);
  const [latestBrief, setLatestBrief] = useState<ProjectBrief | null>(
    initialBrief ?? null,
  );
  const [
    heldBuildRecommendationSignature,
    setHeldBuildRecommendationSignature,
  ] = useState<string | null>(null);
  const [
    consumedBuildRecommendationSignatures,
    setConsumedBuildRecommendationSignatures,
  ] = useState<Set<string>>(() =>
    readConsumedBuildRecommendationSignatures(projectId),
  );
  const [postBuildChatOpen, setPostBuildChatOpen] = useState(
    () =>
      hasInitialPreview ||
      initialMessages.length > 0 ||
      initialWorkspaceCard.type === "build_recommendation",
  );
  const [olderMessages, setOlderMessages] = useState<UIMessage[]>([]);
  const [chatCursor, setChatCursor] = useState<number | null>(
    initialChatCursor,
  );
  const [hasMoreChat, setHasMoreChat] = useState(initialChatHasMore);
  const [isLoadingOlderChat, setIsLoadingOlderChat] = useState(false);
  const [isSubmittingTurn, setIsSubmittingTurn] = useState(false);
  const prompt = (initialPrompt ?? "").trim();
  const buildRecommendationStorageKey = `umkmcepat:build-recommendation-hold:${projectId}`;
  const buildRecommendationConsumedKey = `umkmcepat:build-recommendation-consumed:${projectId}`;
  const handoffProofStorageKey = `umkmcepat:handoff-proof:${projectId}`;
  const visualAnnotationStorageKey = `umkmcepat:visual-comments:${projectId}`;
  const hasStartedChat = useRef(false);
  const hasStartedBuild = useRef(false);
  const modeRef = useRef(mode);
  const buildAbortRef = useRef<AbortController | null>(null);
  const chatPanelRef = useRef<PanelImperativeHandle | null>(null);
  const previewPanelRef = useRef<PanelImperativeHandle | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const { status: authStatus } = useSession();
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    if (authStatus === "unauthenticated") {
      setSessionExpired(true);
    }
  }, [authStatus]);
  const hasAutoOpenedPreview = useRef(hasInitialPreview);
  const previousLiveMessageCount = useRef(initialMessages.length);
  const previousLiveBuildStepCount = useRef(0);
  const runtimeRetryAfterRef = useRef(0);
  const previousScrollHeight = useRef<number | null>(null);
  const shouldStickToBottomRef = useRef(true);
  const ignoreNextScrollRef = useRef(false);
  const [isRetrying, setIsRetrying] = useState<false | "response" | "card">(
    false,
  );
  const retryAttemptRef = useRef(0);
  const [workspaceCardError, setWorkspaceCardError] = useState(false);
  const [isPreparingNextQuestion, setIsPreparingNextQuestion] = useState(false);
  const isPreparingNextQuestionRef = useRef(false);
  const workspaceCardRef = useRef(initialWorkspaceCard);
  const preparingPollRef = useRef<(() => void) | null>(null);
  const loadWorkspaceStateRequestIdRef = useRef(0);
  const submitInFlightRef = useRef(false);

  const isDesktop = useIsDesktopViewport();
  const [resumeError, setResumeError] = useState<{
    message: string;
    retryText: string;
  } | null>(null);
  const [isEditingPreview, setIsEditingPreview] = useState(false);
  const visualEditInFlightRef = useRef(false);
  const pendingVisualRevisionRef = useRef(false);
  const [annotationInstruction, setAnnotationInstruction] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<
    PendingAttachment[]
  >([]);
  const [annotations, setAnnotations] = useState<VisualAnnotationDraft[]>([]);
  const [pendingAnnotationTarget, setPendingAnnotationTarget] = useState<Omit<
    VisualAnnotationDraft,
    "comment" | "id"
  > | null>(null);
  const [pendingAnnotationComment, setPendingAnnotationComment] = useState("");
  const visualAnnotationsLoadedRef = useRef(false);
  const [directEditMode, setDirectEditMode] = useState(false);
  const directEditFlagEnabled = useFeatureFlag("feature.visual_edit_enabled");
  const effectiveDirectEditMode = directEditMode && directEditFlagEnabled;
  const composerUploadsEnabled = useFeatureFlag(
    "feature.composer_uploads_enabled",
  );
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
  const [rateLimitError, setRateLimitError] = useState<{
    message: string;
    retryAfter: number;
  } | null>(null);
  const [questionComposerMode, setQuestionComposerMode] = useState<
    "card" | "free"
  >("card");
  const [mobileSurface, setMobileSurface] = useState<"chat" | "preview">(
    hasInitialPreview ? "preview" : "chat",
  );
  const {
    messages,
    regenerate,
    sendMessage,
    setMessages,
    status,
    error,
    stop,
    clearError,
  } = useChat({
    id: projectId,
    messages: initialMessages,
    onData(data) {
      if (data.type === "data-workspaceCard") {
        const card = (data as { data?: WorkspaceCard }).data;
        if (card && card.type !== "none") {
          setWorkspaceCard(card);
          setWorkspaceCardError(false);
        }
      }
    },
    transport: new DefaultChatTransport({
      api: "/api/projects/preview",
      fetch: rateLimitAwareFetch,
      prepareSendMessagesRequest({ messages, body }) {
        return {
          body: {
            message: messages[messages.length - 1],
            mode: modeRef.current,
            projectId,
            ...body,
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
      // ponytail: clears any orphaned adoptedStyleSheets injected by third-party splitters
      if (
        document.adoptedStyleSheets &&
        document.adoptedStyleSheets.length > 0
      ) {
        document.adoptedStyleSheets = document.adoptedStyleSheets.filter(
          (sheet) => {
            try {
              return !Array.from(sheet.cssRules).some((rule) =>
                rule.cssText.includes("cursor:"),
              );
            } catch {
              return true;
            }
          },
        );
      }
    };
  }, []);

  useEffect(() => {
    setHeldBuildRecommendationSignature(
      window.localStorage.getItem(buildRecommendationStorageKey),
    );
  }, [buildRecommendationStorageKey]);

  useEffect(() => {
    if (readOnly) {
      return;
    }

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

  useEffect(() => {
    if (readOnly) {
      return;
    }

    if (!visualAnnotationsLoadedRef.current) {
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

  useEffect(() => {
    if (readOnly) {
      return;
    }

    if (
      !annotations.length &&
      !annotationInstruction.trim() &&
      !pendingVisualRevisionRef.current
    ) {
      window.localStorage.removeItem(visualAnnotationStorageKey);
      return;
    }

    window.localStorage.setItem(
      visualAnnotationStorageKey,
      JSON.stringify({
        annotations,
        instruction: annotationInstruction,
        pendingRevision: pendingVisualRevisionRef.current,
      }),
    );
  }, [
    annotationInstruction,
    annotations,
    readOnly,
    visualAnnotationStorageKey,
  ]);

  const queryClient = useQueryClient();
  const buildStatusRef = useRef(buildStatus);
  buildStatusRef.current = buildStatus;

  function patchProjectInList(
    projectPatch: Partial<{
      buildStatus: string | null;
      thumbnailBuildId: string | null;
      thumbnailRef: string | null;
      title: string;
    }>,
  ) {
    queryClient.setQueryData(queryKeys.projects, (previous) => {
      const data = previous as
        | {
            pages: Array<{
              projects: Array<{ id: string; title: string }>;
            }>;
            pageParams: unknown[];
          }
        | undefined;

      if (!data) {
        return data;
      }

      return {
        ...data,
        pages: data.pages.map((page) => ({
          ...page,
          projects: page.projects.map((project) =>
            project.id === projectId
              ? { ...project, ...projectPatch }
              : project,
          ),
        })),
      };
    });
  }

  const runtimeQuery = useQuery({
    queryKey: queryKeys.projectRuntime(projectId),
    queryFn: async () => {
      // During 503 backoff, fail the fetch and keep previous cached data.
      if (Date.now() < runtimeRetryAfterRef.current) {
        throw new Error("runtime_backoff");
      }

      const response = await fetch(`/api/projects/${projectId}/runtime`, {
        cache: "no-store",
      });

      if (response.status === 503) {
        const retryAfter = Number(response.headers.get("Retry-After") || "3");
        runtimeRetryAfterRef.current = Date.now() + retryAfter * 1000;
        throw new Error("runtime_unavailable");
      }

      if (!response.ok) {
        throw new Error("runtime_failed");
      }

      return (await response.json()) as RuntimeWorkspaceState;
    },
    refetchInterval: (query) => {
      const data = query.state.data as RuntimeWorkspaceState | undefined;
      const attemptStatus = data?.latestAttempt?.status || "";
      const deploymentStatus = data?.deployment?.status || "";
      if (
        ["running", "building", "starting", "queued"].includes(attemptStatus) ||
        ["running", "building", "starting", "queued"].includes(deploymentStatus)
      ) {
        return 30_000;
      }
      return false;
    },
    // Keep last good runtime while a poll fails (503/backoff/network).
    placeholderData: (previous) => previous,
    staleTime: 3000,
    retry: 1,
  });

  useEffect(() => {
    if (!runtimeQuery.data) {
      return;
    }

    const result = runtimeQuery.data;
    setRuntimeState(result);
    setRuntimeError(null);

    if (result.latestSuccessfulBuild) {
      setSourceStatus("passed");
    }

    if (result.publishedDeployment?.publicPath) {
      setPublishedPath(result.publishedDeployment.publicPath);
    }

    // Server-owned job hydrate: refresh/HMR must reattach as observer, not
    const job = result.activeJob;
    const jobRunning =
      job && ["generating", "building", "finalizing"].includes(job.phase || "");
    const attemptRunning = ["queued", "running"].includes(
      result.latestAttempt?.status || "",
    );
    const serverBuilding =
      jobRunning || attemptRunning || result.userFacingState === "building";

    if (serverBuilding) {
      hasStartedBuild.current = true;
      setBuildStatus("building");
      // Edit/visual revisi also sets project building — keep processing UI.
      if (job?.kind === "edit") {
        setIsEditingPreview(true);
      }
      setMode("build");
      const startedMs = Date.parse(
        job?.startedAt || result.latestAttempt?.startedAt || "",
      );
      if (Number.isFinite(startedMs)) {
        setBuildStartedAt((current) =>
          current && current <= startedMs ? current : startedMs,
        );
      } else {
        setBuildStartedAt((current) => current ?? Date.now());
      }
      if (job?.steps?.length) {
        const hydrated = job.steps.map((step) => ({
          detail: step.detail,
          diff: step.diff,
          durationMs: step.durationMs,
          label: step.label,
          startedAt: step.startedAt,
          status: step.status,
        }));
        setBuildProgress((current) =>
          mergeHydratedBuildProgress(current, hydrated),
        );
      } else {
        setBuildProgress((current) =>
          current.length
            ? current
            : [
                {
                  detail:
                    job?.message || result.message || "Website sedang dibuat.",
                  label:
                    job?.kind === "edit"
                      ? "Merevisi website"
                      : "Memeriksa website",
                  status: "active" as const,
                },
              ],
        );
      }
      return;
    }

    // Job finished while we were polling after refresh.
    setIsEditingPreview(false);

    if (
      result.userFacingState === "ready" ||
      result.userFacingState === "ready_with_failed_latest_attempt"
    ) {
      if (buildStatusRef.current === "building") {
        setBuildStatus("ready");
        setBuildProgress((current) => completeBuildProgressSteps(current));
        setPreviewReloadKey((current) => current + 1);
      }

      // After refresh mid-edit, fetch success never runs — clear visual
      if (pendingVisualRevisionRef.current) {
        pendingVisualRevisionRef.current = false;
        setAnnotations([]);
        setAnnotationInstruction("");
        setDirectEditMode(false);
        setPendingAnnotationTarget(null);
        setPendingAnnotationComment("");
        window.localStorage.removeItem(visualAnnotationStorageKey);
      }
    } else if (result.userFacingState === "build_failed_without_last_good") {
      if (buildStatusRef.current === "building") {
        setBuildStatus("failed");
      }
      // Keep comments for resend; drop pending flag only.
      if (pendingVisualRevisionRef.current) {
        pendingVisualRevisionRef.current = false;
      }
    }
  }, [runtimeQuery.data, visualAnnotationStorageKey]);

  const loadRuntimeState = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: queryKeys.projectRuntime(projectId),
    });
  }, [projectId, queryClient]);

  const loadWorkspaceState = useCallback(
    async (options?: { preserveCard?: boolean; skipIfPreparing?: boolean }) => {
      if (options?.skipIfPreparing && isPreparingNextQuestionRef.current) {
        return;
      }

      const requestId = ++loadWorkspaceStateRequestIdRef.current;

      const response = await fetch(`/api/projects/${projectId}/workspace`, {
        cache: "no-store",
      });

      if (!response.ok) {
        return;
      }

      const result = (await response.json()) as WorkspaceStateResponse;

      // Discard if a later call already resolved (avoids stale data winning a race).
      if (requestId !== loadWorkspaceStateRequestIdRef.current) {
        return result;
      }

      // Tool path already applied card; still need server brief for canStartBuild.
      if (options?.preserveCard) {
        if (result.brief) {
          setLatestBrief(result.brief);
        }
        if (result.projectTitle) {
          setProjectTitle(result.projectTitle);
          setDraftTitle(result.projectTitle);
        }
        return result;
      }

      if (isPreparingNextQuestionRef.current) {
        if (
          isFreshWorkspaceCard(result.workspaceCard, workspaceCardRef.current)
        ) {
          setWorkspaceCard(result.workspaceCard);
          setProjectTitle(result.projectTitle);
          setDraftTitle(result.projectTitle);
        }
        return;
      }

      setWorkspaceCard(result.workspaceCard);
      setProjectTitle(result.projectTitle);
      setDraftTitle(result.projectTitle);
      if (result.brief) {
        setLatestBrief(result.brief);
      }
      return result;
    },
    [projectId],
  );

  const recoverPreviewRuntime = useCallback(async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}/restart`, {
        method: "POST",
      });
      if (!response.ok) {
        setRuntimeError("Tampilan website belum bisa dimuat ulang.");
      }
    } catch {
      setRuntimeError("Tampilan website belum bisa dimuat ulang.");
    }
    setPreviewReloadKey((current) => current + 1);
    void loadRuntimeState();
  }, [loadRuntimeState, projectId]);

  const publishProject = useCallback(async () => {
    if (readOnly || isPublishing) {
      return;
    }

    track("publish_project", { projectId });
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
  }, [isPublishing, loadRuntimeState, projectId, readOnly]);

  const cancelBuild = useCallback(async () => {
    if (readOnly || isCanceling) {
      return;
    }

    setIsCanceling(true);

    try {
      const response = await fetch(`/api/projects/${projectId}/cancel`, {
        method: "POST",
      });

      if (!response.ok) {
        setRuntimeError("Website belum bisa dihentikan.");
        return;
      }

      await loadRuntimeState();
    } catch {
      setRuntimeError("Website belum bisa dihentikan.");
    } finally {
      setIsCanceling(false);
    }
  }, [isCanceling, loadRuntimeState, projectId, readOnly]);

  const startBuild = useCallback(async () => {
    if (
      readOnly ||
      buildStatus === "building" ||
      authStatus !== "authenticated" ||
      sessionExpired
    ) {
      return;
    }

    window.localStorage.removeItem(buildRecommendationStorageKey);
    setHeldBuildRecommendationSignature(null);
    setPostBuildChatOpen(false);
    setMode("build");
    setBuildStatus("building");
    setSourceStatus("not_started");
    setBuildProgress([]);
    // Rows just got cleared, so the record of what was rendered must clear too
    buildStreamDeduperRef.current = createBuildStreamDeduper();
    setBuildStartedAt(Date.now());
    setMobileSurface("chat");

    // Permanently consume the current build_recommendation signature (if any)
    const consumedSignature = getBuildRecommendationHoldSignature(
      workspaceCardRef.current,
    );
    if (consumedSignature) {
      setConsumedBuildRecommendationSignatures((prev) => {
        if (prev.has(consumedSignature)) {
          return prev;
        }
        const next = new Set(prev);
        next.add(consumedSignature);
        try {
          window.localStorage.setItem(
            buildRecommendationConsumedKey,
            JSON.stringify([...next]),
          );
        } catch {
          // Non-fatal; in-memory set is still the source of truth for this tab.
        }
        return next;
      });
    }

    const abortController = new AbortController();
    buildAbortRef.current = abortController;

    try {
      // Mode follows real persisted source only — failed status alone must not
      const generateMode = "first_generate" as const;
      const messageCard = getWorkspaceCardFromMessages(
        allMessagesRef.current,
      )?.workspaceCard;
      const activeCard =
        workspaceCardRef.current.type === "build_recommendation"
          ? workspaceCardRef.current
          : messageCard?.type === "build_recommendation"
            ? messageCard
            : null;
      const cardProof =
        activeCard?.type === "build_recommendation"
          ? {
              handoffId: (activeCard as { handoffId?: string }).handoffId,
              reviewHash: (activeCard as { reviewHash?: string }).reviewHash,
            }
          : null;
      const persistedProof = readHandoffProof(handoffProofStorageKey);
      const proof: HandoffProof | null =
        cardProof?.handoffId && cardProof?.reviewHash
          ? { handoffId: cardProof.handoffId, reviewHash: cardProof.reviewHash }
          : persistedProof;
      const handoffFields =
        proof?.handoffId && proof?.reviewHash
          ? {
              handoffId: proof.handoffId,
              reviewHash: proof.reviewHash,
              // Per-invocation nonce: a retry is a genuinely new build and must
              idempotencyKey: `build-${projectId}-${proof.handoffId}-${Date.now().toString(36)}`,
            }
          : undefined;
      if (proof) {
        writeHandoffProof(handoffProofStorageKey, proof);
      }
      const response = await fetch(`/api/projects/${projectId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: generateMode,
          ...handoffFields,
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        let detail =
          "Server belum bisa memulai pembuatan website. Coba ulangi.";
        try {
          const errorBody = (await response.json()) as { message?: string };
          if (errorBody.message) {
            detail = errorBody.message;
          }
        } catch {
          // keep default message
        }
        setBuildStatus("failed");
        setBuildProgress((current) =>
          appendBuildProgressStep(current, {
            detail,
            label: "Website belum mulai dibuat",
            status: "error",
          }),
        );
        return;
      }

      // Read the SSE channel tail from the POST response and route
      if (response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const blocks = buffer.split("\n\n");
          buffer = blocks.pop() || "";

          for (const block of blocks) {
            const eventMatch = block.match(/^event: (.+)$/m);
            const dataMatch = block.match(/^data: (.+)$/m);
            if (!eventMatch || !dataMatch) {
              continue;
            }
            let payload: Record<string, unknown>;
            try {
              payload = JSON.parse(dataMatch[1]) as Record<string, unknown>;
            } catch {
              continue;
            }
            handleBuildStreamEvent({
              ...payload,
              type: eventMatch[1],
            } as BuildStreamEvent);
          }
        }
      }

      void loadRuntimeState();
      return;
    } catch (error) {
      // Abort and network failure both leave a retryable failed state — never
      setBuildStatus("failed");
      void loadRuntimeState();
      setBuildProgress((current) =>
        appendBuildProgressStep(current, {
          detail:
            (error as Error).name === "AbortError"
              ? "Pembuatan website dihentikan. Kamu bisa buat ulang website kapan saja."
              : "Koneksi terputus. Coba buat ulang website.",
          label:
            (error as Error).name === "AbortError"
              ? "Pembuatan dihentikan"
              : "Koneksi terputus",
          status: "error",
        }),
      );
    } finally {
      buildAbortRef.current = null;
    }
  }, [
    authStatus,
    buildRecommendationConsumedKey,
    buildRecommendationStorageKey,
    buildStatus,
    loadRuntimeState,
    projectId,
    readOnly,
    runtimeQuery.data?.hasPersistedSource,
    sessionExpired,
    sourceFiles.length,
  ]);

  useEffect(() => {
    // Never auto-start if a job is already running on the server (refresh case).
    if (
      readOnly ||
      hasStartedBuild.current ||
      initialStatus === "ready" ||
      initialStatus === "discussing" ||
      initialStatus === "failed" ||
      initialStatus === "building" ||
      runtimeState?.userFacingState === "building" ||
      runtimeState?.activeJob
    ) {
      if (
        initialStatus === "building" ||
        runtimeState?.userFacingState === "building" ||
        runtimeState?.activeJob
      ) {
        hasStartedBuild.current = true;
      }
      return;
    }

    hasStartedBuild.current = true;
    void startBuild();
  }, [
    initialStatus,
    readOnly,
    runtimeState?.activeJob,
    runtimeState?.userFacingState,
    startBuild,
  ]);

  useEffect(() => {
    // Guard against double-fire from React.StrictMode's dev-only
    if (
      readOnly ||
      hasStartedChat.current ||
      autoSentProjectIds.has(projectId) ||
      !prompt ||
      initialMessages.length ||
      status === "submitted" ||
      status === "streaming"
    ) {
      return;
    }

    hasStartedChat.current = true;
    const timer = setTimeout(async () => {
      // Refresh recovery: check if a chat turn already exists in the DB.
      try {
        const turnRes = await fetch(`/api/projects/${projectId}/chat/turn`, {
          cache: "no-store",
        });
        if (turnRes.ok) {
          autoSentProjectIds.add(projectId);
          // Cannot call reloadLatestChat here — it's defined below
          const chatRes = await fetch(
            `/api/projects/${projectId}/chat?limit=20`,
            { cache: "no-store" },
          );
          if (chatRes.ok) {
            const chatResult = (await chatRes.json()) as {
              messages?: UIMessage[];
              nextCursor?: number | null;
              hasMore?: boolean;
            };
            if (chatResult.messages?.length) {
              setMessages(chatResult.messages);
              setOlderMessages([]);
              setChatCursor(chatResult.nextCursor ?? null);
              setHasMoreChat(Boolean(chatResult.hasMore));
            }
          }
          return;
        }
      } catch {
        // Network error — fall through to auto-send below.
      }

      // ponytail: first-turn asset inclusion. The home form's images are
      autoSentProjectIds.add(projectId);
      sendMessage({ text: prompt }, { body: { mode } });
    }, 0);

    return () => {
      clearTimeout(timer);
      hasStartedChat.current = false;
    };
  }, [
    initialMessages.length,
    mode,
    prompt,
    projectId,
    readOnly,
    sendMessage,
    status,
  ]);

  const isResponding = status === "submitted" || status === "streaming";
  const isBuilding = buildStatus === "building";
  const allMessages = useMemo(
    () => dedupeUiMessages([...olderMessages, ...messages]),
    [messages, olderMessages],
  );
  const allMessagesRef = useRef(allMessages);
  useEffect(() => {
    allMessagesRef.current = allMessages;
  }, [allMessages]);

  const hasActiveTurnAssistantText = useMemo(() => {
    for (let i = allMessages.length - 1; i >= 0; i--) {
      const msg = allMessages[i];
      if (msg.role === "assistant") {
        return msg.parts.some(
          (part) =>
            part.type === "text" &&
            typeof part.text === "string" &&
            isUserVisibleAssistantText(part.text),
        );
      }
      if (msg.role === "user") {
        return false;
      }
    }
    return false;
  }, [allMessages]);
  const firstTurnSettled =
    (status === "ready" || status === "error") &&
    (olderMessages.some((m) => m.role === "assistant") ||
      messages.some((m) => m.role === "assistant"));
  const firstTurnPending =
    !readOnly &&
    Boolean(prompt) &&
    workspaceCard.type === "none" &&
    !firstTurnSettled;
  const isProcessing =
    firstTurnPending ||
    isResponding ||
    isBuilding ||
    isEditingPreview ||
    isRetrying ||
    isPreparingNextQuestion;

  useEffect(() => {
    const toolCard = getWorkspaceCardFromMessages(allMessages);
    if (!toolCard || toolCard.workspaceCard.type === "none") {
      return;
    }
    if (
      !isFreshWorkspaceCard(toolCard.workspaceCard, workspaceCardRef.current) &&
      toolCard.workspaceCard.type === workspaceCardRef.current.type
    ) {
      return;
    }
    setWorkspaceCard(toolCard.workspaceCard);
    if (toolCard.projectTitle) {
      setProjectTitle(toolCard.projectTitle);
      setDraftTitle(toolCard.projectTitle);
    }
    setWorkspaceCardError(false);
  }, [allMessages, setWorkspaceCard, setProjectTitle, setDraftTitle]);
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
    consumedSignatures: consumedBuildRecommendationSignatures,
    hasFailedLatestAttemptWithLastGood,
    held: buildRecommendationHeld,
    postBuildChatOpen,
  });
  const canStartBuildNow = canStartBuild(workspaceCard);
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
  const hasLastGoodPreview = Boolean(runtimeState?.deployment);
  const shouldRenderGeneratedPreview = shouldUseGeneratedPreviewFrame({
    buildComplete,
    sourceStatus,
  });
  const hasPreview = shouldRenderGeneratedPreview;
  const showPreviewPanel = !previewCollapsed;
  const hasAnsweredActiveQuestion = hasAnsweredWorkspaceQuestion({
    card: workspaceCard,
    messages: allMessages,
    mode,
  });
  const runtimeControl = readOnly
    ? undefined
    : createRuntimeControl({
        buildStatus,
        isPublishing,
        onPublish: publishProject,
        onReload: () => {
          void loadRuntimeState();
          setSourceReloadKey((current) => current + 1);
          setPreviewReloadKey((current) => current + 1);
        },
        publishedPath,
        runtimeState,
        sourceStatus,
      });

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

  const handleBuildStreamEvent = useCallback(
    (event: BuildStreamEvent) => {
      // POST body reader and EventSource replay the same channel; drop repeats.
      if (!buildStreamDeduperRef.current(event)) {
        return;
      }
      const result = reduceBuildStreamEvent(event);

      if (result.kind === "progress") {
        setBuildProgress(result.update);
        return;
      }

      if (result.kind === "energy") {
        window.dispatchEvent(new Event("umkm:energy-changed"));
        return;
      }

      if (result.kind === "done") {
        setBuildStatus("ready");
        setWorkspaceCard({ type: "none" });
        setPostBuildChatOpen(true);
        setMode("discuss");
        setMobileSurface("chat");
        setBuildProgress((current) => completeBuildStreamProgress(current));
        patchProjectInList({ buildStatus: "ready" });
        void loadRuntimeState();
        setSourceReloadKey((current) => current + 1);
        setPreviewReloadKey((current) => current + 1);
        window.dispatchEvent(new Event("umkm:energy-changed"));
        void queryClient.invalidateQueries({
          queryKey: queryKeys.projects,
          refetchType: "active",
        });
        void queryClient.invalidateQueries({ queryKey: queryKeys.energy });
        return;
      }

      if (result.kind === "error") {
        setBuildStatus("failed");
        setMode("discuss");
        setMobileSurface("chat");
        setChatCollapsed(false);
        void loadRuntimeState();
        setSourceReloadKey((current) => current + 1);
        setBuildProgress(result.update);
      }
    },
    [loadRuntimeState, queryClient],
  );

  const activeAttemptId =
    runtimeState?.activeJob?.attemptId ||
    (["queued", "running", "building"].includes(
      runtimeState?.latestAttempt?.status || "",
    )
      ? runtimeState?.latestAttempt?.id
      : null) ||
    null;

  useBuildAttemptStream({
    attemptId: activeAttemptId,
    onEvent: handleBuildStreamEvent,
    projectId,
  });

  const sourceQuery = useQuery({
    queryKey: [
      ...queryKeys.projectSource(projectId),
      sourceReloadKey,
      buildStatus,
    ],
    queryFn: async () =>
      fetchJson<{
        buildStatus?: string;
        files?: GeneratedProjectFile[];
      }>(`/api/projects/${projectId}/source`),
    enabled: activeTab === "code",
  });

  useEffect(() => {
    if (activeTab !== "code") {
      return;
    }

    setIsLoadingSource(sourceQuery.isPending || sourceQuery.isFetching);
    setSourceError(
      sourceQuery.isError
        ? "Kode website belum bisa dimuat. Coba lagi tanpa kehilangan tampilan terakhir."
        : null,
    );

    if (sourceQuery.data) {
      setSourceFiles(sourceQuery.data.files ?? []);
      setSourceStatus(sourceQuery.data.buildStatus ?? "not_started");
    }
  }, [
    activeTab,
    sourceQuery.data,
    sourceQuery.isError,
    sourceQuery.isFetching,
    sourceQuery.isPending,
  ]);

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

    const incoming = result.messages || [];

    // After a successful turn the streamed assistant message already IS the
    if (!messagesEqualForRender(allMessagesRef.current, incoming)) {
      setMessages(incoming);
      setOlderMessages([]);
    }
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
    if (readOnly) {
      return;
    }

    // Cancel preparing poll so Stop does not force a false card-error timeout.
    preparingPollRef.current?.();
    preparingPollRef.current = null;
    setIsPreparingNextQuestion(false);
    setWorkspaceCardError(false);

    if (isResponding) {
      stop();
      return;
    }

    buildAbortRef.current?.abort();
    buildAbortRef.current = null;
    setMode("discuss");
    void cancelBuild();
  }

  useEffect(() => {
    const element = chatScrollRef.current;

    if (element && previousScrollHeight.current !== null) {
      element.scrollTop += element.scrollHeight - previousScrollHeight.current;
      previousScrollHeight.current = null;
    }
  }, [olderMessages.length]);

  const isChatNearBottom = useCallback((element: HTMLElement) => {
    // Small threshold so a slight upward scroll unsticks auto-follow.
    const distanceFromBottom =
      element.scrollHeight - element.scrollTop - element.clientHeight;
    return distanceFromBottom < 48;
  }, []);

  const scrollChatToBottom = useCallback(
    (options?: { force?: boolean; behavior?: ScrollBehavior }) => {
      const element = chatScrollRef.current;

      if (!element) {
        return;
      }

      if (!options?.force && !shouldStickToBottomRef.current) {
        return;
      }

      const behavior = options?.behavior ?? "smooth";

      // Instant programmatic jumps would otherwise look like "forced" scrolling.
      if (behavior === "auto") {
        ignoreNextScrollRef.current = true;
        element.scrollTop = element.scrollHeight;
        window.setTimeout(() => {
          ignoreNextScrollRef.current = false;
        }, 80);
        return;
      }

      element.scrollTo({
        top: element.scrollHeight,
        behavior: "smooth",
      });
    },
    [],
  );

  // First paint: stick to bottom once so first generation starts at latest.
  useEffect(() => {
    shouldStickToBottomRef.current = true;
    const frame = requestAnimationFrame(() =>
      scrollChatToBottom({ force: true, behavior: "auto" }),
    );
    const timeout = window.setTimeout(
      () => scrollChatToBottom({ force: true, behavior: "smooth" }),
      120,
    );

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
      scrollChatToBottom({ behavior: "smooth" });
    }

    previousLiveMessageCount.current = messages.length;
  }, [messages.length, scrollChatToBottom]);

  useEffect(() => {
    const element = chatScrollRef.current;

    if (
      !element ||
      buildProgress.length <= previousLiveBuildStepCount.current
    ) {
      previousLiveBuildStepCount.current = buildProgress.length;
      return;
    }

    if (shouldStickToBottomRef.current) {
      scrollChatToBottom({ behavior: "smooth" });
    }

    previousLiveBuildStepCount.current = buildProgress.length;
  }, [buildProgress.length, scrollChatToBottom]);

  useEffect(() => {
    setQuestionComposerMode("card");
    setMessage("");
  }, [activeQuestionKey]);

  // While AI streams, keep following only if user is still pinned to bottom.
  useEffect(() => {
    if (!isResponding || !shouldStickToBottomRef.current) {
      return;
    }

    const frame = requestAnimationFrame(() =>
      scrollChatToBottom({ behavior: "smooth" }),
    );
    const timeout = window.setTimeout(
      () => scrollChatToBottom({ behavior: "smooth" }),
      120,
    );

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [isResponding, messages, scrollChatToBottom]);

  useEffect(() => {
    if (shouldStickToBottomRef.current) {
      requestAnimationFrame(() => scrollChatToBottom({ behavior: "smooth" }));
    }
  }, [workspaceCard, scrollChatToBottom]);

  useEffect(() => {
    workspaceCardRef.current = workspaceCard;
  }, [workspaceCard]);

  useEffect(() => {
    if (!heldBuildRecommendationSignature) {
      return;
    }
    const signature = getBuildRecommendationHoldSignature(workspaceCard);
    const consumed =
      Boolean(signature) &&
      consumedBuildRecommendationSignatures.has(signature);
    if (
      workspaceCard.type !== "build_recommendation" ||
      consumed ||
      !signature ||
      heldBuildRecommendationSignature !== signature
    ) {
      window.localStorage.removeItem(buildRecommendationStorageKey);
      setHeldBuildRecommendationSignature(null);
    }
  }, [
    buildRecommendationStorageKey,
    consumedBuildRecommendationSignatures,
    heldBuildRecommendationSignature,
    workspaceCard,
  ]);

  useEffect(() => {
    isPreparingNextQuestionRef.current = isPreparingNextQuestion;
  }, [isPreparingNextQuestion]);

  useEffect(() => {
    if (!isPreparingNextQuestion) {
      return;
    }

    // One-call path already set a non-none card via tool output.
    if (workspaceCardRef.current.type !== "none") {
      setIsPreparingNextQuestion(false);
      return;
    }

    let canceled = false;
    const previousCard = workspaceCardRef.current;
    const startedAt = Date.now();

    const stop = () => {
      canceled = true;
      preparingPollRef.current = null;
    };
    preparingPollRef.current = stop;

    const poll = async () => {
      while (!canceled) {
        await new Promise((resolve) =>
          window.setTimeout(resolve, PREPARING_POLL_INTERVAL_MS),
        );
        if (canceled) {
          return;
        }

        if (Date.now() - startedAt >= PREPARING_TIMEOUT_MS) {
          // Final check before declaring failure: the server may have landed a
          try {
            const response = await fetch(
              `/api/projects/${projectId}/workspace`,
              { cache: "no-store" },
            );
            if (canceled) {
              return;
            }
            if (response.ok) {
              const result = (await response.json()) as WorkspaceStateResponse;
              if (canceled) {
                return;
              }
              if (isFreshWorkspaceCard(result.workspaceCard, previousCard)) {
                setWorkspaceCard(result.workspaceCard);
                if (result.projectTitle) {
                  setProjectTitle(result.projectTitle);
                  setDraftTitle(result.projectTitle);
                }
                setWorkspaceCardError(false);
                setIsPreparingNextQuestion(false);
                void reloadLatestChat();
                return;
              }
            }
          } catch {
            // Fall through to error path.
          }
          setWorkspaceCardError(true);
          setIsPreparingNextQuestion(false);
          return;
        }

        try {
          const response = await fetch(`/api/projects/${projectId}/workspace`, {
            cache: "no-store",
          });
          if (!response.ok) {
            continue;
          }
          const result = (await response.json()) as WorkspaceStateResponse;
          if (canceled) {
            return;
          }
          if (isFreshWorkspaceCard(result.workspaceCard, previousCard)) {
            setWorkspaceCard(result.workspaceCard);
            if (result.projectTitle) {
              setProjectTitle(result.projectTitle);
              setDraftTitle(result.projectTitle);
            }
            setWorkspaceCardError(false);
            setIsPreparingNextQuestion(false);
            void reloadLatestChat();
            return;
          }

          if (result.workspaceCard.type === "none") {
            setWorkspaceCardError(true);
            setIsPreparingNextQuestion(false);
            return;
          }
        } catch {
          continue;
        }
      }
    };

    void poll();

    return () => {
      canceled = true;
    };
  }, [isPreparingNextQuestion, projectId, reloadLatestChat]);

  useEffect(() => {
    // Release the synchronous submit lock once the chat settles back to idle,
    if (status === "ready" || status === "error") {
      submitInFlightRef.current = false;
    }
  }, [status]);

  // Stream watchdog: recover if the streaming connection dropped silently while the server finished
  useEffect(() => {
    if (status !== "submitted" && status !== "streaming") {
      return;
    }

    const watchdog = window.setTimeout(async () => {
      try {
        const turn = await fetchDiscussTurn(projectId);
        if (turn?.status === "succeeded") {
          await reloadLatestChat();
          clearError();
          setIsRetrying(false);
        }
      } catch {
        // ignore network error
      }
    }, 10_000);

    return () => window.clearTimeout(watchdog);
  }, [clearError, messages.length, projectId, reloadLatestChat, status]);
  // Auto-resume on cold start: if the server is actively running a turn or last local message is an unanswered user turn
  useEffect(() => {
    if (status === "submitted" || status === "streaming") {
      return;
    }

    let canceled = false;
    const poll = async () => {
      const turn = await fetchDiscussTurn(projectId);
      if (canceled) {
        return;
      }
      if (turn?.status === "running") {
        setIsRetrying("response");
        if (turn.turnId && typeof EventSource !== "undefined") {
          const es = new EventSource(
            `/api/projects/${projectId}/turns/${turn.turnId}/stream`,
          );
          const assistantMessageId = `reattach-${turn.turnId}`;
          const appendAssistantDelta = (delta: string) => {
            if (!delta) {
              return;
            }
            setMessages((current) => {
              const index = current.findIndex(
                (m) => m.id === assistantMessageId,
              );
              if (index === -1) {
                return [
                  ...current,
                  {
                    id: assistantMessageId,
                    role: "assistant",
                    parts: [{ type: "text", text: delta }],
                  },
                ];
              }
              return current.map((m, mIdx) => {
                if (mIdx !== index) {
                  return m;
                }
                const parts = m.parts.length
                  ? [...m.parts]
                  : [{ type: "text" as const, text: "" }];
                const first = parts[0];
                if (first?.type === "text") {
                  parts[0] = { ...first, text: `${first.text}${delta}` };
                }
                return { ...m, parts };
              });
            });
            shouldStickToBottomRef.current = true;
          };

          const finish = async () => {
            es.close();
            try {
              await reloadLatestChat();
            } finally {
              setIsRetrying(false);
            }
          };

          es.addEventListener("workspace-card-delta", (event) => {
            try {
              const parsed = JSON.parse(event.data) as {
                workspaceCard?: WorkspaceCard;
              };
              if (
                parsed.workspaceCard &&
                parsed.workspaceCard.type !== "none"
              ) {
                setWorkspaceCard(parsed.workspaceCard);
                setWorkspaceCardError(false);
              }
            } catch {
              // ignore malformed delta
            }
          });

          es.addEventListener("text-delta", (event) => {
            try {
              const parsed = JSON.parse(event.data) as { delta?: string };
              if (typeof parsed.delta === "string") {
                appendAssistantDelta(parsed.delta);
              }
            } catch {
              // ignore malformed SSE
            }
          });

          es.addEventListener("finish", () => {
            void finish();
          });

          es.addEventListener("error", () => {
            es.close();
            void reloadLatestChat().finally(() => setIsRetrying(false));
          });
          return;
        }
      }

      const last = messages.at(-1);
      if (!last || last.role !== "user") {
        return;
      }

      const result = resolveDiscussResume(turn);
      switch (result.kind) {
        case "reload":
          await reloadLatestChat();
          // A later turn succeeded, so a stale failure banner must not survive
          setResumeError(null);
          if (
            !isTerminalChatError({
              code: (error as ChatError | undefined)?.code,
              message: error?.message,
              status: (error as ChatError | undefined)?.status,
            })
          ) {
            clearError();
          }
          return;
        case "poll":
          setIsRetrying("response");
          await new Promise((resolve) =>
            window.setTimeout(resolve, RESUME_POLL_INTERVAL_MS),
          );
          if (!canceled) {
            void poll();
          }
          return;
        case "retry":
          setIsRetrying(false);
          setResumeError({
            message: result.errorMessage,
            retryText: result.retryText,
          });
          return;
        case "idle":
          setIsRetrying(false);
          setResumeError(null);
          return;
      }
    };
    void poll();
    return () => {
      canceled = true;
    };
  }, [clearError, error, messages, projectId, reloadLatestChat, status]);

  useEffect(() => {
    const previous = previousChatStatus.current;

    previousChatStatus.current = status;

    if (!shouldRefreshWorkspaceAfterChatStatus(previous, status)) {
      return;
    }

    window.dispatchEvent(new Event("umkm:energy-changed"));
    void queryClient.invalidateQueries({ queryKey: queryKeys.energy });

    // Prefer card from one-call tool output; settle text-only without endless preparing.
    const toolCard = getWorkspaceCardFromMessages(allMessagesRef.current);
    const lastAssistant = [...allMessagesRef.current]
      .reverse()
      .find((message) => message.role === "assistant");
    const lastAssistantHasText = Boolean(
      lastAssistant?.parts.some(
        (part) =>
          part.type === "text" &&
          typeof part.text === "string" &&
          isUserVisibleAssistantText(part.text),
      ),
    );
    const answered = hasAnsweredWorkspaceQuestion({
      card: workspaceCardRef.current,
      messages: allMessagesRef.current,
      mode: modeRef.current,
    });
    const settle = settleDiscussAfterChatReady({
      toolCard,
      lastAssistantHasText,
      mode: modeRef.current,
      answeredPreviousQuestion: answered,
    });

    setIsRetrying(false);

    if (settle.applyToolCard && toolCard) {
      if (
        isFreshWorkspaceCard(
          toolCard.workspaceCard,
          workspaceCardRef.current,
        ) ||
        toolCard.workspaceCard.type !== workspaceCardRef.current.type
      ) {
        setWorkspaceCard(toolCard.workspaceCard);
        if (toolCard.projectTitle) {
          setProjectTitle(toolCard.projectTitle);
          setDraftTitle(toolCard.projectTitle);
        }
        clearError();
        setResumeError(null);
        setWorkspaceCardError(false);
        setIsPreparingNextQuestion(false);
        void loadWorkspaceState({ preserveCard: true });
        return;
      }
    }

    if (settle.clearPreparing || settle.applyToolCard) {
      clearError();
      setResumeError(null);
      setWorkspaceCardError(false);
      setIsPreparingNextQuestion(false);
      void loadWorkspaceState({ preserveCard: true });
      return;
    }

    if (settle.enterPreparingPoll) {
      setWorkspaceCardError(false);
      setIsPreparingNextQuestion(true);
      return;
    }

    void loadWorkspaceState().then((result) => {
      if (
        modeRef.current === "discuss" &&
        !buildComplete &&
        result?.workspaceCard.type === "none" &&
        settle.setCardError
      ) {
        setWorkspaceCardError(true);
      }
    });
    void reloadLatestChat();
    const timeout = window.setTimeout(() => {
      void loadWorkspaceState();
      void reloadLatestChat();
    }, 500);

    return () => window.clearTimeout(timeout);
  }, [buildComplete, loadWorkspaceState, reloadLatestChat, status]);

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

    // Persist pending flag so a refresh mid-edit can still clear on success.
    window.localStorage.setItem(
      visualAnnotationStorageKey,
      JSON.stringify({
        annotations,
        instruction: annotationInstruction,
        pendingRevision: true,
      }),
    );

    setIsEditingPreview(true);
    setBuildStartedAt(Date.now());
    setBuildProgress((current) =>
      appendBuildProgressStep(current, {
        detail: "Menerapkan komentar visual ke tampilan website sebelumnya.",
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
              setBuildProgress((current) =>
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
        // Fallback for pre-stream HTTP errors (409, 401, etc.)
        result = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
      }

      if (!response.ok || result?.buildStatus !== "succeeded") {
        pendingVisualRevisionRef.current = false;
        setBuildProgress((current) =>
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
      setDirectEditMode(false);
      setBuildStatus("ready");
      setBuildProgress((current) => completeBuildProgressSteps(current));
      setActiveTab("preview");
      setPreviewCollapsed(false);
      setPreviewReloadKey((current) => current + 1);
      patchProjectInList({ buildStatus: "ready" });
      void loadRuntimeState();
      window.dispatchEvent(new Event("umkm:energy-changed"));
      void queryClient.invalidateQueries({
        queryKey: queryKeys.projects,
        refetchType: "active",
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.energy });
    } finally {
      visualEditInFlightRef.current = false;
      setIsEditingPreview(false);
    }
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
        handleAnnotationTarget(data.payload);
      }
    },
    [handleAnnotationTarget],
  );

  useEffect(() => {
    window.addEventListener("message", handleDirectEditMessage);
    return () => window.removeEventListener("message", handleDirectEditMessage);
  }, [handleDirectEditMessage]);

  function toggleDirectEdit() {
    setDirectEditMode((current) => {
      const next = !current;
      setPendingAnnotationTarget(null);
      if (next) {
        setChatCollapsed(true);
        window.requestAnimationFrame(() => {
          chatPanelRef.current?.collapse();
          previewPanelRef.current?.resize("100%");
        });
      }
      return next;
    });
    setActiveTab("preview");
  }

  function applyHistoryLayout(layout: EditLayout | null) {
    setPendingEditLayout(layout);
    setEditLayoutSignal((current) => current + 1);
  }

  const handleUndo = useCallback(() => {
    if (editIntentHistory.present.length || editIntentHistory.past.length) {
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
  }, [editIntentHistory.past.length, editIntentHistory.present.length]);

  const handleRedo = useCallback(() => {
    if (editIntentHistory.future.length) {
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
  }, [editIntentHistory.future.length]);

  function handleDiscard() {
    setEditHistory({ present: null, past: [], future: [] });
    setEditIntentHistory({ present: [], past: [], future: [] });
    setPendingEditLayout(null);
    setDirectEditMode(false);
    setPreviewReloadKey((current) => current + 1);
  }

  async function submitDirectEdit({
    instruction,
    summary,
  }: {
    instruction: string;
    summary: string;
  }) {
    if (readOnly || isProcessing) {
      return false;
    }
    setIsEditingPreview(true);
    setBuildStartedAt(Date.now());
    setBuildProgress((current) =>
      appendBuildProgressStep(current, {
        detail: "Menerapkan perubahan struktur ke tampilan website sebelumnya.",
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
              setBuildProgress((current) =>
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
        setBuildProgress((current) =>
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

      setBuildStatus("ready");
      setBuildProgress((current) => completeBuildProgressSteps(current));
      setEditHistory({ present: null, past: [], future: [] });
      setEditIntentHistory({ present: [], past: [], future: [] });
      setPendingEditLayout(null);
      setDirectEditMode(false);
      setPreviewReloadKey((current) => current + 1);
      patchProjectInList({ buildStatus: "ready" });
      void loadRuntimeState();
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
  }

  async function saveDirectEdit() {
    const intentInstruction = buildDirectEditIntentInstruction(
      editIntentHistory.present,
    );
    if (intentInstruction) {
      setDirectEditMode(false);
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
    await submitDirectEdit({ instruction, summary: instruction });
  }

  function queueDirectEditIntent(intent: DirectEditIntent) {
    setEditIntentHistory((current) => intentHistoryPush(current, intent));
  }

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
    const instruction = createImageReplaceEditInstruction({
      replaceWith: [{ alt: "Gambar baru", mediaPath }],
      target,
    });
    setPendingAnnotationTarget(null);
    await submitDirectEdit({ instruction, summary: "Ganti gambar." });
  }

  const saveTitleMutation = useCacheMutation<
    { title: string },
    { title: string }
  >({
    mutationFn: async ({ title }) => {
      const response = await fetch(`/api/projects/${projectId}/title`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const result = (await response.json().catch(() => null)) as {
        title?: string;
      } | null;

      if (!response.ok || !result?.title) {
        throw new Error("Judul belum berhasil disimpan.");
      }

      return { title: result.title };
    },
    optimisticPatches: [
      {
        queryKey: queryKeys.projects,
        updater: (previous, variables) => {
          const data = previous as
            | {
                pages: Array<{
                  projects: Array<{ id: string; title: string }>;
                }>;
                pageParams: unknown[];
              }
            | undefined;

          if (!data) {
            return data;
          }

          return {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              projects: page.projects.map((project) =>
                project.id === projectId
                  ? { ...project, title: variables.title }
                  : project,
              ),
            })),
          };
        },
      },
    ],
    invalidateKeys: [queryKeys.projects],
    onSuccess: ({ title }) => {
      setProjectTitle(title);
      setDraftTitle(title);
    },
  });

  async function saveProjectTitle() {
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
  }

  const submitChatText = useCallback(
    async (
      text: string,
      options: {
        workspaceAnswers?: WorkspaceAnswerPayload[];
        uploads?: Array<{ assetId: string; url: string }>;
      } = {},
    ) => {
      if (readOnly) {
        return;
      }

      const trimmed = text.trim();
      if (new TextEncoder().encode(trimmed).length > MAX_CHAT_BYTES) {
        toast.error("Pesan terlalu panjang. Maksimal 16.000 karakter.");
        return;
      }
      const hasAnswers = Boolean(options.workspaceAnswers?.length);

      if (
        (!trimmed &&
          !hasAnswers &&
          pendingAttachments.length === 0 &&
          !options.uploads?.length) ||
        isProcessing ||
        rateLimitError ||
        authStatus !== "authenticated" ||
        sessionExpired ||
        submitInFlightRef.current
      ) {
        return;
      }

      // Lock the channel immediately and enter processing state so user gets instant upload feedback
      submitInFlightRef.current = true;
      setIsSubmittingTurn(true);

      // Submit-first: the worker moderates + claims after the message persists.
      if (hasUploadingAttachments(pendingAttachments)) {
        toast.error("Tunggu unggahan gambar selesai dulu ya.");
        submitInFlightRef.current = false;
        setIsSubmittingTurn(false);
        return;
      }

      const fileParts: FileUIPart[] = [];

      for (const item of options.uploads ?? []) {
        fileParts.push(
          createUploadedImageFilePart({
            filename: "gambar-usaha.jpg",
            mediaType: "image/jpeg",
            url: item.url,
          }),
        );
      }

      for (const item of pendingAttachments) {
        if (!item.assetId) {
          continue;
        }
        fileParts.push(
          createUploadedImageFilePart({
            filename: item.file.name,
            mediaType: item.file.type,
            url: tempImageUrl(item.assetId),
          }),
        );
      }

      if (
        pendingAttachments.length > 0 &&
        fileParts.length === (options.uploads?.length ?? 0)
      ) {
        toast.error(
          "Gambar belum siap dikirim. Coba pilih ulang gambarnya ya.",
        );
        submitInFlightRef.current = false;
        setIsSubmittingTurn(false);
        return;
      }

      // Lock the channel for the duration of the request so a synchronous
      submitInFlightRef.current = true;

      // User is sending a new turn: re-pin and jump to latest.
      shouldStickToBottomRef.current = true;
      setRateLimitError(null);
      setResumeError(null);
      clearError(); // hide stale banner from the previous failed turn
      retryAttemptRef.current = 0;
      setMessage("");
      setBuildProgress([]);
      requestAnimationFrame(() =>
        scrollChatToBottom({ force: true, behavior: "smooth" }),
      );

      // Post-build "Chat dengan AI" is discuss-only. Rebuilds use the
      sendMessage(
        {
          files: fileParts.length ? fileParts : undefined,
          text: trimmed,
        },
        {
          body: {
            mode: composerState === "post_build_chat" ? "discuss" : mode,
            workspaceAnswers: options.workspaceAnswers,
          },
        },
      );

      if (pendingAttachments.length) {
        revokeAll(pendingAttachments);
        setPendingAttachments([]);
      }
      setIsSubmittingTurn(false);
    },
    [
      authStatus,
      clearError,
      composerState,
      isProcessing,
      mode,
      pendingAttachments,
      projectId,
      rateLimitError,
      readOnly,
      scrollChatToBottom,
      sendMessage,
      sessionExpired,
      setBuildProgress,
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
    setPostBuildChatOpen(true);
    setMode("discuss");
  }, [buildRecommendationSignature, buildRecommendationStorageKey]);

  const openBuildRecommendation = useCallback(() => {
    window.localStorage.removeItem(buildRecommendationStorageKey);
    setHeldBuildRecommendationSignature(null);
  }, [buildRecommendationStorageKey]);

  const dismissBuildRecommendation = useCallback(() => {
    window.localStorage.removeItem(buildRecommendationStorageKey);
    setHeldBuildRecommendationSignature(null);
    const signature = getBuildRecommendationHoldSignature(
      workspaceCardRef.current,
    );
    if (signature) {
      setConsumedBuildRecommendationSignatures((prev) => {
        if (prev.has(signature)) {
          return prev;
        }
        const next = new Set(prev);
        next.add(signature);
        try {
          window.localStorage.setItem(
            buildRecommendationConsumedKey,
            JSON.stringify([...next]),
          );
        } catch {
          // ignore
        }
        return next;
      });
    }
  }, [buildRecommendationConsumedKey, buildRecommendationStorageKey]);

  function handleMessageSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submitChatText(message);
  }

  // Append a one-liner to the chat so the user sees what fields the AI is
  const handleStartBuild = useCallback(async () => {
    if (readOnly) {
      return;
    }

    let handoffBrief = latestBrief;
    if (!handoffBrief) {
      try {
        const state = await loadWorkspaceState({ preserveCard: true });
        if (state?.brief) {
          handoffBrief = state.brief;
          setLatestBrief(state.brief);
        }
      } catch {
        // Continue to startBuild even if brief fetch fails
      }
    }

    if (handoffBrief && !buildComplete && messages.length <= 2) {
      setMessages((current) => [
        ...current,
        {
          id: `handoff-${Date.now()}`,
          metadata: undefined,
          parts: [
            {
              text: `Siap, website ${handoffBrief?.businessName || "usahamu"} mulai aku buat sekarang ya!`,
              type: "text",
            },
          ],
          role: "assistant",
        },
      ]);
      shouldStickToBottomRef.current = true;
    }

    await startBuild();
  }, [
    buildComplete,
    latestBrief,
    loadWorkspaceState,
    messages.length,
    readOnly,
    startBuild,
  ]);

  const handlePrimaryComposerAction = useCallback(async () => {
    if (readOnly || isBuilding) {
      return;
    }

    if (buildComplete) {
      // 1. If user already typed text or attached files, submit the edit turn
      if (message.trim() || pendingAttachments.length > 0) {
        submitChatText(message);
        return;
      }

      // 2. If there is an unbuilt build recommendation ready to apply, build it
      if (
        workspaceCard.type === "build_recommendation" &&
        canStartBuild(workspaceCard)
      ) {
        await handleStartBuild();
        return;
      }

      // 3. Otherwise (no pending changes), guide user intentionally instead of blind building
      if (chatCollapsed) {
        openChatPanel();
      }
      setMessages((current) => {
        const guideText =
          "Bagian apa yang ingin kamu perbarui? Tulis kebutuhanmu di bawah ya.";
        const last = current[current.length - 1];
        if (
          last &&
          last.role === "assistant" &&
          last.parts?.some(
            (p) => p.type === "text" && p.text.trim() === guideText.trim(),
          )
        ) {
          return current;
        }
        return [
          ...current,
          {
            id: `guide-${Date.now()}`,
            metadata: undefined,
            parts: [
              {
                text: guideText,
                type: "text",
              },
            ],
            role: "assistant",
          },
        ];
      });
      shouldStickToBottomRef.current = true;
      requestAnimationFrame(() => {
        const textarea = document.querySelector<HTMLTextAreaElement>(
          "textarea#workspace-message",
        );
        textarea?.focus();
      });
      return;
    }

    await handleStartBuild();
  }, [
    buildComplete,
    chatCollapsed,
    handleStartBuild,
    isBuilding,
    message,
    openChatPanel,
    pendingAttachments.length,
    readOnly,
    submitChatText,
    workspaceCard,
  ]);

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

  const retryChat = useCallback(async () => {
    if (status === "streaming" || status === "submitted" || isRetrying) {
      return;
    }

    setIsRetrying("response");
    clearError();

    try {
      const turnRes = await fetch(`/api/projects/${projectId}/chat/turn`, {
        cache: "no-store",
      });

      if (turnRes.ok) {
        const turn = (await turnRes.json()) as {
          status: string;
          userMessageId?: string;
          errorMessage?: string;
        };

        if (turn.status === "succeeded") {
          // Turn already completed — reload persisted chat rather than
          try {
            await reloadLatestChat();
          } finally {
            setIsRetrying(false);
          }
          return;
        }

        if (turn.status === "running") {
          // Prefer live turn stream reattach; fall back to status poll.
          const turnWithId = turn as {
            status: string;
            turnId?: string;
            userMessageId?: string;
            errorMessage?: string;
          };
          const turnId =
            typeof turnWithId.turnId === "string" ? turnWithId.turnId : null;
          if (turnId && typeof EventSource !== "undefined") {
            const es = new EventSource(
              `/api/projects/${projectId}/turns/${turnId}/stream`,
            );
            const assistantMessageId = `reattach-${turnId}`;
            const appendAssistantDelta = (delta: string) => {
              if (!delta) {
                return;
              }
              setMessages((current) => {
                const index = current.findIndex(
                  (message) => message.id === assistantMessageId,
                );
                if (index === -1) {
                  return [
                    ...current,
                    {
                      id: assistantMessageId,
                      role: "assistant",
                      parts: [{ type: "text", text: delta }],
                    },
                  ];
                }
                return current.map((message, messageIndex) => {
                  if (messageIndex !== index) {
                    return message;
                  }
                  const parts = message.parts.length
                    ? [...message.parts]
                    : [{ type: "text" as const, text: "" }];
                  const first = parts[0];
                  if (first?.type === "text") {
                    parts[0] = { ...first, text: `${first.text}${delta}` };
                  }
                  return { ...message, parts };
                });
              });
              shouldStickToBottomRef.current = true;
            };
            const parseEvent = (event: MessageEvent) => {
              try {
                return JSON.parse(event.data) as Record<string, unknown>;
              } catch {
                return null;
              }
            };
            const finish = async () => {
              es.close();
              try {
                await reloadLatestChat();
              } catch {
                // best-effort chat reload on stream finish
              } finally {
                setIsRetrying(false);
              }
            };
            es.addEventListener("workspace-card-delta", (event) => {
              const parsed = parseEvent(event);
              const card = parsed?.workspaceCard as WorkspaceCard | undefined;
              if (card && card.type !== "none") {
                setWorkspaceCard(card);
                setWorkspaceCardError(false);
              }
            });
            es.addEventListener("text-delta", (event) => {
              const parsed = parseEvent(event);
              const delta =
                typeof parsed?.delta === "string"
                  ? parsed.delta
                  : typeof parsed?.text === "string"
                    ? parsed.text
                    : "";
              appendAssistantDelta(delta);
            });
            es.addEventListener("tool-output-available", (event) => {
              const parsed = parseEvent(event);
              const output = parsed?.output as
                | { projectTitle?: unknown; workspaceCard?: WorkspaceCard }
                | undefined;
              if (
                !output?.workspaceCard ||
                output.workspaceCard.type === "none"
              ) {
                return;
              }
              setWorkspaceCard(output.workspaceCard);
              if (typeof output.projectTitle === "string") {
                setProjectTitle(output.projectTitle);
                setDraftTitle(output.projectTitle);
              }
              setWorkspaceCardError(false);
              setIsPreparingNextQuestion(false);
              setIsRetrying(false);
            });
            es.addEventListener("heartbeat", () => {
              // Heartbeat keeps the SSE connection alive while server prepares cards/handoffs.
            });
            es.addEventListener("finish", () => {
              void finish();
            });
            es.addEventListener("error", () => {
              void finish();
            });
            es.onerror = () => {
              // Stream died — fall back to poll once.
              es.close();
              void (async () => {
                try {
                  await reloadLatestChat();
                } finally {
                  setIsRetrying(false);
                }
              })();
            };
            return;
          }
          const pollRunningTurn = async () => {
            const pollRes = await fetch(
              `/api/projects/${projectId}/chat/turn`,
              { cache: "no-store" },
            );
            if (!pollRes.ok) {
              setIsRetrying(false);
              return;
            }
            const pollTurn = (await pollRes.json()) as {
              status: string;
            };
            if (pollTurn.status === "running") {
              window.setTimeout(pollRunningTurn, RESUME_POLL_INTERVAL_MS);
              return;
            }
            try {
              await reloadLatestChat();
            } catch {
              // best-effort chat reload on stream finish
            } finally {
              setIsRetrying(false);
            }
          };
          pollRunningTurn();
          return;
        }
      }
    } catch {
      // Fetch failed — fall through to regenerate below.
    }

    // Fallback: no extant /chat/turn (404, fetch error, failed/idle turn)
    try {
      await regenerate();
    } catch {
      // The error panel remains visible.
    } finally {
      setIsRetrying(false);
    }
  }, [clearError, isRetrying, projectId, regenerate, reloadLatestChat, status]);

  const lastAutoRetriedErrorRef = useRef<unknown>(null);

  useEffect(() => {
    if (!error || readOnly) {
      return;
    }
    if (isRetrying || status === "streaming" || status === "submitted") {
      return;
    }
    // Same error already handled (React 18 StrictMode double-invoke guard).
    if (lastAutoRetriedErrorRef.current === error) {
      return;
    }
    const err = error as ChatError;
    const terminal = isTerminalChatError({
      code: err.code,
      message: err.message,
      status: err.status,
    });
    if (terminal) {
      return; // banner renders with redacted copy
    }
    const next = nextRetryAttempt(retryAttemptRef.current, _autoRetryAttempts);
    if (next === null) {
      return; // cap reached — banner renders
    }
    lastAutoRetriedErrorRef.current = error;
    retryAttemptRef.current = next;
    setIsRetrying("response");
    const timer = window.setTimeout(() => {
      void retryChat();
    }, autoRetryDelayMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    error,
    isRetrying,
    status,
    readOnly,
    _autoRetryAttempts,
    autoRetryDelayMs,
    retryChat,
  ]);

  // Reset retry counter and clear stale errors on a successful turn completion.
  useEffect(() => {
    if (status === "ready") {
      retryAttemptRef.current = 0;
      lastAutoRetriedErrorRef.current = null;
      clearError();
    }
  }, [clearError, status]);

  const retryWorkspaceCard = useCallback(async () => {
    if (status === "streaming" || status === "submitted" || isRetrying) {
      return;
    }

    setIsRetrying("card");
    clearError();

    // When a prior user turn exists, re-stream it via the normal chat path so
    const hasUserTurn = messages.some((message) => message.role === "user");
    if (hasUserTurn) {
      setWorkspaceCardError(false);
      setIsPreparingNextQuestion(true);
      try {
        await regenerate();
      } catch {
        setWorkspaceCardError(true);
        setIsPreparingNextQuestion(false);
      } finally {
        setIsRetrying(false);
      }
      return;
    }

    try {
      const response = await fetch("/api/projects/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "repair_card", projectId }),
      });
      const result = (await response
        .json()
        .catch(() => null)) as WorkspaceStateResponse | null;

      if (!response.ok || !result?.workspaceCard) {
        setWorkspaceCardError(true);
        return;
      }

      setWorkspaceCard(result.workspaceCard);
      setProjectTitle(result.projectTitle);
      setDraftTitle(result.projectTitle);
      setWorkspaceCardError(false);
      void reloadLatestChat();
    } catch {
      setWorkspaceCardError(true);
    } finally {
      setIsRetrying(false);
    }
  }, [
    clearError,
    isRetrying,
    messages,
    projectId,
    regenerate,
    reloadLatestChat,
    status,
  ]);

  useEffect(() => {
    if (error) {
      captureRateLimitError(error, setRateLimitError);
    }
  }, [error]);

  // 429 banner used to stick forever (deadlock). Auto-clear after retryAfter.
  useEffect(() => {
    if (!rateLimitError) {
      return;
    }

    const ms = Math.max(1, rateLimitError.retryAfter) * 1000;
    const timeout = window.setTimeout(() => {
      setRateLimitError(null);
      clearError();
    }, ms);

    return () => window.clearTimeout(timeout);
  }, [clearError, rateLimitError]);

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
    "flex h-full min-h-0 min-w-0 overflow-x-hidden flex-col bg-[#eceae4] text-[#1c1c1c] transition-colors duration-200 dark:bg-[#1b1b19] dark:text-surface-warm-white";
  const previewPanelClass = "h-full min-h-0 min-w-0";

  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  function handleTouchStart(event: React.TouchEvent) {
    const touch = event.touches[0];
    swipeStartRef.current = { x: touch.clientX, y: touch.clientY };
  }
  function handleTouchEnd(event: React.TouchEvent) {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!start) {
      return;
    }
    // Swipe only switches Diskusi <-> Tampilan on mobile. Off when on Kode
    if (mobileSurface === "preview" && activeTab === "code") {
      return;
    }
    const touch = event.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    // Only horizontal swipes (dx dominant + vertical small) past 60px trigger.
    if (Math.abs(dx) < 60 || Math.abs(dy) > 40) {
      return;
    }
    if (dx < 0 && mobileSurface === "chat") {
      openPreviewPanel();
    } else if (dx > 0 && mobileSurface === "preview") {
      openChatPanel();
    }
  }

  const chatPanelContent = (
    <aside className={chatPanelClass}>
      <div className="hidden h-11 shrink-0 items-center justify-between gap-2 border-b border-black/10 bg-[#f4f2ec] px-4 transition-colors dark:border-surface-warm-white/10 dark:bg-[#121210] lg:flex">
        <div className="flex min-w-0 flex-1 items-center gap-2">
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
              className="min-w-0 flex-1 rounded-radius-md border border-black/15 bg-black/[0.03] px-spacing-3 py-spacing-2 text-xs font-bold text-[#1c1c1c] outline-none focus:border-black/30 dark:border-surface-warm-white/12 dark:bg-surface-warm-white/8 dark:text-surface-warm-white dark:focus:border-surface-warm-white/30"
            />
          ) : (
            <h1 className="truncate text-xs font-bold tracking-tight text-foreground dark:text-surface-warm-white">
              {projectTitle}
            </h1>
          )}
          {!readOnly && isRenaming ? (
            <button
              type="button"
              onClick={() => void saveProjectTitle()}
              className="inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-emerald-600/15 text-emerald-700 hover:bg-emerald-600/25 dark:bg-emerald-400/20 dark:text-emerald-300 dark:hover:bg-emerald-400/30 transition-colors cursor-pointer"
              aria-label="Simpan nama proyek"
            >
              <Check className="size-3.5" />
            </button>
          ) : !readOnly ? (
            <button
              type="button"
              onClick={() => setIsRenaming(true)}
              className="rounded-full p-1 text-[#5f5f5d] hover:bg-black/5 hover:text-[#1c1c1c] dark:text-surface-warm-white/44 dark:hover:bg-surface-warm-white/8 dark:hover:text-surface-warm-white"
              aria-label="Ubah nama proyek"
            >
              <Pencil className="size-3" />
            </button>
          ) : null}
        </div>

        {/* Global Controls when pre-build, or Close Button when preview panel is active */}
        {!hasPreview ? (
          <div className="flex items-center gap-3.5">
            <EnergyDisplay projectId={projectId} />
            <ThemeToggle />
            <AuthButton />
          </div>
        ) : (
          <button
            type="button"
            onClick={closeChatPanel}
            className="hidden size-7 shrink-0 items-center justify-center rounded-lg border border-border/80 bg-card text-foreground shadow-2xs transition-all hover:border-foreground/30 hover:bg-muted active:scale-95 cursor-pointer dark:border-white/15 dark:bg-[#252522] dark:hover:bg-[#2e2e2a] sm:inline-flex"
            aria-label="Tutup panel diskusi (layar penuh tampilan)"
            title="Tutup panel diskusi"
          >
            <X className="size-3.5 text-muted-foreground hover:text-foreground dark:text-surface-warm-white/70 dark:hover:text-surface-warm-white" />
          </button>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="relative min-h-0 flex-1">
          <div
            ref={chatScrollRef}
            onWheel={(event) => {
              // Immediate unstick when user scrolls up, even mid smooth-follow.
              if (event.deltaY < 0) {
                shouldStickToBottomRef.current = false;
              }
            }}
            onTouchStart={() => {
              // Touch drag intent: stop forcing until they return to bottom.
              const element = chatScrollRef.current;
              if (element && !isChatNearBottom(element)) {
                shouldStickToBottomRef.current = false;
              }
            }}
            onScroll={(event) => {
              if (ignoreNextScrollRef.current) {
                return;
              }

              const element = event.currentTarget;
              const nearBottom = isChatNearBottom(element);
              shouldStickToBottomRef.current = nearBottom;
              setShowScrollToBottom(!nearBottom);
            }}
            className="h-full space-y-spacing-6 overflow-y-auto overflow-x-hidden p-4 [scrollbar-color:#6f6a60_transparent] [scrollbar-width:thin]"
          >
            {hasMoreChat ? (
              <div className="flex justify-center py-spacing-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void loadOlderChat()}
                  disabled={isLoadingOlderChat}
                  className="rounded-radius-lg border border-black/10 bg-black/5 text-[#1c1c1c] hover:bg-black/10 dark:border-surface-warm-white/14 dark:bg-surface-warm-white/8 dark:text-surface-warm-white dark:hover:bg-surface-warm-white/12"
                >
                  {isLoadingOlderChat ? "Memuat..." : "Muat chat lama"}
                </Button>
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

            {rateLimitError ? (
              <div className="rounded-2xl border border-[#ffb4a6]/24 bg-[#ffb4a6]/[0.06] px-spacing-5 py-spacing-4">
                <p className="text-sm font-medium text-[#ffb4a6]">
                  {rateLimitError.message}
                </p>
              </div>
            ) : sessionExpired ? (
              <div className="rounded-2xl border border-[#ffb4a6]/24 bg-[#ffb4a6]/[0.06] px-spacing-5 py-spacing-4">
                <p className="text-sm font-medium text-[#ffb4a6]">
                  Sesi kamu sudah habis.
                </p>
                <Button
                  type="button"
                  onClick={() => void signOut({ callbackUrl: "/" })}
                  className="mt-spacing-3 h-9 rounded-lg bg-surface-warm-white px-spacing-5 text-xs text-foreground-primary hover:bg-surface-warm-white/86 cursor-pointer"
                >
                  Login ulang
                </Button>
              </div>
            ) : workspaceCardError ? (
              <div className="rounded-2xl border border-[#ffb4a6]/24 bg-[#ffb4a6]/[0.06] px-spacing-5 py-spacing-4">
                <p className="text-sm font-medium text-[#ffb4a6]">
                  Pertanyaan berikutnya belum berhasil dibuat.
                </p>
                {!readOnly ? (
                  <Button
                    type="button"
                    onClick={() => void retryWorkspaceCard()}
                    className="mt-spacing-3 h-9 rounded-lg bg-surface-warm-white px-spacing-5 text-xs text-foreground-primary hover:bg-surface-warm-white/86 cursor-pointer"
                  >
                    Coba lagi
                  </Button>
                ) : null}
              </div>
            ) : error &&
              (error as ChatError).code === "project_request_blocked" ? (
              <div className="rounded-2xl border border-status-warning-border bg-status-warning-subtle px-spacing-5 py-spacing-4">
                <div className="flex items-start gap-spacing-3">
                  <span className="mt-0.5 text-status-warning" aria-hidden>
                    ⚠️
                  </span>
                  <p className="text-sm leading-6 text-foreground/85 dark:text-surface-warm-white/78">
                    {error.message}
                  </p>
                </div>
              </div>
            ) : error && (error as ChatError).code === "chat_turn_too_large" ? (
              <div className="rounded-2xl border border-destructive-border bg-destructive-subtle px-spacing-5 py-spacing-4">
                <p className="text-sm font-medium text-destructive">
                  Pesan terlalu panjang. Ringkas dulu sebelum dikirim.
                </p>
              </div>
            ) : error && !isRetrying ? (
              <div className="rounded-2xl border border-destructive-border bg-destructive-subtle px-spacing-5 py-spacing-4">
                <p className="text-sm font-medium text-destructive">
                  {toUserFacingDiscussError(error.message)}
                </p>
                {!readOnly ? (
                  <Button
                    type="button"
                    onClick={() => void retryChat()}
                    className="mt-spacing-3 h-9 rounded-lg bg-foreground px-spacing-5 text-xs text-background hover:bg-foreground/90 dark:bg-surface-warm-white dark:text-foreground-primary dark:hover:bg-surface-warm-white/86 cursor-pointer"
                  >
                    Kirim ulang
                  </Button>
                ) : null}
              </div>
            ) : resumeError ? (
              <div className="rounded-2xl border border-destructive-border bg-destructive-subtle px-spacing-5 py-spacing-4">
                <p className="text-sm font-medium text-destructive">
                  {resumeError.message}
                </p>
                {!readOnly ? (
                  <Button
                    type="button"
                    onClick={() => void retryChat()}
                    className="mt-spacing-3 h-9 rounded-lg bg-foreground px-spacing-5 text-xs text-background hover:bg-foreground/90 dark:bg-surface-warm-white dark:text-foreground-primary dark:hover:bg-surface-warm-white/86 cursor-pointer"
                  >
                    {resumeError.retryText}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>

          {showScrollToBottom && (
            <button
              type="button"
              onClick={() => {
                shouldStickToBottomRef.current = true;
                scrollChatToBottom({ force: true, behavior: "smooth" });
                setShowScrollToBottom(false);
              }}
              className="absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 cursor-pointer items-center gap-2 rounded-full border border-surface-warm-white/10 bg-surface-warm-white px-4 py-2 text-xs font-semibold text-foreground-primary shadow-lg transition-all hover:bg-surface-warm-white/90 active:scale-95"
            >
              <ArrowDown className="size-3.5" />
              <span>Lompat ke Bawah</span>
            </button>
          )}
        </div>

        <div className="shrink-0 bg-transparent">
          {readOnly ? (
            <div className="p-4 text-sm text-[#5f5f5d] dark:text-surface-warm-white/62">
              Mode baca-saja aktif. Chat, build, dan aksi edit tidak tersedia.
            </div>
          ) : (
            <AnimatePresence mode="wait" initial={false}>
              {isProcessing ? (
                <motion.div
                  key="composer-processing"
                  {...COMPOSER_TRANSITION}
                  className="p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
                >
                  <ProcessingControl
                    currentStep={resolveCurrentBuildProgressStep(buildProgress)}
                    mode={isBuilding ? "Buat" : "Diskusi"}
                    discussPhase={
                      isRetrying === "card"
                        ? "retrying_card"
                        : isRetrying === "response"
                          ? "retrying_response"
                          : isResponding && hasActiveTurnAssistantText
                            ? "streaming"
                            : isResponding
                              ? "processing"
                              : isPreparingNextQuestion
                                ? "preparing_card"
                                : firstTurnPending
                                  ? "processing"
                                  : "processing"
                    }
                    onStop={stopCurrentJob}
                  />
                </motion.div>
              ) : rateLimitError ? (
                <motion.div
                  key="composer-rate-limit"
                  {...COMPOSER_TRANSITION}
                  className="p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
                >
                  <div className="rounded-2xl border border-surface-warm-white/10 bg-[#242421] p-4 text-sm text-surface-warm-white/62">
                    Tunggu sebentar sebelum mengirim jawaban berikutnya.
                  </div>
                </motion.div>
              ) : isPreparingNextQuestion ||
                workspaceCardError ? null : !hasAnsweredActiveQuestion &&
                (workspaceCard.type === "question" ||
                  (workspaceCard.type === "image_upload" &&
                    composerUploadsEnabled)) ? (
                <div className="p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                  {/* Top Mode Switcher: Separated from the text area */}
                  <div className="flex items-center justify-between">
                    <div className="inline-flex h-8 items-center rounded-full border border-black/10 bg-black/5 p-0.5 text-xs dark:border-white/15 dark:bg-white/10">
                      <button
                        type="button"
                        onClick={() => setQuestionComposerMode("card")}
                        className={cn(
                          "flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition cursor-pointer",
                          questionComposerMode === "card"
                            ? "bg-[#1c1c1c] text-white shadow-xs dark:bg-surface-warm-white dark:text-[#10100f]"
                            : "text-[#5f5f5d] hover:text-[#1c1c1c] dark:text-surface-warm-white/70 dark:hover:text-surface-warm-white",
                        )}
                      >
                        <span>
                          {workspaceCard.type === "image_upload"
                            ? "Unggah Foto"
                            : workspaceCard.question?.answerMode === "text"
                              ? "Pertanyaan"
                              : "Pilihan"}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setQuestionComposerMode("free")}
                        className={cn(
                          "flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition cursor-pointer",
                          questionComposerMode === "free"
                            ? "bg-[#1c1c1c] text-white shadow-xs dark:bg-surface-warm-white dark:text-[#10100f]"
                            : "text-[#5f5f5d] hover:text-[#1c1c1c] dark:text-surface-warm-white/70 dark:hover:text-surface-warm-white",
                        )}
                      >
                        <span>Tulis bebas</span>
                      </button>
                    </div>
                  </div>

                  <AnimatePresence mode="wait" initial={false}>
                    {questionComposerMode === "card" ? (
                      <motion.div
                        key="question-card-mode"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.18, ease: "easeOut" }}
                        className="mt-2.5"
                      >
                        {workspaceCard.type === "image_upload" ? (
                          <ImageUploadComposer
                            imageUpload={workspaceCard.imageUpload}
                            projectId={projectId}
                            onSubmit={(answer, workspaceAnswers, uploads) =>
                              submitChatText(answer, {
                                workspaceAnswers,
                                uploads,
                              })
                            }
                          />
                        ) : (
                          <QuestionComposer
                            question={workspaceCard.question}
                            onSubmit={(answer, workspaceAnswers) =>
                              submitChatText(answer, { workspaceAnswers })
                            }
                          />
                        )}
                      </motion.div>
                    ) : (
                      <motion.form
                        key="question-free-mode"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.18, ease: "easeOut" }}
                        onSubmit={handleMessageSubmit}
                        className="mt-2.5"
                      >
                        <label htmlFor="workspace-message" className="sr-only">
                          Pesan untuk AI
                        </label>
                        <div className="rounded-2xl border border-black/10 bg-white p-2.5 shadow-sm transition-colors focus-within:border-black/30 dark:border-white/15 dark:bg-[#282824] dark:shadow-[0_4px_20px_rgba(0,0,0,0.35)] dark:focus-within:border-white/30">
                          {pendingAttachments.length > 0 ? (
                            <ComposerAttachments
                              attachments={pendingAttachments}
                              onRemove={(id) =>
                                setPendingAttachments((cur) =>
                                  removeAttachment(cur, id),
                                )
                              }
                            />
                          ) : null}
                          <textarea
                            id="workspace-message"
                            rows={2}
                            value={message}
                            onChange={(event) => {
                              setMessage(event.target.value);
                              const target = event.currentTarget;
                              target.style.height = "auto";
                              target.style.height = `${Math.min(target.scrollHeight, 6 * 24 + 24)}px`;
                            }}
                            onKeyDown={handleMessageKeyDown}
                            inputMode="text"
                            enterKeyHint="send"
                            placeholder={
                              sessionExpired
                                ? "Sesi habis, login ulang..."
                                : "Tulis pesan atau kebutuhanmu di sini..."
                            }
                            className="w-full resize-none bg-transparent px-1 py-1 text-sm leading-6 text-foreground outline-none [scrollbar-width:none] placeholder:text-muted-foreground disabled:opacity-60 [&::-webkit-scrollbar]:hidden"
                            disabled={
                              sessionExpired || authStatus !== "authenticated"
                            }
                          />
                          <div className="mt-2 flex items-center justify-between gap-3 border-t border-black/10 pt-2 dark:border-white/10">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => void handlePrimaryComposerAction()}
                              disabled={isBuilding || readOnly}
                              className="h-8 rounded-lg border-black/15 bg-white px-3 text-xs font-medium text-foreground hover:bg-black/5 hover:text-foreground active:scale-95 dark:border-white/15 dark:bg-white/5 dark:hover:bg-white/10 cursor-pointer"
                            >
                              {buildComplete
                                ? "Perbarui Website"
                                : "Buat Website"}
                            </Button>
                            <div className="flex items-center gap-1.5">
                              {composerUploadsEnabled ? (
                                <ComposerAttachButton
                                  attachments={pendingAttachments}
                                  onAdd={(next, rejected) => {
                                    const added = next.filter(
                                      (item) =>
                                        !pendingAttachments.some(
                                          (prev) => prev.id === item.id,
                                        ),
                                    );
                                    setPendingAttachments(next);
                                    for (const item of added) {
                                      void uploadTempImageFile(item.file)
                                        .then((uploaded) =>
                                          setPendingAttachments((cur) =>
                                            cur.map((candidate) =>
                                              candidate.id === item.id
                                                ? {
                                                    ...candidate,
                                                    assetId: uploaded.assetId,
                                                    status: "uploaded",
                                                  }
                                                : candidate,
                                            ),
                                          ),
                                        )
                                        .catch(() => {
                                          setPendingAttachments((cur) =>
                                            removeAttachment(cur, item.id),
                                          );
                                          toast.error(
                                            "Gagal mengunggah gambar.",
                                          );
                                        });
                                    }
                                    if (rejected.length) {
                                      toast.error(
                                        `Maksimal ${MAX_COMPOSER_IMAGES} gambar per pesan.`,
                                      );
                                    }
                                  }}
                                />
                              ) : null}
                              <Button
                                type="submit"
                                size="icon"
                                disabled={
                                  isSubmittingTurn ||
                                  !message.trim() ||
                                  hasUploadingAttachments(pendingAttachments)
                                }
                                className="size-8.5 rounded-lg bg-[#1c1c1c] text-white shadow-2xs transition hover:bg-black active:scale-95 disabled:cursor-not-allowed disabled:bg-black/10 disabled:text-black/30 dark:bg-surface-warm-white dark:text-[#141413] dark:hover:bg-white dark:disabled:bg-white/10 dark:disabled:text-white/30 cursor-pointer flex items-center justify-center shrink-0"
                                aria-label="Kirim pesan"
                              >
                                {isSubmittingTurn ? (
                                  <Loader2 className="size-4 animate-spin shrink-0" />
                                ) : (
                                  <ArrowUp className="size-4 shrink-0" />
                                )}
                              </Button>
                            </div>
                          </div>
                        </div>
                      </motion.form>
                    )}
                  </AnimatePresence>
                </div>
              ) : composerState === "build_recommendation" ||
                composerState === "build_retry" ? (
                <motion.div
                  key={`composer-${composerState}`}
                  {...COMPOSER_TRANSITION}
                  className="p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
                >
                  <WorkspaceCardView
                    buildComplete={buildComplete}
                    canBuild={canStartBuildNow}
                    card={workspaceCard}
                    onBuild={() => void handleStartBuild()}
                    onDiscuss={holdBuildRecommendation}
                  />
                </motion.div>
              ) : composerState === "post_build_review" ||
                composerState === "build_failed_with_last_good" ? (
                <motion.div
                  key="composer-post-build"
                  {...COMPOSER_TRANSITION}
                  className="p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
                >
                  <CompletedBuildNotice
                    onDiscuss={() => {
                      // Park only an unconsumed rancangan so free discuss opens
                      if (
                        buildRecommendationSignature &&
                        !consumedBuildRecommendationSignatures.has(
                          buildRecommendationSignature,
                        )
                      ) {
                        window.localStorage.setItem(
                          buildRecommendationStorageKey,
                          buildRecommendationSignature,
                        );
                        setHeldBuildRecommendationSignature(
                          buildRecommendationSignature,
                        );
                      }
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
                </motion.div>
              ) : (
                <motion.div key="composer-free" {...COMPOSER_TRANSITION}>
                  {composerState === "held_build_recommendation" ? (
                    <div className="p-3 pb-0">
                      <HeldBuildRecommendationNotice
                        buildComplete={buildComplete}
                        canBuild={canStartBuildNow}
                        onBuild={() => void handleStartBuild()}
                        onDismiss={dismissBuildRecommendation}
                        onOpen={openBuildRecommendation}
                      />
                    </div>
                  ) : null}
                  <form
                    onSubmit={handleMessageSubmit}
                    className="p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
                  >
                    <label htmlFor="workspace-message" className="sr-only">
                      Pesan untuk AI
                    </label>
                    <div className="rounded-2xl border border-black/10 bg-white p-2.5 shadow-sm transition-colors focus-within:border-black/30 dark:border-white/15 dark:bg-[#282824] dark:shadow-[0_4px_20px_rgba(0,0,0,0.35)] dark:focus-within:border-white/30">
                      {pendingAttachments.length > 0 ? (
                        <ComposerAttachments
                          attachments={pendingAttachments}
                          onRemove={(id) =>
                            setPendingAttachments((cur) =>
                              removeAttachment(cur, id),
                            )
                          }
                        />
                      ) : null}
                      <textarea
                        id="workspace-message"
                        rows={2}
                        value={message}
                        onChange={(event) => {
                          setMessage(event.target.value);
                          const target = event.currentTarget;
                          target.style.height = "auto";
                          target.style.height = `${Math.min(target.scrollHeight, 6 * 24 + 24)}px`;
                        }}
                        onKeyDown={handleMessageKeyDown}
                        inputMode="text"
                        enterKeyHint="send"
                        placeholder={
                          sessionExpired
                            ? "Sesi habis, login ulang..."
                            : mode === "build"
                              ? "Tulis perubahan yang kamu mau..."
                              : "Tulis pesan atau kebutuhanmu di sini..."
                        }
                        className="w-full resize-none bg-transparent px-1 py-1 text-sm leading-6 text-foreground outline-none [scrollbar-width:none] placeholder:text-muted-foreground disabled:opacity-60 [&::-webkit-scrollbar]:hidden"
                        disabled={
                          sessionExpired || authStatus !== "authenticated"
                        }
                      />
                      <div className="mt-2 flex items-center justify-between gap-3 border-t border-black/10 pt-2 dark:border-white/10">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void handlePrimaryComposerAction()}
                          disabled={isBuilding || readOnly}
                          className="h-8 rounded-lg border-black/15 bg-white px-3 text-xs font-medium text-foreground hover:bg-black/5 hover:text-foreground active:scale-95 dark:border-white/15 dark:bg-white/5 dark:hover:bg-white/10 cursor-pointer"
                        >
                          {buildComplete ? "Perbarui Website" : "Buat Website"}
                        </Button>
                        <div className="flex items-center gap-1.5">
                          {composerUploadsEnabled ? (
                            <ComposerAttachButton
                              attachments={pendingAttachments}
                              onAdd={(next, rejected) => {
                                const added = next.filter(
                                  (item) =>
                                    !pendingAttachments.some(
                                      (prev) => prev.id === item.id,
                                    ),
                                );
                                setPendingAttachments(next);
                                for (const item of added) {
                                  void uploadTempImageFile(item.file)
                                    .then((uploaded) =>
                                      setPendingAttachments((cur) =>
                                        cur.map((candidate) =>
                                          candidate.id === item.id
                                            ? {
                                                ...candidate,
                                                assetId: uploaded.assetId,
                                                status: "uploaded",
                                              }
                                            : candidate,
                                        ),
                                      ),
                                    )
                                    .catch(() => {
                                      setPendingAttachments((cur) =>
                                        removeAttachment(cur, item.id),
                                      );
                                      toast.error("Gagal mengunggah gambar.");
                                    });
                                }
                                if (rejected.length) {
                                  toast.error(
                                    `Maksimal ${MAX_COMPOSER_IMAGES} gambar per pesan.`,
                                  );
                                }
                              }}
                            />
                          ) : null}
                          <Button
                            type="submit"
                            size="icon"
                            disabled={
                              isSubmittingTurn ||
                              !message.trim() ||
                              hasUploadingAttachments(pendingAttachments)
                            }
                            className="size-8.5 rounded-lg bg-[#1c1c1c] text-white shadow-2xs transition hover:bg-black active:scale-95 disabled:cursor-not-allowed disabled:bg-black/10 disabled:text-black/30 dark:bg-surface-warm-white dark:text-[#141413] dark:hover:bg-white dark:disabled:bg-white/10 dark:disabled:text-white/30 cursor-pointer flex items-center justify-center shrink-0"
                            aria-label="Kirim pesan"
                          >
                            {isSubmittingTurn ? (
                              <Loader2 className="size-4 animate-spin shrink-0" />
                            ) : (
                              <ArrowUp className="size-4 shrink-0" />
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>
      </div>
    </aside>
  );

  const previewPanelContent = (
    <section className={previewPanelClass}>
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
                    Boolean(editIntentHistory.past.length) ||
                    canUndoDirectEdit(editHistory),
                  canRedo:
                    Boolean(editIntentHistory.future.length) ||
                    canRedoDirectEdit(editHistory),
                  onUndo: handleUndo,
                  onRedo: handleRedo,
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
          onRefreshPreview={() => setPreviewReloadKey((current) => current + 1)}
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
                  detail={previewIssue.detail}
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
                            onCancel: () => {
                              setPendingAnnotationTarget(null);
                              setPendingAnnotationComment("");
                            },
                            onChange: setPendingAnnotationComment,
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
              isLoading={
                isLoadingSource ||
                sourceQuery.isPending ||
                sourceQuery.isFetching
              }
              isBuilding={isBuilding}
              onRetry={() => setSourceReloadKey((current) => current + 1)}
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
      <nav
        aria-label="Pilih tampilan ruang kerja"
        className="sticky bottom-0 z-20 flex flex-col gap-1 border-t border-black/10 bg-[#eceae4] px-3 py-1.5 pb-[calc(env(safe-area-inset-bottom)+0.375rem)] dark:border-surface-warm-white/10 dark:bg-[#1b1b19] lg:hidden"
      >
        {projectTitle ? (
          <div className="mx-auto flex max-w-[280px] items-center justify-center gap-1.5">
            <span
              className="truncate text-xs font-medium text-[#5f5f5d] dark:text-surface-warm-white/50"
              title={projectTitle}
            >
              {projectTitle}
            </span>
            {!readOnly ? (
              <button
                type="button"
                onClick={() => {
                  setDraftTitle(projectTitle);
                  setMobileRenameOpen(true);
                }}
                className="flex size-5 items-center justify-center rounded-full text-[#5f5f5d] transition-colors hover:bg-black/5 hover:text-[#1c1c1c] dark:text-surface-warm-white/60 dark:hover:bg-white/10 dark:hover:text-surface-warm-white"
                aria-label="Ubah nama website"
              >
                <Pencil className="size-3" />
              </button>
            ) : null}
          </div>
        ) : null}
        <div className="flex w-full items-center justify-between gap-1.5">
          <a
            href="/"
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-black/10 text-[#5f5f5d] transition-colors hover:bg-black/5 hover:text-[#1c1c1c] dark:border-surface-warm-white/10 dark:text-surface-warm-white/70 dark:hover:bg-surface-warm-white/8"
            title="Kembali ke Dashboard"
            aria-label="Kembali ke Dashboard"
          >
            <ArrowLeft className="size-4" />
          </a>
          {hasPreview ? (
            <div className="flex flex-1 items-center gap-1.5 rounded-xl border border-black/10 bg-black/5 p-1 dark:border-surface-warm-white/10 dark:bg-surface-warm-white/5">
              <button
                type="button"
                aria-pressed={mobileSurface === "chat"}
                onClick={openChatPanel}
                className="inline-flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 truncate rounded-lg text-xs font-semibold transition-colors aria-pressed:bg-white aria-pressed:text-[#1c1c1c] aria-pressed:shadow-xs text-[#5f5f5d] dark:aria-pressed:bg-surface-warm-white dark:aria-pressed:text-foreground-primary dark:text-surface-warm-white/70 cursor-pointer"
              >
                <MessageCircle className="size-3.5 shrink-0" />
                <span className="truncate">Diskusi</span>
              </button>
              <button
                type="button"
                aria-pressed={mobileSurface === "preview"}
                onClick={openPreviewPanel}
                className="inline-flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 truncate rounded-lg text-xs font-semibold transition-colors aria-pressed:bg-white aria-pressed:text-[#1c1c1c] aria-pressed:shadow-xs text-[#5f5f5d] dark:aria-pressed:bg-surface-warm-white dark:aria-pressed:text-foreground-primary dark:text-surface-warm-white/70 cursor-pointer"
              >
                <Globe2 className="size-3.5 shrink-0" />
                <span className="truncate">Tampilan</span>
              </button>
            </div>
          ) : (
            <div className="flex min-w-0 flex-1 items-center justify-center px-2">
              <span className="truncate text-xs font-bold text-foreground dark:text-surface-warm-white">
                {projectTitle}
              </span>
            </div>
          )}
          <button
            type="button"
            aria-label="Buka menu proyek"
            onClick={() => setMobileMenuOpen(true)}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-black/10 text-[#5f5f5d] transition-colors hover:bg-black/5 hover:text-[#1c1c1c] dark:border-surface-warm-white/10 dark:text-surface-warm-white/70 dark:hover:bg-surface-warm-white/8 cursor-pointer"
          >
            <Menu className="size-4" />
          </button>
        </div>
      </nav>
      {/* Mobile/tablet: single full-screen surface toggled by bottom nav */}
      {!isDesktop ? (
        <div className="min-h-0 flex-1 overflow-hidden lg:hidden">
          {mobileSurface === "chat" && chatPanelContent}
          {mobileSurface === "preview" && showPreviewPanel
            ? previewPanelContent
            : null}
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
            {chatPanelContent}
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
                {previewPanelContent}
              </ResizablePanel>
            </>
          ) : null}
        </ResizablePanelGroup>
      ) : null}
      {!readOnly && annotations.length ? (
        <VisualFeedbackWidget
          annotations={annotations}
          instruction={annotationInstruction}
          isSending={isEditingPreview}
          onClose={() => {
            // Dismissing the review tray drops draft comments (work is done
            setAnnotations([]);
            setAnnotationInstruction("");
            pendingVisualRevisionRef.current = false;
            window.localStorage.removeItem(visualAnnotationStorageKey);
            setDirectEditMode(false);
            setPendingAnnotationTarget(null);
            setPendingAnnotationComment("");
          }}
          onInstructionChange={setAnnotationInstruction}
          onRemove={removeAnnotation}
          onSend={() => void sendVisualAnnotations()}
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
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setMobileRenameOpen(false)}
              >
                Batal
              </Button>
              <Button
                type="button"
                onClick={() => {
                  void saveProjectTitle();
                  setMobileRenameOpen(false);
                }}
              >
                Simpan
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {/* Mobile Actions Sheet */}
      <WorkspaceMobileMenuSheet
        open={mobileMenuOpen}
        onOpenChange={setMobileMenuOpen}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        viewport={viewport}
        setViewport={setViewport}
        annotationAvailable={!readOnly && shouldRenderGeneratedPreview}
        directEditActive={effectiveDirectEditMode}
        directEditFlagEnabled={directEditFlagEnabled}
        onToggleDirectEdit={toggleDirectEdit}
        runtime={runtimeControl}
        projectId={projectId}
        hasPreview={hasPreview}
        onPickTab={(tab) => {
          setActiveTab(tab);
          setMobileSurface("preview");
          openPreviewPanel();
        }}
      />
    </div>
  );
}

function createRuntimeControl({
  buildStatus,
  isPublishing,
  onPublish,
  onReload,
  publishedPath,
  runtimeState,
  sourceStatus,
}: {
  buildStatus: string;
  isPublishing: boolean;
  onPublish: () => void;
  onReload?: () => void;
  publishedPath: string | null;
  runtimeState: RuntimeWorkspaceState | null;
  sourceStatus: string;
}): WorkspaceRuntimeControl {
  const runtimeBuildStatus =
    runtimeState?.activePreviewDeployment?.build?.status ||
    runtimeState?.deployment?.build?.status ||
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
  const release = getWorkspaceReleaseState({
    ownerBlocked: runtimeState?.publishedDeployment?.publicState === "not_live",
    previewBuildId:
      runtimeState?.activePreviewDeployment?.buildId ??
      runtimeState?.activePreviewDeployment?.build?.id ??
      runtimeState?.deployment?.buildId ??
      runtimeState?.deployment?.build?.id,
    previewBuildStatus: runtimeBuildStatus,
    publishedBuildId:
      runtimeState?.publishedDeployment?.buildId ??
      runtimeState?.publishedDeployment?.build?.id,
    publishedPath: runtimePublishedPath,
    publishedStatus: runtimeState?.publishedDeployment?.status,
  });

  return {
    ...release,
    activeSnapshotId: runtimeState?.activePreviewDeployment?.snapshotId ?? null,
    isPublishing,
    onPublish,
    onReload,
    publishedPath: runtimePublishedPath,
  };
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

      return false;
    });
  });
}

type ChatError = Error & {
  code?: string;
  retryAfter?: number;
  status?: number;
};

async function rateLimitAwareFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
) {
  const response = await fetch(input, init);

  if (response.status === 429) {
    const body = (await response.json().catch(() => null)) as {
      message?: string;
      retryAfter?: number;
    } | null;
    const retryAfter =
      (body?.retryAfter ?? Number(response.headers.get("Retry-After"))) || 60;
    const error = new Error(
      body?.message ||
        `Terlalu banyak percobaan. Coba lagi dalam ${retryAfter} detik.`,
    ) as ChatError;

    error.status = 429;
    error.retryAfter = retryAfter;
    throw error;
  }

  if (response.status === 400) {
    const clone = response.clone();
    const body = (await clone.json().catch(() => null)) as {
      code?: string;
      message?: string;
    } | null;
    if (body?.code === "project_request_blocked") {
      const error = new Error(
        body.message || "Permintaan belum bisa diproses.",
      ) as ChatError;
      error.status = 400;
      error.code = "project_request_blocked";
      throw error;
    }
  }

  if (response.status === 409) {
    const clone = response.clone();
    const body = (await clone.json().catch(() => null)) as {
      code?: string;
      message?: string;
    } | null;
    if (body?.code === "project_chat_in_progress") {
      const error = new Error(
        body.message || "Obrolan masih berjalan untuk proyek ini.",
      ) as ChatError;
      error.status = 409;
      error.code = "project_chat_in_progress";
      throw error;
    }
  }

  if (response.status === 413) {
    const clone = response.clone();
    const body = (await clone.json().catch(() => null)) as {
      code?: string;
      message?: string;
    } | null;
    if (body?.code === "chat_turn_too_large") {
      const error = new Error(
        body.message || "Pesan terlalu panjang. Ringkas dulu sebelum dikirim.",
      ) as ChatError;
      error.status = 413;
      error.code = "chat_turn_too_large";
      throw error;
    }
  }

  return response;
}

function captureRateLimitError(
  error: unknown,
  setRateLimitError: (value: { message: string; retryAfter: number }) => void,
) {
  const candidate = error as ChatError;

  if (candidate?.status !== 429) {
    return false;
  }

  setRateLimitError({
    message: candidate.message,
    retryAfter: candidate.retryAfter ?? 60,
  });
  return true;
}

function readConsumedBuildRecommendationSignatures(
  projectId: string,
): Set<string> {
  if (typeof window === "undefined") {
    return new Set();
  }
  const key = `umkmcepat:build-recommendation-consumed:${projectId}`;
  const raw = window.localStorage.getItem(key);
  if (!raw) {
    return new Set();
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return new Set();
    }
    return new Set(
      parsed.filter((value): value is string => typeof value === "string"),
    );
  } catch {
    return new Set();
  }
}

type HandoffProof = { handoffId: string; reviewHash: string };

function readHandoffProof(storageKey: string): HandoffProof | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<HandoffProof>;
    if (
      typeof parsed.handoffId === "string" &&
      typeof parsed.reviewHash === "string"
    ) {
      return { handoffId: parsed.handoffId, reviewHash: parsed.reviewHash };
    }
  } catch {
    // Ignore corrupt localStorage; the card proof still covers first builds.
  }
  return null;
}

function writeHandoffProof(storageKey: string, proof: HandoffProof): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(proof));
  } catch {
    // Non-fatal: a retry without persisted proof falls back to the server's
  }
}

// Proof-carrying gate: every build_recommendation must carry a valid handoff
export function canStartBuild(
  card: WorkspaceCard | null | undefined,
  _brief?: ProjectBrief | null | undefined,
): boolean {
  if (!card || card.type !== "build_recommendation") {
    return false;
  }
  const c = card as { handoffId?: string; reviewHash?: string };
  return Boolean(
    c.handoffId && c.reviewHash && /^[0-9a-f]{64}$/.test(c.reviewHash),
  );
}

// Legacy single-arg bridge for callers that pass only a brief.
export function canStartBuildFromBrief(
  brief: ProjectBrief | null | undefined,
): boolean {
  return Boolean(brief);
}

// Fetch the server-side turn state. Returns `null` on a 404 (no turn row for
async function fetchDiscussTurn(projectId: string): Promise<TurnState | null> {
  try {
    const res = await fetch(`/api/projects/${projectId}/chat/turn`);
    if (!res.ok) {
      return null;
    }
    return (await res.json()) as TurnState;
  } catch {
    return null;
  }
}
