"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowUp, Loader2, Paperclip } from "lucide-react";
import {
  FormEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";

import { LoginConsentDialog } from "@/components/common/LoginConsentDialog";
import {
  ComposerAttachments,
  ComposerAttachButton,
} from "@/components/projects/chat/ComposerAttachments";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/auth/auth-client";
import { useFeatureFlag } from "@/lib/config/use-feature-flag";
import { useRouter } from "@/lib/navigation";
import {
  hasUploadingAttachments,
  removeAttachment,
  revokeAll,
  type PendingAttachment,
} from "@/lib/projects/composer-attachments";
import {
  createProjectDraft,
  parseProjectDraft,
  PROJECT_DRAFT_STORAGE_KEY,
} from "@/lib/projects/draft";
import {
  PROJECT_REQUEST_MAX_LENGTH,
  validateProjectRequest,
} from "@/lib/projects/input";
import { useProjectLimit } from "@/lib/projects/use-project-limit";
import {
  fetchWaitlistStatus,
  GATE_QUERY_OPTIONS,
  queryKeys,
  useCacheMutation,
} from "@/lib/query-client";
import { uploadTempImageFile } from "@/lib/storage/uploads/temp-image-client";

function getProjectCreateIdempotencyKey(prompt: string) {
  const draft = parseProjectDraft(
    window.localStorage.getItem(PROJECT_DRAFT_STORAGE_KEY),
  );

  if (draft?.prompt === prompt.trim() && draft.idempotencyKey) {
    return draft.idempotencyKey;
  }

  const idempotencyKey = crypto.randomUUID();
  const nextDraft = createProjectDraft(prompt, "discuss");

  if (nextDraft) {
    window.localStorage.setItem(
      PROJECT_DRAFT_STORAGE_KEY,
      JSON.stringify({ ...nextDraft, idempotencyKey }),
    );
  }

  return idempotencyKey;
}

const PROMPT_PLACEHOLDERS = [
  "Saya punya kedai kopi, mau tampilkan menu minuman favorit, lokasi cabang, dan jam buka...",
  "Tolong buatkan website barbershop saya, ada daftar paket potong rambut, harga, dan testimoni...",
  "Saya jualan fashion hijab dan gamis, butuh katalog produk terbaru, pilihan warna, dan info promo...",
  "Buatkan website jasa servis AC panggilan saya, ada daftar layanan, area jangkauan, dan info garansi...",
  "Saya usaha katering harian dan nasi box, mau ada paket menu mingguan dan rincian harga...",
];

export function HomePromptForm({
  onFocusChange,
}: {
  onFocusChange?: (focused: boolean) => void;
}) {
  const router = useRouter();
  const { overLimit } = useProjectLimit();
  const { status } = useSession();
  const [prompt, setPrompt] = useState("");
  const [loginOpen, setLoginOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const uploadsEnabled = useFeatureFlag("feature.composer_uploads_enabled");
  const hasAutoContinued = useRef(false);
  const isSubmittingRef = useRef(false);

  // Smooth clean typewriter placeholder
  const [placeholder, setPlaceholder] = useState("");
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (prompt) {
      if (placeholder) {
        setPlaceholder("");
      }
      return;
    }

    const currentPhrase = PROMPT_PLACEHOLDERS[phraseIndex];
    let delay = isDeleting ? 14 : 28;

    if (!isDeleting && placeholder === currentPhrase) {
      delay = 2600;
    } else if (isDeleting && placeholder === "") {
      delay = 400;
    }

    const timer = setTimeout(() => {
      if (!isDeleting) {
        if (placeholder === currentPhrase) {
          setIsDeleting(true);
        } else {
          setPlaceholder(currentPhrase.slice(0, placeholder.length + 1));
        }
      } else {
        if (placeholder === "") {
          setIsDeleting(false);
          setPhraseIndex((prev) => (prev + 1) % PROMPT_PLACEHOLDERS.length);
        } else {
          setPlaceholder(placeholder.slice(0, -1));
        }
      }
    }, delay);

    return () => clearTimeout(timer);
  }, [placeholder, isDeleting, phraseIndex, prompt]);

  // Waitlist gate: never show the create form to signed-in users who have not
  const waitlistQuery = useQuery({
    queryKey: queryKeys.waitlistStatus,
    queryFn: fetchWaitlistStatus,
    enabled: status === "authenticated",
    ...GATE_QUERY_OPTIONS,
  });
  const waitlisted =
    status === "authenticated" &&
    waitlistQuery.isSuccess &&
    waitlistQuery.data.status !== "approved";

  useEffect(() => {
    return () => {
      revokeAll(attachments);
    };
  }, [attachments]);

  useEffect(() => {
    const draft = parseProjectDraft(
      window.localStorage.getItem(PROJECT_DRAFT_STORAGE_KEY),
    );

    if (!draft) {
      return;
    }

    setPrompt((current) => current || draft.prompt);
  }, []);

  function saveDraft(continueAfterLogin = false) {
    const draft = createProjectDraft(
      prompt,
      "discuss",
      Date.now(),
      continueAfterLogin,
    );

    if (draft) {
      draft.idempotencyKey = getProjectCreateIdempotencyKey(draft.prompt);
    }

    if (!draft) {
      return;
    }

    window.localStorage.setItem(
      PROJECT_DRAFT_STORAGE_KEY,
      JSON.stringify(draft),
    );
  }

  const createMutation = useCacheMutation<
    { assetIds: string[]; id: string; path: string },
    string
  >({
    mutationFn: async (value) => {
      const idempotencyKey = getProjectCreateIdempotencyKey(value);
      const form = new FormData();
      form.append("prompt", value);
      form.append("mode", "discuss");
      form.append("idempotencyKey", idempotencyKey);
      for (const attachment of attachments) {
        if (attachment.assetId) {
          form.append("assetIds", attachment.assetId);
        }
      }

      const response = await fetch("/api/projects", {
        body: form,
        method: "POST",
      });

      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.toLowerCase().includes("application/json")) {
        throw new Error("Gagal membuat website.");
      }

      const result = (await response.json().catch(() => null)) as {
        assetIds?: string[];
        id?: string;
        message?: string;
        path?: string;
      } | null;

      if (!response.ok || !result?.id || !result?.path) {
        throw new Error(result?.message || "Gagal membuat website.");
      }

      return {
        assetIds: result.assetIds ?? [],
        id: result.id,
        path: result.path,
      };
    },
    invalidateKeys: [queryKeys.projects, queryKeys.energy],
    onSuccess: async (data) => {
      // Server persisted files (if any) and returned the project. Clear
      revokeAll(attachments);
      setAttachments([]);
      window.localStorage.removeItem(PROJECT_DRAFT_STORAGE_KEY);
      // Keep the mutation pending until the workspace route has loaded.
      await router.push(data.path);
    },
    onError: (error) => {
      setErrorMessage(
        error instanceof Error ? error.message : "Gagal membuat website.",
      );
      revokeAll(attachments);
      setAttachments([]);
      isSubmittingRef.current = false;
    },
  });

  const createProject = useCallback(
    async (value: string) => {
      setErrorMessage("");
      await createMutation.mutateAsync(value);
    },
    [createMutation],
  );

  useEffect(() => {
    const draft = parseProjectDraft(
      window.localStorage.getItem(PROJECT_DRAFT_STORAGE_KEY),
    );

    if (
      status !== "authenticated" ||
      !draft?.continueAfterLogin ||
      hasAutoContinued.current
    ) {
      return;
    }

    hasAutoContinued.current = true;
    window.localStorage.setItem(
      PROJECT_DRAFT_STORAGE_KEY,
      JSON.stringify({
        ...draft,
        continueAfterLogin: false,
        idempotencyKey:
          draft.idempotencyKey || getProjectCreateIdempotencyKey(draft.prompt),
      }),
    );

    void createProject(draft.prompt);
  }, [createProject, status]);

  const isLoading = createMutation.isPending;
  const isUploading = hasUploadingAttachments(attachments);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isLoading || isUploading || isSubmittingRef.current) {
      return;
    }

    isSubmittingRef.current = true;
    setErrorMessage("");

    const validation = validateProjectRequest(prompt);

    if (!validation.ok) {
      setErrorMessage(validation.message);
      isSubmittingRef.current = false;
      return;
    }

    if (status !== "authenticated") {
      saveDraft(true);
      setLoginOpen(true);
      isSubmittingRef.current = false;
      return;
    }

    await createProject(validation.value);
  }

  function handlePromptKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.nativeEvent.isComposing
    ) {
      return;
    }

    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  if (waitlisted) {
    return null;
  }

  if (overLimit) {
    return (
      <div className="mx-auto mt-6 sm:mt-10 w-full max-w-2xl rounded-2xl border border-black/10 bg-black/[0.03] px-6 py-4 text-center text-[#1c1c1c] dark:border-white/10 dark:bg-white/[0.04] dark:text-surface-warm-white">
        <p className="text-sm font-medium leading-relaxed">
          Kamu sudah mencapai batas website. Hapus yang tidak terpakai untuk
          membuat yang baru.
        </p>
      </div>
    );
  }

  return (
    <>
      <form
        onSubmit={handleSubmit}
        onFocus={() => onFocusChange?.(true)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) {
            onFocusChange?.(false);
          }
        }}
        className="mx-auto mt-6 sm:mt-10 w-full max-w-3xl overflow-visible rounded-2xl border border-black/10 bg-white text-left shadow-[0_20px_48px_rgba(0,0,0,0.08)] ring-1 ring-black/[0.04] transition-all duration-300 ease-out focus-within:scale-[1.02] focus-within:border-accent-orange focus-within:ring-accent-orange/30 dark:border-white/10 dark:bg-[#1c1c1a] dark:shadow-[0_24px_48px_rgba(0,0,0,0.45)] dark:ring-white/[0.05] dark:focus-within:border-[#2f8cff]/55 dark:focus-within:ring-[#2f8cff]/35"
      >
        <label htmlFor="hero-prompt" className="sr-only">
          Tulis kebutuhan usaha yang ingin dibuatkan website
        </label>
        <textarea
          id="hero-prompt"
          name="business-story"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={handlePromptKeyDown}
          placeholder={placeholder ? `Contoh: ${placeholder}` : ""}
          maxLength={PROJECT_REQUEST_MAX_LENGTH}
          disabled={isLoading}
          className="h-28 w-full resize-none break-words bg-transparent px-4 pb-3 pt-4 text-sm leading-6 text-[#1c1c1c] outline-none [overflow-wrap:anywhere] [scrollbar-width:none] placeholder:text-[#1c1c1c]/45 disabled:opacity-70 dark:text-surface-warm-white dark:placeholder:text-surface-warm-white/52 [-ms-overflow-style:none] sm:h-36 sm:px-spacing-9 sm:pb-spacing-7 sm:pt-spacing-9 sm:text-lg sm:leading-7 [&::-webkit-scrollbar]:hidden"
        />
        {attachments.length > 0 ? (
          <div className="px-4 pb-3 sm:px-spacing-6 sm:pb-spacing-4">
            <ComposerAttachments
              attachments={attachments}
              onRemove={(id) =>
                setAttachments((prev) => removeAttachment(prev, id))
              }
            />
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-3 px-4 pb-4 pt-1 sm:gap-spacing-7 sm:px-spacing-9 sm:pb-spacing-7 sm:pt-0">
          <span className="text-xs sm:text-sm tabular-nums text-[#5f5f5d] dark:text-surface-warm-white/58">
            {prompt.length.toLocaleString("id-ID")} / 1.200 karakter
          </span>
          <div className="flex items-center gap-3 sm:gap-spacing-5">
            {isUploading || isLoading ? (
              <span className="hidden text-sm text-[#5f5f5d] sm:inline dark:text-surface-warm-white/58">
                {isUploading ? "Mengunggah gambar..." : "Menyiapkan..."}
              </span>
            ) : null}
            {uploadsEnabled ? (
              status === "authenticated" ? (
                <ComposerAttachButton
                  attachments={attachments}
                  onAdd={(next, rejected) => {
                    const added = next.filter(
                      (item) =>
                        !attachments.some((prev) => prev.id === item.id),
                    );
                    setAttachments(next);
                    for (const item of added) {
                      void uploadTempImageFile(item.file)
                        .then((uploaded) =>
                          setAttachments((current) =>
                            current.map((candidate) =>
                              candidate.id === item.id
                                ? {
                                    ...candidate,
                                    assetId: uploaded.assetId,
                                    status: "uploaded",
                                  }
                                : candidate,
                            ),
                          ),
                        )
                        .catch((error) => {
                          setAttachments((current) =>
                            removeAttachment(current, item.id),
                          );
                          toast.error(
                            error instanceof Error
                              ? error.message
                              : "Gagal mengunggah gambar.",
                          );
                        });
                    }
                    if (rejected.length) {
                      toast.error(
                        "Maksimal 6 gambar dan kurang dari 5MB per gambar.",
                      );
                    }
                  }}
                />
              ) : (
                <button
                  type="button"
                  aria-label="Lampirkan gambar"
                  className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-[#5f5f5d] transition hover:bg-black/5 hover:text-[#1c1c1c] dark:text-surface-warm-white/60 dark:hover:bg-surface-warm-white/8 dark:hover:text-surface-warm-white/90"
                  onClick={() => setLoginOpen(true)}
                  title="Lampirkan gambar"
                >
                  <Paperclip className="size-4" />
                </button>
              )
            ) : null}
            <Button
              type="submit"
              size="icon"
              disabled={isLoading || isUploading || !prompt.trim()}
              aria-label="Buat website"
              className="size-9 sm:size-11 rounded-full bg-[#1c1c1c] text-white shadow-sm transition hover:bg-black hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:bg-black/10 disabled:text-black/30 disabled:hover:scale-100 dark:bg-surface-warm-white dark:text-[#141413] dark:hover:bg-white dark:disabled:bg-white/10 dark:disabled:text-white/30"
            >
              {isLoading ? (
                <Loader2 className="size-4 sm:size-5 animate-spin" />
              ) : (
                <ArrowUp className="size-4 sm:size-5" />
              )}
            </Button>
          </div>
        </div>
        {errorMessage ? (
          <p className="border-t border-white/10 px-spacing-9 py-spacing-4 text-sm text-[#ffb4a6]">
            {errorMessage}
          </p>
        ) : null}
      </form>

      <LoginConsentDialog open={loginOpen} onOpenChange={setLoginOpen} />
    </>
  );
}
