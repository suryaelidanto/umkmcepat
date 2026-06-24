import { type UIMessage } from "ai";

const MAX_STORED_MESSAGES = 200;
export const MAX_CONTEXT_MESSAGES = 10;
export const CHAT_PAGE_SIZE = 20;

export function parseProjectChatMessages(value: unknown): UIMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isUiMessage).slice(-MAX_STORED_MESSAGES);
}

export function getProjectChatContext(messages: UIMessage[]) {
  return messages.slice(-MAX_CONTEXT_MESSAGES);
}

export function getProjectChatPage(
  messages: UIMessage[],
  before: number | null,
  limit = CHAT_PAGE_SIZE,
) {
  const safeLimit = Math.min(50, Math.max(1, Math.floor(limit)));
  const end = before === null ? messages.length : Math.max(0, before);
  const start = Math.max(0, end - safeLimit);

  return {
    messages: messages.slice(start, end),
    nextCursor: start > 0 ? start : null,
    hasMore: start > 0,
  };
}

function isUiMessage(value: unknown): value is UIMessage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const message = value as Partial<UIMessage>;
  return (
    typeof message.id === "string" &&
    (message.role === "user" ||
      message.role === "assistant" ||
      message.role === "system") &&
    Array.isArray(message.parts)
  );
}
