import type {
  CertificationValue,
  ContactValue,
  HoursValue,
  PaymentMethodValue,
  ProductOrServiceItem,
  SocialLinkValue,
  TestimonialValue,
} from "@/lib/projects/brief-rich-fields";

import { getSettingSync } from "@/lib/config/app-settings";
import {
  type BriefQuestion,
  type ImageUploadCard,
  type ImageUploadPurpose,
  type ProjectBrief,
  type WorkspaceCard,
  groundProjectBriefToOwnerFacts,
  isBriefQuestionId,
} from "@/lib/projects/brief";
import { evaluateBuildReadiness } from "@/lib/projects/build-readiness";
import { parseCanonicalBrief } from "@/lib/projects/canonical-brief";
import { evaluateAdaptiveDiscussionReadiness } from "@/lib/projects/discussion-domains";
import {
  createEmptyFactLedger,
  createFactLedgerEntriesFromPatch,
  mergeFactLedger,
  normalizeFactLedger,
} from "@/lib/projects/fact-ledger";
import { unstringifyJsonObject } from "@/lib/projects/json-unstringify";
import { classifySafeCopy } from "@/lib/projects/safe-copy";
import { unslopUserFacingText } from "@/lib/projects/unslop-policy";
import { parseVisitorJobs, type VisitorJob } from "@/lib/projects/visitor-jobs";
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
    visitorJobs?: VisitorJob[];
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
    fieldState?: ProjectBrief["fieldState"];
    factLedger?: unknown;
  };
  projectTitle?: string;
  workspaceCard?: WorkspaceCard;
};

// The tool input is a best-effort side channel. The schema stays intentionally
export function applyBriefPatch(
  brief: ProjectBrief,
  patch: WorkspaceTurnToolInput["briefPatch"],
  context: { ownerTexts?: string[]; sourceTurnId?: string } = {},
): ProjectBrief {
  if (!patch || typeof patch !== "object") {
    return brief;
  }

  const next = {
    ...brief,
    notes: [...(brief.notes ?? [])],
    factLedger: normalizeFactLedger(brief.factLedger),
  };
  for (const field of BRIEF_PATCH_FIELDS) {
    const value = cleanText(patch[field], 160);

    if (value) {
      next[field] = value;
    }
  }

  if (patch.visitorJobs !== undefined) {
    const parsed = parseVisitorJobs(patch.visitorJobs);
    if (parsed.ok) {
      next.visitorJobs = parsed.value;
    }
  }

  if (Array.isArray(patch.facts)) {
    next.facts = mergeBriefFacts(next.facts ?? [], patch.facts);
    // The discuss model frequently answers questions by only appending facts
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
    if (patch.visuals === false) {
      next.fieldState = {
        ...(next.fieldState ?? {}),
        visuals: "declined",
      };
      next.decisions = mergeBriefDecisions(next.decisions ?? [], [
        { id: "business_photos", question: "Foto usaha", answer: "Lewati." },
        { id: "visuals", question: "Foto usaha", answer: "Lewati." },
      ]);
      next.facts = mergeBriefFacts(next.facts ?? [], [
        {
          key: "business_photos",
          label: "Foto usaha",
          value: "Tidak ada foto (dilewati)",
        },
        {
          key: "visuals",
          label: "Foto usaha",
          value: "Tidak ada foto (dilewati)",
        },
      ]);
    }
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
  if (patch.fieldState) {
    next.fieldState = { ...(next.fieldState ?? {}), ...patch.fieldState };
  }

  const patchRecord = patch as unknown as Record<string, unknown>;
  const ledgerEntries = createFactLedgerEntriesFromPatch(patchRecord);
  const rawLedger = patch.factLedger;
  const incomingLedgerEntries =
    rawLedger && typeof rawLedger === "object" && !Array.isArray(rawLedger)
      ? (rawLedger as { entries?: unknown }).entries
      : undefined;
  const allLedgerEntries = [
    ...ledgerEntries,
    ...(Array.isArray(incomingLedgerEntries) ? incomingLedgerEntries : []),
  ];
  if (patch.visuals === false) {
    allLedgerEntries.push({
      id: "visuals-primary",
      field: "visuals",
      label: "Foto usaha",
      value: null,
      state: "declined",
      source: "owner",
      sourceTurnId: context.sourceTurnId ?? null,
    });
  }
  if (allLedgerEntries.length > 0) {
    next.factLedger = mergeFactLedger(
      next.factLedger ?? createEmptyFactLedger(),
      allLedgerEntries,
      {
        ownerTexts: context.ownerTexts ?? [],
        sourceTurnId: context.sourceTurnId,
      },
    );
  }

  return next;
}

export type NormalizeWorkspaceTurnOptions = {
  hasBuiltSite?: boolean;
  hasPendingUpdate?: boolean;
  lastUserText?: string;
  preflight?: "build" | "update";
  ownerTexts?: string[];
  previousWorkspaceCard?: WorkspaceCard;
  sourceTurnId?: string;
};

const BUILD_CONFIRM_ID_RE =
  /^(build_confirm|confirm_build|mulai_build|ready_build)$/i;
const BUILD_CONFIRM_COPY_RE =
  /langsung\s*bangun|mulai\s*bangun|bangun\s*website|build\s*now|siap\s*dibuild|mulai\s*buat/i;
const USER_AFFIRM_START_RE =
  /^(ya|iya|yoi|oke|ok|yes|yep|gas|lanjut|boleh|setuju|silakan|silahkan)\b/i;

const FACT_KEY_TO_BRIEF_FIELD: Record<string, string> = {
  business_name: "businessName",
  business_type: "businessType",
  primary_offer: "offer",
  offer: "offer",
  services: "offer",
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

export function isUserAffirmingBuild(
  text: string | undefined,
  previousCard?: WorkspaceCard,
): boolean {
  if (!text || typeof text !== "string") {
    return false;
  }
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }
  if (!isBuildConfirmCard(previousCard)) {
    return false;
  }
  return USER_AFFIRM_START_RE.test(trimmed);
}

export function isBuildConfirmCard(card: WorkspaceCard | undefined): boolean {
  return card?.type === "question" && isBuildConfirmQuestion(card.question);
}

function isUserRequestingPostBuildUpdate(text: string | undefined): boolean {
  if (!text || typeof text !== "string") {
    return false;
  }
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }
  return isUserAffirmingBuild(trimmed) || trimmed.length >= 2;
}

