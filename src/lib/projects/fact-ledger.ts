export const FACT_LEDGER_STATES = [
  "owner_confirmed",
  "ai_suggestion",
  "unknown",
  "declined",
] as const;

export type FactLedgerState = (typeof FACT_LEDGER_STATES)[number];

export const FACT_LEDGER_ORIGINS = [
  "owner_message",
  "uploaded_asset",
  "accepted_decision",
  "safe_derivation",
  "design_only",
  "explicit_omission",
] as const;

export type FactLedgerOrigin = (typeof FACT_LEDGER_ORIGINS)[number];

export type FactLedgerValue =
  | string
  | number
  | boolean
  | null
  | FactLedgerValue[]
  | { [key: string]: FactLedgerValue };

export type FactLedgerSource =
  "owner" | "assistant" | "system" | "uploaded_asset";

export type FactLedgerEntry = {
  id: string;
  field: string;
  label: string;
  value: FactLedgerValue | null;
  state: FactLedgerState;
  origin: FactLedgerOrigin;
  source: FactLedgerSource;
  sourceTurnId: string | null;
  reason?: string;
};

export type FactLedger = {
  version: 1;
  entries: FactLedgerEntry[];
};

const SOURCES: ReadonlySet<string> = new Set([
  "owner",
  "assistant",
  "system",
  "uploaded_asset",
]);
const ORIGINS: ReadonlySet<string> = new Set(FACT_LEDGER_ORIGINS);
const RENDERABLE_ORIGINS: ReadonlySet<FactLedgerOrigin> = new Set([
  "owner_message",
  "uploaded_asset",
  "accepted_decision",
]);
const MAX_ENTRIES = 120;
const MAX_TEXT_LENGTH = 320;

export function createEmptyFactLedger(): FactLedger {
  return { version: 1, entries: [] };
}

export function normalizeFactLedger(value: unknown): FactLedger {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    !Array.isArray(value.entries)
  ) {
    return createEmptyFactLedger();
  }

  const entries: FactLedgerEntry[] = [];
  const seen = new Set<string>();
  for (const candidate of value.entries) {
    const entry = parseEntry(candidate);
    if (!entry || seen.has(entry.id)) {
      continue;
    }
    seen.add(entry.id);
    entries.push(entry);
    if (entries.length >= MAX_ENTRIES) {
      break;
    }
  }
  return { version: 1, entries };
}

export function mergeFactLedger(
  current: FactLedger,
  incoming: unknown,
  context: { ownerTexts: string[]; sourceTurnId?: string },
): FactLedger {
  const base = normalizeFactLedger(current);
  const byId = new Map(base.entries.map((entry) => [entry.id, entry]));
  const ownerTexts = context.ownerTexts
    .filter((text): text is string => typeof text === "string")
    .map(normalizeEvidenceText)
    .filter(Boolean);

  const candidates = Array.isArray(incoming)
    ? incoming.map(parseEntry).filter(isFactLedgerEntry)
    : [];

  for (const candidate of candidates) {
    const currentEntry = byId.get(candidate.id);
    if (candidate.state === "owner_confirmed") {
      const trustedUpload = candidate.origin === "uploaded_asset";
      if (
        trustedUpload ||
        hasOwnerEvidence(getOwnerEvidenceValue(candidate), ownerTexts)
      ) {
        byId.set(candidate.id, {
          ...candidate,
          origin: trustedUpload ? "uploaded_asset" : "owner_message",
          source: trustedUpload ? "uploaded_asset" : "owner",
          sourceTurnId: candidate.sourceTurnId || context.sourceTurnId || null,
        });
      } else if (currentEntry?.state === "owner_confirmed") {
        byId.set(candidate.id, currentEntry);
      } else {
        byId.set(candidate.id, {
          ...candidate,
          origin: "safe_derivation",
          state: "ai_suggestion",
          source: "assistant",
          sourceTurnId: candidate.sourceTurnId || context.sourceTurnId || null,
          reason: "not found in an owner message",
        });
      }
      continue;
    }

    if (candidate.state === "ai_suggestion") {
      if (currentEntry?.state === "owner_confirmed") {
        continue;
      }
      byId.set(candidate.id, {
        ...candidate,
        origin:
          candidate.origin === "owner_message"
            ? "safe_derivation"
            : candidate.origin,
        source: "assistant",
        sourceTurnId: candidate.sourceTurnId || context.sourceTurnId || null,
      });
      continue;
    }

    byId.set(candidate.id, {
      ...candidate,
      origin:
        candidate.origin === "explicit_omission"
          ? candidate.origin
          : "explicit_omission",
    });
  }

  return {
    version: 1,
    entries: [...byId.values()].slice(-MAX_ENTRIES),
  };
}

