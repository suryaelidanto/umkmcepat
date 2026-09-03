import { type UIMessage } from "ai";

import { DISCUSS_CARD_SERVER_DEADLINE_MS } from "@/lib/ai/ai-timeouts";
import { type WorkspaceCard } from "@/lib/projects/brief";

export type WorkspaceChatStatus =
  "error" | "ready" | "streaming" | "submitted" | string;

const ACTIVE_PROJECT_JOB_PHASES = new Set([
  "building",
  "finalizing",
  "generating",
]);
const ACTIVE_PROJECT_DEPLOYMENT_STATUSES = new Set(["created", "starting"]);
const ACTIVE_PROJECT_ATTEMPT_STATUSES = new Set([
  "building",
  "editing",
  "generating",
  "queued",
  "received",
  "repairing",
  "running",
]);

export function getProjectRuntimePollInterval(
  state:
    | {
        activeJob?: { phase?: string | null } | null;
        deployment?: { status?: string | null } | null;
        latestAttempt?: { status?: string | null } | null;
      }
    | null
    | undefined,
): number | false {
  return ACTIVE_PROJECT_JOB_PHASES.has(state?.activeJob?.phase ?? "") ||
    ACTIVE_PROJECT_DEPLOYMENT_STATUSES.has(state?.deployment?.status ?? "") ||
    ACTIVE_PROJECT_ATTEMPT_STATUSES.has(state?.latestAttempt?.status ?? "")
    ? 2_000
    : false;
}

export function shouldRefreshWorkspaceAfterChatStatus(
  previous: WorkspaceChatStatus,
  next: WorkspaceChatStatus,
) {
  return (
    (previous === "submitted" || previous === "streaming") &&
    (next === "ready" || next === "error")
  );
}

// Render-equivalence for two chat message arrays. `reloadLatestChat` does a
export function messagesEqualForRender(
  current: UIMessage[],
  incoming: UIMessage[],
) {
  if (current === incoming) {
    return true;
  }
  if (current.length !== incoming.length) {
    return false;
  }

  for (let index = 0; index < current.length; index += 1) {
    const a = current[index];
    const b = incoming[index];
    if (!a || !b) {
      return false;
    }
    if (a.id !== b.id || a.role !== b.role) {
      return false;
    }
    if (a.parts.length !== b.parts.length) {
      return false;
    }
    if (lastMessageTextSignature(a) !== lastMessageTextSignature(b)) {
      return false;
    }
    if (lastToolCardSignature(a) !== lastToolCardSignature(b)) {
      return false;
    }
  }

  return true;
}

function lastMessageTextSignature(message: UIMessage) {
  for (let index = message.parts.length - 1; index >= 0; index -= 1) {
    const part = message.parts[index];
    if (part.type === "text") {
      return part.text ?? "";
    }
  }
  return "";
}

function lastToolCardSignature(message: UIMessage) {
  for (let index = message.parts.length - 1; index >= 0; index -= 1) {
    const part = message.parts[index] as {
      type?: string;
      state?: string;
      toolCallId?: string;
      output?: { workspaceCard?: unknown };
    };
    if (part.type?.startsWith("tool-")) {
      return `${part.type}:${part.state ?? ""}:${part.toolCallId ?? ""}`;
    }
  }
  return "";
}

export function getBuildRecommendationHoldSignature(card: WorkspaceCard) {
  if (card.type !== "build_recommendation") {
    return "";
  }

  const c = card as {
    title: string;
    summary: string[];
    handoffId?: string;
    reviewHash?: string;
  };
  return JSON.stringify([
    c.title,
    c.summary,
    c.handoffId ?? null,
    c.reviewHash ?? null,
  ]);
}

export function getBuildOperationCardTransition(card: WorkspaceCard): {
  consumedSignature: string | null;
  workspaceCard: { type: "none" };
} {
  const signature = getBuildRecommendationHoldSignature(card);
  return {
    consumedSignature: signature || null,
    workspaceCard: { type: "none" },
  };
}

export function isBuildRecommendationHeld(
  card: WorkspaceCard,
  heldSignature: string | null,
) {
  return (
    Boolean(heldSignature) &&
    heldSignature === getBuildRecommendationHoldSignature(card)
  );
}

