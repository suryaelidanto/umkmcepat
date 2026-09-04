"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type FileUIPart, type UIMessage } from "ai";
import {
  type FormEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";

import {
  canStartBuild,
  filterDiscussionMessagesWithWorkspaceUi,
  getLatestExplicitEditInstruction,
  MAX_CHAT_BYTES,
  rateLimitAwareFetch,
  readConsumedBuildRecommendationSignatures,
  resolveBuildAction,
  resolvePendingEditInstruction,
  resolvePrimaryComposerIntent,
  sanitizeWorkspaceCard,
  type WorkspaceStateResponse,
} from "./workspace-helpers";

import type {
  BuildProgressStep,
  WorkspaceAnswerPayload,
} from "@/components/projects/workspace/WorkspacePrimitives";
import type { ProjectBrief, WorkspaceCard } from "@/lib/projects/brief";

import { createUploadedImageFilePart } from "@/lib/projects/chat-file-parts";
import { dedupeUiMessagesForPersistence } from "@/lib/projects/chat-memory";
import {
  addAttachments,
  hasUploadingAttachments,
  MAX_COMPOSER_IMAGES,
  removeAttachment,
  revokeAll,
  tempImageUrl,
  type PendingAttachment,
} from "@/lib/projects/composer-attachments";
import { isPreflightBlockedByWorkspaceCard } from "@/lib/projects/discuss-preflight";
import {
  getBuildRecommendationHoldSignature,
  getWorkspaceComposerState,
  hasAnsweredWorkspaceQuestion,
  isBuildRecommendationConsumed,
  isBuildRecommendationHeld,
  isFreshWorkspaceCard,
  isUserVisibleAssistantText,
} from "@/lib/projects/workspace-sync";
import { uploadTempImageFile } from "@/lib/storage/uploads/temp-image-client";

export type UseWorkspaceChatOptions = {
  authStatus: "authenticated" | "loading" | "unauthenticated";
  buildComplete: boolean;
  buildStatus: string;
  composerUploadsEnabled: boolean;
  initialChatCursor: number | null;
  initialChatHasMore: boolean;
  initialMessages: UIMessage[];
  initialPrompt?: string;
  initialWorkspaceCard: WorkspaceCard;
  isBuilding: boolean;
  isEditingPreview: boolean;
  latestBrief: ProjectBrief | null;
  mode: "build" | "discuss";
  postBuildChatOpen: boolean;
  projectId: string;
  readOnly?: boolean;
  sessionExpired: boolean;
  setBuildProgress: React.Dispatch<React.SetStateAction<BuildProgressStep[]>>;
  setDraftTitle: (title: string) => void;
  setLatestBrief: (brief: ProjectBrief | null) => void;
  setMode: (mode: "build" | "discuss") => void;
  setPostBuildChatOpen: (open: boolean) => void;
  setProjectTitle: (title: string) => void;
  startBuild: () => Promise<void>;
  submitDirectEdit: (args: {
    instruction: string;
    summary: string;
  }) => Promise<boolean>;
};

export function useWorkspaceChat({
  authStatus,
  buildComplete,
  buildStatus,
  composerUploadsEnabled,
  initialChatCursor,
  initialChatHasMore,
  initialMessages,
  initialPrompt = "",
  initialWorkspaceCard,
  isBuilding,
  isEditingPreview,
  latestBrief,
  mode,
  postBuildChatOpen,
  projectId,
  readOnly = false,
  sessionExpired,
  setBuildProgress,
  setDraftTitle,
  setLatestBrief,
  setMode,
  setPostBuildChatOpen,
  setProjectTitle,
  startBuild,
  submitDirectEdit,
}: UseWorkspaceChatOptions) {
  const prompt = (initialPrompt ?? "").trim();
  const buildRecommendationStorageKey = `umkmcepat:build-recommendation-hold:${projectId}`;
  const buildRecommendationConsumedKey = `umkmcepat:build-recommendation-consumed:${projectId}`;

  const [message, setMessage] = useState("");
  const [olderMessages, setOlderMessages] = useState<UIMessage[]>([]);
  const [chatCursor, setChatCursor] = useState<number | null>(
    initialChatCursor,
  );
  const [hasMoreChat, setHasMoreChat] = useState(initialChatHasMore);
  const [isLoadingOlderChat, setIsLoadingOlderChat] = useState(false);
  const [isSubmittingTurn, setIsSubmittingTurn] = useState(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  const [workspaceCard, setWorkspaceCard] = useState<WorkspaceCard>(() =>
    sanitizeWorkspaceCard(initialWorkspaceCard),
  );
  const workspaceCardRef = useRef(workspaceCard);
  workspaceCardRef.current = workspaceCard;

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

  const [rateLimitError, setRateLimitError] = useState<{
    message: string;
    retryAfter: number;
  } | null>(null);
  const [questionComposerMode, setQuestionComposerMode] = useState<
    "card" | "free"
  >("card");
  const [isRetrying, setIsRetrying] = useState<false | "response" | "card">(
    false,
  );
  const [workspaceCardError, setWorkspaceCardError] = useState(false);
  const [isPreparingNextQuestion, setIsPreparingNextQuestion] = useState(false);
  const isPreparingNextQuestionRef = useRef(false);
  const [resumeError, setResumeError] = useState<{
    message: string;
    retryText: string;
  } | null>(null);

  const [pendingAttachments, setPendingAttachments] = useState<
    PendingAttachment[]
  >([]);
  const [isDraggingComposerFiles, setIsDraggingComposerFiles] = useState(false);
  const [draggedComposerFileCount, setDraggedComposerFileCount] = useState(0);
  const composerDragCounterRef = useRef(0);

  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const shouldStickToBottomRef = useRef(true);
  const ignoreNextScrollRef = useRef(false);
  const previousScrollHeight = useRef<number | null>(null);
  const retryAttemptRef = useRef(0);
  const submitInFlightRef = useRef(false);
  const pendingChatEditInstructionRef = useRef<string | null>(null);
  const modeRef = useRef(mode);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const applyWorkspaceCard = useCallback(
    (card: WorkspaceCard) => {
      const safeCard = sanitizeWorkspaceCard(card);
      if (
        isBuildRecommendationConsumed(
          safeCard,
          consumedBuildRecommendationSignatures,
        )
      ) {
        return false;
      }
      setWorkspaceCard(safeCard);
      return true;
    },
    [consumedBuildRecommendationSignatures],
  );

  useEffect(() => {
    if (
      isBuildRecommendationConsumed(
        workspaceCard,
        consumedBuildRecommendationSignatures,
      )
    ) {
      setWorkspaceCard({ type: "none" });
    }
  }, [consumedBuildRecommendationSignatures, workspaceCard]);

  const {
    messages,
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
          if (applyWorkspaceCard(card)) {
            setWorkspaceCardError(false);
          }
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

  const isChatNearBottom = useCallback((element: HTMLElement) => {
    return (
      element.scrollHeight - element.scrollTop - element.clientHeight <= 48
    );
  }, []);

  const scrollChatToBottom = useCallback(
    (options?: { behavior?: ScrollBehavior; force?: boolean }) => {
      const element = chatScrollRef.current;
      if (!element) {
        return;
      }

      if (!options?.force && !shouldStickToBottomRef.current) {
        return;
      }

      const behavior = options?.behavior ?? "smooth";
      ignoreNextScrollRef.current = true;
      element.scrollTo({
        behavior,
        top: element.scrollHeight,
      });

      window.requestAnimationFrame(() => {
        ignoreNextScrollRef.current = false;
        setShowScrollToBottom(false);
      });
    },
    [],
  );

  const reloadLatestChat = useCallback(async () => {
    const response = await fetch(`/api/projects/${projectId}/chat?limit=20`, {
      cache: "no-store",
    });
    if (!response.ok) {
      return;
    }
    const result = (await response.json()) as {
      hasMore?: boolean;
      messages?: UIMessage[];
      nextCursor?: number | null;
    };
    if (Array.isArray(result.messages)) {
      setMessages(result.messages);
      setOlderMessages([]);
      setChatCursor(result.nextCursor ?? null);
      setHasMoreChat(Boolean(result.hasMore));
      shouldStickToBottomRef.current = true;
      requestAnimationFrame(() =>
        scrollChatToBottom({ force: true, behavior: "smooth" }),
      );
    }
  }, [projectId, scrollChatToBottom, setMessages]);

  const loadOlderChat = useCallback(async () => {
    if (!chatCursor || isLoadingOlderChat) {
      return;
    }

    const container = chatScrollRef.current;
    if (container) {
      previousScrollHeight.current = container.scrollHeight;
      shouldStickToBottomRef.current = false;
    }

    setIsLoadingOlderChat(true);

    try {
      const response = await fetch(
        `/api/projects/${projectId}/chat?cursor=${chatCursor}&limit=20`,
      );
      if (!response.ok) {
        return;
      }

      const result = (await response.json()) as {
        hasMore?: boolean;
        messages?: UIMessage[];
        nextCursor?: number | null;
      };

      setOlderMessages((current) => {
        const next = [...(result.messages ?? []), ...current];
        return dedupeUiMessagesForPersistence(next);
      });
      setChatCursor(result.nextCursor ?? null);
      setHasMoreChat(Boolean(result.hasMore));

      requestAnimationFrame(() => {
        const nextContainer = chatScrollRef.current;
        if (!nextContainer || previousScrollHeight.current === null) {
          return;
        }

        const addedHeight =
          nextContainer.scrollHeight - previousScrollHeight.current;
        ignoreNextScrollRef.current = true;
        nextContainer.scrollTop += addedHeight;
        previousScrollHeight.current = null;
        ignoreNextScrollRef.current = false;
      });
    } finally {
      setIsLoadingOlderChat(false);
    }
  }, [chatCursor, isLoadingOlderChat, projectId]);

  const processComposerDroppedFiles = useCallback(
    (incomingFiles: File[]) => {
      if (!incomingFiles.length) {
        return;
      }

      if (authStatus !== "authenticated" || sessionExpired) {
        toast.error("Masuk dulu untuk mengunggah gambar.");
        return;
      }

      if (!composerUploadsEnabled) {
        toast.error("Fitur unggah gambar sedang tidak aktif.");
        return;
      }

      const { rejected, next, unaccepted } = addAttachments(
        pendingAttachments,
        incomingFiles,
      );
      const added = next.filter(
        (item) =>
          !pendingAttachments.some((existing) => existing.id === item.id),
      );

      if (unaccepted?.length) {
        toast.error(
          "Hanya format JPG, JPEG, PNG, dan WebP yang diperbolehkan.",
        );
      }

      setPendingAttachments(next);

      for (const item of added) {
        void uploadTempImageFile(item.file)
          .then((uploaded) =>
            setPendingAttachments((current) =>
              current.map((candidate) =>
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
            setPendingAttachments((current) =>
              removeAttachment(current, item.id),
            );
            toast.error("Gagal mengunggah gambar.");
          });
      }

      if (rejected.length) {
        toast.error(`Maksimal ${MAX_COMPOSER_IMAGES} gambar per pesan.`);
      }
    },
    [authStatus, composerUploadsEnabled, pendingAttachments, sessionExpired],
  );

  const handleComposerDragEnter = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    composerDragCounterRef.current += 1;
    if (event.dataTransfer.types.includes("Files")) {
      const count = event.dataTransfer.items?.length || 0;
      setDraggedComposerFileCount(count);
      setIsDraggingComposerFiles(true);
    }
  }, []);

  const handleComposerDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer.types.includes("Files")) {
      event.dataTransfer.dropEffect = "copy";
      const count = event.dataTransfer.items?.length || 0;
      if (count > 0) {
        setDraggedComposerFileCount(count);
      }
      setIsDraggingComposerFiles(true);
    }
  }, []);

  const handleComposerDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    composerDragCounterRef.current -= 1;
    if (composerDragCounterRef.current <= 0) {
      composerDragCounterRef.current = 0;
      setIsDraggingComposerFiles(false);
      setDraggedComposerFileCount(0);
    }
  }, []);

  const handleComposerDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      composerDragCounterRef.current = 0;
      setIsDraggingComposerFiles(false);
      setDraggedComposerFileCount(0);

      const files = Array.from(event.dataTransfer.files ?? []);
      processComposerDroppedFiles(files);
    },
    [processComposerDroppedFiles],
  );

  const allMessages = useMemo(
    () => dedupeUiMessagesForPersistence([...olderMessages, ...messages]),
    [messages, olderMessages],
  );
  const allMessagesRef = useRef(allMessages);
  useEffect(() => {
    allMessagesRef.current = allMessages;
  }, [allMessages]);

  const visibleMessages = useMemo(
    () => filterDiscussionMessagesWithWorkspaceUi(allMessages, true),
    [allMessages],
  );

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

  const isResponding = status === "submitted" || status === "streaming";
  const firstTurnSettled =
    (status === "ready" || status === "error") &&
    (olderMessages.some((m) => m.role === "assistant") ||
      messages.some((m) => m.role === "assistant"));
  const firstTurnPending =
    !readOnly &&
    Boolean(prompt) &&
    workspaceCard.type === "none" &&
    !firstTurnSettled;

  const isProcessing = Boolean(
    firstTurnPending ||
    isResponding ||
    isBuilding ||
    isEditingPreview ||
    isRetrying ||
    isPreparingNextQuestion,
  );

  const buildRecommendationSignature = useMemo(
    () => getBuildRecommendationHoldSignature(workspaceCard),
    [workspaceCard],
  );

  const preflightBlockedByCard =
    isPreflightBlockedByWorkspaceCard(workspaceCard);
  const hasAnsweredActiveQuestion = hasAnsweredWorkspaceQuestion({
    card: workspaceCard,
    messages: allMessages,
    mode: "discuss",
  });

  const canStartBuildNow = canStartBuild(workspaceCard, latestBrief);
  const hasActionableRecommendation =
    workspaceCard.type === "build_recommendation" && canStartBuildNow;

  const composerState = getWorkspaceComposerState({
    buildComplete,
    card: workspaceCard,
    consumedSignatures: consumedBuildRecommendationSignatures,
    hasFailedLatestAttemptWithLastGood: false,
    held: isBuildRecommendationHeld(
      workspaceCard,
      heldBuildRecommendationSignature,
    ),
    postBuildChatOpen,
  });

  const submitChatText = useCallback(
    async (
      text: string,
      options: {
        intent?: "prepare_build" | "prepare_update";
        uploads?: Array<{ assetId: string; url: string }>;
        workspaceAnswers?: WorkspaceAnswerPayload[];
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
          !options.uploads?.length &&
          !options.intent) ||
        isProcessing ||
        rateLimitError ||
        authStatus !== "authenticated" ||
        sessionExpired ||
        submitInFlightRef.current
      ) {
        return;
      }

      submitInFlightRef.current = true;
      setIsSubmittingTurn(true);

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

      shouldStickToBottomRef.current = true;
      setRateLimitError(null);
      setResumeError(null);
      clearError();
      retryAttemptRef.current = 0;
      setMessage("");
      setBuildProgress([]);
      requestAnimationFrame(() =>
        scrollChatToBottom({ force: true, behavior: "smooth" }),
      );

      if (buildComplete && trimmed) {
        pendingChatEditInstructionRef.current = resolvePendingEditInstruction(
          pendingChatEditInstructionRef.current,
          trimmed,
        );
      }

      sendMessage(
        {
          files: fileParts.length ? fileParts : undefined,
          text: trimmed,
        },
        {
          body: {
            intent: options.intent,
            mode: options.intent ? "discuss" : mode,
            workspaceAnswers: options.workspaceAnswers,
          },
        },
      );

      if (pendingAttachments.length) {
        revokeAll(pendingAttachments);
        setPendingAttachments([]);
      }
      setIsSubmittingTurn(false);
      submitInFlightRef.current = false;
    },
    [
      authStatus,
      buildComplete,
      clearError,
      isProcessing,
      mode,
      pendingAttachments,
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
  }, [
    buildRecommendationSignature,
    buildRecommendationStorageKey,
    setMode,
    setPostBuildChatOpen,
  ]);

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

  const handleMessageSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      submitChatText(message);
    },
    [message, submitChatText],
  );

  const handleMessageKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (
        event.key !== "Enter" ||
        event.shiftKey ||
        event.nativeEvent.isComposing
      ) {
        return;
      }

      event.preventDefault();
      submitChatText(message);
    },
    [message, submitChatText],
  );

  const loadWorkspaceStateRequestIdRef = useRef(0);

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

      if (requestId !== loadWorkspaceStateRequestIdRef.current) {
        return result;
      }

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
          isFreshWorkspaceCard(
            result.workspaceCard,
            workspaceCardRef.current,
          ) &&
          applyWorkspaceCard(result.workspaceCard)
        ) {
          setProjectTitle(result.projectTitle);
          setDraftTitle(result.projectTitle);
        }
        return;
      }

      applyWorkspaceCard(result.workspaceCard);
      setProjectTitle(result.projectTitle);
      setDraftTitle(result.projectTitle);
      if (result.brief) {
        setLatestBrief(result.brief);
      }
      return result;
    },
    [
      applyWorkspaceCard,
      projectId,
      setDraftTitle,
      setLatestBrief,
      setProjectTitle,
    ],
  );

  const handleStartBuild = useCallback(async () => {
    if (readOnly) {
      return;
    }

    const hasPostBuildUpdate =
      workspaceCard.type === "build_recommendation" &&
      workspaceCard.postBuildUpdate === true;
    const action = resolveBuildAction({
      buildComplete,
      buildStatus,
      hasPendingChatEdit: Boolean(pendingChatEditInstructionRef.current),
      hasPostBuildUpdate,
    });
    if (action === "edit") {
      const instruction =
        pendingChatEditInstructionRef.current ??
        getLatestExplicitEditInstruction(allMessagesRef.current);
      if (!instruction) {
        return;
      }
      const succeeded = await submitDirectEdit({
        instruction,
        summary: instruction,
      });
      if (succeeded) {
        pendingChatEditInstructionRef.current = null;
      }
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
    buildStatus,
    latestBrief,
    loadWorkspaceState,
    messages.length,
    readOnly,
    setLatestBrief,
    setMessages,
    startBuild,
    submitDirectEdit,
    workspaceCard,
  ]);

  const handlePrimaryComposerAction = useCallback(() => {
    if (readOnly || isBuilding) {
      return;
    }

    const hasDraft = Boolean(message.trim() || pendingAttachments.length > 0);
    const intent = resolvePrimaryComposerIntent({
      buildComplete,
      hasActionableRecommendation,
      hasDraft,
      hasPendingQuestion: preflightBlockedByCard,
    });

    if (intent) {
      void submitChatText("", { intent });
    }
  }, [
    buildComplete,
    hasActionableRecommendation,
    isBuilding,
    message,
    pendingAttachments.length,
    preflightBlockedByCard,
    readOnly,
    submitChatText,
  ]);

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
          try {
            await reloadLatestChat();
          } finally {
            setIsRetrying(false);
          }
          return;
        }
      }
      await reloadLatestChat();
    } finally {
      setIsRetrying(false);
    }
  }, [clearError, isRetrying, projectId, reloadLatestChat, status]);

  const retryWorkspaceCard = useCallback(async () => {
    setIsRetrying("card");
    setWorkspaceCardError(false);
    try {
      await reloadLatestChat();
    } finally {
      setIsRetrying(false);
    }
  }, [reloadLatestChat]);

  return {
    allMessages,
    allMessagesRef,
    applyWorkspaceCard,
    buildRecommendationSignature,
    buildRecommendationStorageKey,
    canStartBuildNow,
    chatScrollRef,
    clearError,
    composerState,
    consumedBuildRecommendationSignatures,
    dismissBuildRecommendation,
    draggedComposerFileCount,
    error,
    firstTurnPending,
    handleComposerDragEnter,
    handleComposerDragLeave,
    handleComposerDragOver,
    handleComposerDrop,
    handleMessageKeyDown,
    handleMessageSubmit,
    handlePrimaryComposerAction,
    handleStartBuild,
    hasActionableRecommendation,
    hasActiveTurnAssistantText,
    hasAnsweredActiveQuestion,
    hasMoreChat,
    heldBuildRecommendationSignature,
    holdBuildRecommendation,
    ignoreNextScrollRef,
    isChatNearBottom,
    isDraggingComposerFiles,
    isLoadingOlderChat,
    isPreparingNextQuestion,
    isProcessing,
    isResponding,
    isRetrying,
    isSubmittingTurn,
    loadOlderChat,
    loadWorkspaceState,
    message,
    messages,
    openBuildRecommendation,
    pendingAttachments,
    preflightBlockedByCard,
    questionComposerMode,
    rateLimitError,
    reloadLatestChat,
    resumeError,
    retryChat,
    retryWorkspaceCard,
    scrollChatToBottom,
    sendMessage,
    setConsumedBuildRecommendationSignatures,
    setHeldBuildRecommendationSignature,
    setIsPreparingNextQuestion,
    setIsRetrying,
    setMessage,
    setMessages,
    setPendingAttachments,
    setQuestionComposerMode,
    setRateLimitError,
    setResumeError,
    setShowScrollToBottom,
    setWorkspaceCard,
    setWorkspaceCardError,
    shouldStickToBottomRef,
    showScrollToBottom,
    status,
    stop,
    submitChatText,
    visibleMessages,
    workspaceCard,
    workspaceCardError,
    workspaceCardRef,
  };
}
