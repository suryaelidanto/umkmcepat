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

export type ProjectBrief = {
  version: 1;
  prompt: string;
  facts?: ProjectFact[];
  decisions?: ProjectDecision[];
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
  answerMode?: "choice" | "text";
  selectionMode?: "single" | "multiple";
  placeholder?: string;
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
  decisions?: ProjectDecision[];
  facts?: ProjectFact[];
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
    facts: [],
    decisions: [],
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
    facts: normalizeFacts(input.facts),
    decisions: normalizeDecisions(input.decisions),
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

  if (Array.isArray(patch.facts)) {
    next.facts = mergeFacts(next.facts ?? [], patch.facts);
  }

  if (Array.isArray(patch.decisions)) {
    next.decisions = mergeDecisions(next.decisions ?? [], patch.decisions);
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
    brief.facts?.length
      ? `Fakta terstruktur: ${brief.facts.map((fact) => `${fact.label}: ${fact.value}`).join("; ")}`
      : "",
    brief.decisions?.length
      ? `Keputusan diskusi: ${brief.decisions.map((decision) => `${decision.question}: ${decision.answer}`).join("; ")}`
      : "",
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