export function isWorkspaceBuildComplete({
  buildStatus,
  runtimeBuildStatus,
  sourceStatus,
}: {
  buildStatus?: string | null;
  runtimeBuildStatus?: string | null;
  sourceStatus?: string | null;
}) {
  return [buildStatus, runtimeBuildStatus, sourceStatus].some((status) =>
    ["passed", "ready", "succeeded"].includes(status ?? ""),
  );
}

export type WorkspaceComposerState =
  | "question"
  | "build_recommendation"
  | "held_build_recommendation"
  | "build_retry"
  | "build_failed_with_last_good"
  | "post_build_review"
  | "post_build_chat"
  | "free_chat";

export function isBuildRecommendationConsumed(
  card: WorkspaceCard,
  consumedSignatures: ReadonlySet<string> | Iterable<string> | null | undefined,
): boolean {
  if (card.type !== "build_recommendation" || !consumedSignatures) {
    return false;
  }
  const set =
    consumedSignatures instanceof Set
      ? consumedSignatures
      : new Set(consumedSignatures);
  return set.has(getBuildRecommendationHoldSignature(card));
}

export function getWorkspaceComposerState({
  buildComplete,
  card,
  consumedSignatures,
  hasFailedLatestAttemptWithLastGood = false,
  held,
  postBuildChatOpen,
}: {
  buildComplete: boolean;
  card: WorkspaceCard;
  consumedSignatures?: ReadonlySet<string> | Iterable<string> | null;
  hasFailedLatestAttemptWithLastGood?: boolean;
  held: boolean;
  postBuildChatOpen: boolean;
}): WorkspaceComposerState {
  if (card.type === "build_retry") {
    return "build_retry";
  }

  // A build_recommendation signature that has already been used to start a
  const cardConsumed = isBuildRecommendationConsumed(card, consumedSignatures);
  const heldEffective = held && !cardConsumed;

  if (buildComplete) {
    if (hasFailedLatestAttemptWithLastGood && !postBuildChatOpen) {
      return "build_failed_with_last_good";
    }

    // First-build recommendations are stale after the website exists.
    if (card.type === "build_recommendation" && !card.postBuildUpdate) {
      return postBuildChatOpen ? "post_build_chat" : "post_build_review";
    }

    // After a successful build, "Chat dengan AI" opens discuss first.
    if (postBuildChatOpen) {
      if (card.type === "build_recommendation" && heldEffective) {
        return "held_build_recommendation";
      }

      if (card.type === "build_recommendation" && !cardConsumed) {
        return "build_recommendation";
      }

      if (card.type === "question") {
        return "question";
      }

      return "post_build_chat";
    }

    if (card.type === "build_recommendation" && !cardConsumed) {
      return heldEffective
        ? "held_build_recommendation"
        : "build_recommendation";
    }

    return "post_build_review";
  }

  if (card.type === "build_recommendation" && heldEffective) {
    return "held_build_recommendation";
  }

  if (card.type === "build_recommendation" && !cardConsumed) {
    return "build_recommendation";
  }

  if (card.type === "question") {
    return "question";
  }

  return "free_chat";
}

export function hasAnsweredWorkspaceQuestion({
  card,
  messages,
  mode,
}: {
  card: WorkspaceCard;
  messages: UIMessage[];
  mode: string;
}) {
  if (mode !== "discuss" || card.type !== "question") {
    return false;
  }

  const latestUserIndex = findLastIndex(
    messages,
    (message) => message.role === "user",
  );

  if (latestUserIndex < 0) {
    return false;
  }

  const latestUserText = getUiMessageText(messages[latestUserIndex]);
  const answeredQuestion = latestUserText.split(/\nJawaban:/i)[0]?.trim();

  const cardQuestions = [card.question.question.trim()];

  if (!answeredQuestion || !cardQuestions.includes(answeredQuestion)) {
    return false;
  }

  // A submitted answer invalidates its card immediately. Waiting for an
  return true;
}

