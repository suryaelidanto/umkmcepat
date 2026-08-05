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
  type ImageUploadCard,
  type ImageUploadPurpose,
  type ProjectBrief,
  type WorkspaceCard,
  BRIEF_CONFIDENCE_THRESHOLD,
  isBriefQuestionId,
} from "@/lib/projects/brief";
import { unstringifyJsonObject } from "@/lib/projects/json-unstringify";
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
  for (const field of BRIEF_PATCH_FIELDS) {
    const value = cleanText(patch[field], 160);

    if (value) {
      next[field] = value;
    }
  }

  if (Array.isArray(patch.facts)) {
    next.facts = mergeBriefFacts(next.facts ?? [], patch.facts);
    // The discuss model frequently answers questions by only appending facts
    // (keys like business_name, primary_offer, contact) without mirroring them
    // into the typed brief fields (businessName, offer, contactOrCta). The
    // batched build admission + MIN_BRIEF_FIELDS gate depend on the typed
    // fields, so promote recognized fact keys deterministically — otherwise a
    // complete interview leaves the brief "thin" and every build falls back to
    // the slow legacy loop.
    for (const fact of patch.facts) {
      const key = cleanSlug(fact.key);
      const field = FACT_KEY_TO_BRIEF_FIELD[key] as
        (typeof BRIEF_PATCH_FIELDS)[number] | undefined;
      if (!field) {
        continue;
      }
      const value = cleanText(fact.value, 160);
      if (value && !next[field]) {
        next[field] = value;
      }
    }
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

export type NormalizeWorkspaceTurnOptions = {
  hasBuiltSite?: boolean;
  /** Last user message text this turn (affirm detection). */
  lastUserText?: string;
  /** Prior workspace card from project state, if any. */
  previousWorkspaceCard?: WorkspaceCard;
};

const BUILD_CONFIRM_ID_RE =
  /^(build_confirm|confirm_build|mulai_build|ready_build)$/i;
const BUILD_CONFIRM_COPY_RE =
  /langsung\s*bangun|mulai\s*bangun|bangun\s*website|build\s*now|siap\s*dibuild|mulai\s*buat/i;
const USER_AFFIRM_START_RE =
  /^(ya|iya|yoi|oke|ok|yes|yep|gas|lanjut|boleh|setuju|silakan|silahkan)\b/i;
const USER_AFFIRM_BUILD_RE =
  /langsung\s*bangun|bangun\s*aja|mulai\s*build|mulai\s*bangun|build\s*sekarang|udah\s*dulu|cukup(\s*sudah)?/i;

const MIN_BRIEF_FIELDS = [
  "businessName",
  "businessType",
  "offer",
  "targetCustomer",
  "contactOrCta",
  "stylePreference",
] as const;

/**
 * Deterministic mapping from the discuss model's fact keys (snake_case) to the
 * typed brief fields the batched build admission + MIN_BRIEF_FIELDS gate read.
 * The model stores answers as facts under these keys; without this promotion a
 * fully answered interview still yields a "thin" brief and every build falls
 * back to the slow legacy agent loop.
 */
const FACT_KEY_TO_BRIEF_FIELD: Record<string, string> = {
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

/** Basics known enough to show Mulai build (not model confidence). */
export function hasMinimumBriefForBuild(brief: ProjectBrief): boolean {
  const filled = MIN_BRIEF_FIELDS.filter((field) => {
    const value = brief[field];
    return typeof value === "string" && value.trim().length > 0;
  });
  // Align with the batched build admission gate: all six typed fields must be
  // present. A looser threshold (e.g. any 2 fields) let the build card appear
  // with a thin brief — the user clicked Mulai build, admission blocked, and
  // the build fell back to the slow legacy agent loop instead of the fast
  // batched writer. The interview keeps asking until the brief is buildable.
  return filled.length >= MIN_BRIEF_FIELDS.length;
}

export function isBuildConfirmQuestion(question: {
  id?: string;
  question?: string;
}): boolean {
  if (question.id && BUILD_CONFIRM_ID_RE.test(question.id.trim())) {
    return true;
  }
  if (
    typeof question.question === "string" &&
    BUILD_CONFIRM_COPY_RE.test(question.question)
  ) {
    return true;
  }
  return false;
}

export function isUserAffirmingBuild(text: string | undefined): boolean {
  if (!text || typeof text !== "string") {
    return false;
  }
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }
  return (
    USER_AFFIRM_START_RE.test(trimmed) || USER_AFFIRM_BUILD_RE.test(trimmed)
  );
}

function isBuildConfirmCard(card: WorkspaceCard | undefined): boolean {
  return card?.type === "question" && isBuildConfirmQuestion(card.question);
}

function withHandoffReadiness(brief: ProjectBrief): ProjectBrief {
  return {
    ...brief,
    confidence: Math.max(brief.confidence ?? 0, BRIEF_CONFIDENCE_THRESHOLD),
    openQuestions: [],
  };
}

// Single authority for turning best-effort model output into a valid turn.
// Never throws: malformed input becomes an explicit missing-card state so the
// caller can retry or surface recovery instead of inventing user-facing data.
export function normalizeWorkspaceTurn(
  input: unknown,
  fallbackBrief: ProjectBrief,
  options: NormalizeWorkspaceTurnOptions = {},
) {
  const value =
    input && typeof input === "object" ? (input as WorkspaceTurnToolInput) : {};
  // The combo model sometimes double-encodes briefPatch/workspaceCard as JSON
  // strings instead of nested objects. Un-stringify before applying so the
  // patch data isn't silently dropped (the tool schema also tolerates this shape,
  // but the server is the authority — see the design note above applyBriefPatch).
  let brief = applyBriefPatch(
    fallbackBrief,
    unstringifyJsonObject(value.briefPatch),
  );
  let workspaceCard = normalizeWorkspaceCard(
    unstringifyJsonObject(value.workspaceCard),
    brief,
  );

  // Server-side enforcement: once the site is built, never re-offer
  // build_recommendation (that restarts the interview handoff). Clarifying
  // questions (e.g. which color) are still allowed for post-build edits.
  if (options.hasBuiltSite && workspaceCard.type === "build_recommendation") {
    workspaceCard = createFallbackWorkspaceCard(brief);
  } else if (!options.hasBuiltSite) {
    // Reliable handoff: promote to build_recommendation when build-time is
    // clear so Mulai build appears. No force-build UI; no auto-generate.
    const minBrief = hasMinimumBriefForBuild(brief);
    const modelTitle =
      workspaceCard.type === "build_recommendation"
        ? workspaceCard.title
        : undefined;
    const modelSummary =
      workspaceCard.type === "build_recommendation"
        ? workspaceCard.summary
        : undefined;

    const promoteBuildConfirmQuestion =
      minBrief &&
      workspaceCard.type === "question" &&
      isBuildConfirmQuestion(workspaceCard.question);

    const promoteAfterAffirm =
      minBrief &&
      isUserAffirmingBuild(options.lastUserText) &&
      isBuildConfirmCard(options.previousWorkspaceCard);

    if (promoteBuildConfirmQuestion || promoteAfterAffirm) {
      brief = withHandoffReadiness(brief);
      workspaceCard = buildRecommendationCard(brief, modelTitle, modelSummary);
    } else if (minBrief && workspaceCard.type === "build_recommendation") {
      // Model sent build card (or min-brief accepted it) — lock confidence for UI.
      brief = withHandoffReadiness(brief);
    }
  }

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

// ponytail: required brief fields (AI must collect before build).
// Precompute rule engine enforces this; soft fields (stylePreference, etc.)
// are optional. The AI can mark additional fields required via tool-call.
export const REQUIRED_BRIEF_FIELD_IDS: ReadonlySet<string> = new Set([
  "businessType",
  "offer",
  "targetCustomer",
  "contactOrCta",
]);

const IMAGE_UPLOAD_PURPOSES = new Set<ImageUploadPurpose>([
  "business-image",
  "logo",
  "reference",
]);

export function createImageUploadCard(raw: unknown): ImageUploadCard | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const src = raw as Record<string, unknown>;
  if (src.type !== "image_upload") {
    return null;
  }
  const img = (src.imageUpload ?? {}) as Record<string, unknown>;
  const id = typeof img.id === "string" ? img.id.slice(0, 100) : "";
  const question =
    typeof img.question === "string" ? img.question.slice(0, 300) : "";
  if (!id || !question) {
    return null;
  }
  const purpose =
    typeof img.purpose === "string" &&
    IMAGE_UPLOAD_PURPOSES.has(img.purpose as ImageUploadPurpose)
      ? (img.purpose as ImageUploadPurpose)
      : "business-image";
  const selectionMode =
    img.selectionMode === "multiple" ? "multiple" : "single";
  const hint =
    typeof img.hint === "string" ? img.hint.slice(0, 180) : undefined;
  const required = img.required === true;
  return {
    type: "image_upload",
    imageUpload: { id, question, hint, selectionMode, purpose, required },
  };
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

// Legacy tolerance: older stored cards used a `type: "questions"` array.
// Collapse to the first valid question (single-question-per-turn model).
function normalizeQuestionsArray(
  raw: unknown,
  brief: ProjectBrief,
): WorkspaceCard {
  if (!Array.isArray(raw)) {
    return createFallbackWorkspaceCard(brief);
  }
  for (const item of raw) {
    const question = normalizeQuestion(item);
    if (question) {
      return { type: "question", question };
    }
  }
  return createFallbackWorkspaceCard(brief);
}

function normalizeWorkspaceCard(
  card: unknown,
  brief: ProjectBrief,
): WorkspaceCard {
  if (!card || typeof card !== "object") {
    return createFallbackWorkspaceCard(brief);
  }

  // type is kept loose (string) so legacy `type: "questions"` payloads from
  // the DB still match the runtime compare below for tolerance collapsing.
  const value = card as {
    type?: string;
    question?: unknown;
    // Backward compatibility: older stored cards used a questions[] array.
    questions?: unknown;
    imageUpload?: unknown;
    summary?: unknown;
    title?: unknown;
  };

  if (value.type === "image_upload") {
    return (
      createImageUploadCard({
        type: "image_upload",
        imageUpload: value.imageUpload,
      }) ?? createFallbackWorkspaceCard(brief)
    );
  }

  if (value.type === "questions") {
    return normalizeQuestionsArray(value.questions, brief);
  }

  if (value.type === "build_recommendation" || value.type === "brief_review") {
    const summary = Array.isArray(value.summary)
      ? (value.summary as unknown[]).filter(
          (item): item is string => typeof item === "string",
        )
      : undefined;
    const title = typeof value.title === "string" ? value.title : undefined;

    // Accept when minimum brief fields are known. The old confidence-only
    // readiness check (confidence 95 + no open questions) let the model emit
    // build_recommendation with an empty brief — the build then fell back to
    // the slow legacy loop instead of the fast batched writer. The typed
    // fields are what both the admission gate and MIN_BRIEF_FIELDS read.
    if (hasMinimumBriefForBuild(brief)) {
      return buildRecommendationCard(brief, title, summary);
    }

    // Insufficient brief: fall through to a nested question if present so
    // the interview keeps flowing. No force-build affordance.
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

  const answerMode =
    candidate.answerMode === "text"
      ? "text"
      : candidate.answerMode === "choice"
        ? "choice"
        : options.length > 0
          ? "choice"
          : "text";

  if (!question) {
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
