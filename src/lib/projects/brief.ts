import type {
  CertificationValue,
  ContactValue,
  HoursValue,
  PaymentMethodValue,
  ProductOrServiceItem,
  SocialLinkValue,
  TestimonialValue,
} from "@/lib/projects/brief-rich-fields";
import type { UmkmType, CleanedBrief } from "@/lib/projects/brief-rich-fields";
import type { FieldStateMap } from "@/lib/projects/chat-memory";

import { parseContact, validateBrief } from "@/lib/projects/brief-rich-fields";
import {
  getPrimaryActionLabel,
  getPrimaryOfferName,
  parseCanonicalBrief,
  type ProjectBriefV2,
} from "@/lib/projects/canonical-brief";
import {
  createEmptyFactLedger,
  createFactLedgerEntriesFromPatch,
  getRenderableFactEntries,
  getRenderableFactEntry,
  hasOwnerEvidence,
  mergeFactLedger,
  normalizeFactLedger,
  type FactLedger,
  type FactLedgerValue,
} from "@/lib/projects/fact-ledger";
import {
  normalizeVisitorJobs,
  parseVisitorJobs,
  type VisitorJob,
} from "@/lib/projects/visitor-jobs";

export type ProjectFact = {
  key: string;
  label: string;
  value: string;
};

export type ProjectDecision = {
  answer: string;
  id: string;
  question: string;
};

export type BusinessImageRef = {
  id: string;
  purpose: ImageUploadPurpose;
};

export type ProjectBrief = {
  version: 1;
  prompt: string;
  facts?: ProjectFact[];
  decisions?: ProjectDecision[];
  visitorJobs?: VisitorJob[];
  businessName: string;
  businessType: string;
  offer: string;
  targetCustomer: string;
  contactOrCta: string;
  stylePreference: string;
  notes: string[];
  confidence?: number;
  openQuestions?: string[];
  productOrService: ProductOrServiceItem[] | null;
  contact: ContactValue | null;
  tagline: string | null;
  usp: string[] | null;
  priceRange: string | null;
  visuals: boolean | null;
  hours: HoursValue[] | null;
  address: string | null;
  deliveryArea: string | null;
  since: string | null;
  testimonials: TestimonialValue[] | null;
  certifications: CertificationValue[] | null;
  paymentMethods: PaymentMethodValue[] | null;
  socialLinks: SocialLinkValue[] | null;
  currentPromo: string | null;
  secondaryCta: { label: string; action: string } | null;
  readyForBuild: boolean;
  umkmType?: UmkmType | null;
  fieldState?: FieldStateMap;
  businessImages?: BusinessImageRef[];
  factLedger?: FactLedger;
};

export type BriefQuestion = {
  id: string;
  question: string;
  recommendedOptionLabel?: string;
  answerMode?: "choice" | "text";
  selectionMode?: "single" | "multiple";
  placeholder?: string;
  whyThisQuestionMatters?: string;
  // ponytail: when true, user must answer before advancing. AI marks mandatory
  required?: boolean;
  options: Array<{ label: string; description: string }>;
};

// One question per turn. The AI asks a single question, the user answers, the
export type ImageUploadPurpose = "business-image" | "logo" | "reference";

export type ImageUploadQuestion = {
  id: string;
  question: string;
  hint?: string;
  selectionMode: "single" | "multiple";
  purpose: ImageUploadPurpose;
  required?: boolean;
};

export type ImageUploadCard = {
  type: "image_upload";
  imageUpload: ImageUploadQuestion;
};

export type BuildRetryCard = {
  type: "build_retry";
  title: string;
  summary: string[];
  errorMessage?: string;
};

export type WorkspaceCard =
  | { type: "none" }
  | { type: "question"; question: BriefQuestion }
  | { type: "image_upload"; imageUpload: ImageUploadQuestion }
  | ContractBuildRecommendationCard
  | BuildRetryCard;

export type ContractBuildRecommendationCard = {
  type: "build_recommendation";
  engine?: "contract";
  title: string;
  summary: string[];
  handoffId?: string;
  reviewHash?: string;
  reviewItems?: Array<{
    id: string;
    kind: string;
    label: string;
    value: string;
  }>;
};

