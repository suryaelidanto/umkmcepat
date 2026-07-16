// src/lib/projects/brief-rich-fields.ts
export type ContactChannel =
  "whatsapp" | "phone" | "instagram" | "maps" | "other";

export type ContactValue = {
  channel: ContactChannel;
  value: string;
  label?: string;
};

export type SocialPlatform =
  "instagram" | "tiktok" | "facebook" | "youtube" | "x" | "other";

export type SocialLinkValue = {
  platform: SocialPlatform;
  handle: string;
  url?: string;
};

export type PaymentMethod = "cash" | "transfer" | "qris" | "ewallet" | "cod";

export type PaymentMethodValue = {
  method: PaymentMethod;
  detail?: string;
};

export type CertificationValue = {
  name: string;
  issuer?: string;
};

export type HoursValue = {
  dayRange: string;
  open: string;
  close: string;
  note?: string;
};

export type TestimonialValue = {
  quote: string;
  author: string;
  context?: string;
  rating?: 1 | 2 | 3 | 4 | 5;
};

export type ProductOrServiceItem = {
  name: string;
  description?: string;
  priceRange?: string;
  isPrimary?: boolean;
};

const PAYMENT_METHODS: readonly PaymentMethod[] = [
  "cash",
  "transfer",
  "qris",
  "ewallet",
  "cod",
] as const;

const PHONE_RE = /^\+?\d[\d\s-]{6,}$/;
const HOURS_RE = /^\d{1,2}[:.]\d{2}$/;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function stringField(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  return typeof value === "string" ? value.trim() : "";
}

export function parseContact(input: unknown): ContactValue | null {
  if (!isObject(input)) {
    return null;
  }
  const channel = stringField(input, "channel") as ContactChannel;
  if (!["whatsapp", "phone", "instagram", "maps", "other"].includes(channel)) {
    return null;
  }
  const value = stringField(input, "value");
  if (!value) {
    return null;
  }
  if (channel === "whatsapp" || channel === "phone") {
    if (!PHONE_RE.test(value)) {
      return null;
    }
  }
  if (
    channel === "instagram" &&
    !value.includes("@") &&
    !value.includes("instagram.com")
  ) {
    return null;
  }
  const label = stringField(input, "label") || undefined;
  return { channel, value, label };
}

export function parseSocialLink(input: unknown): SocialLinkValue | null {
  if (!isObject(input)) {
    return null;
  }
  const platform = stringField(input, "platform") as SocialPlatform;
  if (
    !["instagram", "tiktok", "facebook", "youtube", "x", "other"].includes(
      platform,
    )
  ) {
    return null;
  }
  const handle = stringField(input, "handle");
  if (!handle) {
    return null;
  }
  const url = stringField(input, "url") || undefined;
  return { platform, handle, url };
}

export function parsePaymentMethod(input: unknown): PaymentMethodValue | null {
  if (typeof input === "string") {
    const method = input.trim().toLowerCase() as PaymentMethod;
    if (!PAYMENT_METHODS.includes(method)) {
      return null;
    }
    return { method };
  }
  if (isObject(input)) {
    const method = stringField(input, "method") as PaymentMethod;
    if (!PAYMENT_METHODS.includes(method)) {
      return null;
    }
    const detail = stringField(input, "detail") || undefined;
    return { method, detail };
  }
  return null;
}

export function parseCertification(input: unknown): CertificationValue | null {
  if (!isObject(input)) {
    return null;
  }
  const name = stringField(input, "name");
  if (!name) {
    return null;
  }
  const issuer = stringField(input, "issuer") || undefined;
  return { name, issuer };
}

export function parseHours(input: unknown): HoursValue | null {
  if (!isObject(input)) {
    return null;
  }
  const dayRange = stringField(input, "dayRange");
  const open = stringField(input, "open");
  const close = stringField(input, "close");
  if (!dayRange || !HOURS_RE.test(open) || !HOURS_RE.test(close)) {
    return null;
  }
  const note = stringField(input, "note") || undefined;
  return { dayRange, open, close, note };
}

