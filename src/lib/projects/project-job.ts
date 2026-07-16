export type ProjectJobStep = {
  at: string;
  detail: string;
  label: string;
  status: "active" | "done" | "error";
};

export type ActiveProjectJob = {
  attemptId: string | null;
  buildId: string | null;
  kind: "edit" | "generate";
  message: string | null;
  phase:
    | "building"
    | "canceled"
    | "failed"
    | "finalizing"
    | "generating"
    | "succeeded";
  startedAt: string;
  steps: ProjectJobStep[];
  updatedAt: string;
};

type JobBuild = {
  createdAt: Date | string;
  finishedAt?: Date | string | null;
  id: string;
  startedAt?: Date | string | null;
  status: string;
  updatedAt: Date | string;
};

type JobEvent = {
  buildId?: string | null;
  createdAt: Date | string;
  message?: string | null;
  metadata?: unknown;
  type: string;
};

type JobAttempt = {
  buildId?: string | null;
  finishedAt?: Date | string | null;
  id: string;
  kind?: string | null;
  startedAt?: Date | string | null;
  status: string;
  updatedAt?: Date | string | null;
};

function toIso(value: Date | string | null | undefined, fallback = new Date()) {
  if (!value) {
    return fallback.toISOString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? fallback.toISOString()
    : parsed.toISOString();
}

function isActiveBuildStatus(status: string) {
  return status === "queued" || status === "running";
}

function isActiveAttemptStatus(status: string) {
  return (
    status === "generating" ||
    status === "editing" ||
    status === "repairing" ||
    status === "building" ||
    status === "received"
  );
}

function phaseFromBuild(status: string): ActiveProjectJob["phase"] {
  if (status === "queued" || status === "running") {
    return "building";
  }
  if (status === "succeeded") {
    return "succeeded";
  }
  if (status === "canceled") {
    return "canceled";
  }
  return "failed";
}

function phaseFromAttempt(status: string): ActiveProjectJob["phase"] {
  if (status === "building" || status === "repairing") {
    return "building";
  }
  if (
    status === "generating" ||
    status === "editing" ||
    status === "received"
  ) {
    return "generating";
  }
  if (status === "succeeded" || status === "completed") {
    return "succeeded";
  }
  if (status === "canceled") {
    return "canceled";
  }
  return "failed";
}

function syntheticSteps(
  phase: ActiveProjectJob["phase"],
  startedAt: string,
): ProjectJobStep[] {
  const base = [
    {
      at: startedAt,
      detail: "AI membaca brief dan menyiapkan file website.",
      label: "Menyiapkan source",
      status: "done" as const,
    },
    {
      at: startedAt,
      detail: "Worker memvalidasi dan mengompilasi file website.",
      label: "Build website",
      status: "done" as const,
    },
  ];

  if (phase === "generating") {
    return [
      {
        at: startedAt,
        detail: "AI sedang menulis dan merapikan file website.",
        label: "AI menulis source",
        status: "active",
      },
    ];
  }

  if (phase === "building") {
    return [
      base[0],
      {
        at: startedAt,
        detail: "Build sedang berjalan di server.",
        label: "Build website",
        status: "active",
      },
    ];
  }

  if (phase === "failed") {
    return [
      ...base.map((step) => ({ ...step, status: "done" as const })),
      {
        at: startedAt,
        detail: "Build berhenti sebelum tampilan siap.",
        label: "Build belum selesai",
        status: "error",
      },
    ];
  }

  if (phase === "canceled") {
    return [
      {
        at: startedAt,
        detail: "Proses dihentikan.",
        label: "Build dihentikan",
        status: "error",
      },
    ];
  }

  return base.map((step) => ({ ...step, status: "done" as const }));
}

function stepsFromEvents(
  events: JobEvent[],
  buildId: string | null,
  phase: ActiveProjectJob["phase"],
  startedAt: string,
): ProjectJobStep[] {
  const relevant = events
    .filter((event) => !buildId || !event.buildId || event.buildId === buildId)
    .slice()
    .reverse();

  const steps: ProjectJobStep[] = [];

  for (const event of relevant) {
    const meta =
      event.metadata && typeof event.metadata === "object"
        ? (event.metadata as { detail?: unknown; label?: unknown })
        : null;
    const label =
      typeof meta?.label === "string" && meta.label.trim()
        ? meta.label.trim()
        : event.type === "build.progress"
          ? event.message || "Proses berjalan"
          : event.type === "build.started"
            ? "Build dimulai"
            : event.type === "snapshot.created"
              ? "Source disimpan"
              : event.type === "build.succeeded"
                ? "Build berhasil"
                : event.type === "build.failed"
                  ? "Build gagal"
                  : event.type === "build.canceled"
                    ? "Build dihentikan"
                    : null;

    if (!label) {
      continue;
    }

    const detail =
      typeof meta?.detail === "string" && meta.detail.trim()
        ? meta.detail.trim()
        : event.message || label;

    const status: ProjectJobStep["status"] =
      event.type === "build.failed" || event.type === "build.canceled"
        ? "error"
        : event.type === "build.progress"
          ? "active"
          : "done";

    const existing = steps.findIndex((step) => step.label === label);
    const next = {
      at: toIso(event.createdAt),
      detail,
      label,
      status,
    };
    if (existing >= 0) {
      steps[existing] = next;
    } else {
      steps.push(next);
    }
  }

  if (!steps.length) {
    return syntheticSteps(phase, startedAt);
  }

  // Only the last non-error progress step stays active while job runs.
  if (
    phase === "generating" ||
    phase === "building" ||
    phase === "finalizing"
  ) {
    let lastActive = -1;
    for (let i = 0; i < steps.length; i += 1) {
      if (steps[i].status !== "error") {
        steps[i] = { ...steps[i], status: "done" };
        lastActive = i;
      }
    }
    if (lastActive >= 0) {
      steps[lastActive] = { ...steps[lastActive], status: "active" };
    }
  }

  return steps.slice(-8);
}

export function deriveActiveProjectJob({
  attempt,
  build,
  events = [],
  projectBuildStatus,
  projectStatus,
}: {
  attempt?: JobAttempt | null;
  build?: JobBuild | null;
  events?: JobEvent[];
  projectBuildStatus?: string | null;
  projectStatus?: string | null;
}): ActiveProjectJob | null {
  const activeBuild =
    build && isActiveBuildStatus(build.status)
      ? build
      : projectBuildStatus === "running" || projectStatus === "building"
        ? build
        : null;
  const activeAttempt =
    attempt && isActiveAttemptStatus(attempt.status) ? attempt : null;

  if (!activeBuild && !activeAttempt) {
    return null;
  }

  const kind: ActiveProjectJob["kind"] =
    attempt?.kind === "edit" || attempt?.kind === "visual_comment"
      ? "edit"
      : "generate";

  const phase = activeBuild
    ? phaseFromBuild(activeBuild.status)
    : phaseFromAttempt(activeAttempt!.status);

  const startedAt = toIso(
    activeBuild?.startedAt ||
      activeBuild?.createdAt ||
      activeAttempt?.startedAt ||
      activeAttempt?.updatedAt,
  );
  const updatedAt = toIso(
    activeBuild?.updatedAt || activeAttempt?.updatedAt || startedAt,
  );
  const buildId = activeBuild?.id || activeAttempt?.buildId || null;
  const attemptId = activeAttempt?.id || null;

  return {
    attemptId,
    buildId,
    kind,
    message:
      phase === "generating"
        ? "AI sedang menyiapkan file website."
        : phase === "building"
          ? "Build website sedang berjalan di server."
          : null,
    phase,
    startedAt,
    steps: stepsFromEvents(events, buildId, phase, startedAt),
    updatedAt,
  };
}

export function mapActiveJobStepsToBuildProgress(
  steps: ProjectJobStep[],
): Array<{ detail: string; label: string; status?: ProjectJobStep["status"] }> {
  return steps.map((step) => ({
    detail: step.detail,
    label: step.label,
    status: step.status,
  }));
}
