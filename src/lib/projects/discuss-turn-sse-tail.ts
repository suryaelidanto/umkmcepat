import { devLog } from "@/lib/dev-log";
import {
  type DiscussProgressEvent,
  subscribeProgress,
} from "@/lib/projects/discuss-turn-pubsub";

export type DiscussTurnDbState =
  | { kind: "running" }
  | { kind: "succeeded" }
  | { kind: "failed"; errorText: string }
  | { kind: "cancelled"; errorText: string }
  | { kind: "missing" };

const DEFAULT_POLL_MS = 1_500;
const DEFAULT_CEILING_MS = 8 * 60_000;
const DEFAULT_HEARTBEAT_MS = 15_000;
const HARD_CEILING_ERROR =
  "Obrolan terlalu lama. Coba kirim ulang atau muat ulang halaman.";

/**
 * Relay discuss progress to an SSE/UI writer until finish|error, with DB poll
 * fallback when the progress bus never delivers a terminal event.
 */
export async function runDiscussProgressTail(options: {
  turnId: string;
  write: (event: DiscussProgressEvent) => void;
  writeComment?: (comment: string) => void;
  pollIntervalMs?: number;
  heartbeatIntervalMs?: number;
  hardCeilingMs?: number;
  isTerminalDb: () => Promise<DiscussTurnDbState>;
}): Promise<void> {
  const {
    turnId,
    write,
    writeComment,
    pollIntervalMs = DEFAULT_POLL_MS,
    heartbeatIntervalMs = DEFAULT_HEARTBEAT_MS,
    hardCeilingMs = DEFAULT_CEILING_MS,
    isTerminalDb,
  } = options;

  let settled = false;
  let resolveTail!: () => void;
  const tailDone = new Promise<void>((resolve) => {
    resolveTail = resolve;
  });

  const settle = () => {
    if (settled) {
      return;
    }
    settled = true;
    resolveTail();
  };

  const writeTerminal = (event: DiscussProgressEvent) => {
    if (settled) {
      return;
    }
    try {
      write(event);
    } catch {
      /* client gone */
    }
    settle();
  };

  const unsubscribe = subscribeProgress(turnId, (event) => {
    if (settled) {
      return;
    }
    try {
      write(event);
    } catch {
      settle();
      return;
    }
    if (event.type === "finish" || event.type === "error") {
      settle();
    }
  });

  const startedAt = Date.now();
  const heartbeatTimer = setInterval(() => {
    if (settled) {
      return;
    }
    try {
      write({ type: "heartbeat" });
      writeComment?.("ping");
    } catch {
      settle();
    }
  }, heartbeatIntervalMs);
  const pollTimer = setInterval(() => {
    void (async () => {
      if (settled) {
        return;
      }
      if (Date.now() - startedAt >= hardCeilingMs) {
        devLog("discuss", "sse-tail-hard-ceiling", { turnId });
        writeTerminal({
          type: "error",
          errorText: HARD_CEILING_ERROR,
        });
        return;
      }
      try {
        const state = await isTerminalDb();
        if (settled) {
          return;
        }
        if (state.kind === "running") {
          return;
        }
        if (state.kind === "succeeded") {
          devLog("discuss", "sse-tail-db-fallback", {
            turnId,
            kind: "succeeded",
          });
          writeTerminal({ type: "finish" });
          return;
        }
        if (state.kind === "missing") {
          devLog("discuss", "sse-tail-db-fallback", {
            turnId,
            kind: "missing",
          });
          writeTerminal({
            type: "error",
            errorText: "Obrolan tidak ditemukan. Coba kirim ulang ya.",
          });
          return;
        }
        devLog("discuss", "sse-tail-db-fallback", {
          turnId,
          kind: state.kind,
        });
        writeTerminal({
          type: "error",
          errorText: state.errorText,
        });
      } catch (error) {
        devLog("discuss", "sse-tail-poll-error", {
          turnId,
          error: error instanceof Error ? error.message : "unknown",
        });
      }
    })();
  }, pollIntervalMs);

  try {
    await tailDone;
  } finally {
    clearInterval(heartbeatTimer);
    clearInterval(pollTimer);
    unsubscribe();
  }
}
