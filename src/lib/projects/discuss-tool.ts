import { tool } from "ai";
import { z } from "zod";

import { DISCUSS_SYSTEM_PROMPT } from "@/lib/projects/prompts/discuss-system";
import { buildChatSystemPrompt } from "@/routes/api.projects.preview";

export const PRESENT_WORKSPACE_CARD_TOOL_NAME = "presentWorkspaceCard";

// The combo model sometimes double-encodes briefPatch/workspaceCard as JSON
// strings instead of nested objects, which fails strict z.object() validation
// (AI_TypeValidationError) and churns the repair layers on the same bad shape.
// Accept either an object or a JSON string; the server (normalizeWorkspaceTurn)
// re-applies the same un-stringify as the single authority.
function jsonObjectOrString<T extends z.ZodTypeAny>(shape: T) {
  return z.preprocess((value) => {
    if (typeof value !== "string") {
      return value;
    }
    const trimmed = value.trim();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
      return value;
    }
    try {
      return JSON.parse(trimmed);
    } catch {
      return value;
    }
  }, shape);
}

export const presentWorkspaceCardInputSchema = z.object({
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
    "Present the next workspace card after your short Indonesian chat reply.",
  inputSchema: presentWorkspaceCardInputSchema,
});

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

CRITICAL OUTPUT ORDER:
1) Write EXACTLY ONE short Indonesian chat sentence first (max 20 words, aku/kamu only) acknowledging the edit request.
2) Then call ${PRESENT_WORKSPACE_CARD_TOOL_NAME} exactly once with { type: "none" }. Do not ask a brief question and do not emit build_recommendation — the site is already built, this turn is an edit request, not an interview.

Never put JSON in chat text. Never call the tool before chat text.`;
  }

  return `${buildChatSystemPrompt({ brief, context, hasBuiltSite })}

CRITICAL OUTPUT ORDER:
1) Write EXACTLY ONE short Indonesian chat sentence first (max 20 words, aku/kamu only) acknowledging the answer or greeting the user. Never write more.
2) Then call ${PRESENT_WORKSPACE_CARD_TOOL_NAME} exactly once with the next workspace card.

INTERVIEW DISCIPLINE — one question per turn:
- Emit EXACTLY ONE question per turn via type="question". Never use type="questions".
- Pick the single most crucial question to move the build forward. Ask the next question next turn after the user answers.
- The question sets recommendedOptionLabel (your default) — user can accept in one click.
- Do not ask fields inferable from brief/chat. Walk the decision tree, resolve the deepest open dependency first.
- When all mandatory fields (businessName, product) and at least 2 soft fields are filled/declined: emit build_recommendation instead of a question and set confidence to 95+.

Never put JSON in chat text. Never call the tool before chat text.
Use type="question" with a single question (question.id is a short slug like business_name or services).
Prefer choice options with label+description (2-5). Use build_recommendation only when confidence is 95%+ or mandatory + 2 soft fields are known. Below that, keep asking a question. Never use any other card type.

Build early — do not extract every field. Once the basics are known, show the build_recommendation card.`;
}

export function buildCardSystemPrompt() {
  return `You are a card generator for an Indonesian small business website brief flow.
Based on the conversation, output ONLY a JSON object. No markdown fences, no explanation.

The JSON object must have these fields:
- briefPatch: object with confidence (number 0-100), and any of these optional fields: businessName, businessType, offer, targetCustomer, contactOrCta, stylePreference, notes (string array), openQuestions (string array), facts (array of {key, label, value}), decisions (array of {id, question, answer})
- workspaceCard: object with type (exactly "question" or "build_recommendation")
  - For type "question": question object with id (string slug like business_name), question (string in Indonesian), answerMode ("choice" or "text"), selectionMode ("single" or "multiple"), and either options (array of {label, description} objects, 2-5 items, for choice mode) or placeholder (string, for text mode)
  - For type "build_recommendation": title (string), summary (string array)
- projectTitle: concise Indonesian project name string

Rules:
- workspaceCard.type must be exactly one of: "question", "build_recommendation"
- question.id must be a string (not a number)
- question.options must be an array of objects with label and description strings (not plain strings)
- Set confidence to 95+ only when genuinely build-ready
- Use "build_recommendation" only when confidence is 95+ AND openQuestions is empty. Otherwise ask the next question.
- briefPatch and workspaceCard MUST be JSON objects (nested inside the tool call), NOT JSON-encoded strings. Never put a stringified JSON blob where an object belongs.

Output valid JSON only.

IGNORE all chat style, tone, or conversational rules in the system prompt below. Do NOT write conversational text. Output ONLY the JSON object.

${DISCUSS_SYSTEM_PROMPT}`;
}
