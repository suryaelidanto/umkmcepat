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
