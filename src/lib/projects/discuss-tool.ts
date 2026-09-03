import { tool } from "ai";
import { z } from "zod";

import { getSettingSync } from "@/lib/config/app-settings";
import { parseCanonicalBrief } from "@/lib/projects/canonical-brief";
import { getUnresolvedDiscussionDomains } from "@/lib/projects/discussion-domains";
import { unstringifyJsonObject } from "@/lib/projects/json-unstringify";
import { DISCUSS_SYSTEM_PROMPT } from "@/lib/projects/prompts/discuss-system";
import {
  UNSLOP_SYSTEM_INSTRUCTION,
  unslopUserFacingText,
} from "@/lib/projects/unslop-policy";
import { buildChatSystemPrompt } from "@/routes/api.projects.preview";

export const PRESENT_WORKSPACE_CARD_TOOL_NAME = "presentWorkspaceCard";

// The combo model sometimes double-encodes briefPatch/workspaceCard as JSON
function jsonObjectOrString<T extends z.ZodTypeAny>(shape: T) {
  return z.preprocess(unstringifyJsonObject, shape);
}

export const presentWorkspaceCardInputSchema = z.object({
  assistantText: z.string().trim().default(""),
  projectTitle: z.string().optional(),
  readyForBuild: z.boolean().default(false),
  briefPatch: jsonObjectOrString(
    z.object({
      confidence: z.number().optional(),
      businessName: z.string().optional(),
      businessType: z.string().optional(),
      offer: z.string().optional(),
      targetCustomer: z.string().optional(),
      contactOrCta: z.string().optional(),
      stylePreference: z.string().optional(),
      notes: z.array(z.string()).optional(),
      openQuestions: z.array(z.string()).optional(),
      visitorJobs: z
        .array(
          z.object({
            id: z.string().optional(),
            goal: z.string().optional(),
            priority: z.string().optional(),
          }),
        )
        .optional(),
      productOrService: z
        .array(
          z.object({
            name: z.string(),
            description: z.string().optional(),
            priceRange: z.string().optional(),
            isPrimary: z.boolean().optional(),
          }),
        )
        .optional(),
      contact: z
        .object({
          channel: z.enum(["whatsapp", "phone", "instagram", "maps", "other"]),
          value: z.string(),
          label: z.string().optional(),
        })
        .optional(),
      tagline: z.string().optional(),
      usp: z.array(z.string()).optional(),
      priceRange: z.string().optional(),
      visuals: z.boolean().optional(),
      hours: z
        .array(
          z.object({
            dayRange: z.string(),
            open: z.string(),
            close: z.string(),
            note: z.string().optional(),
          }),
        )
        .optional(),
      address: z.string().optional(),
      deliveryArea: z.string().optional(),
      since: z.string().optional(),
      testimonials: z
        .array(
          z.object({
            quote: z.string(),
            author: z.string(),
            context: z.string().optional(),
            rating: z.union([z.number(), z.string()]).optional(),
          }),
        )
        .optional(),
      certifications: z
        .array(
          z.object({
            name: z.string(),
            issuer: z.string().optional(),
          }),
        )
        .optional(),
      paymentMethods: z
        .array(
          z.union([
            z.enum(["cash", "transfer", "qris", "ewallet", "cod"]),
            z.object({
              method: z.enum(["cash", "transfer", "qris", "ewallet", "cod"]),
              detail: z.string().optional(),
            }),
          ]),
        )
        .optional(),
      socialLinks: z
        .array(
          z.object({
            platform: z.enum([
              "instagram",
              "tiktok",
              "facebook",
              "youtube",
              "x",
              "other",
            ]),
            handle: z.string(),
            url: z.string().optional(),
          }),
        )
        .optional(),
      currentPromo: z.string().optional(),
      secondaryCta: z
        .object({
          label: z.string(),
          action: z.string(),
        })
        .optional(),
    }),
  ).optional(),
  workspaceCard: jsonObjectOrString(
    z.object({
      type: z.string(),
      title: z.string().optional(),
      summary: z.array(z.string()).optional(),
      question: z
        .object({
          id: z.union([z.string(), z.number()]).optional(),
          question: z.string().optional(),
          text: z.string().optional(),
          title: z.string().optional(),
          answerMode: z.string().optional(),
          selectionMode: z.string().optional(),
          placeholder: z.string().optional(),
          required: z.boolean().optional(),
          options: z.array(z.any()).optional(),
        })
        .optional(),
      imageUpload: z
        .object({
          id: z.string().optional(),
          question: z.string().optional(),
          hint: z.string().optional(),
          selectionMode: z.enum(["single", "multiple"]).optional(),
          purpose: z.enum(["business-image", "logo", "reference"]).optional(),
          required: z.boolean().optional(),
        })
        .optional(),
      questions: z
        .array(
          z.object({
            id: z.union([z.string(), z.number()]).optional(),
            question: z.string().optional(),
            text: z.string().optional(),
            title: z.string().optional(),
            answerMode: z.string().optional(),
            selectionMode: z.string().optional(),
            placeholder: z.string().optional(),
            recommendedOptionLabel: z.string().optional(),
            whyThisQuestionMatters: z.string().optional(),
            required: z.boolean().optional(),
            options: z.array(z.any()).optional(),
          }),
        )
        .optional(),
      actions: z.array(z.any()).optional(),
    }),
  ),
});

