import { type BuildProgressStep } from "@/components/projects/WorkspacePrimitives";
import {
  appendBuildProgressStep,
  completeBuildProgressSteps,
} from "@/lib/projects/build-progress-steps";

export type BuildStreamEvent = {
  type:
    "progress" | "operation" | "energy" | "energy_exhausted" | "done" | "error";
  [key: string]: unknown;
};

export type BuildStreamEventResult =
  | {
      kind: "progress";
      update: (current: BuildProgressStep[]) => BuildProgressStep[];
    }
  | { kind: "energy" }
  | { kind: "done" }
  | {
      kind: "error";
      update: (current: BuildProgressStep[]) => BuildProgressStep[];
    }
  | { kind: "ignored" };

const MAX_TRACKED_ATTEMPTS = 3;

/**
 * Tracks which channel `seq` values a client already rendered, per attempt.
 *
 * The POST /generate body reader and the late-joining EventSource both read the
 * same attempt channel, and `subscribeBuildProgress` replays the buffer from
 * index 0 on subscribe. Without this, every event published before the
 * EventSource connects is appended twice (one stale `done` row plus one live
 * `active` row with the same label).
 *
 * Keyed by `attemptId` rather than reset by the caller: a new attempt can start
 * without `startBuild` running at all (queue retry, unstuck path, reattach after
 * refresh), and those attempts restart `seq` at 0.
 *
 * Events without a `seq` pass through — the DB replay in
 * `api.projects.$id.attempts.$attemptId.stream.ts` never went through the
 * channel and is only ever served when the channel is already gone.
 */
export function createBuildStreamDeduper(): (
  event: BuildStreamEvent,
) => boolean {
  const seenByAttempt = new Map<string, Set<number>>();

  return (event) => {
    if (typeof event.seq !== "number") {
      return true;
    }

    const attemptId =
      typeof event.attemptId === "string" ? event.attemptId : "";
    let seen = seenByAttempt.get(attemptId);
    if (!seen) {
      seen = new Set<number>();
      seenByAttempt.set(attemptId, seen);
      // Map iterates in insertion order, so this drops the oldest attempts
      // first and keeps a long session from growing the map without bound.
      for (const oldest of seenByAttempt.keys()) {
        if (seenByAttempt.size <= MAX_TRACKED_ATTEMPTS) {
          break;
        }
        seenByAttempt.delete(oldest);
      }
    }

    if (seen.has(event.seq)) {
      return false;
    }
    seen.add(event.seq);
    return true;
  };
}

export function reduceBuildStreamEvent(
  event: BuildStreamEvent,
): BuildStreamEventResult {
  if (event.type === "progress" && typeof event.label === "string") {
    const label = event.label;
    const detail = typeof event.detail === "string" ? event.detail : "";
    return {
      kind: "progress",
      update: (current) =>
        appendBuildProgressStep(current, { detail, label, status: "active" }),
    };
  }

  if (event.type === "operation" && typeof event.title === "string") {
    const title = event.title;
    const detail =
      typeof event.path === "string"
        ? `${event.path} — ${
            typeof event.detail === "string" ? event.detail : "Operasi selesai."
          }`
        : typeof event.detail === "string"
          ? event.detail
          : "Operasi selesai.";
    return {
      kind: "progress",
      update: (current) =>
        appendBuildProgressStep(current, {
          detail,
          diff: event.diff as BuildProgressStep["diff"],
          durationMs:
            typeof event.durationMs === "number" ? event.durationMs : undefined,
          label: title,
          status: event.state === "failed" ? "error" : "done",
        }),
    };
  }

  if (event.type === "energy" && typeof event.remaining === "number") {
    return { kind: "energy" };
  }

  if (event.type === "energy_exhausted" && typeof event.message === "string") {
    const message = event.message;
    return {
      kind: "progress",
      update: (current) =>
        appendBuildProgressStep(current, {
          detail: message,
          label: "Energi habis",
          status: "done",
        }),
    };
  }

  if (event.type === "done") {
    return { kind: "done" };
  }

  if (event.type === "error") {
    const detail =
      typeof event.detail === "string"
        ? `Build berhenti sebelum tampilan website siap: ${event.detail}`
        : "Build berhenti sebelum tampilan website siap. Coba ulangi build.";
    return {
      kind: "error",
      update: (current) =>
        appendBuildProgressStep(current, {
          detail,
          label: "Build belum selesai",
          status: "error",
        }),
    };
  }

  return { kind: "ignored" };
}

export function completeBuildStreamProgress(
  current: BuildProgressStep[],
): BuildProgressStep[] {
  return completeBuildProgressSteps(current);
}