export type ProjectBriefPatch = Partial<
  Pick<
    ProjectBrief,
    | "businessName"
    | "businessType"
    | "offer"
    | "targetCustomer"
    | "contactOrCta"
    | "stylePreference"
    | "productOrService"
    | "contact"
    | "tagline"
    | "usp"
    | "priceRange"
    | "visuals"
    | "hours"
    | "address"
    | "deliveryArea"
    | "since"
    | "testimonials"
    | "certifications"
    | "paymentMethods"
    | "socialLinks"
    | "currentPromo"
    | "secondaryCta"
    | "businessImages"
    | "visitorJobs"
  >
> & {
  confidence?: number;
  decisions?: ProjectDecision[];
  facts?: ProjectFact[];
  notes?: string[];
  openQuestions?: string[];
  umkmType?: UmkmType | null;
  fieldState?: FieldStateMap;
};

const LEGACY_BRIEF_PATCH_FIELDS = [
  "businessType",
  "offer",
  "targetCustomer",
  "contactOrCta",
  "stylePreference",
] as const;

const REQUIRED_FIELDS = [...LEGACY_BRIEF_PATCH_FIELDS];

export function createInitialBrief(prompt = ""): ProjectBrief {
  return {
    version: 1,
    prompt: prompt.trim(),
    facts: [],
    decisions: [],
    visitorJobs: [],
    businessName: "",
    businessType: "",
    offer: "",
    targetCustomer: "",
    contactOrCta: "",
    stylePreference: "",
    notes: [],
    confidence: 0,
    openQuestions: [],
    productOrService: null,
    contact: null,
    tagline: null,
    usp: null,
    priceRange: null,
    visuals: null,
    hours: null,
    address: null,
    deliveryArea: null,
    since: null,
    testimonials: null,
    certifications: null,
    paymentMethods: null,
    socialLinks: null,
    currentPromo: null,
    secondaryCta: null,
    readyForBuild: false,
    umkmType: null,
    fieldState: {},
    businessImages: [],
    factLedger: createEmptyFactLedger(),
  };
}

export function parseProjectBrief(value: unknown, prompt = ""): ProjectBrief {
  if (!value || typeof value !== "object") {
    return createInitialBrief(prompt);
  }

  if ((value as { version?: unknown }).version === 2) {
    return projectCanonicalBriefForLegacyConsumers(
      parseCanonicalBrief(value, prompt),
    );
  }

  const input = value as Partial<ProjectBrief>;
  return {
    ...createInitialBrief(prompt),
    prompt: stringValue(input.prompt) || prompt.trim(),
    businessName: stringValue(input.businessName),
    businessType: stringValue(input.businessType),
    offer: stringValue(input.offer),
    targetCustomer: stringValue(input.targetCustomer),
    contactOrCta: stringValue(input.contactOrCta),
    stylePreference: stringValue(input.stylePreference),
    facts: normalizeFacts(input.facts),
    decisions: normalizeDecisions(input.decisions),
    visitorJobs: Array.isArray(input.visitorJobs)
      ? normalizeVisitorJobs(input.visitorJobs)
      : [],
    notes: Array.isArray(input.notes)
      ? input.notes.filter(isString).slice(-12)
      : [],
    confidence: normalizeConfidence(input.confidence),
    openQuestions: Array.isArray(input.openQuestions)
      ? input.openQuestions.filter(isString).slice(-12)
      : [],
    productOrService: input.productOrService ?? null,
    contact: input.contact ?? null,
    tagline: stringValueOrNull(input.tagline),
    usp: Array.isArray(input.usp)
      ? input.usp.filter(isString).slice(-12)
      : null,
    priceRange: stringValueOrNull(input.priceRange),
    visuals: typeof input.visuals === "boolean" ? input.visuals : null,
    hours: Array.isArray(input.hours) ? input.hours : null,
    address: stringValueOrNull(input.address),
    deliveryArea: stringValueOrNull(input.deliveryArea),
    since: stringValueOrNull(input.since),
    testimonials: Array.isArray(input.testimonials) ? input.testimonials : null,
    certifications: Array.isArray(input.certifications)
      ? input.certifications
      : null,
    paymentMethods: Array.isArray(input.paymentMethods)
      ? input.paymentMethods
      : null,
    socialLinks: Array.isArray(input.socialLinks) ? input.socialLinks : null,
    currentPromo: stringValueOrNull(input.currentPromo),
    secondaryCta:
      input.secondaryCta && typeof input.secondaryCta === "object"
        ? input.secondaryCta
        : null,
    readyForBuild: input.readyForBuild === true,
    umkmType:
      typeof input.umkmType === "string" ? (input.umkmType as UmkmType) : null,
    fieldState:
      input.fieldState && typeof input.fieldState === "object"
        ? (input.fieldState as FieldStateMap)
        : {},
    businessImages: normalizeBusinessImages(input.businessImages),
    factLedger: normalizeFactLedger(input.factLedger),
  };
}

