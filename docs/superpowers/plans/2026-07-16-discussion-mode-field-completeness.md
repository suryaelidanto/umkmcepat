# Discussion Mode Field Completeness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the LLM discussion mode responsible for field completeness before "Mulai build", with a typed 18-field brief, per-UMKM applicability, a heuristic validator that drops hallucinated values, and render-side hiding of empty sections.

**Architecture:** Keep the existing free-flow chat. Add typed rich-field schemas to the brief, ship a per-UMKM applicability map that the system prompt reads, and add a `readyForBuild` boolean on each discuss turn that gates the client button. Server-side: a heuristic validator scrubs hallucinated values before render. Renderer: audit each soft-field section so empty values hide cleanly.

**Tech Stack:** Bun, TypeScript, TanStack Start, React, Vite, Vitest. The ai-sdk v7 tool-mode extraction in `src/routes/api.projects.preview.ts`.

## Global Constraints

- Bun only — `bun.lock` is the lockfile, never `package-lock.json` / `pnpm-lock.yaml` / `yarn.lock` / `bun.lockb`.
- Strict TypeScript. No `any`. Prefer discriminated unions for rich-field shapes.
- Pre-push chain runs prettier, eslint, tsc, vitest, knip. All must pass.
- Conventional commit messages; commitlint enforces ≤100 char body lines.
- Bahasa Indonesia for user-facing copy in prompts and AI voice rules. Code identifiers stay English.
- No new runtime dependencies. Use stdlib + already-installed packages.
- Photo upload is **out of scope** for this plan. The `visuals` field tracks "does the UMKM have photos" as a boolean, not bytes.

## File Structure

New:
- `src/lib/projects/brief-rich-fields.ts` — typed rich-field schemas (contact, socialLinks, paymentMethods, certifications, hours, testimonials, productOrService list), per-UMKM applicability map, "looks real" heuristic validator.
- `src/lib/projects/brief-rich-fields.test.ts` — unit tests for schemas, applicability, and validator.
- `src/lib/projects/prompts/discuss-system.md` — system prompt content for the LLM that includes the 18-field catalog, applicability rules, voice rules, greeting, empty-businessName handling, multi-product handling, re-discussion constraint, safety rules, confidence rule. Loaded as a string at module init.
- `src/lib/projects/prompts/discuss-system.test.ts` — golden tests for the prompt content (it must mention every field, applicability keys, the confidence threshold, and the safety rules).
- `src/lib/projects/build-handoff.ts` — produces the one-line build confirmation from the current brief.
- `src/lib/projects/build-handoff.test.ts` — unit tests for handoff copy generation.

Modified:
- `src/lib/projects/brief.ts` — extend `ProjectBrief` and `ProjectBriefPatch` with the new typed fields, add `readyForBuild: boolean`, expose new helpers (`isBriefReadyForBuild`, `applyBriefValidator`).
- `src/lib/projects/brief.test.ts` — extend tests for new fields and `readyForBuild`.
- `src/lib/projects/chat-memory.ts` — track per-field state (asked / answered / declined / explicitly-empty) in the hidden chat context. Track dominant language of the transcript.
- `src/lib/projects/chat-memory.test.ts` — extend tests for field state tracking.
- `src/routes/api.projects.preview.ts` — load the new system prompt, add `readyForBuild` to the extracted card schema, run the validator on the extracted brief, append the field-state block to the hidden context, run language detection.
- `src/components/projects/WorkspaceShell.tsx` — read `readyForBuild` from the latest discuss card, gate the build button, render the build-handoff confirmation line.
- `src/components/projects/renderer/ProjectSitePreview.tsx` — audit and fix empty soft-field sections (USP, since, paymentMethods, deliveryArea, secondaryCta, currentPromo, testimonials, certifications, multi-product list). Hide cleanly when absent.
- `src/lib/projects/site-schema.ts` — confirm the schema supports the new typed fields and that consumers can ask "is this field present" without parsing the value.

---

## Task 1: Typed rich-field schemas

**Files:**
- Create: `src/lib/projects/brief-rich-fields.ts`
- Test: `src/lib/projects/brief-rich-fields.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `ContactValue`, `SocialLinkValue`, `PaymentMethodValue`, `CertificationValue`, `HoursValue`, `TestimonialValue`, `ProductOrServiceItem`, `RichBrief` discriminated shapes. Exports `parseContact`, `parseSocialLink`, `parsePaymentMethod`, `parseCertification`, `parseHours`, `parseTestimonial`, `parseProductOrServiceItem`. All accept `unknown` and return either a parsed value or `null`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import {
  parseContact,
  parseSocialLink,
  parsePaymentMethod,
  parseCertification,
  parseHours,
  parseTestimonial,
  parseProductOrServiceItem,
} from "@/lib/projects/brief-rich-fields";

describe("brief rich-field parsers", () => {
  it("parses a valid contact", () => {
    expect(parseContact({ channel: "whatsapp", value: "08123456789" })).toEqual({
      channel: "whatsapp",
      value: "08123456789",
      label: undefined,
    });
  });

  it("rejects a contact with a non-phone value for whatsapp", () => {
    expect(parseContact({ channel: "whatsapp", value: "not-a-number" })).toBeNull();
  });

  it("rejects an instagram contact whose value lacks an @ or instagram.com", () => {
    expect(parseContact({ channel: "instagram", value: "hello world" })).toBeNull();
  });

  it("parses a social link with a valid platform and handle", () => {
    expect(parseSocialLink({ platform: "instagram", handle: "@kopi.tuku" })).toEqual({
      platform: "instagram",
      handle: "@kopi.tuku",
      url: undefined,
    });
  });

  it("rejects an empty payment method", () => {
    expect(parsePaymentMethod("")).toBeNull();
  });

  it("parses a known payment method", () => {
    expect(parsePaymentMethod("qris")).toEqual({ method: "qris", detail: undefined });
  });

  it("parses a certification with a name", () => {
    expect(parseCertification({ name: "Halal" })).toEqual({
      name: "Halal",
      issuer: undefined,
    });
  });

  it("rejects an hours entry missing open or close", () => {
    expect(parseHours({ dayRange: "Senin-Jumat", open: "08:00" })).toBeNull();
  });

  it("parses a hours entry with all fields", () => {
    expect(parseHours({ dayRange: "Senin-Jumat", open: "08:00", close: "21:00" })).toEqual({
      dayRange: "Senin-Jumat",
      open: "08:00",
      close: "21:00",
      note: undefined,
    });
  });

  it("parses a testimonial with rating clamped to 1..5", () => {
    expect(parseTestimonial({ quote: "Mantap", author: "Ibu Rina", rating: 9 })).toEqual({
      quote: "Mantap",
      author: "Ibu Rina",
      context: undefined,
      rating: 5,
    });
  });

  it("parses a productOrService item marking isPrimary", () => {
    expect(parseProductOrServiceItem({ name: "Nasi Goreng", isPrimary: true })).toEqual({
      name: "Nasi Goreng",
      description: undefined,
      priceRange: undefined,
      isPrimary: true,
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/lib/projects/brief-rich-fields.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the minimal implementation**

```ts
// src/lib/projects/brief-rich-fields.ts
export type ContactChannel = "whatsapp" | "phone" | "instagram" | "maps" | "other";

export type ContactValue = {
  channel: ContactChannel;
  value: string;
  label?: string;
};

