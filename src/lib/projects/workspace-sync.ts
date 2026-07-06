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
