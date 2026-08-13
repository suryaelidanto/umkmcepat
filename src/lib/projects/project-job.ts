import {
  friendlyBuildProgressDetail,
  friendlyBuildProgressLabel,
} from "@/lib/projects/build-stream-event";
import { type DiffLine } from "@/lib/projects/diff";

export type ProjectJobStep = {
  at: string;
  detail: string;
  diff?: DiffLine[];
  durationMs?: number;
  label: string;
  startedAt?: number;
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
      detail: "Membaca kebutuhan usaha dan menyiapkan website.",
      label: "Menyiapkan website",
      status: "done" as const,
    },
    {
      at: startedAt,
      detail: "Memeriksa bagian website sebelum ditampilkan.",
      label: "Memeriksa website",
      status: "done" as const,
    },
  ];

  if (phase === "generating") {
    return [
      {
        at: startedAt,
        detail: "Bagian website sedang ditulis satu per satu.",
        label: "Menulis bagian website",
        status: "active",
      },
    ];
  }

  if (phase === "building") {
    return [
      base[0],
      {
        at: startedAt,
        detail: "Bagian website sedang diperiksa.",
        label: "Memeriksa website",
        status: "active",
      },
    ];
  }

  if (phase === "failed") {
    return [
      ...base.map((step) => ({ ...step, status: "done" as const })),
      {
        at: startedAt,
        detail: "Pembuatan website berhenti sebelum tampilan siap.",
        label: "Website belum selesai",
        status: "error",
      },
    ];
  }

  if (phase === "canceled") {
    return [
      {
        at: startedAt,
        detail: "Pembuatan website dihentikan.",
        label: "Pembuatan dihentikan",
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
        ? (event.metadata as {
            detail?: unknown;
            diff?: unknown;
            label?: unknown;
            path?: unknown;
          })
        : null;
    const rawLabel =
      typeof meta?.label === "string" && meta.label.trim()
        ? meta.label.trim()
        : event.type === "build.progress"
          ? event.message || "Proses berjalan"
          : event.type === "build.started"
            ? "Menyiapkan website"
            : event.type === "snapshot.created"
              ? "Bagian website tersimpan"
              : event.type === "build.succeeded"
                ? "Website siap dilihat"
                : event.type === "build.failed"
                  ? "Website belum selesai"
                  : event.type === "build.canceled"
                    ? "Pembuatan dihentikan"
                    : null;

    if (!rawLabel) {
      continue;
    }

    const label = friendlyBuildProgressLabel(rawLabel);
    const rawDetail =
      typeof meta?.detail === "string" && meta.detail.trim()
        ? meta.detail.trim()
        : event.message || label;
    const detail = friendlyBuildProgressDetail(
      rawDetail,
      typeof meta?.path === "string" ? meta.path : undefined,
    );

    const status: ProjectJobStep["status"] =
      event.type === "build.failed" || event.type === "build.canceled"
        ? "error"
        : event.type === "build.progress"
          ? "active"
          : "done";

    const diff = Array.isArray(meta?.diff)
      ? (meta.diff as ProjectJobStep["diff"])
      : undefined;

    steps.push({
      at: toIso(event.createdAt),
      detail,
      diff,
      label,
      status,
    });
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

  // Compute startedAt / durationMs from adjacent event timestamps.
  for (let i = 0; i < steps.length; i += 1) {
    const t = new Date(steps[i].at).getTime();
    if (!Number.isNaN(t)) {
      steps[i] = { ...steps[i], startedAt: t };
      if (steps[i].status !== "active" && i + 1 < steps.length) {
        const tNext = new Date(steps[i + 1].at).getTime();
        if (!Number.isNaN(tNext)) {
          steps[i] = {
            ...steps[i],
            startedAt: t,
            durationMs: Math.max(0, tNext - t),
          };
        }
      }
    }
  }

  return steps;
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
  // Prefer a truly active build row. Do NOT treat an old succeeded build as
  // active just because Project.status is still "building" during edit agent.
  const activeBuild = build && isActiveBuildStatus(build.status) ? build : null;
  const activeAttempt =
    attempt && isActiveAttemptStatus(attempt.status) ? attempt : null;
  const projectBusy =
    projectBuildStatus === "running" || projectStatus === "building";

  if (!activeBuild && !activeAttempt && !projectBusy) {
    return null;
  }

  // Edit/visual_comment often sets project=building before any new ProjectBuild.
  if (!activeBuild && !activeAttempt && projectBusy) {
    const startedAt = new Date().toISOString();
    return {
      attemptId: null,
      buildId: null,
      kind: "edit",
      message: "Revisi website sedang berjalan di server.",
      phase: "generating",
      startedAt,
      steps: syntheticSteps("generating", startedAt),
      updatedAt: startedAt,
    };
  }

  const kind: ActiveProjectJob["kind"] =
    activeAttempt?.kind === "edit" ||
    activeAttempt?.kind === "visual_comment" ||
    activeAttempt?.kind === "instruction"
      ? "edit"
      : "generate";

  // While an edit attempt is open and build not yet running, phase is generating.
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
        ? "Website sedang dibuat."
        : phase === "building"
          ? "Website sedang diperiksa."
          : null,
    phase,
    startedAt,
    steps: stepsFromEvents(events, buildId, phase, startedAt),
    updatedAt,
  };
}

export function mapActiveJobStepsToBuildProgress(
  steps: ProjectJobStep[],
): Array<{
  detail: string;
  diff?: DiffLine[];
  durationMs?: number;
  label: string;
  startedAt?: number;
  status?: ProjectJobStep["status"];
}> {
  return steps.map((step) => ({
    detail: step.detail,
    diff: step.diff,
    durationMs: step.durationMs,
    label: step.label,
    startedAt: step.startedAt,
    status: step.status,
  }));
}
