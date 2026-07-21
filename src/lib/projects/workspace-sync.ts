import { type UIMessage } from "ai";

import { DISCUSS_CARD_SERVER_DEADLINE_MS } from "@/lib/ai-timeouts";
import { type WorkspaceCard } from "@/lib/projects/brief";

export type WorkspaceChatStatus =
  "error" | "ready" | "streaming" | "submitted" | string;

export function shouldRefreshWorkspaceAfterChatStatus(
  previous: WorkspaceChatStatus,
  next: WorkspaceChatStatus,
) {
  return (
    (previous === "submitted" || previous === "streaming") &&
    (next === "ready" || next === "error")
  );
}

export function getBuildRecommendationHoldSignature(card: WorkspaceCard) {
  if (card.type !== "build_recommendation") {
    return "";
  }

  return JSON.stringify([card.title, card.summary]);
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
  // A build_recommendation signature that has already been used to start a
  // build must never resurface — even if the build subsequently failed or
  // succeeded. Retry uses the dedicated "Build ulang" CTA, not this card.
  const cardConsumed = isBuildRecommendationConsumed(card, consumedSignatures);
  const heldEffective = held && !cardConsumed;

  if (buildComplete) {
    if (hasFailedLatestAttemptWithLastGood && !postBuildChatOpen) {
      return "build_failed_with_last_good";
    }

    // After a successful build, "Chat dengan AI" opens discuss first.
    // A held build_recommendation stays out of the way until the user
    // re-opens it or discuss produces a fresh recommendation signature.
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
  // assistant response here reopens the already-answered stale card whenever
  // the provider or repair call fails.
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
        "Tampilan website belum bisa dimuat. Coba muat ulang tampilan atau build ulang kalau masih gagal.",
      ),
      title: "Tampilan website belum bisa dimuat",
    };
  }

  if (runtimeUserFacingState === "building") {
    return {
      detail: "Tampilan website akan muncul setelah build selesai.",
      title: "Build website sedang berjalan",
    };
  }

  if (runtimeUserFacingState === "build_failed_without_last_good") {
    return {
      detail:
        "Build website belum berhasil dan belum ada tampilan sebelumnya. Tekan Build ulang untuk mencoba lagi.",
      title: "Build website belum selesai",
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
    // still needs an explicit rebuild CTA — runtime canRetry used to be false.
    if (
      buildStatus === "failed" ||
      sourceStatus === "failed" ||
      runtimeBuildStatus === "failed"
    ) {
      return {
        detail:
          "File website belum berhasil dibuild. Tekan Build ulang — brief yang sudah siap tetap dipakai.",
        title: "Build website belum selesai",
      };
    }
  }

  // A successful artifact can cold-start again through the preview route.
  // Keep the iframe loading instead of making users recover a transient runtime.
  if (
    (runtimeUserFacingState === "preview_failed" ||
      deploymentStatus === "failed") &&
    !hasLastGoodPreview
  ) {
    return {
      detail:
        "Tampilan website gagal dimuat. Coba muat ulang tampilan atau build ulang kalau masih gagal.",
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
// card (DISCUSS_CARD_SERVER_DEADLINE_MS — repair attempts included), plus
// headroom for network latency. Giving up sooner than the server can
// legitimately still be working shows a false "belum berhasil" error while
// a real answer is still on its way.
export const PREPARING_TIMEOUT_MS = DISCUSS_CARD_SERVER_DEADLINE_MS + 15_000;

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
