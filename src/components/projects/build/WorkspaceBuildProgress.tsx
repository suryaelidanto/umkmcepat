"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { type DiffLine } from "@/lib/projects/diff";

export type BuildProgressStep = {
  detail: string;
  diff?: DiffLine[];
  durationMs?: number;
  label: string;
  startedAt?: number;
  status?: "active" | "done" | "error";
};

function StepDuration({
  durationMs,
  isActive,
  now,
  startedAt,
}: {
  durationMs?: number;
  isActive: boolean;
  now: number;
  startedAt?: number;
}) {
  if (isActive && startedAt) {
    const liveSec = Math.max(0, (now - startedAt) / 1000);
    return (
      <span className="text-xs font-medium tabular-nums text-muted-foreground">
        {liveSec.toFixed(1)}s
      </span>
    );
  }

  if (durationMs !== undefined) {
    if (durationMs < 100) {
      return null;
    }
    if (durationMs < 1000) {
      return (
        <span className="text-xs font-medium tabular-nums text-muted-foreground">
          {durationMs}ms
        </span>
      );
    }
    return (
      <span className="text-xs font-medium tabular-nums text-muted-foreground">
        {(durationMs / 1000).toFixed(1)}s
      </span>
    );
  }

  return null;
}

export function BuildProgressPanel({
  elapsedFrom,
  isBuilding,
  steps,
}: {
  elapsedFrom: number | null;
  isBuilding: boolean;
  steps: BuildProgressStep[];
}) {
  const [now, setNow] = useState(() => Date.now());
  const [userToggles, setUserToggles] = useState<Record<string, boolean>>({});

  const hasActiveStep = steps.some(
    (step) => (step.status || "active") === "active",
  );
  const isRunning = isBuilding || hasActiveStep;
  const completedStepCount = steps.filter(
    (step) => (step.status ?? "active") === "done",
  ).length;

  useEffect(() => {
    if (!isRunning) {
      return;
    }

    setNow(Date.now());
    const interval = window.setInterval(() => setNow(Date.now()), 100);

    return () => window.clearInterval(interval);
  }, [isRunning]);

  const elapsedSeconds = elapsedFrom
    ? Math.max(0, Math.floor((now - elapsedFrom) / 1000))
    : 0;
  const visibleSteps = steps.length
    ? steps
    : [
        {
          detail: "Setiap bagian akan muncul saat selesai.",
          label: "Menyiapkan website",
          status: "active" as const,
        },
      ];

  return (
    <div className="overflow-hidden rounded-[24px] border border-border bg-card shadow-xs">
      <div className="flex items-center justify-between gap-spacing-4 border-b border-border px-spacing-5 py-spacing-4">
        <div>
          <p className="text-sm font-semibold text-foreground">
            {isRunning ? "Website sedang dibuat" : "Riwayat pembuatan terakhir"}
          </p>
          <p className="mt-spacing-1 text-xs text-muted-foreground">
            {isRunning
              ? "Setiap bagian akan muncul saat selesai."
              : "Langkah pembuatan terakhir sudah selesai."}
          </p>
          {isRunning && completedStepCount > 0 ? (
            <p className="mt-spacing-2 text-xs font-medium text-foreground">
              {completedStepCount} bagian sudah selesai
            </p>
          ) : null}
        </div>
        <div className="rounded-full border border-border bg-muted/60 px-spacing-3 py-spacing-2 text-xs tabular-nums text-muted-foreground">
          {elapsedSeconds}s
        </div>
      </div>

      <div className="space-y-spacing-3 p-spacing-5">
        <AnimatePresence initial={false}>
          {visibleSteps.map((step, index) => {
            const status = step.status || "active";
            const isActive = status === "active";
            const isError = status === "error";
            const hasDiff = Boolean(step.diff && step.diff.length > 0);

            const stepKey = `${step.label}-${index}`;
            const defaultExpanded = isActive || isError;
            const isExpanded =
              !hasDiff ||
              (userToggles[stepKey] !== undefined
                ? userToggles[stepKey]
                : defaultExpanded);

            const toggleExpand = () => {
              if (!hasDiff) {
                return;
              }
              setUserToggles((prev) => ({
                ...prev,
                [stepKey]: !isExpanded,
              }));
            };

            return (
              <motion.div
                key={stepKey}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
                role={hasDiff ? "button" : undefined}
                tabIndex={hasDiff ? 0 : undefined}
                onClick={hasDiff ? toggleExpand : undefined}
                onKeyDown={
                  hasDiff
                    ? (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          toggleExpand();
                        }
                      }
                    : undefined
                }
                aria-expanded={hasDiff ? isExpanded : undefined}
                className={`flex flex-col rounded-[18px] border border-border/70 bg-card p-spacing-4 select-none ${hasDiff ? "cursor-pointer hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" : ""}`}
              >
                <div className="flex items-start justify-between gap-spacing-3 w-full">
                  <div className="flex items-start gap-spacing-4 min-w-0 flex-1">
                    <div
                      className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-full border ${isError ? "border-destructive/40 bg-destructive/10 text-destructive" : isActive ? "border-primary/40 bg-primary/10 text-primary" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"}`}
                    >
                      <span
                        className={`block ${isActive ? "size-3 animate-pulse rounded-full bg-current" : "size-2 bg-current"}`}
                      />
                    </div>
                    <span className="text-sm text-foreground text-left pt-1 leading-5 min-w-0">
                      <span className="font-semibold">{step.label}</span>
                      {step.detail && step.detail !== step.label ? (
                        <span className="font-normal text-muted-foreground">
                          {" "}
                          — {step.detail}
                        </span>
                      ) : null}
                    </span>
                  </div>
                  <div className="flex items-center gap-spacing-2 shrink-0 mt-1.5">
                    <StepDuration
                      durationMs={step.durationMs}
                      isActive={isActive}
                      now={now}
                      startedAt={step.startedAt}
                    />
                    {hasDiff && (
                      <div className="text-muted-foreground">
                        {isExpanded ? (
                          <ChevronUp className="size-4" />
                        ) : (
                          <ChevronDown className="size-4" />
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <AnimatePresence initial={false}>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: "easeInOut" }}
                      className="overflow-hidden"
                    >
                      <div className="pl-12 pt-spacing-2 text-left">
                        {step.diff && step.diff.length > 0 && (
                          <div className="mt-spacing-3">
                            <pre className="max-h-64 overflow-auto rounded-[12px] border border-border bg-muted/60 p-spacing-3 font-mono text-xs leading-5 text-foreground [scrollbar-width:thin] dark:bg-black/40">
                              {step.diff.map((line, lineIndex) => (
                                <div
                                  key={lineIndex}
                                  className={
                                    line.type === "add"
                                      ? "bg-emerald-500/15 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                                      : line.type === "delete"
                                        ? "bg-rose-500/15 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300"
                                        : "text-muted-foreground"
                                  }
                                >
                                  {line.type === "add"
                                    ? "+ "
                                    : line.type === "delete"
                                      ? "- "
                                      : "  "}
                                  {line.text}
                                </div>
                              ))}
                            </pre>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

export function ProcessingControl({
  currentStep,
  mode,
  discussPhase,
  onStop,
}: {
  /** Newest live build row; when present it replaces the generic build copy. */
  currentStep?: { detail?: string; label: string } | null;
  mode: "Diskusi" | "Buat";
  discussPhase?:
    | "streaming"
    | "preparing_card"
    | "preparing_options"
    | "retrying_response"
    | "retrying_card"
    | "processing";
  onStop: () => void;
}) {
  const discussTitles: Record<NonNullable<typeof discussPhase>, string> = {
    streaming: "AI sedang menulis...",
    preparing_options: "Menyiapkan pilihan...",
    preparing_card: "Menyiapkan pertanyaan...",
    retrying_response: "Menyempurnakan balasan...",
    retrying_card: "Menata ulang pilihan...",
    processing: "AI sedang merespons...",
  };
  const discussDetails: Record<NonNullable<typeof discussPhase>, string> = {
    streaming: "Teks sedang diketik di atas.",
    preparing_options: "Menyiapkan opsi jawaban untukmu.",
    preparing_card: "Tunggu sebentar ya.",
    retrying_response: "Tunggu sebentar, AI sedang menyusun ulang.",
    retrying_card: "Sedang menyiapkan tombol pilihan.",
    processing: "Tunggu sebentar ya.",
  };

  const activeDiscussPhase = discussPhase ?? "processing";
  const fallbackTitle =
    mode === "Buat" ? "Membuat website" : discussTitles[activeDiscussPhase];
  const fallbackDetail =
    mode === "Buat"
      ? "Website sedang disiapkan."
      : discussDetails[activeDiscussPhase];
  const title =
    mode === "Buat" && currentStep?.label ? currentStep.label : fallbackTitle;
  const detail =
    mode === "Buat" && currentStep?.label
      ? currentStep.detail || fallbackDetail
      : fallbackDetail;

  return (
    <div className="mt-spacing-3 overflow-hidden rounded-[22px] border border-border bg-card shadow-xs">
      <div className="flex items-center justify-between gap-spacing-4 px-spacing-5 py-spacing-4">
        <div className="flex min-w-0 items-center gap-spacing-4">
          <div className="grid size-10 shrink-0 place-items-center rounded-full border border-border bg-muted/60">
            <span className="size-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-spacing-2">
              <p className="text-sm font-semibold text-foreground">{title}</p>
            </div>
            <p className="mt-spacing-1 text-xs leading-5 text-muted-foreground">
              {detail}
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={onStop}
          className="h-9 shrink-0 rounded-full border-border bg-transparent px-spacing-4 text-xs text-foreground hover:bg-muted"
        >
          Hentikan
        </Button>
      </div>
    </div>
  );
}
