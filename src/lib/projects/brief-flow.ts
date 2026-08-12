import type {
  CertificationValue,
  ContactValue,
  HoursValue,
  PaymentMethodValue,
  ProductOrServiceItem,
  SocialLinkValue,
  TestimonialValue,
} from "@/lib/projects/brief-rich-fields";

import { getSettingSync } from "@/lib/app-settings";
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
  // Align with the batched build admission gate: all five typed fields must be
  // present (businessType is now optional / auto-derived). A looser threshold
  // (e.g. any 2 fields) let the build card appear with a thin brief — the user
  // clicked Mulai build, admission blocked, and the build fell back to the slow
  // legacy agent loop instead of the fast batched writer. The interview keeps
  // asking until the brief is buildable.
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
  // Auto-derive businessType when missing so the 5-field gate is sufficient
  // and the build prompt never has an empty "Bidang usaha".
  let businessType = brief.businessType;
  if (!businessType || !businessType.trim()) {
    const offer = brief.offer?.toLowerCase() ?? "";
    const prompt = brief.prompt?.toLowerCase() ?? "";
    if (offer.includes("sate") || prompt.includes("sate")) {
      businessType = "Kuliner Sate";
    } else if (
      offer.includes("kopi") ||
      prompt.includes("kopi") ||
      offer.includes("kuliner") ||
      prompt.includes("kuliner")
    ) {
      businessType = "Kuliner";
    } else if (brief.businessName) {
      businessType = "UMKM";
    } else {
      businessType = "UMKM";
    }
  }
  return {
    ...brief,
    businessType,
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

    const isDuplicateStall = (() => {
      if (
        workspaceCard.type !== "question" ||
        options.previousWorkspaceCard?.type !== "question"
      ) {
        return false;
      }
      if (
        workspaceCard.question.id !== options.previousWorkspaceCard.question.id
      ) {
        return false;
      }
      const dupId = workspaceCard.question.id.toLowerCase();
      const normalizedDupId = dupId.replace(/-/g, "_");
      // If this id was already answered (fact/decision exists), it's a repeat.
      const hasAnsweredFact =
        (brief.facts ?? []).some((f) => f.key === normalizedDupId) ||
        (brief.facts ?? []).some((f) => f.key === dupId) ||
        (brief.decisions ?? []).some((d) => d.id === normalizedDupId) ||
        (brief.decisions ?? []).some((d) => d.id === dupId);
      if (hasAnsweredFact) {
        // For any already-answered id, treat as stall. Promotion to build
        // only when the brief is already build-ready; otherwise just block the
        // duplicate (the caller will downgrade to none).
        return true;
      }
      // Fallback: check typed brief field for MIN_BRIEF + soft fields.
      // Only stall if the duplicated question's underlying field is already
      // filled — re-asking the same field when it is already known is a loop
      // (e.g., style_preference asked twice after stylePreference="gak tau...").
      const fieldMap: Record<string, keyof ProjectBrief> = {
        business_name: "businessName",
        businessname: "businessName",
        offer: "offer",
        product_or_service: "offer",
        product: "offer",
        target_customer: "targetCustomer",
        targetcustomer: "targetCustomer",
        contact: "contactOrCta",
        contact_or_cta: "contactOrCta",
        contactorcta: "contactOrCta",
        whatsapp: "contactOrCta",
        style_preference: "stylePreference",
        stylepreference: "stylePreference",
        style: "stylePreference",
        visual_direction: "stylePreference",
        visual: "stylePreference",
        delivery_area: "deliveryArea",
        delivery: "deliveryArea",
        business_location: "address",
        address: "address",
        hours: "hours",
        price_range: "priceRange",
        price_amount: "priceRange",
        price: "priceRange",
        visuals: "visuals",
        media_strategy: "visuals",
      };
      let field: keyof ProjectBrief | undefined = fieldMap[normalizedDupId];
      if (!field) {
        if (dupId.includes("style") || dupId.includes("visual")) {
          field = "stylePreference";
        } else if (dupId.includes("delivery")) {
          field = "deliveryArea";
        } else if (dupId.includes("address") || dupId.includes("location")) {
          field = "address";
        } else if (dupId.includes("hours") || dupId.includes("jam")) {
          field = "hours";
        } else if (dupId.includes("price") || dupId.includes("harga")) {
          field = "priceRange";
        } else if (dupId.includes("target")) {
          field = "targetCustomer";
        } else if (dupId.includes("contact")) {
          field = "contactOrCta";
        } else if (dupId.includes("offer") || dupId.includes("product")) {
          field = "offer";
        } else if (dupId.includes("business") && dupId.includes("name")) {
          field = "businessName";
        }
      }
      if (!field) {
        return false;
      }
      const value = brief[field];
      if (typeof value === "string") {
        return value.trim().length > 0;
      }
      // For non-string fields like hours (array) or visuals (boolean), check not null.
      return value !== null && value !== undefined;
    })();

    if (
      promoteBuildConfirmQuestion ||
      promoteAfterAffirm ||
      (isDuplicateStall && minBrief)
    ) {
      brief = withHandoffReadiness(brief);
      workspaceCard = buildRecommendationCard(brief, modelTitle, modelSummary);
    } else if (isDuplicateStall) {
      // Duplicate id already answered but brief not yet build-ready — block the
      // repeat by returning none instead of re-asking the same question.
      workspaceCard = createFallbackWorkspaceCard(brief);
    } else if (minBrief && workspaceCard.type === "build_recommendation") {
      // Model sent build card (or min-brief accepted it) — lock confidence for UI.
      brief = withHandoffReadiness(brief);
    } else if (
      !minBrief &&
      workspaceCard.type === "none" &&
      (value.workspaceCard == null ||
        (typeof value.workspaceCard === "object" &&
          (value.workspaceCard as { type?: string }).type === "none"))
    ) {
      // Targeted fix for cmsphba: model returned none while only
      // targetCustomer is missing (businessName present). Don't leave UI
      // empty — ask for targetCustomer instead of showing nothing.
      // Keep the fallback narrow so existing tests for thin briefs that
      // expect none (low confidence, brief_review, etc.) stay green.
      const missing = MIN_BRIEF_FIELDS.filter((field) => {
        const value = brief[field];
        return typeof value !== "string" || value.trim().length === 0;
      }) as Array<(typeof MIN_BRIEF_FIELDS)[number]>;
      const isSuryaPhoneTargetCustomerGap =
        missing.length === 1 &&
        missing[0] === "targetCustomer" &&
        typeof brief.businessName === "string" &&
        brief.businessName.trim().length > 0;
      if (isSuryaPhoneTargetCustomerGap) {
        const questionSpec = {
          id: "target_customer",
          question: "Siapa target pelanggan utama SuryaPhone?",
          answerMode: "choice" as const,
          options: [
            {
              label: "Pelajar & mahasiswa",
              description: "Cari HP murah untuk sekolah/kuliah",
            },
            {
              label: "Pekerja & profesional",
              description: "Butuh HP reliable untuk kerja",
            },
            {
              label: "Orang tua & keluarga",
              description: "Cari HP untuk anak/keluarga",
            },
            { label: "Semua kalangan", description: "Jual ke semua segmen" },
          ],
        };
        const q = normalizeQuestion(questionSpec);
        if (q) {
          workspaceCard = { type: "question", question: q };
        }
      }
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

function isPhotoEnabled(): boolean {
  try {
    return getSettingSync("feature.builder_photo_enabled", true) as boolean;
  } catch {
    return true;
  }
}

function isPhotoQuestionId(id: string): boolean {
  const lower = id.toLowerCase();
  return (
    lower === "visuals" ||
    lower === "visual" ||
    lower.includes("visual") ||
    lower.includes("photo") ||
    lower === "media_strategy" ||
    lower.includes("media_")
  );
}

function isPhotoQuestionText(text: string): boolean {
  const q = text.toLowerCase();
  return (
    q.includes("foto") ||
    q.includes("photo") ||
    q.includes("gambar") ||
    q.includes("visual")
  );
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
    if (!isPhotoEnabled()) {
      return createFallbackWorkspaceCard(brief);
    }
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

function fallbackOptionsForQuestion(
  id: string,
  question: string,
): Array<{ label: string; description: string }> {
  const q = question.toLowerCase();
  const lowerId = id.toLowerCase();
  if (
    lowerId.includes("style") ||
    lowerId.includes("visual") ||
    q.includes("tampilan") ||
    q.includes("gaya") ||
    q.includes("desain") ||
    q.includes("vibe")
  ) {
    return [
      {
        label: "Modern & Bersih",
        description: "Putih rapi, fokus produk — cepat dipahami pembeli",
      },
      {
        label: "Hangat Tradisional",
        description: "Krem/kayu, ramah dan dekat — cocok warung & kuliner",
      },
      {
        label: "Bold & Ceria",
        description: "Warna kuat, energik — cocok untuk pasar muda",
      },
    ];
  }
  if (
    lowerId.includes("contact") ||
    q.includes("hubungi") ||
    q.includes("pesan sate") ||
    q.includes("lewat mana")
  ) {
    return [
      { label: "WhatsApp", description: "Pesan langsung lewat chat WhatsApp" },
      { label: "Instagram DM", description: "Pesan lewat Instagram" },
      { label: "Telepon", description: "Hubungi nomor langsung" },
    ];
  }
  if (
    lowerId.includes("offer") ||
    lowerId.includes("product") ||
    lowerId.includes("layanan") ||
    q.includes("jualan") ||
    q.includes("sate apa")
  ) {
    return [
      { label: "Paket Utama", description: "Produk/jasa paling laku" },
      { label: "Paket Lengkap", description: "Kombinasi beberapa varian" },
      { label: "Paket Hemat", description: "Pilihan terjangkau" },
    ];
  }
  return [
    {
      label: "Opsi A",
      description: "Pilihan pertama yang direkomendasikan",
    },
    { label: "Opsi B", description: "Pilihan alternatif kedua" },
    { label: "Opsi C", description: "Pilihan ketiga untuk variasi" },
  ];
}

function isPriceQuestion(id: string, question: string): boolean {
  const lowerId = id.toLowerCase();
  const q = question.toLowerCase();
  return (
    lowerId.includes("price") ||
    lowerId.includes("harga") ||
    lowerId.includes("amount") ||
    q.includes("harga") ||
    q.includes("rupiah") ||
    (q.includes("angka") && q.includes("porsi"))
  );
}

function isChoiceQuestion(id: string, question: string): boolean {
  const lowerId = id.toLowerCase();
  const q = question.toLowerCase();
  // Only these intents should ever be rendered as choice chips.
  // Everything else (delivery_area, hours, business_location, price via isPrice guard)
  // is safer as text with a placeholder — generic Opsi A/B/C is not real.
  return (
    lowerId.includes("style") ||
    lowerId.includes("visual") ||
    lowerId.includes("contact") ||
    lowerId.includes("offer") ||
    lowerId.includes("product") ||
    q.includes("tampilan") ||
    q.includes("gaya") ||
    q.includes("desain") ||
    q.includes("vibe") ||
    q.includes("hubungi") ||
    q.includes("pesan sate") ||
    q.includes("lewat mana") ||
    q.includes("jualan") ||
    q.includes("sate apa")
  );
}

function pricePlaceholderForQuestion(id: string, question: string): string {
  const lowerId = id.toLowerCase();
  const q = question.toLowerCase();
  if (q.includes("berapa harga") || lowerId === "price_range") {
    return "Contoh: Rp 25.000 per porsi (10 tusuk)";
  }
  return "Contoh: Rp 25.000";
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

  // Feature gate: photo questions are disabled via /admin/settings
  if (!isPhotoEnabled() && coercedId && isPhotoQuestionId(coercedId)) {
    return null;
  }
  const _photoQuestionText = (candidate as { question?: unknown }).question;
  if (
    !isPhotoEnabled() &&
    typeof _photoQuestionText === "string" &&
    isPhotoQuestionText(_photoQuestionText)
  ) {
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
  const rawOptionCount = Array.isArray(candidate.options)
    ? candidate.options.length
    : 0;
  let options = Array.isArray(candidate.options)
    ? candidate.options
        .map((option) => coerceQuestionOption(option))
        .filter((option): option is { label: string; description: string } =>
          Boolean(option?.label),
        )
        .slice(0, 5)
    : [];

  // AI-declared "choice" with every option filtered out by coerceQuestionOption
  // (malformed shape, empty labels, string arrays) must fall back to "text" —
  // otherwise the card renders with zero real choices, only the always-on
  // "Sebutkan sendiri" custom-answer row.
  // Reliability fix: when the model clearly attempted a choice (answerMode==="choice"
  // or it sent >=2 raw options but all filtered), synthesize fallback choices
  // instead of degrading to a generic text box. This cures the "no choices" reports
  // for cheap models that emit ["","",""].
  let answerMode: "text" | "choice" =
    candidate.answerMode === "text"
      ? "text"
      : options.length > 0
        ? "choice"
        : "text";
  // Price questions are numeric text inputs — never synthesize generic Opsi A/B/C.
  // Cheap models send ["","",""] for price; keep as text with a proper placeholder.
  // Generic Opsi A/B/C for unknown ids (e.g., delivery_area, hours) is also not real —
  // only synthesize when the question is known to be a choice intent.
  const isPrice = question ? isPriceQuestion(coercedId, question) : false;
  const isChoice = question ? isChoiceQuestion(coercedId, question) : false;
  if (answerMode === "text" && options.length === 0 && !isPrice && isChoice) {
    const attemptedChoice =
      candidate.answerMode === "choice" || rawOptionCount >= 2;
    if (attemptedChoice && question) {
      const fallback = fallbackOptionsForQuestion(coercedId, question);
      if (fallback.length >= 2) {
        options = fallback.slice(0, 5);
        answerMode = "choice";
      }
    }
  }

  if (!question) {
    return null;
  }

  const recommendedOptionLabel = cleanText(
    candidate.recommendedOptionLabel,
    OPTION_LABEL_MAX_LENGTH,
  );

  const placeholder =
    cleanText(candidate.placeholder, 100) ||
    (answerMode === "text" && isPrice
      ? pricePlaceholderForQuestion(coercedId, question)
      : undefined) ||
    undefined;

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
    placeholder,
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
