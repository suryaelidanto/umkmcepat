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

export function shouldShowBuildRecommendationComposer({
  buildComplete,
  card,
  held,
}: {
  buildComplete: boolean;
  card: WorkspaceCard;
  held: boolean;
}) {
  return card.type === "build_recommendation" && !held && !buildComplete;
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
  runtimeError,
  sourceStatus,
}: {
  buildStatus?: string | null;
  deploymentStatus?: string | null;
  runtimeError?: string | null;
  sourceStatus?: string | null;
}): WorkspacePreviewIssue | null {
  if (runtimeError) {
    return {
      detail: runtimeError,
      title: "Preview belum bisa dimuat",
    };
  }

  if (buildStatus === "failed" || sourceStatus === "failed") {
    return {
      detail:
        "Source website belum berhasil dibuild. Jalankan build ulang setelah brief siap.",
      title: "Build website belum selesai",
    };
  }

  if (deploymentStatus === "failed") {
    return {
      detail:
        "Runtime preview gagal menyala. Coba nyalakan ulang preview atau build ulang jika masih gagal.",
      title: "Runtime preview gagal",
    };
  }

  return null;
}
