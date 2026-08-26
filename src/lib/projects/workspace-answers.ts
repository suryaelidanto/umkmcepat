import {
  type BriefQuestion,
  type ProjectBriefPatch,
  type WorkspaceCard,
  isBriefQuestionId,
} from "@/lib/projects/brief";
import { PHONE_RE } from "@/lib/projects/brief-rich-fields";

export type WorkspaceAnswerPayload = {
  answer: string;
  question?: string;
  questionId: BriefQuestion["id"];
  source?: "custom" | "option";
  assetIds?: string[];
};

export function buildBriefPatchFromWorkspaceAnswers({
  card,
  fallbackText,
  workspaceAnswers,
}: {
  card: WorkspaceCard;
  fallbackText: string;
  workspaceAnswers: unknown;
}): ProjectBriefPatch {
  if (card.type === "image_upload") {
    return buildImageUploadPatch(card, workspaceAnswers);
  }
  if (card.type !== "question") {
    return {};
  }

  const questions = [card.question];
  const answers = parseWorkspaceAnswers(workspaceAnswers);
  const normalizedAnswers = answers.length
    ? answers
    : parseFormattedWorkspaceAnswers(fallbackText, questions);

  if (!normalizedAnswers.length) {
    return {};
  }

  const activeQuestions = new Map(
    questions.map((question) => [question.id, question]),
  );
  const patch: ProjectBriefPatch = {};

  for (const answer of normalizedAnswers) {
    const question = activeQuestions.get(answer.questionId);

    if (!question) {
      continue;
    }

    const value = normalizeAnswer(answer.answer);

    if (!value) {
      continue;
    }

    patch.decisions = [
      ...(patch.decisions ?? []),
      { id: answer.questionId, question: question.question, answer: value },
    ];
    patch.facts = [
      ...(patch.facts ?? []),
      { key: answer.questionId, label: question.question, value },
    ];

    if (isContactWhatsappId(answer.questionId)) {
      const normalizedPhone = normalizePhoneValue(value);
      if (normalizedPhone && PHONE_RE.test(normalizedPhone)) {
        patch.contact = {
          channel: "whatsapp",
          value: normalizedPhone,
        };
        patch.contactOrCta = value;
      } else if (value) {
        patch.contactOrCta = value;
      }
    } else if (isLegacyBriefPatchField(answer.questionId)) {
      patch[answer.questionId] = value;
    } else {
      const promotedField = QUESTION_ID_TO_BRIEF_FIELD[answer.questionId] as
        | "businessName"
        | "businessType"
        | "offer"
        | "targetCustomer"
        | "contactOrCta"
        | "stylePreference"
        | "priceRange"
        | "deliveryArea"
        | "address"
        | "tagline"
        | undefined;
      if (promotedField) {
        if (
          promotedField === "contactOrCta" &&
          PHONE_RE.test(normalizePhoneValue(value) ?? "")
        ) {
          const normalizedPhone = normalizePhoneValue(value);
          if (normalizedPhone) {
            patch.contact = {
              channel: "whatsapp",
              value: normalizedPhone,
            };
          }
        }
        patch[promotedField] = value;
      } else {
        patch.notes = [
          ...(patch.notes ?? []),
          `${question.question}: ${value}`,
        ];
      }
    }
  }

  return patch;
}

const QUESTION_ID_TO_BRIEF_FIELD: Record<string, string> = {
  business_name: "businessName",
  business_type: "businessType",
  primary_offer: "offer",
  offer: "offer",
  product_or_service: "offer",
  target_customer: "targetCustomer",
  contact: "contactOrCta",
  primary_contact: "contactOrCta",
  contact_or_cta: "contactOrCta",
  whatsapp: "contactOrCta",
  visual_direction: "stylePreference",
  style_preference: "stylePreference",
  price_range: "priceRange",
  delivery_area: "deliveryArea",
  address: "address",
  tagline: "tagline",
};

function buildImageUploadPatch(
  card: Extract<WorkspaceCard, { type: "image_upload" }>,
  workspaceAnswers: unknown,
): ProjectBriefPatch {
  const answers = parseWorkspaceAnswers(workspaceAnswers);
  const assetIds: string[] = [];
  for (const answer of answers) {
    if (answer.questionId !== card.imageUpload.id) {
      continue;
    }
    if (Array.isArray(answer.assetIds)) {
      for (const id of answer.assetIds) {
        const normalized = normalizeAssetId(id);
        if (normalized && !assetIds.includes(normalized)) {
          assetIds.push(normalized);
        }
      }
    }
  }
  if (!assetIds.length) {
    return {};
  }
  return {
    businessImages: assetIds.map((id) => ({
      id,
      purpose: card.imageUpload.purpose,
    })),
  };
}

function normalizeAssetId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim().slice(0, 1024);
  return trimmed ? trimmed : null;
}

