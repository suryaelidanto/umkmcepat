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
export const DISCUSS_QUEUE_NAME = "project-discuss";
export const COMPACTION_QUEUE_NAME = "project-compaction";

/** Default when setting/env unset — raised for ~100 concurrent product users. */
export const DEFAULT_BUILD_CONCURRENCY = 3;

/** Discuss turns are short; keep separate from build concurrency. */
export const DEFAULT_DISCUSS_CONCURRENCY = 5;

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
  generationEngine: string;
};

export type CompactionAttemptJob = {
  kind: "compaction";
  projectId: string;
  turnId: string;
  userId: string;
};

export type AttemptJob =
  | GenerateAttemptJob
  | EditBuildAttemptJob
  | EditAttemptJob
  | DiscussAttemptJob
  | CompactionAttemptJob;

export type EditBuildJobResult = {
  artifactRef: string | null;
  buildStatus: "failed" | "succeeded";
  logText: string;
};

let queue: Queue | null = null;
let discussQueue: Queue | null = null;
let compactionQueue: Queue | null = null;
let queueEvents: QueueEvents | null = null;
let worker: Worker | null = null;
let discussWorker: Worker | null = null;
let compactionWorker: Worker | null = null;

export function getBuildConcurrencyLimit(): number {
  const parsed = getSettingSync(
    "runtime.build_concurrency",
    DEFAULT_BUILD_CONCURRENCY,
  );
  return Number.isInteger(parsed) && parsed > 0
    ? parsed
    : DEFAULT_BUILD_CONCURRENCY;
}

export function getDiscussConcurrencyLimit(): number {
  return DEFAULT_DISCUSS_CONCURRENCY;
}

export function queueNameForJob(job: AttemptJob): string {
  if (job.kind === "discuss") {
    return DISCUSS_QUEUE_NAME;
  }
  if (job.kind === "compaction") {
    return COMPACTION_QUEUE_NAME;
  }
  return ATTEMPT_QUEUE_NAME;
}

function connectionOptions(): ConnectionOptions {
  return { url: getRedisUrl() };
}

function defaultJobOptions() {
  return {
    attempts: 1,
    removeOnComplete: { age: 3600, count: 100 },
    removeOnFail: { age: 86400, count: 200 },
  };
}

function getQueue(): Queue {
  queue ??= new Queue(ATTEMPT_QUEUE_NAME, {
    connection: connectionOptions(),
    defaultJobOptions: defaultJobOptions(),
  });
  return queue;
}

function getDiscussQueue(): Queue {
  discussQueue ??= new Queue(DISCUSS_QUEUE_NAME, {
    connection: connectionOptions(),
    defaultJobOptions: defaultJobOptions(),
  });
  return discussQueue;
}

function getCompactionQueue(): Queue {
  compactionQueue ??= new Queue(COMPACTION_QUEUE_NAME, {
    connection: connectionOptions(),
    defaultJobOptions: defaultJobOptions(),
  });
  return compactionQueue;
}

function getQueueEvents(): QueueEvents {
  queueEvents ??= new QueueEvents(ATTEMPT_QUEUE_NAME, {
    connection: connectionOptions(),
  });
  return queueEvents;
}

function jobIdFor(job: AttemptJob): string {
  if (job.kind === "discuss" || job.kind === "compaction") {
    return job.turnId;
  }
  return job.attemptId;
}

export async function enqueueAttemptJob(job: AttemptJob): Promise<void> {
  const jobId = jobIdFor(job);
  const queueName = queueNameForJob(job);
  const target =
    job.kind === "discuss"
      ? getDiscussQueue()
      : job.kind === "compaction"
        ? getCompactionQueue()
        : getQueue();
  await target.add(job.kind, job, { jobId });
  devLog("attempt-queue", "enqueued", {
    jobId,
    kind: job.kind,
    projectId: job.projectId,
    queue: queueName,
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
      queue: ATTEMPT_QUEUE_NAME,
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

function attachWorkerHandlers(w: Worker, label: string) {
  w.on("failed", (job, error) => {
    devLog("attempt-queue", "job.failed", {
      attemptId: job?.id,
      error: error.message,
      queue: label,
    });
    void failCleanAfterJobFailure(job?.data as AttemptJob | undefined, error);
  });
}

export function startAttemptQueueWorker(): void {
  if (worker && discussWorker && compactionWorker) {
    return;
  }

  startJobReaper(60_000);

  void import("./shared-node-modules")
    .then(({ prewarmSharedNodeModules }) => prewarmSharedNodeModules())
    .catch((error) => {
      devLog("shared-node-modules", "prewarm-failed", {
        error: error instanceof Error ? error.message : "unknown",
      });
    });

  if (!worker) {
    worker = new Worker(
      ATTEMPT_QUEUE_NAME,
      async (bullJob) => {
        const data = bullJob.data as AttemptJob;
        if (data.kind === "discuss") {
          throw new Error(
            "Discuss jobs must use project-discuss queue, not project-attempt.",
          );
        }
        const jobId = jobIdFor(data);
        const abortSignal = registerJobAbort(jobId);
        try {
          if (data.kind === "generate") {
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
    attachWorkerHandlers(worker, ATTEMPT_QUEUE_NAME);
  }

  if (!discussWorker) {
    discussWorker = new Worker(
      DISCUSS_QUEUE_NAME,
      async (bullJob) => {
        const data = bullJob.data as AttemptJob;
        if (data.kind !== "discuss") {
          throw new Error(
            `Unexpected job kind on discuss queue: ${String((data as AttemptJob).kind)}`,
          );
        }
        const jobId = jobIdFor(data);
        const abortSignal = registerJobAbort(jobId);
        try {
          const { runQueuedDiscussTurn } =
            await import("./discuss-queue-worker");
          await runQueuedDiscussTurn(data, abortSignal);
          return { ok: true };
        } finally {
          clearJobAbort(jobId);
        }
      },
      {
        concurrency: getDiscussConcurrencyLimit(),
        connection: connectionOptions(),
        lockDuration: JOB_LOCK_DURATION_MS,
      },
    );
    attachWorkerHandlers(discussWorker, DISCUSS_QUEUE_NAME);
  }

  if (!compactionWorker) {
    compactionWorker = new Worker(
      COMPACTION_QUEUE_NAME,
      async (bullJob) => {
        const data = bullJob.data as AttemptJob;
        if (data.kind !== "compaction") {
          throw new Error(
            `Unexpected job kind on compaction queue: ${String((data as AttemptJob).kind)}`,
          );
        }
        const { runQueuedProjectCompaction } =
          await import("./chat-compaction-queue-worker");
        await runQueuedProjectCompaction(data);
        return { ok: true };
      },
      {
        concurrency: getDiscussConcurrencyLimit(),
        connection: connectionOptions(),
        lockDuration: JOB_LOCK_DURATION_MS,
      },
    );
    attachWorkerHandlers(compactionWorker, COMPACTION_QUEUE_NAME);
  }

  devLog("attempt-queue", "worker.started", {
    buildConcurrency: getBuildConcurrencyLimit(),
    discussConcurrency: getDiscussConcurrencyLimit(),
    lockDurationMs: JOB_LOCK_DURATION_MS,
    queues: [ATTEMPT_QUEUE_NAME, DISCUSS_QUEUE_NAME, COMPACTION_QUEUE_NAME],
  });
}
