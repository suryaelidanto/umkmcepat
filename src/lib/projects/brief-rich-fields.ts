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
