import { createHash } from "node:crypto";

import {
  parseContact,
  validateBrief,
  type CertificationValue,
  type HoursValue,
  type PaymentMethodValue,
  type ProductOrServiceItem,
  type SocialLinkValue,
  type TestimonialValue,
  type UmkmType,
} from "./brief-rich-fields";
import { canonicalJson } from "./build-hash";
import {
  normalizeVisitorJobs,
  parseVisitorJobs,
  type VisitorJob,
} from "./visitor-jobs";

import type { BusinessImageRef, ProjectDecision, ProjectFact } from "./brief";
import type { FieldState, FieldStateMap } from "./chat-memory";

export type CanonicalPrimaryActionKind =
  "whatsapp" | "phone" | "instagram" | "maps" | "browse" | "other";

export type CanonicalPrimaryAction = {
  kind: CanonicalPrimaryActionKind;
  label: string;
  target: string | null;
};

export type ProjectBriefV2 = {
  version: 2;
  prompt: string;
  business: {
    name: string;
    type: string;
    category: UmkmType | null;
  };
  offers: ProductOrServiceItem[];
  visitorJobs: VisitorJob[];
  audience: string | null;
  primaryAction: CanonicalPrimaryAction | null;
  visualDirection: string | null;
  fieldState: FieldStateMap;
  content: {
    tagline: string | null;
    usp: string[];
    priceRange: string | null;
    hours: HoursValue[];
    address: string | null;
    deliveryArea: string | null;
    since: string | null;
    testimonials: TestimonialValue[];
    certifications: CertificationValue[];
    paymentMethods: PaymentMethodValue[];
    socialLinks: SocialLinkValue[];
    currentPromo: string | null;
    secondaryAction: { label: string; action: string } | null;
  };
  assets: BusinessImageRef[];
  provenance: {
    facts: ProjectFact[];
    decisions: ProjectDecision[];
  };
};

const BRIEF_HASH_PREFIX = "umkmcepat:project-brief:v2:";
const UMKM_TYPES: ReadonlySet<string> = new Set([
  "fnb",
  "retail",
  "jasa_lokal",
  "jasa_online",
  "kursus",
  "other",
]);
const ACTION_KINDS: ReadonlySet<string> = new Set([
  "whatsapp",
  "phone",
  "instagram",
  "maps",
  "browse",
  "other",
]);
const FIELD_STATES: ReadonlySet<string> = new Set([
  "asked",
  "answered",
  "declined",
  "explicitly_empty",
]);
const IMAGE_PURPOSES: ReadonlySet<string> = new Set([
  "business-image",
  "logo",
  "reference",
]);

export function createInitialCanonicalBrief(prompt = ""): ProjectBriefV2 {
  return {
    version: 2,
    prompt: cleanText(prompt),
    business: { name: "", type: "", category: null },
    offers: [],
    visitorJobs: [],
    audience: null,
    primaryAction: null,
    visualDirection: null,
    fieldState: {},
    content: {
      tagline: null,
      usp: [],
      priceRange: null,
      hours: [],
      address: null,
      deliveryArea: null,
      since: null,
      testimonials: [],
      certifications: [],
      paymentMethods: [],
      socialLinks: [],
      currentPromo: null,
      secondaryAction: null,
    },
    assets: [],
    provenance: { facts: [], decisions: [] },
  };
}

export function parseCanonicalBrief(
  value: unknown,
  prompt = "",
): ProjectBriefV2 {
  const source = asRecord(value);
  if (!source) {
    return createInitialCanonicalBrief(prompt);
  }
  return source.version === 2
    ? parseV2(source, prompt)
    : migrateLegacyBrief(source, prompt);
}