function projectCanonicalBriefForLegacyConsumers(
  brief: ProjectBriefV2,
): ProjectBrief {
  const primaryOffer = getPrimaryOfferName(brief) ?? "";
  const primaryActionLabel = getPrimaryActionLabel(brief) ?? "";
  const contact =
    brief.primaryAction?.kind !== "browse" && brief.primaryAction?.target
      ? {
          channel: brief.primaryAction.kind,
          label: brief.primaryAction.label,
          value: brief.primaryAction.target,
        }
      : null;

  return {
    ...createInitialBrief(brief.prompt),
    prompt: brief.prompt,
    businessName: brief.business.name,
    businessType: brief.business.type,
    offer: primaryOffer,
    targetCustomer: brief.audience ?? "",
    contactOrCta: primaryActionLabel,
    stylePreference: brief.visualDirection ?? "",
    facts: brief.provenance.facts,
    decisions: brief.provenance.decisions,
    visitorJobs: brief.visitorJobs,
    productOrService: brief.offers.length ? brief.offers : null,
    contact,
    tagline: brief.content.tagline,
    usp: brief.content.usp.length ? brief.content.usp : null,
    priceRange: brief.content.priceRange,
    hours: brief.content.hours.length ? brief.content.hours : null,
    address: brief.content.address,
    deliveryArea: brief.content.deliveryArea,
    since: brief.content.since,
    testimonials: brief.content.testimonials.length
      ? brief.content.testimonials
      : null,
    certifications: brief.content.certifications.length
      ? brief.content.certifications
      : null,
    paymentMethods: brief.content.paymentMethods.length
      ? brief.content.paymentMethods
      : null,
    socialLinks: brief.content.socialLinks.length
      ? brief.content.socialLinks
      : null,
    currentPromo: brief.content.currentPromo,
    secondaryCta: brief.content.secondaryAction,
    umkmType: brief.business.category,
    fieldState: brief.fieldState,
    businessImages: brief.assets,
    factLedger: normalizeFactLedger(brief.factLedger),
  };
}

