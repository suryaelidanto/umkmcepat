import { devLog } from "@/lib/dev-log";
import { prisma } from "@/lib/prisma";

/**
 * AiCallRecord: per-request AI observability ledger (metadata only — never
 * prompts, file contents, or response bodies). Complements UserCredit
 * ("what did it cost") with "what happened and when".
 *
 * `recordAiCall` is fire-and-forget: no retries, no queue, and it NEVER
 * throws into the request path. If Postgres hiccups we lose a telemetry row
 * — acceptable here; billing stays in UserCredit's transactional path.
 */
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
  ttftMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
  status: string; // ok|error|aborted|timeout
  errorClass?: string;
  retryCount?: number;
  hedged?: boolean;
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
          hedged: entry.hedged,
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

/**
 * Capture `performance.now()` before an AI call; the returned closure yields
 * the elapsed request duration at the boundary closest to the wire.
 */
export function startAiCallTimer(): () => { requestMs: number } {
  const startedAt = performance.now();
  return () => ({ requestMs: Math.round(performance.now() - startedAt) });
}