export function migrateLegacyBrief(
  value: unknown,
  prompt = "",
): ProjectBriefV2 {
  const source = asRecord(value) ?? {};
  const { cleaned } = validateBrief(source);
  const richOffers = cleaned.productOrService ?? [];
  const legacyOffer = cleanOptionalText(source.offer);
  const offers = ensurePrimaryOffer(
    richOffers.length
      ? richOffers
      : legacyOffer
        ? [{ name: legacyOffer, isPrimary: true }]
        : [],
  );

  return {
    version: 2,
    prompt: cleanText(source.prompt) || cleanText(prompt),
    business: {
      name: cleaned.businessName ?? cleanText(source.businessName),
      type: cleanText(source.businessType),
      category: parseUmkmType(source.umkmType),
    },
    offers,
    visitorJobs: Array.isArray(source.visitorJobs)
      ? normalizeVisitorJobs(source.visitorJobs)
      : [],
    audience: cleaned.targetCustomer,
    primaryAction: legacyPrimaryAction(source),
    visualDirection: cleanOptionalText(source.stylePreference),
    fieldState: parseFieldState(source.fieldState),
    content: contentFromCleaned(cleaned),
    assets: parseAssets(source.businessImages),
    provenance: {
      facts: parseFacts(source.facts),
      decisions: parseDecisions(source.decisions),
    },
  };
}

export function hashCanonicalBrief(brief: ProjectBriefV2): string {
  return createHash("sha256")
    .update(BRIEF_HASH_PREFIX + canonicalJson(brief), "utf8")
    .digest("hex");
}

export function getPrimaryOfferName(brief: ProjectBriefV2): string | null {
  const primary = brief.offers.find((offer) => offer.isPrimary);
  return (primary ?? brief.offers[0])?.name ?? null;
}

export function getPrimaryActionLabel(brief: ProjectBriefV2): string | null {
  return brief.primaryAction?.label ?? null;
}

