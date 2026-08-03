// src/lib/projects/review-items.ts
// The complete owner-review set for a contract/plan pair. The server derives,
// sorts, and persists these; the build-recommendation card renders them
// without truncation.
import type { BuildContractV1 } from "./build-contract";
import type { BuildPlanV1 } from "./build-plan";

export const REVIEW_ITEM_KINDS = [
  "fact",
  "ai_draft",
  "cta",
  "omission",
  "page",
  "asset",
] as const;

export type ReviewItemKind = (typeof REVIEW_ITEM_KINDS)[number];

export type ReviewItemV1 = {
  id: string;
  kind: ReviewItemKind;
  label: string;
  value: string;
};

export const REVIEW_MAX_ITEMS = 96;
export const REVIEW_MAX_SERIALIZED_BYTES = 48 * 1024;

/** Derive the complete, deduplicated review set. It never truncates; callers
 * must fail planning if the set exceeds the persisted bounds. */
export function deriveReviewItems(
  contract: BuildContractV1,
  plan: BuildPlanV1,
): ReviewItemV1[] {
  const usedFactIds = new Set<string>();
  const usedCtaIds = new Set<string>();
  const usedAssetIds = new Set<string>();
  for (const page of plan.pages) {
    for (const factId of page.requiredFactIds) {
      usedFactIds.add(factId);
    }
    for (const section of page.sections) {
      for (const factId of section.requiredFactIds) {
        usedFactIds.add(factId);
      }
      for (const assetId of section.requiredAssetIds) {
        usedAssetIds.add(assetId);
      }
    }
  }
  for (const cta of contract.ctaIntents) {
    if (cta.targetFactId && usedFactIds.has(cta.targetFactId)) {
      usedCtaIds.add(cta.id);
    }
  }

  const items: ReviewItemV1[] = [];

  for (const fact of contract.facts) {
    if (!usedFactIds.has(fact.id)) {
      continue;
    }
    items.push({
      id: fact.id,
      kind: "fact",
      label: fact.kind,
      value: JSON.stringify(fact.value),
    });
  }

  for (const fact of contract.facts) {
    if (fact.provenance.source !== "ai_draft" || !usedFactIds.has(fact.id)) {
      continue;
    }
    items.push({
      id: `ai-${fact.id}`,
      kind: "ai_draft",
      label: fact.kind,
      value: JSON.stringify(fact.value),
    });
  }

  for (const cta of contract.ctaIntents) {
    if (!usedCtaIds.has(cta.id)) {
      continue;
    }
    items.push({ id: cta.id, kind: "cta", label: cta.kind, value: cta.label });
  }

  for (const omission of contract.omissions) {
    items.push({
      id: `omission-${omission.decisionId}`,
      kind: "omission",
      label: omission.decisionId,
      value: omission.reason,
    });
  }

  for (const page of plan.pages) {
    items.push({
      id: page.id,
      kind: "page",
      label: page.path,
      value: `${page.title} — ${page.purpose}`,
    });
  }

  for (const assetId of usedAssetIds) {
    items.push({ id: assetId, kind: "asset", label: "asset", value: assetId });
  }

  const sorted = items.sort((a, b) => {
    const ka = REVIEW_ITEM_KINDS.indexOf(a.kind);
    const kb = REVIEW_ITEM_KINDS.indexOf(b.kind);
    if (ka !== kb) {
      return ka - kb;
    }
    return a.id.localeCompare(b.id);
  });

  return sorted;
}
