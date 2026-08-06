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

/**
 * Coarse, bounded error vocabulary for the ledger — never the raw provider
 * message. Order matters: rate-limit/timeout/schema before the transport
 * fallback, `fetch failed` (Node undici transport) maps to parse only via
 * TypeError name since its message says nothing useful.
 */
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
  /**
   * Time to first token/chunk for streaming calls; equals `requestMs` for
   * buffered (non-streaming) calls; null when the call ended before any
   * content chunk arrived.
   */
  ttftMs: number | null;
};

export type AiCallTimer = {
  (opts?: { nonStreaming?: boolean }): AiCallTiming;
  /**
   * Mark the first content chunk of a stream (text-delta / tool-input-delta).
   * Latches: only the first mark counts. No-op unless created `withTtft`.
   */
  firstChunk: () => void;
};

/**
 * Capture `performance.now()` before an AI call; the returned closure yields
 * the elapsed request duration at the boundary closest to the wire.
 *
 * With `{ withTtft: true }` the closure also reports `ttftMs`:
 * - streaming: call `firstChunk()` on the first content chunk — TTFT is the
 *   delta to that mark; stays null when the stream fails pre-chunk.
 * - non-streaming (generateText/generateObject/ToolLoopAgent): a buffered
 *   response has no first-token moment, so pass `{ nonStreaming: true }` at
 *   stop time to record `ttftMs = requestMs`.
 * Without `withTtft` the legacy shape `{ requestMs }` is returned.
 */
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
