import { type UIMessage } from "ai";

import type { SoftFieldId } from "@/lib/projects/brief-rich-fields";

import {
  getRenderableFactEntries,
  normalizeFactLedger,
  type FactLedger,
} from "@/lib/projects/fact-ledger";

const MAX_STORED_MESSAGES = 2000;
export const CHAT_CONTEXT_TOKEN_BUDGET = 300_000;
export const MAX_OWNER_MEMORY_MESSAGES = 24;
export const CHAT_PAGE_SIZE = 20;

export type ProjectChatSummary = {
  compactedMessageCount: number;
  compactedThroughMessageId: string;
  text: string;
  updatedAt: string;
  version: 1;
};

export type ProjectMemoryFacts = {
  decisions: string[];
  facts: string[];
  ownerNotes: string[];
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

export function estimateUIMessageTokens(messages: UIMessage[]): number {
  let characters = 8;
  for (const message of messages) {
    characters += JSON.stringify(message.parts ?? []).length;
  }
  return Math.ceil(characters / 4);
}

export function getProjectChatContext(messages: UIMessage[]) {
  let keptTokens = 0;
  let start = messages.length;
  while (start > 0) {
    const cost = estimateUIMessageTokens([messages[start - 1]!]);
    if (keptTokens > 0 && keptTokens + cost > CHAT_CONTEXT_TOKEN_BUDGET) {
      break;
    }
    keptTokens += cost;
    start -= 1;
  }
  const recent = messages.slice(start);
  return recent[0]?.role === "assistant" ? recent.slice(1) : recent;
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
    compactedThroughMessageId: stringValue(input.compactedThroughMessageId),
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
    ownerNotes: stringArrayValue(
      input.ownerNotes,
      MAX_OWNER_MEMORY_MESSAGES,
      480,
    ),
    preferences: stringArrayValue(input.preferences, 24),
    updatedAt: stringValue(input.updatedAt),
  };
}

export type ProjectChatState = {
  memoryFacts: ProjectMemoryFacts;
  messages: UIMessage[];
  summary: ProjectChatSummary;
};

export function resolveProjectChatState({
  chatMessages,
  chatSummary,
  memoryFacts,
  fallback,
}: {
  chatMessages: unknown;
  chatSummary: unknown;
  memoryFacts: unknown;
  fallback?: {
    messages?: unknown;
    summary?: unknown;
    memoryFacts?: unknown;
  };
}): ProjectChatState {
  const messages = parseProjectChatMessages(chatMessages);
  const fallbackMessages = parseProjectChatMessages(fallback?.messages);
  const summary = parseProjectChatSummary(chatSummary);
  const fallbackSummary = parseProjectChatSummary(fallback?.summary);
  const currentFacts = parseProjectMemoryFacts(memoryFacts);
  const fallbackFacts = parseProjectMemoryFacts(fallback?.memoryFacts);

  return {
    messages: messages.length ? messages : fallbackMessages,
    summary: hasSummaryData(summary) ? summary : fallbackSummary,
    memoryFacts: mergeProjectMemoryFacts(currentFacts, fallbackFacts),
  };
}

export function buildProjectChatContext({
  factLedger,
  fieldState,
  memoryFacts,
  messages,
  summary,
}: {
  factLedger?: FactLedger;
  fieldState?: FieldStateMap;
  memoryFacts: ProjectMemoryFacts;
  messages: UIMessage[];
  summary: ProjectChatSummary;
}): ProjectChatContext {
  const recentMessages = getProjectChatContext(messages);
  const olderOwnerMessages = getOlderOwnerMessages(messages, recentMessages);
  const ownerNotes = dedupeStrings(
    [...memoryFacts.ownerNotes, ...olderOwnerMessages],
    MAX_OWNER_MEMORY_MESSAGES * 2,
    480,
  ).slice(-MAX_OWNER_MEMORY_MESSAGES);
  const fieldStateBlock = buildFieldStateBlock(fieldState ?? {});
  const confirmedFacts = formatConfirmedFactLedger(factLedger);
  const systemContext = [
    summary.text
      ? `Hidden previous chat summary:\n${summary.text}`
      : "Hidden previous chat summary: none.",
    confirmedFacts
      ? `Owner-confirmed facts (authoritative):\n${confirmedFacts}`
      : "Owner-confirmed facts (authoritative): none.",
    ownerNotes.length
      ? `Earlier owner statements (context, not a fact ledger):\n${formatBullets(ownerNotes)}`
      : "Earlier owner statements: none.",
    memoryFacts.facts.length
      ? `Important facts from prior memory (verify against the brief):\n${formatBullets(memoryFacts.facts)}`
      : "Important facts from prior memory: none.",
    memoryFacts.decisions.length
      ? `Agreed decisions:\n${formatBullets(memoryFacts.decisions)}`
      : "Agreed decisions: none.",
    memoryFacts.preferences.length
      ? `User preferences:\n${formatBullets(memoryFacts.preferences)}`
      : "User preferences: none.",
    fieldStateBlock ? `Field state:\n${fieldStateBlock}` : "Field state: none.",
    "Use this hidden context to keep the conversation coherent. The owner-confirmed facts and current brief outrank prior memory. Do not mention internal summaries or ledgers to the user unless naturally relevant.",
  ].join("\n\n");

  return { messages: recentMessages, systemContext };
}

