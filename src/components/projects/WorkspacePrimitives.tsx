"use client";

import {
  Code2,
  Globe2,
  Monitor,
  PanelLeftClose,
  PanelLeftOpen,
  Smartphone,
} from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { type BriefQuestion, type WorkspaceCard } from "@/lib/projects/brief";

export type BuildTab = "preview" | "code";

export type WorkspaceAnswerPayload = {
  answer: string;
  question: string;
  questionId: BriefQuestion["id"];
  source: "custom" | "option";
};

export function WorkspaceTopBar({
  activeTab,
  setActiveTab,
  viewport,
  setViewport,
  chatCollapsed,
  openChatPanel,
  closeChatPanel,
}: {
  activeTab: BuildTab;
  setActiveTab: (tab: BuildTab) => void;
  viewport: "desktop" | "mobile";
  setViewport: (viewport: "desktop" | "mobile") => void;
  chatCollapsed: boolean;
  openChatPanel: () => void;
  closeChatPanel: () => void;
}) {
  return (
    <div className="flex h-14 items-center justify-between gap-spacing-4 border-b border-surface-warm-white/10 bg-[#171715] px-spacing-4">
      <div className="flex items-center gap-spacing-3">
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
            Preview
          </TabButton>
          <TabButton
            active={activeTab === "code"}
            onClick={() => setActiveTab("code")}
            icon={<Code2 className="size-4" />}
          >
            Code
          </TabButton>
        </div>
      </div>

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

export function GeneratedPreviewFrame({
  projectId,
  viewport,
}: {
  projectId: string;
  viewport: "desktop" | "mobile";
}) {
  return (
    <div className="flex justify-center">
      <iframe
        title="Generated website preview"
        src={`/api/projects/${projectId}/preview/`}
        sandbox="allow-scripts"
        className={`${viewport === "mobile" ? "h-[760px] max-w-[390px]" : "h-[760px] max-w-6xl"} w-full border-0 bg-white`}
      />
    </div>
  );
}

export function EmptyPreviewState() {
  return (
    <div className="grid min-h-full place-items-center bg-[#10100f] p-spacing-10 text-center">
      <div>
        <h2 className="text-3xl font-semibold tracking-[-0.05em] text-surface-warm-white">
          Belum ada preview
        </h2>
        <p className="mx-auto mt-spacing-4 max-w-md text-sm leading-6 text-surface-warm-white/50">
          Preview akan muncul setelah brief cukup jelas dan proses build
          selesai.
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
    <span className="inline-flex items-center gap-spacing-2 rounded-full border border-surface-warm-white/10 bg-surface-warm-white/[0.055] px-spacing-3 py-spacing-2 text-xs font-medium text-surface-warm-white/58">
      <span
        className={`size-1.5 rounded-full ${tone === "busy" ? "animate-pulse bg-surface-warm-white/70" : "bg-[#8ce99a]"}`}
      />
      Mode {mode}
    </span>
  );
}

export function ProcessingControl({
  mode,
  onStop,
}: {
  mode: "Diskusi" | "Buat";
  onStop: () => void;
}) {
  const title = mode === "Buat" ? "Membangun preview" : "Menyusun jawaban";
  const detail =
    mode === "Buat"
      ? "AI sedang menyiapkan source dan preview proyek."
      : "Input ditutup sebentar supaya urutan diskusi tetap rapi.";

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

export function QuestionStepperComposer({
  card,
  hasError,
  isRefreshing,
  onRefresh,
  onSubmit,
}: {
  card: Extract<WorkspaceCard, { type: "questions" }>;
  hasError: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
  onSubmit: (
    answer: string,
    workspaceAnswers?: WorkspaceAnswerPayload[],
  ) => void;
}) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [answerSources, setAnswerSources] = useState<
    Record<string, "custom" | "option">
  >({});
  const [customAnswer, setCustomAnswer] = useState("");
  const [customAnswerOpen, setCustomAnswerOpen] = useState(false);
  const question = card.questions[Math.min(step, card.questions.length - 1)];
  const selectedAnswer = question ? answers[question.id] : "";
  const customAnswerSelected =
    Boolean(selectedAnswer) &&
    question !== undefined &&
    answerSources[question.id] === "custom";
  const isLastStep = step >= card.questions.length - 1;
  const canContinue = Boolean(selectedAnswer);

  useEffect(() => {
    setStep(0);
    setAnswers({});
    setAnswerSources({});
    setCustomAnswer("");
    setCustomAnswerOpen(false);
  }, [card]);

  useEffect(() => {
    setCustomAnswer("");
    setCustomAnswerOpen(false);
  }, [question?.id]);

  if (!question) {
    return null;
  }

  function chooseAnswer(answer: string, source: "custom" | "option") {
    setAnswers((value) => ({ ...value, [question.id]: answer }));
    setAnswerSources((value) => ({ ...value, [question.id]: source }));
  }

  function useCustomAnswer() {
    const answer = customAnswer.trim();
    if (!answer) {
      return;
    }
    chooseAnswer(answer, "custom");
    setCustomAnswerOpen(false);
  }

  function continueStep() {
    if (!canContinue) {
      return;
    }
    if (!isLastStep) {
      setStep((value) => value + 1);
      return;
    }

    const workspaceAnswers = card.questions.map((item) => ({
      answer: answers[item.id] || "",
      question: item.question,
      questionId: item.id,
      source: answerSources[item.id] || "custom",
    }));
    const text = card.questions
      .map(
        (item, index) =>
          `${index + 1}. ${item.question}\nJawaban: ${answers[item.id]}`,
      )
      .join("\n\n");
    onSubmit(text, workspaceAnswers as WorkspaceAnswerPayload[]);
  }

  return (
    <div className="mt-spacing-3 overflow-hidden rounded-[24px] border border-surface-warm-white/10 bg-[#242421] shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
      <div className="border-b border-surface-warm-white/8 px-spacing-5 py-spacing-4">
        <p className="text-xs font-medium text-surface-warm-white/56">
          Keputusan {step + 1} dari {card.questions.length}
        </p>
        <h2 className="mt-spacing-1 max-w-3xl text-base font-semibold leading-6 text-surface-warm-white">
          {question.question}
        </h2>
        {question.whyThisQuestionMatters ? (
          <p className="mt-spacing-2 max-w-2xl text-xs leading-5 text-surface-warm-white/52">
            {question.whyThisQuestionMatters}
          </p>
        ) : null}
        <div className="mt-spacing-4 grid grid-cols-[repeat(auto-fit,minmax(0,1fr))] gap-spacing-2">
          {card.questions.map((item) => (
            <div
              key={item.id}
              className={`h-1 rounded-full ${item.id === question.id ? "bg-surface-warm-white/72" : answers[item.id] ? "bg-[#8ce99a]/70" : "bg-surface-warm-white/10"}`}
            />
          ))}
        </div>
      </div>

      {question.options.length ? (
        <div className="grid gap-spacing-2 p-spacing-4 sm:grid-cols-2">
          {question.options.map((option) => {
            const isSelected = selectedAnswer === option.label;
            const isRecommended =
              question.recommendedOptionLabel === option.label;
            return (
              <button
                key={option.label}
                type="button"
                onClick={() => chooseAnswer(option.label, "option")}
                className={`rounded-[16px] border px-spacing-4 py-spacing-3 text-left transition ${isSelected ? "border-[#8ce99a]/55 bg-[#8ce99a]/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]" : "border-surface-warm-white/10 bg-[#1f1f1d] hover:border-surface-warm-white/24 hover:bg-surface-warm-white/[0.055]"}`}
              >
                <span className="flex items-center gap-spacing-2 text-sm font-semibold text-surface-warm-white">
                  {option.label}
                  {isRecommended ? (
                    <span className="rounded-full border border-[#8ce99a]/22 bg-[#8ce99a]/10 px-spacing-2 py-0.5 text-[10px] font-semibold text-[#c7f8cf]">
                      Saran AI
                    </span>
                  ) : null}
                </span>
                <span className="mt-spacing-1 block text-xs leading-5 text-surface-warm-white/54">
                  {option.description}
                </span>
              </button>
            );
          })}
          <div
            className={`rounded-[16px] border px-spacing-4 py-spacing-3 transition sm:col-span-2 ${customAnswerOpen || customAnswerSelected ? "border-[#8ce99a]/45 bg-[#8ce99a]/10" : "border-dashed border-surface-warm-white/14 bg-transparent"}`}
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
                <span>
                  <span className="block text-sm font-semibold text-surface-warm-white/84">
                    Jawaban sendiri
                  </span>
                  <span className="mt-spacing-1 block text-xs leading-5 text-surface-warm-white/58">
                    {customAnswerSelected
                      ? selectedAnswer
                      : "Pakai ini kalau pilihan AI belum pas untuk keputusan ini."}
                  </span>
                </span>
                <span className="rounded-full border border-surface-warm-white/10 px-spacing-3 py-spacing-1 text-xs text-surface-warm-white/56">
                  Tulis
                </span>
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-spacing-3 p-spacing-4 text-xs leading-5 text-surface-warm-white/54">
          <span>
            {hasError ? "Opsi belum siap." : "Menyiapkan opsi pilihan..."}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isRefreshing}
            onClick={onRefresh}
            className="h-8 rounded-full border-surface-warm-white/12 bg-transparent text-xs text-surface-warm-white/78 hover:bg-surface-warm-white/8"
          >
            {isRefreshing ? "Menyiapkan..." : "Generate opsi"}
          </Button>
        </div>
      )}

      <div className="flex items-center justify-between gap-spacing-3 border-t border-surface-warm-white/8 px-spacing-5 py-spacing-4">
        <button
          type="button"
          disabled={step === 0}
          onClick={() => setStep((value) => Math.max(0, value - 1))}
          className="rounded-full px-spacing-3 py-spacing-2 text-xs text-surface-warm-white/54 hover:bg-surface-warm-white/8 disabled:opacity-30"
        >
          Kembali
        </button>
        <Button
          type="button"
          disabled={!canContinue}
          onClick={continueStep}
          className="rounded-full bg-surface-warm-white text-foreground-primary hover:bg-surface-warm-white/86 disabled:opacity-50"
        >
          {isLastStep ? "Kirim jawaban" : "Lanjut"}
        </Button>
      </div>
    </div>
  );
}

export function WorkspaceCardView({
  card,
  onBuild,
}: {
  card: WorkspaceCard;
  hasError: boolean;
  isRefreshing: boolean;
  onAnswer: (answer: string) => void;
  onBuild: () => void;
  onRefresh: () => void;
}) {
  if (card.type === "none") {
    return null;
  }

  if (card.type === "build_recommendation") {
    return (
      <div className="rounded-[22px] border border-[#8ce99a]/30 bg-[#8ce99a]/10 p-spacing-5">
        <div className="flex items-center justify-between gap-spacing-4">
          <div>
            <p className="text-sm font-semibold text-surface-warm-white">
              {card.title}
            </p>
            <p className="mt-spacing-2 text-sm text-surface-warm-white/62">
              {card.summary.join(" · ")}
            </p>
          </div>
          <Button
            type="button"
            onClick={onBuild}
            className="shrink-0 rounded-full bg-surface-warm-white text-foreground-primary hover:bg-surface-warm-white/86"
          >
            Mulai build
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
