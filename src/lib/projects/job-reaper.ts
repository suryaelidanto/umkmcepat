import { devLog } from "@/lib/dev-log";
import { prisma } from "@/lib/prisma";
import { DISCUSS_TURN_TTL_MS } from "@/lib/projects/discuss-turn";
import { STALE_BUILD_TIMEOUT_MS } from "@/lib/projects/stale-builds";

export type JobReaperResult = {
  expiredDiscussTurns: number;
  expiredLeases: number;
  staleBuilds: number;
};

let reaperTimer: ReturnType<typeof setInterval> | null = null;

export async function runJobReaperOnce(
  now = new Date(),
): Promise<JobReaperResult> {
  const buildCutoff = new Date(now.getTime() - STALE_BUILD_TIMEOUT_MS);

  const staleBuilds = await prisma.projectBuild.updateMany({
    where: {
      status: { in: ["queued", "running"] },
      updatedAt: { lt: buildCutoff },
    },
    data: {
      finishedAt: now,
      logText: "Build marked stale after exceeding the recovery timeout.",
      status: "stale",
    },
  });

  const expiredLeases = await prisma.project.updateMany({
    where: {
      activeOperationExpiresAt: { lte: now },
      activeOperationToken: { not: null },
      status: "building",
    },
    data: {
      activeOperationExpiresAt: null,
      activeOperationKind: null,
      activeOperationToken: null,
      buildLog: "Proses terhenti karena waktu habis. Coba jalankan ulang ya.",
      buildStatus: "failed",
      status: "failed",
    },
  });

  if (expiredLeases.count > 0) {
    await prisma.projectEditAttempt.updateMany({
      where: {
        finishedAt: null,
        status: { in: ["generating", "editing", "repairing", "building"] },
      },
      data: {
        errorMessage:
          "Proses terhenti karena waktu habis. Coba jalankan ulang ya.",
        finishedAt: now,
        status: "failed",
      },
    });
  }

  if (staleBuilds.count > 0) {
    await prisma.project.updateMany({
      where: {
        activeOperationToken: null,
        buildStatus: { in: ["queued", "running"] },
        status: "building",
      },
      data: {
        buildLog: "Build marked stale after exceeding the recovery timeout.",
        buildStatus: "failed",
        status: "failed",
      },
    });
  }

  // Discuss turns past expiresAt still running → failed (fail-clean).
  const expiredDiscussTurns = await prisma.projectChatTurn.updateMany({
    where: {
      expiresAt: { lte: now },
      status: "running",
    },
    data: {
      errorMessage: "Sesi obrolan habis waktu. Coba kirim ulang pesanmu ya.",
      finishedAt: now,
      status: "failed",
    },
  });

  const result: JobReaperResult = {
    expiredDiscussTurns: expiredDiscussTurns.count,
    expiredLeases: expiredLeases.count,
    staleBuilds: staleBuilds.count,
  };

  if (
    result.staleBuilds > 0 ||
    result.expiredLeases > 0 ||
    result.expiredDiscussTurns > 0
  ) {
    devLog("job-reaper", "sweep", result);
  }

  return result;
}

export function startJobReaper(intervalMs = 60_000): void {
  if (reaperTimer) {
    return;
  }
  // First tick after interval; avoid blocking startup.
  reaperTimer = setInterval(() => {
    void runJobReaperOnce().catch((error) => {
      devLog("job-reaper", "error", {
        error: error instanceof Error ? error.message : "unknown",
      });
    });
  }, intervalMs);
  if (typeof reaperTimer === "object" && "unref" in reaperTimer) {
    reaperTimer.unref();
  }
  devLog("job-reaper", "started", {
    intervalMs,
    discussTtlMs: DISCUSS_TURN_TTL_MS,
    staleBuildMs: STALE_BUILD_TIMEOUT_MS,
  });
}

export function stopJobReaperForTests(): void {
  if (reaperTimer) {
    clearInterval(reaperTimer);
    reaperTimer = null;
  }
}