export function formatProjectDiscussionContext(value: unknown): string {
  const source = isRecord(value) ? value : {};
  return buildCompactDiscussionContext({
    memoryFacts: parseProjectMemoryFacts(source.memoryFacts),
    messages: parseProjectChatMessages(source.messages),
    summary: parseProjectChatSummary(source.summary),
  });
}

export function buildCompactDiscussionContext({
  factLedger,
  memoryFacts,
  messages,
  summary,
}: {
  factLedger?: FactLedger;
  memoryFacts: ProjectMemoryFacts;
  messages: UIMessage[];
  summary: ProjectChatSummary;
}): string {
  const recentMessages =
    getProjectChatContext(messages).flatMap(compactMessage);
  const ownerMessages = dedupeStrings(
    [
      ...memoryFacts.ownerNotes,
      ...getOlderOwnerMessages(messages, getProjectChatContext(messages)),
    ],
    MAX_OWNER_MEMORY_MESSAGES * 2,
    480,
  ).slice(-MAX_OWNER_MEMORY_MESSAGES);
  const confirmedFacts = formatConfirmedFactLedger(factLedger);

  return JSON.stringify({
    confirmedFacts: confirmedFacts || null,
    memory: {
      decisions: memoryFacts.decisions,
      facts: memoryFacts.facts,
      preferences: memoryFacts.preferences,
    },
    ownerMessages,
    recentMessages,
    summary: summary.text || null,
  });
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
    compactedThroughMessageId: "",
    updatedAt: "",
  };
}

export function createEmptyMemoryFacts(): ProjectMemoryFacts {
  return {
    version: 1,
    facts: [],
    decisions: [],
    ownerNotes: [],
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
  const deduped = messages.filter((message) => {
    const text = getTextFromUIMessage(message);
    const key = message.id || `${message.role}:${text}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });

  return normalizeModelMessages(deduped);
}

function normalizeModelMessages(messages: UIMessage[]): UIMessage[] {
  if (messages.length === 0) {
    return [];
  }

  const normalized: UIMessage[] = [messages[0]!];

  for (let i = 1; i < messages.length; i++) {
    const current = messages[i]!;
    const previous = normalized[normalized.length - 1]!;

    if (current.role === previous.role) {
      // Merge consecutive same-role messages into the previous one
      previous.parts = [...previous.parts, ...current.parts];
      // Discard empty text parts created during merge
      previous.parts = previous.parts.filter(
        (p) => p.type !== "text" || (p.type === "text" && p.text.trim()),
      );
    } else {
      normalized.push({ ...current, parts: [...current.parts] });
    }
  }

  return normalized;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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

function hasSummaryData(summary: ProjectChatSummary): boolean {
  return Boolean(
    summary.text ||
    summary.compactedMessageCount ||
    summary.compactedThroughMessageId ||
    summary.updatedAt,
  );
}

function mergeProjectMemoryFacts(
  current: ProjectMemoryFacts,
  fallback: ProjectMemoryFacts,
): ProjectMemoryFacts {
  return {
    version: 1,
    facts: mergeMemoryStrings(current.facts, fallback.facts, 24, 280),
    decisions: mergeMemoryStrings(
      current.decisions,
      fallback.decisions,
      24,
      280,
    ),
    ownerNotes: mergeMemoryStrings(
      current.ownerNotes,
      fallback.ownerNotes,
      MAX_OWNER_MEMORY_MESSAGES,
      480,
    ),
    preferences: mergeMemoryStrings(
      current.preferences,
      fallback.preferences,
      24,
      280,
    ),
    updatedAt: current.updatedAt || fallback.updatedAt,
  };
}

function mergeMemoryStrings(
  current: string[],
  fallback: string[],
  maxItems: number,
  maxLength: number,
): string[] {
  return dedupeStrings([...current, ...fallback], maxItems, maxLength);
}

function compactMessage(message: UIMessage): {
  id: string;
  role: UIMessage["role"];
  text: string;
}[] {
  const text = getTextFromUIMessage(message);
  return text ? [{ id: message.id, role: message.role, text }] : [];
}

function getOlderOwnerMessages(
  messages: UIMessage[],
  recentMessages: UIMessage[],
): string[] {
  const recentIds = new Set(recentMessages.map((message) => message.id));
  return messages
    .filter((message) => message.role === "user" && !recentIds.has(message.id))
    .map(getTextFromUIMessage)
    .filter(Boolean)
    .slice(-MAX_OWNER_MEMORY_MESSAGES);
}

function formatConfirmedFactLedger(factLedger: FactLedger | undefined): string {
  return getRenderableFactEntries(normalizeFactLedger(factLedger))
    .map((entry) => `- ${entry.label}: ${formatFactValue(entry.value)}`)
    .join("\n");
}

function formatFactValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value) ?? "(empty)";
  } catch {
    return "(unavailable)";
  }
}

function dedupeStrings(
  items: string[],
  maxItems: number,
  maxLength: number,
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const value = item.trim().replace(/\s+/g, " ").slice(0, maxLength);
    const key = value.toLocaleLowerCase("id-ID");
    if (!value || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(value);
    if (result.length >= maxItems) {
      break;
    }
  }
  return result;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}

function stringArrayValue(value: unknown, maxItems: number, maxLength = 280) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().replace(/\s+/g, " ").slice(0, maxLength))
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
