// src/lib/projects/build-contract.ts
import {
  parseContact,
  type AddressValue,
  type CertificationValue,
  type ContactValue,
  HoursValue,
  PaymentMethodValue,
  PriceValue,
  ProductOrServiceItem,
  PromotionValue,
  ServiceAreaValue,
  SocialLinkValue,
  TestimonialValue,
} from "./brief-rich-fields";
import { parseVisitorJobs } from "./visitor-jobs";

export const FACT_KINDS = [
  "offer",
  "contact",
  "hours",
  "address",
  "service_area",
  "price",
  "payment_method",
  "certification",
  "testimonial",
  "social_link",
  "promotion",
  "usp",
  "audience",
  "tagline",
  "since",
  "secondary_action",
  "other",
] as const;

export type FactKind = (typeof FACT_KINDS)[number];

export type FactProvenance = {
  source: "owner" | "ai_draft" | "uploaded_asset";
  turnId: string | null;
  assetId: string | null;
  supersedesFactId: string | null;
  reviewItemId: string | null;
};

export type FactRecord<K extends FactKind, V> = {
  id: string;
  kind: K;
  value: V;
  provenance: FactProvenance;
};

export type ContractFactV1 =
  | FactRecord<"offer", ProductOrServiceItem[]>
  | FactRecord<"contact", ContactValue>
  | FactRecord<"hours", HoursValue[]>
  | FactRecord<"address", AddressValue>
  | FactRecord<"service_area", ServiceAreaValue[]>
  | FactRecord<"price", PriceValue[]>
  | FactRecord<"payment_method", PaymentMethodValue[]>
  | FactRecord<"certification", CertificationValue[]>
  | FactRecord<"testimonial", TestimonialValue[]>
  | FactRecord<"social_link", SocialLinkValue[]>
  | FactRecord<"promotion", PromotionValue[]>
  | FactRecord<"usp", string[]>
  | FactRecord<"audience", string>
  | FactRecord<"tagline", string>
  | FactRecord<"since", string>
  | FactRecord<"secondary_action", { label: string; action: string }>
  | FactRecord<"other", string>;

export type ContractDecision = {
  decisionId: string;
  state: "answered" | "skipped_safe" | "unknown_safe" | "not_applicable";
  sourceTurnId: string;
};

export type VisitorJob = {
  id: string;
  goal: string;
  priority: "primary" | "secondary";
};

export type CtaIntent = {
  id: string;
  kind: "whatsapp" | "phone" | "visit" | "browse" | "book" | "order" | "other";
  label: string;
  targetFactId?: string;
};

export type ContractPreference = {
  visualDirection: string | null;
  tone: string | null;
  density: "airy" | "balanced" | "dense" | null;
  motion: "minimal" | "moderate" | "expressive" | null;
};

export type ContractAsset = {
  assetId: string;
  approvedPurpose: "logo" | "hero" | "product" | "gallery" | "reference";
};

export type ContractOmission = {
  decisionId: string;
  reason: "skipped" | "unknown" | "not_applicable";
};

export type BuildContractV1 = {
  schemaVersion: 1;
  revision: number;
  contentHash: string;
  identity: { businessName: string; businessType: string | null };
  facts: ContractFactV1[];
  decisions: ContractDecision[];
  visitorJobs: VisitorJob[];
  ctaIntents: CtaIntent[];
  hardRequirements: Array<{ id: string; statement: string }>;
  prohibitedClaims: Array<{ id: string; statement: string }>;
  preferences: ContractPreference;
  assets: ContractAsset[];
  blockers: Array<{ decisionId: string; reason: string }>;
  omissions: ContractOmission[];
};

export type ContractParseResult =
  { ok: true; value: BuildContractV1 } | { ok: false; reason: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function parseFactValue(kind: FactKind, value: unknown): boolean {
  switch (kind) {
    case "other":
      // High-risk values must never hide under `other`. This rejects obvious
      if (typeof value === "string" && /^\+?[\d\s()-]{8,15}$/.test(value)) {
        return false;
      }
      return typeof value === "string";
    case "offer":
    case "hours":
    case "payment_method":
    case "certification":
    case "testimonial":
    case "social_link":
    case "service_area":
    case "price":
    case "promotion":
      return Array.isArray(value);
    case "usp":
      return (
        Array.isArray(value) &&
        value.every((item) => typeof item === "string" && item.trim())
      );
    case "audience":
    case "tagline":
    case "since":
      return typeof value === "string" && value.trim().length > 0;
    case "secondary_action":
      return (
        isRecord(value) &&
        typeof value.label === "string" &&
        value.label.trim().length > 0 &&
        typeof value.action === "string" &&
        value.action.trim().length > 0
      );
    case "contact":
      return parseContact(value) !== null;
    case "address":
      return isRecord(value);
    default:
      return false;
  }
}

function validateProvenance(p: unknown): boolean {
  if (!isRecord(p)) {
    return false;
  }
  const source = p.source;
  if (
    source !== "owner" &&
    source !== "ai_draft" &&
    source !== "uploaded_asset"
  ) {
    return false;
  }
  const turnId = p.turnId;
  const assetId = p.assetId;
  const reviewItemId = p.reviewItemId;
  if (source === "owner" && typeof turnId !== "string") {
    return false;
  }
  if (source === "ai_draft") {
    if (typeof turnId !== "string" || typeof reviewItemId !== "string") {
      return false;
    }
  }
  if (source === "uploaded_asset" && typeof assetId !== "string") {
    return false;
  }
  return true;
}

export function parseBuildContract(input: unknown): ContractParseResult {
  if (!isRecord(input) || input.schemaVersion !== 1) {
    return { ok: false, reason: "invalid contract schema" };
  }
  const identity = input.identity;
  if (!isRecord(identity) || typeof identity.businessName !== "string") {
    return { ok: false, reason: "business identity required" };
  }
  if (!Array.isArray(input.facts)) {
    return { ok: false, reason: "facts required" };
  }
  if (input.facts.length > 80) {
    return { ok: false, reason: "too many facts" };
  }

  const seen = new Set<string>();
  for (const raw of input.facts as unknown[]) {
    if (!isRecord(raw)) {
      return { ok: false, reason: "invalid fact" };
    }
    const id = raw.id;
    if (typeof id !== "string" || !/^[a-z0-9-]+$/.test(id)) {
      return { ok: false, reason: "invalid fact id" };
    }
    if (seen.has(id)) {
      return { ok: false, reason: `duplicate fact id: ${id}` };
    }
    seen.add(id);
    const kind = raw.kind as FactKind;
    if (!FACT_KINDS.includes(kind)) {
      return { ok: false, reason: `unknown fact kind: ${kind}` };
    }
    if (!parseFactValue(kind, raw.value)) {
      return { ok: false, reason: `invalid value for fact ${id}` };
    }
    if (!validateProvenance(raw.provenance)) {
      return { ok: false, reason: `invalid provenance for fact ${id}` };
    }
  }

  const visitorJobs = parseVisitorJobs(input.visitorJobs);
  if (!visitorJobs.ok) {
    return { ok: false, reason: visitorJobs.reason };
  }

  return {
    ok: true,
    value: {
      ...input,
      visitorJobs: visitorJobs.value,
    } as unknown as BuildContractV1,
  };
}