function parseWorkspaceAnswers(value: unknown): WorkspaceAnswerPayload[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const answers: WorkspaceAnswerPayload[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const input = item as Partial<WorkspaceAnswerPayload>;

    if (!isBriefQuestionId(input.questionId)) {
      continue;
    }

    const answer = normalizeAnswer(input.answer);

    if (!answer && !input.assetIds?.length) {
      continue;
    }

    answers.push({
      answer,
      question: normalizeAnswer(input.question) || undefined,
      questionId: input.questionId,
      source: input.source === "custom" ? "custom" : "option",
      assetIds: Array.isArray(input.assetIds)
        ? input.assetIds.filter(isStringValue).slice(0, 12)
        : undefined,
    });
  }

  return answers.slice(0, 3);
}

function isStringValue(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseFormattedWorkspaceAnswers(
  text: string,
  questions: BriefQuestion[],
): WorkspaceAnswerPayload[] {
  const normalizedText = text.trim();

  if (!normalizedText) {
    return [];
  }

  const blocks = normalizedText
    .split(/\n\s*\n/g)
    .map((block) => block.trim())
    .filter(Boolean);

  const answers: WorkspaceAnswerPayload[] = [];

  for (const [index, block] of blocks.entries()) {
    const match = block.match(
      /^\s*(\d+)\.\s*(.*?)\s*\n\s*Jawaban:\s*([\s\S]+)$/i,
    );
    const question = questions[index];

    if (!match || !question) {
      continue;
    }

    const questionText = normalizeAnswer(match[2]);
    const storedQuestionText = normalizeAnswer(question.question);

    if (
      questionText &&
      storedQuestionText &&
      questionText !== storedQuestionText &&
      !questionTextLooksLikeField(questionText, question.id)
    ) {
      continue;
    }

    answers.push({
      answer: normalizeAnswer(match[3]),
      question: storedQuestionText,
      questionId: question.id,
      source: "custom",
    });
  }

  if (!answers.length && questions.length === 1) {
    const hasNumberedQuestion = /^\s*\d+\./m.test(normalizedText);
    const answerMatch = normalizedText.match(/Jawaban:\s*([\s\S]+)$/i);
    const answer = answerMatch ? answerMatch[1] : normalizedText;

    if (answer) {
      if (hasNumberedQuestion) {
        // If it starts with a numbered question block, we must only parse it if the question text matches or matches structurally
        const firstBlock = normalizedText.split(/\n\s*\n/g)[0]?.trim();
        const match = firstBlock?.match(
          /^\s*(\d+)\.\s*(.*?)\s*\n\s*Jawaban:\s*([\s\S]+)$/i,
        );
        if (match) {
          const questionText = normalizeAnswer(match[2]);
          const storedQuestionText = normalizeAnswer(questions[0].question);
          if (
            !questionText ||
            !storedQuestionText ||
            (questionText !== storedQuestionText &&
              !questionTextLooksLikeField(questionText, questions[0].id))
          ) {
            return [];
          }
        } else {
          return [];
        }
      }

      answers.push({
        answer: normalizeAnswer(answer),
        question: normalizeAnswer(questions[0].question),
        questionId: questions[0].id,
        source: "custom",
      });
    }
  }

  return answers.filter((answer) => answer.answer).slice(0, 3);
}

function isLegacyBriefPatchField(
  value: string,
): value is
  | "businessType"
  | "offer"
  | "targetCustomer"
  | "contactOrCta"
  | "stylePreference" {
  return [
    "businessType",
    "offer",
    "targetCustomer",
    "contactOrCta",
    "stylePreference",
  ].includes(value);
}

function questionTextLooksLikeField(
  questionText: string,
  field: BriefQuestion["id"],
) {
  const patterns: Record<string, RegExp> = {
    businessType: /(jenis|bidang).*(usaha|bisnis)|bisnis apa|usaha apa/i,
    contactOrCta: /(whatsapp|kontak|pesan|hubungi|order|aksi|cta)/i,
    offer: /(produk|jasa|menu|layanan|tawaran|jual)/i,
    stylePreference: /(gaya|visual|warna|tampilan|desain|nuansa)/i,
    targetCustomer: /(target|pelanggan|pembeli|customer|siapa)/i,
  };

  return patterns[field]?.test(questionText) ?? false;
}

function isContactWhatsappId(id: string): boolean {
  const lower = id.toLowerCase();
  return (
    lower === "contact_whatsapp" ||
    lower === "contact-whatsapp" ||
    lower === "whatsapp_number" ||
    lower === "whatsapp-contact" ||
    lower.includes("whatsapp")
  );
}

function normalizePhoneValue(value: string): string | null {
  const trimmed = value.trim();
  const match = trimmed.match(/\+?\d[\d\s-]{6,}/);
  if (!match) {
    return null;
  }
  const normalized = match[0].replace(/[\s-]/g, "");
  return normalized.length >= 7 ? normalized : null;
}

function normalizeAnswer(value: unknown) {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").slice(0, 280)
    : "";
}