function findLastIndex<T>(items: T[], predicate: (item: T) => boolean) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index])) {
      return index;
    }
  }

  return -1;
}

function getUiMessageText(message: UIMessage) {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}

const AI_TRANSPORT_ERROR_PATTERN =
  /^\[[\s\S]*?\b(?:error|failure|exception|retry|rate[-_ ]?limit)\b[\s\S]*\]$/i;

export function isUserVisibleAssistantText(text: string) {
  const value = text.trim();

  return Boolean(value) && !AI_TRANSPORT_ERROR_PATTERN.test(value);
}

export function shouldShowBuildRecommendationComposer({
  buildComplete,
  card,
  held,
}: {
  buildComplete: boolean;
  card: WorkspaceCard;
  held: boolean;
}) {
  return (
    getWorkspaceComposerState({
      buildComplete,
      card,
      held,
      postBuildChatOpen: false,
    }) === "build_recommendation"
  );
}

export function shouldUseGeneratedPreviewFrame({
  buildComplete,
  sourceStatus,
}: {
  buildComplete: boolean;
  sourceStatus?: string | null;
}) {
  return (
    buildComplete ||
    sourceStatus === "passed" ||
    sourceStatus === "succeeded" ||
    sourceStatus === "ready"
  );
}

export type WorkspacePreviewIssue = {
  detail: string;
  title: string;
};

// Bounded number of silent iframe reloads the preview loader tolerates before
export const PREVIEW_STUCK_MAX_ATTEMPTS = 3;

export function previewReadyState({
  readyReached,
  silentRecoveries,
}: {
  readyReached: boolean;
  silentRecoveries: number;
}): "loading" | "ready" | "stuck" {
  if (readyReached) {
    return "ready";
  }
  return silentRecoveries >= PREVIEW_STUCK_MAX_ATTEMPTS ? "stuck" : "loading";
}

export function getWorkspacePreviewIssue({
  buildStatus,
  deploymentStatus,
  runtimeBuildStatus,
  runtimeError,
  runtimeUserFacingState,
  sourceStatus,
}: {
  buildStatus?: string | null;
  deploymentStatus?: string | null;
  runtimeBuildStatus?: string | null;
  runtimeError?: string | null;
  runtimeUserFacingState?: string | null;
  sourceStatus?: string | null;
}): WorkspacePreviewIssue | null {
  if (runtimeError) {
    return {
      detail: getSafePreviewIssueDetail(
        runtimeError,
        "Tampilan website belum bisa dimuat. Coba muat ulang tampilan atau buat ulang website kalau masih gagal.",
      ),
      title: "Tampilan website belum bisa dimuat",
    };
  }

  if (runtimeUserFacingState === "building") {
    // The server retains the last successful preview during active builds.
    const hasLastGoodPreview = [runtimeBuildStatus, sourceStatus].some(
      (status) => ["passed", "ready", "succeeded"].includes(status ?? ""),
    );
    if (hasLastGoodPreview) {
      return null; // Client will render old preview + progress banner
    }
    return {
      detail: "Tampilan website akan muncul setelah pembuatan selesai.",
      title: "Website sedang dibuat",
    };
  }

  if (runtimeUserFacingState === "build_failed_without_last_good") {
    return {
      detail:
        "Website belum berhasil dibuat dan belum ada tampilan sebelumnya. Tekan Buat ulang website untuk mencoba lagi.",
      title: "Website belum selesai",
    };
  }

  const hasLastGoodPreview = [runtimeBuildStatus, sourceStatus].some((status) =>
    ["passed", "ready", "succeeded"].includes(status ?? ""),
  );

  if (
    !hasLastGoodPreview &&
    (buildStatus === "failed" ||
      sourceStatus === "failed" ||
      runtimeUserFacingState === "not_built")
  ) {
    // not_built with local/source failed (or empty builds after agent fail)
    if (
      buildStatus === "failed" ||
      sourceStatus === "failed" ||
      runtimeBuildStatus === "failed"
    ) {
      return {
        detail:
          "File website belum berhasil dibuat. Tekan Buat ulang website — brief yang sudah siap tetap dipakai.",
        title: "Website belum selesai",
      };
    }
  }

  // A successful artifact can cold-start again through the preview route.
  if (
    (runtimeUserFacingState === "preview_failed" ||
      deploymentStatus === "failed") &&
    !hasLastGoodPreview
  ) {
    return {
      detail:
        "Tampilan website gagal dimuat. Coba muat ulang tampilan atau buat ulang website kalau masih gagal.",
      title: "Tampilan website gagal dimuat",
    };
  }

  return null;
}