export type SocialPlatform =
  | "instagram"
  | "tiktok"
  | "facebook"
  | "youtube"
  | "x"
  | "other";

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
  if (!isObject(input)) return null;
  const channel = stringField(input, "channel") as ContactChannel;
  if (!["whatsapp", "phone", "instagram", "maps", "other"].includes(channel)) return null;
  const value = stringField(input, "value");
  if (!value) return null;
  if (channel === "whatsapp" || channel === "phone") {
    if (!PHONE_RE.test(value)) return null;
  }
  if (channel === "instagram" && !value.includes("@") && !value.includes("instagram.com")) {
    return null;
  }
  const label = stringField(input, "label") || undefined;
  return { channel, value, label };
}

export function parseSocialLink(input: unknown): SocialLinkValue | null {
  if (!isObject(input)) return null;
  const platform = stringField(input, "platform") as SocialPlatform;
  if (!["instagram", "tiktok", "facebook", "youtube", "x", "other"].includes(platform)) {
    return null;
  }
  const handle = stringField(input, "handle");
  if (!handle) return null;
  const url = stringField(input, "url") || undefined;
  return { platform, handle, url };
}

export function parsePaymentMethod(input: unknown): PaymentMethodValue | null {
  if (typeof input === "string") {
    const method = input.trim().toLowerCase() as PaymentMethod;
    if (!PAYMENT_METHODS.includes(method)) return null;
    return { method };
  }
  if (isObject(input)) {
    const method = stringField(input, "method") as PaymentMethod;
    if (!PAYMENT_METHODS.includes(method)) return null;
    const detail = stringField(input, "detail") || undefined;
    return { method, detail };
  }
  return null;
}

export function parseCertification(input: unknown): CertificationValue | null {
  if (!isObject(input)) return null;
  const name = stringField(input, "name");
  if (!name) return null;
  const issuer = stringField(input, "issuer") || undefined;
  return { name, issuer };
}

export function parseHours(input: unknown): HoursValue | null {
  if (!isObject(input)) return null;
  const dayRange = stringField(input, "dayRange");
  const open = stringField(input, "open");
  const close = stringField(input, "close");
  if (!dayRange || !HOURS_RE.test(open) || !HOURS_RE.test(close)) return null;
  const note = stringField(input, "note") || undefined;
  return { dayRange, open, close, note };
}

export function parseTestimonial(input: unknown): TestimonialValue | null {
  if (!isObject(input)) return null;
  const quote = stringField(input, "quote");
  const author = stringField(input, "author");
  if (!quote || !author) return null;
  const rawRating = input.rating;
  const ratingNum = typeof rawRating === "number" ? rawRating : Number(rawRating);
  const rating: 1 | 2 | 3 | 4 | 5 | undefined = Number.isFinite(ratingNum)
    ? Math.min(5, Math.max(1, Math.round(ratingNum))) as 1 | 2 | 3 | 4 | 5
    : undefined;
  const context = stringField(input, "context") || undefined;
  return { quote, author, context, rating };
}

