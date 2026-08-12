// src/lib/projects/generation-observability.ts
// Sanitized telemetry for contract-v1 generation. Never records full private
// user content: contract text, prompts, screenshot URLs, or business values.
// Only ids, counts, categories, booleans, timings, and sanitized failure
// classes (spec: Observability / E6).

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
  };
}
