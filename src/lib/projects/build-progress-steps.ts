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

/**
 * Runtime-poll hydrate is a reattach path, not a mid-stream source of truth.
 *
 * Live SSE rows are complete whenever the attempt channel is alive —
 * `subscribeBuildProgress` replays its whole buffer on subscribe — and they
 * carry per-tool detail the persisted steps throttle away. A server list that
 * is strictly longer is what a lost channel looks like, so that is the only
 * case worth adopting.
 */
export function mergeHydratedBuildProgress<T extends ProgressStepLike>(
  current: T[],
  hydrated: T[],
): T[] {
  return hydrated.length > current.length ? hydrated : current;
}

/**
 * The step the composer footer should name.
 *
 * `appendBuildProgressStep` finishes the running phase row the moment a tool
 * operation row lands, so mid-build there is frequently no `active` row at all.
 * The newest row is what the agent most recently did, and the footer only
 * renders while a job is genuinely running, so naming it stays honest.
 */
export function resolveCurrentBuildProgressStep<T extends ProgressStepLike>(
  steps: T[],
): T | null {
  return steps.length ? steps[steps.length - 1] : null;
}