export const presentWorkspaceCardTool = tool({
  description:
    "Present the next workspace card. Always include assistantText as one short Indonesian chat sentence and workspaceCard as a nested object. Never put type at the top level alone.",
  inputSchema: presentWorkspaceCardInputSchema,
});

export function extractAssistantTextFromToolInput(toolInput: unknown): string {
  if (!toolInput || typeof toolInput !== "object") {
    return "";
  }
  const raw = (toolInput as { assistantText?: unknown }).assistantText;
  if (typeof raw !== "string") {
    return "";
  }
  return unslopUserFacingText(raw.trim());
}

export function extractPartialAssistantTextFromToolInput(
  toolInput: unknown,
): string {
  if (!toolInput || typeof toolInput !== "object") {
    return "";
  }
  const raw = (toolInput as { assistantText?: unknown }).assistantText;
  return typeof raw === "string" ? raw : "";
}

let parsePartialJsonFn:
  | ((jsonText: string | undefined) => Promise<{
      value: unknown;
      state: string;
    }>)
  | null = null;

async function getParsePartialJson() {
  if (!parsePartialJsonFn) {
    const mod = await import("ai");
    parsePartialJsonFn = mod.parsePartialJson;
  }
  return parsePartialJsonFn;
}

export function extractPartialAssistantTextFromToolJson(
  partialToolJson: string,
): string {
  const match = /"assistantText"\s*:\s*"((?:[^"\\]|\\.)*)/.exec(
    partialToolJson,
  );
  if (!match || !match[1]) {
    return "";
  }
  try {
    return JSON.parse(`"${match[1]}"`) as string;
  } catch {
    return match[1].replace(/\\n/g, "\n").replace(/\\"/g, '"');
  }
}

export async function nextAssistantTextDeltaFromPartialToolJson(
  partialToolJson: string,
  alreadyStreamed: string,
): Promise<{ delta: string; seenText: string }> {
  const directText = extractPartialAssistantTextFromToolJson(partialToolJson);
  if (directText && directText.startsWith(alreadyStreamed)) {
    return {
      delta: directText.slice(alreadyStreamed.length),
      seenText: directText,
    };
  }

  const parsePartialJson = await getParsePartialJson();
  const { value } = await parsePartialJson(partialToolJson);
  const partial = extractPartialAssistantTextFromToolInput(value);
  if (!partial || !partial.startsWith(alreadyStreamed)) {
    return { delta: "", seenText: alreadyStreamed };
  }
  return {
    delta: partial.slice(alreadyStreamed.length),
    seenText: partial,
  };
}

export async function nextPartialWorkspaceCardFromToolJson(
  partialToolJson: string,
): Promise<Record<string, unknown> | null> {
  const parsePartialJson = await getParsePartialJson();
  const { value } = await parsePartialJson(partialToolJson);
  if (!value || typeof value !== "object") {
    return null;
  }
  const card = (value as { workspaceCard?: unknown }).workspaceCard;
  if (!card || typeof card !== "object" || Array.isArray(card)) {
    return null;
  }
  return card as Record<string, unknown>;
}

