import { generateObject, jsonSchema } from "ai";

import { getAiModel } from "@/lib/ai";
import {
  type BriefQuestion,
  type ProjectBrief,
  type WorkspaceCard,
  getMissingBriefFields,
  isBriefReady,
} from "@/lib/projects/brief";

const workspaceCardJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["type"],
  properties: {
    type: { enum: ["questions", "build_recommendation"] },
    questions: {
      type: "array",
      minItems: 1,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "question", "options"],
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
                description: { type: "string", minLength: 4, maxLength: 96 },
              },
            },
          },
        },
      },
    },
    title: { type: "string", minLength: 4, maxLength: 80 },
    summary: {
      type: "array",
      minItems: 3,
      maxItems: 7,
      items: { type: "string", minLength: 2, maxLength: 120 },
    },
  },
};

export function updateBriefFromAnswer(
  brief: ProjectBrief,
  text: string,
): ProjectBrief {
  const answer = text.trim();

  if (!answer) {
    return brief;
  }

  const next = { ...brief, notes: [...brief.notes] };
  const target = getMissingBriefFields(next)[0];

  if (target) {
    next[target] = answer;
  } else {
    next.notes = [...next.notes, answer].slice(-12);
  }

  return next;
}

export async function generateNextWorkspaceCard(
  brief: ProjectBrief,
): Promise<WorkspaceCard> {
  if (isBriefReady(brief)) {
    return buildRecommendationCard(brief);
  }

  const missingFields = getMissingBriefFields(brief);

  try {
    const result = await generateObject({
      model: getAiModel(),
      temperature: 0.4,
      schema: jsonSchema<WorkspaceCard>(workspaceCardJsonSchema as never),
      system:
        "Kamu product strategist UMKM Indonesia. Buat kartu UI JSON saja. Tidak boleh template umum. Semua opsi harus spesifik dari brief user. Bahasa Indonesia. Jangan pakai markdown.",
      prompt: `Brief saat ini:\n${JSON.stringify(brief)}\n\nField yang masih kosong: ${missingFields.join(", ")}\n\nTugas:\n- Jika masih ada field kosong, return type=questions.\n- Tanyakan maksimal 2 field terpenting.\n- id pertanyaan wajib salah satu field kosong.\n- Setiap opsi harus custom sesuai bisnis user, bukan kategori generik.\n- Untuk bakso, contoh opsi harus relevan seperti bakso urat, menu pedas, cabang, delivery, keluarga, pekerja sekitar, dll sesuai konteks.\n- Kalau brief sudah cukup, return type=build_recommendation.`,
    });

    return normalizeWorkspaceCard(result.object, brief);
  } catch {
    return getNextWorkspaceCard(brief);
  }
}

export function getNextWorkspaceCard(brief: ProjectBrief): WorkspaceCard {
  if (isBriefReady(brief)) {
    return buildRecommendationCard(brief);
  }

  return {
    type: "questions",
    questions: getMissingBriefFields(brief)
      .slice(0, 2)
      .map((field) => ({
        id: field,
        question: fallbackQuestion(field),
        options: [],
      })),
  };
}

function normalizeWorkspaceCard(
  card: WorkspaceCard,
  brief: ProjectBrief,
): WorkspaceCard {
  if (card.type === "build_recommendation") {
    return buildRecommendationCard(brief, card.title, card.summary);
  }

  const missing = new Set(getMissingBriefFields(brief));
  const questions = card.questions
    .filter((question) => missing.has(question.id))
    .slice(0, 2)
    .map((question) => ({
      ...question,
      question: question.question.trim(),
      options: question.options
        .filter((option) => option.label.trim())
        .slice(0, 5)
        .map((option) => ({
          label: option.label.trim(),
          description: option.description.trim(),
        })),
    }))
    .filter((question) => question.question && question.options.length >= 2);

  return questions.length
    ? { type: "questions", questions }
    : getNextWorkspaceCard(brief);
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

function fallbackQuestion(field: BriefQuestion["id"]) {
  return (
    {
      businessType: "Jenis usaha ini paling tepat disebut apa?",
      offer: "Apa produk atau layanan utama yang wajib tampil?",
      targetCustomer: "Siapa pelanggan utama yang ingin dituju?",
      contactOrCta: "Aksi utama pengunjung setelah melihat website apa?",
      stylePreference: "Gaya visual website yang kamu inginkan seperti apa?",
    } satisfies Record<BriefQuestion["id"], string>
  )[field];
}
