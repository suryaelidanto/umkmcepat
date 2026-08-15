import { tool } from "ai";
import { z } from "zod";

import { getSettingSync } from "@/lib/app-settings";
import { unstringifyJsonObject } from "@/lib/projects/json-unstringify";
import { DISCUSS_SYSTEM_PROMPT } from "@/lib/projects/prompts/discuss-system";
import { buildChatSystemPrompt } from "@/routes/api.projects.preview";

export const PRESENT_WORKSPACE_CARD_TOOL_NAME = "presentWorkspaceCard";

// The combo model sometimes double-encodes briefPatch/workspaceCard as JSON
// strings instead of nested objects, which fails strict z.object() validation
// (AI_TypeValidationError) and churns the repair layers on the same bad shape.
// Accept either an object or a JSON string; the server (normalizeWorkspaceTurn)
// re-applies the same un-stringify as the single authority.
function jsonObjectOrString<T extends z.ZodTypeAny>(shape: T) {
  return z.preprocess(unstringifyJsonObject, shape);
}

export const presentWorkspaceCardInputSchema = z.object({
  // Forced toolChoice often suppresses free chat text; put the user-visible
  // Indonesian reply here so the worker can persist it as a normal text part.
  assistantText: z.string().trim().min(1),
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
    'Present the next workspace card. Always include assistantText (one short Indonesian chat sentence, max 20 words, aku/kamu) and workspaceCard as a nested object (e.g. workspaceCard: { type: "none" } or workspaceCard: { type: "question", question: {...} }). Never put type at the top level alone.',
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
  return raw.trim();
}

/** Prefix-safe partial assistantText from incomplete tool JSON (no trailing trim). */
export function extractPartialAssistantTextFromToolInput(
  toolInput: unknown,
): string {
  if (!toolInput || typeof toolInput !== "object") {
    return "";
  }
  const raw = (toolInput as { assistantText?: unknown }).assistantText;
  return typeof raw === "string" ? raw : "";
}

/**
 * Diff newly-parsed assistantText against what was already streamed.
 * Callers accumulate tool-input-delta JSON, then feed the buffer here.
 */
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

export async function nextAssistantTextDeltaFromPartialToolJson(
  partialToolJson: string,
  alreadyStreamed: string,
): Promise<{ delta: string; seenText: string }> {
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

/**
 * Best-effort partial workspaceCard from incomplete tool JSON. Returns the
 * raw nested object when it is parseable and non-empty; otherwise null. The
 * final normalized card is still produced by `normalizeWorkspaceTurn` on the
 * complete tool input — this only enables earlier skeleton rendering.
 */
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
}: {
  brief: unknown;
  context: string;
  hasBuiltSite: boolean;
}) {
  if (hasBuiltSite) {
    return `${buildChatSystemPrompt({ brief, context, hasBuiltSite })}

CRITICAL OUTPUT:
Call ${PRESENT_WORKSPACE_CARD_TOOL_NAME} exactly once. Tool input MUST include:
- assistantText: EXACTLY ONE short Indonesian chat sentence (max 20 words, aku/kamu only) acknowledging the edit request
- workspaceCard: nested object only. Full tool input examples:
  - Clarification (preferred when you need a choice, e.g. which color): { "assistantText": "...", "workspaceCard": { "type": "question", "question": { "id": "slug", "question": "...", "answerMode": "choice"|"text", "selectionMode": "single", "options": [{ "label": "...", "description": "..." }] } } }  - Ack only, no more questions this turn: { "assistantText": "...", "workspaceCard": { "type": "none" } }
Never use type="build_recommendation" — the site is already built; this is an edit request, not an interview. Never put type at the top level without workspaceCard. Never put JSON in free chat text. Put the user-visible reply in assistantText.`;
  }

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
    ? ""
    : "\nPHOTO FEATURE OFF: Photo uploads are disabled via /admin/settings (feature.composer_uploads_enabled=false). NEVER ask photo-upload questions using visuals, media_strategy, or image_upload. Style choice cards such as visual_direction and style_preference remain allowed. Skip only photo uploads and pick the next unfilled applicable field.";

  return `${buildChatSystemPrompt({ brief, context, hasBuiltSite })}${photoRule}

CRITICAL OUTPUT:
Call ${PRESENT_WORKSPACE_CARD_TOOL_NAME} exactly once. Tool input MUST include:
- assistantText: EXACTLY ONE short Indonesian chat sentence (max 20 words, aku/kamu) acknowledging the answer or greeting the user
- workspaceCard: the next workspace card as a nested object

INTERVIEW DISCIPLINE — one question per turn:
- Emit EXACTLY ONE question per turn via type="question". Never use type="questions".
- Pick the single most crucial question to move the build forward. Ask the next question next turn after the user answers.
- The question sets recommendedOptionLabel (your default) — user can accept in one click.
- Do not ask fields inferable from brief/chat. Walk the decision tree, resolve the deepest open dependency first.
- NEVER re-ask the same question id that already appears in brief.facts/decisions (e.g., if delivery_area, visuals, hours already answered, skip them — pick the next unfilled applicable field). Re-asking the same id wastes a turn and will be blocked by the server.
- Keep asking one question per turn until every structural decision (offer/primary offer, visitor job + CTA, local-vs-online, media strategy, visual direction) is answered or explicitly declined. The server authorizes the build recommendation; model confidence alone never does. Never expose confidence percentages or answered-field counts to the user.

Never put JSON in free chat text. Put the user-visible reply in assistantText.
Use type="question" with a single question (question.id is a short slug like business_name or services).
Prefer choice options with label+description (2-5). Never include a catch-all "other"/"write your own" option — the UI already appends one automatically. Use build_recommendation only when all structural decisions are resolved or the user explicitly accepts an early build. Below that, keep asking a question. Never use any other card type.
Card richness: for answerMode "text", ALWAYS set a short Indonesian placeholder (e.g. "Contoh: Kopi Senja"). For answerMode "choice", set selectionMode "multiple" only when the answer naturally allows several (e.g. "produk apa saja"), otherwise "single". question.options MUST be an array of 2-5 objects shaped { "label": "...", "description": "..." }. NEVER emit string arrays or empty strings (e.g. options: ["", "", ""]) — that renders as a plain text box. Every option needs a non-empty label.
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
Based on the conversation, output ONLY a JSON object. No markdown fences, no explanation.

The JSON object must have these fields:
- assistantText: one short Indonesian chat sentence (max 20 words, aku/kamu)
- briefPatch: object with confidence (number 0-100), and any of these optional fields: businessName, businessType, offer, targetCustomer, contactOrCta, stylePreference, notes (string array), openQuestions (string array), facts (array of {key, label, value}), decisions (array of {id, question, answer})
- workspaceCard: object with type (exactly "question" or "build_recommendation")
  - For type "question": question object with id (string slug like business_name), question (string in Indonesian), answerMode ("choice" or "text"), selectionMode ("single" or "multiple"), and either options (array of {label, description} objects, 2-5 items, for choice mode) or placeholder (string, for text mode). For answerMode "text", ALWAYS include placeholder (short Indonesian example). For answerMode "choice", use selectionMode "multiple" only when several choices naturally apply. options MUST be {label, description} objects — never string arrays or empty strings like ["", "", ""].
  - For type "image_upload": imageUpload object with id (string slug), question (Indonesian), hint (optional), selectionMode ("single" or "multiple"), purpose ("business-image" | "logo" | "reference"), and optional required. Use this card when you need the owner to upload one or more images (e.g. logo, product photos); the server keeps it optional so the user can skip.
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
- Use "build_recommendation" when every structural decision is resolved or the user explicitly accepts an early build. Keep asking a question otherwise. The server authorizes build readiness; model confidence does not. Never surface confidence percentages or field counts to the user.
- briefPatch and workspaceCard MUST be JSON objects (nested inside the tool call), NOT JSON-encoded strings. Never put a stringified JSON blob where an object belongs.

Output valid JSON only. Put the user-visible reply in assistantText, not as free chat prose.

${DISCUSS_SYSTEM_PROMPT}`;
}