export function applyAiBriefPatch(
  brief: ProjectBriefV2,
  patch: unknown,
): ProjectBriefV2 {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    return brief;
  }
  const input = patch as Record<string, unknown>;
  const hasKey = (key: string) =>
    Object.prototype.hasOwnProperty.call(input, key);
  const next: ProjectBriefV2 = {
    ...brief,
    business: { ...brief.business },
    fieldState: { ...brief.fieldState },
    content: {
      ...brief.content,
      usp: [...brief.content.usp],
      hours: [...brief.content.hours],
      testimonials: [...brief.content.testimonials],
      certifications: [...brief.content.certifications],
      paymentMethods: [...brief.content.paymentMethods],
      socialLinks: [...brief.content.socialLinks],
    },
    visitorJobs: [...brief.visitorJobs],
    assets: [...brief.assets],
    provenance: {
      facts: [...brief.provenance.facts],
      decisions: [...brief.provenance.decisions],
    },
  };

  const businessPatch = asRecord(input.business);
  if (hasKey("businessName") || businessPatch?.name !== undefined) {
    const value = cleanText(input.businessName ?? businessPatch?.name);
    if (value) {
      next.business.name = value;
    }
  }
  if (hasKey("businessType") || businessPatch?.type !== undefined) {
    const value = cleanText(input.businessType ?? businessPatch?.type);
    if (value) {
      next.business.type = value;
    }
  }
  if (hasKey("umkmType") || hasKey("business") || hasKey("category")) {
    const raw = input.umkmType ?? input.category ?? businessPatch?.category;
    if (raw !== undefined) {
      const parsed = parseUmkmType(raw);
      if (parsed) {
        next.business.category = parsed;
      }
    }
  }

  const hasProductPatch = hasKey("productOrService") || hasKey("offers");
  const hasOfferPatch = hasKey("offer");
  if (hasProductPatch) {
    const rawOffers = input.offers ?? input.productOrService;
    const offers = parseOffers(rawOffers);
    if (offers.length) {
      next.offers = ensurePrimaryOffer(offers);
    } else if (Array.isArray(rawOffers) && rawOffers.length === 0) {
      next.offers = [];
    }
  } else if (hasOfferPatch) {
    const legacy = cleanOptionalText(input.offer);
    if (legacy) {
      next.offers = [{ name: legacy, isPrimary: true }];
    }
  }

  if (hasKey("targetCustomer") || hasKey("audience")) {
    const raw = input.targetCustomer ?? input.audience;
    const value = cleanOptionalText(raw);
    if (value && value.length >= 3) {
      next.audience = value;
    } else if (value === "") {
      next.audience = null;
    } else if (hasKey("targetCustomer") || hasKey("audience")) {
      const { cleaned } = validateBrief({ targetCustomer: raw });
      if (cleaned.targetCustomer) {
        next.audience = cleaned.targetCustomer;
      }
    }
  }

  if (hasKey("contact") || hasKey("contactOrCta") || hasKey("primaryAction")) {
    if (hasKey("contact")) {
      const contact = parseContact(input.contact);
      if (contact) {
        next.primaryAction = {
          kind: contact.channel as CanonicalPrimaryActionKind,
          label: contact.label?.trim() || defaultContactLabel(contact.channel),
          target: contact.value,
        };
      }
    } else if (hasKey("contactOrCta")) {
      const label = cleanOptionalText(input.contactOrCta);
      if (label) {
        const phoneMatch = label.match(/\+?\d[\d\s-]{6,}/);
        const normalizedPhone = phoneMatch
          ? phoneMatch[0].replace(/[\s-]/g, "")
          : null;
        if (normalizedPhone && /^\+?\d{7,}$/.test(normalizedPhone)) {
          next.primaryAction = {
            kind: "whatsapp",
            label: `Chat WhatsApp`,
            target: normalizedPhone,
          };
        } else {
          next.primaryAction = { kind: "browse", label, target: null };
        }
      }
    } else if (hasKey("primaryAction")) {
      const action = parseCanonicalAction(input.primaryAction);
      if (action) {
        next.primaryAction = action;
      }
    }
  }

  if (hasKey("stylePreference") || hasKey("visualDirection")) {
    const raw = input.visualDirection ?? input.stylePreference;
    const value = cleanOptionalText(raw);
    next.visualDirection = value;
  }

  if (hasKey("visitorJobs") && Array.isArray(input.visitorJobs)) {
    const parsed = parseVisitorJobs(input.visitorJobs);
    if (parsed.ok) {
      next.visitorJobs = parsed.value;
    }
  }

  if (hasKey("fieldState")) {
    const parsed = parseFieldState(input.fieldState);
    next.fieldState = { ...next.fieldState, ...parsed };
  }

  const contentKeys: Array<keyof ProjectBriefV2["content"]> = [
    "tagline",
    "priceRange",
    "address",
    "deliveryArea",
    "since",
    "currentPromo",
  ];
  for (const key of contentKeys) {
    if (hasKey(key)) {
      const value = cleanOptionalText(input[key]);
      (next.content as Record<string, unknown>)[key] = value;
    }
  }
  if (hasKey("usp")) {
    if (Array.isArray(input.usp)) {
      const usp = (input.usp as unknown[])
        .map((value) => cleanText(value))
        .filter((value) => value.length >= 3);
      next.content.usp = usp;
    }
  }
  if (hasKey("secondaryCta") || hasKey("secondaryAction")) {
    const raw = input.secondaryAction ?? input.secondaryCta;
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      const rec = raw as Record<string, unknown>;
      const label = cleanText(rec.label);
      const action = cleanText(rec.action);
      if (label && action) {
        next.content.secondaryAction = { label, action };
      }
    } else if (raw === null) {
      next.content.secondaryAction = null;
    }
  }
  if (hasKey("hours") && Array.isArray(input.hours)) {
    const { cleaned } = validateBrief({ hours: input.hours });
    next.content.hours = cleaned.hours ?? [];
  }
  if (hasKey("testimonials") && Array.isArray(input.testimonials)) {
    const { cleaned } = validateBrief({ testimonials: input.testimonials });
    next.content.testimonials = cleaned.testimonials ?? [];
  }
  if (hasKey("certifications") && Array.isArray(input.certifications)) {
    const { cleaned } = validateBrief({ certifications: input.certifications });
    next.content.certifications = cleaned.certifications ?? [];
  }
  if (hasKey("paymentMethods") && Array.isArray(input.paymentMethods)) {
    const { cleaned } = validateBrief({ paymentMethods: input.paymentMethods });
    next.content.paymentMethods = cleaned.paymentMethods ?? [];
  }
  if (hasKey("socialLinks") && Array.isArray(input.socialLinks)) {
    const { cleaned } = validateBrief({ socialLinks: input.socialLinks });
    next.content.socialLinks = cleaned.socialLinks ?? [];
  }

  if (hasKey("businessImages") || hasKey("assets")) {
    const raw = input.assets ?? input.businessImages;
    const parsed = parseAssets(raw);
    if (parsed.length || Array.isArray(raw)) {
      const merged = new Map(next.assets.map((asset) => [asset.id, asset]));
      for (const asset of parsed) {
        merged.set(asset.id, asset);
      }
      next.assets = [...merged.values()].slice(-12);
    }
  }
  if (hasKey("facts") && Array.isArray(input.facts)) {
    const facts = parseFacts(input.facts);
    const byKey = new Map(
      next.provenance.facts.map((fact) => [fact.key, fact]),
    );
    for (const fact of facts) {
      byKey.set(fact.key, fact);
    }
    next.provenance.facts = [...byKey.values()].slice(-40);
  }
  if (hasKey("decisions") && Array.isArray(input.decisions)) {
    const decisions = parseDecisions(input.decisions);
    const byId = new Map(
      next.provenance.decisions.map((decision) => [decision.id, decision]),
    );
    for (const decision of decisions) {
      byId.set(decision.id, decision);
    }
    next.provenance.decisions = [...byId.values()].slice(-40);
  }
  if (hasKey("prompt")) {
    const value = cleanText(input.prompt);
    if (value) {
      next.prompt = value;
    }
  }

  return next;
}