export function parseTestimonial(input: unknown): TestimonialValue | null {
  if (!isObject(input)) {
    return null;
  }
  const quote = stringField(input, "quote");
  const author = stringField(input, "author");
  if (!quote || !author) {
    return null;
  }
  const rawRating = input.rating;
  const ratingNum =
    typeof rawRating === "number" ? rawRating : Number(rawRating);
  const rating: 1 | 2 | 3 | 4 | 5 | undefined = Number.isFinite(ratingNum)
    ? (Math.min(5, Math.max(1, Math.round(ratingNum))) as 1 | 2 | 3 | 4 | 5)
    : undefined;
  const context = stringField(input, "context") || undefined;
  return { quote, author, context, rating };
}

export function parseProductOrServiceItem(
  input: unknown,
): ProductOrServiceItem | null {
  if (!isObject(input)) {
    return null;
  }
  const name = stringField(input, "name");
  if (!name) {
    return null;
  }
  const description = stringField(input, "description") || undefined;
  const priceRange = stringField(input, "priceRange") || undefined;
  const isPrimary = input.isPrimary === true ? true : undefined;
  return { name, description, priceRange, isPrimary };
}

export type UmkmType =
  "fnb" | "retail" | "jasa_lokal" | "jasa_online" | "kursus" | "other";

export type SoftFieldId =
  | "contact"
  | "tagline"
  | "usp"
  | "visuals"
  | "priceRange"
  | "targetCustomer"
  | "hours"
  | "address"
  | "deliveryArea"
  | "since"
  | "testimonials"
  | "certifications"
  | "paymentMethods"
  | "socialLinks"
  | "currentPromo"
  | "secondaryCta";

export const SOFT_FIELDS: readonly SoftFieldId[] = [
  "contact",
  "tagline",
  "usp",
  "visuals",
  "priceRange",
  "targetCustomer",
  "hours",
  "address",
  "deliveryArea",
  "since",
  "testimonials",
  "certifications",
  "paymentMethods",
  "socialLinks",
  "currentPromo",
  "secondaryCta",
] as const;

const ALWAYS: readonly SoftFieldId[] = ["contact", "tagline", "usp", "visuals"];

export const FIELD_APPLICABILITY: Record<UmkmType, readonly SoftFieldId[]> = {
  fnb: [
    ...ALWAYS,
    "hours",
    "address",
    "deliveryArea",
    "paymentMethods",
    "priceRange",
    "since",
    "secondaryCta",
  ],
  retail: [
    ...ALWAYS,
    "hours",
    "address",
    "paymentMethods",
    "priceRange",
    "since",
  ],
  jasa_lokal: [
    ...ALWAYS,
    "hours",
    "address",
    "deliveryArea",
    "priceRange",
    "since",
  ],
  jasa_online: [
    ...ALWAYS,
    "priceRange",
    "socialLinks",
    "secondaryCta",
    "testimonials",
  ],
  kursus: [...ALWAYS, "hours", "priceRange", "socialLinks", "secondaryCta"],
  other: ALWAYS,
};

export function getApplicableFields(type: UmkmType): readonly SoftFieldId[] {
  return FIELD_APPLICABILITY[type] ?? ALWAYS;
}

const GENERIC_SINGLE_WORDS = new Set([
  "warung",
  "toko",
  "kedai",
  "kios",
  "resto",
  "rumah",
  "tempat",
  " usaha",
  "jasa",
  "brand",
  "toko",
]);

export type CleanedBrief = {
  businessName: string | null;
  productOrService: ProductOrServiceItem[] | null;
  contact: ContactValue | null;
  tagline: string | null;
  usp: string[] | null;
  targetCustomer: string | null;
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
};

function looksLikePrice(v: string): boolean {
  if (!v || v.length < 3) {
    return false;
  }
  if (/^[\s.\-_,]+$/.test(v)) {
    return false;
  }
  return true;
}

function looksLikeBusinessName(v: string): boolean {
  if (!v) {
    return false;
  }
  if (v.split(/\s+/).length === 1) {
    return !GENERIC_SINGLE_WORDS.has(v.toLowerCase());
  }
  return true;
}

