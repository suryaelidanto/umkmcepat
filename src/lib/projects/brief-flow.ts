import type {
  CertificationValue,
  ContactValue,
  HoursValue,
  PaymentMethodValue,
  ProductOrServiceItem,
  SocialLinkValue,
  TestimonialValue,
} from "@/lib/projects/brief-rich-fields";

import {
  type BriefQuestion,
  type ProjectBrief,
  type WorkspaceCard,
  getBriefReadiness,
  getMissingBriefFields,
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
    notes?: string[];
    offer?: string;
    openQuestions?: string[];
    stylePreference?: string;
    targetCustomer?: string;
    productOrService?: ProductOrServiceItem[];
    contact?: ContactValue;
    tagline?: string;
    usp?: string[];
    priceRange?: string;
    visuals?: boolean;
    hours?: HoursValue[];
    address?: string;
    deliveryArea?: string;
    since?: string;
    testimonials?: TestimonialValue[];
    certifications?: CertificationValue[];
    paymentMethods?: PaymentMethodValue[];
    socialLinks?: SocialLinkValue[];
    currentPromo?: string;
    secondaryCta?: { label: string; action: string };
  };
  projectTitle?: string;
  workspaceCard?: WorkspaceCard;
};

// The tool input is a best-effort side channel. The schema stays intentionally
// permissive (no strict mode, no length/enum/required constraints) so a slightly
// malformed model output never fails the whole turn. The server is the single
// authority that validates, normalizes, and falls back. See normalizeWorkspaceTurn.
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

  // Typed rich fields. Mirrors mergeProjectBriefPatch: non-empty arrays copy
  // through, empty arrays become explicit null. The validator scrubs bad data
  // downstream.
  if (Array.isArray(patch.productOrService)) {
    next.productOrService = patch.productOrService.length
      ? patch.productOrService
      : null;
  }
  if (patch.contact !== undefined && patch.contact !== null) {
    next.contact = patch.contact;
  }
  if (patch.tagline !== undefined && patch.tagline !== null) {
    next.tagline = cleanText(patch.tagline, 160) || null;
  }
  if (Array.isArray(patch.usp)) {
    const usp = patch.usp.map((item) => cleanText(item, 160)).filter(Boolean);
    next.usp = usp.length ? usp : null;
  }
  if (patch.priceRange !== undefined && patch.priceRange !== null) {
    next.priceRange = cleanText(patch.priceRange, 80) || null;
  }
  if (patch.visuals !== undefined && patch.visuals !== null) {
    next.visuals = patch.visuals === true;
  }
  if (Array.isArray(patch.hours)) {
    next.hours = patch.hours.length ? patch.hours : null;
  }
  if (patch.address !== undefined && patch.address !== null) {
    next.address = cleanText(patch.address, 200) || null;
  }
  if (patch.deliveryArea !== undefined && patch.deliveryArea !== null) {
    next.deliveryArea = cleanText(patch.deliveryArea, 160) || null;
  }
  if (patch.since !== undefined && patch.since !== null) {
    next.since = cleanText(patch.since, 40) || null;
  }
  if (Array.isArray(patch.testimonials)) {
    next.testimonials = patch.testimonials.length ? patch.testimonials : null;
  }
  if (Array.isArray(patch.certifications)) {
    next.certifications = patch.certifications.length
      ? patch.certifications
      : null;
  }
  if (Array.isArray(patch.paymentMethods)) {
    next.paymentMethods = patch.paymentMethods.length
      ? patch.paymentMethods
      : null;
  }
  if (Array.isArray(patch.socialLinks)) {
    next.socialLinks = patch.socialLinks.length ? patch.socialLinks : null;
  }
  if (patch.currentPromo !== undefined && patch.currentPromo !== null) {
    next.currentPromo = cleanText(patch.currentPromo, 200) || null;
  }
  if (patch.secondaryCta !== undefined && patch.secondaryCta !== null) {
    next.secondaryCta = patch.secondaryCta;
  }

  return next;
}