/**
 * The tool returns the chat sentence and the card in one object, and nothing
 * made them agree: a turn shipped a message asking about visual style while
 * the card asked about price, so the owner answered a question they were never
 * shown. The card is what the owner actually answers, so it wins — the model's
 * acknowledgement is kept and its diverging question is replaced.
 */
export function alignAssistantTextWithCard(
  assistantText: string,
  card: Record<string, unknown> | null | undefined,
): string {
  const cardQuestion = cardQuestionOf(card);
  const text = assistantText.trim();
  if (!text) {
    return cardQuestion || ACKNOWLEDGED_FALLBACK;
  }
  if (cardQuestion) {
    if (normalizeForCompare(text).includes(normalizeForCompare(cardQuestion))) {
      return text;
    }
    const acknowledgement = acknowledgementOf(text);
    return acknowledgement
      ? `${acknowledgement} ${cardQuestion}`
      : cardQuestion;
  }
  // No card question to answer — a trailing question would send the owner
  // looking for an input that does not exist.
  if (!text.includes("?")) {
    return text;
  }
  return acknowledgementOf(text) || ACKNOWLEDGED_FALLBACK;
}

const ACKNOWLEDGED_FALLBACK = "Semua yang penting sudah aku catat.";

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

function normalizeForCompare(value: string): string {
  return value.toLowerCase().replaceAll(/\s+/gu, " ").trim();
}

/** Everything before the message's final question, normalised to end in a stop. */
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