export function buildOneCallSystemPrompt({
  brief,
  context,
  hasBuiltSite,
  hasPendingChanges = false,
}: {
  brief: unknown;
  context: string;
  hasBuiltSite: boolean;
  hasPendingChanges?: boolean;
}) {
  const photoEnabled = (() => {
    try {
      return getSettingSync(
        "feature.composer_uploads_enabled",
        true,
      ) as boolean;
    } catch {
      return true;
    }
  })();
  const photoRule = photoEnabled
    ? '\nPHOTO FEATURE ON: Photo uploads are enabled. For businesses with visual products (food, fashion, craft, salon, cafe), you can emit type="image_upload" with purpose="business-image" to ask the owner for photos of their storefront, menu, or products. The UI allows them to upload or easily skip with a button.'
    : "\nPHOTO FEATURE OFF: Photo uploads are disabled via /admin/settings (feature.composer_uploads_enabled=false). NEVER mention, suggest, or ask photo/image upload questions in chat or option cards. Focus strictly on text, typography, color palette, trust points, and content details.";
  const unresolvedDomains = getUnresolvedDiscussionDomains(
    parseCanonicalBrief(brief),
  );
  const domainRule = `\nADAPTIVE DISCUSSION DOMAINS: Track six areas without repeating answered questions: identity_transaction, selling_angle, audience_decision, operations, proof_assets, visual_direction. Still unresolved: ${unresolvedDomains.length ? unresolvedDomains.join(", ") : "none"}. Choose the next question with the highest value for the owner's next decision; accept an explicit omission and record it instead of asking again.`;

  if (hasBuiltSite) {
    const syncStateDirective = hasPendingChanges
      ? '\nSYNC STATE (DIRTY): New changes have been discussed/updated that are NOT yet rendered in the preview. When the user confirms or wants to see them applied, emit type="build_recommendation" with a title and a short summary of the changes.'
      : '\nSYNC STATE (CLEAN): The website in preview is already 100% up-to-date with all agreed details. DO NOT blindly rebuild. If the user asks to update or build with no new changes, warmly ask in assistantText what specific part they want to refine, and emit type="question" with relevant refinement options or type="none".';

    return `${buildChatSystemPrompt({ brief, context, hasBuiltSite })}${domainRule}${photoRule}${syncStateDirective}

${UNSLOP_SYSTEM_INSTRUCTION}

CRITICAL OUTPUT:
Call ${PRESENT_WORKSPACE_CARD_TOOL_NAME} exactly once. Tool input MUST include:
- assistantText: EXACTLY ONE short Indonesian chat sentence (max 20 words, aku/kamu only) acknowledging the edit request or asking a helpful refinement question
- workspaceCard: the nested card object defined by the tool schema
Choose a build recommendation when changes are ready, a question when clarification is needed, and none when no action is needed.
This is an edit request, not an interview. Never put type at the top level without workspaceCard. Never put JSON in free chat text. Put the user-visible reply in assistantText.`;
  }

  return `${buildChatSystemPrompt({ brief, context, hasBuiltSite })}${domainRule}${photoRule}

${UNSLOP_SYSTEM_INSTRUCTION}

CRITICAL OUTPUT:
Call ${PRESENT_WORKSPACE_CARD_TOOL_NAME} exactly once.
The tool arguments JSON MUST have "assistantText" as the VERY FIRST key:
{
  "assistantText": "EXACTLY ONE short Indonesian chat sentence (max 20 words, aku/kamu)",
  "workspaceCard": { ... },
  "briefPatch": { ... }
}
Put the user-visible reply in assistantText, never as free chat text outside the tool.

INTERVIEW DISCIPLINE — one question per turn:
- Emit EXACTLY ONE question per turn via type="question". Never use type="questions".
- Pick the main question that moves the build forward. Ask the next question next turn after the user answers.
- The question sets recommendedOptionLabel (your default) — user can accept in one click.
- Do not ask fields inferable from brief/chat. Walk the decision tree, resolve the deepest open dependency first.
- NEVER re-ask a question id that already appears in brief.facts/decisions. Skip answered fields and pick the next unfilled applicable field. Re-asking the same id wastes a turn and will be blocked by the server.
- Cover the six adaptive domains (identity/transaction, selling angle, audience/decision, operations, proof/assets, visual direction) one decision at a time. Prioritize the highest-information unresolved domain, skip what the brief already proves, and accept explicit omissions. The server authorizes the build recommendation; model confidence alone never does. Never expose confidence percentages or answered-field counts to the user.

Never put JSON in free chat text. Put the user-visible reply in assistantText.
Use type="question" with a single question and a stable string question.id, or type="image_upload" when asking for photos.
Use choice options with label and description only when the conversation provides a bounded set of real choices. Otherwise use a text question. Never include a catch-all "other"/"write your own" option — the UI already appends one automatically.
RELENTLESS PROBING MANDATE: Keep probing through all Tier 1 (name, offers, contact) and Tier 2 fields (pricing, USP, location, photo uploads) before recommending build. If the user skips photo upload, accept it immediately and DO NOT ask for photos again. Use build_recommendation when all Tier 1 and Tier 2 fields are resolved or skipped, or when the user explicitly commands an immediate build. Below that, keep asking the next unfilled question. Never emit premature build recommendations on early turns.
Card richness: for answerMode "text", ALWAYS set a short, contextual Indonesian placeholder. For answerMode "choice", set selectionMode "multiple" only when several answers naturally apply, otherwise "single". question.options MUST be an array of 2-5 objects with non-empty label and description strings. Use text mode when real choices are not grounded in the conversation. Never emit string arrays or empty options. Every option needs a non-empty label.
If the user explicitly asks to build now, still emit the build_recommendation card; the server adds an honest warning about what stays generic.`;
}

