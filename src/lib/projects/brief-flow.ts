import { jsonSchema } from "ai";

import {
  type BriefQuestion,
  type ProjectBrief,
  type WorkspaceCard,
  getBriefReadiness,
  isBriefQuestionId,
} from "@/lib/projects/brief";

const OPTION_LABEL_MAX_LENGTH = 120;
const OPTION_DESCRIPTION_MAX_LENGTH = 180;

export type WorkspaceTurnToolInput = {
  briefPatch?: {
    businessName?: string;
    businessType?: string;
    confidence?: number;
    contactOrCta?: string;
    decisions?: Array<{ answer?: string; id?: string; question?: string }>;
    facts?: Array<{ key?: string; label?: string; value?: string }>;
    forcedBuild?: { assumed?: unknown };
    notes?: string[];
    offer?: string;
    openQuestions?: string[];
    stylePreference?: string;
    targetCustomer?: string;
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
        businessName: { type: "string" },
        confidence: {
          type: "number",
          description:
            "AI-owned readiness confidence from 0 to 100. Use 95+ only when the user need is genuinely build-ready.",
        },
        stylePreference: { type: "string" },
        notes: { type: "array", items: { type: "string" } },
        openQuestions: {
          type: "array",
          description:
            "Material unresolved decisions that should be asked before recommending build.",
          items: { type: "string" },
        },
        facts: {
          type: "array",
          description:
            "Canonical facts learned from the user. Use stable keys like business_name, cuisine_type, opening_hours, address, whatsapp.",
          items: {
            type: "object",
            properties: {
              key: { type: "string" },
              label: { type: "string" },
              value: { type: "string" },
            },
          },
        },
        decisions: {
          type: "array",
          description:
            "Canonical user decisions. Add one item when the user answers the current workspace question.",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              question: { type: "string" },
              answer: { type: "string" },
            },
          },
        },
        forcedBuild: {
          type: "object",
          description:
            "Set only when the user explicitly forces build before confidence reaches 95.",
          properties: {
            assumed: { type: "array", items: { type: "string" } },
          },
        },
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
            answerMode: {
              type: "string",
              description:
                "Use 'text' for exact user-provided values like business name, WhatsApp number, address, opening hours, or menu names. Use 'choice' for decisions with useful options.",
              enum: ["choice", "text"],
            },
            recommendedOptionLabel: { type: "string" },
            selectionMode: {
              type: "string",
              description:
                "Use 'single' when the user should pick one path; use 'multiple' only when several options can be true at the same time.",
              enum: ["single", "multiple"],
            },
            placeholder: { type: "string" },
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
        actions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              prompt: { type: "string" },
            },
          },
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

  if (Array.isArray(patch.facts)) {
    next.facts = mergeBriefFacts(next.facts ?? [], patch.facts);
  }

  if (Array.isArray(patch.decisions)) {
    next.decisions = mergeBriefDecisions(next.decisions ?? [], patch.decisions);
  }

  if (Array.isArray(patch.notes)) {
    next.notes = [
      ...next.notes,
      ...patch.notes.map((note) => cleanText(note, 160)).filter(Boolean),
    ].slice(-12);
  }

  if (typeof patch.confidence === "number") {
    next.confidence = Math.min(100, Math.max(0, Math.round(patch.confidence)));
  }

  if (Array.isArray(patch.openQuestions)) {
    next.openQuestions = patch.openQuestions
      .map((question) => cleanText(question, 160))
      .filter(Boolean)
      .slice(-12);
  }

  if (patch.forcedBuild && typeof patch.forcedBuild === "object") {
    const assumed = Array.isArray(patch.forcedBuild.assumed)
      ? patch.forcedBuild.assumed
          .map((item) => cleanText(item, 160))
          .filter(Boolean)
          .slice(-12)
      : [];
    next.forcedBuild = assumed.length ? { assumed } : undefined;
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
  const workspaceCard = normalizeWorkspaceCard(value.workspaceCard, brief);

  return {
    brief: removeUnansweredActiveQuestionMemory(brief, workspaceCard),
    projectTitle: cleanText(value.projectTitle, 80),
    workspaceCard,
  };
}

