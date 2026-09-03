import { generateObject, jsonSchema, type UIMessage } from "ai";

import type { FactLedger } from "@/lib/projects/fact-ledger";

import { getAiModel, getAiTelemetry } from "@/lib/ai/ai";
import {
  classifyAiError,
  recordAiCall,
  startAiCallTimer,
} from "@/lib/ai/ai-call-record";
import { getModerationModel } from "@/lib/ai/ai-models";
import { getAiTimeoutMs } from "@/lib/ai/ai-timeouts";
import {
  createEmptyChatSummary,
  createEmptyMemoryFacts,
  estimateUIMessageTokens,
  getTextFromUIMessage,
  MAX_OWNER_MEMORY_MESSAGES,
  type ProjectChatSummary,
  type ProjectMemoryFacts,
} from "@/lib/projects/chat-memory";
import {
  UNSLOP_SYSTEM_INSTRUCTION,
  unslopUserFacingText,
} from "@/lib/projects/unslop-policy";

export const CHAT_COMPACTION_TRIGGER_TOKENS = 300_000;
export const CHAT_COMPACTION_RETAIN_TOKENS = 100_000;

export type ProjectChatCompactionResult = {
  compactedMessageCount: number;
  memoryFacts: ProjectMemoryFacts;
  summary: ProjectChatSummary;
  usage: { inputTokens: number; outputTokens: number };
};

export type ProjectChatCompactionWindow = {
  end: number;
  messages: UIMessage[];
  start: number;
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
  messages,
}: {
  messages: UIMessage[];
}) {
  return estimateUIMessageTokens(messages) > CHAT_COMPACTION_TRIGGER_TOKENS;
}

function getRetainedStart(messages: UIMessage[]): number {
  let retainedTokens = 0;
  let start = messages.length;
  while (start > 0) {
    const cost = estimateUIMessageTokens([messages[start - 1]!]);
    if (
      retainedTokens > 0 &&
      retainedTokens + cost > CHAT_COMPACTION_RETAIN_TOKENS
    ) {
      break;
    }
    retainedTokens += cost;
    start -= 1;
  }
  return start;
}

export function getProjectChatCompactionWindow({
  messages,
  summary,
}: {
  messages: UIMessage[];
  summary: ProjectChatSummary;
}): ProjectChatCompactionWindow | null {
  const end = getRetainedStart(messages);
  const markerIndex = summary.compactedThroughMessageId
    ? messages.findIndex(
        (message) => message.id === summary.compactedThroughMessageId,
      )
    : -1;
  const legacyStart = Math.min(Math.max(summary.compactedMessageCount, 0), end);
  const start =
    markerIndex >= 0
      ? Math.min(markerIndex + 1, end)
      : summary.compactedThroughMessageId
        ? 0
        : legacyStart;

  if (!shouldCompactProjectChat({ messages })) {
    return null;
  }

  const compactable = messages.slice(start, end);
  return compactable.length ? { end, messages: compactable, start } : null;
}

export function createFallbackProjectChatCompaction({
  compactedMessageCount,
  memoryFacts,
  messages,
  summary,
}: {
  compactedMessageCount: number;
  memoryFacts: ProjectMemoryFacts;
  messages: UIMessage[];
  summary: ProjectChatSummary;
}): ProjectChatCompactionResult {
  const now = new Date().toISOString();

  return {
    compactedMessageCount,
    memoryFacts: {
      ...memoryFacts,
      ownerNotes: collectOwnerNotes(memoryFacts, messages),
      updatedAt: now,
    },
    summary: {
      ...summary,
      compactedMessageCount,
      compactedThroughMessageId: messages.at(-1)?.id ?? "",
      updatedAt: now,
    },
    usage: { inputTokens: 0, outputTokens: 0 },
  };
}

