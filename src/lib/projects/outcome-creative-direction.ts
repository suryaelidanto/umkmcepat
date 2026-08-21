import { generateText } from "ai";

import type { OutcomeDirectedSiteContractV1 } from "./outcome-site-contract";

import { getAiModel, getAiTelemetry } from "@/lib/ai/ai";
import { getGenerationModel } from "@/lib/ai/ai-models";

export type CreativeDirectionV1 = {
  schemaVersion: 1;
  contractHash: string;
  visitorReading: string;
  visualThesis: string;
  businessAnchors: Array<{
    source: "offer" | "process" | "place" | "product" | "craft" | "audience";
    acceptedFactId: string;
    relevance: string;
  }>;
  character: string[];
  firstViewPriority: string;
  mobileIntent: string;
  genericityRisks: string[];
  factualBoundaries: string[];
};

const PRESCRIPTIVE_LAYOUT_PATTERN =
  /\b(split hero|3-card|three cards|equal card|bento grid|carousel|hero section with|orange button|teal button|blue button|grid of cards)\b/i;

export function validateCreativeDirection(
  direction: unknown,
  contract: OutcomeDirectedSiteContractV1,
): { ok: true } | { ok: false; reason: string } {
  if (!direction || typeof direction !== "object") {
    return { ok: false, reason: "invalid_direction_shape" };
  }

  const d = direction as Partial<CreativeDirectionV1>;

  if (d.schemaVersion !== 1) {
    return { ok: false, reason: "invalid_schema_version" };
  }

  if (d.contractHash !== contract.contractHash) {
    return { ok: false, reason: "contract_hash_mismatch" };
  }

  if (!Array.isArray(d.businessAnchors) || d.businessAnchors.length === 0) {
    return { ok: false, reason: "missing_business_anchors" };
  }

  if (!d.visitorReading || !d.visualThesis || !d.firstViewPriority) {
    return { ok: false, reason: "missing_required_fields" };
  }

  const allText = `${d.visualThesis} ${d.firstViewPriority} ${d.visitorReading}`;
  if (PRESCRIPTIVE_LAYOUT_PATTERN.test(allText)) {
    return { ok: false, reason: "prescriptive_visual_solution" };
  }

  return { ok: true };
}

export async function runOutcomeCreativeDirection(input: {
  abortSignal?: AbortSignal;
  contract: OutcomeDirectedSiteContractV1;
  projectId: string;
  userId: string;
}): Promise<CreativeDirectionV1> {
  const modelId = getGenerationModel();
  const systemPrompt = `You are the Creative Director for an authentic Indonesian business website.
Your task is to provide high-level creative direction and design thesis for this specific business.

CRITICAL RULES:
- Give high-level visual and emotional direction. Do NOT prescribe exact layout templates (no "use a split hero", "put 3 cards", "use bento grid", "make buttons orange").
- Rely ONLY on accepted facts from the contract.
- Name the real human feeling, customer job, and brand character.`;

  const prompt = `Produce creative direction for this accepted contract:
${JSON.stringify(input.contract, null, 2)}`;

  const result = await generateText({
    abortSignal: input.abortSignal,
    model: getAiModel(modelId),
    prompt,
    system: systemPrompt,
    telemetry: getAiTelemetry("project-outcome-creative-direction", {
      projectId: input.projectId,
      userId: input.userId,
    }),
  });
  const thesis = result.text.trim();
  if (!thesis) {
    throw new Error("Creative direction response was empty.");
  }

  const primaryJob = input.contract.visitorJobs.find(
    (job) => job.priority === "primary",
  );
  const primaryAction = input.contract.actions.find(
    (action) => action.priority === "primary",
  );
  const anchorFactId = input.contract.offers[0]?.factId;
  if (!primaryJob || !primaryAction || !anchorFactId) {
    throw new Error("Creative direction requires accepted business anchors.");
  }

  const outputWithHash: CreativeDirectionV1 = {
    businessAnchors: [
      {
        acceptedFactId: anchorFactId,
        relevance: input.contract.offers[0].name,
        source: "offer",
      },
    ],
    character: [],
    contractHash: input.contract.contractHash,
    factualBoundaries: input.contract.omissions,
    firstViewPriority: `${input.contract.business.name}: ${primaryAction.label}`,
    genericityRisks: [],
    mobileIntent: primaryJob.goal,
    schemaVersion: 1,
    visitorReading: primaryJob.goal,
    visualThesis: thesis,
  };

  const validation = validateCreativeDirection(outputWithHash, input.contract);
  if (!validation.ok) {
    throw new Error(
      `Creative direction validation failed: ${validation.reason}`,
    );
  }

  return outputWithHash;
}