function getSafePreviewIssueDetail(value: string, fallback: string) {
  const detail = value.trim().replace(/\s+/g, " ");

  if (!detail) {
    return fallback;
  }

  if (
    detail.length > 240 ||
    /\b(error|stack|webpack|module|prisma|syntaxerror|typeerror|referenceerror)\b/i.test(
      detail,
    ) ||
    /(?:^|\s)at\s+\S+/i.test(detail)
  ) {
    return fallback;
  }

  return detail;
}

export const PREPARING_POLL_INTERVAL_MS = 2000;
// Must exceed the server's own worst-case deadline for producing the next
export const PREPARING_TIMEOUT_MS = DISCUSS_CARD_SERVER_DEADLINE_MS + 15_000;

export function shouldRehydrateWorkspaceCardFromMessages({
  buildComplete,
  card,
  previous,
}: {
  buildComplete: boolean;
  card: WorkspaceCard;
  previous: WorkspaceCard;
}) {
  return !(
    buildComplete &&
    previous.type === "none" &&
    card.type === "build_recommendation"
  );
}

export function isFreshWorkspaceCard(
  next: WorkspaceCard,
  previous: WorkspaceCard,
) {
  if (next.type === "none") {
    return false;
  }

  if (next.type !== previous.type) {
    return true;
  }

  if (next.type === "question" && previous.type === "question") {
    return next.question.id !== previous.question.id;
  }

  if (
    next.type === "build_recommendation" &&
    previous.type === "build_recommendation"
  ) {
    return (
      getBuildRecommendationHoldSignature(next) !==
      getBuildRecommendationHoldSignature(previous)
    );
  }

  return false;
}

const PRESENT_WORKSPACE_CARD_TOOL_TYPE = "tool-presentWorkspaceCard";

export function getWorkspaceCardFromMessages(messages: UIMessage[]): {
  projectTitle?: string;
  workspaceCard: WorkspaceCard;
} | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "assistant") {
      continue;
    }

    const sessionLogPart = message.parts.find((part) => {
      const candidate = part as { type?: string };
      return candidate.type === "data-buildSessionLog";
    }) as
      | {
          data?: { failed?: unknown; stopped?: unknown };
          type?: string;
        }
      | undefined;
    if (
      sessionLogPart?.data?.failed === false &&
      sessionLogPart.data.stopped !== true
    ) {
      return null;
    }

    for (
      let partIndex = message.parts.length - 1;
      partIndex >= 0;
      partIndex -= 1
    ) {
      const part = message.parts[partIndex] as {
        type?: string;
        state?: string;
        output?: {
          projectTitle?: unknown;
          workspaceCard?: WorkspaceCard;
        };
        toolInvocation?: {
          toolName?: string;
          state?: string;
          output?: {
            projectTitle?: unknown;
            workspaceCard?: WorkspaceCard;
          };
        };
      };

      const isPresentCardTool =
        part.type === PRESENT_WORKSPACE_CARD_TOOL_TYPE ||
        part.toolInvocation?.toolName === "presentWorkspaceCard";
      if (!isPresentCardTool) {
        continue;
      }

      const state = part.state || part.toolInvocation?.state;
      if (state !== "output-available") {
        continue;
      }

      const output = part.output || part.toolInvocation?.output;
      const card = output?.workspaceCard;
      if (!card || typeof card !== "object") {
        continue;
      }
      // Terminal clear: do not resurrect older build_recommendation / question
      if (card.type === "none") {
        return null;
      }

      return {
        workspaceCard: card,
        projectTitle:
          typeof output?.projectTitle === "string"
            ? output.projectTitle
            : undefined,
      };
    }
  }

  return null;
}