export function getRenderableFactEntries(
  ledger: FactLedger,
): FactLedgerEntry[] {
  return normalizeFactLedger(ledger).entries.filter(
    (entry) =>
      entry.state === "owner_confirmed" &&
      entry.value !== null &&
      RENDERABLE_ORIGINS.has(entry.origin),
  );
}

export function getRenderableFactEntry(
  ledger: FactLedger,
  field: string,
): FactLedgerEntry | undefined {
  return getRenderableFactEntries(ledger).find(
    (entry) => entry.field === field,
  );
}

export function isFactLedgerFieldApproved(
  value: unknown,
  field: string,
): boolean {
  const ledger = normalizeFactLedger(value);
  return (
    ledger.entries.length === 0 ||
    Boolean(getRenderableFactEntry(ledger, field))
  );
}

export function createExplicitOmissionEntry(input: {
  field: string;
  id: string;
  label: string;
  reason: string;
}): FactLedgerEntry {
  return {
    id: cleanText(input.id, 80),
    field: cleanText(input.field, 80),
    label: cleanText(input.label, 120),
    value: null,
    state: "declined",
    origin: "explicit_omission",
    source: "owner",
    sourceTurnId: null,
    reason: cleanText(input.reason, 180),
  };
}

export function createFactLedgerEntriesFromPatch(
  patch: Record<string, unknown>,
): FactLedgerEntry[] {
  const entries: FactLedgerEntry[] = [];
  const fields: Array<{
    key: string;
    field: string;
    label: string;
    value: unknown;
  }> = [
    {
      key: "businessName",
      field: "businessName",
      label: "Nama usaha",
      value: patch.businessName,
    },
    {
      key: "businessType",
      field: "businessType",
      label: "Jenis usaha",
      value: patch.businessType,
    },
    {
      key: "productOrService",
      field: "offers",
      label: "Produk atau layanan",
      value: patch.productOrService ?? patch.offers,
    },
    {
      key: "offer",
      field: "offers",
      label: "Produk atau layanan",
      value: patch.offer,
    },
    { key: "contact", field: "contact", label: "Kontak", value: patch.contact },
    {
      key: "tagline",
      field: "tagline",
      label: "Tagline",
      value: patch.tagline,
    },
    { key: "usp", field: "usp", label: "Keunggulan", value: patch.usp },
    {
      key: "priceRange",
      field: "priceRange",
      label: "Kisaran harga",
      value: patch.priceRange,
    },
    {
      key: "targetCustomer",
      field: "audience",
      label: "Pelanggan",
      value: patch.targetCustomer ?? patch.audience,
    },
    {
      key: "visualDirection",
      field: "visualDirection",
      label: "Arah visual",
      value: patch.visualDirection ?? patch.stylePreference,
    },
    { key: "hours", field: "hours", label: "Jam buka", value: patch.hours },
    { key: "address", field: "address", label: "Alamat", value: patch.address },
    {
      key: "deliveryArea",
      field: "serviceArea",
      label: "Area layanan",
      value: patch.deliveryArea,
    },
    { key: "since", field: "since", label: "Tahun mulai", value: patch.since },
    {
      key: "testimonials",
      field: "testimonials",
      label: "Testimoni",
      value: patch.testimonials,
    },
    {
      key: "certifications",
      field: "certifications",
      label: "Sertifikasi",
      value: patch.certifications,
    },
    {
      key: "paymentMethods",
      field: "paymentMethods",
      label: "Pembayaran",
      value: patch.paymentMethods,
    },
    {
      key: "socialLinks",
      field: "socialLinks",
      label: "Media sosial",
      value: patch.socialLinks,
    },
    {
      key: "currentPromo",
      field: "promotion",
      label: "Promosi",
      value: patch.currentPromo,
    },
    {
      key: "secondaryCta",
      field: "secondaryAction",
      label: "Aksi sekunder",
      value: patch.secondaryCta ?? patch.secondaryAction,
    },
  ];

  for (const item of fields) {
    if (
      !Object.prototype.hasOwnProperty.call(patch, item.key) ||
      item.value === undefined
    ) {
      continue;
    }
    const value = toFactLedgerValue(item.value);
    const entryId = `${cleanSlug(item.field)}-primary`;
    if (
      value === undefined ||
      value === null ||
      (typeof value === "string" && !value.trim()) ||
      (Array.isArray(value) && value.length === 0) ||
      !cleanSlug(item.field) ||
      entries.some((entry) => entry.id === entryId)
    ) {
      continue;
    }
    entries.push({
      id: entryId,
      field: item.field,
      label: item.label,
      value,
      state: "owner_confirmed",
      origin: "owner_message",
      source: "owner",
      sourceTurnId: null,
    });
  }

  const facts = patch.facts;
  if (Array.isArray(facts)) {
    for (const fact of facts) {
      if (!isRecord(fact)) {
        continue;
      }
      const field = canonicalFactField(fact.key);
      const label = cleanText(fact.label, 120);
      const rawValue = toFactLedgerValue(fact.value);
      if (!field || !label || rawValue === undefined) {
        continue;
      }
      entries.push({
        id: `${cleanSlug(field)}-fact`,
        field,
        label,
        value: rawValue,
        state: "owner_confirmed",
        origin: "owner_message",
        source: "owner",
        sourceTurnId: null,
      });
    }
  }

  return entries;
}

