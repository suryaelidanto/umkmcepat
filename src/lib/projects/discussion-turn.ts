import { generateObject, jsonSchema, type UIMessage } from "ai";

import { getAiModel } from "@/lib/ai";
import {
  type BriefQuestion,
  type ProjectBrief,
  type ProjectBriefPatch,
  type WorkspaceCard,
  getMissingBriefFields,
  isBriefReady,
  mergeProjectBriefPatch,
} from "@/lib/projects/brief";
import {
  getTextFromUIMessage,
  type ProjectChatContext,
} from "@/lib/projects/chat-memory";

export type DiscussionTurnIntent =
  | "answer_only"
  | "ask_question"
  | "ready_to_build";

export type DiscussionTurn = {
  assistantMessage: string;
  briefPatch: ProjectBriefPatch;
  intent: DiscussionTurnIntent;
  workspaceCard: WorkspaceCard;
};

type AiDiscussionTurn = {
  assistantMessage: string;
  briefPatch?: ProjectBriefPatch;
  intent: DiscussionTurnIntent;
  questionCard?: {
    id: BriefQuestion["id"];
    options: Array<{ description: string; label: string }>;
    question: string;
    recommendedOptionLabel?: string;
    whyThisQuestionMatters?: string;
  };
  buildRecommendation?: {
    summary: string[];
    title: string;
  };
};

const discussionTurnJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["assistantMessage", "intent", "briefPatch"],
  properties: {
    assistantMessage: { type: "string", minLength: 2, maxLength: 700 },
    intent: { enum: ["answer_only", "ask_question", "ready_to_build"] },
    briefPatch: {
      type: "object",
      additionalProperties: false,
      properties: {
        businessName: { type: "string", maxLength: 120 },
        businessType: { type: "string", maxLength: 120 },
        offer: { type: "string", maxLength: 240 },
        targetCustomer: { type: "string", maxLength: 240 },
        contactOrCta: { type: "string", maxLength: 160 },
        stylePreference: { type: "string", maxLength: 180 },
        notes: {
          type: "array",
          maxItems: 8,
          items: { type: "string", minLength: 2, maxLength: 200 },
        },
      },
    },
    questionCard: {
      type: "object",
      additionalProperties: false,
      required: ["id", "question", "options", "recommendedOptionLabel"],
      properties: {
        id: {
          enum: [
            "businessType",
            "offer",
            "targetCustomer",
            "contactOrCta",
            "stylePreference",
          ],
        },
        question: { type: "string", minLength: 8, maxLength: 160 },
        whyThisQuestionMatters: {
          type: "string",
          minLength: 4,
          maxLength: 180,
        },
        recommendedOptionLabel: { type: "string", minLength: 2, maxLength: 48 },
        options: {
          type: "array",
          minItems: 3,
          maxItems: 5,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["label", "description"],
            properties: {
              label: { type: "string", minLength: 2, maxLength: 48 },
              description: { type: "string", minLength: 4, maxLength: 120 },
            },
          },
        },
      },
    },
    buildRecommendation: {
      type: "object",
      additionalProperties: false,
      required: ["title", "summary"],
      properties: {
        title: { type: "string", minLength: 4, maxLength: 80 },
        summary: {
          type: "array",
          minItems: 3,
          maxItems: 7,
          items: { type: "string", minLength: 2, maxLength: 120 },
        },
      },
    },
  },
};

export async function generateDiscussionTurn({
  brief,
  chatContext,
  latestUserText,
  messages,
  mode,
}: {
  brief: ProjectBrief;
  chatContext: ProjectChatContext;
  latestUserText: string;
  messages: UIMessage[];
  mode: "build" | "discuss";
}): Promise<DiscussionTurn> {
  const missingFields = getMissingBriefFields(brief);
  let repairNote = "";

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const result = await generateObject({
        model: getAiModel(),
        temperature: attempt === 1 ? 0.35 : 0.2,
        schema: jsonSchema<AiDiscussionTurn>(discussionTurnJsonSchema as never),
        system: `Kamu konsultan website profesional untuk UMKM Indonesia.
Gunakan gaya interview seperti skill grilling: tajam, satu keputusan per langkah, helpful, tidak bertele-tele.
Jangan tampilkan chain-of-thought.
Mode aktif: ${mode === "build" ? "Buat" : "Diskusi"}.

Aturan diskusi:
- Jika mode Diskusi dan masih ada field yang belum jelas, intent WAJIB ask_question dengan questionCard. Jangan answer_only untuk kasus ini.
- Jika ask_question, tanya SATU keputusan saja. Jangan tanya banyak cabang sekaligus.
- Jika ask_question, assistantMessage hanya konteks/saran singkat dan mengarahkan user memilih kartu. Jangan mengulang questionCard.question. Jangan menulis daftar opsi di assistantMessage.
- questionCard.options wajib 3-5 opsi spesifik untuk bisnis user, bukan template umum.
- Selalu beri recommendedOptionLabel yang cocok untuk user.
- Jika user punya kebutuhan detail/khusus, tetap beri opsi paling relevan dan biarkan UI menyediakan jawaban bebas.
- Jika code/system bisa menjawab, jangan tanyakan ke user.
- Jangan menyarankan build sebelum brief cukup jelas sekitar 80%.
- User-facing copy harus bahasa Indonesia.

Konteks tersembunyi:
${chatContext.systemContext}`,
        prompt: `Brief saat ini:\n${JSON.stringify(brief)}\n\nField yang belum jelas:\n${missingFields.join(", ") || "tidak ada"}\n\nPesan user terbaru:\n${latestUserText}\n\nRecent transcript:\n${formatMessages(messages)}\n\nReturn JSON sesuai schema.\n${repairNote}`,
      });

      return normalizeDiscussionTurn(result.object, brief);
    } catch (error) {
      repairNote = `\nPercobaan sebelumnya gagal validasi: ${(error as Error).message}. Buat ulang JSON yang valid. Jika masih ada field belum jelas, wajib ask_question dengan 3-5 options.`;
    }
  }

  throw new Error(
    "AI gagal membuat discussion turn valid setelah 3 percobaan.",
  );
}