export function groundProjectBriefToOwnerFacts(
  brief: ProjectBrief,
  context: { ownerTexts: string[]; sourceTurnId?: string },
): ProjectBrief {
  const ownerTexts = context.ownerTexts.filter(
    (text): text is string => typeof text === "string",
  );
  const originalValues = briefValuesForLedger(brief);
  let factLedger = mergeFactLedger(
    normalizeFactLedger(brief.factLedger),
    createFactLedgerEntriesFromPatch(originalValues),
    context,
  );
  const materializedBrief = materializeRenderableLedgerValues(
    brief,
    factLedger,
  );
  const next: ProjectBrief = {
    ...materializedBrief,
    factLedger,
    productOrService: groundOffers(
      materializedBrief.productOrService,
      factLedger,
      ownerTexts,
    ),
    contact: groundContact(materializedBrief.contact, factLedger, ownerTexts),
    usp: groundStrings(materializedBrief.usp, "usp", factLedger, ownerTexts),
    tagline: groundString(
      materializedBrief.tagline,
      "tagline",
      factLedger,
      ownerTexts,
    ),
    priceRange: groundString(
      materializedBrief.priceRange,
      "priceRange",
      factLedger,
      ownerTexts,
    ),
    targetCustomer: groundString(
      materializedBrief.targetCustomer,
      "audience",
      factLedger,
      ownerTexts,
    ),
    address: groundString(
      materializedBrief.address,
      "address",
      factLedger,
      ownerTexts,
    ),
    deliveryArea: groundString(
      materializedBrief.deliveryArea,
      "serviceArea",
      factLedger,
      ownerTexts,
    ),
    since: groundString(
      materializedBrief.since,
      "since",
      factLedger,
      ownerTexts,
    ),
    currentPromo: groundString(
      materializedBrief.currentPromo,
      "promotion",
      factLedger,
      ownerTexts,
    ),
    stylePreference: groundString(
      materializedBrief.stylePreference,
      "visualDirection",
      factLedger,
      ownerTexts,
    ),
    businessName: groundString(
      materializedBrief.businessName,
      "businessName",
      factLedger,
      ownerTexts,
    ),
    businessType: groundString(
      materializedBrief.businessType,
      "businessType",
      factLedger,
      ownerTexts,
    ),
    contactOrCta: groundString(
      materializedBrief.contactOrCta,
      "contact",
      factLedger,
      ownerTexts,
    ),
  };

  if (
    !groundedValue(materializedBrief.hours, "hours", factLedger, ownerTexts)
  ) {
    next.hours = null;
  }
  if (
    !groundedValue(
      materializedBrief.testimonials,
      "testimonials",
      factLedger,
      ownerTexts,
    )
  ) {
    next.testimonials = null;
  }
  if (
    !groundedValue(
      materializedBrief.certifications,
      "certifications",
      factLedger,
      ownerTexts,
    )
  ) {
    next.certifications = null;
  }
  if (
    !groundedValue(
      materializedBrief.paymentMethods,
      "paymentMethods",
      factLedger,
      ownerTexts,
    )
  ) {
    next.paymentMethods = null;
  }
  if (
    !groundedValue(
      materializedBrief.socialLinks,
      "socialLinks",
      factLedger,
      ownerTexts,
    )
  ) {
    next.socialLinks = null;
  }
  if (
    materializedBrief.secondaryCta &&
    !groundedValue(
      materializedBrief.secondaryCta,
      "secondaryAction",
      factLedger,
      ownerTexts,
    )
  ) {
    next.secondaryCta = null;
  }
  if (brief.fieldState?.visuals === "declined") {
    next.visuals = false;
  }

  factLedger = mergeFactLedger(
    factLedger,
    createFactLedgerEntriesFromPatch(briefValuesForLedger(next)),
    context,
  );
  return { ...next, factLedger };
}