function toFactLedgerValue(value: unknown): FactLedgerValue | undefined {
  const withoutUndefined = stripUndefined(value);
  return isJsonValue(withoutUndefined) ? withoutUndefined : undefined;
}

function stripUndefined(value: unknown): unknown {
  if (value === undefined) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value
      .map(stripUndefined)
      .filter(
        (item): item is Exclude<typeof item, undefined> => item !== undefined,
      );
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, item]) => [key, stripUndefined(item)] as const)
        .filter(([, item]) => item !== undefined),
    );
  }
  return value;
}

function canonicalFactField(value: unknown): string {
  const slug = cleanSlug(value);
  const aliases: Record<string, string> = {
    address: "address",
    audience: "audience",
    business_name: "businessName",
    business_type: "businessType",
    contact: "contact",
    contact_or_cta: "contact",
    current_promo: "promotion",
    delivery_area: "serviceArea",
    hours: "hours",
    offer: "offers",
    payment_methods: "paymentMethods",
    price_range: "priceRange",
    primary_offer: "offers",
    product_or_service: "offers",
    product_variants: "offers",
    secondary_cta: "secondaryAction",
    since: "since",
    social_links: "socialLinks",
    style_preference: "visualDirection",
    tagline: "tagline",
    target_customer: "audience",
    testimonials: "testimonials",
    usp: "usp",
    visual_direction: "visualDirection",
  };
  return aliases[slug] ?? slug;
}

function cleanSlug(value: unknown): string {
  return cleanText(value, 80)
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}

export function hasOwnerEvidence(
  value: FactLedgerValue | null,
  ownerTexts: string[],
): boolean {
  if (value === null) {
    return false;
  }
  const evidence = ownerTexts.map(normalizeEvidenceText).filter(Boolean);
  const strings = collectStrings(value);
  return (
    strings.length > 0 &&
    strings.every((text) => {
      const normalized = normalizeEvidenceText(text);
      if (!normalized) {
        return false;
      }
      if (evidence.some((source) => source.includes(normalized))) {
        return true;
      }
      const digits = normalized.replace(/\D/g, "");
      return (
        digits.length >= 7 &&
        evidence.some((source) => source.replace(/\D/g, "").includes(digits))
      );
    })
  );
}

