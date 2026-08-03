import { type WorkspaceCard } from "@/lib/projects/brief";

export type DiscussSettleToolCard = {
  workspaceCard: WorkspaceCard;
  projectTitle?: string;
};

/**
 * Decide UI settle actions when useChat status returns to ready/error after a
 * discuss turn. Keeps text-only turns from endless "preparing" polling.
 */
export function settleDiscussAfterChatReady(input: {
  toolCard: DiscussSettleToolCard | null;
  lastAssistantHasText: boolean;
  mode: "discuss" | "build";
  answeredPreviousQuestion: boolean;
}): {
  clearPreparing: boolean;
  setCardError: boolean;
  enterPreparingPoll: boolean;
  applyToolCard: boolean;
} {
  const { toolCard, lastAssistantHasText, mode, answeredPreviousQuestion } =
    input;

  if (toolCard && toolCard.workspaceCard.type !== "none") {
    return {
      clearPreparing: true,
      setCardError: false,
      enterPreparingPoll: false,
      applyToolCard: true,
    };
  }

  // Intentional text-only (or none tool): settle; do not invent card error.
  if (lastAssistantHasText) {
    return {
      clearPreparing: true,
      setCardError: false,
      enterPreparingPoll: false,
      applyToolCard: false,
    };
  }

  if (mode === "discuss" && answeredPreviousQuestion) {
    return {
      clearPreparing: false,
      setCardError: false,
      enterPreparingPoll: true,
      applyToolCard: false,
    };
  }

  return {
    clearPreparing: false,
    setCardError: false,
    enterPreparingPoll: false,
    applyToolCard: false,
  };
}
