import { type UIMessage } from "ai";

import type { SoftFieldId } from "@/lib/projects/brief-rich-fields";

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

  return value
    .map(sanitizeStoredUiMessage)
    .filter(isUiMessage)
    .slice(-MAX_STORED_MESSAGES);
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
  fieldState,
  memoryFacts,
  messages,
  summary,
}: {
  fieldState?: FieldStateMap;
  memoryFacts: ProjectMemoryFacts;
  messages: UIMessage[];
  summary: ProjectChatSummary;
}): ProjectChatContext {
  const recentMessages = getProjectChatContext(messages);
  const fieldStateBlock = buildFieldStateBlock(fieldState ?? {});
  const systemContext = [
    summary.text
      ? `Hidden previous chat summary:\n${summary.text}`
      : "Hidden previous chat summary: none.",
    memoryFacts.facts.length
      ? `Important facts:\n${formatBullets(memoryFacts.facts)}`
      : "Important facts: none.",
    memoryFacts.decisions.length
      ? `Agreed decisions:\n${formatBullets(memoryFacts.decisions)}`
      : "Agreed decisions: none.",
    memoryFacts.preferences.length
      ? `User preferences:\n${formatBullets(memoryFacts.preferences)}`
      : "User preferences: none.",
    fieldStateBlock ? `Field state:\n${fieldStateBlock}` : "Field state: none.",
    "Use this hidden context to keep the conversation coherent. Do not mention internal summaries/facts to the user unless naturally relevant.",
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

export function dedupeUiMessages(messages: UIMessage[]): UIMessage[] {
  const seen = new Set<string>();
  return messages.filter((message) => {
    const text = getTextFromUIMessage(message);
    const key = message.id || `${message.role}:${text}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function sanitizeStoredUiMessage(value: unknown): unknown {
  if (!value || typeof value !== "object") {
    return value;
  }

  const message = value as Partial<UIMessage>;

  if (!Array.isArray(message.parts)) {
    return value;
  }

  const parts = message.parts.filter((part) => {
    if (message.role === "assistant") {
      const state = (part as { state?: unknown }).state;

      if (part.type === "reasoning" || part.type === "step-start") {
        return false;
      }

      if (part.type === "text") {
        return !state || state === "done";
      }

      if (part.type.startsWith("tool-")) {
        return state === "output-available";
      }
    }

    return true;
  });

  return { ...message, parts };
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
    Array.isArray(message.parts) &&
    message.parts.length > 0
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

export type FieldState = "asked" | "answered" | "declined" | "explicitly_empty";

export type FieldStateMap = Partial<Record<SoftFieldId, FieldState>>;

export function recordFieldAsk(
  map: FieldStateMap,
  field: SoftFieldId,
): FieldStateMap {
  const current = map[field];
  if (
    current === "answered" ||
    current === "declined" ||
    current === "explicitly_empty"
  ) {
    return map;
  }
  return { ...map, [field]: "asked" };
}

export function recordFieldAnswer(
  map: FieldStateMap,
  field: SoftFieldId,
): FieldStateMap {
  return { ...map, [field]: "answered" };
}

export function recordFieldDecline(
  map: FieldStateMap,
  field: SoftFieldId,
): FieldStateMap {
  const current = map[field];
  if (current === "answered") {
    return map;
  }
  return { ...map, [field]: "declined" };
}

export function recordFieldEmpty(
  map: FieldStateMap,
  field: SoftFieldId,
): FieldStateMap {
  const current = map[field];
  if (current === "answered") {
    return map;
  }
  return { ...map, [field]: "explicitly_empty" };
}

export function summarizeFieldState(map: FieldStateMap) {
  const answered: SoftFieldId[] = [];
  const declined: SoftFieldId[] = [];
  const empty: SoftFieldId[] = [];
  const asked: SoftFieldId[] = [];
  for (const [field, state] of Object.entries(map) as Array<
    [SoftFieldId, FieldState]
  >) {
    if (state === "answered") {
      answered.push(field);
    } else if (state === "declined") {
      declined.push(field);
    } else if (state === "explicitly_empty") {
      empty.push(field);
    } else {
      asked.push(field);
    }
  }
  return { answered, declined, empty, asked };
}

export function buildFieldStateBlock(map: FieldStateMap): string {
  const summary = summarizeFieldState(map);
  const lines: string[] = [];
  for (const field of summary.answered) {
    lines.push(`${field}: answered`);
  }
  for (const field of summary.declined) {
    lines.push(`${field}: declined`);
  }
  for (const field of summary.empty) {
    lines.push(`${field}: explicitly_empty`);
  }
  for (const field of summary.asked) {
    lines.push(`${field}: asked`);
  }
  return lines.join("\n");
}
