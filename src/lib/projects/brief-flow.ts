import { generateObject, jsonSchema } from "ai";

import { getAiModel } from "@/lib/ai";
import {
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
  let repairNote = "";

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const result = await generateObject({
        model: getAiModel(),
        temperature: attempt === 1 ? 0.35 : 0.2,
        schema: jsonSchema<WorkspaceCard>(workspaceCardJsonSchema as never),
        system:
          "Kamu product strategist UMKM Indonesia. Return HANYA structured JSON sesuai schema. Jangan markdown. Jangan template umum. Jangan opsi kosong. Semua pertanyaan dan opsi harus spesifik dari konteks user.",
        prompt: `Brief saat ini:\n${JSON.stringify(brief)}\n\nField yang masih kosong: ${missingFields.join(", ")}\n\nKontrak wajib:\n- Jika masih ada field kosong, return type=questions.\n- Buat 1-2 pertanyaan saja.\n- id pertanyaan wajib salah satu field kosong.\n- Setiap question.options wajib 3-5 item.\n- Setiap option.label wajib spesifik dan bisa langsung dipilih user.\n- Setiap option.description wajib menjelaskan konsekuensi pilihan untuk website.\n- Opsi harus dibuat just-in-time dari bisnis user, bukan preset kategori umum.\n- Jangan pakai opsi generic seperti "Katalog produk", "Layanan utama", "Anak muda", "Keluarga" kecuali user sendiri menyebut itu.\n- Untuk usaha sate, opsi harus relevan dengan sate: menu sate ayam/kambing/taichan, paket makan, catering/acara, lokasi/jam buka, delivery, target pelanggan sekitar, keluarga, kantor, acara, dll sesuai konteks.\n- Untuk usaha lain, sesuaikan setara spesifiknya.\n- Kalau brief sudah cukup, return type=build_recommendation.\n${repairNote}`,
      });

      return normalizeWorkspaceCard(result.object, brief);
    } catch (error) {
      repairNote = `\nPercobaan sebelumnya gagal validasi: ${(error as Error).message}. Buat ulang JSON yang valid dan lengkap.`;
    }
  }

  throw new Error(
    "AI gagal membuat kartu opsi yang valid setelah 3 percobaan.",
  );
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
    .filter((question) => question.question && question.options.length >= 3);

  if (!questions.length) {
    throw new Error("Kartu AI tidak punya pertanyaan dengan minimal 3 opsi.");
  }

  return { type: "questions", questions };
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
