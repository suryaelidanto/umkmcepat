"use client";

import { Check, ImagePlus, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  clearImageUploadDraft,
  imageUploadDraftKey,
  readImageUploadDraft,
  writeImageUploadDraft,
  type ImageUploadDraftItem,
} from "@/components/projects/chat/image-upload-draft";
import { Button } from "@/components/ui/button";
import { ImageLightbox } from "@/components/ui/image-lightbox";
import { ImageUploadThumb } from "@/components/ui/image-upload-thumb";
import {
  type BriefQuestion,
  type ImageUploadQuestion,
} from "@/lib/projects/brief";
import { imageUploadAnswerText } from "@/lib/projects/image-upload-copy";
import { uploadTempImageFile } from "@/lib/storage/uploads/temp-image-client";

export type WorkspaceAnswerPayload = {
  answer: string;
  question: string;
  questionId: BriefQuestion["id"];
  source: "custom" | "option";
  assetIds?: string[];
};

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
  const [customAnswer, setCustomAnswer] = useState("");
  const [customAnswerOpen, setCustomAnswerOpen] = useState(false);
  const isTextQuestion = question.answerMode === "text";
  const isMultiple = question.selectionMode === "multiple";
  const helperText = isMultiple
    ? "Pilih beberapa yang berlaku."
    : "Pilih satu arah utama.";
  const isCustomActive = customAnswerOpen && Boolean(customAnswer.trim());
  const customAnswerSelected =
    isCustomActive || (customAnswerOpen && selected.length === 0);

  const combinedSelections = isTextQuestion
    ? []
    : isMultiple
      ? Array.from(
          new Set([
            ...selected,
            ...(isCustomActive ? [customAnswer.trim()] : []),
          ]),
        )
      : isCustomActive
        ? [customAnswer.trim()]
        : selected;

  const answer = isTextQuestion
    ? customAnswer.trim()
    : combinedSelections.join("; ");

  const [isSubmitting, setIsSubmitting] = useState(false);
  // ponytail: synchronous lock against double-submit within the same tick.
  const submitLockRef = useRef(false);
  useEffect(() => {
    setIsSubmitting(false);
    submitLockRef.current = false;
  }, [question.id]);
  const canSubmit =
    !isSubmitting &&
    !submitLockRef.current &&
    (isTextQuestion ? Boolean(answer) : combinedSelections.length > 0);

  useEffect(() => {
    setSelected([]);
    setCustomAnswer("");
    setCustomAnswerOpen(false);
  }, [question.id]);

  function togglePresetOption(optionLabel: string) {
    if (!isMultiple) {
      setCustomAnswerOpen(false);
      setCustomAnswer("");
      setSelected([optionLabel]);
      return;
    }

    setSelected((current) =>
      current.includes(optionLabel)
        ? current.filter((item) => item !== optionLabel)
        : [...current, optionLabel],
    );
  }

  function toggleCustomAnswer() {
    if (customAnswerOpen) {
      setCustomAnswerOpen(false);
      setCustomAnswer("");
      if (!isMultiple) {
        setSelected([]);
      }
    } else {
      setCustomAnswerOpen(true);
      if (!isMultiple) {
        setSelected([]);
      }
    }
  }

  function submitAnswer() {
    if (!canSubmit) {
      return;
    }
    submitLockRef.current = true;
    setIsSubmitting(true);

    const resolvedSource = isTextQuestion
      ? "custom"
      : selected.length > 0 && isCustomActive
        ? "option"
        : isCustomActive
          ? "custom"
          : "option";

    onSubmit(`${question.question}\nJawaban: ${answer}`, [
      {
        answer,
        question: question.question,
        questionId: question.id,
        source: resolvedSource,
      },
    ]);
  }

  function skip() {
    if (isSubmitting || submitLockRef.current) {
      return;
    }
    submitLockRef.current = true;
    setIsSubmitting(true);
    onSubmit(`${question.question}\nJawaban: Lewati.`, [
      {
        answer: "Lewati.",
        question: question.question,
        questionId: question.id,
        source: "custom",
      },
    ]);
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-black/10 bg-white p-3.5 shadow-sm transition-colors duration-200 dark:border-white/15 dark:bg-[#282824] dark:shadow-[0_4px_20px_rgba(0,0,0,0.35)]">
      <div>
        <h2 className="max-w-3xl text-sm font-semibold leading-5 text-foreground dark:text-surface-warm-white">
          {question.question}
        </h2>
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground dark:text-surface-warm-white/60">
          {question.whyThisQuestionMatters ||
            (isTextQuestion
              ? "Tulis jawabannya di kolom khusus ini."
              : helperText)}
        </p>
      </div>

      <div className="mt-2.5 space-y-1.5">
        {isTextQuestion ? (
          <div>
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
              className="h-10 w-full rounded-xl border border-black/10 bg-[#f7f5ef] px-3.5 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-black/30 dark:border-white/15 dark:bg-[#1b1b18] dark:text-surface-warm-white dark:placeholder:text-surface-warm-white/40 dark:focus:border-white/40"
            />
          </div>
        ) : (
          question.options.map((option) => {
            const isSelected = selected.includes(option.label);
            const isRecommended =
              question.recommendedOptionLabel === option.label;
            return (
              <button
                key={option.label}
                type="button"
                onClick={() => togglePresetOption(option.label)}
                className={`group flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition cursor-pointer ${isSelected ? "border-primary/50 bg-primary/5 dark:border-white/30 dark:bg-white/10" : "border-black/10 bg-transparent hover:border-black/20 hover:bg-black/[0.02] dark:border-white/10 dark:hover:border-white/20 dark:hover:bg-white/[0.03]"}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-foreground dark:text-surface-warm-white">
                      {option.label}
                    </span>
                    {isRecommended ? (
                      <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-1.5 py-0.2 text-[10px] font-medium text-emerald-600 dark:text-[#c7f8cf]/90">
                        Rekomendasi
                      </span>
                    ) : null}
                  </div>
                  {option.description ? (
                    <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground dark:text-surface-warm-white/54">
                      {option.description}
                    </p>
                  ) : null}
                </div>
                <span
                  className={`grid size-4 shrink-0 place-items-center border transition ${isMultiple ? "rounded" : "rounded-full"} ${isSelected ? (isMultiple ? "border-primary bg-primary text-primary-foreground dark:border-[#8ce99a] dark:bg-[#8ce99a]" : "border-primary bg-transparent dark:border-[#8ce99a]") : "border-black/30 bg-black/[0.02] group-hover:border-black/60 dark:border-surface-warm-white/24 dark:bg-transparent dark:group-hover:border-surface-warm-white/48"}`}
                >
                  {isSelected ? (
                    isMultiple ? (
                      <Check
                        className="size-2.5 text-primary-foreground dark:text-[#10100f]"
                        strokeWidth={3}
                      />
                    ) : (
                      <span className="size-2 rounded-full bg-primary dark:bg-[#8ce99a]" />
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
            onClick={toggleCustomAnswer}
            className={`group flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition cursor-pointer ${customAnswerSelected ? "border-primary/50 bg-primary/5 dark:border-white/30 dark:bg-white/10" : "border-black/10 bg-transparent hover:border-black/20 hover:bg-black/[0.02] dark:border-white/10 dark:hover:border-white/20 dark:hover:bg-white/[0.03]"}`}
          >
            <div className="min-w-0 flex-1">
              <span className="text-xs font-semibold text-foreground dark:text-surface-warm-white">
                Sebutkan sendiri
              </span>
              <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground dark:text-surface-warm-white/54">
                {customAnswer.trim()
                  ? customAnswer.trim()
                  : "Pakai ini kalau pilihan di atas belum pas."}
              </p>
            </div>
            <span
              className={`grid size-4 shrink-0 place-items-center border transition ${isMultiple ? "rounded" : "rounded-full"} ${customAnswerSelected ? (isMultiple ? "border-primary bg-primary text-primary-foreground dark:border-[#8ce99a] dark:bg-[#8ce99a]" : "border-primary bg-transparent dark:border-[#8ce99a]") : "border-black/30 bg-black/[0.02] group-hover:border-black/60 dark:border-surface-warm-white/24 dark:bg-transparent dark:group-hover:border-surface-warm-white/48"}`}
            >
              {customAnswerSelected ? (
                isMultiple ? (
                  <Check
                    className="size-2.5 text-primary-foreground dark:text-[#10100f]"
                    strokeWidth={3}
                  />
                ) : (
                  <span className="size-2 rounded-full bg-primary dark:bg-[#8ce99a]" />
                )
              ) : null}
            </span>
          </button>
        ) : null}

        {!isTextQuestion && customAnswerOpen ? (
          <div className="rounded-lg border border-black/15 bg-transparent p-2.5 dark:border-white/15">
            <button
              type="button"
              onClick={toggleCustomAnswer}
              className="flex w-full items-center justify-between gap-3 text-left cursor-pointer group"
            >
              <div className="min-w-0 flex-1">
                <span className="text-xs font-semibold text-foreground dark:text-surface-warm-white">
                  Sebutkan sendiri
                </span>
                <p className="text-[11px] text-muted-foreground dark:text-surface-warm-white/54">
                  {customAnswer.trim() || "Tulis jawabanmu sendiri..."}
                </p>
              </div>
              <span
                className={`grid size-4 shrink-0 place-items-center border transition ${isMultiple ? "rounded" : "rounded-full"} ${customAnswerSelected ? (isMultiple ? "border-primary bg-primary text-primary-foreground dark:border-[#8ce99a] dark:bg-[#8ce99a]" : "border-primary bg-transparent dark:border-[#8ce99a]") : "border-black/30 bg-black/[0.02] dark:border-surface-warm-white/24 dark:bg-transparent"}`}
              >
                {customAnswerSelected ? (
                  isMultiple ? (
                    <Check
                      className="size-2.5 text-primary-foreground dark:text-[#10100f]"
                      strokeWidth={3}
                    />
                  ) : (
                    <span className="size-2 rounded-full bg-primary dark:bg-[#8ce99a]" />
                  )
                ) : null}
              </span>
            </button>
            <textarea
              id={`custom-answer-${question.id}`}
              rows={2}
              autoFocus
              value={customAnswer}
              maxLength={16000}
              onChange={(event) => setCustomAnswer(event.target.value)}
              placeholder="Tulis jawabanmu sendiri..."
              className="mt-2 w-full resize-none rounded-md border border-black/15 bg-transparent p-2 text-xs leading-5 text-foreground outline-none placeholder:text-muted-foreground focus:border-black/40 dark:border-white/15 dark:text-surface-warm-white dark:placeholder:text-surface-warm-white/34 dark:focus:border-white/40"
            />
          </div>
        ) : null}
      </div>

      <div className="mt-3 flex items-center justify-end gap-2">
        {!question.required ? (
          <button
            type="button"
            disabled={isSubmitting}
            onClick={skip}
            className="inline-flex h-8 items-center justify-center rounded-lg border border-black/15 bg-transparent px-3 text-xs font-medium text-muted-foreground transition hover:bg-black/5 hover:text-foreground active:scale-95 disabled:pointer-events-none disabled:opacity-50 dark:border-white/15 dark:hover:bg-white/10 dark:hover:text-surface-warm-white cursor-pointer"
          >
            Lewati
          </button>
        ) : null}
        <Button
          type="button"
          disabled={!canSubmit || isSubmitting}
          onClick={submitAnswer}
          className="h-8 rounded-lg bg-[#1c1c1c] px-4 text-xs font-semibold text-white shadow-2xs transition hover:bg-black active:scale-95 disabled:cursor-not-allowed disabled:bg-black/10 disabled:text-black/30 dark:bg-surface-warm-white dark:text-[#141413] dark:hover:bg-white dark:disabled:bg-white/10 dark:disabled:text-white/30 cursor-pointer flex items-center gap-1.5"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              <span>Mengirim...</span>
            </>
          ) : (
            <span>Kirim jawaban</span>
          )}
        </Button>
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
  projectId,
  onSubmit,
}: {
  imageUpload: ImageUploadQuestion;
  projectId: string;
  onSubmit: (
    answer: string,
    workspaceAnswers?: WorkspaceAnswerPayload[],
    uploads?: PendingImageUpload[],
  ) => void;
}) {
  const draftKey = imageUploadDraftKey(projectId, imageUpload.id);
  const [uploads, setUploads] = useState<ImageUploadDraftItem[]>(() =>
    readImageUploadDraft(window.localStorage, draftKey),
  );
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
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

  useEffect(() => {
    // Picked-but-unsent images survive a refresh within the temp-upload TTL.
    writeImageUploadDraft(window.localStorage, draftKey, uploads);
  }, [draftKey, uploads]);

  async function handleFiles(files: FileList | File[] | null) {
    if (!files) {
      return;
    }
    const list = Array.from(files).filter((file) =>
      file.type.startsWith("image/"),
    );
    if (list.length === 0) {
      setError("Hanya format gambar yang didukung (PNG, JPEG, WEBP).");
      return;
    }
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

  function handleDragOver(event: React.DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (!uploading && uploads.length < max) {
      setIsDragging(true);
    }
  }

  function handleDragLeave(event: React.DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    if (uploading || uploads.length >= max) {
      return;
    }
    void handleFiles(event.dataTransfer.files);
  }

  function handlePaste(event: React.ClipboardEvent) {
    const items = Array.from(event.clipboardData.items);
    const imageFiles: File[] = [];
    for (const item of items) {
      if (item.kind === "file" && item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          imageFiles.push(file);
        }
      }
    }
    if (imageFiles.length > 0) {
      event.preventDefault();
      void handleFiles(imageFiles);
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
    const submitted = [...uploads];
    clearImageUploadDraft(window.localStorage, draftKey);
    setUploads([]);
    onSubmit(
      imageUploadAnswerText(submitted.length),
      [
        {
          answer: imageUploadAnswerText(submitted.length),
          question: imageUpload.question,
          questionId: imageUpload.id,
          source: "custom",
          assetIds: submitted.map((item) => item.assetId),
        },
      ],
      submitted,
    );
  }

  function skip() {
    if (isSubmitting || submitLockRef.current) {
      return;
    }
    submitLockRef.current = true;
    setIsSubmitting(true);
    clearImageUploadDraft(window.localStorage, draftKey);
    setUploads([]);
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
    <div
      onPaste={handlePaste}
      className="overflow-hidden rounded-2xl border border-black/10 bg-white p-3.5 shadow-sm transition-colors duration-200 dark:border-white/15 dark:bg-[#282824] dark:shadow-[0_4px_20px_rgba(0,0,0,0.35)]"
    >
      <div>
        <h2 className="max-w-3xl text-sm font-semibold leading-5 text-foreground dark:text-surface-warm-white">
          {imageUpload.question}
        </h2>
        {imageUpload.hint ? (
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground dark:text-surface-warm-white/60">
            {imageUpload.hint}
          </p>
        ) : (
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground dark:text-surface-warm-white/60">
            {isMultiple
              ? "Unggah beberapa gambar (maksimal 6)."
              : "Unggah 1 gambar."}
          </p>
        )}
      </div>

      <div className="mt-3">
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
          onDragOver={handleDragOver}
          onDragEnter={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          disabled={uploading || uploads.length >= max}
          className={`flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed p-4 text-xs transition cursor-pointer ${
            isDragging
              ? "border-primary bg-primary/5 text-primary scale-[1.01] dark:border-white/60 dark:bg-white/10 dark:text-surface-warm-white"
              : "border-black/20 bg-transparent text-muted-foreground hover:bg-black/[0.02] hover:border-black/30 dark:border-white/20 dark:text-surface-warm-white/70 dark:hover:bg-white/[0.02] dark:hover:border-white/30"
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {uploading ? (
            <>
              <Loader2 aria-hidden className="size-5 animate-spin" />
              <span className="font-medium">Mengunggah gambar...</span>
            </>
          ) : (
            <>
              <ImagePlus
                aria-hidden
                className={`size-5 ${isDragging ? "text-primary dark:text-white" : ""}`}
              />
              <span className="font-medium text-foreground dark:text-surface-warm-white">
                {isDragging
                  ? "Lepaskan gambar di sini..."
                  : uploads.length >= max
                    ? `Sudah mencapai batas maksimal ${max} gambar`
                    : "Tarik & lepas gambar ke sini, atau klik untuk memilih"}
              </span>
              <span className="text-[11px] text-muted-foreground dark:text-surface-warm-white/50">
                {isMultiple
                  ? "PNG, JPEG, WEBP • Bisa pilih banyak sekaligus"
                  : "PNG, JPEG, WEBP • Maksimal 5 MB"}
              </span>
            </>
          )}
        </button>
        {error ? (
          <p className="mt-2 text-xs text-destructive">{error}</p>
        ) : null}

        {uploads.length > 0 ? (
          <div className="mt-2.5 flex flex-wrap gap-2">
            {uploads.map((item, idx) => (
              <ImageUploadThumb
                key={item.assetId}
                src={item.url}
                alt="Gambar yang diunggah"
                onClick={() => {
                  setLightboxIndex(idx);
                  setLightboxOpen(true);
                }}
                onRemove={() => removeUpload(item.assetId)}
                className="size-20 rounded-xl cursor-pointer"
              />
            ))}
          </div>
        ) : null}

        <ImageLightbox
          open={lightboxOpen}
          onOpenChange={setLightboxOpen}
          images={uploads.map((u, i) => ({
            src: u.url,
            alt: `Gambar ${i + 1}`,
          }))}
          initialIndex={lightboxIndex}
        />
      </div>

      <div className="mt-3 flex items-center justify-between gap-spacing-3">
        <Button
          type="button"
          onClick={skip}
          disabled={isSubmitting}
          variant="outline"
          size="sm"
          className="h-8 rounded-lg border-black/15 bg-white px-3 text-xs font-medium text-foreground hover:bg-black/5 hover:text-foreground dark:border-white/15 dark:bg-white/5 dark:hover:bg-white/10 cursor-pointer"
        >
          Lewati
        </Button>
        <div className="flex items-center gap-spacing-2">
          <Button
            type="button"
            disabled={!canSubmit || isSubmitting}
            onClick={submitAnswer}
            className="h-8 rounded-lg bg-[#1c1c1c] px-4 text-xs font-semibold text-white shadow-2xs transition hover:bg-black active:scale-95 disabled:cursor-not-allowed disabled:bg-black/10 disabled:text-black/30 dark:bg-surface-warm-white dark:text-[#141413] dark:hover:bg-white dark:disabled:bg-white/10 dark:disabled:text-white/30 cursor-pointer flex items-center gap-1.5"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                <span>Mengunggah...</span>
              </>
            ) : (
              <span>Kirim gambar</span>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
