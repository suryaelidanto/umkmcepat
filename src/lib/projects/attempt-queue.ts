import { Queue, QueueEvents, Worker, type ConnectionOptions } from "bullmq";

import { getSettingSync } from "@/lib/app-settings";
import { devLog } from "@/lib/dev-log";
import {
  abortJob,
  clearJobAbort,
  registerJobAbort,
} from "@/lib/projects/job-abort-registry";
import { startJobReaper } from "@/lib/projects/job-reaper";
import { getRedisUrl } from "@/lib/redis-url";

export const ATTEMPT_QUEUE_NAME = "project-attempt";

/** Default when setting/env unset — raised for ~100 concurrent product users. */
export const DEFAULT_BUILD_CONCURRENCY = 3;

/** BullMQ lock must outlive a long AI pass while lease renew keeps the op alive. */
const JOB_LOCK_DURATION_MS = 15 * 60_000;

export type GenerateAttemptJob = {
  kind: "generate";
  attemptId: string;
  buildId: string;
  generateMode: "first_generate" | "retry_build";
  operationToken: string;
  projectId: string;
  projectPrompt: string;
  projectStatus: string;
  userId: string;
};

export type EditBuildAttemptJob = {
  kind: "edit-build";
  attemptId: string;
  buildId: string;
  operationToken: string;
  projectId: string;
  snapshotId: string;
  sourceRef: string;
  userId: string;
};

/** Full edit: agent + compile. Job carries ids; worker reloads context from DB. */
export type EditAttemptJob = {
  kind: "edit";
  attemptId: string;
  operationToken: string;
  projectId: string;
  userId: string;
};

/**
 * Discuss turn on the queue. Large message payloads stay in chat DB;
 * worker reloads via turnId + projectId.
 */
export type DiscussAttemptJob = {
  kind: "discuss";
  turnId: string;
  projectId: string;
  userId: string;
  projectPrompt: string;
  projectStatus: string;
  projectTitle: string;
};

export type AttemptJob =
  GenerateAttemptJob | EditBuildAttemptJob | EditAttemptJob | DiscussAttemptJob;

export type EditBuildJobResult = {
  artifactRef: string | null;
  buildStatus: "failed" | "succeeded";
  logText: string;
};

let queue: Queue | null = null;
let queueEvents: QueueEvents | null = null;
let worker: Worker | null = null;

export function getBuildConcurrencyLimit(): number {
  const parsed = getSettingSync(
    "runtime.build_concurrency",
    DEFAULT_BUILD_CONCURRENCY,
  );
  return Number.isInteger(parsed) && parsed > 0
    ? parsed
    : DEFAULT_BUILD_CONCURRENCY;
}

function connectionOptions(): ConnectionOptions {
  return { url: getRedisUrl() };
}

function getQueue(): Queue {
  queue ??= new Queue(ATTEMPT_QUEUE_NAME, {
    connection: connectionOptions(),
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: { age: 3600, count: 100 },
      removeOnFail: { age: 86400, count: 200 },
    },
  });
  return queue;
}

function getQueueEvents(): QueueEvents {
  queueEvents ??= new QueueEvents(ATTEMPT_QUEUE_NAME, {
    connection: connectionOptions(),
  });
  return queueEvents;
}

function jobIdFor(job: AttemptJob): string {
  if (job.kind === "discuss") {
    return job.turnId;
  }
  return job.attemptId;
}

export async function enqueueAttemptJob(job: AttemptJob): Promise<void> {
  const jobId = jobIdFor(job);
  await getQueue().add(job.kind, job, { jobId });
  devLog("attempt-queue", "enqueued", {
    jobId,
    kind: job.kind,
    projectId: job.projectId,
  });
}

export async function enqueueAndWaitEditBuild(
  job: EditBuildAttemptJob,
  timeoutMs = 15 * 60_000,
): Promise<EditBuildJobResult> {
  const q = getQueue();
  const existing = await q.getJob(job.attemptId);
  if (existing) {
    const state = await existing.getState();
    if (state === "completed") {
      return existing.returnvalue as EditBuildJobResult;
    }
    if (state === "failed") {
      throw new Error(existing.failedReason || "Edit build job failed");
    }
  } else {
    await q.add(job.kind, job, { jobId: job.attemptId });
    devLog("attempt-queue", "enqueued", {
      attemptId: job.attemptId,
      kind: job.kind,
      projectId: job.projectId,
    });
  }

  const events = getQueueEvents();
  await events.waitUntilReady();
  const result = await q.getJob(job.attemptId).then((j) => {
    if (!j) {
      throw new Error("Edit build job missing after enqueue");
    }
    return j.waitUntilFinished(events, timeoutMs);
  });
  return result as EditBuildJobResult;
}