function withHandoffReadiness(brief: ProjectBrief): ProjectBrief {
  // Auto-derive businessType when missing so the 5-field gate is sufficient
  let businessType = brief.businessType;
  if (!businessType || !businessType.trim()) {
    businessType = brief.offer?.trim() || brief.businessName?.trim() || "UMKM";
  }
  return {
    ...brief,
    businessType,
    confidence: Math.max(brief.confidence ?? 0, 95),
    openQuestions: [],
  };
}

// Single authority for turning best-effort model output into a valid turn.
export function normalizeWorkspaceTurn(
  input: unknown,
  fallbackBrief: ProjectBrief,
  options: NormalizeWorkspaceTurnOptions = {},
) {
  const value =
    input && typeof input === "object" ? (input as WorkspaceTurnToolInput) : {};
  const briefPatch = unstringifyJsonObject(value.briefPatch);
  // The combo model sometimes double-encodes briefPatch/workspaceCard as JSON
  let brief = applyBriefPatch(fallbackBrief, briefPatch, {
    ownerTexts: options.ownerTexts,
    sourceTurnId: options.sourceTurnId,
  });
  if (options.ownerTexts !== undefined) {
    brief = groundProjectBriefToOwnerFacts(brief, {
      ownerTexts: options.ownerTexts,
      preserveVisualPreference: options.hasBuiltSite === true,
      sourceTurnId: options.sourceTurnId,
    });
  }
  let workspaceCard = normalizeWorkspaceCard(
    unstringifyJsonObject(value.workspaceCard),
    brief,
  );

  const originalCardType = (
    unstringifyJsonObject(value.workspaceCard) as { type?: string } | null
  )?.type;

  // Server-side enforcement: when a site is built, allow build_recommendation when user requests changes or affirms update
  if (options.hasBuiltSite) {
    const isUpdateRequested =
      (options.preflight === "update" && options.hasPendingUpdate === true) ||
      Boolean(
        options.lastUserText &&
        isUserRequestingPostBuildUpdate(options.lastUserText),
      ) ||
      (Array.isArray(brief.businessImages) && brief.businessImages.length > 0);

    if (!isUpdateRequested) {
      if (
        workspaceCard.type === "build_recommendation" ||
        originalCardType === "build_recommendation" ||
        originalCardType === "brief_review"
      ) {
        workspaceCard = { type: "none" };
      }
    } else if (workspaceCard.type === "build_recommendation") {
      workspaceCard = { ...workspaceCard, postBuildUpdate: true };
    } else {
      workspaceCard = {
        type: "build_recommendation",
        postBuildUpdate: true,
        title: "Perbarui website",
        summary: ["Terapkan perubahan dan foto baru ke website"],
      };
    }
  } else if (!options.hasBuiltSite) {
    // Reliable handoff: promote to build_recommendation when build-time is
    const readinessBrief = parseCanonicalBrief(brief);
    const adaptiveReadiness =
      evaluateAdaptiveDiscussionReadiness(readinessBrief);
    const explicitBuildRequest =
      options.preflight === "build" ||
      isUserAffirmingBuild(options.lastUserText, options.previousWorkspaceCard);
    const briefIsReady =
      adaptiveReadiness.minimumSatisfied &&
      (adaptiveReadiness.commercialSatisfied || explicitBuildRequest);
    const modelTitle =
      workspaceCard.type === "build_recommendation"
        ? workspaceCard.title
        : undefined;
    const modelSummary =
      workspaceCard.type === "build_recommendation"
        ? workspaceCard.summary
        : undefined;

    const promoteBuildConfirmQuestion =
      briefIsReady &&
      workspaceCard.type === "question" &&
      isBuildConfirmQuestion(workspaceCard.question);

    const promoteAfterAffirm =
      briefIsReady &&
      isUserAffirmingBuild(
        options.lastUserText,
        options.previousWorkspaceCard,
      ) &&
      isBuildConfirmCard(options.previousWorkspaceCard);

    const isDuplicateStall = (() => {
      const currentId =
        workspaceCard.type === "question"
          ? workspaceCard.question.id
          : workspaceCard.type === "image_upload"
            ? workspaceCard.imageUpload.id
            : null;
      const prevId =
        options.previousWorkspaceCard?.type === "question"
          ? options.previousWorkspaceCard.question.id
          : options.previousWorkspaceCard?.type === "image_upload"
            ? options.previousWorkspaceCard.imageUpload.id
            : null;

      if (!currentId || !prevId || currentId !== prevId) {
        return false;
      }
      const dupId = currentId.toLowerCase();
      const normalizedDupId = dupId.replace(/-/g, "_");
      // If this id was already answered (fact/decision exists), it's a repeat.
      const hasAnsweredFact =
        (brief.facts ?? []).some(
          (f) => f.key === normalizedDupId || f.key === dupId,
        ) ||
        (brief.decisions ?? []).some(
          (d) => d.id === normalizedDupId || d.id === dupId,
        );
      if (hasAnsweredFact) {
        return true;
      }

      if (
        dupId.includes("photo") ||
        dupId.includes("image") ||
        dupId.includes("visual")
      ) {
        if (brief.visuals !== null && brief.visuals !== undefined) {
          return true;
        }
        if (
          Array.isArray(brief.businessImages) &&
          brief.businessImages.length > 0
        ) {
          return true;
        }
      }

      // Fallback: check typed brief field for MIN_BRIEF + soft fields.
      const fieldMap: Record<string, keyof ProjectBrief> = {
        business_name: "businessName",
        businessname: "businessName",
        offer: "offer",
        services: "offer",
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

    const isQuestionAlreadyAnswered = (() => {
      if (workspaceCard.type === "image_upload") {
        const imgId = workspaceCard.imageUpload.id
          .toLowerCase()
          .replace(/-/g, "_");
        const hasFact =
          (brief.facts ?? []).some(
            (f) => f.key === imgId || f.key === "visuals",
          ) ||
          (brief.decisions ?? []).some(
            (d) => d.id === imgId || d.id === "visuals",
          );
        if (hasFact) {
          return true;
        }
        if (brief.visuals !== null && brief.visuals !== undefined) {
          return true;
        }
        if (
          Array.isArray(brief.businessImages) &&
          brief.businessImages.length > 0
        ) {
          return true;
        }
        return false;
      }

      if (workspaceCard.type !== "question") {
        return false;
      }
      const qId = workspaceCard.question.id.toLowerCase().replace(/-/g, "_");
      const hasFact =
        (brief.facts ?? []).some((f) => f.key === qId) ||
        (brief.decisions ?? []).some((d) => d.id === qId);
      if (hasFact) {
        return true;
      }

      const fieldMap: Record<string, keyof ProjectBrief> = {
        business_name: "businessName",
        businessname: "businessName",
        offer: "offer",
        services: "offer",
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
        audience: "targetCustomer",
        price_range: "priceRange",
        delivery_area: "deliveryArea",
        address: "address",
        hours: "hours",
      };
      let field: keyof ProjectBrief | undefined = fieldMap[qId];
      if (!field) {
        if (qId.includes("business") && qId.includes("name")) {
          field = "businessName";
        } else if (qId.includes("target") || qId.includes("audience")) {
          field = "targetCustomer";
        } else if (qId.includes("contact") || qId.includes("whatsapp")) {
          field = "contactOrCta";
        } else if (qId.includes("offer") || qId.includes("product")) {
          field = "offer";
        } else if (qId.includes("style") || qId.includes("visual")) {
          field = "stylePreference";
        } else if (qId.includes("delivery") || qId.includes("area")) {
          field = "deliveryArea";
        } else if (qId.includes("price") || qId.includes("harga")) {
          field = "priceRange";
        }
      }
      if (!field) {
        return false;
      }
      const value = brief[field];
      if (typeof value === "string") {
        return value.trim().length > 0;
      }
      return value !== null && value !== undefined;
    })();

    const isExplicitBuildAffirmation =
      briefIsReady &&
      (options.preflight === "build" ||
        isUserAffirmingBuild(
          options.lastUserText,
          options.previousWorkspaceCard,
        ));

    const isUserSkippingOptionalQuestion =
      briefIsReady &&
      typeof options.lastUserText === "string" &&
      /^(lewati|skip|gak ada|tidak ada|ga ada|belum ada)/i.test(
        options.lastUserText.trim(),
      );

    if (
      promoteBuildConfirmQuestion ||
      promoteAfterAffirm ||
      isExplicitBuildAffirmation ||
      isUserSkippingOptionalQuestion ||
      (isDuplicateStall && briefIsReady) ||
      (briefIsReady && isQuestionAlreadyAnswered)
    ) {
      brief = withHandoffReadiness(brief);
      workspaceCard = buildRecommendationCard(brief, modelTitle, modelSummary);
    } else if (isDuplicateStall) {
      // Duplicate id already answered but brief not yet build-ready — block the
      workspaceCard = createFallbackWorkspaceCard(brief);
    } else if (briefIsReady && workspaceCard.type === "build_recommendation") {
      // Model sent build card (or min-brief accepted it) — lock confidence for UI.
      brief = withHandoffReadiness(brief);
    } else if (
      !briefIsReady &&
      workspaceCard.type === "none" &&
      (value.workspaceCard == null ||
        (typeof value.workspaceCard === "object" &&
          (value.workspaceCard as { type?: string }).type === "none"))
    ) {
      // Brief not yet buildable and the model returned no card — surface a
      workspaceCard = createFallbackWorkspaceCard(brief);
    }
  }

  // Card type is the single source of truth for buildability: derive
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
    typeof img.question === "string"
      ? unslopUserFacingText(img.question.slice(0, 300))
      : "";
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
    typeof img.hint === "string"
      ? unslopUserFacingText(img.hint.slice(0, 180))
      : undefined;
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
    return getSettingSync("feature.composer_uploads_enabled", true) as boolean;
  } catch {
    return true;
  }
}

function isPhotoQuestionId(id: string): boolean {
  const lower = id.toLowerCase();
  return (
    lower === "visuals" || lower === "visual" || lower === "media_strategy"
  );
}

function isPhotoQuestionText(text: string): boolean {
  const q = text.toLowerCase();
  return q.includes("foto") || q.includes("photo") || q.includes("gambar");
}

function normalizeWorkspaceCard(
  card: unknown,
  brief: ProjectBrief,
): WorkspaceCard {
  if (!card || typeof card !== "object") {
    return createFallbackWorkspaceCard(brief);
  }

  // type is kept loose (string) so legacy `type: "questions"` payloads from
  const value = card as {
    type?: string;
    question?: unknown;
    // Backward compatibility: older stored cards used a questions[] array.
    questions?: unknown;
    imageUpload?: unknown;
    summary?: unknown;
    title?: unknown;
    engine?: unknown;
    handoffId?: unknown;
    reviewHash?: unknown;
    reviewItems?: unknown;
    postBuildUpdate?: unknown;
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

  // Contract recommendation cards carry server-owned handoff proof. Pass
  if (
    value.type === "build_recommendation" &&
    (value.engine === "contract" || value.engine === "contract-v1") &&
    typeof value.handoffId === "string" &&
    typeof value.reviewHash === "string"
  ) {
    const readiness = evaluateBuildReadiness(parseCanonicalBrief(brief));
    if (readiness.state !== "ready") {
      return { type: "question", question: readiness.nextQuestion };
    }

    return {
      type: "build_recommendation",
      engine: "contract" as const,
      title:
        typeof value.title === "string" ? value.title : "Website siap dibuat",
      ...(value.postBuildUpdate === true ? { postBuildUpdate: true } : {}),
      summary: Array.isArray(value.summary)
        ? (value.summary as unknown[]).filter(
            (item): item is string => typeof item === "string",
          )
        : [],
      handoffId: value.handoffId,
      reviewHash: value.reviewHash,
      reviewItems: Array.isArray(value.reviewItems)
        ? (value.reviewItems as unknown[]).filter(
            (
              item,
            ): item is {
              id: string;
              kind: string;
              label: string;
              value: string;
            } => {
              if (!item || typeof item !== "object") {
                return false;
              }
              const review = item as Record<string, unknown>;
              return (
                typeof review.id === "string" &&
                typeof review.kind === "string" &&
                typeof review.label === "string" &&
                typeof review.value === "string"
              );
            },
          )
        : [],
    };
  }

  if (value.type === "build_recommendation" || value.type === "brief_review") {
    const summary = Array.isArray(value.summary)
      ? (value.summary as unknown[]).filter(
          (item): item is string => typeof item === "string",
        )
      : undefined;
    const title = typeof value.title === "string" ? value.title : undefined;

    const readiness = evaluateBuildReadiness(parseCanonicalBrief(brief));
    if (readiness.state === "ready") {
      return buildRecommendationCard(brief, title, summary);
    }

    const rawQuestion =
      value.question ??
      (Array.isArray(value.questions) ? value.questions[0] : undefined);
    const question = normalizeQuestion(rawQuestion);

    if (question) {
      return { type: "question", question };
    }

    return {
      type: "question",
      question: readiness.nextQuestion,
    };
  }

  const rawQuestion =
    value.question ??
    (Array.isArray(value.questions) ? value.questions[0] : undefined);
  const question = normalizeQuestion(rawQuestion);

  return question
    ? { type: "question", question }
    : createFallbackWorkspaceCard(brief);
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

// Clean choice and price handling

function pricePlaceholderForQuestion(): string {
  return "Tulis kisaran harga atau tarif layanan.";
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
  const options = Array.isArray(candidate.options)
    ? candidate.options
        .map((option) => coerceQuestionOption(option))
        .filter((option): option is { label: string; description: string } =>
          Boolean(option?.label),
        )
        .slice(0, 5)
    : [];

  const isPrice = question ? isPriceQuestion(coercedId, question) : false;

  const answerMode: "text" | "choice" =
    candidate.answerMode === "text"
      ? "text"
      : options.length >= 2
        ? "choice"
        : "text";

  if (!question) {
    return null;
  }

  const recommendedOptionLabel = cleanText(
    candidate.recommendedOptionLabel,
    OPTION_LABEL_MAX_LENGTH,
  );

  const placeholder =
    cleanPlaceholder(candidate.placeholder) ||
    (answerMode === "text" && isPrice
      ? pricePlaceholderForQuestion()
      : undefined) ||
    undefined;

  return {
    id: coercedId,
    question: unslopUserFacingText(question),
    answerMode,
    options: answerMode === "text" ? [] : options,
    recommendedOptionLabel: options.some(
      (option) => option.label === recommendedOptionLabel,
    )
      ? recommendedOptionLabel
      : undefined,
    placeholder: placeholder ? unslopUserFacingText(placeholder) : undefined,
    selectionMode:
      candidate.selectionMode === "multiple" && answerMode === "choice"
        ? "multiple"
        : "single",
    whyThisQuestionMatters:
      unslopUserFacingText(
        cleanText(candidate.whyThisQuestionMatters, 180) ||
          cleanText(aliasedQuestion.description, 180) ||
          cleanText(aliasedQuestion.hint, 180),
      ) || undefined,
    required:
      typeof candidate.required === "boolean"
        ? candidate.required
        : REQUIRED_BRIEF_FIELD_IDS.has(aliasedQuestion.id ?? ""),
  };
}

function cleanPlaceholder(value: unknown): string {
  return cleanText(value, 100).replace(
    /^(?:contoh|misal|misalnya)\s*:\s*/i,
    "",
  );
}

function coerceQuestionOption(
  option: unknown,
): { label: string; description: string } | null {
  if (typeof option === "string") {
    const label = cleanText(option, OPTION_LABEL_MAX_LENGTH);
    return label
      ? { label: unslopUserFacingText(label), description: "" }
      : null;
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
    label: unslopUserFacingText(label),
    description: unslopUserFacingText(
      cleanText(value.description, OPTION_DESCRIPTION_MAX_LENGTH),
    ),
  };
}

function buildRecommendationCard(
  brief: ProjectBrief,
  title = "Website siap dibuat",
  summary?: string[],
): WorkspaceCard {
  return {
    type: "build_recommendation",
    engine: "contract" as const,
    title: friendlyBuildRecommendationTitle(title),
    summary: buildCardSummary(brief, summary),
  };
}

function friendlyBuildRecommendationTitle(title: string): string {
  const cleaned = cleanText(title, 80) || "Website siap dibuat";
  return unslopUserFacingText(cleaned)
    .replace(/^brief sudah siap dibuild$/i, "Website siap dibuat")
    .replace(/\bmulai build\b/gi, "Mulai buat website")
    .replace(/\bbuild ulang\b/gi, "Buat ulang website")
    .replace(/\bdibuild\b/gi, "dibuat")
    .replace(/\bbuild\b/gi, "pembuatan website");
}

function buildCardSummary(brief: ProjectBrief, summary?: string[]) {
  const ownerFacts = [
    brief.businessName,
    brief.businessType,
    brief.offer,
    brief.targetCustomer,
    brief.contactOrCta,
    brief.stylePreference,
    ...(brief.usp ?? []),
  ].filter(Boolean);
  const ownerText = ownerFacts.join(" ");
  const ownerWords = new Set(
    ownerText
      .toLocaleLowerCase("id-ID")
      .split(/[^\p{L}\p{N}]+/u)
      .filter((word) => word.length >= 4),
  );
  const safeSummary = (summary ?? [])
    .map((item) => unslopUserFacingText(cleanText(item, 120)))
    .filter((item) => {
      if (!item) {
        return false;
      }
      const copyClass = classifySafeCopy({
        text: item,
        ownerFacts: [...ownerFacts, ...ownerWords],
      });
      if (copyClass === "unsupported_claim") {
        return false;
      }
      if (
        copyClass === "navigation" ||
        copyClass === "neutral_cta" ||
        copyClass === "atmospheric_framing"
      ) {
        return true;
      }
      return item
        .toLocaleLowerCase("id-ID")
        .split(/[^\p{L}\p{N}]+/u)
        .some((word) => ownerWords.has(word));
    })
    .slice(0, 7);
  return safeSummary.length
    ? safeSummary
    : [
        brief.businessType,
        brief.offer,
        brief.targetCustomer,
        brief.contactOrCta,
        brief.stylePreference,
      ].filter(Boolean);
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