// Single authority for turning best-effort model output into a valid turn.
// Never throws: malformed input becomes an explicit missing-card state so the
// caller can retry or surface recovery instead of inventing user-facing data.
export function normalizeWorkspaceTurn(
  input: unknown,
  fallbackBrief: ProjectBrief,
) {
  const value =
    input && typeof input === "object" ? (input as WorkspaceTurnToolInput) : {};
  const brief = applyBriefPatch(fallbackBrief, value.briefPatch);
  const workspaceCard = normalizeWorkspaceCard(value.workspaceCard, brief);
  // Card type is the single source of truth for buildability: derive
  // readyForBuild from it instead of trusting a separate AI-set flag that
  // can drift out of sync (build_recommendation shown, readyForBuild false).
  const readyForBuild = workspaceCard.type === "build_recommendation";

  return {
    brief: removeUnansweredActiveQuestionMemory(brief, workspaceCard),
    projectTitle: cleanText(value.projectTitle, 80),
    workspaceCard,
    readyForBuild,
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

const FALLBACK_FIELD_QUESTIONS: Record<
  string,
  {
    question: string;
    answerMode: "choice" | "text";
    placeholder?: string;
    required?: boolean;
    options: Array<{ label: string; description: string }>;
  }
> = {
  businessType: {
    question: "Usahamu bidang apa?",
    answerMode: "choice",
    required: true,
    options: [
      { label: "Kuliner/F&B", description: "Warung makan, kafe, jajanan." },
      { label: "Jasa lokal", description: "Laundry, barber, servis." },
      { label: "Jasa online", description: "Desain, tulis, freelance." },
      { label: "Lainnya", description: "Tulis sendiri." },
    ],
  },
  offer: {
    question: "Produk/jasa utama yang dijual?",
    answerMode: "text",
    placeholder: "Contoh: nasi kotak harian",
    required: true,
    options: [],
  },
  targetCustomer: {
    question: "Pelanggan utamanya siapa?",
    answerMode: "text",
    placeholder: "Contoh: anak sekolah sekitar",
    required: true,
    options: [],
  },
  contactOrCta: {
    question: "Pakai apa buat dihubungi?",
    answerMode: "choice",
    required: true,
    options: [
      { label: "WhatsApp", description: "Chat langsung." },
      { label: "Telepon", description: "Telepon dulu." },
      { label: "Instagram", description: "DM Instagram." },
      { label: "Lainnya", description: "Tulis sendiri." },
    ],
  },
  stylePreference: {
    question: "Arah tampilan yang kamu suka?",
    answerMode: "choice",
    options: [
      { label: "Hangat & ramah", description: "Warna earthy, cozy." },
      { label: "Bersih & modern", description: "Minimalis, putih." },
      { label: "Ceria & cerah", description: "Warna terang, playful." },
      { label: "Lainnya", description: "Tulis sendiri." },
    ],
  },
};

// ponytail: required brief fields (AI must collect before build).
// Precompute rule engine enforces this; soft fields (stylePreference, etc.)
// are optional. The AI can mark additional fields required via tool-call.
export const REQUIRED_BRIEF_FIELD_IDS: ReadonlySet<string> = new Set([
  "businessType",
  "offer",
  "targetCustomer",
  "contactOrCta",
]);

// Last-resort card when every AI path produced type none. Derives up to 3
// questions from empty REQUIRED_BRIEF_FIELDS without calling the model, which
// matches the grilling principle that an inferable fact should not be re-asked
// of the AI. Never returns build_recommendation.
export function buildFallbackWorkspaceCardFromBrief(
  brief: ProjectBrief,
): WorkspaceCard {
  const missing = getMissingBriefFields(brief);
  if (missing.length === 0) {
    return createFallbackWorkspaceCard(brief);
  }

  const seen = new Set<string>();
  const questions: BriefQuestion[] = [];
  for (const field of missing) {
    if (seen.has(field)) {
      continue;
    }
    const spec = FALLBACK_FIELD_QUESTIONS[field];
    if (!spec) {
      continue;
    }
    seen.add(field);
    questions.push({
      id: field,
      question: spec.question,
      answerMode: spec.answerMode,
      options: spec.options,
      placeholder: spec.placeholder,
      required: spec.required ?? false,
    });
    if (questions.length === 3) {
      break;
    }
  }

  if (questions.length === 0) {
    return createFallbackWorkspaceCard(brief);
  }
  if (questions.length === 1) {
    return { type: "question", question: questions[0] };
  }
  return { type: "questions", questions };
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

function normalizeQuestionsArray(
  raw: unknown,
  brief: ProjectBrief,
): WorkspaceCard {
  if (!Array.isArray(raw)) {
    return createFallbackWorkspaceCard(brief);
  }

  const seenIds = new Set<string>();
  const questions: BriefQuestion[] = [];
  for (const item of raw) {
    const question = normalizeQuestion(item);
    if (!question) {
      continue;
    }
    if (seenIds.has(question.id)) {
      continue;
    }
    seenIds.add(question.id);
    questions.push(question);
    if (questions.length === 3) {
      break;
    }
  }

  if (questions.length === 0) {
    return createFallbackWorkspaceCard(brief);
  }
  if (questions.length === 1) {
    return { type: "question", question: questions[0] };
  }
  return { type: "questions", questions };
}

function normalizeWorkspaceCard(
  card: unknown,
  brief: ProjectBrief,
): WorkspaceCard {
  if (!card || typeof card !== "object") {
    return createFallbackWorkspaceCard(brief);
  }

  const value = card as {
    type?: WorkspaceCard["type"] | "brief_review";
    question?: unknown;
    // Backward compatibility: older stored cards used a questions[] array.
    questions?: unknown;
    summary?: unknown;
    title?: unknown;
  };

  if (value.type === "questions") {
    return normalizeQuestionsArray(value.questions, brief);
  }

  if (value.type === "build_recommendation" || value.type === "brief_review") {
    const readiness = getBriefReadiness(brief);

    if (readiness.ready) {
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

    // Below 95% confidence: discussion is not done. Fall through to a
    // question from the same tool output (the AI usually includes one) so
    // the interview keeps flowing. No brief_review card, no force-build
    // affordance.
    const rawQuestion =
      value.question ??
      (Array.isArray(value.questions) ? value.questions[0] : undefined);
    const question = normalizeQuestion(rawQuestion);

    return question
      ? { type: "question", question }
      : createFallbackWorkspaceCard(brief);
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

  const candidate = raw as Partial<BriefQuestion> & { id?: unknown };

  const coercedId =
    typeof candidate.id === "number"
      ? String(candidate.id)
      : typeof candidate.id === "string"
        ? candidate.id
        : undefined;

  if (!isBriefQuestionId(coercedId)) {
    return null;
  }

  const aliasedQuestion = candidate as Partial<BriefQuestion> & {
    description?: unknown;
    hint?: unknown;
    text?: unknown;
    title?: unknown;
  };
  const question =
    cleanText(candidate.question, 160) ||
    cleanText(aliasedQuestion.text, 160) ||
    cleanText(aliasedQuestion.title, 160);
  const options = Array.isArray(candidate.options)
    ? candidate.options
        .map((option) => coerceQuestionOption(option))
        .filter((option): option is { label: string; description: string } =>
          Boolean(option?.label),
        )
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
    id: coercedId,
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
      cleanText(aliasedQuestion.hint, 180) ||
      undefined,
    required:
      typeof candidate.required === "boolean"
        ? candidate.required
        : REQUIRED_BRIEF_FIELD_IDS.has(aliasedQuestion.id ?? ""),
  };
}

function coerceQuestionOption(
  option: unknown,
): { label: string; description: string } | null {
  if (typeof option === "string") {
    const label = cleanText(option, OPTION_LABEL_MAX_LENGTH);
    return label ? { label, description: "" } : null;
  }

  if (!option || typeof option !== "object") {
    return null;
  }

  const value = option as { label?: unknown; description?: unknown };
  const label = cleanText(value.label, OPTION_LABEL_MAX_LENGTH);
  if (!label) {
    return null;
  }
  return {
    label,
    description: cleanText(value.description, OPTION_DESCRIPTION_MAX_LENGTH),
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

// ponytail: rule engine precompute helpers (worth-to-try-lah).
// Returns true when the user message is too rich for a deterministic card —
// long, has entities (URL/phone/price/handle), or is a real question.
// In those cases the LLM path should run as before.
const ESCAPE_LONG_WORD_THRESHOLD = 8;
const ENTITY_HINT_RE =
  /(?:https?:\/\/|www\.|\d{2,}|rp\s?\d|@\w+|#\w+|\b(?:wa|whatsapp|instagram|ig|tiktok|tokopedia|shopee|gojek|grab)\b)/i;

export function shouldEscapeRuleEngine(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }
  const words = trimmed.split(/\s+/);
  if (words.length >= ESCAPE_LONG_WORD_THRESHOLD) {
    return true;
  }
  if (ENTITY_HINT_RE.test(trimmed)) {
    return true;
  }
  if (trimmed.includes("?") && words.length > 2) {
    return true;
  }
  return false;
}

const ACK_RE =
  /^(?:ok+|oke|baik|siap|sip|mantap|mantul|noted|lanjut|ayo|gas|ya+|yoi|terima\s*kasih|makasih|thanks?|thank\s*you|👍|🙏)\.?$/i;
const ACK_MAX_WORDS = 4;

export type AckReply = { reply: string };

// ponytail: ack short-circuit only when there is nothing left to ask. If
// fields are still missing, return null so the rule-engine precompute path
// runs instead and surfaces the next question.
export function detectAckMessage(
  text: string,
  brief: ProjectBrief,
): AckReply | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.includes("?")) {
    return null;
  }
  if (ENTITY_HINT_RE.test(trimmed)) {
    return null;
  }
  const words = trimmed.split(/\s+/);
  if (words.length > ACK_MAX_WORDS) {
    return null;
  }
  if (!ACK_RE.test(trimmed)) {
    return null;
  }
  if (getMissingBriefFields(brief).length > 0) {
    return null;
  }
  return { reply: pickAckReply(trimmed) };
}

function pickAckReply(text: string): string {
  if (/terima|makasih|thanks/i.test(text)) {
    return "Sama-sama!";
  }
  if (/lanjut|gas|ayo|noted|ok|oke|siap|sip/i.test(text)) {
    return "Oke, kita lanjut.";
  }
  return "Oke.";
}

export type RuleEngineDecision =
  { path: "ack"; reply: string } | { path: "rule-engine" } | { path: "llm" };

// ponytail: pure decision function for the precompute branch.
// Returns which path the discuss turn should take. Mirrors the inline logic
// in api.projects.preview.ts so it can be unit-tested without route deps.
export function decideRuleEngineDiscussPath({
  brief,
  confidence,
  existingUserTurns,
  incomingLength,
  text,
}: {
  brief: ProjectBrief;
  confidence: number;
  existingUserTurns: number;
  incomingLength: number;
  text: string;
}): RuleEngineDecision {
  if (incomingLength !== 1) {
    return { path: "llm" };
  }
  if (existingUserTurns > 1) {
    return { path: "llm" };
  }
  if (!text.trim()) {
    return { path: "llm" };
  }

  const ack = detectAckMessage(text, brief);
  if (ack) {
    return { path: "ack", reply: ack.reply };
  }

  if (confidence >= 30) {
    return { path: "llm" };
  }
  if (shouldEscapeRuleEngine(text)) {
    return { path: "llm" };
  }
  if (getMissingBriefFields(brief).length === 0) {
    return { path: "llm" };
  }
  return { path: "rule-engine" };
}

// ponytail: template fallback for AI-generated warm preface. If the AI call
// fails or times out, we still want a warm-but-templated lead-in. One short
// Indonesian sentence per card shape — no filler, no questions, no card content.
export function prefaceTemplateForCard(card: WorkspaceCard): string {
  if (card.type === "question") {
    return "Boleh aku tanya satu hal dulu?";
  }
  if (card.type === "questions") {
    return "Boleh aku tanya beberapa hal dulu?";
  }
  if (card.type === "build_recommendation") {
    return "Kira-kira udah siap nih. Mau gw bangun?";
  }
  return "Oke.";
}