export function mergeProjectBriefPatch(
  brief: ProjectBrief,
  patch: ProjectBriefPatch,
): ProjectBrief {
  const next = {
    ...brief,
    notes: [...brief.notes],
    factLedger: normalizeFactLedger(brief.factLedger),
  };

  for (const field of REQUIRED_FIELDS) {
    const value = stringValue(patch[field]);

    if (value) {
      next[field] = value;
    }
  }

  const businessName = stringValue(patch.businessName);

  if (businessName) {
    next.businessName = businessName;
  }

  if (patch.umkmType !== undefined && patch.umkmType !== null) {
    next.umkmType = patch.umkmType;
  }

  if (patch.fieldState) {
    next.fieldState = { ...next.fieldState, ...patch.fieldState };
  }

  if (Array.isArray(patch.facts)) {
    next.facts = mergeFacts(next.facts ?? [], patch.facts);
  }

  if (Array.isArray(patch.decisions)) {
    next.decisions = mergeDecisions(next.decisions ?? [], patch.decisions);
  }

  if (patch.visitorJobs !== undefined) {
    const parsed = parseVisitorJobs(patch.visitorJobs);
    if (parsed.ok) {
      next.visitorJobs = parsed.value;
    }
  }

  if (Array.isArray(patch.notes)) {
    next.notes = [...next.notes, ...patch.notes.filter(isString)].slice(-24);
  }

  if ("confidence" in patch) {
    next.confidence = normalizeConfidence(patch.confidence);
  }

  if (Array.isArray(patch.openQuestions)) {
    next.openQuestions = patch.openQuestions.filter(isString).slice(-12);
  }

  const answered = new Set(next.decisions?.map((d) => d.id) ?? []);
  next.openQuestions = (next.openQuestions ?? []).filter(
    (q) => !answered.has(q),
  );

  // Typed rich fields. The validator scrubs hallucinated values downstream; we
  if (Array.isArray(patch.productOrService)) {
    next.productOrService = patch.productOrService.length
      ? patch.productOrService
      : null;
  }
  if (patch.contact !== undefined && patch.contact !== null) {
    next.contact = patch.contact;
  }
  if (patch.tagline !== undefined && patch.tagline !== null) {
    next.tagline = patch.tagline;
  }
  if (Array.isArray(patch.usp)) {
    next.usp = patch.usp.length ? patch.usp : null;
  }
  if (patch.priceRange !== undefined && patch.priceRange !== null) {
    next.priceRange = patch.priceRange;
  }
  if (patch.visuals !== undefined && patch.visuals !== null) {
    next.visuals = patch.visuals;
  }
  if (Array.isArray(patch.hours)) {
    next.hours = patch.hours.length ? patch.hours : null;
  }
  if (patch.address !== undefined && patch.address !== null) {
    next.address = patch.address;
  }
  if (patch.deliveryArea !== undefined && patch.deliveryArea !== null) {
    next.deliveryArea = patch.deliveryArea;
  }
  if (patch.since !== undefined && patch.since !== null) {
    next.since = patch.since;
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
    next.currentPromo = patch.currentPromo;
  }
  if (patch.secondaryCta !== undefined && patch.secondaryCta !== null) {
    next.secondaryCta = patch.secondaryCta;
  }

  const patchRecord = patch as unknown as Record<string, unknown>;
  const patchLedgerEntries = createFactLedgerEntriesFromPatch(patchRecord);
  if (patchLedgerEntries.length > 0) {
    next.factLedger = mergeFactLedger(
      next.factLedger ?? createEmptyFactLedger(),
      patchLedgerEntries,
      { ownerTexts: [] },
    );
  }

  if (Array.isArray(patch.businessImages)) {
    const merged = new Map(
      (next.businessImages ?? []).map((img) => [img.id, img]),
    );
    for (const img of normalizeBusinessImages(patch.businessImages)) {
      merged.set(img.id, img);
    }
    next.businessImages = [...merged.values()].slice(-12);
  }

  return next;
}

function briefValuesForLedger(brief: ProjectBrief): Record<string, unknown> {
  return {
    businessName: brief.businessName,
    businessType: brief.businessType,
    productOrService: brief.productOrService,
    contact: brief.contact,
    tagline: brief.tagline,
    usp: brief.usp,
    priceRange: brief.priceRange,
    targetCustomer: brief.targetCustomer,
    stylePreference: brief.stylePreference,
    hours: brief.hours,
    address: brief.address,
    deliveryArea: brief.deliveryArea,
    since: brief.since,
    testimonials: brief.testimonials,
    certifications: brief.certifications,
    paymentMethods: brief.paymentMethods,
    socialLinks: brief.socialLinks,
    currentPromo: brief.currentPromo,
    secondaryCta: brief.secondaryCta,
    facts: brief.facts,
  };
}

