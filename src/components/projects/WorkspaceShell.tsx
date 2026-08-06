"use client";

import { useChat } from "@ai-sdk/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DefaultChatTransport, type FileUIPart, type UIMessage } from "ai";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
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

import { EnergyDisplay } from "@/components/common/EnergyDisplay";
import {
  ComposerAttachButton,
  ComposerAttachments,
} from "@/components/projects/ComposerAttachments";
import { settleDiscussAfterChatReady } from "@/components/projects/discuss-chat-settle";
import {
  useBuildAttemptStream,
  type BuildStreamEvent,
} from "@/components/projects/useBuildAttemptStream";
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
  WorkspaceTopBar,
  type BuildProgressStep,
  type BuildTab,
  type WorkspaceAnswerPayload,
  type WorkspaceRuntimeControl,
} from "@/components/projects/WorkspacePrimitives";
import { Button } from "@/components/ui/button";
import { Link } from "@/components/ui/link";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { track } from "@/lib/analytics";
import { signOut, useSession } from "@/lib/auth-client";
import { clientOnly } from "@/lib/client-only";
import { type ProjectBrief, type WorkspaceCard } from "@/lib/projects/brief";
import { buildHandoffLine } from "@/lib/projects/build-handoff";
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
  toUploadPlan,
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
import { type GeneratedProjectFile } from "@/lib/projects/generated-types";
import { resolveGenerateMode } from "@/lib/projects/resolve-generate-mode";
import {
  createImageReplaceEditInstruction,
  createVisualAnnotationEditInstruction,
  createVisualAnnotationId,
  createVisualAnnotationSummary,
  type VisualAnnotationDraft,
} from "@/lib/projects/visual-annotations";
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
import { uploadTempImageFile } from "@/lib/uploads/temp-image-client";
import { useFeatureFlag } from "@/lib/use-feature-flag";
import { useIsDesktopViewport } from "@/lib/use-is-desktop-viewport";
import { cn } from "@/lib/utils";

const MonacoEditor = clientOnly(() => import("@/lib/monaco-editor"));

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

// React.StrictMode intentionally mounts -> unmounts -> remounts each
// component once in dev, which resets useRef-backed guards and would
// otherwise fire the auto-send prompt twice for the same project (the first
// request stays in-flight while a second one starts, tripping the server's
// discuss lock and leaving the local chat state empty). Module-scope state
// survives the remount because it isn't tied to a component instance.
const autoSentProjectIds = new Set<string>();

