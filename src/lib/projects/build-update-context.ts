import { type UIMessage } from "ai";

import { getTextFromUIMessage, parseProjectChatMessages } from "./chat-memory";

export type BuildCheckpointBoundary = {
  chatMessageId: string | null;
  chatMessageIndex: number | null;
};

export type BuildUpdateContext = {
  baselineMessages: UIMessage[];
  contextMessages: UIMessage[];
  pendingMessages: UIMessage[];
};

export function resolveBuildUpdateContext({
  checkpoint,
  compactedMessageCount,
  fallbackMessages,
  messages,
}: {
  checkpoint: BuildCheckpointBoundary | null;
  compactedMessageCount?: number;
  fallbackMessages: unknown;
  messages: unknown;
}): BuildUpdateContext {
  const currentMessages = parseProjectChatMessages(messages);
  const fallback = parseProjectChatMessages(fallbackMessages);
  const contextMessages = currentMessages.length ? currentMessages : fallback;

  if (!checkpoint?.chatMessageId) {
    return {
      baselineMessages: fallback,
      contextMessages,
      pendingMessages: [],
    };
  }

  const boundaryIndex = currentMessages.findIndex(
    (message) => message.id === checkpoint.chatMessageId,
  );
  if (boundaryIndex < 0) {
    const boundaryWasCompacted =
      checkpoint.chatMessageIndex !== null &&
      compactedMessageCount !== undefined &&
      checkpoint.chatMessageIndex < compactedMessageCount;
    return {
      baselineMessages: fallback,
      contextMessages: mergeMessages(fallback, currentMessages),
      pendingMessages: boundaryWasCompacted ? currentMessages : [],
    };
  }

  return {
    baselineMessages: currentMessages.slice(0, boundaryIndex + 1),
    contextMessages,
    pendingMessages: currentMessages.slice(boundaryIndex + 1),
  };
}

export function collectPendingUpdateInstructions(
  pendingMessages: UIMessage[],
  fallbackInstruction: string,
): string {
  const instructions = pendingMessages
    .filter((message) => message.role === "user")
    .map(getTextFromUIMessage)
    .map((text) => text.trim())
    .filter(Boolean);
  return instructions.length > 0
    ? [...new Set(instructions)].join("\n\n")
    : fallbackInstruction;
}

function mergeMessages(first: UIMessage[], second: UIMessage[]): UIMessage[] {
  const merged = new Map<string, UIMessage>();
  for (const message of [...first, ...second]) {
    merged.set(message.id, message);
  }
  return [...merged.values()];
}
