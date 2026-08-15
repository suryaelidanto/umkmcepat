import type { BriefQuestion } from "./brief";
import type { ProjectBriefV2 } from "./canonical-brief";

/**
 * Only fields without which an honest site cannot be built. Structural detail
 * (address, hours, delivery area, photos) enriches a site when the owner
 * supplies it, but never blocks: nothing schedules those questions, so gating
 * on them deadlocked the build with no way for the owner to clear it, and the
 * blueprint already omits sections it has no facts for.
 */
export type BuildReadinessField =
  | "business.name"
  | "offers"
  | "primaryOffer"
  | "audience"
  | "primaryAction"
  | "visualDirection";

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
