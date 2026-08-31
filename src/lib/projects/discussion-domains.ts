import type { ProjectBriefV2 } from "./canonical-brief";

export const DISCUSSION_DOMAINS = [
  "identity_transaction",
  "selling_angle",
  "audience_decision",
  "operations",
  "proof_assets",
  "visual_direction",
] as const;

export type DiscussionDomain = (typeof DISCUSSION_DOMAINS)[number];

export type DiscussionDomainCoverage = Record<DiscussionDomain, boolean>;

export function getDiscussionDomainCoverage(
  brief: ProjectBriefV2,
): DiscussionDomainCoverage {
  const fieldState = brief.fieldState as Record<string, string>;
  const photosResolved =
    brief.assets.length > 0 ||
    ["answered", "declined", "explicitly_empty"].includes(
      fieldState.visuals ?? fieldState.business_photos ?? "",
    );

  return {
    identity_transaction:
      Boolean(brief.business.name.trim()) &&
      brief.offers.length > 0 &&
      hasActionablePrimaryAction(brief),
    selling_angle: brief.content.usp.length > 0,
    audience_decision:
      Boolean(brief.audience?.trim()) || brief.visitorJobs.length > 0,
    operations: Boolean(
      brief.content.address?.trim() ||
      brief.content.deliveryArea?.trim() ||
      brief.content.hours.length > 0,
    ),
    proof_assets:
      brief.content.testimonials.length > 0 ||
      brief.content.certifications.length > 0 ||
      photosResolved,
    visual_direction:
      Boolean(brief.visualDirection?.trim()) ||
      ["answered", "declined", "explicitly_empty"].includes(
        fieldState.visual_direction ?? fieldState.style_preference ?? "",
      ),
  };
}

export function getUnresolvedDiscussionDomains(
  brief: ProjectBriefV2,
): DiscussionDomain[] {
  const coverage = getDiscussionDomainCoverage(brief);
  return DISCUSSION_DOMAINS.filter((domain) => !coverage[domain]);
}

function hasActionablePrimaryAction(brief: ProjectBriefV2): boolean {
  const action = brief.primaryAction;
  if (!action || !action.label.trim()) {
    return false;
  }
  if (["whatsapp", "phone", "instagram", "maps"].includes(action.kind)) {
    return Boolean(action.target?.trim());
  }
  return action.kind === "browse" || action.kind === "other";
}
