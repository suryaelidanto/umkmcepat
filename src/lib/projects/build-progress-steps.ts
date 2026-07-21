export type ProgressStepLike = {
  detail: string;
  durationMs?: number;
  label: string;
  startedAt?: number;
  status?: "active" | "done" | "error";
};

function finishStep<T extends ProgressStepLike>(step: T): T {
  if (step.status !== "active") {
    return step;
  }
  const durationMs =
    step.startedAt != null ? Date.now() - step.startedAt : undefined;
  return { ...step, durationMs, status: "done" as const };
}

/** Always append; mark prior active → done. No label merge, no cap. */
export function appendBuildProgressStep<T extends ProgressStepLike>(
  current: T[],
  next: T,
): T[] {
  return [
    ...current.map((step) =>
      step.status === "active" ? finishStep(step) : step,
    ),
    { ...next, startedAt: next.startedAt ?? Date.now() },
  ];
}

export function completeBuildProgressSteps<T extends ProgressStepLike>(
  current: T[],
): T[] {
  return current.map((step) =>
    step.status === "active" ? finishStep(step) : step,
  );
}
