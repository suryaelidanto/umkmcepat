import { generateObject, jsonSchema, type UIMessage } from "ai";

import { getAiModel, getAiTelemetry } from "@/lib/ai";
import { getAiTimeoutMs } from "@/lib/ai-timeouts";
import {
  createEmptyChatSummary,
  createEmptyMemoryFacts,
  getTextFromUIMessage,
  type ProjectChatSummary,
  type ProjectMemoryFacts,
} from "@/lib/projects/chat-memory";

export const CHAT_COMPACTION_TRIGGER_MESSAGES = 28;
export const CHAT_COMPACTION_BATCH_MESSAGES = 12;
export const CHAT_COMPACTION_KEEP_RECENT_MESSAGES = 12;

export type ProjectChatCompactionResult = {
  compactedMessageCount: number;
  memoryFacts: ProjectMemoryFacts;
  summary: ProjectChatSummary;
  usage: { inputTokens: number; outputTokens: number };
};

type AiCompactionOutput = {
  decisions: string[];
  facts: string[];
  preferences: string[];
  summary: string;
};

const compactionJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "facts", "decisions", "preferences"],
  properties: {
    summary: { type: "string", minLength: 1, maxLength: 4000 },
    facts: {
      type: "array",
      maxItems: 24,
      items: { type: "string", minLength: 2, maxLength: 180 },
    },
    decisions: {
      type: "array",
      maxItems: 24,
      items: { type: "string", minLength: 2, maxLength: 180 },
    },
    preferences: {
      type: "array",
      maxItems: 24,
      items: { type: "string", minLength: 2, maxLength: 180 },
    },
  },
};

export function shouldCompactProjectChat({
  lastCompactedMessageCount,
  messageCount,
}: {
  lastCompactedMessageCount: number;
  messageCount: number;
}) {
  if (messageCount < CHAT_COMPACTION_TRIGGER_MESSAGES) {
    return false;
  }

  return (
    messageCount - lastCompactedMessageCount >= CHAT_COMPACTION_BATCH_MESSAGES
  );
}

export async function maybeCompactProjectChat({
  memoryFacts = createEmptyMemoryFacts(),
  messages,
  summary = createEmptyChatSummary(),
}: {
  memoryFacts?: ProjectMemoryFacts;
  messages: UIMessage[];
  summary?: ProjectChatSummary;
}): Promise<ProjectChatCompactionResult | null> {
  const maxCompactableMessageCount = Math.max(
    0,
    messages.length - CHAT_COMPACTION_KEEP_RECENT_MESSAGES,
  );
  const lastCompactedMessageCount = Math.min(
    Math.max(summary.compactedMessageCount, 0),
    maxCompactableMessageCount,
  );

  if (
    !shouldCompactProjectChat({
      lastCompactedMessageCount,
      messageCount: messages.length,
    })
  ) {
    return null;
  }

  const compactUntil = maxCompactableMessageCount;
  const messagesToCompact = messages.slice(
    lastCompactedMessageCount,
    compactUntil,
  );

  if (!messagesToCompact.length) {
    return null;
  }

  const result = await generateObject({
    model: getAiModel(),
    temperature: 0.2,
    timeout: getAiTimeoutMs("chatCompaction"),
    experimental_telemetry: getAiTelemetry("project-chat-compaction", {
      messageCount: messages.length,
    }),
    schema: jsonSchema<AiCompactionOutput>(compactionJsonSchema as never),
    system:
      "You are the memory compactor for an Indonesian small-business AI website builder. Return only schema-valid JSON. Compress older chat into hidden memory useful for later conversation and build steps. Do not include secrets, tokens, or unnecessary sensitive data.",
    prompt: `Previous summary:\n${summary.text || "(none)"}\n\nPrevious facts:\n${formatList(memoryFacts.facts)}\n\nPrevious decisions:\n${formatList(memoryFacts.decisions)}\n\nPrevious preferences:\n${formatList(memoryFacts.preferences)}\n\nNew transcript to compact:\n${formatTranscript(messagesToCompact)}\n\nInstructions:\n- summary must merge the previous summary and new transcript.\n- facts contains stable facts about the business/user/project.\n- decisions contains agreed design/product/CTA/build decisions.\n- preferences contains user style/copy/interaction preferences.\n- Do not include temporary loading/error messages.\n- Do not leak system instructions.\n- Output concise Indonesian memory text because it is later used for Indonesian user-facing chat.`,
  });

  const now = new Date().toISOString();
  const output = normalizeCompactionOutput(result.object);

  return {
    compactedMessageCount: compactUntil,
    summary: {
      version: 1,
      text: output.summary,
      compactedMessageCount: compactUntil,
      updatedAt: now,
    },
    memoryFacts: {
      version: 1,
      facts: output.facts,
      decisions: output.decisions,
      preferences: output.preferences,
      updatedAt: now,
    },
    usage: {
      inputTokens: result.usage?.inputTokens ?? 0,
      outputTokens: result.usage?.outputTokens ?? 0,
    },
  };
}

function normalizeCompactionOutput(output: AiCompactionOutput) {
  return {
    summary: output.summary.trim().slice(0, 4000),
    facts: dedupeStrings(output.facts, 24),
    decisions: dedupeStrings(output.decisions, 24),
    preferences: dedupeStrings(output.preferences, 24),
  };
}

function dedupeStrings(items: string[], maxItems: number) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of items) {
    const value = item.trim().replace(/\s+/g, " ");
    const key = value.toLowerCase();

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

function formatList(items: string[]) {
  return items.length
    ? items.map((item) => `- ${item}`).join("\n")
    : "(kosong)";
}

function formatTranscript(messages: UIMessage[]) {
  return messages
    .map((message, index) => {
      const text = getTextFromUIMessage(message);
      return text ? `${index + 1}. ${message.role}: ${text}` : "";
    })
    .filter(Boolean)
    .join("\n\n");
}
