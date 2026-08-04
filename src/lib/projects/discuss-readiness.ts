import type { ProjectBrief } from "./brief";
import type { SoftFieldId, UmkmType } from "./brief-rich-fields";

export type DiscussReadinessBlocker =
  | SoftFieldId
  | "businessName"
  | "primaryOffer"
  | "productOrService"
  | "visualPreference";

export type DiscussReadiness =
  | {
      state: "needs_question";
      blockers: DiscussReadinessBlocker[];
      nextFieldId: DiscussReadinessBlocker;
    }
  | {
      state: "ready_for_build";
      blockers: [];
      nextFieldId: null;
    };

const STRUCTURAL_FIELDS: Record<UmkmType, readonly SoftFieldId[]> = {
  fnb: [
    "targetCustomer",
    "contact",
    "address",
    "hours",
    "deliveryArea",
    "visuals",
  ],
  retail: ["targetCustomer", "contact", "address", "hours", "visuals"],
  jasa_lokal: [
    "targetCustomer",
    "contact",
    "address",
    "hours",
    "deliveryArea",
    "visuals",
  ],
  jasa_online: ["targetCustomer", "contact", "visuals"],
  kursus: ["targetCustomer", "contact", "hours", "visuals"],
  other: ["targetCustomer", "contact", "visuals"],
};

export function evaluateDiscussReadiness({
  brief,
  umkmType = brief.umkmType ?? "other",
}: {
  brief: ProjectBrief;
  umkmType?: UmkmType;
}): DiscussReadiness {
  const blockers: DiscussReadinessBlocker[] = [];

  if (!brief.businessName?.trim()) {
    blockers.push("businessName");
  }

  if (!brief.productOrService?.length) {
    blockers.push("productOrService");
  } else if (
    brief.productOrService.length > 1 &&
    !brief.productOrService.some((item) => item.isPrimary)
  ) {
    blockers.push("primaryOffer");
  }

  for (const field of STRUCTURAL_FIELDS[umkmType]) {
    if (!isResolved(brief, field)) {
      blockers.push(field);
    }
  }

  if (!brief.stylePreference?.trim()) {
    blockers.push("visualPreference");
  }

  if (blockers.length > 0) {
    return {
      state: "needs_question",
      blockers,
      nextFieldId: blockers[0],
    };
  }

  return { state: "ready_for_build", blockers: [], nextFieldId: null };
}

function isResolved(brief: ProjectBrief, field: SoftFieldId): boolean {
  const state = brief.fieldState?.[field];
  if (
    state === "answered" ||
    state === "declined" ||
    state === "explicitly_empty"
  ) {
    return true;
  }

  if (field === "targetCustomer") {
    return Boolean(brief.targetCustomer?.trim());
  }
  if (field === "visuals") {
    return typeof brief.visuals === "boolean";
  }

  const value = brief[field];
  return Array.isArray(value) ? value.length > 0 : Boolean(value);
}