export function refreshAttemptWorkerConcurrency(): void {
  if (!worker) {
    return;
  }
  const next = getBuildConcurrencyLimit();
  worker.concurrency = next;
  devLog("attempt-queue", "concurrency", { concurrency: next });
}

export function abortAttemptJob(jobId: string): boolean {
  return abortJob(jobId);
}

/** User-facing (Indonesian). Technical cause goes to devLog only. */
const USER_JOB_FAILED = {
  discuss: "Obrolan belum berhasil diproses. Coba kirim ulang ya.",
  edit: "Edit belum berhasil diproses. Coba lagi sebentar.",
  generate: "Build belum berhasil diproses. Coba jalankan ulang ya.",
} as const;

async function failCleanAfterJobFailure(
  data: AttemptJob | undefined,
  error: Error,
): Promise<void> {
  if (!data) {
    return;
  }
  // Developer-facing log only — never store raw error.message for end users.
  devLog("attempt-queue", "job.fail-clean", {
    kind: data.kind,
    error: error.message.slice(0, 500),
  });
  try {
    if (data.kind === "discuss") {
      const { finalizeDiscussTurn } = await import("./discuss-turn");
      const { publishProgress } = await import("./discuss-turn-pubsub");
      await finalizeDiscussTurn({
        turnId: data.turnId,
        status: "failed",
        errorMessage: USER_JOB_FAILED.discuss,
      });
      publishProgress(data.turnId, {
        type: "error",
        errorText: USER_JOB_FAILED.discuss,
      });
      return;
    }

    if (data.kind === "edit" || data.kind === "generate") {
      const { prisma } = await import("@/lib/prisma");
      const { publishBuildProgress } = await import("./build-attempt-pubsub");
      const attemptId = data.attemptId;
      const userMessage =
        data.kind === "edit" ? USER_JOB_FAILED.edit : USER_JOB_FAILED.generate;
      await prisma.projectEditAttempt.updateMany({
        where: {
          id: attemptId,
          finishedAt: null,
        },
        data: {
          errorMessage: userMessage,
          finishedAt: new Date(),
          status: "failed",
        },
      });
      publishBuildProgress(attemptId, {
        type: "error",
        detail: userMessage,
      });
    }
  } catch (cleanupError) {
    devLog("attempt-queue", "fail-clean.error", {
      kind: data.kind,
      error: cleanupError instanceof Error ? cleanupError.message : "unknown",
    });
  }
}

export function startAttemptQueueWorker(): void {
  if (worker) {
    return;
  }

  startJobReaper(60_000);

  worker = new Worker(
    ATTEMPT_QUEUE_NAME,
    async (bullJob) => {
      const data = bullJob.data as AttemptJob;
      const jobId = jobIdFor(data);
      const abortSignal = registerJobAbort(jobId);
      try {
        if (data.kind === "generate") {
          // Relative imports: Vite worker dynamic import of @/ aliases can
          // fail for newly added modules ("Cannot find module").
          const { runBuildAttempt } = await import("./build-attempt-worker");
          await runBuildAttempt({
            abortSignal,
            attemptId: data.attemptId,
            buildId: data.buildId,
            generateMode: data.generateMode,
            operationToken: data.operationToken,
            project: {
              id: data.projectId,
              prompt: data.projectPrompt,
              status: data.projectStatus,
            },
            userId: data.userId,
          });
          return { ok: true };
        }

        if (data.kind === "discuss") {
          const { runQueuedDiscussTurn } =
            await import("./discuss-queue-worker");
          await runQueuedDiscussTurn(data, abortSignal);
          return { ok: true };
        }

        if (data.kind === "edit") {
          const { runEditAttempt } = await import("./edit-attempt-worker");
          await runEditAttempt({
            abortSignal,
            attemptId: data.attemptId,
            operationToken: data.operationToken,
            projectId: data.projectId,
            userId: data.userId,
          });
          return { ok: true };
        }

        const { runQueuedEditBuild } =
          await import("./edit-build-queue-worker");
        return runQueuedEditBuild(data);
      } finally {
        clearJobAbort(jobId);
      }
    },
    {
      concurrency: getBuildConcurrencyLimit(),
      connection: connectionOptions(),
      lockDuration: JOB_LOCK_DURATION_MS,
    },
  );

  worker.on("failed", (job, error) => {
    devLog("attempt-queue", "job.failed", {
      attemptId: job?.id,
      error: error.message,
    });
    // Fail-clean durable rows so UI is not stuck "running" until TTL/reaper.
    void failCleanAfterJobFailure(job?.data as AttemptJob | undefined, error);
  });

  devLog("attempt-queue", "worker.started", {
    concurrency: getBuildConcurrencyLimit(),
    lockDurationMs: JOB_LOCK_DURATION_MS,
  });
}