function parseEntry(value: unknown): FactLedgerEntry | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = cleanText(value.id, 80);
  const field = cleanText(value.field, 80);
  const label = cleanText(value.label, 120);
  const state = value.state;
  const source = value.source;
  const origin = parseOrigin(value.origin, state, source);
  if (
    !/^[a-z0-9][a-z0-9_-]*$/u.test(id) ||
    !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/u.test(field) ||
    !label ||
    typeof state !== "string" ||
    !FACT_LEDGER_STATES.includes(state as FactLedgerState) ||
    typeof source !== "string" ||
    !SOURCES.has(source) ||
    !origin ||
    !isValidOriginSource(
      origin,
      source as FactLedgerSource,
      state as FactLedgerState,
    )
  ) {
    return null;
  }
  const valueJson = isJsonValue(value.value) ? value.value : null;
  const sourceTurnId =
    typeof value.sourceTurnId === "string"
      ? cleanText(value.sourceTurnId, 100)
      : null;
  const reason = cleanText(value.reason, 180);
  return {
    id,
    field,
    label,
    value: valueJson,
    state: state as FactLedgerState,
    origin,
    source: source as FactLedgerSource,
    sourceTurnId,
    ...(reason ? { reason } : {}),
  };
}

function parseOrigin(
  value: unknown,
  state: unknown,
  source: unknown,
): FactLedgerOrigin | null {
  if (typeof value === "string") {
    return ORIGINS.has(value) ? (value as FactLedgerOrigin) : null;
  }
  if (state === "unknown" || state === "declined") {
    return "explicit_omission";
  }
  if (source === "owner") {
    return "owner_message";
  }
  if (source === "uploaded_asset") {
    return "uploaded_asset";
  }
  if (source === "system") {
    return "accepted_decision";
  }
  return "safe_derivation";
}

function isValidOriginSource(
  origin: FactLedgerOrigin,
  source: FactLedgerSource,
  state: FactLedgerState,
): boolean {
  switch (origin) {
    case "owner_message":
      return source === "owner" && state === "owner_confirmed";
    case "uploaded_asset":
      return source === "uploaded_asset" && state === "owner_confirmed";
    case "accepted_decision":
      return (
        (source === "owner" || source === "system") &&
        state === "owner_confirmed"
      );
    case "safe_derivation":
      return (
        (source === "assistant" || source === "system") &&
        state === "ai_suggestion"
      );
    case "design_only":
      return source === "system" && state === "owner_confirmed";
    case "explicit_omission":
      return source === "owner" && state === "declined";
  }
}

function getOwnerEvidenceValue(entry: FactLedgerEntry): FactLedgerValue | null {
  if (entry.field !== "contact" || !isRecord(entry.value)) {
    return entry.value;
  }

  const contactValue = entry.value.value;
  return isJsonValue(contactValue) ? contactValue : entry.value;
}

function collectStrings(value: FactLedgerValue): string[] {
  if (typeof value === "string") {
    return value.trim() ? [value] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap(collectStrings);
  }
  if (value && typeof value === "object") {
    return Object.values(value).flatMap(collectStrings);
  }
  return [];
}

function isJsonValue(value: unknown, depth = 0): value is FactLedgerValue {
  if (depth > 6 || value === null) {
    return value === null;
  }
  if (typeof value === "string") {
    return value.length <= MAX_TEXT_LENGTH;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return typeof value === "boolean" || Number.isFinite(value);
  }
  if (Array.isArray(value)) {
    return (
      value.length <= 24 && value.every((item) => isJsonValue(item, depth + 1))
    );
  }
  if (isRecord(value)) {
    return (
      Object.keys(value).length <= 24 &&
      Object.entries(value).every(
        ([key, item]) => key.length <= 80 && isJsonValue(item, depth + 1),
      )
    );
  }
  return false;
}

function normalizeEvidenceText(value: string): string {
  return value.trim().toLocaleLowerCase("id-ID").replace(/\s+/gu, " ");
}

function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().replace(/\s+/gu, " ").slice(0, maxLength);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFactLedgerEntry(
  value: FactLedgerEntry | null,
): value is FactLedgerEntry {
  return value !== null;
}