export const chatBubbleClass = (
  role: "user" | "assistant" | "system",
): string =>
  `max-w-[88%] overflow-hidden break-words rounded-[22px] px-spacing-4 py-spacing-3 sm:px-spacing-6 sm:py-spacing-5 ${
    role === "user"
      ? "border border-surface-warm-white/12 bg-[#30302c] text-surface-warm-white/88"
      : "border border-surface-warm-white/10 bg-[#242421] text-surface-warm-white/80"
  }`;

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
  // Rename to `autoRetryAttempts` when the composer auto-retry task consumes it.
  autoRetryAttempts: _autoRetryAttempts = 2,
}: WorkspaceShellProps) {
  const [mode, setMode] = useState<"build" | "discuss">("discuss");
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
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
  // Permanent record of build_recommendation signatures already used to start
  // a build. Once a signature is here, the matching card never renders again —
  // regardless of build outcome. Survives refresh via localStorage.
  const [
    consumedBuildRecommendationSignatures,
    setConsumedBuildRecommendationSignatures,
  ] = useState<Set<string>>(() =>
    readConsumedBuildRecommendationSignatures(projectId),
  );
  const [postBuildChatOpen, setPostBuildChatOpen] = useState(false);
  const [olderMessages, setOlderMessages] = useState<UIMessage[]>([]);
  const [chatCursor, setChatCursor] = useState<number | null>(
    initialChatCursor,
  );
  const [hasMoreChat, setHasMoreChat] = useState(initialChatHasMore);
  const [isLoadingOlderChat, setIsLoadingOlderChat] = useState(false);
  const prompt = initialPrompt.trim();
  const buildRecommendationStorageKey = `umkmcepat:build-recommendation-hold:${projectId}`;
  const buildRecommendationConsumedKey = `umkmcepat:build-recommendation-consumed:${projectId}`;
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
  const [isRetrying, setIsRetrying] = useState(false);
  const [workspaceCardError, setWorkspaceCardError] = useState(false);
  const [isPreparingNextQuestion, setIsPreparingNextQuestion] = useState(false);
  const isPreparingNextQuestionRef = useRef(false);
  const workspaceCardRef = useRef(initialWorkspaceCard);
  const preparingPollRef = useRef<(() => void) | null>(null);
  const loadWorkspaceStateRequestIdRef = useRef(0);
  // Synchronous lock so the same `submitChatText` call within one tick can't
  // fire `sendMessage` twice when `isProcessing` state hasn't propagated yet.
  const submitInFlightRef = useRef(false);

  const isDesktop = useIsDesktopViewport();
  // Resume state for the last unanswered user message detected on mount.
  // Null until a GET /chat/turn lands a failed/expired/cancelled turn.
  const [resumeError, setResumeError] = useState<{
    message: string;
    retryText: string;
  } | null>(null);
  const [isEditingPreview, setIsEditingPreview] = useState(false);
  const visualEditInFlightRef = useRef(false);
  // Survives refresh: if user sent visual comments, clear them when server job ends OK.
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
  const directEditFlagEnabled = useFeatureFlag("feature.direct_edit_enabled");
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
      // Never return a closed-over React state snapshot (stale after builds).
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
    // wipe progress or auto-start a second generate.
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
                    job?.message ||
                    result.message ||
                    "Build website sedang berjalan di server.",
                  label:
                    job?.kind === "edit"
                      ? "Merevisi website"
                      : "Build berjalan",
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
      // comments when a pending revision settles on a ready workspace.
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
        setRuntimeError("Build belum bisa dihentikan.");
        return;
      }

      await loadRuntimeState();
    } catch {
      setRuntimeError("Build belum bisa dihentikan.");
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
    // — otherwise a replay of this same channel would be deduped into nothing.
    buildStreamDeduperRef.current = createBuildStreamDeduper();
    setBuildStartedAt(Date.now());
    setActiveTab("preview");
    setMobileSurface("preview");

    // Permanently consume the current build_recommendation signature (if any)
    // so the same rancangan can never trigger another build. Retry must use
    // the "Build ulang" CTA, not the original card. Outcome-agnostic.
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
      // force retry_build (empty-source dead-end). Server re-resolves anyway.
      const hasPersistedSource =
        runtimeQuery.data?.hasPersistedSource === true ||
        sourceFiles.length > 0;
      const generateMode = resolveGenerateMode({
        requestedMode: hasPersistedSource ? "retry_build" : "first_generate",
        hasPersistedSource,
      });
      const activeCard = workspaceCardRef.current;
      const handoffFields =
        activeCard?.type === "build_recommendation" &&
        activeCard.handoffId &&
        activeCard.reviewHash
          ? {
              handoffId: activeCard.handoffId,
              reviewHash: activeCard.reviewHash,
              idempotencyKey: `build-${projectId}-${activeCard.handoffId}`,
            }
          : undefined;
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
        let detail = "Server belum bisa memulai proses build. Coba ulangi.";
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
            label: "Build belum mulai",
            status: "error",
          }),
        );
        return;
      }

      // Read the SSE channel tail from the POST response and route
      // events through the same handler the late-joiner stream uses.
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
      // stick on local "building" with no CTA.
      setBuildStatus("failed");
      void loadRuntimeState();
      setBuildProgress((current) =>
        appendBuildProgressStep(current, {
          detail:
            (error as Error).name === "AbortError"
              ? "Build dihentikan. Kamu bisa jalankan build lagi kapan saja."
              : "Koneksi build terputus. Coba jalankan build lagi.",
          label:
            (error as Error).name === "AbortError"
              ? "Build dihentikan"
              : "Build terputus",
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

  // Append a one-liner to the chat so the user sees what fields the AI is
  // building from, then start the build. Gated on canStartBuild to mirror the
  // server-side readiness check.
  const handleStartBuild = useCallback(async () => {
    if (readOnly || !canStartBuild(latestBrief) || !latestBrief) {
      return;
    }

    const handoffBrief = latestBrief;
    setMessages((current) => [
      ...current,
      {
        id: `handoff-${Date.now()}`,
        metadata: undefined,
        parts: [{ text: buildHandoffLine(handoffBrief), type: "text" }],
        role: "assistant",
      },
    ]);
    shouldStickToBottomRef.current = true;

    await startBuild();
  }, [latestBrief, readOnly, startBuild]);

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
    // mount -> cleanup -> remount cycle. Marking `autoSentProjectIds`
    // synchronously (the previous approach) backfired: the *phantom* first
    // mount marked the project as sent and got torn down before its request
    // landed, so the *surviving* second mount saw "already sent" and skipped
    // sending entirely — no card, no persisted prompt, nothing.
    // Deferring the actual send to a macrotask fixes this: the phantom
    // mount's cleanup cancels its pending timer before it fires, so only the
    // surviving mount's timer ever runs `sendMessage`.
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
      // If yes, don't re-send the initial prompt — reload persisted messages
      // instead. This prevents the "welcome" flash after a hard reload.
      try {
        const turnRes = await fetch(`/api/projects/${projectId}/chat/turn`, {
          cache: "no-store",
        });
        if (turnRes.ok) {
          autoSentProjectIds.add(projectId);
          // Cannot call reloadLatestChat here — it's defined below
          // (const function TDZ). Inline a minimal fetch instead.
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
      // persisted as ProjectAsset rows. We could fetch them here and pass
      // mediaPaths in the body, but that requires a sync query at mount
      // time and races with the project loader. The AI tool can resolve
      // assets from the project state when it needs them. Add this only
      // if first-turn asset inclusion becomes a UX requirement.
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
  const isProcessing = isResponding || isBuilding || isEditingPreview;
  const allMessages = useMemo(
    () => dedupeUiMessages([...olderMessages, ...messages]),
    [messages, olderMessages],
  );
  const allMessagesRef = useRef(allMessages);
  useEffect(() => {
    allMessagesRef.current = allMessages;
  }, [allMessages]);

  // Drive the workspace card from the streamed assistant tool output as it
  // arrives, not only on the `status` → `ready` transition. This makes the
  // card appear in the same render cycle as the AI text instead of after an
  // extra fetch, and removes the "card flashes old/empty then snaps to new"
  // gap between stream-end and the post-status effect. Guarded by
  // isFreshWorkspaceCard so we never redundantly re-set the same card.
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
  const canStartBuildNow = canStartBuild(latestBrief);
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
  const showChatPanel = !chatCollapsed;
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
        setBuildProgress((current) => completeBuildStreamProgress(current));
        patchProjectInList({ buildStatus: "ready" });
        void loadRuntimeState();
        setSourceReloadKey((current) => current + 1);
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
        void loadRuntimeState();
        setSourceReloadKey((current) => current + 1);
        setBuildProgress(result.update);
      }
    },
    [loadRuntimeState, queryClient],
  );

  useBuildAttemptStream({
    attemptId:
      runtimeState?.activeJob?.kind === "generate" &&
      runtimeState.activeJob.attemptId &&
      ["generating", "building", "finalizing"].includes(
        runtimeState.activeJob.phase || "",
      )
        ? runtimeState.activeJob.attemptId
        : null,
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
    // rendered state. A full `setMessages(server)` replace here would re-key
    // the thread + reset scroll (the "chat reorders / flickers every turn"
    // symptom). Skip the no-op replace when the server copy is
    // render-equivalent to what's already on screen. Still update pagination
    // cursors — those are cheap and the server is the authority for them.
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
      // Only suppress the next scroll event for hard jumps (e.g. user send).
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
    setQuestionComposerMode("options");
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
  }, [questionComposerMode, workspaceCard, scrollChatToBottom]);

  useEffect(() => {
    workspaceCardRef.current = workspaceCard;
  }, [workspaceCard]);

  useEffect(() => {
    if (!buildComplete || !heldBuildRecommendationSignature) {
      return;
    }
    const signature = getBuildRecommendationHoldSignature(workspaceCard);
    const consumed =
      Boolean(signature) &&
      consumedBuildRecommendationSignatures.has(signature);
    if (
      workspaceCard.type !== "build_recommendation" ||
      consumed ||
      !signature
    ) {
      window.localStorage.removeItem(buildRecommendationStorageKey);
      setHeldBuildRecommendationSignature(null);
    }
  }, [
    buildComplete,
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
          // card between the last poll and this timeout (turn TTL > UI budget).
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
    // so subsequent stepper / chat submissions aren't blocked forever.
    if (status === "ready" || status === "error") {
      submitInFlightRef.current = false;
    }
  }, [status]);

  // Mount-only reset: a reload always starts with a clean submit lock so a
  // mid-turn disconnect that never returned to `ready`/`error` can't wedge the
  // composer. The status-driven reset above handles steady-state; this covers
  // the cold-start case.
  useEffect(() => {
    submitInFlightRef.current = false;
  }, []);

  // Auto-resume on cold start: if the last local message is an unanswered user
  // message, query the server-side turn state and reconcile. Running → poll
  // until terminal then reload chat. Succeeded → reload chat (persisted reply
  // is in the DB). Failed/expired/cancelled → surface the error + retry. None
  // (404) → composer stays ready. Never calls `sendMessage` for a running
  // turn — that would create a second turn. ponytail: if useChat v4 grows a
  // clean transport-resume API, swap the poll loop for it; the helper stays.
  //
  // Skip while THIS client is actively driving a turn (submitted/streaming).
  // The optimistic user message that `sendMessage` pushes re-triggers this
  // effect (deps include `messages`), and the poll races the in-flight POST:
  // if the GET /chat/turn lands before the POST claims the new running turn,
  // it sees the PREVIOUS completed turn (`succeeded` → reload) and
  // `reloadLatestChat` replaces `messages` with a DB copy that doesn't yet
  // contain the just-sent user message — wiping the user's chat bubble until
  // the AI finishes replying. Only the cold-start path (`status === ready`
  // with a trailing user message) is the resume's job.
  useEffect(() => {
    if (status === "submitted" || status === "streaming") {
      return;
    }

    const last = messages.at(-1);
    if (!last || last.role !== "user") {
      return;
    }

    let canceled = false;
    const poll = async () => {
      const result = await resolveDiscussResumeFromServer(projectId);
      if (canceled) {
        return;
      }
      switch (result.kind) {
        case "reload":
          await reloadLatestChat();
          setResumeError(null);
          return;
        case "poll":
          await new Promise((resolve) =>
            window.setTimeout(resolve, RESUME_POLL_INTERVAL_MS),
          );
          if (!canceled) {
            void poll();
          }
          return;
        case "retry":
          setResumeError({
            message: result.errorMessage,
            retryText: result.retryText,
          });
          return;
        case "idle":
          setResumeError(null);
          return;
      }
    };
    void poll();
    return () => {
      canceled = true;
    };
  }, [messages, projectId, reloadLatestChat, status]);

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
        setWorkspaceCardError(false);
        setIsPreparingNextQuestion(false);
        void loadWorkspaceState({ preserveCard: true });
        return;
      }
    }

    if (settle.clearPreparing) {
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
              "Komentar visual belum berhasil dibuild. Komentar tetap aman.",
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
        detail: "AI menerapkan perubahan struktur ke source preview terakhir.",
        label: "Merevisi struktur dari ubah langsung",
        status: "active",
      }),
    );

    try {
      const response = await fetch(`/api/projects/${projectId}/edit`, {
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
              result?.message || "Perubahan belum berhasil dibuild. Coba lagi.",
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
    const mediaPath = `/media/${asset.id}`;
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
      options: { workspaceAnswers?: WorkspaceAnswerPayload[] } = {},
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
        (!trimmed && !hasAnswers && pendingAttachments.length === 0) ||
        isProcessing ||
        rateLimitError ||
        authStatus !== "authenticated" ||
        sessionExpired ||
        submitInFlightRef.current
      ) {
        return;
      }

      // Upload attached images to R2 (commit-on-send; nothing left the browser
      // until now). On failure, keep the attachments so the user can retry.
      const fileParts: FileUIPart[] = [];
      const mediaPaths: string[] = [];
      const uploadErrors: { name: string; message: string }[] = [];

      if (pendingAttachments.length) {
        for (const item of toUploadPlan(pendingAttachments)) {
          try {
            const form = new FormData();
            form.append("purpose", "business-image");
            if (item.assetId) {
              form.append("assetId", item.assetId);
            } else {
              form.append("file", item.file);
            }
            const res = await fetch(
              `/api/projects/${projectId}/assets/upload`,
              {
                body: form,
                method: "POST",
              },
            );
            if (!res.ok) {
              throw new Error(
                (await res.json().catch(() => null))?.message ||
                  `Gagal mengunggah ${item.file.name}`,
              );
            }
            const contentType = res.headers.get("content-type") ?? "";
            if (!contentType.toLowerCase().includes("application/json")) {
              throw new Error(
                `Respons tidak valid saat mengunggah ${item.file.name}.`,
              );
            }
            const asset = (await res.json()) as {
              id: string;
              publicUrl: string | null;
            };
            if (!asset.publicUrl) {
              throw new Error(
                `Gambar belum tersedia (${item.file.name}). Aktifkan R2.`,
              );
            }
            fileParts.push(
              createUploadedImageFilePart({
                filename: item.file.name,
                mediaType: item.file.type,
                url: `/media/${asset.id}`,
              }),
            );
            mediaPaths.push(`/media/${asset.id}`);
          } catch (error) {
            uploadErrors.push({
              name: item.file.name,
              message:
                error instanceof Error
                  ? error.message
                  : "Error tidak diketahui",
            });
          }
        }

        if (uploadErrors.length > 0) {
          const lines = uploadErrors.map((e) => `• ${e.name}: ${e.message}`);
          toast.error(
            `Gagal mengunggah ${uploadErrors.length} file:\n${lines.join("\n")}`,
            { duration: 8000 },
          );
        }

        if (fileParts.length === 0 && uploadErrors.length > 0) {
          toast.error(
            "Gagal mengunggah semua file. Periksa ukuran/format dan coba lagi.",
          );
          setPendingAttachments([]);
          return;
        }
      }

      // Lock the channel for the duration of the request so a synchronous
      // double-invoke (double-tap, React 19 batching edge) cannot post twice.
      submitInFlightRef.current = true;

      // User is sending a new turn: re-pin and jump to latest.
      shouldStickToBottomRef.current = true;
      setRateLimitError(null);
      setMessage("");
      setBuildProgress([]);
      requestAnimationFrame(() =>
        scrollChatToBottom({ force: true, behavior: "smooth" }),
      );

      // Post-build "Chat dengan AI" is discuss-only. Rebuilds use the
      // build_recommendation card ("Mulai build"), not an auto /edit build.
      // Attached images ride as `files` (the SDK carries image content to the
      // model); mediaPaths tells the agent which /media/<id> to bake in.
      sendMessage(
        {
          files: fileParts.length ? fileParts : undefined,
          text: trimmed,
        },
        {
          body: {
            mediaPaths: mediaPaths.length ? mediaPaths : undefined,
            mode: composerState === "post_build_chat" ? "discuss" : mode,
            workspaceAnswers: options.workspaceAnswers,
          },
        },
      );

      if (pendingAttachments.length) {
        revokeAll(pendingAttachments);
        setPendingAttachments([]);
      }
    },
    [
      authStatus,
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

  const retryChat = useCallback(async () => {
    if (status === "streaming" || status === "submitted" || isRetrying) {
      return;
    }

    setIsRetrying(true);
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
          // regenerating. This is the "retry should resume, not restart" fix.
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
                /* retry remains visible */
              } finally {
                setIsRetrying(false);
              }
            };
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
            });
            es.addEventListener("heartbeat", () => {
              setIsRetrying(true);
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
              /* retry remains visible */
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
    // or turn is not in a reloadable state — regenerate via AI SDK.
    try {
      await regenerate();
    } catch {
      // The error panel remains visible.
    } finally {
      setIsRetrying(false);
    }
  }, [clearError, isRetrying, projectId, regenerate, reloadLatestChat, status]);

  const retryWorkspaceCard = useCallback(async () => {
    if (status === "streaming" || status === "submitted" || isRetrying) {
      return;
    }

    setIsRetrying(true);
    clearError();

    // When a prior user turn exists, re-stream it via the normal chat path so
    // a real chat bubble + card appears (visible feedback). Only fall back to
    // the one-shot repair_card fetch when there is no user message to replay
    // (e.g. initial-prepare failure before the user ever typed).
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
    "flex h-full min-h-0 min-w-0 overflow-x-hidden flex-col bg-[#1b1b19] p-spacing-4 sm:p-spacing-5";
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
    // tab so it doesn't fight Monaco's horizontal scroll.
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
            {!readOnly && isRenaming ? (
              <button
                type="button"
                onClick={() => void saveProjectTitle()}
                className="rounded-full p-spacing-2 text-[#8ce99a] hover:bg-surface-warm-white/8"
                aria-label="Simpan nama proyek"
              >
                <Check className="size-3.5" />
              </button>
            ) : !readOnly ? (
              <button
                type="button"
                onClick={() => setIsRenaming(true)}
                className="rounded-full p-spacing-2 text-surface-warm-white/44 hover:bg-surface-warm-white/8 hover:text-surface-warm-white"
                aria-label="Ubah nama proyek"
              >
                <Pencil className="size-3.5" />
              </button>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-spacing-2">
          <EnergyDisplay />
          <button
            type="button"
            onClick={showPreviewPanel ? closePreviewPanel : openPreviewPanel}
            className="hidden rounded-full border border-surface-warm-white/10 p-spacing-3 text-surface-warm-white/62 hover:bg-surface-warm-white/8 hover:text-surface-warm-white lg:block"
            aria-label={showPreviewPanel ? "Tutup tampilan" : "Buka tampilan"}
          >
            {showPreviewPanel ? (
              <PanelRightClose className="size-4" />
            ) : (
              <PanelRightOpen className="size-4" />
            )}
          </button>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col mt-spacing-5">
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
          className="min-h-0 flex-1 space-y-spacing-6 overflow-y-auto overflow-x-hidden px-spacing-1 pr-spacing-2 [scrollbar-color:#6f6a60_transparent] [scrollbar-width:thin]"
        >
          {hasMoreChat ? (
            <div className="flex justify-center py-spacing-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void loadOlderChat()}
                disabled={isLoadingOlderChat}
                className="rounded-radius-lg border-surface-warm-white/14 bg-surface-warm-white/8 text-surface-warm-white hover:bg-surface-warm-white/12"
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
          ) : sessionExpired ? (
            <div className="rounded-[18px] border border-[#ffb4a6]/24 bg-[#ffb4a6]/[0.06] px-spacing-5 py-spacing-4">
              <p className="text-sm font-medium text-[#ffb4a6]">
                Sesi kamu sudah habis.
              </p>
              <Button
                type="button"
                onClick={() => void signOut({ callbackUrl: "/" })}
                className="mt-spacing-3 h-9 rounded-full bg-surface-warm-white px-spacing-5 text-xs text-foreground-primary hover:bg-surface-warm-white/86"
              >
                Login ulang
              </Button>
            </div>
          ) : isPreparingNextQuestion ? (
            <p className="text-sm text-surface-warm-white/46">
              Menyiapkan pertanyaan berikutnya...
            </p>
          ) : workspaceCardError ? (
            <div className="rounded-[18px] border border-[#ffb4a6]/24 bg-[#ffb4a6]/[0.06] px-spacing-5 py-spacing-4">
              <p className="text-sm font-medium text-[#ffb4a6]">
                {isRetrying
                  ? "Mencoba menyiapkan pertanyaan lagi..."
                  : "Pertanyaan berikutnya belum berhasil dibuat."}
              </p>
              {!readOnly && !isRetrying ? (
                <Button
                  type="button"
                  onClick={() => void retryWorkspaceCard()}
                  className="mt-spacing-3 h-9 rounded-full bg-surface-warm-white px-spacing-5 text-xs text-foreground-primary hover:bg-surface-warm-white/86"
                >
                  Coba lagi
                </Button>
              ) : null}
            </div>
          ) : error &&
            (error as ChatError).code === "project_request_blocked" ? (
            <div className="rounded-[18px] border border-yellow-500/24 bg-yellow-500/[0.06] px-spacing-5 py-spacing-4">
              <div className="flex items-start gap-spacing-3">
                <span className="mt-0.5 text-yellow-400" aria-hidden>
                  ⚠️
                </span>
                <p className="text-sm leading-6 text-surface-warm-white/78">
                  {error.message}
                </p>
              </div>
            </div>
          ) : error && (error as ChatError).code === "chat_turn_too_large" ? (
            <div className="rounded-[18px] border border-[#ffb4a6]/24 bg-[#ffb4a6]/[0.06] px-spacing-5 py-spacing-4">
              <p className="text-sm font-medium text-[#ffb4a6]">
                Pesan terlalu panjang. Ringkas dulu sebelum dikirim.
              </p>
            </div>
          ) : error ? (
            <div className="rounded-[18px] border border-[#ffb4a6]/24 bg-[#ffb4a6]/[0.06] px-spacing-5 py-spacing-4">
              <p className="text-sm font-medium text-[#ffb4a6]">
                {isRetrying
                  ? "AI sempat terputus. Mencoba menyambung ulang..."
                  : "AI sempat terputus. Coba kirim ulang pesanmu."}
              </p>
              {!readOnly && !isRetrying ? (
                <Button
                  type="button"
                  onClick={() => void retryChat()}
                  className="mt-spacing-3 h-9 rounded-full bg-surface-warm-white px-spacing-5 text-xs text-foreground-primary hover:bg-surface-warm-white/86"
                >
                  Kirim ulang
                </Button>
              ) : null}
            </div>
          ) : resumeError ? (
            <div className="rounded-[18px] border border-[#ffb4a6]/24 bg-[#ffb4a6]/[0.06] px-spacing-5 py-spacing-4">
              <p className="text-sm font-medium text-[#ffb4a6]">
                {resumeError.message}
              </p>
              {!readOnly && !isRetrying ? (
                <Button
                  type="button"
                  onClick={() => void retryChat()}
                  className="mt-spacing-3 h-9 rounded-full bg-surface-warm-white px-spacing-5 text-xs text-foreground-primary hover:bg-surface-warm-white/86"
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
            className="absolute bottom-4 left-1/2 z-30 -translate-x-1/2 flex items-center gap-2 rounded-full border border-surface-warm-white/10 bg-surface-warm-white px-4 py-2 text-xs font-semibold text-foreground-primary shadow-lg hover:bg-surface-warm-white/90 active:scale-95 transition-all cursor-pointer"
          >
            <ArrowDown className="size-3.5" />
            <span>Lompat ke Bawah</span>
          </button>
        )}
      </div>

      <div className="mt-spacing-5">
        {readOnly ? (
          <div className="mt-spacing-3 rounded-[22px] border border-surface-warm-white/10 bg-[#242421] px-spacing-5 py-spacing-4 text-sm text-surface-warm-white/62">
            Mode baca-saja aktif. Chat, build, dan aksi edit tidak tersedia.
          </div>
        ) : (
          <AnimatePresence mode="wait" initial={false}>
            {isProcessing ? (
              <motion.div key="composer-processing" {...COMPOSER_TRANSITION}>
                <ProcessingControl
                  currentStep={resolveCurrentBuildProgressStep(buildProgress)}
                  mode={isBuilding ? "Buat" : "Diskusi"}
                  onStop={stopCurrentJob}
                />
              </motion.div>
            ) : rateLimitError ? (
              <motion.div
                key="composer-rate-limit"
                {...COMPOSER_TRANSITION}
                className="mt-spacing-3 rounded-[22px] border border-surface-warm-white/10 bg-[#242421] px-spacing-5 py-spacing-4 text-sm text-surface-warm-white/62"
              >
                Tunggu sebentar sebelum mengirim jawaban berikutnya.
              </motion.div>
            ) : isPreparingNextQuestion ||
              workspaceCardError ? null : !hasAnsweredActiveQuestion &&
              composerState === "question" &&
              workspaceCard.type === "image_upload" ? (
              <motion.div
                key="composer-image-upload"
                {...COMPOSER_TRANSITION}
                className="mt-spacing-3"
              >
                <ImageUploadComposer
                  imageUpload={workspaceCard.imageUpload}
                  onSubmit={(answer, workspaceAnswers) =>
                    submitChatText(answer, { workspaceAnswers })
                  }
                />
              </motion.div>
            ) : isPreparingNextQuestion ||
              workspaceCardError ? null : !hasAnsweredActiveQuestion &&
              composerState === "question" &&
              workspaceCard.type === "question" ? (
              <motion.div
                key="composer-question"
                {...COMPOSER_TRANSITION}
                className="mt-spacing-3"
              >
                <div className="mb-spacing-2 inline-flex h-9 items-center rounded-radius-md border border-surface-warm-white/10 bg-surface-warm-white/5 p-0.5 text-xs w-fit">
                  {(
                    [
                      { label: "Pilihan", value: "options" },
                      { label: "Tulis bebas", value: "free" },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.value}
                      type="button"
                      onClick={() => {
                        setQuestionComposerMode(tab.value);
                        if (tab.value === "options") {
                          setMessage("");
                        }
                      }}
                      className="relative flex h-8 items-center justify-center gap-spacing-2 rounded-radius-sm px-spacing-4 text-xs font-medium transition focus-visible:outline-none cursor-pointer"
                    >
                      {questionComposerMode === tab.value && (
                        <motion.span
                          layoutId="question-composer-tab"
                          className="absolute inset-0 rounded-radius-sm bg-surface-warm-white"
                          transition={{
                            type: "spring",
                            stiffness: 500,
                            damping: 30,
                          }}
                        />
                      )}
                      <span
                        className={cn(
                          "relative z-10 flex items-center gap-spacing-2",
                          questionComposerMode === tab.value
                            ? "text-foreground-primary"
                            : "text-surface-warm-white/58 hover:text-surface-warm-white",
                        )}
                      >
                        {tab.label}
                      </span>
                    </button>
                  ))}
                </div>
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
                      transition={{
                        duration: 0.22,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                    >
                      <QuestionComposer
                        question={workspaceCard.question}
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
                      transition={{
                        duration: 0.22,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                      onSubmit={handleMessageSubmit}
                      className="min-w-0"
                    >
                      <div className="rounded-[28px] border border-surface-warm-white/12 bg-[#262622] p-spacing-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_18px_48px_rgba(0,0,0,0.22)]">
                        <label htmlFor="workspace-message" className="sr-only">
                          Pesan untuk AI
                        </label>
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
                          rows={1}
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
                              : "Tulis bebas..."
                          }
                          disabled={
                            sessionExpired || authStatus !== "authenticated"
                          }
                          className="w-full resize-none bg-transparent px-spacing-3 py-spacing-3 text-sm leading-6 text-surface-warm-white outline-none [scrollbar-width:none] placeholder:text-surface-warm-white/38 disabled:opacity-60 [&::-webkit-scrollbar]:hidden"
                        />
                        <div className="flex items-center justify-end gap-spacing-4">
                          <div className="flex items-center gap-spacing-2">
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
                            <Button
                              type="submit"
                              size="icon"
                              disabled={
                                !message.trim() ||
                                hasUploadingAttachments(pendingAttachments)
                              }
                              className="size-9 rounded-full bg-surface-warm-white text-foreground-primary hover:bg-surface-warm-white/86 disabled:opacity-50"
                              aria-label="Kirim pesan"
                            >
                              <ArrowUp className="size-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </motion.form>
                  )}
                </AnimatePresence>
              </motion.div>
            ) : composerState === "build_recommendation" ? (
              <motion.div
                key="composer-build-recommendation"
                {...COMPOSER_TRANSITION}
              >
                <WorkspaceCardView
                  canBuild={canStartBuildNow}
                  card={workspaceCard}
                  onBuild={() => void handleStartBuild()}
                  onDiscuss={holdBuildRecommendation}
                />
              </motion.div>
            ) : composerState === "post_build_review" ||
              composerState === "build_failed_with_last_good" ? (
              <motion.div key="composer-post-build" {...COMPOSER_TRANSITION}>
                <CompletedBuildNotice
                  onDiscuss={() => {
                    // Park only an unconsumed rancangan so free discuss opens
                    // first; never re-hold a plan already used to start a build.
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
                  <HeldBuildRecommendationNotice
                    canBuild={canStartBuildNow}
                    onBuild={() => void handleStartBuild()}
                    onOpen={openBuildRecommendation}
                  />
                ) : null}
                <form
                  onSubmit={handleMessageSubmit}
                  className="mt-spacing-3 min-w-0 rounded-[28px] border border-surface-warm-white/12 bg-[#262622] p-spacing-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_18px_48px_rgba(0,0,0,0.22)]"
                >
                  <label htmlFor="workspace-message" className="sr-only">
                    Pesan untuk AI
                  </label>
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
                    rows={1}
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
                          ? "Minta perubahan, contoh: buat lebih premium..."
                          : "Jawab pilihan atau tulis kebutuhanmu..."
                    }
                    className="w-full resize-none bg-transparent px-spacing-3 py-spacing-3 text-sm leading-6 text-surface-warm-white outline-none [scrollbar-width:none] placeholder:text-surface-warm-white/38 disabled:opacity-60 [&::-webkit-scrollbar]:hidden"
                    disabled={sessionExpired || authStatus !== "authenticated"}
                  />
                  <div className="flex items-center justify-end gap-spacing-4">
                    <div className="flex items-center gap-spacing-2">
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
                      <Button
                        type="submit"
                        size="icon"
                        disabled={
                          !message.trim() ||
                          hasUploadingAttachments(pendingAttachments)
                        }
                        className="size-9 rounded-full bg-surface-warm-white text-foreground-primary hover:bg-surface-warm-white/86 disabled:opacity-50"
                        aria-label="Kirim pesan"
                      >
                        <ArrowUp className="size-4" />
                      </Button>
                    </div>
                  </div>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        )}
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
        />
        <div className="min-h-0 flex-1 overflow-hidden bg-[#10100f]">
          {activeTab === "preview" ? (
            <div
              id="workspace-preview-panel"
              role="tabpanel"
              aria-labelledby="workspace-preview-tab"
              className="h-full min-h-0"
            >
              {isBuilding && !hasLastGoodPreview ? (
                <div className="grid min-h-full place-items-center bg-[#10100f] p-spacing-10 text-center">
                  <div className="flex flex-col items-center gap-spacing-4 text-center">
                    <div className="size-9 animate-spin rounded-full border-2 border-surface-warm-white/12 border-t-surface-warm-white/82" />
                    <p className="text-sm font-medium text-surface-warm-white/78">
                      Menyiapkan pratinjau website...
                    </p>
                  </div>
                </div>
              ) : previewIssue && !(isBuilding && hasLastGoodPreview) ? (
                <PreviewIssueState
                  detail={previewIssue.detail}
                  onRebuild={readOnly ? undefined : () => void startBuild()}
                  onRestart={
                    readOnly ? undefined : () => void recoverPreviewRuntime()
                  }
                  onRetry={() => void recoverPreviewRuntime()}
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
                  {isBuilding && hasLastGoodPreview && (
                    <div className="absolute inset-x-0 top-0 z-10 flex items-center gap-2 bg-[#10100f]/80 px-4 py-2 text-xs text-surface-warm-white/78 backdrop-blur-sm">
                      <div className="size-3 animate-spin rounded-full border-2 border-surface-warm-white/12 border-t-surface-warm-white/82" />
                      Membangun ulang website...
                    </div>
                  )}
                </div>
              ) : (
                <EmptyPreviewState />
              )}
              {runtimeState?.userFacingState ===
                "ready_with_failed_latest_attempt" && (
                <CompletedBuildNotice
                  variant="recovery"
                  onDiscuss={() => {
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
                />
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
              onRetry={() => setSourceReloadKey((current) => current + 1)}
            />
          </div>
        </div>
      </div>
    </section>
  );

  return (
    <div
      className="flex h-dvh flex-col overflow-hidden bg-[#10100f] text-surface-warm-white"
      onTouchEnd={handleTouchEnd}
      onTouchStart={handleTouchStart}
    >
      {readOnly ? (
        <div className="shrink-0 border-b border-surface-warm-white/10 bg-surface-warm-white/8 px-spacing-4 py-spacing-3 text-sm text-surface-warm-white/82">
          Mode admin baca-saja. Kamu melihat proyek seperti pengguna, tanpa izin
          mengubah atau mengirim aksi.
        </div>
      ) : null}
      <nav
        aria-label="Pilih tampilan ruang kerja"
        className="sticky bottom-0 z-20 flex h-14 shrink-0 items-stretch gap-spacing-2 border-t border-surface-warm-white/10 bg-[#1b1b19] px-spacing-3 pb-[env(safe-area-inset-bottom)] lg:hidden"
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
          aria-pressed={mobileSurface === "preview" && activeTab === "preview"}
          onClick={() => {
            setActiveTab("preview");
            openPreviewPanel();
          }}
          className="min-h-11 flex-1 rounded-radius-lg px-spacing-4 text-sm font-medium aria-pressed:bg-surface-warm-white aria-pressed:text-foreground-primary"
        >
          Tampilan
        </button>
        <button
          type="button"
          aria-pressed={mobileSurface === "preview" && activeTab === "code"}
          onClick={() => {
            setActiveTab("code");
            openPreviewPanel();
          }}
          className="min-h-11 flex-1 rounded-radius-lg px-spacing-4 text-sm font-medium aria-pressed:bg-surface-warm-white aria-pressed:text-foreground-primary"
        >
          Kode
        </button>
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
            defaultSize={showPreviewPanel ? "25%" : "100%"}
            minSize="20%"
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
            // or user abandons). Prevents stale "N komentar siap" badges.
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
    </div>
  );
}

function createRuntimeControl({
  buildStatus,
  isPublishing,
  onPublish,
  publishedPath,
  runtimeState,
  sourceStatus,
}: {
  buildStatus: string;
  isPublishing: boolean;
  onPublish: () => void;
  publishedPath: string | null;
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
    canPublish:
      runtimeBuildStatus === "succeeded" || runtimeBuildStatus === "passed",
    isPublishing,
    onPublish,
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

function ChatMessages({ messages }: { messages: UIMessage[] }) {
  if (!messages.length) {
    return null;
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

        if (!textParts.length) {
          return null;
        }

        return (
          <div
            key={`${message.id || message.role}-${messageIndex}`}
            className={`flex max-w-full text-base leading-7 ${message.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div className={chatBubbleClass(message.role)}>
              {textParts.map((part, index) => (
                <MessageText key={index} text={part.text} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function HeldBuildRecommendationNotice({
  canBuild = true,
  onBuild,
  onOpen,
}: {
  canBuild?: boolean;
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
            disabled={!canBuild}
            onClick={onBuild}
            className="h-9 rounded-[12px] bg-surface-warm-white px-spacing-4 text-xs text-foreground-primary hover:bg-surface-warm-white/86 disabled:opacity-50"
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

  if (path.endsWith(".jsx") || path.endsWith(".js") || path.endsWith(".mjs")) {
    return "javascript";
  }

  if (path.endsWith(".css")) {
    return "css";
  }

  if (path.endsWith(".scss")) {
    return "scss";
  }

  if (path.endsWith(".less")) {
    return "less";
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

  if (path.endsWith(".svg") || path.endsWith(".xml")) {
    return "xml";
  }

  if (path.endsWith(".yaml") || path.endsWith(".yml")) {
    return "yaml";
  }

  if (path.endsWith(".sh") || path.endsWith(".bash")) {
    return "shell";
  }

  if (path.endsWith(".sql")) {
    return "sql";
  }

  if (path.endsWith(".py")) {
    return "python";
  }

  if (path.endsWith(".env")) {
    return "ini";
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
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggle = useCallback((path: string) => {
    setExpanded((current) => ({ ...current, [path]: !current[path] }));
  }, []);

  if (!files.length) {
    return (
      <p className="px-spacing-4 py-spacing-3 text-sm text-surface-warm-white/50">
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
          expanded={expanded}
          onToggle={toggle}
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
  expanded,
  onToggle,
}: {
  name: string;
  node: FileTreeNode;
  onSelect: (path: string) => void;
  selectedPath: string;
  expanded: Record<string, boolean>;
  onToggle: (path: string) => void;
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

  const isOpen = expanded[node.path] === true;
  const children = sortFileTreeEntries(node.children);

  return (
    <div key={node.path} className="group">
      <button
        type="button"
        onClick={() => onToggle(node.path)}
        className="flex w-full cursor-pointer items-center px-spacing-4 py-spacing-1.5 text-left text-sm font-medium text-surface-warm-white/72 hover:bg-surface-warm-white/7 hover:text-surface-warm-white"
      >
        <span
          className={`mr-spacing-2 inline-block text-surface-warm-white/38 transition-transform ${isOpen ? "rotate-90" : ""}`}
        >
          ›
        </span>
        {name}
      </button>
      {isOpen ? (
        <div className="ml-spacing-5 border-l border-surface-warm-white/8 pl-spacing-3">
          {children.map(([childName, child]) => (
            <FileTreeItem
              key={child.path || `${node.path}/${childName}`}
              name={childName}
              node={child}
              onSelect={onSelect}
              selectedPath={selectedPath}
              expanded={expanded}
              onToggle={onToggle}
            />
          ))}
        </div>
      ) : null}
    </div>
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
          Kode website muncul setelah AI menulis file (termasuk bila build
          gagal). Jalankan build pertama dari rancangan jika masih kosong.
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
    <div className="grid h-full min-h-0 grid-rows-[auto_1fr] overflow-hidden border-t border-surface-warm-white/10 bg-[#10100f] text-surface-warm-white md:grid-cols-[280px_1fr] md:grid-rows-1">
      {/* Mobile: sticky file-dropdown strip */}
      <div className="flex items-center justify-between gap-spacing-2 border-b border-surface-warm-white/10 bg-[#111110] px-spacing-4 py-spacing-3 text-sm md:hidden">
        <label htmlFor="workspace-code-file-mobile" className="sr-only">
          File
        </label>
        <select
          id="workspace-code-file-mobile"
          value={selectedFile?.path || ""}
          onChange={(event) => setSelectedPath(event.target.value)}
          className="min-w-0 flex-1 rounded-radius-md border border-surface-warm-white/12 bg-[#1d1d1a] px-spacing-3 py-spacing-2 text-sm text-surface-warm-white outline-none focus:border-surface-warm-white/30"
        >
          {sortedFiles.map((file) => (
            <option key={file.path} value={file.path}>
              {file.path}
            </option>
          ))}
        </select>
      </div>

      {/* Desktop: existing sidebar */}
      <aside className="hidden overflow-y-auto border-r border-surface-warm-white/10 bg-[#181816] py-spacing-3 md:block">
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
            loading={
              <div
                role="status"
                className="flex h-full min-h-0 items-center justify-center gap-spacing-3 bg-[#10100f] text-sm text-surface-warm-white/64"
              >
                <div className="size-5 animate-spin rounded-full border-2 border-surface-warm-white/12 border-t-surface-warm-white/82" />
                Memuat editor kode...
              </div>
            }
            options={{
              readOnly: true,
              domReadOnly: true,
              editContext: false,
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

// Pure gate: brief is non-null AND every readiness field passes. Mirrors the
// server-side check at /api/projects/$id/generate.
export function canStartBuild(brief: ProjectBrief | null | undefined): boolean {
  if (!brief) {
    return false;
  }
  return true;
}

// Resume poll interval for a running discuss turn. ponytail: if useChat v4
// grows a clean transport-resume API, swap the poll loop for it; the helper
// stays.
export const RESUME_POLL_INTERVAL_MS = 1_500;

// Fetch the server-side turn state. Returns `null` on a 404 (no turn row for
// this project — the pre-fix bug where a turn crashed before persist). The
// caller treats `null` as `idle`.
type TurnState = {
  turnId: string;
  status: "running" | "succeeded" | "failed" | "cancelled" | "expired";
  userMessageId: string;
  errorMessage?: string;
};

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

// Pure resume decision: given the server-side turn state, what should the
// client do? Extracted so the branches are unit-testable without a DOM.
export type DiscussResume =
  | { kind: "idle" }
  | { kind: "reload" }
  | { kind: "poll" }
  | { kind: "retry"; errorMessage: string; retryText: string };

export function resolveDiscussResume(turn: TurnState | null): DiscussResume {
  if (!turn) {
    return { kind: "idle" };
  }
  if (turn.status === "running") {
    return { kind: "poll" };
  }
  if (turn.status === "succeeded") {
    return { kind: "reload" };
  }
  const message = toUserFacingDiscussError(turn.errorMessage);
  return {
    kind: "retry",
    errorMessage: message,
    retryText: "Kirim ulang",
  };
}

/** Map stored turn errors to friendly Indonesian (never leak English internals). */
export function toUserFacingDiscussError(
  errorMessage: string | undefined | null,
): string {
  const raw = (errorMessage ?? "").trim();
  if (!raw) {
    return "Putaran AI sebelumnya gagal. Coba kirim ulang ya.";
  }
  // Already Indonesian product copy (contains spaces + non-ascii or common ID words).
  if (
    /[à-üÀ-Ü]|coba |belum |gagal|obrolan|sesi |proses |waktu|kirim|hentikan|gangguan|proyek/i.test(
      raw,
    )
  ) {
    return raw;
  }
  // Known internal codes / English leftovers from older builds.
  const legacy: Record<string, string> = {
    expired: "Sesi obrolan habis waktu. Coba kirim ulang pesanmu ya.",
    stream_error_no_text: "AI lagi gangguan. Coba lagi sebentar.",
    repair_failed: "AI lagi gangguan. Coba lagi sebentar.",
    "discuss turn failed":
      "Obrolan belum berhasil diproses. Coba kirim ulang ya.",
  };
  if (legacy[raw]) {
    return legacy[raw];
  }
  // Looks like a stack/module/dev error — never show raw.
  if (
    /cannot find module|error:|exception|undefined|null|worker |queue |failed to|ECONN|timeout/i.test(
      raw,
    )
  ) {
    return "Obrolan belum berhasil diproses. Coba kirim ulang ya.";
  }
  // Short English tokens without spaces → treat as internal code.
  if (!/\s/.test(raw) && /^[a-z0-9_.:-]+$/i.test(raw)) {
    return "Putaran AI sebelumnya gagal. Coba kirim ulang ya.";
  }
  return raw;
}

// Wrapper kept for the effect: fetch then resolve. Separate so the pure
// resolver stays trivially testable.
async function resolveDiscussResumeFromServer(
  projectId: string,
): Promise<DiscussResume> {
  return resolveDiscussResume(await fetchDiscussTurn(projectId));
}
