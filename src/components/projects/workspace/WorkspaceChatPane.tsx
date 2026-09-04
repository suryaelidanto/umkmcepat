"use client";

import { ArrowDown, ArrowUp, Check, Loader2, Pencil, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";

import { COMPOSER_TRANSITION, type ChatError } from "./workspace-helpers";

import type { WorkspaceCard } from "@/lib/projects/brief";
import type { getWorkspaceComposerState } from "@/lib/projects/workspace-sync";
import type { UIMessage } from "ai";
import type { FormEvent, KeyboardEvent, RefObject } from "react";

import { AuthButton } from "@/components/common/AuthButton";
import { EnergyDisplay } from "@/components/common/EnergyDisplay";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import {
  CompletedBuildNotice,
  HeldBuildRecommendationNotice,
} from "@/components/projects/build/BuildNotices";
import { ChatMessages } from "@/components/projects/chat/ChatMessage";
import {
  ComposerAttachButton,
  ComposerAttachments,
} from "@/components/projects/chat/ComposerAttachments";
import {
  BuildProgressPanel,
  ImageUploadComposer,
  ProcessingControl,
  QuestionComposer,
  WorkspaceCardView,
  type BuildProgressStep,
  type WorkspaceAnswerPayload,
} from "@/components/projects/workspace/WorkspacePrimitives";
import { Button } from "@/components/ui/button";
import { resolveCurrentBuildProgressStep } from "@/lib/projects/build-progress-steps";
import {
  MAX_COMPOSER_IMAGES,
  removeAttachment,
  type PendingAttachment,
} from "@/lib/projects/composer-attachments";
import { toUserFacingDiscussError } from "@/lib/projects/workspace-resume";
import { cn } from "@/lib/utils";

export type WorkspaceChatPaneProps = {
  authStatus: "authenticated" | "loading" | "unauthenticated";
  buildComplete: boolean;
  buildProgress: BuildProgressStep[];
  buildRecommendationSignature: string | null;
  buildRecommendationStorageKey: string;
  buildStartedAt: number | null;
  canStartBuildNow: boolean;
  chatScrollRef: RefObject<HTMLDivElement | null>;
  closeChatPanel: () => void;
  composerState: ReturnType<typeof getWorkspaceComposerState>;
  composerUploadsEnabled: boolean;
  consumedBuildRecommendationSignatures: Set<string>;
  dismissBuildRecommendation: () => void;
  draftTitle: string;
  draggedComposerFileCount: number;
  error?: Error | null;
  firstTurnPending: boolean;
  handleComposerDragEnter: (event: React.DragEvent) => void;
  handleComposerDragLeave: (event: React.DragEvent) => void;
  handleComposerDragOver: (event: React.DragEvent) => void;
  handleComposerDrop: (event: React.DragEvent) => void;
  handleMessageKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  handleMessageSubmit: (event: FormEvent<HTMLFormElement>) => void;
  handlePrimaryComposerAction: () => void;
  handleStartBuild: () => Promise<void>;
  hasActionableRecommendation: boolean;
  hasActiveTurnAssistantText: boolean;
  hasAnsweredActiveQuestion: boolean;
  hasMoreChat: boolean;
  hasPreview: boolean;
  holdBuildRecommendation: () => void;
  ignoreNextScrollRef: RefObject<boolean>;
  isBuilding: boolean;
  isChatNearBottom: (element: HTMLElement) => boolean;
  isDraggingComposerFiles: boolean;
  isLoadingOlderChat: boolean;
  isPreparingNextQuestion: boolean;
  isProcessing: boolean;
  isResponding: boolean;
  isRetrying: false | "response" | "card";
  isSubmittingTurn: boolean;
  loadOlderChat: () => Promise<void>;
  message: string;
  openBuildRecommendation: () => void;
  openPreviewPanel: () => void;
  pendingAttachments: PendingAttachment[];
  preflightBlockedByCard: boolean;
  projectId: string;
  projectTitle: string;
  questionComposerMode: "card" | "free";
  rateLimitError: { message: string; retryAfter: number } | null;
  readOnly?: boolean;
  resumeError: { message: string; retryText: string } | null;
  retryChat: () => Promise<void>;
  retryWorkspaceCard: () => Promise<void>;
  saveProjectTitle: () => Promise<void>;
  scrollChatToBottom: (options?: {
    behavior?: ScrollBehavior;
    force?: boolean;
  }) => void;
  sessionExpired: boolean;
  setActiveTab: (tab: "preview" | "code" | "media") => void;
  setDraftTitle: (title: string) => void;
  setHeldBuildRecommendationSignature: (sig: string | null) => void;
  setIsRenaming: (val: boolean) => void;
  setMessage: (msg: string) => void;
  setMode: (mode: "build" | "discuss") => void;
  setPendingAttachments: React.Dispatch<
    React.SetStateAction<PendingAttachment[]>
  >;
  setPostBuildChatOpen: (open: boolean) => void;
  setQuestionComposerMode: (mode: "card" | "free") => void;
  setShowScrollToBottom: (show: boolean) => void;
  shouldStickToBottomRef: RefObject<boolean>;
  showScrollToBottom: boolean;
  signOut: (options: { callbackUrl: string }) => Promise<void>;
  stopCurrentJob: () => void;
  submitChatText: (
    text: string,
    options?: {
      intent?: "prepare_build" | "prepare_update";
      uploads?: Array<{ assetId: string; url: string }>;
      workspaceAnswers?: WorkspaceAnswerPayload[];
    },
  ) => Promise<void>;
  uploadTempImageFile: (file: File) => Promise<{ assetId: string }>;
  visibleMessages: UIMessage[];
  workspaceCard: WorkspaceCard;
  workspaceCardError: boolean;
  isRenaming: boolean;
};

export function WorkspaceChatPane({
  authStatus,
  buildComplete,
  buildProgress,
  buildRecommendationSignature,
  buildRecommendationStorageKey,
  buildStartedAt,
  canStartBuildNow,
  chatScrollRef,
  closeChatPanel,
  composerState,
  composerUploadsEnabled,
  consumedBuildRecommendationSignatures,
  dismissBuildRecommendation,
  draftTitle,
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
  hasActionableRecommendation: _hasActionableRecommendation,
  hasActiveTurnAssistantText,
  hasAnsweredActiveQuestion,
  hasMoreChat,
  hasPreview,
  holdBuildRecommendation,
  ignoreNextScrollRef,
  isBuilding,
  isChatNearBottom,
  isDraggingComposerFiles,
  isLoadingOlderChat,
  isPreparingNextQuestion,
  isProcessing,
  isRenaming,
  isResponding,
  isRetrying,
  isSubmittingTurn,
  loadOlderChat,
  message,
  openBuildRecommendation,
  openPreviewPanel,
  pendingAttachments,
  preflightBlockedByCard,
  projectId,
  projectTitle,
  questionComposerMode,
  rateLimitError,
  readOnly = false,
  resumeError,
  retryChat,
  retryWorkspaceCard,
  saveProjectTitle,
  scrollChatToBottom,
  sessionExpired,
  setActiveTab,
  setDraftTitle,
  setHeldBuildRecommendationSignature,
  setIsRenaming,
  setMessage,
  setMode,
  setPendingAttachments,
  setPostBuildChatOpen,
  setQuestionComposerMode,
  setShowScrollToBottom,
  shouldStickToBottomRef,
  showScrollToBottom,
  signOut,
  stopCurrentJob,
  submitChatText,
  uploadTempImageFile,
  visibleMessages,
  workspaceCard,
  workspaceCardError,
}: WorkspaceChatPaneProps) {
  return (
    <aside className="flex h-full min-h-0 min-w-0 overflow-x-hidden flex-col bg-[#eceae4] text-[#1c1c1c] transition-colors duration-200 dark:bg-[#1b1b19] dark:text-surface-warm-white">
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
              if (
                event.deltaY < 0 &&
                shouldStickToBottomRef.current !== undefined
              ) {
                shouldStickToBottomRef.current = false;
              }
            }}
            onTouchStart={() => {
              const element = chatScrollRef.current;
              if (
                element &&
                !isChatNearBottom(element) &&
                shouldStickToBottomRef.current !== undefined
              ) {
                shouldStickToBottomRef.current = false;
              }
            }}
            onScroll={(event) => {
              if (ignoreNextScrollRef.current) {
                return;
              }

              const element = event.currentTarget;
              const nearBottom = isChatNearBottom(element);
              if (shouldStickToBottomRef.current !== undefined) {
                shouldStickToBottomRef.current = nearBottom;
              }
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
                if (shouldStickToBottomRef.current !== undefined) {
                  shouldStickToBottomRef.current = true;
                }
                scrollChatToBottom({ behavior: "smooth", force: true });
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
                                uploads,
                                workspaceAnswers,
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
                        onDragEnter={handleComposerDragEnter}
                        onDragOver={handleComposerDragOver}
                        onDragLeave={handleComposerDragLeave}
                        onDrop={handleComposerDrop}
                        className="mt-2.5"
                      >
                        <label htmlFor="workspace-message" className="sr-only">
                          Pesan untuk AI
                        </label>
                        <div
                          className={`relative rounded-2xl border bg-white p-2.5 shadow-sm transition-all duration-200 dark:bg-[#282824] dark:shadow-[0_4px_20px_rgba(0,0,0,0.35)] ${
                            isDraggingComposerFiles
                              ? "border-primary ring-2 ring-primary/20 dark:border-white/60 dark:ring-white/20"
                              : "border-black/10 focus-within:border-black/30 dark:border-white/15 dark:focus-within:border-white/30"
                          }`}
                        >
                          {isDraggingComposerFiles ? (
                            <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center rounded-2xl bg-white/90 backdrop-blur-xs dark:bg-[#282824]/90">
                              <p className="text-xs font-semibold text-foreground dark:text-surface-warm-white">
                                {draggedComposerFileCount > 1
                                  ? `Lepaskan ${draggedComposerFileCount} gambar di sini`
                                  : "Lepaskan 1 gambar di sini"}
                              </p>
                              <p className="mt-0.5 text-[11px] text-muted-foreground dark:text-surface-warm-white/60">
                                JPG, JPEG, PNG, atau WebP (maks. 5 MB)
                              </p>
                            </div>
                          ) : null}
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
                                : buildComplete
                                  ? "Ceritakan perubahan yang kamu mau..."
                                  : "Tulis pesan atau kebutuhanmu di sini..."
                            }
                            className="w-full resize-none bg-transparent px-1 py-1 text-sm leading-6 text-foreground outline-none [scrollbar-width:none] placeholder:text-muted-foreground disabled:opacity-60 [&::-webkit-scrollbar]:hidden"
                            disabled={
                              sessionExpired || authStatus !== "authenticated"
                            }
                          />
                          <div className="mt-2 flex items-center justify-between gap-3 border-t border-black/10 pt-2 dark:border-white/10">
                            {preflightBlockedByCard ? (
                              <span />
                            ) : (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  void handlePrimaryComposerAction()
                                }
                                disabled={
                                  isBuilding ||
                                  isProcessing ||
                                  isSubmittingTurn ||
                                  readOnly ||
                                  Boolean(message.trim()) ||
                                  pendingAttachments.length > 0
                                }
                                className="h-8 rounded-lg border-black/15 bg-white px-3 text-xs font-medium text-foreground hover:bg-black/5 hover:text-foreground active:scale-95 disabled:cursor-not-allowed disabled:opacity-45 dark:border-white/15 dark:bg-white/5 dark:hover:bg-white/10 cursor-pointer"
                              >
                                {buildComplete
                                  ? "Perbarui website"
                                  : "Buat Website"}
                              </Button>
                            )}
                            <div className="flex items-center gap-1.5">
                              {composerUploadsEnabled ? (
                                <ComposerAttachButton
                                  attachments={pendingAttachments}
                                  onAdd={(next, rejected, unaccepted) => {
                                    if (unaccepted?.length) {
                                      toast.error(
                                        "Hanya format JPG, JPEG, PNG, dan WebP yang diperbolehkan.",
                                      );
                                    }
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
                                  pendingAttachments.some(
                                    (a) => a.status === "uploading",
                                  )
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
                    onDragEnter={handleComposerDragEnter}
                    onDragOver={handleComposerDragOver}
                    onDragLeave={handleComposerDragLeave}
                    onDrop={handleComposerDrop}
                    className="p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
                  >
                    <label htmlFor="workspace-message" className="sr-only">
                      Pesan untuk AI
                    </label>
                    <div
                      className={`relative rounded-2xl border bg-white p-2.5 shadow-sm transition-all duration-200 dark:bg-[#282824] dark:shadow-[0_4px_20px_rgba(0,0,0,0.35)] ${
                        isDraggingComposerFiles
                          ? "border-primary ring-2 ring-primary/20 dark:border-white/60 dark:ring-white/20"
                          : "border-black/10 focus-within:border-black/30 dark:border-white/15 dark:focus-within:border-white/30"
                      }`}
                    >
                      {isDraggingComposerFiles ? (
                        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center rounded-2xl bg-white/90 backdrop-blur-xs dark:bg-[#282824]/90">
                          <p className="text-xs font-semibold text-foreground dark:text-surface-warm-white">
                            {draggedComposerFileCount > 1
                              ? `Lepaskan ${draggedComposerFileCount} gambar di sini`
                              : "Lepaskan 1 gambar di sini"}
                          </p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground dark:text-surface-warm-white/60">
                            JPG, JPEG, PNG, atau WebP (maks. 5 MB)
                          </p>
                        </div>
                      ) : null}
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
                            : buildComplete
                              ? "Ceritakan perubahan yang kamu mau..."
                              : "Tulis pesan atau kebutuhanmu di sini..."
                        }
                        className="w-full resize-none bg-transparent px-1 py-1 text-sm leading-6 text-foreground outline-none [scrollbar-width:none] placeholder:text-muted-foreground disabled:opacity-60 [&::-webkit-scrollbar]:hidden"
                        disabled={
                          sessionExpired || authStatus !== "authenticated"
                        }
                      />
                      <div className="mt-2 flex items-center justify-between gap-3 border-t border-black/10 pt-2 dark:border-white/10">
                        {preflightBlockedByCard ? (
                          <span />
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => void handlePrimaryComposerAction()}
                            disabled={
                              isBuilding ||
                              isProcessing ||
                              isSubmittingTurn ||
                              readOnly ||
                              Boolean(message.trim()) ||
                              pendingAttachments.length > 0
                            }
                            className="h-8 rounded-lg border-black/15 bg-white px-3 text-xs font-medium text-foreground hover:bg-black/5 hover:text-foreground active:scale-95 disabled:cursor-not-allowed disabled:opacity-45 dark:border-white/15 dark:bg-white/5 dark:hover:bg-white/10 cursor-pointer"
                          >
                            {buildComplete
                              ? "Perbarui website"
                              : "Buat Website"}
                          </Button>
                        )}
                        <div className="flex items-center gap-1.5">
                          {composerUploadsEnabled ? (
                            <ComposerAttachButton
                              attachments={pendingAttachments}
                              onAdd={(next, rejected, unaccepted) => {
                                if (unaccepted?.length) {
                                  toast.error(
                                    "Hanya format JPG, JPEG, PNG, dan WebP yang diperbolehkan.",
                                  );
                                }
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
                              pendingAttachments.some(
                                (a) => a.status === "uploading",
                              )
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
}
