import { createHash } from "node:crypto";

import { generateText } from "ai";

import type { UIMessage } from "ai";

import { getAiModel, getAiTelemetry } from "@/lib/ai/ai";
import {
  classifyAiError,
  recordAiCall,
  startAiCallTimer,
} from "@/lib/ai/ai-call-record";
import { getGenerationModel } from "@/lib/ai/ai-models";
import { getAiTimeoutMs } from "@/lib/ai/ai-timeouts";
import { devLog } from "@/lib/dev-log";

/**
 * The contract carries accepted facts; nothing carried the reason behind them.
 * An owner saying "kenyang murah, mahasiswa suka" became `audience: "..."` and
 * the writer never learned what mattered about the business. This pass reads
 * the discussion once, at handoff time, and freezes a short expert direction
 * for the writer to execute. It states taste, never facts — the contract stays
 * the only source of anything a customer can read.
 */
export const BUILD_CREATIVE_DIRECTION_MAX_CHARS = 1_200;

const TRANSCRIPT_MAX_CHARS = 8_000;

export type BuildCreativeDirectionMediaMode =
  "owner_assets" | "graphic" | "typographic";

export function buildCreativeDirectionPrompt(input: {
  businessName: string;
  businessType: string;
  messages: UIMessage[];
  mediaMode?: BuildCreativeDirectionMediaMode;
}): { system: string; user: string } {
  const system = `You are an expert brand and web designer who has shipped hundreds of sites for Indonesian small businesses. You are briefing the writer who will build this one.

Read the owner's conversation and write the creative direction for their site.

Say:
- what this business actually is, in one honest sentence
- what the first view must land, and why that matters to this owner's customer
- the tone and visual feeling that fits this business, not businesses in general
- what to emphasise, and what to keep quiet
- one specific idea that would make this site feel made for them

Rules:
- Direction only. Never invent or state a fact: no prices, discounts, awards, addresses, hours, guarantees, ratings, or claims. The writer reads facts from an accepted contract, not from you.
- Write English prose for the writer. No JSON, no headings, no lists, no markdown.
- Be concrete about this business. Generic advice is worse than nothing.
- Stay under ${BUILD_CREATIVE_DIRECTION_MAX_CHARS} characters.
${mediaRule(input.mediaMode)}`;

  const user = `Business name: ${input.businessName || "(not given yet)"}
Business type: ${input.businessType || "(not given yet)"}

Conversation with the owner:
${formatTranscript(input.messages)}`;

  return { system, user };
}

/**
 * The owner usually has no photos, and the writer is forbidden from inventing
 * media. Directing "close-up food photography" at a typographic site sends it
 * chasing images that do not exist.
 */
function mediaRule(mode: BuildCreativeDirectionMediaMode | undefined): string {
  return mode === "owner_assets"
    ? "- The owner supplied photos. Direct how to use them."
    : "- The owner has no photos. Direct type, colour, layout, and graphic shapes instead. Never ask for photography, image treatment, or picture-led composition. Any graphic you describe must be drawable as inline SVG with visible paths; never as an empty box holding a background or border where a picture would go.";
}

export function normalizeBuildCreativeDirection(
  value: string | undefined | null,
): string | null {
  const collapsed = (value ?? "").replaceAll(/\s+/gu, " ").trim();
  if (!collapsed) {
    return null;
  }
  // End on a whole sentence so the last instruction is one the writer can
  // follow. Both a hard slice and a model that simply ran out mid-clause have
  // handed it dangling fragments.
  return endOnWholeSentence(
    collapsed.slice(0, BUILD_CREATIVE_DIRECTION_MAX_CHARS),
  );
}

function endOnWholeSentence(value: string): string {
  const trimmed = value.trimEnd();
  if (/[.!?]$/u.test(trimmed)) {
    return trimmed;
  }
  const lastStop = Math.max(
    trimmed.lastIndexOf(". "),
    trimmed.lastIndexOf("! "),
    trimmed.lastIndexOf("? "),
  );
  return lastStop > 0 ? trimmed.slice(0, lastStop + 1) : trimmed;
}

export function hashBuildCreativeDirection(direction: string): string {
  return createHash("sha256").update(direction, "utf8").digest("hex");
}

/**
 * Fail-open: a build must never be lost because the direction pass failed.
 * The writer keeps its deterministic contract and blueprint either way.
 */
export async function generateBuildCreativeDirection(input: {
  businessName: string;
  businessType: string;
  messages: UIMessage[];
  projectId: string;
  userId: string;
  turnId?: string;
  mediaMode?: BuildCreativeDirectionMediaMode;
}): Promise<{ direction: string; hash: string } | null> {
  if (input.messages.length === 0) {
    return null;
  }
  const prompt = buildCreativeDirectionPrompt(input);
  const requestedModel = getGenerationModel();
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    getAiTimeoutMs("buildSpec"),
  );
  const stopTimer = startAiCallTimer({ withTtft: true });
  try {
    const result = await generateText({
      model: getAiModel(requestedModel),
      abortSignal: controller.signal,
      maxOutputTokens: 700,
      maxRetries: 1,
      system: prompt.system,
      prompt: prompt.user,
      telemetry: getAiTelemetry("build-creative-direction", {
        projectId: input.projectId,
      }),
      temperature: 0.5,
    });
    const timing = stopTimer({ nonStreaming: true });
    const direction = normalizeBuildCreativeDirection(result.text);
    recordAiCall({
      inputTokens: result.usage?.inputTokens ?? undefined,
      modelRequested: requestedModel,
      modelServed: result.response?.modelId,
      outputTokens: result.usage?.outputTokens ?? undefined,
      projectId: input.projectId,
      requestMs: timing.requestMs,
      status: direction ? "ok" : "error",
      task: "build-spec",
      ttftMs: timing.ttftMs,
      turnId: input.turnId,
    });
    return direction
      ? { direction, hash: hashBuildCreativeDirection(direction) }
      : null;
  } catch (error) {
    const timing = stopTimer({ nonStreaming: true });
    recordAiCall({
      errorClass: classifyAiError(error),
      modelRequested: requestedModel,
      projectId: input.projectId,
      requestMs: timing.requestMs,
      status: "error",
      task: "build-spec",
      turnId: input.turnId,
    });
    devLog("generate", "creative_direction.failed", {
      projectId: input.projectId,
      errorClass: classifyAiError(error),
    });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function formatTranscript(messages: UIMessage[]): string {
  const lines: string[] = [];
  for (const message of messages) {
    const text = (message.parts ?? [])
      .filter(
        (part): part is { type: "text"; text: string } =>
          part.type === "text" &&
          typeof (part as { text?: unknown }).text === "string",
      )
      .map((part) => part.text.trim())
      .filter(Boolean)
      .join(" ");
    if (text) {
      lines.push(`${message.role === "user" ? "Owner" : "Assistant"}: ${text}`);
    }
  }
  const joined = lines.join("\n");
  return joined.length > TRANSCRIPT_MAX_CHARS
    ? joined.slice(joined.length - TRANSCRIPT_MAX_CHARS)
    : joined;
}
