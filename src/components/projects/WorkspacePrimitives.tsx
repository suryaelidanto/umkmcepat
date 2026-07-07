"use client";

import {
  Code2,
  ExternalLink,
  Globe2,
  Monitor,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Smartphone,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { type BriefQuestion, type WorkspaceCard } from "@/lib/projects/brief";
import { formatWorkspaceAnswerSelection } from "@/lib/projects/workspace-answer-format";

export type BuildTab = "preview" | "code";

export type WorkspaceAnswerPayload = {
  answer: string;
  question: string;
  questionId: BriefQuestion["id"];
  source: "custom" | "option";
};

export type BuildProgressStep = {
  detail: string;
  label: string;
  status?: "active" | "done" | "error";
};

export type WorkspaceRuntimeControl = {
  buildStatus?: string | null;
  canPublish?: boolean;
  deploymentStatus?: string | null;
  errorMessage?: string | null;
  isPublishing?: boolean;
  onPublish?: () => void;
  onRetryPreview?: () => void;
  publishedPath?: string | null;
};

export function WorkspaceTopBar({
  activeTab,
  setActiveTab,
  viewport,
  setViewport,
  chatCollapsed,
  openChatPanel,
  closeChatPanel,
  runtime,
}: {
  activeTab: BuildTab;
  setActiveTab: (tab: BuildTab) => void;
  viewport: "desktop" | "mobile";
  setViewport: (viewport: "desktop" | "mobile") => void;
  chatCollapsed: boolean;
  openChatPanel: () => void;
  closeChatPanel: () => void;
  runtime?: WorkspaceRuntimeControl;
}) {
  return (
    <div className="flex h-14 items-center justify-between gap-spacing-4 border-b border-surface-warm-white/10 bg-[#171715] px-spacing-4">
      <div className="flex min-w-0 items-center gap-spacing-3">
        <button
          type="button"
          onClick={chatCollapsed ? openChatPanel : closeChatPanel}
          className="rounded-radius-md border border-surface-warm-white/10 p-spacing-2 text-surface-warm-white/70 hover:bg-surface-warm-white/8 hover:text-surface-warm-white"
          aria-label={chatCollapsed ? "Buka chat" : "Tutup chat"}
        >
          {chatCollapsed ? (
            <PanelLeftOpen className="size-4" />
          ) : (
            <PanelLeftClose className="size-4" />
          )}
        </button>
        <div className="flex rounded-radius-md border border-surface-warm-white/10 bg-surface-warm-white/5 p-1 text-xs">
          <TabButton
            active={activeTab === "preview"}
            onClick={() => setActiveTab("preview")}
            icon={<Globe2 className="size-4" />}
          >
            Tampilan
          </TabButton>
          <TabButton
            active={activeTab === "code"}
            onClick={() => setActiveTab("code")}
            icon={<Code2 className="size-4" />}
          >
            Kode
          </TabButton>
        </div>
      </div>

      <div className="flex min-w-0 shrink-0 items-center gap-spacing-3">
        {runtime ? <RuntimeControl runtime={runtime} /> : null}

        {activeTab === "preview" ? (
          <div className="flex rounded-radius-md border border-surface-warm-white/10 bg-surface-warm-white/5 p-1 text-xs">
            <button
              type="button"
              onClick={() => setViewport("desktop")}
              className={`flex items-center gap-spacing-2 rounded-radius-md px-spacing-3 py-spacing-2 transition ${viewport === "desktop" ? "bg-surface-warm-white text-foreground-primary" : "text-surface-warm-white/58 hover:text-surface-warm-white"}`}
            >
              <Monitor className="size-4" aria-hidden="true" />
              Komputer
            </button>
            <button
              type="button"
              onClick={() => setViewport("mobile")}
              className={`flex items-center gap-spacing-2 rounded-radius-md px-spacing-3 py-spacing-2 transition ${viewport === "mobile" ? "bg-surface-warm-white text-foreground-primary" : "text-surface-warm-white/58 hover:text-surface-warm-white"}`}
            >
              <Smartphone className="size-4" aria-hidden="true" />
              HP
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-spacing-2 rounded-radius-md px-spacing-3 py-spacing-2 transition ${active ? "bg-surface-warm-white text-foreground-primary" : "text-surface-warm-white/58 hover:text-surface-warm-white"}`}
    >
      {icon}
      {children}
    </button>
  );
}

function RuntimeControl({ runtime }: { runtime: WorkspaceRuntimeControl }) {
  const status = getRuntimeLabel(runtime);
  const canRetry =
    runtime.deploymentStatus === "failed" ||
    runtime.deploymentStatus === "stopped";

  return (
    <div className="flex min-w-0 items-center gap-spacing-2">
      <span
        title={runtime.errorMessage || status.label}
        className={`inline-flex max-w-[13rem] items-center gap-spacing-2 truncate rounded-radius-md border px-spacing-3 py-spacing-2 text-xs ${status.className}`}
      >
        <span className={`size-2 shrink-0 rounded-full ${status.dot}`} />
        <span className="truncate">{status.label}</span>
      </span>

      {canRetry && runtime.onRetryPreview ? (
        <button
          type="button"
          onClick={runtime.onRetryPreview}
          className="rounded-radius-md border border-surface-warm-white/10 p-spacing-2 text-surface-warm-white/64 hover:bg-surface-warm-white/8 hover:text-surface-warm-white"
          aria-label="Muat ulang tampilan website"
          title="Muat ulang tampilan website"
        >
          <RefreshCw className="size-4" />
        </button>
      ) : null}

      {runtime.publishedPath ? (
        <a
          href={runtime.publishedPath}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-spacing-2 rounded-radius-md border border-surface-warm-white/10 px-spacing-3 py-spacing-2 text-xs text-surface-warm-white/70 hover:bg-surface-warm-white/8 hover:text-surface-warm-white"
        >
          <ExternalLink className="size-4" />
          Buka
        </a>
      ) : (
        <button
          type="button"
          disabled={!runtime.canPublish || runtime.isPublishing}
          onClick={runtime.onPublish}
          className="inline-flex items-center gap-spacing-2 rounded-radius-md border border-surface-warm-white/10 px-spacing-3 py-spacing-2 text-xs text-surface-warm-white/70 transition hover:bg-surface-warm-white/8 hover:text-surface-warm-white disabled:cursor-not-allowed disabled:opacity-35"
        >
          <Globe2 className="size-4" />
          {runtime.isPublishing ? "Menerbitkan..." : "Terbitkan"}
        </button>
      )}
    </div>
  );
}

function getRuntimeLabel(runtime: WorkspaceRuntimeControl) {
  if (runtime.errorMessage) {
    return {
      className: "border-[#ffb4a6]/24 bg-[#ffb4a6]/10 text-[#ffb4a6]",
      dot: "bg-[#ffb4a6]",
      label: "Runtime gagal",
    };
  }

  if (runtime.buildStatus === "queued") {
    return {
      className:
        "border-surface-warm-white/10 bg-surface-warm-white/[0.055] text-surface-warm-white/68",
      dot: "bg-surface-warm-white/52",
      label: "Build antre",
    };
  }

  if (runtime.buildStatus === "running" || runtime.buildStatus === "building") {
    return {
      className:
        "border-surface-warm-white/14 bg-surface-warm-white/[0.075] text-surface-warm-white/78",
      dot: "animate-pulse bg-surface-warm-white",
      label: "Build berjalan",
    };
  }

  if (runtime.buildStatus === "failed") {
    return {
      className: "border-[#ffb4a6]/24 bg-[#ffb4a6]/10 text-[#ffb4a6]",
      dot: "bg-[#ffb4a6]",
      label: "Build gagal",
    };
  }

  if (runtime.buildStatus === "canceled" || runtime.buildStatus === "stopped") {
    return {
      className:
        "border-surface-warm-white/10 bg-surface-warm-white/[0.045] text-surface-warm-white/58",
      dot: "bg-surface-warm-white/42",
      label: "Build dihentikan",
    };
  }

  if (runtime.deploymentStatus === "starting") {
    return {
      className:
        "border-surface-warm-white/14 bg-surface-warm-white/[0.075] text-surface-warm-white/78",
      dot: "animate-pulse bg-surface-warm-white",
      label: "Menyiapkan tampilan",
    };
  }

  if (runtime.deploymentStatus === "running") {
    return {
      className: "border-[#8ce99a]/24 bg-[#8ce99a]/10 text-[#c7f8cf]",
      dot: "bg-[#8ce99a]",
      label: "Tampilan aktif",
    };
  }

  if (runtime.deploymentStatus === "stopped") {
    return {
      className:
        "border-surface-warm-white/10 bg-surface-warm-white/[0.045] text-surface-warm-white/58",
      dot: "bg-surface-warm-white/42",
      label: "Tampilan belum aktif",
    };
  }

  if (runtime.deploymentStatus === "failed") {
    return {
      className: "border-[#ffb4a6]/24 bg-[#ffb4a6]/10 text-[#ffb4a6]",
      dot: "bg-[#ffb4a6]",
      label: "Runtime gagal",
    };
  }

  if (runtime.buildStatus === "succeeded" || runtime.buildStatus === "passed") {
    return {
      className:
        "border-surface-warm-white/10 bg-surface-warm-white/[0.055] text-surface-warm-white/68",
      dot: "bg-[#8ce99a]",
      label: "Website siap",
    };
  }

  return {
    className:
      "border-surface-warm-white/10 bg-surface-warm-white/[0.04] text-surface-warm-white/52",
    dot: "bg-surface-warm-white/32",
    label: "Belum dibuild",
  };
}

export function GeneratedPreviewFrame({
  onLoad,
  onRetry,
  projectId,
  reloadKey,
  viewport,
}: {
  onLoad?: () => void;
  onRetry?: () => void;
  projectId: string;
  reloadKey?: number;
  viewport: "desktop" | "mobile";
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [ready, setReady] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    setReady(false);
    setTimedOut(false);

    const timeout = window.setTimeout(() => {
      setTimedOut(true);
    }, 10_000);

    function handleMessage(event: MessageEvent) {
      if (event.source !== iframeRef.current?.contentWindow) {
        return;
      }

      if (event.data?.type !== "umkmcepat-preview-ready") {
        return;
      }

      setReady(true);
      setTimedOut(false);
      window.clearTimeout(timeout);
    }

    window.addEventListener("message", handleMessage);

    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("message", handleMessage);
    };
  }, [projectId, reloadKey]);

  return (
    <div className="relative flex h-full min-h-0 justify-center overflow-hidden bg-[#10100f]">
      <iframe
        ref={iframeRef}
        key={reloadKey}
        title="Tampilan website"
        src={`/api/projects/${projectId}/preview/`}
        onLoad={onLoad}
        sandbox="allow-scripts"
        className={`${viewport === "mobile" ? "max-w-[390px]" : "max-w-none"} h-full w-full border-0 bg-white`}
      />
      {timedOut && !ready ? (
        <div className="absolute inset-0">
          <PreviewIssueState
            title="Tampilan website belum siap"
            detail="Website belum selesai dimuat. Coba muat ulang tampilan, atau build ulang kalau masih kosong."
            onRetry={onRetry}
          />
        </div>
      ) : null}
    </div>
  );
}

export function PreviewIssueState({
  detail,
  onRetry,
  title,
}: {
  detail: string;
  onRetry?: () => void;
  title: string;
}) {
  return (
    <div className="grid min-h-full place-items-center bg-[#10100f] p-spacing-10 text-center">
      <div className="max-w-lg rounded-[24px] border border-[#ffb4a6]/20 bg-[#241d1a] px-spacing-7 py-spacing-7 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
        <div className="mx-auto grid size-11 place-items-center rounded-full border border-[#ffb4a6]/28 bg-[#ffb4a6]/10 text-[#ffb4a6]">
          <RefreshCw className="size-5" aria-hidden="true" />
        </div>
        <h2 className="mt-spacing-5 text-2xl font-semibold tracking-[-0.02em] text-surface-warm-white">
          {title}
        </h2>
        <p className="mx-auto mt-spacing-3 max-w-md text-sm leading-6 text-surface-warm-white/58">
          {detail}
        </p>
        {onRetry ? (
          <Button
            type="button"
            onClick={onRetry}
            className="mt-spacing-6 rounded-[12px] bg-surface-warm-white px-spacing-5 text-foreground-primary hover:bg-surface-warm-white/86"
          >
            Muat ulang tampilan
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function EmptyPreviewState() {
  return (
    <div className="grid min-h-full place-items-center bg-[#10100f] p-spacing-10 text-center">
      <div>
        <h2 className="text-3xl font-semibold tracking-[-0.05em] text-surface-warm-white">
          Belum ada tampilan website
        </h2>
        <p className="mx-auto mt-spacing-4 max-w-md text-sm leading-6 text-surface-warm-white/50">
          Tampilan website akan muncul setelah brief cukup jelas dan proses
          build selesai.
        </p>
      </div>
    </div>
  );
}

export function ModePill({
  mode,
  tone,
}: {
  mode: "Diskusi" | "Buat";
  tone: "idle" | "busy";
}) {
  return (
    <span className="inline-flex items-center gap-spacing-2 text-xs font-medium text-surface-warm-white/48">
      <span
        className={`h-px w-5 ${tone === "busy" ? "animate-pulse bg-surface-warm-white/70" : "bg-[#8ce99a]"}`}
      />
      Mode {mode}
    </span>
  );
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

  useEffect(() => {
    if (!isBuilding) {
      return;
    }

    const interval = window.setInterval(() => setNow(Date.now()), 1000);

    return () => window.clearInterval(interval);
  }, [isBuilding]);

  const elapsedSeconds = elapsedFrom
    ? Math.max(0, Math.floor((now - elapsedFrom) / 1000))
    : 0;
  const visibleSteps = steps.length
    ? steps
    : [
        {
          detail: "AI sedang membuka sesi build dan menyiapkan konteks proyek.",
          label: "Memulai build",
          status: "active" as const,
        },
      ];

  return (
    <div className="overflow-hidden rounded-[24px] border border-surface-warm-white/10 bg-[#20201d] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="flex items-center justify-between gap-spacing-4 border-b border-surface-warm-white/8 px-spacing-5 py-spacing-4">
        <div>
          <p className="text-sm font-semibold text-surface-warm-white">
            {isBuilding ? "Build sedang berjalan" : "Riwayat build terakhir"}
          </p>
          <p className="mt-spacing-1 text-xs text-surface-warm-white/46">
            {isBuilding
              ? "Tampilan website akan mengikuti hasil yang sudah berhasil dibaca."
              : "Langkah build terakhir sudah selesai."}
          </p>
        </div>
        <div className="rounded-full border border-surface-warm-white/10 bg-surface-warm-white/[0.055] px-spacing-3 py-spacing-2 text-xs tabular-nums text-surface-warm-white/68">
          {elapsedSeconds}s
        </div>
      </div>

      <div className="space-y-spacing-3 p-spacing-5">
        <AnimatePresence initial={false}>
          {visibleSteps.map((step, index) => {
            const status = step.status || "active";
            const isActive = status === "active";
            const isError = status === "error";

            return (
              <motion.div
                key={`${step.label}-${index}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
                className="flex gap-spacing-4 rounded-[18px] border border-surface-warm-white/8 bg-surface-warm-white/[0.035] p-spacing-4"
              >
                <div
                  className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-full border ${isError ? "border-[#ffb4a6]/40 bg-[#ffb4a6]/10 text-[#ffb4a6]" : isActive ? "border-surface-warm-white/18 bg-surface-warm-white/10 text-surface-warm-white" : "border-[#8ce99a]/30 bg-[#8ce99a]/10 text-[#8ce99a]"}`}
                >
                  <span
                    className={`block ${isActive ? "size-3 animate-pulse rounded-full bg-current" : "size-2 bg-current"}`}
                  />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-surface-warm-white">
                    {step.label}
                  </p>
                  <p className="mt-spacing-1 text-xs leading-5 text-surface-warm-white/54">
                    {step.detail}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

export function ProcessingControl({
  mode,
  onStop,
}: {
  mode: "Diskusi" | "Buat";
  onStop: () => void;
}) {
  const title = mode === "Buat" ? "Membuat website" : "Menyusun jawaban";
  const detail =
    mode === "Buat"
      ? "AI sedang menyiapkan file website dan tampilannya."
      : "AI sedang menyiapkan jawaban.";

  return (
    <div className="mt-spacing-3 overflow-hidden rounded-[22px] border border-surface-warm-white/10 bg-[#242421] shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
      <div className="flex items-center justify-between gap-spacing-4 px-spacing-5 py-spacing-4">
        <div className="flex min-w-0 items-center gap-spacing-4">
          <div className="grid size-10 shrink-0 place-items-center rounded-full border border-surface-warm-white/10 bg-surface-warm-white/[0.045]">
            <span className="size-4 animate-spin rounded-full border-2 border-surface-warm-white/18 border-t-surface-warm-white/78" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-spacing-2">
              <p className="text-sm font-semibold text-surface-warm-white">
                {title}
              </p>
              <ModePill mode={mode} tone="busy" />
            </div>
            <p className="mt-spacing-1 text-xs leading-5 text-surface-warm-white/50">
              {detail}
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={onStop}
          className="h-9 shrink-0 rounded-full border-surface-warm-white/12 bg-transparent px-spacing-4 text-xs text-surface-warm-white/82 hover:bg-surface-warm-white/8"
        >
          Hentikan
        </Button>
      </div>
    </div>
  );
}

export function QuestionComposer({
  question,
  onSubmit,
}: {
  question: BriefQuestion;
  onSubmit: (
    answer: string,
    workspaceAnswers?: WorkspaceAnswerPayload[],
  ) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [source, setSource] = useState<"custom" | "option">("option");
  const [customAnswer, setCustomAnswer] = useState("");
  const [customAnswerOpen, setCustomAnswerOpen] = useState(false);
  const isMultiple = question.selectionMode === "multiple";
  const modeTone = isMultiple
    ? {
        accent: "#8fd3ff",
        helper: "Pilih beberapa yang berlaku.",
        option: "border-surface-warm-white/8 hover:bg-[#8fd3ff]/[0.055]",
        selected: "border-[#8fd3ff]/24 bg-[#8fd3ff]/10",
      }
    : {
        accent: "#8ce99a",
        helper: "Pilih satu arah utama.",
        option:
          "border-surface-warm-white/8 hover:bg-surface-warm-white/[0.045]",
        selected: "border-[#8ce99a]/24 bg-[#8ce99a]/10",
      };
  const answer = formatWorkspaceAnswerSelection(question, selected, source);
  const customAnswerSelected = Boolean(selected.length) && source === "custom";
  const canSubmit = selected.length > 0;

  useEffect(() => {
    setSelected([]);
    setSource("option");
    setCustomAnswer("");
    setCustomAnswerOpen(false);
  }, [question.id]);

  function chooseAnswer(answer: string, nextSource: "custom" | "option") {
    setSource(nextSource);
    setSelected((current) => {
      if (nextSource === "custom" || !isMultiple) {
        return [answer];
      }

      return current.includes(answer)
        ? current.filter((item) => item !== answer)
        : [...current, answer];
    });
  }

  function useCustomAnswer() {
    const answer = customAnswer.trim();
    if (!answer) {
      return;
    }
    chooseAnswer(answer, "custom");
    setCustomAnswerOpen(false);
  }

  function submitAnswer() {
    if (!canSubmit) {
      return;
    }

    onSubmit(`${question.question}\nJawaban: ${answer}`, [
      {
        answer,
        question: question.question,
        questionId: question.id,
        source,
      },
    ]);
  }

  return (
    <div className="mt-spacing-3 overflow-hidden border-y border-surface-warm-white/10 bg-[#1d1d1a] shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
      <div className="border-b border-surface-warm-white/8 bg-[#20201d] px-spacing-5 py-spacing-4">
        <h2 className="max-w-3xl text-base font-semibold leading-6 text-surface-warm-white">
          {question.question}
        </h2>
        <p className="mt-spacing-2 max-w-2xl text-xs leading-5 text-surface-warm-white/50">
          {question.whyThisQuestionMatters || modeTone.helper}
        </p>
      </div>

      <div className="divide-y divide-surface-warm-white/8">
        {question.options.map((option) => {
          const isSelected =
            selected.includes(option.label) && source === "option";
          const isRecommended =
            question.recommendedOptionLabel === option.label;
          return (
            <button
              key={option.label}
              type="button"
              onClick={() => chooseAnswer(option.label, "option")}
              className={`group grid w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-spacing-4 border-b px-spacing-5 py-spacing-4 text-left transition last:border-b-0 ${isSelected ? modeTone.selected : modeTone.option}`}
            >
              <span className="min-w-0">
                <span className="block whitespace-normal break-words text-sm font-semibold text-surface-warm-white [overflow-wrap:anywhere]">
                  {option.label}
                </span>
                <span className="mt-spacing-1 block whitespace-normal break-words text-xs leading-5 text-surface-warm-white/54 [overflow-wrap:anywhere]">
                  {option.description}
                </span>
                {isRecommended ? (
                  <span className="mt-spacing-2 block text-[11px] font-medium text-[#c7f8cf]/82">
                    Rekomendasi paling aman
                  </span>
                ) : null}
              </span>
              <span
                className={`mt-1 grid size-4 shrink-0 place-items-center border transition ${isMultiple ? "rounded-[4px]" : "rounded-full"} ${isSelected ? "text-[#10100f]" : "border-surface-warm-white/24 group-hover:border-surface-warm-white/48"}`}
                style={
                  isSelected
                    ? {
                        backgroundColor: modeTone.accent,
                        borderColor: modeTone.accent,
                      }
                    : undefined
                }
              >
                {isSelected ? (
                  <span className="text-[10px] leading-none">
                    {isMultiple ? "✓" : "•"}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
        <div
          className={`px-spacing-5 py-spacing-4 transition ${customAnswerOpen || customAnswerSelected ? "bg-surface-warm-white/[0.075]" : "bg-transparent"}`}
        >
          {customAnswerOpen ? (
            <div className="space-y-spacing-3">
              <label
                htmlFor={`custom-answer-${question.id}`}
                className="text-xs font-medium text-surface-warm-white/58"
              >
                Jawaban sendiri untuk keputusan ini
              </label>
              <textarea
                id={`custom-answer-${question.id}`}
                rows={3}
                value={customAnswer}
                onChange={(event) => setCustomAnswer(event.target.value)}
                placeholder="Tulis jawabanmu sendiri..."
                className="w-full resize-none rounded-[14px] border border-surface-warm-white/10 bg-[#181817] px-spacing-4 py-spacing-3 text-sm leading-6 text-surface-warm-white outline-none placeholder:text-surface-warm-white/34 focus:border-surface-warm-white/28"
              />
              <div className="flex items-center justify-end gap-spacing-2">
                <button
                  type="button"
                  onClick={() => {
                    setCustomAnswerOpen(false);
                    setCustomAnswer("");
                  }}
                  className="rounded-full px-spacing-3 py-spacing-2 text-xs text-surface-warm-white/54 hover:bg-surface-warm-white/8"
                >
                  Batal
                </button>
                <Button
                  type="button"
                  disabled={!customAnswer.trim()}
                  onClick={useCustomAnswer}
                  className="h-9 rounded-full bg-surface-warm-white px-spacing-4 text-xs text-foreground-primary hover:bg-surface-warm-white/86 disabled:opacity-50"
                >
                  Pakai jawaban ini
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCustomAnswerOpen(true)}
              className="flex w-full items-center justify-between gap-spacing-4 text-left"
            >
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-surface-warm-white/84">
                  Jawaban sendiri
                </span>
                <span className="mt-spacing-1 block break-words text-xs leading-5 text-surface-warm-white/58 [overflow-wrap:anywhere]">
                  {customAnswerSelected
                    ? answer
                    : "Pakai ini kalau pilihan AI belum pas untuk keputusan ini."}
                </span>
              </span>
              <span className="shrink-0 border-b border-surface-warm-white/20 pb-0.5 text-xs text-surface-warm-white/56">
                Tulis
              </span>
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end border-t border-surface-warm-white/8 px-spacing-5 py-spacing-4">
        <Button
          type="button"
          disabled={!canSubmit}
          onClick={submitAnswer}
          className="rounded-full bg-surface-warm-white text-foreground-primary hover:bg-surface-warm-white/86 disabled:opacity-50"
        >
          Kirim jawaban
        </Button>
      </div>
    </div>
  );
}

export function WorkspaceCardView({
  card,
  onAction,
  onBuild,
  onDiscuss,
}: {
  card: WorkspaceCard;
  onAction?: (text: string) => void;
  onBuild: () => void;
  onDiscuss?: () => void;
}) {
  if (card.type === "none") {
    return null;
  }

  if (card.type === "brief_review") {
    return (
      <div className="border-y border-surface-warm-white/10 bg-[#1b1b18] px-spacing-5 py-spacing-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
        <div className="grid items-start gap-spacing-5 md:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-surface-warm-white/46">
              Ringkasan arah
            </p>
            <h2 className="mt-spacing-2 text-base font-semibold leading-6 text-surface-warm-white">
              {card.title}
            </h2>
            <ul className="mt-spacing-4 divide-y divide-surface-warm-white/8 text-sm leading-6 text-surface-warm-white/66">
              {card.summary.slice(0, 5).map((item, index) => (
                <li
                  key={`${item}-${index}`}
                  className="break-words py-spacing-3 first:pt-0 last:pb-0 [overflow-wrap:anywhere]"
                >
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-spacing-3 md:mt-spacing-6 md:flex-col md:items-stretch">
            {card.actions.map((action) => (
              <Button
                key={action.label}
                type="button"
                variant={
                  action.label.toLowerCase().includes("build")
                    ? "default"
                    : "outline"
                }
                onClick={() =>
                  action.label.toLowerCase().includes("build")
                    ? onBuild()
                    : onAction?.(action.prompt)
                }
                className={
                  action.label.toLowerCase().includes("build")
                    ? "h-10 rounded-[12px] bg-surface-warm-white px-spacing-5 text-sm text-foreground-primary hover:bg-surface-warm-white/86"
                    : "h-10 rounded-[12px] border-surface-warm-white/12 bg-transparent px-spacing-5 text-sm text-surface-warm-white/78 hover:bg-surface-warm-white/8"
                }
              >
                {action.label}
              </Button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (card.type === "build_recommendation") {
    return (
      <div className="border-y border-surface-warm-white/10 bg-[#1b1b18] px-spacing-5 py-spacing-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
        <div className="grid items-start gap-spacing-5 md:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-surface-warm-white/56">
              Rancangan build
            </p>
            <h2 className="mt-spacing-2 text-base font-semibold leading-6 text-surface-warm-white">
              {card.title}
            </h2>
            <ul className="mt-spacing-4 divide-y divide-surface-warm-white/8 text-sm leading-6 text-surface-warm-white/66">
              {card.summary.slice(0, 7).map((item, index) => (
                <li
                  key={`${item}-${index}`}
                  className="break-words py-spacing-3 first:pt-0 last:pb-0 [overflow-wrap:anywhere]"
                >
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-spacing-3 md:mt-spacing-6 md:flex-col md:items-stretch">
            <Button
              type="button"
              onClick={onBuild}
              className="rounded-[12px] bg-surface-warm-white px-spacing-5 text-foreground-primary hover:bg-surface-warm-white/86"
            >
              Mulai build
            </Button>
            {onDiscuss ? (
              <Button
                type="button"
                variant="outline"
                onClick={onDiscuss}
                className="rounded-[12px] border-surface-warm-white/12 bg-transparent px-spacing-5 text-surface-warm-white/78 hover:bg-surface-warm-white/8"
              >
                Lanjut diskusi dulu
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return null;
}
