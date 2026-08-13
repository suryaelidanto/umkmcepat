import type { BriefQuestion } from "./brief";
import type { ProjectBriefV2 } from "./canonical-brief";
import type { FieldState, FieldStateMap } from "./chat-memory";

export type BuildReadinessField =
  | "business.name"
  | "offers"
  | "primaryOffer"
  | "audience"
  | "primaryAction"
  | "visualDirection"
  | "content.address"
  | "content.hours"
  | "content.deliveryArea"
  | "assets";

export type BuildReadinessBlocker = {
  field: BuildReadinessField;
  reason: string;
};

export type BuildReadiness =
  | {
      state: "blocked";
      blockers: BuildReadinessBlocker[];
      nextQuestion: BriefQuestion;
    }
  | { state: "ready"; blockers: [] };

const STRUCTURAL_FIELDS: Record<
  NonNullable<ProjectBriefV2["business"]["category"]>,
  readonly BuildReadinessField[]
> = {
  fnb: ["content.address", "content.hours", "content.deliveryArea", "assets"],
  retail: ["content.address", "content.hours", "assets"],
  jasa_lokal: [
    "content.address",
    "content.hours",
    "content.deliveryArea",
    "assets",
  ],
  jasa_online: ["assets"],
  kursus: ["content.hours", "assets"],
  other: ["assets"],
};

const TARGET_REQUIRED_ACTIONS: ReadonlySet<string> = new Set([
  "whatsapp",
  "phone",
  "instagram",
  "maps",
  "other",
]);

const QUESTIONS: Record<BuildReadinessField, string> = {
  "business.name": "Nama usaha kamu apa?",
  offers: "Produk atau layanan utama yang kamu tawarkan apa?",
  primaryOffer: "Dari beberapa pilihan tadi, mana yang paling jadi andalan?",
  audience: "Siapa pelanggan utama yang paling ingin kamu tarik?",
  primaryAction: "Setelah melihat website, pengunjung harus melakukan apa?",
  visualDirection: "Gaya website yang kamu inginkan seperti apa?",
  "content.address": "Alamat usaha kamu di mana?",
  "content.hours": "Jam buka dan hari operasionalnya bagaimana?",
  "content.deliveryArea": "Area pengiriman atau layanan kamu sampai mana?",
  assets: "Kamu punya foto usaha atau produk yang ingin dipakai?",
};

export function evaluateBuildReadiness(brief: ProjectBriefV2): BuildReadiness {
  const blockers: BuildReadinessBlocker[] = [];

  if (!brief.business.name.trim()) {
    blockers.push({
      field: "business.name",
      reason: "business name missing",
    });
  }
  if (brief.offers.length === 0) {
    blockers.push({ field: "offers", reason: "no offer supplied" });
  } else if (
    brief.offers.length > 1 &&
    !brief.offers.some((offer) => offer.isPrimary)
  ) {
    blockers.push({
      field: "primaryOffer",
      reason: "primary offer not selected",
    });
  }
  if (!brief.audience?.trim()) {
    blockers.push({ field: "audience", reason: "target audience missing" });
  }
  if (!isPrimaryActionResolved(brief)) {
    blockers.push({
      field: "primaryAction",
      reason: "primary action missing or has no destination",
    });
  }
  if (!brief.visualDirection?.trim()) {
    blockers.push({
      field: "visualDirection",
      reason: "visual direction missing",
    });
  }

  const category = brief.business.category ?? "other";
  for (const field of STRUCTURAL_FIELDS[category]) {
    if (!isStructuralFieldResolved(brief, field)) {
      blockers.push({
        field,
        reason: `${field} unresolved for ${category}`,
      });
    }
  }

  if (blockers.length === 0) {
    return { state: "ready", blockers: [] };
  }

  return {
    state: "blocked",
    blockers,
    nextQuestion: createReadinessQuestion(blockers[0]),
  };
}

export function createReadinessQuestion(
  blocker: BuildReadinessBlocker,
): BriefQuestion {
  return {
    id: blocker.field,
    question: QUESTIONS[blocker.field],
    answerMode: "text",
    selectionMode: "single",
    required: true,
    options: [],
  };
}

function isPrimaryActionResolved(brief: ProjectBriefV2): boolean {
  const action = brief.primaryAction;
  if (!action?.label.trim()) {
    return false;
  }
  return (
    !TARGET_REQUIRED_ACTIONS.has(action.kind) || Boolean(action.target?.trim())
  );
}

function isStructuralFieldResolved(
  brief: ProjectBriefV2,
  field: BuildReadinessField,
): boolean {
  if (field === "content.address" && brief.content.address?.trim()) {
    return true;
  }
  if (field === "content.hours" && brief.content.hours.length > 0) {
    return true;
  }
  if (field === "content.deliveryArea" && brief.content.deliveryArea?.trim()) {
    return true;
  }
  if (field === "assets" && brief.assets.length > 0) {
    return true;
  }
  return isExplicitlyResolved(brief.fieldState, fieldStateKey(field));
}

function fieldStateKey(field: BuildReadinessField): keyof FieldStateMap | null {
  switch (field) {
    case "content.address":
      return "address";
    case "content.hours":
      return "hours";
    case "content.deliveryArea":
      return "deliveryArea";
    case "assets":
      return "visuals";
    default:
      return null;
  }
}

function isExplicitlyResolved(
  fieldState: FieldStateMap,
  key: keyof FieldStateMap | null,
): boolean {
  if (!key) {
    return false;
  }
  const state: FieldState | undefined = fieldState[key];
  return (
    state === "answered" || state === "declined" || state === "explicitly_empty"
  );
}