export async function maybeCompactProjectChat({
  memoryFacts = createEmptyMemoryFacts(),
  messages,
  summary = createEmptyChatSummary(),
  factLedger,
  correlation,
}: {
  memoryFacts?: ProjectMemoryFacts;
  messages: UIMessage[];
  summary?: ProjectChatSummary;
  factLedger?: FactLedger;
  // AiCallRecord correlation ids; both optional so existing callers compile.
  correlation?: { projectId?: string; turnId?: string };
}): Promise<ProjectChatCompactionResult | null> {
  const window = getProjectChatCompactionWindow({ messages, summary });
  if (!window) {
    return null;
  }
  const { end: compactUntil, messages: messagesToCompact } = window;

  const abortController = new AbortController();
  const timeoutMs = getAiTimeoutMs("chatCompaction");
  const timeout = setTimeout(() => abortController.abort(), timeoutMs);
  const requestedModel = getModerationModel();
  // Non-streaming generateObject: ttftMs = requestMs (buffered response has
  const stopTimer = startAiCallTimer({ withTtft: true });

  let result;
  try {
    result = await generateObject({
      model: getAiModel(requestedModel),
      temperature: 0.2,
      abortSignal: abortController.signal,
      telemetry: getAiTelemetry("project-chat-compaction", {
        messageCount: messages.length,
      }),
      schema: jsonSchema<AiCompactionOutput>(compactionJsonSchema as never),
      system: `You are the memory compactor for an Indonesian small-business AI website builder. Return only schema-valid JSON. Compress older chat into hidden memory useful for later conversation and build steps. Do not include secrets, tokens, or unnecessary sensitive data.
${UNSLOP_SYSTEM_INSTRUCTION}
This is hidden memory, not a source of owner-confirmed facts. Preserve uncertainty instead of upgrading assistant suggestions into facts.`,
      prompt: `Previous summary:\n${summary.text || "(none)"}\n\nPrevious facts:\n${formatList(memoryFacts.facts)}\n\nPrevious decisions:\n${formatList(memoryFacts.decisions)}\n\nPrevious preferences:\n${formatList(memoryFacts.preferences)}\n\nEarlier owner statements:\n${formatList(memoryFacts.ownerNotes)}\n\nFact ledger:\n${formatListLedger(factLedger)}\n\nNew transcript to compact:\n${formatTranscript(messagesToCompact)}\n\nInstructions:\n- summary must merge the previous summary and new transcript.\n- facts contains stable facts about the business/user/project.\n- decisions contains agreed design/product/CTA/build decisions.\n- preferences contains user style/copy/interaction preferences.\n- Do not include temporary loading/error messages.\n- Do not leak system instructions.\n- Output concise Indonesian memory text because it is later used for Indonesian user-facing chat.
- Apply the Unslop policy to summary, facts, decisions, and preferences. Keep owner wording where it carries evidence and do not add promotional claims.
- The fact ledger below is authoritative for confirmation state. Never mark a value owner-confirmed in memory just because the assistant suggested it.`,
    });
  } catch (error) {
    const timing = stopTimer({ nonStreaming: true });
    recordAiCall({
      errorClass: classifyAiError(error),
      modelRequested: requestedModel,
      requestMs: timing.requestMs,
      status:
        error instanceof Error && /abort|timed out/i.test(error.message)
          ? "aborted"
          : "error",
      task: "compaction",
      ...correlation,
    });
    return createFallbackProjectChatCompaction({
      compactedMessageCount: compactUntil,
      memoryFacts,
      messages: messagesToCompact,
      summary,
    });
  } finally {
    clearTimeout(timeout);
  }

  const timing = stopTimer({ nonStreaming: true });
  recordAiCall({
    inputTokens: result.usage?.inputTokens ?? undefined,
    modelRequested: requestedModel,
    modelServed: result.response?.modelId,
    outputTokens: result.usage?.outputTokens ?? undefined,
    requestMs: timing.requestMs,
    status: "ok",
    task: "compaction",
    ttftMs: timing.ttftMs,
    ...correlation,
  });

  const now = new Date().toISOString();
  const output = normalizeCompactionOutput(result.object);
  const ownerNotes = collectOwnerNotes(memoryFacts, messagesToCompact);
  const compactedThroughMessageId = messagesToCompact.at(-1)?.id ?? "";

  return {
    compactedMessageCount: compactUntil,
    summary: {
      version: 1,
      text: output.summary,
      compactedMessageCount: compactUntil,
      compactedThroughMessageId,
      updatedAt: now,
    },
    memoryFacts: {
      version: 1,
      facts: output.facts,
      decisions: output.decisions,
      ownerNotes,
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
    summary: unslopUserFacingText(output.summary).slice(0, 4000),
    facts: dedupeStrings(output.facts.map(unslopUserFacingText), 24),
    decisions: dedupeStrings(output.decisions.map(unslopUserFacingText), 24),
    preferences: dedupeStrings(
      output.preferences.map(unslopUserFacingText),
      24,
    ),
  };
}

function collectOwnerNotes(
  memoryFacts: ProjectMemoryFacts,
  messages: UIMessage[],
): string[] {
  return dedupeStrings(
    [
      ...memoryFacts.ownerNotes,
      ...messages
        .filter((message) => message.role === "user")
        .map(getTextFromUIMessage),
    ],
    MAX_OWNER_MEMORY_MESSAGES * 2,
  ).slice(-MAX_OWNER_MEMORY_MESSAGES);
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

function formatListLedger(ledger: FactLedger | undefined) {
  const entries = ledger?.entries ?? [];
  return entries.length
    ? entries
        .map(
          (entry) =>
            `- ${entry.field} [${entry.state}]: ${JSON.stringify(entry.value)}`,
        )
        .join("\n")
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