function dedupeJsonItems(items: unknown[]): unknown[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = JSON.stringify(item);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function materializeRenderableLedgerValues(
  brief: ProjectBrief,
  ledger: FactLedger,
): ProjectBrief {
  const patch: Record<string, unknown> = {};
  let materializedOffers: unknown[] = [];
  let hasOffers = false;
  let materializedUsp: string[] = [];
  let hasUsp = false;
  for (const entry of getRenderableFactEntries(ledger)) {
    switch (entry.field) {
      case "businessName":
        if (typeof entry.value === "string") {
          patch.businessName = entry.value;
        }
        break;
      case "businessType":
        if (typeof entry.value === "string") {
          patch.businessType = entry.value;
        }
        break;
      case "offers":
        hasOffers = true;
        materializedOffers = [
          ...materializedOffers,
          ...(Array.isArray(entry.value)
            ? entry.value
            : typeof entry.value === "string"
              ? [{ name: entry.value }]
              : []),
        ];
        break;
      case "contact":
        if (parseContact(entry.value)) {
          patch.contact = entry.value;
        }
        break;
      case "tagline":
        patch.tagline = entry.value;
        break;
      case "usp":
        hasUsp = true;
        materializedUsp = [
          ...materializedUsp,
          ...(Array.isArray(entry.value)
            ? entry.value.filter(
                (value): value is string => typeof value === "string",
              )
            : typeof entry.value === "string"
              ? entry.value.split(";").map((value) => value.trim())
              : []),
        ];
        break;
      case "priceRange":
        patch.priceRange = entry.value;
        break;
      case "audience":
        patch.targetCustomer = entry.value;
        break;
      case "visualDirection":
        patch.stylePreference = entry.value;
        break;
      case "hours":
        patch.hours = entry.value;
        break;
      case "address":
        patch.address =
          typeof entry.value === "string"
            ? entry.value
            : isRecord(entry.value) && typeof entry.value.line1 === "string"
              ? entry.value.line1
              : undefined;
        break;
      case "serviceArea":
        patch.deliveryArea = entry.value;
        break;
      case "since":
        patch.since = entry.value;
        break;
      case "testimonials":
        patch.testimonials = entry.value;
        break;
      case "certifications":
        patch.certifications = entry.value;
        break;
      case "paymentMethods":
        patch.paymentMethods = entry.value;
        break;
      case "socialLinks":
        patch.socialLinks = entry.value;
        break;
      case "promotion":
        if (typeof entry.value === "string") {
          patch.currentPromo = entry.value;
        } else if (
          isRecord(entry.value) &&
          typeof entry.value.title === "string"
        ) {
          patch.currentPromo = entry.value.title;
        }
        break;
      case "secondaryAction":
        patch.secondaryCta = entry.value;
        break;
      default:
        break;
    }
  }
  if (hasOffers) {
    patch.productOrService = dedupeJsonItems(materializedOffers);
  }
  if (hasUsp) {
    patch.usp = [...new Set(materializedUsp)];
  }
  const { cleaned } = validateBrief(patch);
  return {
    ...brief,
    businessName: cleaned.businessName ?? brief.businessName,
    productOrService: cleaned.productOrService ?? brief.productOrService,
    contact: cleaned.contact ?? brief.contact,
    tagline: cleaned.tagline ?? brief.tagline,
    usp: cleaned.usp ?? brief.usp,
    targetCustomer: cleaned.targetCustomer ?? brief.targetCustomer,
    priceRange: cleaned.priceRange ?? brief.priceRange,
    visuals: cleaned.visuals ?? brief.visuals,
    hours: cleaned.hours ?? brief.hours,
    address: cleaned.address ?? brief.address,
    deliveryArea: cleaned.deliveryArea ?? brief.deliveryArea,
    since: cleaned.since ?? brief.since,
    testimonials: cleaned.testimonials ?? brief.testimonials,
    certifications: cleaned.certifications ?? brief.certifications,
    paymentMethods: cleaned.paymentMethods ?? brief.paymentMethods,
    socialLinks: cleaned.socialLinks ?? brief.socialLinks,
    currentPromo: cleaned.currentPromo ?? brief.currentPromo,
    secondaryCta: cleaned.secondaryCta ?? brief.secondaryCta,
    businessType:
      typeof patch.businessType === "string"
        ? patch.businessType
        : brief.businessType,
    stylePreference:
      typeof patch.stylePreference === "string"
        ? patch.stylePreference
        : brief.stylePreference,
  };
}

function groundOffers(
  offers: ProductOrServiceItem[] | null,
  ledger: FactLedger,
  ownerTexts: string[],
): ProductOrServiceItem[] | null {
  if (!offers?.length) {
    return null;
  }
  const grounded = offers
    .map((offer) => {
      const name = groundString(offer.name, "offers", ledger, ownerTexts);
      if (!name) {
        return null;
      }
      const description = ownerString(offer.description, ownerTexts)
        ? offer.description
        : undefined;
      const priceRange = ownerString(offer.priceRange, ownerTexts)
        ? offer.priceRange
        : undefined;
      const groundedOffer: ProductOrServiceItem = { name };
      if (description) {
        groundedOffer.description = description;
      }
      if (priceRange) {
        groundedOffer.priceRange = priceRange;
      }
      if (offer.isPrimary !== undefined) {
        groundedOffer.isPrimary = offer.isPrimary;
      }
      return groundedOffer;
    })
    .filter((offer): offer is ProductOrServiceItem => offer !== null);
  return grounded.length ? grounded : null;
}

function groundContact(
  contact: ContactValue | null,
  ledger: FactLedger,
  ownerTexts: string[],
): ContactValue | null {
  if (!contact || !ownerString(contact.value, ownerTexts)) {
    const existing = getRenderableFactEntry(ledger, "contact");
    if (!existing || !isRecord(existing.value)) {
      return null;
    }
    if (!isRecord(existing.value)) {
      return null;
    }
    const value = existing.value.value;
    const channel = existing.value.channel;
    if (
      typeof value !== "string" ||
      (channel !== "whatsapp" &&
        channel !== "phone" &&
        channel !== "instagram" &&
        channel !== "maps" &&
        channel !== "other")
    ) {
      return null;
    }
    const label = existing.value.label;
    return {
      channel,
      value,
      ...(typeof label === "string" && label.trim()
        ? { label: label.trim() }
        : {}),
    };
  }
  return contact;
}

function groundStrings(
  values: string[] | null,
  field: string,
  ledger: FactLedger,
  ownerTexts: string[],
): string[] | null {
  const grounded = (values ?? []).filter((value) =>
    groundedValue(value, field, ledger, ownerTexts),
  );
  return grounded.length ? grounded : null;
}

function groundString(
  value: string | null,
  field: string,
  ledger: FactLedger,
  ownerTexts: string[],
): string {
  return groundedValue(value, field, ledger, ownerTexts) ? (value ?? "") : "";
}

function groundedValue(
  value: unknown,
  field: string,
  ledger: FactLedger,
  ownerTexts: string[],
): boolean {
  if (value === null || value === undefined) {
    return false;
  }
  const normalized = toLedgerValue(value);
  if (normalized === null) {
    return false;
  }
  if (hasOwnerEvidence(normalized, ownerTexts)) {
    return true;
  }
  const existing = getRenderableFactEntry(ledger, field);
  return Boolean(
    existing && JSON.stringify(existing.value) === JSON.stringify(normalized),
  );
}

function ownerString(value: string | undefined, ownerTexts: string[]): boolean {
  return Boolean(value && hasOwnerEvidence(value, ownerTexts));
}

function toLedgerValue(value: unknown): FactLedgerValue | null {
  if (value === null) {
    return null;
  }
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    const items = value.map(toLedgerValue);
    return items.every((item) => item !== null)
      ? (items as FactLedgerValue)
      : null;
  }
  if (isRecord(value)) {
    const entries = Object.entries(value).map(
      ([key, item]) => [key, toLedgerValue(item)] as const,
    );
    if (entries.some(([, item]) => item === null)) {
      return null;
    }
    return Object.fromEntries(entries) as FactLedgerValue;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function getMissingBriefFields(brief: ProjectBrief) {
  return REQUIRED_FIELDS.filter((field) => !brief[field]);
}

export function isBriefQuestionId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function briefToBuildPrompt(brief: ProjectBrief) {
  const lines = [
    `Permintaan awal: ${brief.prompt}`,
    brief.businessName ? `Nama usaha: ${brief.businessName}` : "",
    `Bidang usaha: ${brief.businessType}`,
    `Produk/jasa utama: ${brief.offer}`,
    `Target pelanggan: ${brief.targetCustomer}`,
    `Aksi utama: ${brief.contactOrCta}`,
    `Arah visual: ${brief.stylePreference}`,
    brief.facts?.length
      ? `Fakta terstruktur: ${brief.facts.map((fact) => `${fact.label}: ${fact.value}`).join("; ")}`
      : "",
    brief.decisions?.length
      ? `Keputusan diskusi: ${brief.decisions.map((decision) => `${decision.question}: ${decision.answer}`).join("; ")}`
      : "",
    brief.visitorJobs?.length
      ? `Tujuan pengunjung: ${brief.visitorJobs.map((job) => `${job.priority}: ${job.goal}`).join("; ")}`
      : "",
    brief.notes.length ? `Catatan tambahan: ${brief.notes.join("; ")}` : "",
    brief.businessImages?.length
      ? `Gambar pelanggan: ${brief.businessImages.map((img) => `/media/${img.id} (${img.purpose})`).join("; ")}`
      : "",
    `Tingkat keyakinan: ${brief.confidence ?? 0}%`,
    brief.openQuestions?.length
      ? `Pertanyaan terbuka: ${brief.openQuestions.join("; ")}`
      : "",
  ].filter(Boolean);

  return lines.join("\n");
}

function normalizeBusinessImages(value: unknown): BusinessImageRef[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const result: BusinessImageRef[] = [];
  for (const item of value) {
    const input = item as Partial<BusinessImageRef> | null;
    if (
      !input ||
      typeof input.id !== "string" ||
      !input.id.trim() ||
      (input.purpose !== "business-image" &&
        input.purpose !== "logo" &&
        input.purpose !== "reference")
    ) {
      continue;
    }
    result.push({
      id: input.id.trim().slice(0, 1024),
      purpose: input.purpose,
    });
    if (result.length >= 12) {
      break;
    }
  }
  return result;
}

function normalizeFacts(value: unknown): ProjectFact[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const input = item as Partial<ProjectFact>;
      return {
        key: slugValue(input.key),
        label: stringValue(input.label).slice(0, 80),
        value: stringValue(input.value).slice(0, 280),
      };
    })
    .filter((item) => item.key && item.label && item.value)
    .slice(-40);
}