export function buildCardSystemPrompt() {
  const photoEnabled = (() => {
    try {
      return getSettingSync(
        "feature.composer_uploads_enabled",
        true,
      ) as boolean;
    } catch {
      return true;
    }
  })();
  const photoNote = photoEnabled
    ? ""
    : " PHOTO OFF: Never generate visuals/image_upload/media_strategy.";
  return `You are a card generator for an Indonesian small business website brief flow.${photoNote}
${UNSLOP_SYSTEM_INSTRUCTION}
Based on the conversation, output ONLY a JSON object. No markdown fences, no explanation.

The JSON object must have these fields:
- assistantText: one short Indonesian chat sentence (max 20 words, aku/kamu)
- briefPatch: object with confidence (number 0-100), and any of these optional fields: businessName, businessType, offer, targetCustomer, contactOrCta, stylePreference, notes (string array), openQuestions (string array), facts (array of {key, label, value}), decisions (array of {id, question, answer})
- workspaceCard: object with type (exactly "question" or "build_recommendation")
  - For type "question": question object with a string id, question in Indonesian, answerMode ("choice" or "text"), selectionMode ("single" or "multiple"), and either grounded options (2-5 objects with label and description strings) or a placeholder string.
  - For type "image_upload": imageUpload object with a string id, question in Indonesian, optional hint, selectionMode ("single" or "multiple"), purpose ("business-image" | "logo" | "reference"), and optional required. Use this card when the owner may provide images; the server keeps it optional so the user can skip.
  - For type "build_recommendation": title (string), summary (string array)
- projectTitle: concise Indonesian project name string

Rules:
- workspaceCard.type must be exactly one of: "question", "image_upload", "build_recommendation"
- question.id must be a string (not a number)
- question.options must be an array of objects with label and description strings (not plain strings)
- Never include a catch-all "other"/"write your own" option in question.options — the UI already appends a custom-answer option automatically
- assistantText and workspaceCard.question MUST ask the SAME question. Acknowledge the last answer, then ask exactly the card's question — never a different one, and never a second question the card does not carry
- NEVER re-ask a question id that already appears in brief.facts/decisions — pick the next unfilled applicable field; re-asking the same id will be blocked
- Set confidence to 95+ only when genuinely build-ready
- ADAPTIVE PROBING: Cover identity/transaction, selling angle, audience/decision, operations, proof/assets, and visual direction. Ask one high-information question at a time, skip fields inferable from the brief, and record explicit omissions so they are not repeated. Tier 1 (name, offers, contact) remains required; Tier 2 asks pricing, USP, location, and photos when applicable. If the user skips photos, accept immediately and NEVER ask for photos again. Use "build_recommendation" only when the server says the core is ready or the user explicitly commands an immediate build. Never emit premature build recommendations. The server authorizes build readiness; model confidence does not. Never surface confidence percentages or field counts to the user.
- briefPatch and workspaceCard MUST be JSON objects (nested inside the tool call), NOT JSON-encoded strings. Never put a stringified JSON blob where an object belongs.

Output valid JSON only. Put the user-visible reply in assistantText, not as free chat prose.

${DISCUSS_SYSTEM_PROMPT}`;
}

