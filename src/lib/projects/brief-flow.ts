import { jsonSchema } from "ai";

import {
  type BriefQuestion,
  type ProjectBrief,
  type WorkspaceCard,
  getMissingBriefFields,
  isBriefQuestionId,
} from "@/lib/projects/brief";

const BRIEF_FIELD_LABELS: Record<BriefQuestion["id"], string> = {
  businessType: "jenis usaha",
  offer: "produk atau layanan utama",
  targetCustomer: "target pembeli",
  contactOrCta: "aksi utama pengunjung",
  stylePreference: "arah visual website",
};
const OPTION_LABEL_MAX_LENGTH = 120;
const OPTION_DESCRIPTION_MAX_LENGTH = 180;

export type WorkspaceTurnToolInput = {
  briefPatch?: Partial<Pick<ProjectBrief, BriefQuestion["id"]>> & {
    notes?: string[];
  };
  projectTitle?: string;
  workspaceCard?: WorkspaceCard;
};

// The tool input is a best-effort side channel. The schema stays intentionally
// permissive (no strict mode, no length/enum/required constraints) so a slightly
// malformed model output never fails the whole turn. The server is the single
// authority that validates, normalizes, and falls back. See normalizeWorkspaceTurn.
export const workspaceTurnToolInputSchema = jsonSchema<WorkspaceTurnToolInput>({
  type: "object",
  properties: {
    briefPatch: {
      type: "object",
      description:
        "Known brief fields captured so far. Fill only what the user has actually decided. Leave unknown fields out.",
      properties: {
        businessType: { type: "string" },
        offer: { type: "string" },
        targetCustomer: { type: "string" },
        contactOrCta: { type: "string" },
        stylePreference: { type: "string" },
        notes: { type: "array", items: { type: "string" } },
      },
    },
    projectTitle: {
      type: "string",
      description:
        "A concise, specific Indonesian project name useful in a dashboard.",
    },
    workspaceCard: {
      type: "object",
      description:
        "Interactive UI card. Use type 'question' to ask the next single decision while clarifying, or type 'build_recommendation' once the brief is fully clear.",
      properties: {
        type: { type: "string" },
        question: {
          type: "object",
          description:
            "Exactly one decision to ask this turn, with 3-5 specific options.",
          properties: {
            id: { type: "string" },
            question: { type: "string" },
            recommendedOptionLabel: { type: "string" },
            selectionMode: {
              type: "string",
              description:
                "Use 'single' when the user should pick one path; use 'multiple' only when several options can be true at the same time.",
              enum: ["single", "multiple"],
            },
            whyThisQuestionMatters: { type: "string" },
            options: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  label: { type: "string" },
                  description: { type: "string" },
                },
              },
            },
          },
        },
        title: { type: "string" },
        summary: {
          type: "array",
          description:
            "Flexible implementation spec shaped by the user's real needs. Avoid fixed template labels.",
          items: { type: "string" },
        },
      },
    },
  },
});

export function applyBriefPatch(
  brief: ProjectBrief,
  patch: WorkspaceTurnToolInput["briefPatch"],
): ProjectBrief {
  if (!patch || typeof patch !== "object") {
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

// Single authority for turning best-effort model output into a valid turn.
// Never throws: any malformed input degrades to a deterministic fallback card.
export function normalizeWorkspaceTurn(
  input: unknown,
  fallbackBrief: ProjectBrief,
) {
  const value =
    input && typeof input === "object" ? (input as WorkspaceTurnToolInput) : {};
  const brief = applyBriefPatch(fallbackBrief, value.briefPatch);

  return {
    brief,
    projectTitle: cleanText(value.projectTitle, 80),
    workspaceCard: normalizeWorkspaceCard(value.workspaceCard, brief),
  };
}

export function createFallbackWorkspaceCard(
  brief: ProjectBrief,
): WorkspaceCard {
  const nextField = getMissingBriefFields(brief)[0];

  if (!nextField) {
    return { type: "none" };
  }

  return {
    type: "question",
    question: buildFallbackQuestion(nextField, brief),
  };
}

export function createPendingWorkspaceCard(brief: ProjectBrief): WorkspaceCard {
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

  return normalizeWorkspaceCard(card, brief);
}

function normalizeWorkspaceCard(
  card: unknown,
  brief: ProjectBrief,
): WorkspaceCard {
  if (!card || typeof card !== "object") {
    return createFallbackWorkspaceCard(brief);
  }

  const value = card as Partial<WorkspaceCard> & {
    question?: unknown;
    // Backward compatibility: older stored cards used a questions[] array.
    questions?: unknown;
  };

  if (value.type === "build_recommendation") {
    const summary = Array.isArray(value.summary)
      ? (value.summary as unknown[]).filter(
          (item): item is string => typeof item === "string",
        )
      : undefined;
    return buildRecommendationCard(
      brief,
      typeof value.title === "string" ? value.title : undefined,
      summary,
    );
  }

  const rawQuestion =
    value.question ??
    (Array.isArray(value.questions) ? value.questions[0] : undefined);
  const question = normalizeQuestion(rawQuestion);

  return question
    ? { type: "question", question }
    : createFallbackWorkspaceCard(brief);
}

function normalizeQuestion(raw: unknown): BriefQuestion | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const candidate = raw as Partial<BriefQuestion>;

  if (!isBriefQuestionId(candidate.id)) {
    return null;
  }

  const question = cleanText(candidate.question, 160);
  const options = Array.isArray(candidate.options)
    ? candidate.options
        .filter(
          (option): option is { label: string; description: string } =>
            Boolean(option) && typeof option === "object",
        )
        .map((option) => ({
          label: cleanText(option.label, OPTION_LABEL_MAX_LENGTH),
          description: cleanText(
            option.description,
            OPTION_DESCRIPTION_MAX_LENGTH,
          ),
        }))
        .filter((option) => option.label && option.description)
        .slice(0, 5)
    : [];

  if (!question || options.length < 3) {
    return null;
  }

  const recommendedOptionLabel = cleanText(
    candidate.recommendedOptionLabel,
    OPTION_LABEL_MAX_LENGTH,
  );

  return {
    id: candidate.id,
    question,
    options,
    recommendedOptionLabel: options.some(
      (option) => option.label === recommendedOptionLabel,
    )
      ? recommendedOptionLabel
      : undefined,
    selectionMode:
      candidate.selectionMode === "multiple" ? "multiple" : "single",
    whyThisQuestionMatters:
      cleanText(candidate.whyThisQuestionMatters, 180) || undefined,
  };
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
    selectionMode: "single",
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
  if (typeof value !== "string") {
    return "";
  }

  const text = value
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, "")
    .trim()
    .replace(/\s+/g, " ");

  if (text.length <= maxLength) {
    return text;
  }

  const clipped = text.slice(0, maxLength);
  const lastSpace = clipped.lastIndexOf(" ");

  if (lastSpace >= Math.floor(maxLength * 0.72)) {
    return clipped
      .slice(0, lastSpace)
      .replace(/[([{,;:]+$/g, "")
      .trim();
  }

  return clipped.trim();
}
