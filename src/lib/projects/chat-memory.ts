import { type UIMessage } from "ai";

const MAX_STORED_MESSAGES = 40;
export const MAX_CONTEXT_MESSAGES = 10;

export function parseProjectChatMessages(value: unknown): UIMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isUiMessage).slice(-MAX_STORED_MESSAGES);
}

export function getProjectChatContext(messages: UIMessage[]) {
  return messages.slice(-MAX_CONTEXT_MESSAGES);
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