export function alignAssistantTextWithCard(
  assistantText: string,
  card: Record<string, unknown> | null | undefined,
): string {
  const cardQuestion = unslopUserFacingText(cardQuestionOf(card));
  const text = unslopUserFacingText(assistantText.trim());

  if (card?.type === "build_recommendation") {
    // If the card is a build recommendation, keep the text clean and informative
    if (!text || text.includes("?")) {
      const ack = acknowledgementOf(text);
      return ack
        ? `${ack} Website kamu siap dibuat.`
        : "Informasi usahamu sudah lengkap dan website siap dibuat.";
    }
    return text;
  }

  if (!text) {
    return cardQuestion || ACKNOWLEDGED_FALLBACK;
  }

  if (cardQuestion) {
    if (asksTheSameQuestion(text, cardQuestion)) {
      return text;
    }
    const acknowledgement = acknowledgementOf(text);
    return acknowledgement
      ? `${acknowledgement} ${cardQuestion}`
      : cardQuestion;
  }

  return text;
}

const ACKNOWLEDGED_FALLBACK = "Informasi kamu sudah aku catat.";

function cardQuestionOf(
  card: Record<string, unknown> | null | undefined,
): string {
  const source =
    card?.type === "question"
      ? card.question
      : card?.type === "image_upload"
        ? card.imageUpload
        : null;
  const question = isRecord(source) ? source.question : null;
  return typeof question === "string" ? question.trim() : "";
}

function asksTheSameQuestion(text: string, cardQuestion: string): boolean {
  const normalized = normalizeForCompare(text);
  if (normalized.includes(normalizeForCompare(cardQuestion))) {
    return true;
  }
  const cardWords = contentWords(cardQuestion);
  if (cardWords.length === 0) {
    return false;
  }
  const textWords = new Set(contentWords(text));
  const shared = cardWords.filter((word) => textWords.has(word)).length;
  return shared / cardWords.length >= 0.5;
}

const QUESTION_STOPWORDS = new Set([
  "yang",
  "untuk",
  "kamu",
  "biasanya",
  "paling",
  "sudah",
  "atau",
  "dari",
  "pada",
  "saja",
  "juga",
  "mana",
  "sama",
]);

function contentWords(value: string): string[] {
  return [
    ...new Set(
      normalizeForCompare(value)
        .replaceAll(/[^\p{L}\p{N}\s]/gu, " ")
        .split(/\s+/u)
        .filter((word) => word.length >= 4 && !QUESTION_STOPWORDS.has(word)),
    ),
  ];
}

function normalizeForCompare(value: string): string {
  return value.toLowerCase().replaceAll(/\s+/gu, " ").trim();
}

function acknowledgementOf(text: string): string {
  const lastQuestionMark = text.lastIndexOf("?");
  const head = lastQuestionMark >= 0 ? text.slice(0, lastQuestionMark) : text;
  const boundary = Math.max(
    head.lastIndexOf("."),
    head.lastIndexOf(";"),
    head.lastIndexOf("!"),
    head.lastIndexOf("?"),
  );
  const acknowledgement = (
    boundary >= 0 ? head.slice(0, boundary) : lastQuestionMark >= 0 ? "" : head
  ).trim();
  return acknowledgement ? `${acknowledgement.replace(/[,;:]+$/u, "")}.` : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
