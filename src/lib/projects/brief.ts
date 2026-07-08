export type ProjectBrief = {
  version: 1;
  prompt: string;
  businessName: string;
  businessType: string;
  offer: string;
  targetCustomer: string;
  contactOrCta: string;
  stylePreference: string;
  notes: string[];
  /** AI-owned readiness confidence, 0-100. Defaults to 0 (must keep discussing). */
  confidence?: number;
  /** Material decisions the AI still wants to resolve before recommending build. */
  openQuestions?: string[];
  /** Present only when the user forced a build below the confidence threshold. */
  forcedBuild?: { assumed: string[] };
};

export type BriefQuestion = {
  // Free-form slug the AI chooses per question (e.g. "opening_hours",
  // "delivery_area", "product_count"). Legacy brief-field ids remain valid.
  id: string;
  question: string;
  recommendedOptionLabel?: string;
  selectionMode?: "single" | "multiple";
  whyThisQuestionMatters?: string;
  options: Array<{ label: string; description: string }>;
};

// One question per turn (relentless interview style). The card never batches
// questions: the AI asks a single decision, the user answers, then the next
// turn asks the next one.
export type BriefReviewAction = {
  label: string;
  prompt: string;
};

export type WorkspaceCard =
  | { type: "none" }
  | { type: "question"; question: BriefQuestion }
  | {
      actions: BriefReviewAction[];
      summary: string[];
      title: string;
      type: "brief_review";
    }
  | { type: "build_recommendation"; title: string; summary: string[] };

export type ProjectBriefPatch = Partial<
  Pick<
    ProjectBrief,
    | "businessName"
    | "businessType"
    | "offer"
    | "targetCustomer"
    | "contactOrCta"
    | "stylePreference"
  >
> & {
  confidence?: number;
  forcedBuild?: { assumed?: unknown };
  notes?: string[];
  openQuestions?: string[];
};

export const REQUIRED_BRIEF_FIELDS = [
  "businessType",
  "offer",
  "targetCustomer",
  "contactOrCta",
  "stylePreference",
] as const;

// Legacy metadata fields still consumed by the build prompt and fallback, but
// no longer the readiness gate. The gate is AI-owned confidence (see below).
const REQUIRED_FIELDS = [...REQUIRED_BRIEF_FIELDS];

/** Confidence threshold (0-100) the AI must reach before a build is recommended. */
export const BRIEF_CONFIDENCE_THRESHOLD = 95;

export function createInitialBrief(prompt = ""): ProjectBrief {
  return {
    version: 1,
    prompt: prompt.trim(),
    businessName: "",
    businessType: "",
    offer: "",
    targetCustomer: "",
    contactOrCta: "",
    stylePreference: "",
    notes: [],
    confidence: 0,
    openQuestions: [],
  };
}

export function parseProjectBrief(value: unknown, prompt = ""): ProjectBrief {
  if (!value || typeof value !== "object") {
    return createInitialBrief(prompt);
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
    notes: Array.isArray(input.notes)
      ? input.notes.filter(isString).slice(-12)
      : [],
    confidence: normalizeConfidence(input.confidence),
    openQuestions: Array.isArray(input.openQuestions)
      ? input.openQuestions.filter(isString).slice(-12)
      : [],
    forcedBuild: normalizeForcedBuild(input.forcedBuild),
  };
}

export function mergeProjectBriefPatch(
  brief: ProjectBrief,
  patch: ProjectBriefPatch,
): ProjectBrief {
  const next = { ...brief, notes: [...brief.notes] };

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

  if (Array.isArray(patch.notes)) {
    next.notes = [...next.notes, ...patch.notes.filter(isString)].slice(-24);
  }

  if ("confidence" in patch) {
    next.confidence = normalizeConfidence(patch.confidence);
  }

  if (Array.isArray(patch.openQuestions)) {
    next.openQuestions = patch.openQuestions.filter(isString).slice(-12);
  }

  if ("forcedBuild" in patch) {
    next.forcedBuild = normalizeForcedBuild(patch.forcedBuild);
  }

  return next;
}

export function getMissingBriefFields(brief: ProjectBrief) {
  return REQUIRED_FIELDS.filter((field) => !brief[field]);
}

/** Legacy helper kept for compatibility; question ids are now free-form strings. */
export function isBriefQuestionId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export type BriefReadiness = {
  ready: boolean;
  confidence: number;
  remainingOpenQuestions: string[];
};

/** Readiness is AI-owned confidence, not field completion. */
export function getBriefReadiness(brief: ProjectBrief): BriefReadiness {
  const confidence = brief.confidence ?? 0;
  const remainingOpenQuestions = [...(brief.openQuestions ?? [])];

  return {
    confidence,
    ready:
      confidence >= BRIEF_CONFIDENCE_THRESHOLD &&
      remainingOpenQuestions.length === 0,
    remainingOpenQuestions,
  };
}

/** Back-compat boolean view of readiness. Prefer getBriefReadiness for new code. */
export function isBriefReady(brief: ProjectBrief) {
  return getBriefReadiness(brief).ready;
}

/** Returns true when the user has forced a build below the confidence threshold. */
export function isBriefForceBuild(brief: ProjectBrief) {
  return Boolean(brief.forcedBuild?.assumed.length);
}

/** Whether a build is allowed: confidence >= 95 OR an explicit force flag. */
export function canBriefBuild(brief: ProjectBrief) {
  return isBriefReady(brief) || isBriefForceBuild(brief);
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
    brief.notes.length ? `Catatan tambahan: ${brief.notes.join("; ")}` : "",
    `Tingkat keyakinan: ${brief.confidence ?? 0}%`,
    brief.openQuestions?.length
      ? `Pertanyaan terbuka: ${brief.openQuestions.join("; ")}`
      : "",
    brief.forcedBuild?.assumed.length
      ? `Build dipaksa dengan asumsi: ${brief.forcedBuild.assumed.join("; ")}`
      : "",
  ].filter(Boolean);

  return lines.join("\n");
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
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

function normalizeForcedBuild(value: unknown): ProjectBrief["forcedBuild"] {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const input = value as { assumed?: unknown };
  const assumed = Array.isArray(input.assumed)
    ? input.assumed.filter(isString).slice(-12)
    : [];

  return assumed.length ? { assumed } : undefined;
}
