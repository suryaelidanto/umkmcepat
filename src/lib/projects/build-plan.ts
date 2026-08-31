// src/lib/projects/build-plan.ts
import type { BuildContractV1 } from "./build-contract";

export type PlanPage = {
  id: string;
  path: string;
  title: string;
  purpose: string;
  visitorJobIds: string[];
  requiredFactIds: string[];
  representativePath?: string;
};

export type PlanCapability =
  | "catalog"
  | "lead_intent"
  | "location"
  | "payment_link_placeholder"
  | "static_content"
  | "whatsapp_cta";

export type BuildPlanV1 = {
  schemaVersion: 1;
  revision: number;
  contractHash: string;
  contentHash: string;
  appKind: "landing" | "marketing_site" | "interactive_app";
  pages: PlanPage[];
  navigation: Array<{ fromPageId: string; toPageId: string; label: string }>;
  capabilities: PlanCapability[];
};

export type PlanParseResult =
  { ok: true; value: BuildPlanV1 } | { ok: false; reason: string };

export type PlanValidationResult = { ok: true } | { ok: false; reason: string };

const VALID_CAPABILITIES: readonly PlanCapability[] = [
  "catalog",
  "lead_intent",
  "location",
  "payment_link_placeholder",
  "static_content",
  "whatsapp_cta",
];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

export function parseBuildPlan(input: unknown): PlanParseResult {
  if (!isRecord(input) || input.schemaVersion !== 1) {
    return { ok: false, reason: "invalid plan schema" };
  }
  if (
    !Array.isArray(input.pages) ||
    input.pages.length < 1 ||
    input.pages.length > 6
  ) {
    return { ok: false, reason: "plan requires 1-6 pages" };
  }

  const seenPaths = new Set<string>();
  const seenIds = new Set<string>();
  let hasRoot = false;

  for (const raw of input.pages as unknown[]) {
    if (!isRecord(raw)) {
      return { ok: false, reason: "invalid page" };
    }
    const id = raw.id;
    const path = raw.path;
    if (typeof id !== "string" || typeof path !== "string") {
      return { ok: false, reason: "page id and path required" };
    }
    if (seenIds.has(id)) {
      return { ok: false, reason: `duplicate page id: ${id}` };
    }
    seenIds.add(id);
    if (seenPaths.has(path)) {
      return { ok: false, reason: `duplicate path: ${path}` };
    }
    seenPaths.add(path);
    if (path === "/") {
      hasRoot = true;
    } else if (!/^\/[a-z0-9-]+(\/[a-z0-9-]+)*$/.test(path)) {
      return { ok: false, reason: `unsafe path: ${path}` };
    }
  }

  if (!hasRoot) {
    return { ok: false, reason: "plan requires exactly one root path /" };
  }

  if (Array.isArray(input.capabilities)) {
    for (const c of input.capabilities as unknown[]) {
      if (!VALID_CAPABILITIES.includes(c as PlanCapability)) {
        return { ok: false, reason: `unknown capability: ${c}` };
      }
    }
  }

  return { ok: true, value: input as unknown as BuildPlanV1 };
}

export function validatePlanAgainstContract(
  plan: BuildPlanV1,
  contract: BuildContractV1,
): PlanValidationResult {
  if (plan.contractHash !== contract.contentHash) {
    return { ok: false, reason: "plan contract hash mismatch" };
  }

  const factIds = new Set(contract.facts.map((f) => f.id));
  const jobIds = new Set(contract.visitorJobs.map((j) => j.id));

  const primaryJobs = new Set(
    contract.visitorJobs
      .filter((j) => j.priority === "primary")
      .map((j) => j.id),
  );
  const coveredJobs = new Set<string>();

  for (const page of plan.pages) {
    for (const factId of page.requiredFactIds) {
      if (!factIds.has(factId)) {
        return { ok: false, reason: `plan references unknown fact: ${factId}` };
      }
    }
    for (const jobId of page.visitorJobIds) {
      if (!jobIds.has(jobId)) {
        return {
          ok: false,
          reason: `plan references unknown visitor job: ${jobId}`,
        };
      }
      if (primaryJobs.has(jobId)) {
        coveredJobs.add(jobId);
      }
    }
  }

  for (const jobId of primaryJobs) {
    if (!coveredJobs.has(jobId)) {
      return { ok: false, reason: `primary visitor job not covered: ${jobId}` };
    }
  }

  for (const cta of contract.ctaIntents) {
    if (cta.targetFactId && !factIds.has(cta.targetFactId)) {
      return {
        ok: false,
        reason: `CTA target missing from contract: ${cta.targetFactId}`,
      };
    }
  }

  return { ok: true };
}