function parseV2(
  source: Record<string, unknown>,
  prompt: string,
): ProjectBriefV2 {
  const business = asRecord(source.business) ?? {};
  const content = asRecord(source.content) ?? {};
  const provenance = asRecord(source.provenance) ?? {};
  const offers = parseOffers(source.offers);
  const richInput = {
    businessName: business.name,
    productOrService: offers,
    targetCustomer: source.audience,
    tagline: content.tagline,
    usp: content.usp,
    priceRange: content.priceRange,
    hours: content.hours,
    address: content.address,
    deliveryArea: content.deliveryArea,
    since: content.since,
    testimonials: content.testimonials,
    certifications: content.certifications,
    paymentMethods: content.paymentMethods,
    socialLinks: content.socialLinks,
    currentPromo: content.currentPromo,
    secondaryCta: content.secondaryAction,
  };
  const { cleaned } = validateBrief(richInput);

  return {
    version: 2,
    prompt: cleanText(source.prompt) || cleanText(prompt),
    business: {
      name: cleaned.businessName ?? "",
      type: cleanText(business.type),
      // A type of "fnb" already names the category; leaving it null made an
      // fnb warung fall back to the generic "other" branch downstream.
      category:
        parseUmkmType(business.category) ?? parseUmkmType(business.type),
    },
    offers: ensurePrimaryOffer(cleaned.productOrService ?? []),
    visitorJobs: Array.isArray(source.visitorJobs)
      ? normalizeVisitorJobs(source.visitorJobs)
      : [],
    audience: cleaned.targetCustomer,
    primaryAction: parseCanonicalAction(source.primaryAction),
    visualDirection: cleanOptionalText(source.visualDirection),
    fieldState: parseFieldState(source.fieldState),
    content: contentFromCleaned(cleaned),
    assets: parseAssets(source.assets),
    provenance: {
      facts: parseFacts(provenance.facts),
      decisions: parseDecisions(provenance.decisions),
    },
  };
}

function contentFromCleaned(
  cleaned: ReturnType<typeof validateBrief>["cleaned"],
): ProjectBriefV2["content"] {
  return {
    tagline: cleaned.tagline,
    usp: cleaned.usp ?? [],
    priceRange: cleaned.priceRange,
    hours: cleaned.hours ?? [],
    address: cleaned.address,
    deliveryArea: cleaned.deliveryArea,
    since: cleaned.since,
    testimonials: cleaned.testimonials ?? [],
    certifications: cleaned.certifications ?? [],
    paymentMethods: cleaned.paymentMethods ?? [],
    socialLinks: cleaned.socialLinks ?? [],
    currentPromo: cleaned.currentPromo,
    secondaryAction: cleaned.secondaryCta,
  };
}

