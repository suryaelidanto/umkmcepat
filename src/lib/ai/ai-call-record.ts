import { devLog } from "@/lib/dev-log";
import { prisma } from "@/lib/prisma";

export type AiCallEntry = {
  projectId?: string;
  attemptId?: string;
  turnId?: string;
  buildId?: string;
  task: string; // moderation|discuss|compaction|build-spec|build-step|edit|edit-repair|build-repair
  phase?: string;
  stepIndex?: number;
  modelRequested: string;
  modelServed?: string | null;
  requestMs?: number;
  ttftMs?: number | null;
  inputTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
  status: string; // ok|error|aborted|timeout
  errorClass?: string;
  retryCount?: number;
  raceRole?: string;
};

export function recordAiCall(entry: AiCallEntry): void {
  try {
    void prisma.aiCallRecord
      .create({
        data: {
          attemptId: entry.attemptId,
          buildId: entry.buildId,
          cachedTokens: entry.cachedTokens,
          errorClass: entry.errorClass?.slice(0, 64),
          inputTokens: entry.inputTokens,
          modelRequested: entry.modelRequested.slice(0, 160),
          modelServed: entry.modelServed?.slice(0, 160),
          outputTokens: entry.outputTokens,
          phase: entry.phase?.slice(0, 32),
          projectId: entry.projectId,
          raceRole: entry.raceRole?.slice(0, 16),
          requestMs: entry.requestMs,
          retryCount: entry.retryCount,
          status: entry.status.slice(0, 16),
          stepIndex: entry.stepIndex,
          task: entry.task.slice(0, 32),
          ttftMs: entry.ttftMs,
          turnId: entry.turnId,
        },
      })
      .catch((error: unknown) => {
        devLog("ai-call-ledger", "write-failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      });
  } catch (error) {
    // Sync throws (stubbed prisma in unit tests) must never reach callers.
    devLog("ai-call-ledger", "write-failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function classifyAiError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/rate.?limit|429|too many/i.test(message)) {
    return "rate-limit";
  }
  if (/timed out|timeout|aborted/i.test(message)) {
    return "timeout";
  }
  if (/schema|422|invalid/i.test(message)) {
    return "schema";
  }
  if (/json|parse|unexpected token/i.test(message)) {
    return "parse";
  }
  if (
    /socket|econnreset|econnrefused|network|dns|fetch failed/i.test(message)
  ) {
    return "transport";
  }
  return "unknown";
}

export type AiCallTiming = {
  requestMs: number;
  ttftMs: number | null;
};

export type AiCallTimer = {
  (opts?: { nonStreaming?: boolean }): AiCallTiming;
  firstChunk: () => void;
};

export function startAiCallTimer(): () => { requestMs: number };
export function startAiCallTimer(opts: { withTtft: true }): AiCallTimer;
export function startAiCallTimer(opts?: { withTtft?: boolean }) {
  const startedAt = performance.now();
  if (!opts?.withTtft) {
    return () => ({ requestMs: Math.round(performance.now() - startedAt) });
  }
  let firstChunkAt: number | null = null;
  const stop = (stopOpts?: { nonStreaming?: boolean }): AiCallTiming => {
    const requestMs = Math.round(performance.now() - startedAt);
    const ttftMs =
      firstChunkAt !== null
        ? Math.round(firstChunkAt - startedAt)
        : stopOpts?.nonStreaming
          ? requestMs
          : null;
    return { requestMs, ttftMs };
  };
  stop.firstChunk = () => {
    if (firstChunkAt === null) {
      firstChunkAt = performance.now();
    }
  };
  return stop;
}