export function parseProductOrServiceItem(input: unknown): ProductOrServiceItem | null {
  if (!isObject(input)) return null;
  const name = stringField(input, "name");
  if (!name) return null;
  const description = stringField(input, "description") || undefined;
  const priceRange = stringField(input, "priceRange") || undefined;
  const isPrimary = input.isPrimary === true ? true : undefined;
  return { name, description, priceRange, isPrimary };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/lib/projects/brief-rich-fields.test.ts`
Expected: PASS — 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/projects/brief-rich-fields.ts src/lib/projects/brief-rich-fields.test.ts
git commit -m "feat(brief): add typed rich-field parsers

Contact, social link, payment method, certification, hours,
testimonial, and product/service item. Each parser accepts
unknown and returns null on missing or malformed input.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 2: Per-UMKM applicability map

**Files:**
- Modify: `src/lib/projects/brief-rich-fields.ts`
- Modify: `src/lib/projects/brief-rich-fields.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `UmkmType`, `SOFT_FIELDS`, `FIELD_APPLICABILITY: Record<UmkmType, readonly SoftFieldId[]>`, `getApplicableFields(type: UmkmType)`.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/projects/brief-rich-fields.test.ts`:

```ts
import { FIELD_APPLICABILITY, getApplicableFields, SOFT_FIELDS } from "@/lib/projects/brief-rich-fields";

describe("field applicability", () => {
  it("always-on fields are in every type's applicable set", () => {
    const alwaysOn: ReadonlyArray<"contact" | "tagline" | "usp" | "visuals"> = [
      "contact",
      "tagline",
      "usp",
      "visuals",
    ];
    for (const t of Object.keys(FIELD_APPLICABILITY) as Array<keyof typeof FIELD_APPLICABILITY>) {
      for (const f of alwaysOn) {
        expect(getApplicableFields(t)).toContain(f);
      }
    }
  });

  it("F&B applicability includes hours, address, paymentMethods, priceRange, since", () => {
    const applicable = getApplicableFields("fnb");
    expect(applicable).toContain("hours");
    expect(applicable).toContain("address");
    expect(applicable).toContain("paymentMethods");
    expect(applicable).toContain("priceRange");
    expect(applicable).toContain("since");
  });

  it("online-only jasa excludes address, hours, deliveryArea", () => {
    const applicable = getApplicableFields("jasa_online");
    expect(applicable).not.toContain("address");
    expect(applicable).not.toContain("hours");
    expect(applicable).not.toContain("deliveryArea");
  });

  it("SOFT_FIELDS is the union of all field ids", () => {
    expect(SOFT_FIELDS).toContain("contact");
    expect(SOFT_FIELDS).toContain("testimonials");
    expect(SOFT_FIELDS).toContain("secondaryCta");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/lib/projects/brief-rich-fields.test.ts`
Expected: FAIL — `FIELD_APPLICABILITY` not exported.

- [ ] **Step 3: Add the map**

Append to `src/lib/projects/brief-rich-fields.ts`:

```ts
export type UmkmType =
  | "fnb"
  | "retail"
  | "jasa_lokal"
  | "jasa_online"
  | "kursus"
  | "other";

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
  fnb: [...ALWAYS, "hours", "address", "deliveryArea", "paymentMethods", "priceRange", "since", "secondaryCta"],
  retail: [...ALWAYS, "hours", "address", "paymentMethods", "priceRange", "since"],
  jasa_lokal: [...ALWAYS, "hours", "address", "deliveryArea", "priceRange", "since"],
  jasa_online: [...ALWAYS, "priceRange", "socialLinks", "secondaryCta", "testimonials"],
  kursus: [...ALWAYS, "hours", "priceRange", "socialLinks", "secondaryCta"],
  other: ALWAYS,
};

export function getApplicableFields(type: UmkmType): readonly SoftFieldId[] {
  return FIELD_APPLICABILITY[type] ?? ALWAYS;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/lib/projects/brief-rich-fields.test.ts`
Expected: PASS — 15 tests total.

- [ ] **Step 5: Commit**

```bash
git add src/lib/projects/brief-rich-fields.ts src/lib/projects/brief-rich-fields.test.ts
git commit -m "feat(brief): add per-UMKM field applicability map

Six UMKM types. Always-on fields: contact, tagline, USP, visuals.
F&B, retail, jasa_lokal, jasa_online, kursus, other each carry
their own applicable set.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 3: Heuristic validator

**Files:**
- Modify: `src/lib/projects/brief-rich-fields.ts`
- Modify: `src/lib/projects/brief-rich-fields.test.ts`

**Interfaces:**
- Consumes: `parseContact`, etc. from Task 1.
- Produces: `validateBrief(brief: unknown): { cleaned: CleanedBrief; dropped: string[] }`. Drops hallucinated values to null, returns a list of field ids that were dropped.

- [ ] **Step 1: Write the failing test**

Append:

```ts
import { validateBrief } from "@/lib/projects/brief-rich-fields";

describe("validateBrief", () => {
  it("keeps a well-formed businessName", () => {
    const result = validateBrief({ businessName: "Kopi Tuku", productOrService: "Kopi" });
    expect(result.dropped).toEqual([]);
    expect(result.cleaned.businessName).toBe("Kopi Tuku");
  });

  it("drops a single-word generic businessName", () => {
    const result = validateBrief({ businessName: "Warung" });
    expect(result.dropped).toContain("businessName");
    expect(result.cleaned.businessName).toBeNull();
  });

  it("drops a hallucinated phone number contact", () => {
    const result = validateBrief({
      businessName: "Kopi Tuku",
      contact: { channel: "whatsapp", value: "hello world" },
    });
    expect(result.dropped).toContain("contact");
    expect(result.cleaned.contact).toBeNull();
  });

  it("keeps a valid whatsapp contact", () => {
    const result = validateBrief({
      businessName: "Kopi Tuku",
      contact: { channel: "whatsapp", value: "08123456789" },
    });
    expect(result.dropped).toEqual([]);
    expect(result.cleaned.contact).toEqual({ channel: "whatsapp", value: "08123456789", label: undefined });
  });

  it("drops a priceRange that is just dots", () => {
    const result = validateBrief({ businessName: "Kopi Tuku", priceRange: "...." });
    expect(result.dropped).toContain("priceRange");
  });

  it("keeps a sensible priceRange", () => {
    const result = validateBrief({ businessName: "Kopi Tuku", priceRange: "20-50rb" });
    expect(result.dropped).toEqual([]);
    expect(result.cleaned.priceRange).toBe("20-50rb");
  });
});
```

- [ ] **Step 2: Run the test to verify it fail**

Run: `bun test src/lib/projects/brief-rich-fields.test.ts`
Expected: FAIL — `validateBrief` not exported.

- [ ] **Step 3: Implement the validator**

Append:

```ts
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
  if (!v || v.length < 3) return false;
  if (/^[\s.\-_,]+$/.test(v)) return false;
  return true;
}

function looksLikeBusinessName(v: string): boolean {
  if (!v) return false;
  if (v.split(/\s+/).length === 1) {
    return !GENERIC_SINGLE_WORDS.has(v.toLowerCase());
  }
  return true;
}

export function validateBrief(input: unknown): { cleaned: CleanedBrief; dropped: string[] } {
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
    if (items.length) cleaned.productOrService = items;
  } else if (typeof pos === "string" && pos.trim()) {
    const parsed = parseProductOrServiceItem({ name: pos });
    if (parsed) cleaned.productOrService = [parsed];
  }

  const contact = parseContact(source.contact);
  if (contact) {
    cleaned.contact = contact;
  } else if ("contact" in source && source.contact !== null) {
    dropped.push("contact");
  }

  const tagline = stringField(source, "tagline");
  if (tagline && tagline.length >= 3) cleaned.tagline = tagline;

  if (Array.isArray(source.usp)) {
    const usp = source.usp
      .map((v) => stringField({ v }, "v"))
      .filter((v) => v.length >= 3);
    if (usp.length) cleaned.usp = usp;
  }

  const targetCustomer = stringField(source, "targetCustomer");
  if (targetCustomer && targetCustomer.length >= 3) cleaned.targetCustomer = targetCustomer;

  const priceRange = stringField(source, "priceRange");
  if (priceRange) {
    if (looksLikePrice(priceRange)) cleaned.priceRange = priceRange;
    else dropped.push("priceRange");
  }

  if (typeof source.visuals === "boolean") cleaned.visuals = source.visuals;

  if (Array.isArray(source.hours)) {
    const hours = source.hours
      .map(parseHours)
      .filter((v): v is HoursValue => v !== null);
    if (hours.length) cleaned.hours = hours;
  }

  const address = stringField(source, "address");
  if (address && address.length >= 3) cleaned.address = address;

  const deliveryArea = stringField(source, "deliveryArea");
  if (deliveryArea && deliveryArea.length >= 3) cleaned.deliveryArea = deliveryArea;

  const since = stringField(source, "since");
  if (since && since.length >= 3) cleaned.since = since;

  if (Array.isArray(source.testimonials)) {
    const testimonials = source.testimonials
      .map(parseTestimonial)
      .filter((v): v is TestimonialValue => v !== null);
    if (testimonials.length) cleaned.testimonials = testimonials;
  }

  if (Array.isArray(source.certifications)) {
    const certs = source.certifications
      .map(parseCertification)
      .filter((v): v is CertificationValue => v !== null);
    if (certs.length) cleaned.certifications = certs;
  }

  if (Array.isArray(source.paymentMethods)) {
    const pm = source.paymentMethods
      .map(parsePaymentMethod)
      .filter((v): v is PaymentMethodValue => v !== null);
    if (pm.length) cleaned.paymentMethods = pm;
  }

  if (Array.isArray(source.socialLinks)) {
    const sl = source.socialLinks
      .map(parseSocialLink)
      .filter((v): v is SocialLinkValue => v !== null);
    if (sl.length) cleaned.socialLinks = sl;
  }

  const currentPromo = stringField(source, "currentPromo");
  if (currentPromo && currentPromo.length >= 3) cleaned.currentPromo = currentPromo;

  if (isObject(source.secondaryCta)) {
    const label = stringField(source.secondaryCta, "label");
    const action = stringField(source.secondaryCta, "action");
    if (label && action) cleaned.secondaryCta = { label, action };
  }

  return { cleaned, dropped };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/lib/projects/brief-rich-fields.test.ts`
Expected: PASS — 21 tests total.

- [ ] **Step 5: Commit**

```bash
git add src/lib/projects/brief-rich-fields.ts src/lib/projects/brief-rich-fields.test.ts
git commit -m "feat(brief): heuristic validator drops hallucinated values

Single-word generic business names, malformed phone numbers,
and obviously empty price ranges are dropped to null. Validator
returns a cleaned brief plus a list of dropped field ids.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 4: Extend ProjectBrief with new fields and readyForBuild

**Files:**
- Modify: `src/lib/projects/brief.ts`
- Modify: `src/lib/projects/brief.test.ts`

**Interfaces:**
- Consumes: `CleanedBrief` shape from Task 3.
- Produces: Extended `ProjectBrief` carrying the new fields and `readyForBuild: boolean`. New helpers: `isBriefReadyForBuild(brief)`, `applyBriefValidator(input)`.

- [ ] **Step 1: Read the existing brief.test.ts to understand current expectations**

Read `src/lib/projects/brief.test.ts` end-to-end. Note the helpers it imports. (Manual step — done by the implementer at run time. Listed here so the implementer is not surprised.)

- [ ] **Step 2: Write the failing test**

Append to `src/lib/projects/brief.test.ts`:

```ts
import { applyBriefValidator, isBriefReadyForBuild } from "@/lib/projects/brief";
import type { CleanedBrief } from "@/lib/projects/brief-rich-fields";

describe("applyBriefValidator + isBriefReadyForBuild", () => {
  const fullClean: CleanedBrief = {
    businessName: "Kopi Tuku",
    productOrService: [{ name: "Kopi Susu", isPrimary: true }],
    contact: { channel: "whatsapp", value: "08123456789", label: undefined },
    tagline: "Kopi susu enak harga mahasiswa",
    usp: ["Biji single origin"],
    targetCustomer: "Mahasiswa",
    priceRange: "15-25rb",
    visuals: true,
    hours: [{ dayRange: "Senin-Jumat", open: "08:00", close: "21:00", note: undefined }],
    address: "Jl. Kaliurang KM 5",
    deliveryArea: "Sleman",
    since: "2018",
    testimonials: [{ quote: "Mantap", author: "Ibu Rina", context: undefined, rating: 5 }],
    certifications: [{ name: "Halal", issuer: undefined }],
    paymentMethods: [{ method: "qris", detail: undefined }],
    socialLinks: [{ platform: "instagram", handle: "@kopituku", url: undefined }],
    currentPromo: null,
    secondaryCta: null,
  };

  it("isBriefReadyForBuild is false when readyForBuild is false", () => {
    const brief = applyBriefValidator({ ...fullClean, businessName: null });
    expect(isBriefReadyForBuild(brief)).toBe(false);
  });

  it("isBriefReadyForBuild is true when readyForBuild is true and productOrService present", () => {
    const brief = applyBriefValidator(fullClean);
    brief.readyForBuild = true;
    expect(isBriefReadyForBuild(brief)).toBe(true);
  });

  it("applyBriefValidator populates all fields from a CleanedBrief", () => {
    const brief = applyBriefValidator(fullClean);
    expect(brief.businessName).toBe("Kopi Tuku");
    expect(brief.contact?.channel).toBe("whatsapp");
    expect(brief.paymentMethods?.[0].method).toBe("qris");
  });

  it("applyBriefValidator defaults readyForBuild to false", () => {
    const brief = applyBriefValidator(fullClean);
    expect(brief.readyForBuild).toBe(false);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `bun test src/lib/projects/brief.test.ts`
Expected: FAIL — `applyBriefValidator` not exported.

- [ ] **Step 4: Implement**

In `src/lib/projects/brief.ts`:

1. Import the validator: add `import { validateBrief, type CleanedBrief } from "@/lib/projects/brief-rich-fields";` at the top.
2. Extend `ProjectBrief` with the new fields. Add at the end of the type:

```ts
import type {
  ContactValue,
  HoursValue,
  TestimonialValue,
  CertificationValue,
  PaymentMethodValue,
  SocialLinkValue,
  ProductOrServiceItem,
} from "@/lib/projects/brief-rich-fields";
```

And inside `ProjectBrief`:

```ts
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
  readyForBuild: boolean;
```

3. Update `createInitialBrief` to set every new field to `null` and `readyForBuild: false`.
4. Update `parseProjectBrief` to copy each new field through, using `?? null`.
5. Add the helpers at the bottom of the file:

```ts
export function applyBriefValidator(input: CleanedBrief | unknown): ProjectBrief {
  const { cleaned } = validateBrief(input);
  return {
    ...createInitialBrief(""),
    ...cleaned,
  };
}

export function isBriefReadyForBuild(brief: ProjectBrief): boolean {
  return Boolean(brief.readyForBuild && brief.businessName && brief.productOrService && brief.productOrService.length > 0);
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `bun test src/lib/projects/brief.test.ts`
Expected: PASS — existing tests + 4 new ones. If any existing test broke because the brief now has more fields, update it minimally (do not change the assertion intent; only add the missing defaults).

- [ ] **Step 6: Run the full project tests to catch downstream breakage**

Run: `bun run test`
Expected: PASS. If route tests fail because they construct a `ProjectBrief` literal without the new fields, add the missing fields with `null` defaults. Do not remove existing assertions.

- [ ] **Step 7: Commit**

```bash
git add src/lib/projects/brief.ts src/lib/projects/brief.test.ts
git commit -m "feat(brief): add typed rich fields and readyForBuild gate

Brief now carries the 18-field catalog, readyForBuild is a
boolean, validator flow lives behind applyBriefValidator.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 5: Discuss system prompt

**Files:**
- Create: `src/lib/projects/prompts/discuss-system.md`
- Create: `src/lib/projects/prompts/discuss-system.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a string constant `DISCUSS_SYSTEM_PROMPT` exported from a sibling `.ts` file. The `.md` file holds the content. The `.ts` re-exports it. Tests assert content.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/projects/prompts/discuss-system.test.ts
import { describe, expect, it } from "vitest";
import { DISCUSS_SYSTEM_PROMPT } from "@/lib/projects/prompts/discuss-system";

describe("DISCUSS_SYSTEM_PROMPT", () => {
  it("lists every mandatory field", () => {
    expect(DISCUSS_SYSTEM_PROMPT).toContain("businessName");
    expect(DISCUSS_SYSTEM_PROMPT).toContain("productOrService");
  });

  it("lists every soft field id", () => {
    for (const f of [
      "tagline",
      "usp",
      "targetCustomer",
      "priceRange",
      "visuals",
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
    ]) {
      expect(DISCUSS_SYSTEM_PROMPT).toContain(f);
    }
  });

  it("documents the UMKM types", () => {
    for (const t of ["fnb", "retail", "jasa_lokal", "jasa_online", "kursus", "other"]) {
      expect(DISCUSS_SYSTEM_PROMPT).toContain(t);
    }
  });

  it("mentions the confidence rule", () => {
    expect(DISCUSS_SYSTEM_PROMPT).toContain("readyForBuild");
    expect(DISCUSS_SYSTEM_PROMPT).toMatch(/50%/);
  });

  it("forbids hallucinating values", () => {
    expect(DISCUSS_SYSTEM_PROMPT.toLowerCase()).toContain("hallucinat");
  });

  it("documents the first-message greeting", () => {
    expect(DISCUSS_SYSTEM_PROMPT.toLowerCase()).toContain("greeting");
  });

  it("documents multi-product handling", () => {
    expect(DISCUSS_SYSTEM_PROMPT).toContain("isPrimary");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/lib/projects/prompts/discuss-system.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the prompt content**

```ts
// src/lib/projects/prompts/discuss-system.ts
import raw from "./discuss-system.md?raw";

export const DISCUSS_SYSTEM_PROMPT: string = raw;
```

```markdown
<!-- src/lib/projects/prompts/discuss-system.md -->
# Peran

Kamu adalah asisten UMKM Cepat. Tugasmu: bantu UMKM Indonesia yang ingin go digital tapi tidak punya budget hire desainer atau developer. Output landing page harus terasa **seriously good and professional** — setara hasil kerja desainer mahal. Kamu ramah, santai, pakai "kamu", bahasa sehari-hari, tidak kaku, tidak pakai filler AI ("Tentu!", "Tentu saja!"). Mirror register user — kalau user santai, kamu santai.

# Bahasa

User-facing copy: pakai bahasa yang sama dengan user. Kalau user campur Indo-Inggris, kamu boleh campur. Default Bahasa Indonesia. Copy untuk landing page yang di-render: Bahasa Indonesia, kecuali UMKM jelas melayani non-Indonesia (ekspatriat, turis).

# Salam pembuka (first message)

Kalau project baru, sapa user dengan singkat. Tidak ada menu, tidak ada checklist, tidak ada disclaimer AI. Ajak jawab pertanyaan pertama yang ringan.

Contoh: "hai [nama]! gw bakal bantu bikinin halaman jualan buat usahamu. cerita dikit, usahamu jual apa?"

# Mandatory fields (wajib sebelum build)

1. `businessName` — nama usaha. Bukan kata generik seperti "warung"/"toko". Kalau user jawab generik, push untuk nama brand penuh.
2. `productOrService` — array of `{ name, description?, priceRange?, isPrimary? }`. Multi-produk: tanyakan mana yang utama, set `isPrimary: true` di satu item.

# Soft fields (16 total)

Tanyakan hanya yang applicable untuk tipe UMKM. Tidak perlu tanya semua.

Informasi usaha: `tagline`, `usp`, `targetCustomer`, `priceRange`, `visuals`.
Operasional: `contact`, `hours`, `address`, `deliveryArea`.
Trust: `since`, `testimonials`, `certifications`, `paymentMethods`.
Growth: `socialLinks`, `currentPromo`, `secondaryCta`.

# Tipe UMKM dan applicability

- `fnb` (warung makan / F&B): hours, address, deliveryArea, paymentMethods, priceRange, since. Selalu applicable: contact, tagline, usp, visuals, secondaryCta.
- `retail` (toko kelontong): hours, address, paymentMethods, priceRange, since.
- `jasa_lokal` (laundry, barber, jasa dengan lokasi): hours, address, deliveryArea, priceRange, since.
- `jasa_online` (desain, penulisan, freelance): priceRange, socialLinks, secondaryCta, testimonials. Tidak applicable: address, hours, deliveryArea.
- `kursus` (les, kursus): hours (jadwal kelas), priceRange, socialLinks, secondaryCta.
- `other`: hanya always-on.

# Confidence rule (kapan `readyForBuild: true`)

Set `readyForBuild: true` hanya jika:

- Semua mandatory terisi (businessName, productOrService dengan minimal 1 item), DAN
- Kamu sudah menanyakan minimal 1 applicable soft field DAN user menjawab ATAU user secara eksplisit decline ("ga ada", "skip"), DAN
- Minimal 50% dari applicable soft fields untuk tipe UMKM user sudah terisi atau di-decline.

User yang eksplisit opt-out ("udah dulu", "cukup", "langsung bangun aja") membuat confidence rule cukup dengan mandatory saja.

# Safety — JANGAN hallucinate

- Jangan pernah isi field dengan nilai yang user tidak berikan. Pengecualian: `tagline` dan `usp` boleh kamu draft kalau user eksplisit minta ("bantuin bikin tagline dong").
- Field lain: kalau user tidak memberikan, kosongkan. Server-side validator akan drop nilai yang tidak valid.
- Jangan set `readyForBuild: true` berdasarkan tebakan. Hanya dari turn terakhir user.

# Re-discussion (setelah build)

- Jangan over-extract. "warnanya kurang biru" bukan produk baru.
- Jangan re-ask soft field yang sudah terisi, kecuali user reset.
- Jangan downgrade field yang sudah terisi tanpa user eksplisit bilang hapus.

# Build handoff

Saat user klik "Mulai build": keluar satu baris konfirmasi singkat di chat, hanya menyebutkan field yang terisi: "oke, gw bangun dengan [nama], [produk utama], [kontak] — sisanya bisa lo tambahin nanti." Lalu langsung lanjut ke build, tidak ada round-trip tambahan.

# Empty businessName handling

Kalau setelah turn pertama user belum kasih nama usaha, tanya langsung. Kalau user bilang "belum ada nama", tawarkan brainstorm 3 kandidat berdasarkan produk/jasa, dan pilih setelah user memilih.

# Multi-product

Kalau user menyebut lebih dari satu produk/jasa di satu message, tanya: "beberapa produk nih — fokus satu dulu, atau list semuanya?" Ikuti alur, set `isPrimary: true` pada item yang user tunjuk sebagai headline.
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/lib/projects/prompts/discuss-system.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/projects/prompts/prompts/ src/lib/projects/prompts/discuss-system.test.ts
git commit -m "feat(prompts): discuss system prompt for 18-field catalog

Covers voice, language, greeting, mandatory, 16 soft fields,
applicability per UMKM type, confidence rule, anti-hallucination,
re-discussion, build handoff, empty businessName, multi-product.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 6: Track field state in chat-memory

**Files:**
- Modify: `src/lib/projects/chat-memory.ts`
- Modify: `src/lib/projects/chat-memory.test.ts`

**Interfaces:**
- Consumes: `SoftFieldId` from Task 2.
- Produces: `FieldStateMap` (`Record<SoftFieldId, "asked" | "answered" | "declined" | "explicitly_empty">`), helpers `recordFieldAsk`, `recordFieldAnswer`, `recordFieldDecline`, `recordFieldEmpty`, `summarizeFieldState(map)`. New hidden context block: `buildFieldStateBlock(map, dominantLanguage)`.

- [ ] **Step 1: Read chat-memory.test.ts to understand the existing test surface.**

- [ ] **Step 2: Write the failing test**

Append:

```ts
import {
  recordFieldAsk,
  recordFieldAnswer,
  recordFieldDecline,
  recordFieldEmpty,
  summarizeFieldState,
  buildFieldStateBlock,
  type FieldStateMap,
} from "@/lib/projects/chat-memory";

describe("field state tracking", () => {
  it("records an ask and an answer", () => {
    let map: FieldStateMap = {};
    map = recordFieldAsk(map, "hours");
    map = recordFieldAnswer(map, "hours");
    expect(map.hours).toBe("answered");
  });

  it("records a decline", () => {
    let map: FieldStateMap = {};
    map = recordFieldAsk(map, "deliveryArea");
    map = recordFieldDecline(map, "deliveryArea");
    expect(map.deliveryArea).toBe("declined");
  });

  it("records an explicit empty (none yet)", () => {
    let map: FieldStateMap = {};
    map = recordFieldAsk(map, "contact");
    map = recordFieldEmpty(map, "contact");
    expect(map.contact).toBe("explicitly_empty");
  });

  it("summarizeFieldState counts each state", () => {
    let map: FieldStateMap = {};
    map = recordFieldAsk(map, "hours");
    map = recordFieldAnswer(map, "hours");
    map = recordFieldAsk(map, "contact");
    map = recordFieldDecline(map, "contact");
    const summary = summarizeFieldState(map);
    expect(summary.answered).toContain("hours");
    expect(summary.declined).toContain("contact");
  });

  it("buildFieldStateBlock produces a readable block", () => {
    let map: FieldStateMap = {};
    map = recordFieldAsk(map, "hours");
    map = recordFieldAnswer(map, "hours");
    const block = buildFieldStateBlock(map, "id");
    expect(block).toContain("hours: answered");
    expect(block).toContain("Bahasa dominan: id");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `bun test src/lib/projects/chat-memory.test.ts`
Expected: FAIL — exports missing.

- [ ] **Step 4: Implement**

In `src/lib/projects/chat-memory.ts`:

1. Add `import type { SoftFieldId } from "@/lib/projects/brief-rich-fields";` at the top.
2. Add the types and helpers:

```ts
export type FieldState = "asked" | "answered" | "declined" | "explicitly_empty";

export type FieldStateMap = Partial<Record<SoftFieldId, FieldState>>;

export function recordFieldAsk(map: FieldStateMap, field: SoftFieldId): FieldStateMap {
  const current = map[field];
  if (current === "answered" || current === "declined" || current === "explicitly_empty") {
    return map;
  }
  return { ...map, [field]: "asked" };
}

export function recordFieldAnswer(map: FieldStateMap, field: SoftFieldId): FieldStateMap {
  return { ...map, [field]: "answered" };
}

export function recordFieldDecline(map: FieldStateMap, field: SoftFieldId): FieldStateMap {
  const current = map[field];
  if (current === "answered") return map;
  return { ...map, [field]: "declined" };
}

export function recordFieldEmpty(map: FieldStateMap, field: SoftFieldId): FieldStateMap {
  const current = map[field];
  if (current === "answered") return map;
  return { ...map, [field]: "explicitly_empty" };
}

export function summarizeFieldState(map: FieldStateMap) {
  const answered: SoftFieldId[] = [];
  const declined: SoftFieldId[] = [];
  const empty: SoftFieldId[] = [];
  const asked: SoftFieldId[] = [];
  for (const [field, state] of Object.entries(map) as Array<[SoftFieldId, FieldState]>) {
    if (state === "answered") answered.push(field);
    else if (state === "declined") declined.push(field);
    else if (state === "explicitly_empty") empty.push(field);
    else asked.push(field);
  }
  return { answered, declined, empty, asked };
}

export function buildFieldStateBlock(map: FieldStateMap, dominantLanguage: string): string {
  const summary = summarizeFieldState(map);
  const lines: string[] = [`Bahasa dominan: ${dominantLanguage || "id"}`];
  if (summary.answered.length) lines.push(`Sudah dijawab: ${summary.answered.join(", ")}`);
  if (summary.declined.length) lines.push(`User decline: ${summary.declined.join(", ")}`);
  if (summary.empty.length) lines.push(`User bilang kosong: ${summary.empty.join(", ")}`);
  if (summary.asked.length) lines.push(`Sedang ditanyakan, belum dijawab: ${summary.asked.join(", ")}`);
  return lines.join("\n");
}
```

3. Add a helper to detect dominant language from the last N user messages:

```ts
const INDONESIAN_HINT = /\b(gw|lo|gue|lu|udah|belum|kayak|gimana|kenapa|bisa|ga|ngga|nggak|yang|buat|dong|sih|kan|aja|kok)\b/i;
const ENGLISH_HINT = /\b(the|and|is|are|was|were|have|has|do|does|will|would|can|could|should|i|you|we|they)\b/i;

export function detectDominantLanguage(messages: ReadonlyArray<{ role: string; content: string }>): "id" | "en" {
  const userMessages = messages.filter((m) => m.role === "user");
  if (userMessages.length === 0) return "id";
  const sample = userMessages.slice(-6).map((m) => m.content).join(" ");
  const idHits = (sample.match(INDONESIAN_HINT) ?? []).length;
  const enHits = (sample.match(ENGLISH_HINT) ?? []).length;
  return enHits > idHits ? "en" : "id";
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `bun test src/lib/projects/chat-memory.test.ts`
Expected: PASS — existing tests + 5 new.

- [ ] **Step 6: Commit**

```bash
git add src/lib/projects/chat-memory.ts src/lib/projects/chat-memory.test.ts
git commit -m "feat(chat-memory): track per-field state and dominant language

asked / answered / declined / explicitly_empty per soft field.
detectDominantLanguage over the last 6 user messages.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 7: Wire the new system prompt and readyForBuild into the discuss endpoint

**Files:**
- Modify: `src/routes/api.projects.preview.ts`

**Interfaces:**
- Consumes: `DISCUSS_SYSTEM_PROMPT` from Task 5; helpers from Task 6; `validateBrief` from Task 3.
- Produces: discuss responses now include `readyForBuild: boolean`. The server-side `validateBrief` runs on the extracted brief before it is stored or rendered.

- [ ] **Step 1: Locate the discuss prompt construction**

In `src/routes/api.projects.preview.ts`, find the existing `buildChatSystemPrompt`, `buildCardSystemPrompt`, and `buildOneCallSystemPrompt` (or the equivalent strings being passed to the LLM tool calls). Read those functions to understand how the existing prompt is composed.

- [ ] **Step 2: Append the new prompt to the existing system prompts**

Add a constant at the top of the file (after imports):

```ts
import { DISCUSS_SYSTEM_PROMPT } from "@/lib/projects/prompts/discuss-system";
import { validateBrief } from "@/lib/projects/brief-rich-fields";
```

In `buildChatSystemPrompt` and `buildCardSystemPrompt` and `buildOneCallSystemPrompt`, append `\n\n${DISCUSS_SYSTEM_PROMPT}` to the returned string. Do not rewrite the existing prompt text. (This is intentionally a string concatenation so the new prompt is additive; if a later task wants a full rewrite, that's a separate change.)

- [ ] **Step 3: Extend the extracted card schema with `readyForBuild`**

Find where the AI is asked to return a card / patch object (the `ProjectBriefPatch` and any tool input schemas). Add a new boolean field to the schema:

```ts
readyForBuild: z.boolean().default(false),
```

Keep all existing fields. This applies to whichever extraction function emits the patch (likely `handleDiscussTurnOneCall` or `repairDiscussCardWithTool`).

- [ ] **Step 4: Run the validator on the extracted brief before storage**

Find where the extracted patch is applied to the project's stored brief. Just before the brief is saved, call `validateBrief` on the patch's full field set and replace the patch's typed fields with the cleaned values. Pseudo:

```ts
const { cleaned, dropped } = validateBrief({
  ...existingBrief,
  ...patch,
});
if (dropped.length > 0) {
  console.warn("brief: dropped hallucinated fields", { dropped, projectId });
}
const finalPatch: ProjectBriefPatch = { ...patch, ...cleaned, readyForBuild: patch.readyForBuild ?? false };
```

Keep the existing `businessName` / `businessType` etc. flow intact; the validator only scrubs the new typed fields. The legacy `contactOrCta` field stays as-is for backward compatibility with the existing build prompt — we are not deleting it.

- [ ] **Step 5: Run the project tests**

Run: `bun run test`
Expected: PASS. If a test constructs a brief patch without `readyForBuild`, the `.default(false)` covers it. If a test asserts a specific value for a now-validated field and the validator drops it, update the test to use a well-formed value (e.g. a real-looking phone number for contact).

- [ ] **Step 6: Commit**

```bash
git add src/routes/api.projects.preview.ts
git commit -m "feat(api): use new discuss prompt and validate extracted brief

Appends DISCUSS_SYSTEM_PROMPT to chat, card, and one-call
prompts. Extraction schema accepts readyForBuild. Validator
scrubs hallucinated field values before storage.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 8: Build handoff copy helper

**Files:**
- Create: `src/lib/projects/build-handoff.ts`
- Create: `src/lib/projects/build-handoff.test.ts`

**Interfaces:**
- Consumes: `ProjectBrief` from Task 4.
- Produces: `buildHandoffLine(brief: ProjectBrief): string`. Returns the one-line confirmation the chat shows when the user clicks "Mulai build".

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { buildHandoffLine } from "@/lib/projects/build-handoff";
import type { ProjectBrief } from "@/lib/projects/brief";

function makeBrief(over: Partial<ProjectBrief>): ProjectBrief {
  return {
    version: 1,
    prompt: "",
    facts: [],
    decisions: [],
    businessName: "Kopi Tuku",
    businessType: "fnb",
    offer: "Kopi",
    targetCustomer: "",
    contactOrCta: "",
    stylePreference: "",
    notes: [],
    confidence: 0,
    openQuestions: [],
    contact: { channel: "whatsapp", value: "08123456789", label: undefined },
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
    readyForBuild: true,
    ...over,
  };
}

describe("buildHandoffLine", () => {
  it("names the business, primary product, and contact when all three are present", () => {
    const line = buildHandoffLine(makeBrief({}));
    expect(line).toContain("Kopi Tuku");
    expect(line).toContain("Kopi");
    expect(line).toContain("08123456789");
  });

  it("omits contact when absent", () => {
    const line = buildHandoffLine(makeBrief({ contact: null }));
    expect(line).not.toContain("08123456789");
  });

  it("always ends with the same trailing promise", () => {
    const line = buildHandoffLine(makeBrief({}));
    expect(line).toContain("sisanya bisa lo tambahin nanti");
  });

  it("uses the primary product when productOrService has multiple", () => {
    const line = buildHandoffLine(
      makeBrief({
        productOrService: [
          { name: "Kopi Susu", isPrimary: true },
          { name: "Roti Bakar" },
        ],
      }),
    );
    expect(line).toContain("Kopi Susu");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/lib/projects/build-handoff.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/projects/build-handoff.ts
import type { ProjectBrief } from "@/lib/projects/brief";

const TRAILING = " — sisanya bisa lo tambahin nanti.";

function primaryName(brief: ProjectBrief): string | null {
  if (!brief.productOrService || brief.productOrService.length === 0) return null;
  const primary = brief.productOrService.find((p) => p.isPrimary);
  return (primary ?? brief.productOrService[0]).name;
}

function contactLabel(brief: ProjectBrief): string | null {
  if (!brief.contact) return null;
  switch (brief.contact.channel) {
    case "whatsapp":
      return `WA ${brief.contact.value}`;
    case "phone":
      return `telp ${brief.contact.value}`;
    case "instagram":
      return `IG ${brief.contact.value}`;
    case "maps":
      return `Maps ${brief.contact.value}`;
    case "other":
      return brief.contact.value;
  }
}

export function buildHandoffLine(brief: ProjectBrief): string {
  const parts: string[] = ["oke, gw bangun dengan"];
  if (brief.businessName) parts.push(brief.businessName);
  const product = primaryName(brief);
  if (product) parts.push(product);
  const contact = contactLabel(brief);
  if (contact) parts.push(contact);
  return `${parts.join(", ")}${TRAILING}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/lib/projects/build-handoff.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/projects/build-handoff.ts src/lib/projects/build-handoff.test.ts
git commit -m "feat(brief): build handoff one-liner

Names the business, primary product, and contact. Trailing
'sisanya bisa lo tambahin nanti' is always present.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 9: Gate build button on readyForBuild + render handoff line

**Files:**
- Modify: `src/components/projects/WorkspaceShell.tsx`

**Interfaces:**
- Consumes: `isBriefReadyForBuild` from Task 4; `buildHandoffLine` from Task 8.
- Produces: the build button is disabled unless the latest extracted brief has `readyForBuild: true`. When clicked, a one-line handoff message appears in the chat.

- [ ] **Step 1: Locate the build button and the discuss-card state**

In `src/components/projects/WorkspaceShell.tsx`, find:
- The build button (its `disabled` prop, its `onClick` handler).
- The discuss-card / latest-extracted-brief state. Likely stored in component state or a React Query cache.

- [ ] **Step 2: Write the failing test**

`WorkspaceShell.tsx` is large. Prefer a small, focused test that exercises the gating logic in isolation. Add `src/components/projects/WorkspaceShell.test.tsx` (or co-locate in the existing test file if one exists) with:

```tsx
import { describe, expect, it } from "vitest";
import { canStartBuild } from "@/components/projects/WorkspaceShell";

describe("canStartBuild", () => {
  it("returns false when readyForBuild is false", () => {
    expect(canStartBuild({ readyForBuild: false, businessName: "Kopi Tuku", productOrService: [{ name: "Kopi" }] })).toBe(false);
  });
  it("returns true when all gates pass", () => {
    expect(canStartBuild({ readyForBuild: true, businessName: "Kopi Tuku", productOrService: [{ name: "Kopi" }] })).toBe(true);
  });
  it("returns false when productOrService is empty even if readyForBuild is true", () => {
    expect(canStartBuild({ readyForBuild: true, businessName: "Kopi Tuku", productOrService: [] })).toBe(false);
  });
});
```

- [ ] **Step 3: Export `canStartBuild` from WorkspaceShell**

Add at the bottom of `src/components/projects/WorkspaceShell.tsx`:

```ts
import { isBriefReadyForBuild } from "@/lib/projects/brief";
import { buildHandoffLine } from "@/lib/projects/build-handoff";

export function canStartBuild(brief: ProjectBrief | null | undefined): boolean {
  if (!brief) return false;
  return isBriefReadyForBuild(brief);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/components/projects/WorkspaceShell.test.tsx`
Expected: PASS — 3 tests.

- [ ] **Step 5: Wire the button and handoff in the component**

In the build button's props:
- Set `disabled={!canStartBuild(latestBrief)}`.
- In its `onClick` handler, before kicking off the existing build flow, call `appendHandoffToChat(buildHandoffLine(latestBrief))` (or whatever the existing chat-append helper is named). The build flow continues unchanged.

(If the file does not export a chat-append helper, find where the existing chat message is added on user input and reuse that path. The point is: the handoff line lands in the chat, then the build runs.)

- [ ] **Step 6: Manual smoke test**

Run: `bun run dev` and click through. Verify the button stays disabled until the AI sets `readyForBuild: true`, and that the handoff line appears in chat on click.

- [ ] **Step 7: Commit**

```bash
git add src/components/projects/WorkspaceShell.tsx src/components/projects/WorkspaceShell.test.tsx
git commit -m "feat(workspace): gate build on readyForBuild, render handoff line

Mulai build button only enables when brief.readyForBuild is
true and mandatory fields are present. On click, a one-liner
lists the filled fields and promises more is editable later.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 10: Renderer audit — empty soft-field sections hide

**Files:**
- Modify: `src/components/projects/renderer/ProjectSitePreview.tsx`
- Modify: `src/lib/projects/site-schema.ts`

**Interfaces:**
- Consumes: the new typed fields from Task 4.
- Produces: every soft-field section in the rendered preview is conditionally rendered. No "—", "Belum diisi", or button-without-target anywhere.

- [ ] **Step 1: Find every section in ProjectSitePreview**

Read `src/components/projects/renderer/ProjectSitePreview.tsx` end to end. List every section that renders a soft field: USP, since, paymentMethods, deliveryArea, secondaryCta, currentPromo, testimonials, certifications, multi-product list, plus the existing contact, hours, address, social. For each, confirm it currently returns `null` (or its parent gates the render) when the underlying value is empty.

- [ ] **Step 2: Write the failing test**

In `src/components/projects/renderer/ProjectSitePreview.test.tsx` (create if absent):

```tsx
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { ProjectSitePreview } from "@/components/projects/renderer/ProjectSitePreview";

describe("ProjectSitePreview empty-field rendering", () => {
  it("hides the contact section when contact is null", () => {
    const { queryByTestId } = render(
      <ProjectSitePreview brief={baseBrief({ contact: null })} />,
    );
    expect(queryByTestId("section-contact")).toBeNull();
  });

  it("hides the hours section when hours is null", () => {
    const { queryByTestId } = render(
      <ProjectSitePreview brief={baseBrief({ hours: null })} />,
    );
    expect(queryByTestId("section-hours")).toBeNull();
  });

  it("hides the testimonials section when testimonials is empty", () => {
    const { queryByTestId } = render(
      <ProjectSitePreview brief={baseBrief({ testimonials: [] })} />,
    );
    expect(queryByTestId("section-testimonials")).toBeNull();
  });

  it("hides the certifications section when empty", () => {
    const { queryByTestId } = render(
      <ProjectSitePreview brief={baseBrief({ certifications: [] })} />,
    );
    expect(queryByTestId("section-certifications")).toBeNull();
  });

  it("hides the paymentMethods section when empty", () => {
    const { queryByTestId } = render(
      <ProjectSitePreview brief={baseBrief({ paymentMethods: [] })} />,
    );
    expect(queryByTestId("section-payment-methods")).toBeNull();
  });

  it("renders the contact section when present", () => {
    const { queryByTestId } = render(
      <ProjectSitePreview
        brief={baseBrief({
          contact: { channel: "whatsapp", value: "08123456789", label: undefined },
        })}
      />,
    );
    expect(queryByTestId("section-contact")).not.toBeNull();
  });
});

function baseBrief(over: Partial<ProjectBrief>): ProjectBrief {
  return { ...defaultBrief, ...over } as ProjectBrief;
}
```

Use a shared `defaultBrief` fixture imported from a test helper. (Create `src/components/projects/renderer/__fixtures__/default-brief.ts` if no shared fixture exists yet — keep it minimal.)

- [ ] **Step 3: Run the test to verify it fails**

Run: `bun test src/components/projects/renderer/ProjectSitePreview.test.tsx`
Expected: FAIL — sections either don't exist yet, or they render unconditionally, or they render with placeholders.

- [ ] **Step 4: Implement the gating**

For each section in `ProjectSitePreview.tsx`:
- Wrap the section in `if (value is empty) return null;` (or its JSX equivalent).
- If the section currently has a placeholder string ("—", "Belum diisi"), delete it.
- Add a `data-testid="section-<name>"` to the wrapping element so the tests can target it. (The testids are the only reason for those attributes — keep them out of any class name / aria.)

Also add the new sections that the 18-field catalog implies but the renderer does not yet draw:
- USP bullets.
- `since` line.
- `paymentMethods` chips.
- `deliveryArea` line.
- `secondaryCta` button.
- `currentPromo` banner.
- `testimonials` carousel/grid.
- `certifications` badges.
- Multi-product list under the hero.

For each: the section reads from the typed brief field; if the array is empty or the string is null, the section hides entirely.

- [ ] **Step 5: Run the test to verify it passes**

Run: `bun test src/components/projects/renderer/ProjectSitePreview.test.tsx`
Expected: PASS — 6 tests.

- [ ] **Step 6: Run the full project tests**

Run: `bun run test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/projects/renderer/ProjectSitePreview.tsx src/components/projects/renderer/ProjectSitePreview.test.tsx src/components/projects/renderer/__fixtures__/ src/lib/projects/site-schema.ts
git commit -m "feat(renderer): hide empty soft-field sections, add new ones

USP, since, paymentMethods, deliveryArea, secondaryCta,
currentPromo, testimonials, certifications. Multi-product
list under the hero. Every section hides cleanly when its
value is empty — no placeholders.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 11: Integration test for the build gate end-to-end

**Files:**
- Modify: `tests/integration/build-pipeline.test.ts` (existing) or create `tests/integration/discussion-readiness.test.ts`

**Interfaces:**
- Consumes: `applyBriefValidator`, `isBriefReadyForBuild`, the validator, the new system prompt.
- Produces: an integration test that simulates a discuss turn producing a brief patch with `readyForBuild: true`, runs it through the validator and the readiness check, and confirms the gate opens.

- [ ] **Step 1: Write the failing test**

Append (or create):

```ts
import { describe, expect, it } from "vitest";
import { applyBriefValidator, isBriefReadyForBuild } from "@/lib/projects/brief";
import { validateBrief } from "@/lib/projects/brief-rich-fields";

describe("discussion readiness end-to-end", () => {
  it("a brief with only businessName + productOrService is not ready", () => {
    const brief = applyBriefValidator({
      businessName: "Kopi Tuku",
      productOrService: [{ name: "Kopi Susu", isPrimary: true }],
    });
    expect(isBriefReadyForBuild(brief)).toBe(false);
  });

  it("a brief with valid readyForBuild flag and mandatory fields is ready", () => {
    const brief = applyBriefValidator({
      businessName: "Kopi Tuku",
      productOrService: [{ name: "Kopi Susu", isPrimary: true }],
    });
    brief.readyForBuild = true;
    expect(isBriefReadyForBuild(brief)).toBe(true);
  });

  it("a hallucinated contact is dropped, brief is still buildable when mandatory + flag are present", () => {
    const { cleaned, dropped } = validateBrief({
      businessName: "Kopi Tuku",
      productOrService: [{ name: "Kopi Susu" }],
      contact: { channel: "whatsapp", value: "hello world" },
    });
    expect(dropped).toContain("contact");
    expect(cleaned.contact).toBeNull();
    const brief = applyBriefValidator(cleaned);
    brief.readyForBuild = true;
    expect(isBriefReadyForBuild(brief)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test tests/integration/discussion-readiness.test.ts`
Expected: FAIL on the first test (the brief is not yet ready because no `readyForBuild` exists in this code path) — confirming the test exercises the gate we are about to add.

- [ ] **Step 3: No implementation here — this test passes once Tasks 4–7 land**

If it does not pass after Tasks 4–7 are merged, the most likely culprit is that the validator or readiness check has a regression. Fix in `brief.ts` / `brief-rich-fields.ts`, not in the test.

- [ ] **Step 4: Run all tests + typecheck + lint**

Run: `bun run format && bun run lint && bun run typecheck && bun run test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/integration/discussion-readiness.test.ts
git commit -m "test(integration): end-to-end build readiness gate

Brief with mandatory only is not ready. With readyForBuild
flag, it is. Hallucinated contact is dropped, gate still
opens with mandatory + flag.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 12: Final verification and spec close-out

**Files:** none modified.

- [ ] **Step 1: Run the full pre-push chain**

Run: `bun run format && bun run lint && bun run typecheck && bun run test && bun run knip`
Expected: all PASS, no new knip warnings.

- [ ] **Step 2: Manual smoke test in dev**

Run: `bun run dev` and walk through one happy path:
1. Open a new project.
2. AI greets.
3. Provide only a name and a product.
4. AI asks one applicable soft field.
5. Provide an answer.
6. AI sets `readyForBuild: true` after one more relevant question.
7. Build button enables.
8. Click build — handoff line appears, preview shows the new sections (USP, since, payment methods if filled), hidden sections are absent.
9. Open the chat again, add hours, click build again — handoff line updates to mention hours, re-render shows hours.

- [ ] **Step 3: Update the spec status**

Edit `docs/superpowers/specs/2026-07-16-discussion-mode-field-completeness-design.md`: change `Status: Draft` to `Status: Implemented`. Commit.

- [ ] **Step 4: Push**

```bash
git push origin dev
```
