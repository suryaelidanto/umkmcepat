"use client";

import { Check, ImagePlus, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { ImageUploadThumb } from "@/components/ui/image-upload-thumb";
import {
  type BriefQuestion,
  type ImageUploadQuestion,
} from "@/lib/projects/brief";
import { formatWorkspaceAnswerSelection } from "@/lib/projects/workspace-answer-format";
import { uploadTempImageFile } from "@/lib/uploads/temp-image-client";

export type WorkspaceAnswerPayload = {
  answer: string;
  question: string;
  questionId: BriefQuestion["id"];
  source: "custom" | "option";
  assetIds?: string[];
};

export function QuestionComposer({
  question,
  onClose,
  onSubmit,
}: {
  question: BriefQuestion;
  onClose?: () => void;
  onSubmit: (
    answer: string,
    workspaceAnswers?: WorkspaceAnswerPayload[],
  ) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [source, setSource] = useState<"custom" | "option">("option");
  const [customAnswer, setCustomAnswer] = useState("");
  const [customAnswerOpen, setCustomAnswerOpen] = useState(false);
  const isTextQuestion = question.answerMode === "text";
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
  const answer = isTextQuestion
    ? customAnswer.trim()
    : formatWorkspaceAnswerSelection(question, selected, source);
  const customAnswerSelected = source === "custom";
  const [isSubmitting, setIsSubmitting] = useState(false);
  // ponytail: synchronous lock against double-submit within the same tick.
  // `isSubmitting` state lags by one render; a ref flips instantly so a second
  // click on the same event loop pass is dropped before `onSubmit` fires twice.
  const submitLockRef = useRef(false);
  useEffect(() => {
    setIsSubmitting(false);
    submitLockRef.current = false;
  }, [question.id]);
  const canSubmit =
    !isSubmitting &&
    !submitLockRef.current &&
    (isTextQuestion ? Boolean(answer) : selected.length > 0);

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

  function submitAnswer() {
    if (!canSubmit) {
      return;
    }
    submitLockRef.current = true;
    setIsSubmitting(true);

    onSubmit(`${question.question}\nJawaban: ${answer}`, [
      {
        answer,
        question: question.question,
        questionId: question.id,
        source: isTextQuestion ? "custom" : source,
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
          {question.whyThisQuestionMatters ||
            (isTextQuestion
              ? "Tulis jawabannya di kolom khusus ini."
              : modeTone.helper)}
        </p>
      </div>

      <div className="divide-y divide-surface-warm-white/8">
        {isTextQuestion ? (
          <div className="px-spacing-5 py-spacing-4">
            <label htmlFor={`text-answer-${question.id}`} className="sr-only">
              {question.question}
            </label>
            <input
              id={`text-answer-${question.id}`}
              value={customAnswer}
              onChange={(event) => setCustomAnswer(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  submitAnswer();
                }
              }}
              placeholder={question.placeholder || "Tulis jawabanmu di sini..."}
              maxLength={16000}
              className="h-12 w-full rounded-[14px] border border-surface-warm-white/10 bg-[#181817] px-spacing-4 text-sm text-surface-warm-white outline-none placeholder:text-surface-warm-white/34 focus:border-surface-warm-white/28"
            />
          </div>
        ) : (
          question.options.map((option) => {
            const isSelected =
              selected.includes(option.label) && source === "option";
            const isRecommended =
              question.recommendedOptionLabel === option.label;
            return (
              <button
                key={option.label}
                type="button"
                onClick={() => {
                  chooseAnswer(option.label, "option");
                  if (!isMultiple) {
                    setCustomAnswerOpen(false);
                  }
                }}
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
                  className={`mt-1 grid size-5 shrink-0 place-items-center border-2 transition ${isMultiple ? "rounded-[4px]" : "rounded-full"} ${isSelected ? "" : "border-surface-warm-white/24 bg-transparent group-hover:border-surface-warm-white/48"}`}
                  style={
                    isSelected
                      ? {
                          backgroundColor: isMultiple
                            ? modeTone.accent
                            : "transparent",
                          borderColor: modeTone.accent,
                        }
                      : undefined
                  }
                >
                  {isSelected ? (
                    isMultiple ? (
                      <Check
                        className="size-3 text-[#10100f]"
                        strokeWidth={3}
                      />
                    ) : (
                      <span
                        className="size-2.5 rounded-full"
                        style={{ backgroundColor: modeTone.accent }}
                      />
                    )
                  ) : null}
                </span>
              </button>
            );
          })
        )}
        {!isTextQuestion && !customAnswerOpen ? (
          <button
            type="button"
            onClick={() => {
              setCustomAnswerOpen(true);
              setSource("custom");
              setSelected(customAnswer.trim() ? [customAnswer.trim()] : []);
            }}
            className={`group grid w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-spacing-4 border-b px-spacing-5 py-spacing-4 text-left transition last:border-b-0 ${customAnswerSelected ? modeTone.selected : modeTone.option}`}
          >
            <span className="min-w-0">
              <span className="block whitespace-normal break-words text-sm font-semibold text-surface-warm-white [overflow-wrap:anywhere]">
                Sebutkan sendiri
              </span>
              <span className="mt-spacing-1 block whitespace-normal break-words text-xs leading-5 text-surface-warm-white/54 [overflow-wrap:anywhere]">
                {customAnswerSelected
                  ? answer
                  : "Pakai ini kalau pilihan di atas belum pas."}
              </span>
            </span>
            <span
              className={`mt-1 grid size-5 shrink-0 place-items-center rounded-full border-2 transition ${customAnswerSelected ? "" : "border-surface-warm-white/24 bg-transparent group-hover:border-surface-warm-white/48"}`}
              style={
                customAnswerSelected
                  ? {
                      backgroundColor: isMultiple
                        ? modeTone.accent
                        : "transparent",
                      borderColor: modeTone.accent,
                    }
                  : undefined
              }
            >
              {customAnswerSelected ? (
                isMultiple ? (
                  <Check className="size-3 text-[#10100f]" strokeWidth={3} />
                ) : (
                  <span
                    className="size-2.5 rounded-full"
                    style={{ backgroundColor: modeTone.accent }}
                  />
                )
              ) : null}
            </span>
          </button>
        ) : null}

        {!isTextQuestion && customAnswerOpen ? (
          <div className="border-b px-spacing-5 py-spacing-4 last:border-b-0">
            <div className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-spacing-4">
              <button
                type="button"
                onClick={() => {
                  setCustomAnswerOpen(false);
                  setCustomAnswer("");
                  setSelected([]);
                  setSource("option");
                }}
                className="min-w-0 text-left"
              >
                <span className="block whitespace-normal break-words text-sm font-semibold text-surface-warm-white [overflow-wrap:anywhere]">
                  Sebutkan sendiri
                </span>
                <span className="mt-spacing-1 block text-xs text-surface-warm-white/54">
                  Tulis jawabanmu sendiri...
                </span>
              </button>
              <span
                className={`mt-1 grid size-5 shrink-0 place-items-center rounded-full border-2 transition ${customAnswerSelected ? "" : "border-surface-warm-white/24 bg-transparent"}`}
                style={
                  customAnswerSelected
                    ? {
                        backgroundColor: isMultiple
                          ? modeTone.accent
                          : "transparent",
                        borderColor: modeTone.accent,
                      }
                    : undefined
                }
              >
                {customAnswerSelected ? (
                  isMultiple ? (
                    <Check className="size-3 text-[#10100f]" strokeWidth={3} />
                  ) : (
                    <span
                      className="size-2.5 rounded-full"
                      style={{ backgroundColor: modeTone.accent }}
                    />
                  )
                ) : null}
              </span>
            </div>
            <textarea
              id={`custom-answer-${question.id}`}
              rows={3}
              autoFocus
              value={customAnswer}
              maxLength={16000}
              onChange={(event) => {
                setCustomAnswer(event.target.value);
                setSource("custom");
                setSelected(
                  event.target.value.trim() ? [event.target.value.trim()] : [],
                );
              }}
              placeholder="Tulis jawabanmu sendiri..."
              className="mt-spacing-3 w-full resize-none rounded-radius-md border border-surface-warm-white/10 bg-[#181817] px-spacing-4 py-spacing-3 text-sm leading-6 text-surface-warm-white outline-none placeholder:text-surface-warm-white/34 focus:border-surface-warm-white/28"
            />
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-spacing-3 border-t border-surface-warm-white/8 px-spacing-5 py-spacing-4">
        {onClose ? (
          <Button
            type="button"
            onClick={onClose}
            variant="outline"
            className="rounded-full border-surface-warm-white/12 bg-transparent text-surface-warm-white/70 hover:bg-surface-warm-white/8 hover:text-surface-warm-white"
          >
            Tulis bebas
          </Button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-spacing-2">
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
    </div>
  );
}

type PendingImageUpload = {
  assetId: string;
  url: string;
};

export function ImageUploadComposer({
  imageUpload,
  onClose,
  onSubmit,
}: {
  imageUpload: ImageUploadQuestion;
  onClose?: () => void;
  onSubmit: (
    answer: string,
    workspaceAnswers?: WorkspaceAnswerPayload[],
  ) => void;
}) {
  const [uploads, setUploads] = useState<PendingImageUpload[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitLockRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isMultiple = imageUpload.selectionMode === "multiple";
  const max = isMultiple ? 6 : 1;

  useEffect(() => {
    setIsSubmitting(false);
    submitLockRef.current = false;
  }, [imageUpload.id]);

  async function handleFiles(files: FileList | null) {
    if (!files) {
      return;
    }
    const list = Array.from(files);
    if (isMultiple && uploads.length + list.length > max) {
      setError(`Maksimal ${max} gambar.`);
      return;
    }
    setUploading(true);
    setError("");
    try {
      for (const file of list) {
        if (uploads.length >= max) {
          break;
        }
        const uploaded = await uploadTempImageFile(file);
        setUploads((current) => [...current, uploaded]);
      }
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Gagal unggah gambar.",
      );
    } finally {
      setUploading(false);
    }
  }

  function removeUpload(assetId: string) {
    setUploads((current) => current.filter((item) => item.assetId !== assetId));
  }

  const canSubmit =
    !isSubmitting && !submitLockRef.current && uploads.length > 0;

  function submitAnswer() {
    if (!canSubmit) {
      return;
    }
    submitLockRef.current = true;
    setIsSubmitting(true);
    onSubmit(
      uploads.length === 1
        ? "1 gambar diunggah."
        : `${uploads.length} gambar diunggah.`,
      [
        {
          answer: `${uploads.length} gambar diunggah.`,
          question: imageUpload.question,
          questionId: imageUpload.id,
          source: "custom",
          assetIds: uploads.map((item) => item.assetId),
        },
      ],
    );
  }

  function skip() {
    if (isSubmitting || submitLockRef.current) {
      return;
    }
    submitLockRef.current = true;
    setIsSubmitting(true);
    onSubmit("Lewati.", [
      {
        answer: "Lewati.",
        question: imageUpload.question,
        questionId: imageUpload.id,
        source: "custom",
      },
    ]);
  }

  return (
    <div className="mt-spacing-3 overflow-hidden border-y border-surface-warm-white/10 bg-[#1d1d1a] shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
      <div className="border-b border-surface-warm-white/8 bg-[#20201d] px-spacing-5 py-spacing-4">
        <h2 className="max-w-3xl text-base font-semibold leading-6 text-surface-warm-white">
          {imageUpload.question}
        </h2>
        {imageUpload.hint ? (
          <p className="mt-spacing-2 max-w-2xl text-xs leading-5 text-surface-warm-white/50">
            {imageUpload.hint}
          </p>
        ) : (
          <p className="mt-spacing-2 max-w-2xl text-xs leading-5 text-surface-warm-white/50">
            {isMultiple
              ? "Unggah beberapa gambar (maksimal 6)."
              : "Unggah 1 gambar."}
          </p>
        )}
      </div>

      <div className="px-spacing-5 py-spacing-4">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple={isMultiple}
          className="hidden"
          onChange={(event) => {
            void handleFiles(event.target.files);
            event.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || uploads.length >= max}
          className="flex w-full items-center justify-center gap-spacing-2 rounded-[14px] border border-dashed border-surface-warm-white/20 bg-[#181817] px-spacing-4 py-spacing-6 text-sm text-surface-warm-white/70 hover:bg-surface-warm-white/[0.03] disabled:opacity-50"
        >
          {uploading ? (
            <Loader2 aria-hidden className="size-4 animate-spin" />
          ) : (
            <ImagePlus aria-hidden className="size-4" />
          )}
          {uploading
            ? "Mengunggah..."
            : uploads.length >= max
              ? `Maksimal ${max} gambar`
              : "Pilih gambar (PNG, JPEG, WEBP)"}
        </button>
        {error ? (
          <p className="mt-spacing-2 text-xs text-red-300">{error}</p>
        ) : null}

        {uploads.length > 0 ? (
          <div className="mt-spacing-3 flex flex-wrap gap-spacing-2">
            {uploads.map((item) => (
              <ImageUploadThumb
                key={item.assetId}
                src={item.url}
                alt="Gambar yang diunggah"
                onRemove={() => removeUpload(item.assetId)}
                className="size-20"
              />
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-spacing-3 border-t border-surface-warm-white/8 px-spacing-5 py-spacing-4">
        <Button
          type="button"
          onClick={skip}
          disabled={isSubmitting}
          variant="outline"
          className="rounded-full border-surface-warm-white/12 bg-transparent text-surface-warm-white/70 hover:bg-surface-warm-white/8 hover:text-surface-warm-white"
        >
          Lewati
        </Button>
        <div className="flex items-center gap-spacing-2">
          {onClose ? (
            <Button
              type="button"
              onClick={onClose}
              variant="outline"
              className="rounded-full border-surface-warm-white/12 bg-transparent text-surface-warm-white/70 hover:bg-surface-warm-white/8 hover:text-surface-warm-white"
            >
              Tulis bebas
            </Button>
          ) : null}
          <Button
            type="button"
            disabled={!canSubmit}
            onClick={submitAnswer}
            className="rounded-full bg-surface-warm-white text-foreground-primary hover:bg-surface-warm-white/86 disabled:opacity-50"
          >
            Kirim gambar
          </Button>
        </div>
      </div>
    </div>
  );
}
