import { type UIMessage } from "ai";

import { type WorkspaceCard } from "@/lib/projects/brief";

export type WorkspaceChatStatus =
  | "error"
  | "ready"
  | "streaming"
  | "submitted"
  | string;

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
  | "brief_review"
  | "build_recommendation"
  | "held_build_recommendation"
  | "build_failed_with_last_good"
  | "post_build_review"
  | "post_build_chat"
  | "free_chat";

export function getWorkspaceComposerState({
  buildComplete,
  card,
  hasFailedLatestAttemptWithLastGood = false,
  held,
  postBuildChatOpen,
}: {
  buildComplete: boolean;
  card: WorkspaceCard;
  hasFailedLatestAttemptWithLastGood?: boolean;
  held: boolean;
  postBuildChatOpen: boolean;
}): WorkspaceComposerState {
  if (buildComplete) {
    if (hasFailedLatestAttemptWithLastGood && !postBuildChatOpen) {
      return "build_failed_with_last_good";
    }

    return postBuildChatOpen ? "post_build_chat" : "post_build_review";
  }

  if (card.type === "build_recommendation" && held) {
    return "held_build_recommendation";
  }

  if (card.type === "build_recommendation") {
    return "build_recommendation";
  }

  if (card.type === "brief_review") {
    return "brief_review";
  }

  if (card.type === "question") {
    return "question";
  }

  return "free_chat";
}

export function hasMissingWorkspaceUiTurn({
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

  if (!answeredQuestion || answeredQuestion !== card.question.question.trim()) {
    return false;
  }

  const messagesAfterUser = messages.slice(latestUserIndex + 1);
  const hasNewerWorkspaceTool = messagesAfterUser.some(hasWorkspaceUiTool);
  const hasAssistantAfterUser = messagesAfterUser.some(
    (message) => message.role === "assistant",
  );

  return hasAssistantAfterUser && !hasNewerWorkspaceTool;
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

function hasWorkspaceUiTool(message: UIMessage) {
  return message.parts.some(
    (part) =>
      part.type === "tool-setWorkspaceUi" &&
      (part as { state?: unknown }).state === "output-available",
  );
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
        "Build website belum berhasil dan belum ada tampilan sebelumnya. Coba build ulang setelah brief siap.",
      title: "Build website belum selesai",
    };
  }

  const hasLastGoodPreview = [runtimeBuildStatus, sourceStatus].some((status) =>
    ["passed", "ready", "succeeded"].includes(status ?? ""),
  );

  if (
    !hasLastGoodPreview &&
    (buildStatus === "failed" || sourceStatus === "failed")
  ) {
    return {
      detail:
        "File website belum berhasil dibuild. Jalankan build ulang setelah brief siap.",
      title: "Build website belum selesai",
    };
  }

  if (
    runtimeUserFacingState === "preview_failed" ||
    deploymentStatus === "failed"
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
