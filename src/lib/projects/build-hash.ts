// src/lib/projects/build-hash.ts
import { createHash } from "node:crypto";

import { canonicalJson } from "./canonical-json";

import type { BuildContractV1 } from "./build-contract";
import type { BuildPlanV1 } from "./build-plan";
import type { ReviewItemV1 } from "./review-items";

const CONTRACT_PREFIX = "umkmcepat:build-contract:v1:";
const PLAN_PREFIX = "umkmcepat:build-plan:v1:";
const REVIEW_PREFIX = "umkmcepat:build-review:v1:";

function sha256Hex(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

function sortById<T>(arr: T[], key: (item: T) => string): T[] {
  return [...arr].sort((a, b) => key(a).localeCompare(key(b)));
}

function sortValues(arr: unknown[]): unknown[] {
  return [...arr].map(String).sort((a, b) => a.localeCompare(b));
}

function contractHashInput(c: BuildContractV1): unknown {
  return {
    schemaVersion: c.schemaVersion,
    identity: c.identity,
    facts: sortById(c.facts, (f) => f.id),
    decisions: sortById(c.decisions, (d) => d.decisionId),
    visitorJobs: sortById(c.visitorJobs, (j) => j.id),
    ctaIntents: sortById(c.ctaIntents, (c) => c.id),
    hardRequirements: sortById(c.hardRequirements, (h) => h.id),
    prohibitedClaims: sortById(c.prohibitedClaims, (p) => p.id),
    preferences: c.preferences,
    assets: sortById(c.assets, (a) => a.assetId),
    blockers: sortById(c.blockers, (b) => b.decisionId),
    omissions: sortById(c.omissions, (o) => o.decisionId),
  };
}

function planHashInput(p: BuildPlanV1): unknown {
  return {
    schemaVersion: p.schemaVersion,
    contractHash: p.contractHash,
    appKind: p.appKind,
    archetype: p.archetype,
    pages: p.pages.map((page) => ({
      ...page,
      visitorJobIds: sortValues(page.visitorJobIds),
      requiredFactIds: sortValues(page.requiredFactIds),
      sections: page.sections.map((section) => ({
        ...section,
        requiredFactIds: sortValues(section.requiredFactIds),
        requiredAssetIds: sortValues(section.requiredAssetIds),
      })),
    })),
    navigation: p.navigation,
    capabilities: sortValues(p.capabilities),
    artDirection: {
      ...p.artDirection,
      antiReferences: sortValues(p.artDirection.antiReferences),
    },
  };
}

export { canonicalJson } from "./canonical-json";

export function hashBuildContract(c: BuildContractV1): string {
  return sha256Hex(CONTRACT_PREFIX + canonicalJson(contractHashInput(c)));
}

export function hashBuildPlan(p: BuildPlanV1): string {
  return sha256Hex(PLAN_PREFIX + canonicalJson(planHashInput(p)));
}

export function hashReviewItems(items: ReviewItemV1[]): string {
  return sha256Hex(REVIEW_PREFIX + canonicalJson(items));
}
