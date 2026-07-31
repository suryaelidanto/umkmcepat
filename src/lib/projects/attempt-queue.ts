import { Queue, QueueEvents, Worker, type ConnectionOptions } from "bullmq";

import { getSettingSync } from "@/lib/app-settings";
import { devLog } from "@/lib/dev-log";
import { getRedisUrl } from "@/lib/redis-url";

export const ATTEMPT_QUEUE_NAME = "project-attempt";

export type AttemptJobKind = "generate" | "edit-build";

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

export type AttemptJob = GenerateAttemptJob | EditBuildAttemptJob;

export type EditBuildJobResult = {
  artifactRef: string | null;
  buildStatus: "failed" | "succeeded";
  logText: string;
};

let queue: Queue | null = null;
let queueEvents: QueueEvents | null = null;
let worker: Worker | null = null;

export function getBuildConcurrencyLimit(): number {
  const parsed = getSettingSync("runtime.build_concurrency", 1);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
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

export async function enqueueAttemptJob(job: AttemptJob): Promise<void> {
  await getQueue().add(job.kind, job, {
    jobId: job.attemptId,
  });
  devLog("attempt-queue", "enqueued", {
    attemptId: job.attemptId,
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

export function startAttemptQueueWorker(): void {
  if (worker) {
    return;
  }

  worker = new Worker(
    ATTEMPT_QUEUE_NAME,
    async (bullJob) => {
      const data = bullJob.data as AttemptJob;
      if (data.kind === "generate") {
        const { runBuildAttempt } =
          await import("@/lib/projects/build-attempt-worker");
        const abortController = new AbortController();
        await runBuildAttempt({
          abortSignal: abortController.signal,
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

      const { runQueuedEditBuild } =
        await import("@/lib/projects/edit-build-queue-worker");
      return runQueuedEditBuild(data);
    },
    {
      concurrency: getBuildConcurrencyLimit(),
      connection: connectionOptions(),
    },
  );

  worker.on("failed", (job, error) => {
    devLog("attempt-queue", "job.failed", {
      attemptId: job?.id,
      error: error.message,
    });
  });

  devLog("attempt-queue", "worker.started", {
    concurrency: getBuildConcurrencyLimit(),
  });
}
