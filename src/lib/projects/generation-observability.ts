// src/lib/projects/generation-observability.ts

export type SanitizedGenerationEvent = {
  projectId: string;
  candidateId?: string;
  attemptId?: string;
  gateCount?: number;
  hardGatePassed?: boolean;
  routeCount?: number;
  failureClass?: string;
  overheadMs?: number;
  engine?: string;
  recipeId?: string;
  mediaMode?: string;
  contractVersion?: number;
  gateVersion?: number;
  criticInvoked?: boolean;
  visualRepairCount?: number;
  outcome?: string;
  sourceGateFindings?: number;
  browserMs?: number;
  kitId?: string;
  kitVersion?: number;
  writerCalls?: number;
  criticCalls?: number;
  correctionCalls?: number;
  correctionReason?: string | null;
  criticalFindings?: number;
  highFindings?: number;
  writerMs?: number;
  criticMs?: number;
  totalToDecisionMs?: number;
  editableBytes?: number;
  firstFileClosedMs?: number;
};

export function sanitizeGenerationEvent(
  input: Record<string, unknown>,
): SanitizedGenerationEvent {
  const projectId =
    typeof input.projectId === "string" ? input.projectId : "unknown";
  const numeric = (key: string): number | undefined =>
    typeof input[key] === "number" ? (input[key] as number) : undefined;
  const str = (key: string): string | undefined =>
    typeof input[key] === "string" ? (input[key] as string) : undefined;
  const bool = (key: string): boolean | undefined =>
    typeof input[key] === "boolean" ? (input[key] as boolean) : undefined;

  return {
    projectId,
    candidateId: str("candidateId"),
    attemptId: str("attemptId"),
    gateCount: numeric("gateCount"),
    hardGatePassed: bool("hardGatePassed"),
    routeCount: numeric("routeCount"),
    failureClass: str("failureClass"),
    overheadMs: numeric("overheadMs"),
    engine: str("engine"),
    recipeId: str("recipeId"),
    mediaMode: str("mediaMode"),
    contractVersion: numeric("contractVersion"),
    gateVersion: numeric("gateVersion"),
    criticInvoked: bool("criticInvoked"),
    visualRepairCount: numeric("visualRepairCount"),
    outcome: str("outcome"),
    sourceGateFindings: numeric("sourceGateFindings"),
    browserMs: numeric("browserMs"),
    kitId: str("kitId"),
    kitVersion: numeric("kitVersion"),
    writerCalls: numeric("writerCalls"),
    criticCalls: numeric("criticCalls"),
    correctionCalls: numeric("correctionCalls"),
    correctionReason:
      input.correctionReason === null ? null : str("correctionReason"),
    criticalFindings: numeric("criticalFindings"),
    highFindings: numeric("highFindings"),
    writerMs: numeric("writerMs"),
    criticMs: numeric("criticMs"),
    totalToDecisionMs: numeric("totalToDecisionMs"),
    editableBytes: numeric("editableBytes"),
    firstFileClosedMs: numeric("firstFileClosedMs"),
  };
}
