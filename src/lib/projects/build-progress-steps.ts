export type ProgressStepLike = {
  detail: string;
  label: string;
  status?: "active" | "done" | "error";
};

/** Always append; mark prior active → done. No label merge, no cap. */
export function appendBuildProgressStep<T extends ProgressStepLike>(
  current: T[],
  next: T,
): T[] {
  return [
    ...current.map((step) =>
      step.status === "active" ? { ...step, status: "done" as const } : step,
    ),
    next,
  ];
}

export function completeBuildProgressSteps<T extends ProgressStepLike>(
  current: T[],
): T[] {
  return current.map((step) =>
    step.status === "active" ? { ...step, status: "done" as const } : step,
  );
}