export function createFallbackWorkspaceCard(
  _brief: ProjectBrief,
): WorkspaceCard {
  return { type: "none" };
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

  if (value.type === "brief_review") {
    return buildBriefReviewCard(
      brief,
      typeof value.title === "string" ? value.title : undefined,
      Array.isArray(value.summary)
        ? (value.summary as unknown[]).filter(
            (item): item is string => typeof item === "string",
          )
        : undefined,
      Array.isArray(value.actions)
        ? (value.actions as unknown[]).filter(
            (item): item is { label: string; prompt: string } =>
              Boolean(item) &&
              typeof item === "object" &&
              typeof (item as { label?: unknown }).label === "string" &&
              typeof (item as { prompt?: unknown }).prompt === "string",
          )
        : undefined,
    );
  }

  if (value.type === "build_recommendation") {
    const readiness = getBriefReadiness(brief);

    if (!readiness.ready && !brief.forcedBuild) {
      return buildBriefReviewCard(brief);
    }

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

  const aliasedQuestion = candidate as Partial<BriefQuestion> & {
    description?: unknown;
    title?: unknown;
  };
  const question =
    cleanText(candidate.question, 160) || cleanText(aliasedQuestion.title, 160);
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

  const answerMode = candidate.answerMode === "text" ? "text" : "choice";

  if (!question || (answerMode === "choice" && options.length < 2)) {
    return null;
  }

  const recommendedOptionLabel = cleanText(
    candidate.recommendedOptionLabel,
    OPTION_LABEL_MAX_LENGTH,
  );

  return {
    id: candidate.id,
    question,
    answerMode,
    options: answerMode === "text" ? [] : options,
    recommendedOptionLabel: options.some(
      (option) => option.label === recommendedOptionLabel,
    )
      ? recommendedOptionLabel
      : undefined,
    placeholder: cleanText(candidate.placeholder, 100) || undefined,
    selectionMode:
      candidate.selectionMode === "multiple" && answerMode === "choice"
        ? "multiple"
        : "single",
    whyThisQuestionMatters:
      cleanText(candidate.whyThisQuestionMatters, 180) ||
      cleanText(aliasedQuestion.description, 180) ||
      undefined,
  };
}

function buildBriefReviewCard(
  brief: ProjectBrief,
  title = "Rancangan sementara",
  summary?: string[],
  actions?: Array<{ label: string; prompt: string }>,
): WorkspaceCard {
  return {
    actions: (actions?.length ? actions : defaultReviewActions())
      .map((action) => ({
        label: cleanText(action.label, 60),
        prompt: cleanText(action.prompt, 160),
      }))
      .filter((action) => action.label && action.prompt)
      .slice(0, 4),
    summary: buildCardSummary(brief, summary),
    title: cleanText(title, 80) || "Rancangan sementara",
    type: "brief_review",
  };
}

function buildRecommendationCard(
  brief: ProjectBrief,
  title = "Brief sudah siap dibuild",
  summary?: string[],
): WorkspaceCard {
  return {
    type: "build_recommendation",
    title: cleanText(title, 80) || "Brief sudah siap dibuild",
    summary: buildCardSummary(brief, summary),
  };
}

function buildCardSummary(brief: ProjectBrief, summary?: string[]) {
  return (
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
      `Keyakinan AI: ${brief.confidence ?? 0}%`,
      ...(brief.openQuestions ?? []).map(
        (question) => `Masih perlu jelas: ${question}`,
      ),
    ].filter(Boolean)
  );
}

function defaultReviewActions() {
  return [
    {
      label: "Lanjut diskusi",
      prompt: "Ayo lanjut diskusi sampai AI yakin 95% sebelum build.",
    },
    {
      label: "Paksa build",
      prompt:
        "Saya mau paksa build sekarang walaupun AI belum 95% yakin. Tuliskan asumsi yang masih kamu pakai.",
    },
    {
      label: "Ubah penawaran",
      prompt: "Saya mau mengubah penawaran utama dulu.",
    },
    {
      label: "Ubah tampilan",
      prompt: "Saya mau mengubah arah visual website dulu.",
    },
    {
      label: "Tambah info penting",
      prompt: "Saya mau menambahkan detail penting sebelum build.",
    },
  ];
}

const BRIEF_PATCH_FIELDS = [
  "businessName",
  "businessType",
  "offer",
  "targetCustomer",
  "contactOrCta",
  "stylePreference",
] as const;

function getBriefPatchFields() {
  return BRIEF_PATCH_FIELDS;
}

function removeUnansweredActiveQuestionMemory(
  brief: ProjectBrief,
  workspaceCard: WorkspaceCard,
): ProjectBrief {
  if (workspaceCard.type !== "question") {
    return brief;
  }

  const activeId = workspaceCard.question.id;

  return {
    ...brief,
    facts: brief.facts?.filter((fact) => fact.key !== activeId),
    decisions: brief.decisions?.filter((decision) => decision.id !== activeId),
  };
}

function mergeBriefFacts(
  current: NonNullable<ProjectBrief["facts"]>,
  incoming: NonNullable<WorkspaceTurnToolInput["briefPatch"]>["facts"],
) {
  const byKey = new Map(current.map((item) => [item.key, item]));
  for (const item of incoming ?? []) {
    const key = cleanSlug(item.key);
    const label = cleanText(item.label, 80);
    const value = cleanText(item.value, 280);
    if (key && label && value) {
      byKey.set(key, { key, label, value });
    }
  }
  return [...byKey.values()].slice(-40);
}

function mergeBriefDecisions(
  current: NonNullable<ProjectBrief["decisions"]>,
  incoming: NonNullable<WorkspaceTurnToolInput["briefPatch"]>["decisions"],
) {
  const byId = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming ?? []) {
    const id = cleanSlug(item.id);
    const question = cleanText(item.question, 160);
    const answer = cleanText(item.answer, 280);
    if (id && question && answer) {
      byId.set(id, { id, question, answer });
    }
  }
  return [...byId.values()].slice(-40);
}

function cleanSlug(value: unknown) {
  return cleanText(value, 80)
    .toLowerCase()
    .replace(/[^a-z0-9_ -]+/g, "")
    .replace(/[ -]+/g, "_");
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
