// src/lib/projects/build-decisions.ts
// Server-owned decision registry for deterministic build readiness. The model
// may propose a decisionId and ask a question, but the server owns
// applicability, readiness effects, and skip behavior. The model cannot create
// new blocking categories at runtime.

export type DecisionTarget =
  | "business_identity"
  | "primary_offer"
  | "primary_visitor_job"
  | "primary_cta"
  | "cta_destination"
  | "offer_structure"
  | "location_operations"
  | "transaction_flow"
  | "proof_constraints"
  | "media_strategy"
  | "visual_preference";

export type DecisionId = DecisionTarget;

export type DecisionApplicability =
  | "always"
  | "local_business"
  | "multi_offer"
  | "transactional"
  | "image_led"
  | "regulated";

export type SkipPolicy = "forbidden" | "safe_omission" | "not_applicable_only";

export type BuildDecisionDefinition = {
  id: DecisionId;
  target: DecisionTarget;
  applicability: DecisionApplicability;
  blocksReadiness: boolean;
  skipPolicy: SkipPolicy;
  outputEffect: string;
};

export const BUILD_DECISIONS: readonly BuildDecisionDefinition[] = [
  {
    id: "business_identity",
    target: "business_identity",
    applicability: "always",
    blocksReadiness: true,
    skipPolicy: "forbidden",
    outputEffect: "business name, type, identity",
  },
  {
    id: "primary_offer",
    target: "primary_offer",
    applicability: "always",
    blocksReadiness: true,
    skipPolicy: "forbidden",
    outputEffect: "offer structure",
  },
  {
    id: "primary_visitor_job",
    target: "primary_visitor_job",
    applicability: "always",
    blocksReadiness: true,
    skipPolicy: "forbidden",
    outputEffect: "visitor jobs, page topology",
  },
  {
    id: "primary_cta",
    target: "primary_cta",
    applicability: "always",
    blocksReadiness: true,
    skipPolicy: "forbidden",
    outputEffect: "primary conversion action",
  },
  {
    id: "cta_destination",
    target: "cta_destination",
    applicability: "always",
    blocksReadiness: true,
    skipPolicy: "forbidden",
    outputEffect: "CTA target fact",
  },
  {
    id: "offer_structure",
    target: "offer_structure",
    applicability: "multi_offer",
    blocksReadiness: true,
    skipPolicy: "safe_omission",
    outputEffect: "offer hierarchy, distinct pages",
  },
  {
    id: "location_operations",
    target: "location_operations",
    applicability: "local_business",
    blocksReadiness: true,
    skipPolicy: "safe_omission",
    outputEffect: "address, hours, service area",
  },
  {
    id: "transaction_flow",
    target: "transaction_flow",
    applicability: "transactional",
    blocksReadiness: true,
    skipPolicy: "safe_omission",
    outputEffect: "booking/order/quote channel, CTA target",
  },
  {
    id: "proof_constraints",
    target: "proof_constraints",
    applicability: "regulated",
    blocksReadiness: true,
    skipPolicy: "not_applicable_only",
    outputEffect: "disclaimers, prohibited claims",
  },
  {
    id: "media_strategy",
    target: "media_strategy",
    applicability: "image_led",
    blocksReadiness: false,
    skipPolicy: "safe_omission",
    outputEffect: "owner assets vs graphic/typographic",
  },
  {
    id: "visual_preference",
    target: "visual_preference",
    applicability: "always",
    blocksReadiness: false,
    skipPolicy: "safe_omission",
    outputEffect: "tone, density, motion, direction",
  },
];

export function findDecision(id: string): BuildDecisionDefinition | undefined {
  return BUILD_DECISIONS.find((d) => d.id === id);
}

/** Pick the highest-value unanswered applicable decision. Value is registry
 * order (earlier = more foundational); blocked decisions sort first. */
export function selectNextBuildDecision(input: {
  applicable: DecisionId[];
  answered: string[];
}): DecisionId | null {
  const { applicable, answered } = input;
  const answeredSet = new Set(answered);
  const candidates = BUILD_DECISIONS.filter(
    (d) => applicable.includes(d.id) && !answeredSet.has(d.id),
  );
  candidates.sort((a, b) => {
    const ab = a.blocksReadiness ? 0 : 1;
    const bb = b.blocksReadiness ? 0 : 1;
    if (ab !== bb) {
      return ab - bb;
    }
    return BUILD_DECISIONS.indexOf(a) - BUILD_DECISIONS.indexOf(b);
  });
  return candidates[0]?.id ?? null;
}
