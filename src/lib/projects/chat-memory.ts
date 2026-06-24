import { type UIMessage } from "ai";

const MAX_STORED_MESSAGES = 200;
export const MAX_CONTEXT_MESSAGES = 10;
export const CHAT_PAGE_SIZE = 20;

export type ProjectChatSummary = {
  compactedMessageCount: number;
  text: string;
  updatedAt: string;
  version: 1;
};

export type ProjectMemoryFacts = {
  decisions: string[];
  facts: string[];
  preferences: string[];
  updatedAt: string;
  version: 1;
};

export type ProjectChatContext = {
  messages: UIMessage[];
  systemContext: string;
};

export function parseProjectChatMessages(value: unknown): UIMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isUiMessage).slice(-MAX_STORED_MESSAGES);
}

export function getProjectChatContext(messages: UIMessage[]) {
  return messages.slice(-MAX_CONTEXT_MESSAGES);
}

export function parseProjectChatSummary(value: unknown): ProjectChatSummary {
  if (!value || typeof value !== "object") {
    return createEmptyChatSummary();
  }

  const input = value as Partial<ProjectChatSummary>;
  return {
    version: 1,
    text: stringValue(input.text),
    compactedMessageCount: numberValue(input.compactedMessageCount),
    updatedAt: stringValue(input.updatedAt),
  };
}

export function parseProjectMemoryFacts(value: unknown): ProjectMemoryFacts {
  if (!value || typeof value !== "object") {
    return createEmptyMemoryFacts();
  }

  const input = value as Partial<ProjectMemoryFacts>;
  return {
    version: 1,
    facts: stringArrayValue(input.facts, 24),
    decisions: stringArrayValue(input.decisions, 24),
    preferences: stringArrayValue(input.preferences, 24),
    updatedAt: stringValue(input.updatedAt),
  };
}

export function buildProjectChatContext({
  memoryFacts,
  messages,
  summary,
}: {
  memoryFacts: ProjectMemoryFacts;
  messages: UIMessage[];
  summary: ProjectChatSummary;
}): ProjectChatContext {
  const recentMessages = getProjectChatContext(messages);
  const systemContext = [
    summary.text
      ? `Ringkasan chat lama yang tidak terlihat user:\n${summary.text}`
      : "Ringkasan chat lama: belum ada.",
    memoryFacts.facts.length
      ? `Fakta penting:\n${formatBullets(memoryFacts.facts)}`
      : "Fakta penting: belum ada.",
    memoryFacts.decisions.length
      ? `Keputusan yang sudah disepakati:\n${formatBullets(memoryFacts.decisions)}`
      : "Keputusan yang sudah disepakati: belum ada.",
    memoryFacts.preferences.length
      ? `Preferensi user:\n${formatBullets(memoryFacts.preferences)}`
      : "Preferensi user: belum ada.",
    "Gunakan konteks tersembunyi ini untuk menjaga percakapan tetap nyambung. Jangan menyebut ringkasan/fakta internal ini ke user kecuali relevan secara natural.",
  ].join("\n\n");

  return { messages: recentMessages, systemContext };
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

export function createEmptyChatSummary(): ProjectChatSummary {
  return {
    version: 1,
    text: "",
    compactedMessageCount: 0,
    updatedAt: "",
  };
}

export function createEmptyMemoryFacts(): ProjectMemoryFacts {
  return {
    version: 1,
    facts: [],
    decisions: [],
    preferences: [],
    updatedAt: "",
  };
}

export function getTextFromUIMessage(message: UIMessage) {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join("\n");
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

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}

function stringArrayValue(value: unknown, maxItems: number) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .slice(0, maxItems);
}

function formatBullets(items: string[]) {
  return items.map((item) => `- ${item}`).join("\n");
}