function normalizeDecisions(value: unknown): ProjectDecision[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const input = item as Partial<ProjectDecision>;
      return {
        id: slugValue(input.id),
        question: stringValue(input.question).slice(0, 160),
        answer: stringValue(input.answer).slice(0, 280),
      };
    })
    .filter((item) => item.id && item.question && item.answer)
    .slice(-40);
}

function mergeFacts(current: ProjectFact[], incoming: ProjectFact[]) {
  const byKey = new Map(current.map((item) => [item.key, item]));
  for (const item of normalizeFacts(incoming)) {
    byKey.set(item.key, item);
  }
  return [...byKey.values()].slice(-40);
}

function mergeDecisions(
  current: ProjectDecision[],
  incoming: ProjectDecision[],
) {
  const byId = new Map(current.map((item) => [item.id, item]));
  for (const item of normalizeDecisions(incoming)) {
    byId.set(item.id, item);
  }
  return [...byId.values()].slice(-40);
}

function slugValue(value: unknown) {
  return stringValue(value)
    .toLowerCase()
    .replace(/[^a-z0-9_ -]+/g, "")
    .replace(/[ -]+/g, "_")
    .slice(0, 80);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function stringValueOrNull(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed ? trimmed : null;
}

export function applyBriefValidator(
  input: CleanedBrief | unknown,
): ProjectBrief {
  const { cleaned } = validateBrief(input);
  return {
    ...createInitialBrief(""),
    ...cleaned,
    businessName: cleaned.businessName ?? "",
    targetCustomer: cleaned.targetCustomer ?? "",
    readyForBuild: false,
  };
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeConfidence(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round(parsed)));
}