function legacyPrimaryAction(
  source: Record<string, unknown>,
): CanonicalPrimaryAction | null {
  const contact = parseContact(source.contact);
  if (contact) {
    return {
      kind: contact.channel,
      label: contact.label?.trim() || defaultContactLabel(contact.channel),
      target: contact.value,
    };
  }
  const label = cleanOptionalText(source.contactOrCta);
  return label ? { kind: "browse", label, target: null } : null;
}

function parseCanonicalAction(value: unknown): CanonicalPrimaryAction | null {
  const action = asRecord(value);
  if (!action) {
    return null;
  }
  const kind = cleanText(action.kind);
  const label = cleanText(action.label);
  const target = cleanOptionalText(action.target);
  if (!ACTION_KINDS.has(kind) || !label) {
    return null;
  }
  if (
    (kind === "whatsapp" || kind === "phone") &&
    !parseContact({ channel: kind, value: target })
  ) {
    return null;
  }
  return {
    kind: kind as CanonicalPrimaryActionKind,
    label,
    target,
  };
}

function defaultContactLabel(channel: string): string {
  switch (channel) {
    case "whatsapp":
      return "Chat WhatsApp";
    case "phone":
      return "Telepon";
    case "instagram":
      return "Buka Instagram";
    case "maps":
      return "Lihat lokasi";
    default:
      return "Hubungi";
  }
}

function parseOffers(value: unknown): ProductOrServiceItem[] {
  const { cleaned } = validateBrief({ productOrService: value });
  return cleaned.productOrService ?? [];
}

function ensurePrimaryOffer(
  offers: ProductOrServiceItem[],
): ProductOrServiceItem[] {
  if (offers.length !== 1 || offers[0]?.isPrimary) {
    return offers;
  }
  return [{ ...offers[0], isPrimary: true }];
}

function parseUmkmType(value: unknown): UmkmType | null {
  const normalized = cleanText(value);
  return UMKM_TYPES.has(normalized) ? (normalized as UmkmType) : null;
}

function parseFieldState(value: unknown): FieldStateMap {
  const source = asRecord(value);
  if (!source) {
    return {};
  }
  const result: Record<string, FieldState> = {};
  for (const [key, candidate] of Object.entries(source)) {
    if (typeof candidate === "string" && FIELD_STATES.has(candidate)) {
      result[key] = candidate as FieldState;
    }
  }
  return result as FieldStateMap;
}

function parseAssets(value: unknown): BusinessImageRef[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const result: BusinessImageRef[] = [];
  for (const candidate of value) {
    const item = asRecord(candidate);
    const id = cleanText(item?.id);
    const purpose = cleanText(item?.purpose);
    if (!id || !IMAGE_PURPOSES.has(purpose)) {
      continue;
    }
    result.push({
      id: id.slice(0, 200),
      purpose: purpose as BusinessImageRef["purpose"],
    });
    if (result.length === 12) {
      break;
    }
  }
  return result;
}

function parseFacts(value: unknown): ProjectFact[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const result: ProjectFact[] = [];
  for (const candidate of value) {
    const item = asRecord(candidate);
    const key = cleanText(item?.key).slice(0, 80);
    const label = cleanText(item?.label).slice(0, 80);
    const factValue = cleanText(item?.value).slice(0, 280);
    if (key && label && factValue) {
      result.push({ key, label, value: factValue });
    }
  }
  return result.slice(-40);
}

function parseDecisions(value: unknown): ProjectDecision[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const result: ProjectDecision[] = [];
  for (const candidate of value) {
    const item = asRecord(candidate);
    const id = cleanText(item?.id).slice(0, 80);
    const question = cleanText(item?.question).slice(0, 160);
    const answer = cleanText(item?.answer).slice(0, 280);
    if (id && question && answer) {
      result.push({ id, question, answer });
    }
  }
  return result.slice(-40);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function cleanOptionalText(value: unknown): string | null {
  return cleanText(value) || null;
}
