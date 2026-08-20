// src/lib/projects/contract-readiness.ts
import {
  BUILD_DECISIONS,
  selectNextBuildDecision,
  type DecisionId,
} from "./build-decisions";

import type { BuildContractV1 } from "./build-contract";

export type ContractBlocker = {
  decisionId: string;
  reason: string;
};

export type ContractReadiness =
  | {
      state: "needs_decision";
      blockers: ContractBlocker[];
      nextDecisionId: string | null;
    }
  | { state: "ready_for_plan"; blockers: []; omissions: ContractOmission[] };

type ContractOmission = {
  decisionId: string;
  reason: "skipped" | "unknown" | "not_applicable";
};

const CTA_KINDS_REQUIRING_TARGET: ReadonlySet<string> = new Set([
  "whatsapp",
  "phone",
  "visit",
  "book",
  "order",
]);

function coreBlockers(contract: BuildContractV1): ContractBlocker[] {
  const blockers: ContractBlocker[] = [];
  if (!contract.identity.businessName) {
    blockers.push({
      decisionId: "business_identity",
      reason: "business name missing",
    });
  }
  if (contract.facts.length === 0) {
    blockers.push({ decisionId: "primary_offer", reason: "no offer fact" });
  }
  if (contract.visitorJobs.length === 0) {
    blockers.push({
      decisionId: "primary_visitor_job",
      reason: "no visitor job",
    });
  }
  if (contract.ctaIntents.length === 0) {
    blockers.push({ decisionId: "primary_cta", reason: "no primary CTA" });
  }
  const factIds = new Set(contract.facts.map((f) => f.id));
  for (const cta of contract.ctaIntents) {
    if (
      CTA_KINDS_REQUIRING_TARGET.has(cta.kind) &&
      (!cta.targetFactId || !factIds.has(cta.targetFactId))
    ) {
      blockers.push({
        decisionId: "cta_destination",
        reason: `CTA ${cta.id} requires a valid target fact`,
      });
    }
  }
  return blockers;
}

function applicableDecisions(contract: BuildContractV1): DecisionId[] {
  const hasMultipleOffers =
    contract.facts.filter((f) => f.kind === "offer").length > 1;
  const hasContact =
    contract.facts.some((f) => f.kind === "contact") ||
    contract.facts.some((f) => f.kind === "address");
  const hasBookingCta = contract.ctaIntents.some((c) =>
    ["book", "order", "visit"].includes(c.kind),
  );
  const hasRegulated =
    contract.hardRequirements.length > 0 ||
    contract.prohibitedClaims.length > 0;
  const hasMedia = contract.assets.length > 0;

  return BUILD_DECISIONS.filter((d) => {
    switch (d.applicability) {
      case "always":
        return true;
      case "multi_offer":
        return hasMultipleOffers;
      case "local_business":
        return hasContact;
      case "transactional":
        return hasBookingCta;
      case "regulated":
        return hasRegulated;
      case "image_led":
        return hasMedia;
      default:
        return false;
    }
  }).map((d) => d.id);
}

export function evaluateContractReadiness(
  contract: BuildContractV1,
): ContractReadiness {
  const blockers = coreBlockers(contract);
  const decided = new Set(contract.decisions.map((d) => d.decisionId));
  const applicable = applicableDecisions(contract);
  const omissions: ContractOmission[] = [];

  for (const def of BUILD_DECISIONS) {
    if (!def.blocksReadiness || !applicable.includes(def.id)) {
      continue;
    }
    const answered = contract.decisions.find((d) => d.decisionId === def.id);
    if (answered) {
      if (answered.state === "skipped_safe") {
        omissions.push({ decisionId: def.id, reason: "skipped" });
      } else if (answered.state === "unknown_safe") {
        omissions.push({ decisionId: def.id, reason: "unknown" });
      }
      continue;
    }
    blockers.push({
      decisionId: def.id,
      reason: `decision ${def.id} unanswered`,
    });
  }

  if (blockers.length > 0) {
    const next = selectNextBuildDecision({
      applicable,
      answered: contract.decisions.map((d) => d.decisionId),
    });
    return {
      state: "needs_decision",
      blockers,
      nextDecisionId: next && !decided.has(next) ? next : null,
    };
  }

  return { state: "ready_for_plan", blockers: [], omissions };
}
