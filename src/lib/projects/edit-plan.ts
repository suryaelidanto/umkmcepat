import { z } from "zod";

import {
  EDIT_INTENT_DIMENSIONS,
  EDIT_INTENT_MAGNITUDES,
  EDIT_INTENT_OPERATIONS,
  type EditIntentClassification,
} from "./edit-intent";

const EDIT_PLAN_OPERATION_KINDS = [
  ...EDIT_INTENT_OPERATIONS,
  "responsive_layout",
] as const;

const EDIT_PLAN_COMPLETION_CRITERIA = [
  "compiles",
  "preserves_verified_facts",
  "keeps_unrelated_routes",
  "validates_responsive_layout",
  "uses_approved_assets",
] as const;

export const editPlanSchema = z.object({
  version: z.literal(1),
  instruction: z.string().min(1).max(16_000),
  magnitude: z.enum(EDIT_INTENT_MAGNITUDES),
  dimensions: z.array(z.enum(EDIT_INTENT_DIMENSIONS)),
  operations: z.array(
    z.object({
      kind: z.enum(EDIT_PLAN_OPERATION_KINDS),
      target: z.string().min(1).optional(),
    }),
  ),
  targetFiles: z.array(z.string().min(1)),
  verifiedFactFingerprint: z.string().regex(/^[a-f0-9]{64}$/iu),
  latestSuccessfulCheckpoint: z.object({
    id: z.string().min(1),
    snapshotId: z.string().min(1),
  }),
  completionCriteria: z.array(z.enum(EDIT_PLAN_COMPLETION_CRITERIA)).min(1),
});

export type EditPlan = z.infer<typeof editPlanSchema>;
export type EditPlanOperationKind = EditPlan["operations"][number]["kind"];

export type EditPlanResult =
  | { ok: true; plan: EditPlan }
  | {
      ok: false;
      code: "clarification_required" | "checkpoint_required" | "invalid_intent";
    };

export function createEditPlan({
  existingFiles,
  instruction,
  intent,
  latestSuccessfulCheckpoint,
  verifiedFactFingerprint,
}: {
  existingFiles: string[];
  instruction: string;
  intent: EditIntentClassification;
  latestSuccessfulCheckpoint: {
    id: string;
    snapshotId: string;
  } | null;
  verifiedFactFingerprint: string;
}): EditPlanResult {
  if (intent.clarificationRequired) {
    return { ok: false, code: "clarification_required" };
  }
  if (!latestSuccessfulCheckpoint) {
    return { ok: false, code: "checkpoint_required" };
  }
  if (!editIntentMatchesInstruction(intent, instruction)) {
    return { ok: false, code: "invalid_intent" };
  }

  const operations = getPlanOperations(intent);
  const parsed = editPlanSchema.safeParse({
    completionCriteria: getCompletionCriteria(intent),
    dimensions: intent.dimensions,
    instruction: instruction.trim(),
    latestSuccessfulCheckpoint,
    magnitude: intent.magnitude,
    operations,
    verifiedFactFingerprint,
    targetFiles: getTargetFiles(existingFiles, intent),
    version: 1,
  });
  if (!parsed.success) {
    return { ok: false, code: "invalid_intent" };
  }
  return { ok: true, plan: parsed.data };
}

function editIntentMatchesInstruction(
  intent: EditIntentClassification,
  instruction: string,
): boolean {
  return Boolean(instruction.trim()) && intent.allowedOperations.length > 0;
}

function getPlanOperations(
  intent: EditIntentClassification,
): Array<{ kind: EditPlanOperationKind; target?: string }> {
  const operations: Array<{ kind: EditPlanOperationKind; target?: string }> =
    intent.allowedOperations.map((kind) => ({ kind }));
  if (
    intent.magnitude === "structural" &&
    intent.dimensions.includes("layout") &&
    !operations.some((operation) => operation.kind === "responsive_layout")
  ) {
    operations.push({ kind: "responsive_layout" });
  }
  return operations;
}

function getCompletionCriteria(
  intent: EditIntentClassification,
): Array<(typeof EDIT_PLAN_COMPLETION_CRITERIA)[number]> {
  const criteria: Array<(typeof EDIT_PLAN_COMPLETION_CRITERIA)[number]> = [
    "compiles",
    "preserves_verified_facts",
  ];
  if (intent.magnitude !== "full_rebuild") {
    criteria.push("keeps_unrelated_routes");
  }
  if (intent.dimensions.includes("layout")) {
    criteria.push("validates_responsive_layout");
  }
  if (intent.dimensions.includes("media")) {
    criteria.push("uses_approved_assets");
  }
  return criteria;
}

function getTargetFiles(
  existingFiles: string[],
  intent: EditIntentClassification,
): string[] {
  const allowed = new Set(existingFiles);
  return intent.targetFiles.filter((path) => allowed.has(path));
}
