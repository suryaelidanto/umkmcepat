import { jsonSchema } from "ai";

import {
  type BriefQuestion,
  type ProjectBrief,
  type WorkspaceCard,
  getMissingBriefFields,
  isBriefQuestionId,
  isBriefReady,
} from "@/lib/projects/brief";

const BRIEF_FIELD_LABELS: Record<BriefQuestion["id"], string> = {
  businessType: "jenis usaha",
  offer: "produk atau layanan utama",
  targetCustomer: "target pembeli",
  contactOrCta: "aksi utama pengunjung",
  stylePreference: "arah visual website",
};

export type WorkspaceTurnToolInput = {
  briefPatch?: Partial<Pick<ProjectBrief, BriefQuestion["id"]>> & {
    notes?: string[];
  };
  workspaceCard?: WorkspaceCard;
};

export const workspaceTurnToolInputSchema = jsonSchema<WorkspaceTurnToolInput>({
  type: "object",
  additionalProperties: false,
  properties: {
    briefPatch: {
      type: "object",
      additionalProperties: false,
      properties: {
        businessType: { type: "string", minLength: 2, maxLength: 120 },
        offer: { type: "string", minLength: 2, maxLength: 160 },
        targetCustomer: { type: "string", minLength: 2, maxLength: 160 },
        contactOrCta: { type: "string", minLength: 2, maxLength: 160 },
        stylePreference: { type: "string", minLength: 2, maxLength: 160 },
        notes: {
          type: "array",
          maxItems: 3,
          items: { type: "string", minLength: 2, maxLength: 160 },
        },
      },
    },
    workspaceCard: {
      type: "object",
      additionalProperties: false,
      required: ["type"],
      properties: {
        type: { enum: ["questions", "build_recommendation"] },
        questions: {
          type: "array",
          minItems: 1,
          maxItems: 2,
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
                    description: {
                      type: "string",
                      minLength: 4,
                      maxLength: 96,
                    },
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
    },
  },
});

export function applyBriefPatch(
  brief: ProjectBrief,
  patch: WorkspaceTurnToolInput["briefPatch"],
): ProjectBrief {
  if (!patch) {
    return brief;
  }

  const next = { ...brief, notes: [...brief.notes] };
  for (const field of getBriefPatchFields()) {
    const value = cleanText(patch[field], 160);

    if (value) {
      next[field] = value;
    }
  }

  if (Array.isArray(patch.notes)) {
    next.notes = [
      ...next.notes,
      ...patch.notes.map((note) => cleanText(note, 160)).filter(Boolean),
    ].slice(-12);
  }

  return next;
}

export function normalizeWorkspaceTurn(
  input: WorkspaceTurnToolInput | undefined,
  fallbackBrief: ProjectBrief,
) {
  const brief = applyBriefPatch(fallbackBrief, input?.briefPatch);

  return {
    brief,
    workspaceCard: normalizeWorkspaceCard(input?.workspaceCard, brief),
  };
}

export function createFallbackWorkspaceCard(
  brief: ProjectBrief,
): WorkspaceCard {
  if (isBriefReady(brief)) {
    return buildRecommendationCard(brief);
  }

  return {
    type: "questions",
    questions: getMissingBriefFields(brief)
      .slice(0, 2)
      .map((field) => buildFallbackQuestion(field, brief)),
  };
}

export function createPendingWorkspaceCard(brief: ProjectBrief): WorkspaceCard {
  return createFallbackWorkspaceCard(brief);
}

// ponytail: deterministic card ceiling = generic-but-valid; upgrade with richer local heuristics per vertical.
export function generateNextWorkspaceCard(brief: ProjectBrief) {
  return createFallbackWorkspaceCard(brief);
}

export function parseWorkspaceCard(
  value: unknown,
  brief: ProjectBrief,
): WorkspaceCard {
  if (!value || typeof value !== "object") {
    return createFallbackWorkspaceCard(brief);
  }

  const card = value as Partial<WorkspaceCard>;

  if (card.type === "none") {
    return createFallbackWorkspaceCard(brief);
  }

  if (card.type === "build_recommendation") {
    return normalizeWorkspaceCard(card as WorkspaceCard, brief);
  }

  if (card.type !== "questions") {
    return createFallbackWorkspaceCard(brief);
  }

  const questions = Array.isArray(card.questions)
    ? card.questions.filter(
        (question): question is BriefQuestion =>
          Boolean(question) &&
          typeof question === "object" &&
          isBriefQuestionId((question as BriefQuestion).id) &&
          typeof (question as BriefQuestion).question === "string" &&
          Array.isArray((question as BriefQuestion).options),
      )
    : [];

  return normalizeWorkspaceCard({ type: "questions", questions }, brief);
}

function normalizeWorkspaceCard(
  card: WorkspaceCard | undefined,
  brief: ProjectBrief,
): WorkspaceCard {
  if (!card) {
    return createFallbackWorkspaceCard(brief);
  }

  if (card.type === "build_recommendation") {
    return buildRecommendationCard(brief, card.title, card.summary);
  }

  if (card.type !== "questions") {
    return createFallbackWorkspaceCard(brief);
  }

  const missing = new Set(getMissingBriefFields(brief));
  const questions = card.questions
    .filter((question: BriefQuestion) => missing.has(question.id))
    .slice(0, 2)
    .map((question: BriefQuestion) => ({
      id: question.id,
      question: cleanText(question.question, 160),
      options: question.options
        .map((option: { label: string; description: string }) => ({
          label: cleanText(option.label, 48),
          description: cleanText(option.description, 96),
        }))
        .filter((option) => option.label && option.description)
        .slice(0, 5),
    }))
    .filter((question) => question.question && question.options.length >= 3);

  return questions.length
    ? { type: "questions", questions }
    : createFallbackWorkspaceCard(brief);
}

function buildFallbackQuestion(
  id: BriefQuestion["id"],
  brief: ProjectBrief,
): BriefQuestion {
  const business = brief.businessType || brief.prompt || "usaha kamu";
  const label = BRIEF_FIELD_LABELS[id];

  return {
    id,
    question: `Apa ${label} yang paling tepat untuk ${business}?`,
    options: fallbackOptions(id),
  };
}

function fallbackOptions(id: BriefQuestion["id"]) {
  if (id === "contactOrCta") {
    return [
      {
        label: "Pesan via WhatsApp",
        description:
          "Website diarahkan agar pengunjung cepat menghubungi kamu.",
      },
      {
        label: "Lihat menu dulu",
        description: "Website menonjolkan pilihan sebelum pengunjung memesan.",
      },
      {
        label: "Datang ke lokasi",
        description: "Website menonjolkan alamat, jam buka, dan rute.",
      },
    ];
  }

  if (id === "stylePreference") {
    return [
      {
        label: "Modern bersih",
        description: "Tampilan rapi, jelas, dan mudah dipercaya pembeli.",
      },
      {
        label: "Hangat lokal",
        description: "Tampilan terasa dekat, ramah, dan cocok untuk UMKM.",
      },
      {
        label: "Bold premium",
        description:
          "Tampilan lebih kuat untuk produk yang ingin terlihat unggul.",
      },
    ];
  }

  return [
    {
      label: "Produk utama",
      description: "Website fokus pada penawaran yang paling penting dijual.",
    },
    {
      label: "Paket praktis",
      description: "Website menonjolkan pilihan yang mudah dipahami pembeli.",
    },
    {
      label: "Keunggulan usaha",
      description: "Website menonjolkan alasan pembeli memilih usaha kamu.",
    },
  ];
}

function buildRecommendationCard(
  brief: ProjectBrief,
  title = "Brief sudah siap dibuild",
  summary?: string[],
): WorkspaceCard {
  return {
    type: "build_recommendation",
    title: cleanText(title, 80) || "Brief sudah siap dibuild",
    summary:
      summary
        ?.map((item) => cleanText(item, 120))
        .filter(Boolean)
        .slice(0, 7) ||
      [
        brief.businessType,
        brief.offer,
        brief.targetCustomer,
        brief.contactOrCta,
        brief.stylePreference,
      ].filter(Boolean),
  };
}

function getBriefPatchFields(): BriefQuestion["id"][] {
  return [
    "businessType",
    "offer",
    "targetCustomer",
    "contactOrCta",
    "stylePreference",
  ];
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").slice(0, maxLength)
    : "";
}
