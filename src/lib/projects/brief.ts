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
};

export type BriefQuestion = {
  id: keyof Pick<
    ProjectBrief,
    | "businessType"
    | "offer"
    | "targetCustomer"
    | "contactOrCta"
    | "stylePreference"
  >;
  question: string;
  recommendedOptionLabel?: string;
  whyThisQuestionMatters?: string;
  options: Array<{ label: string; description: string }>;
};

export type WorkspaceCard =
  | { type: "none" }
  | { type: "questions"; questions: BriefQuestion[] }
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
> & { notes?: string[] };

export const REQUIRED_BRIEF_FIELDS = [
  "businessType",
  "offer",
  "targetCustomer",
  "contactOrCta",
  "stylePreference",
] as const satisfies Array<BriefQuestion["id"]>;

const REQUIRED_FIELDS: Array<BriefQuestion["id"]> = [...REQUIRED_BRIEF_FIELDS];

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

  return next;
}

export function getMissingBriefFields(brief: ProjectBrief) {
  return REQUIRED_FIELDS.filter((field) => !brief[field]);
}

export function isBriefQuestionId(
  value: unknown,
): value is BriefQuestion["id"] {
  return (
    typeof value === "string" &&
    REQUIRED_FIELDS.includes(value as BriefQuestion["id"])
  );
}

export function isBriefReady(brief: ProjectBrief) {
  return getMissingBriefFields(brief).length === 0;
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
  ].filter(Boolean);

  return lines.join("\n");
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
