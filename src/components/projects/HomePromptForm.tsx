"use client";

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
} from "@/components/projects/ComposerAttachments";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/auth-client";
import { useRouter } from "@/lib/navigation";
import {
  removeAttachment,
  revokeAll,
  toUploadPlan,
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
import { queryKeys, useCacheMutation } from "@/lib/query-client";

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
  const hasAutoContinued = useRef(false);
  const isSubmittingRef = useRef(false);

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

  const createMutation = useCacheMutation<{ id: string; path: string }, string>(
    {
      mutationFn: async (value) => {
        const idempotencyKey = getProjectCreateIdempotencyKey(value);
        const response = await fetch("/api/projects", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify({ prompt: value }),
        });
        const result = (await response.json().catch(() => null)) as {
          id?: string;
          message?: string;
          path?: string;
        } | null;

        if (!response.ok || !result?.id || !result?.path) {
          throw new Error(result?.message || "Gagal membuat website.");
        }

        return { id: result.id, path: result.path };
      },
      invalidateKeys: [queryKeys.projects, queryKeys.energy],
      onSuccess: async (data) => {
        if (attachments.length) {
          try {
            const fileParts = [];
            const mediaPaths = [];
            for (const item of toUploadPlan(attachments)) {
              const form = new FormData();
              form.append("file", item.file);
              form.append("purpose", "business-image");
              const res = await fetch(
                `/api/projects/${data.id}/assets/upload`,
                {
                  body: form,
                  method: "POST",
                },
              );
              if (!res.ok) {
                throw new Error(`Gagal mengunggah ${item.file.name}`);
              }
              const contentType = res.headers.get("content-type") ?? "";
              if (!contentType.toLowerCase().includes("application/json")) {
                throw new Error(`Gagal mengunggah ${item.file.name}`);
              }
              const asset = (await res.json()) as {
                id: string;
                publicUrl: string | null;
              };
              if (!asset.publicUrl) {
                throw new Error(
                  `Gambar belum tersedia (${item.file.name}). Aktifkan R2.`,
                );
              }
              const bytes = new Uint8Array(await item.file.arrayBuffer());
              const base64 = btoa(String.fromCharCode(...bytes));
              fileParts.push({
                filename: item.file.name,
                mediaType: item.file.type || "image/png",
                type: "file",
                url: `data:${item.file.type || "image/png"};base64,${base64}`,
              });
              mediaPaths.push(`/media/${asset.id}`);
            }

            sessionStorage.setItem(
              `umkmcepat:initial-assets:${data.id}`,
              JSON.stringify({ fileParts, mediaPaths }),
            );
          } catch (error) {
            toast.error(
              error instanceof Error
                ? error.message
                : "Gagal mengunggah gambar.",
            );
          } finally {
            revokeAll(attachments);
          }
        }

        // Force a refetch so home sees the new project after create.
        window.localStorage.removeItem(PROJECT_DRAFT_STORAGE_KEY);
        router.push(data.path);
      },
      onError: (error) => {
        setErrorMessage(
          error instanceof Error ? error.message : "Gagal membuat website.",
        );
        isSubmittingRef.current = false;
      },
    },
  );

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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isLoading || isSubmittingRef.current) {
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

  if (overLimit) {
    return (
      <div className="mx-auto mt-spacing-12 w-full max-w-3xl rounded-[28px] border border-yellow-500/24 bg-yellow-500/[0.06] px-spacing-7 py-spacing-6 text-center">
        <p className="text-sm leading-6 text-surface-warm-white/78">
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
        className="mx-auto mt-spacing-12 w-full max-w-3xl overflow-visible rounded-2xl border border-white/10 bg-[#1c1c1a] text-left shadow-[0_24px_48px_rgba(0,0,0,0.45)] ring-1 ring-white/[0.05] transition-all duration-300 ease-out focus-within:scale-[1.05] focus-within:border-[#2f8cff]/55 focus-within:ring-[#2f8cff]/35 focus-within:shadow-[0_0_0_1px_rgba(47,140,255,0.25),0_36px_80px_rgba(0,0,0,0.6)]"
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
          placeholder="Tulis kebutuhan usahamu di sini... contoh: Saya jual produk rumahan dan ingin pelanggan bisa pesan lewat WhatsApp."
          maxLength={PROJECT_REQUEST_MAX_LENGTH}
          disabled={isLoading}
          className="h-40 w-full resize-none break-words bg-transparent px-spacing-9 pb-spacing-7 pt-spacing-9 text-base leading-7 text-surface-warm-white outline-none [overflow-wrap:anywhere] [scrollbar-width:none] placeholder:text-surface-warm-white/52 disabled:opacity-70 [-ms-overflow-style:none] sm:h-36 sm:text-lg [&::-webkit-scrollbar]:hidden"
        />
        {attachments.length > 0 ? (
          <div className="px-spacing-6 pb-spacing-4">
            <ComposerAttachments
              attachments={attachments}
              onRemove={(id) =>
                setAttachments((prev) => removeAttachment(prev, id))
              }
            />
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-spacing-7 px-spacing-9 pb-spacing-7">
          <span className="text-sm tabular-nums text-surface-warm-white/58">
            {prompt.length.toLocaleString("id-ID")} / 1.200 karakter
          </span>
          <div className="flex items-center gap-spacing-5">
            {isLoading ? (
              <span className="hidden text-sm text-surface-warm-white/58 sm:inline">
                Menyiapkan...
              </span>
            ) : null}
            {status === "authenticated" ? (
              <ComposerAttachButton
                attachments={attachments}
                onAdd={(next, rejected) => {
                  setAttachments(next);
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
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-surface-warm-white/60 transition hover:bg-surface-warm-white/8 hover:text-surface-warm-white/90"
                onClick={() => setLoginOpen(true)}
                title="Lampirkan gambar"
              >
                <Paperclip className="size-4" />
              </button>
            )}
            <Button
              type="submit"
              size="icon"
              disabled={isLoading || !prompt.trim()}
              aria-label="Buat website"
              className="size-11 rounded-full bg-white text-[#141413] hover:bg-white/92 disabled:opacity-45"
            >
              {isLoading ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <ArrowUp className="size-5" />
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
