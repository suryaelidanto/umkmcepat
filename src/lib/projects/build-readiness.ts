import { isFactLedgerFieldApproved } from "./fact-ledger";

import type { BriefQuestion } from "./brief";
import type { ProjectBriefV2 } from "./canonical-brief";

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

  if (
    !brief.business.name.trim() ||
    !isFactLedgerFieldApproved(brief.factLedger, "businessName")
  ) {
    blockers.push({
      field: "business.name",
      reason: "business name missing or not owner-confirmed",
    });
  }
  if (
    brief.offers.length === 0 ||
    !isFactLedgerFieldApproved(brief.factLedger, "offers")
  ) {
    blockers.push({
      field: "offers",
      reason: "no owner-confirmed offer supplied",
    });
  } else if (
    brief.offers.length > 1 &&
    !brief.offers.some((offer) => offer.isPrimary)
  ) {
    blockers.push({
      field: "primaryOffer",
      reason: "primary offer not selected",
    });
  }
  const fieldState = brief.fieldState as Record<string, string> | undefined;
  const isAudienceResolved =
    (Boolean(brief.audience?.trim()) &&
      isFactLedgerFieldApproved(brief.factLedger, "audience")) ||
    ["declined", "answered", "explicitly_empty"].includes(
      fieldState?.audience ?? fieldState?.target_customer ?? "",
    );
  if (!isAudienceResolved) {
    blockers.push({
      field: "audience",
      reason: "target audience missing or not owner-confirmed",
    });
  }
  if (
    !isPrimaryActionResolved(brief) ||
    (brief.primaryAction?.kind !== "browse" &&
      !isFactLedgerFieldApproved(brief.factLedger, "contact"))
  ) {
    blockers.push({
      field: "primaryAction",
      reason: "primary action missing or has no destination",
    });
  }
  const isVisualResolved =
    (Boolean(brief.visualDirection?.trim()) &&
      isFactLedgerFieldApproved(brief.factLedger, "visualDirection")) ||
    ["declined", "answered", "explicitly_empty"].includes(
      fieldState?.visual_direction ?? fieldState?.style_preference ?? "",
    );
  if (!isVisualResolved) {
    blockers.push({
      field: "visualDirection",
      reason: "visual direction missing or not owner-confirmed",
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
