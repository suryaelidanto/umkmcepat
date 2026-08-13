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
      category: parseUmkmType(business.category),
    },
    offers: ensurePrimaryOffer(cleaned.productOrService ?? []),
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
  if (!ACTION_KINDS.has(kind) || !label) {
    return null;
  }
  return {
    kind: kind as CanonicalPrimaryActionKind,
    label,
    target: cleanOptionalText(action.target),
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