export function validateBrief(input: unknown): {
  cleaned: CleanedBrief;
  dropped: string[];
} {
  const dropped: string[] = [];
  const source = isObject(input) ? input : {};
  const cleaned: CleanedBrief = {
    businessName: null,
    productOrService: null,
    contact: null,
    tagline: null,
    usp: null,
    targetCustomer: null,
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
  };

  const businessName = stringField(source, "businessName");
  if (businessName) {
    if (looksLikeBusinessName(businessName)) {
      cleaned.businessName = businessName;
    } else {
      dropped.push("businessName");
    }
  }

  const pos = source.productOrService;
  if (Array.isArray(pos)) {
    const items = pos
      .map(parseProductOrServiceItem)
      .filter((v): v is ProductOrServiceItem => v !== null);
    if (items.length) {
      cleaned.productOrService = items;
    }
  } else if (typeof pos === "string" && pos.trim()) {
    const parsed = parseProductOrServiceItem({ name: pos });
    if (parsed) {
      cleaned.productOrService = [parsed];
    }
  }

  const contact = parseContact(source.contact);
  if (contact) {
    cleaned.contact = contact;
  } else if ("contact" in source && source.contact !== null) {
    dropped.push("contact");
  }

  const tagline = stringField(source, "tagline");
  if (tagline && tagline.length >= 3) {
    cleaned.tagline = tagline;
  }

  if (Array.isArray(source.usp)) {
    const usp = source.usp
      .map((v) => stringField({ v }, "v"))
      .filter((v) => v.length >= 3);
    if (usp.length) {
      cleaned.usp = usp;
    }
  }

  const targetCustomer = stringField(source, "targetCustomer");
  if (targetCustomer && targetCustomer.length >= 3) {
    cleaned.targetCustomer = targetCustomer;
  }

  const priceRange = stringField(source, "priceRange");
  if (priceRange) {
    if (looksLikePrice(priceRange)) {
      cleaned.priceRange = priceRange;
    } else {
      dropped.push("priceRange");
    }
  }

  if (typeof source.visuals === "boolean") {
    cleaned.visuals = source.visuals;
  }

  if (Array.isArray(source.hours)) {
    const hours = source.hours
      .map(parseHours)
      .filter((v): v is HoursValue => v !== null);
    if (hours.length) {
      cleaned.hours = hours;
    }
  }

  const address = stringField(source, "address");
  if (address && address.length >= 3) {
    cleaned.address = address;
  }

  const deliveryArea = stringField(source, "deliveryArea");
  if (deliveryArea && deliveryArea.length >= 3) {
    cleaned.deliveryArea = deliveryArea;
  }

  const since = stringField(source, "since");
  if (since && since.length >= 3) {
    cleaned.since = since;
  }

  if (Array.isArray(source.testimonials)) {
    const testimonials = source.testimonials
      .map(parseTestimonial)
      .filter((v): v is TestimonialValue => v !== null);
    if (testimonials.length) {
      cleaned.testimonials = testimonials;
    }
  }

  if (Array.isArray(source.certifications)) {
    const certs = source.certifications
      .map(parseCertification)
      .filter((v): v is CertificationValue => v !== null);
    if (certs.length) {
      cleaned.certifications = certs;
    }
  }

  if (Array.isArray(source.paymentMethods)) {
    const pm = source.paymentMethods
      .map(parsePaymentMethod)
      .filter((v): v is PaymentMethodValue => v !== null);
    if (pm.length) {
      cleaned.paymentMethods = pm;
    }
  }

  if (Array.isArray(source.socialLinks)) {
    const sl = source.socialLinks
      .map(parseSocialLink)
      .filter((v): v is SocialLinkValue => v !== null);
    if (sl.length) {
      cleaned.socialLinks = sl;
    }
  }

  const currentPromo = stringField(source, "currentPromo");
  if (currentPromo && currentPromo.length >= 3) {
    cleaned.currentPromo = currentPromo;
  }

  if (isObject(source.secondaryCta)) {
    const label = stringField(source.secondaryCta, "label");
    const action = stringField(source.secondaryCta, "action");
    if (label && action) {
      cleaned.secondaryCta = { label, action };
    }
  }

  return { cleaned, dropped };
}
