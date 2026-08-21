import { generateObject } from "ai";
import { z } from "zod";

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

const CreativeDirectionSchema = z.object({
  schemaVersion: z.literal(1),
  visitorReading: z
    .string()
    .describe(
      "What core problem or desire brings the visitor to this business?",
    ),
  visualThesis: z
    .string()
    .describe(
      "The overarching creative metaphor and mood, without prescribing layout cards or CSS colors.",
    ),
  businessAnchors: z.array(
    z.object({
      source: z.enum([
        "offer",
        "process",
        "place",
        "product",
        "craft",
        "audience",
      ]),
      acceptedFactId: z.string(),
      relevance: z.string(),
    }),
  ),
  character: z.array(z.string()).describe("3-5 personality adjectives"),
  firstViewPriority: z
    .string()
    .describe("What must be immediately obvious in the first 5 seconds?"),
  mobileIntent: z
    .string()
    .describe("How the essence translates gracefully to a phone screen"),
  genericityRisks: z
    .array(z.string())
    .describe("What generic AI landing page tropes must be avoided?"),
  factualBoundaries: z
    .array(z.string())
    .describe("Important facts that are missing and must NEVER be fabricated"),
});

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

  const result = await generateObject({
    abortSignal: input.abortSignal,
    model: getAiModel(modelId),
    prompt,
    schema: CreativeDirectionSchema,
    system: systemPrompt,
    telemetry: getAiTelemetry("project-outcome-creative-direction", {
      projectId: input.projectId,
      userId: input.userId,
    }),
  });

  const outputWithHash: CreativeDirectionV1 = {
    ...result.object,
    contractHash: input.contract.contractHash,
    schemaVersion: 1,
  };

  const validation = validateCreativeDirection(outputWithHash, input.contract);
  if (!validation.ok) {
    throw new Error(
      `Creative direction validation failed: ${validation.reason}`,
    );
  }

  return outputWithHash;
}