export function createFallbackDiscussionTurn(
  brief: ProjectBrief,
): DiscussionTurn {
  if (isBriefReady(brief)) {
    return {
      assistantMessage:
        "Brief sudah cukup jelas untuk mulai dibangun. Saya sudah siapkan rangkuman arah websitenya.",
      briefPatch: {},
      intent: "ready_to_build",
      workspaceCard: buildRecommendationCard(brief),
    };
  }

  return {
    assistantMessage:
      "Saya sudah membaca kebutuhanmu. Saya akan bantu kunci satu keputusan dulu supaya arah websitenya jelas.",
    briefPatch: {},
    intent: "ask_question",
    workspaceCard: { type: "none" },
  };
}

function normalizeDiscussionTurn(
  turn: AiDiscussionTurn,
  brief: ProjectBrief,
): DiscussionTurn {
  const assistantMessage = turn.assistantMessage.trim();

  if (!assistantMessage) {
    throw new Error("Discussion turn tidak punya assistantMessage.");
  }

  if (turn.intent === "ready_to_build") {
    return {
      assistantMessage,
      briefPatch: turn.briefPatch || {},
      intent: "ready_to_build",
      workspaceCard: buildRecommendationCard(
        brief,
        turn.buildRecommendation?.title,
        turn.buildRecommendation?.summary,
      ),
    };
  }

  if (turn.intent === "ask_question") {
    if (!turn.questionCard) {
      throw new Error("ask_question wajib punya questionCard.");
    }

    const effectiveBrief = mergeProjectBriefPatch(brief, turn.briefPatch || {});
    const missingFields = new Set(getMissingBriefFields(effectiveBrief));

    if (!missingFields.has(turn.questionCard.id)) {
      throw new Error(
        "questionCard.id harus field yang masih belum jelas setelah briefPatch.",
      );
    }

    const options = normalizeOptions(turn.questionCard.options);

    if (options.length < 3) {
      throw new Error("questionCard wajib punya minimal 3 opsi valid.");
    }

    const recommendedOptionLabel =
      turn.questionCard.recommendedOptionLabel?.trim();

    if (
      !recommendedOptionLabel ||
      !options.some((option) => option.label === recommendedOptionLabel)
    ) {
      throw new Error(
        "recommendedOptionLabel harus cocok dengan salah satu opsi.",
      );
    }

    return {
      assistantMessage,
      briefPatch: turn.briefPatch || {},
      intent: "ask_question",
      workspaceCard: {
        type: "questions",
        questions: [
          {
            id: turn.questionCard.id,
            question: turn.questionCard.question.trim(),
            recommendedOptionLabel,
            whyThisQuestionMatters:
              turn.questionCard.whyThisQuestionMatters?.trim(),
            options,
          },
        ],
      },
    };
  }

  if (getMissingBriefFields(brief).length > 0) {
    throw new Error("Diskusi belum jelas wajib menghasilkan questionCard.");
  }

  return {
    assistantMessage,
    briefPatch: turn.briefPatch || {},
    intent: "answer_only",
    workspaceCard: { type: "none" },
  };
}

function normalizeOptions(
  options: Array<{ description: string; label: string }>,
) {
  const seen = new Set<string>();
  const result: Array<{ description: string; label: string }> = [];

  for (const option of options) {
    const label = option.label.trim().replace(/\s+/g, " ");
    const description = option.description.trim().replace(/\s+/g, " ");
    const key = label.toLowerCase();

    if (!label || !description || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push({ label, description });
  }

  return result.slice(0, 5);
}

function buildRecommendationCard(
  brief: ProjectBrief,
  title = "Brief sudah cukup jelas",
  summary?: string[],
): WorkspaceCard {
  return {
    type: "build_recommendation",
    title,
    summary:
      summary?.filter(Boolean).slice(0, 7) ||
      [
        brief.businessType,
        brief.offer,
        brief.targetCustomer,
        brief.contactOrCta,
        brief.stylePreference,
      ].filter(Boolean),
  };
}

function formatMessages(messages: UIMessage[]) {
  return messages
    .map((message) => {
      const text = getTextFromUIMessage(message);
      return text ? `${message.role}: ${text}` : "";
    })
    .filter(Boolean)
    .slice(-10)
    .join("\n\n");
}
