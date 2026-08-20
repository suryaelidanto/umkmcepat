import { type BuildProgressStep } from "@/components/projects/workspace/WorkspacePrimitives";
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
    const title = friendlyBuildProgressLabel(event.title);
    const operationDetail = friendlyBuildProgressDetail(
      typeof event.detail === "string" ? event.detail : "Operasi selesai.",
      typeof event.path === "string" ? event.path : undefined,
    );
    const detail =
      typeof event.path === "string"
        ? `${event.path} — ${operationDetail}`
        : operationDetail;
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
      typeof event.detail === "string" && event.detail.trim()
        ? `Website belum selesai: ${friendlyErrorDetail(event.detail)}`
        : "Website belum selesai. Coba buat ulang website.";
    return {
      kind: "error",
      update: (current) =>
        appendBuildProgressStep(current, {
          detail,
          label: "Website belum selesai",
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

export function friendlyBuildProgressLabel(label: string): string {
  const normalized = label.trim();
  if (/build.*(berhasil|succeed)/i.test(normalized)) {
    return "Website siap dilihat";
  }
  if (/build.*(gagal|fail|belum)/i.test(normalized)) {
    return "Website belum selesai";
  }
  if (/build.*(dihentikan|cancel)/i.test(normalized)) {
    return "Pembuatan dihentikan";
  }
  if (/build.*(mulai|dimulai|start)/i.test(normalized)) {
    return "Menyiapkan website";
  }
  if (/source.*(tersimpan|disimpan)/i.test(normalized)) {
    return "Bagian website tersimpan";
  }
  if (/source.*siap|source belum/i.test(normalized)) {
    return "Menyiapkan website";
  }
  if (/ai.*menulis|menulis.*source/i.test(normalized)) {
    return "Menulis bagian website";
  }
  if (/ai.*merevisi|merevisi.*source/i.test(normalized)) {
    return "Memperbarui website";
  }
  if (/ai.*memperbaiki.*build/i.test(normalized)) {
    return "Merapikan tampilan";
  }
  if (/\bbuild\b/i.test(normalized)) {
    return "Memeriksa website";
  }
  return normalized;
}

export function friendlyBuildProgressDetail(
  detail: string,
  path?: string,
): string {
  const normalized = detail.trim();
  const technical =
    /\b(build|writer|agent|worker|batched|compile|compilasi|source)\b/i.test(
      normalized,
    );
  if (!technical) {
    return normalized;
  }
  const prefix = path && normalized.startsWith(path) ? `${path} — ` : "";
  const friendly = /\b(build|compile|compilasi)\b/i.test(normalized)
    ? "Website sedang diperiksa."
    : /\bsource\b/i.test(normalized)
      ? "Bagian website tersimpan."
      : "Bagian website selesai ditulis.";
  return `${prefix}${friendly}`;
}

function friendlyErrorDetail(detail: string): string {
  return detail
    .replace(/\bbuild\b/gi, "pembuatan website")
    .replace(/\bsource\b/gi, "file website")
    .replace(/\bcompile\b/gi, "pemeriksaan kode")
    .replace(/\b(agent|worker|writer|batched)\b/gi, "proses website");
}
