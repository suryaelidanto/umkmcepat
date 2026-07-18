"use client";

import { ArrowUp, Loader2 } from "lucide-react";
import {
  FormEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { LoginConsentDialog } from "@/components/common/LoginConsentDialog";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/auth-client";
import { useRouter } from "@/lib/navigation";
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

export function HomePromptForm() {
  const router = useRouter();
  const { overLimit } = useProjectLimit();
  const { status } = useSession();
  const [prompt, setPrompt] = useState("");
  const [loginOpen, setLoginOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const hasAutoContinued = useRef(false);
  const isSubmittingRef = useRef(false);

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
        className="mx-auto mt-spacing-12 w-full max-w-3xl overflow-visible rounded-2xl border border-white/10 bg-[#1c1c1a] text-left shadow-[0_24px_48px_rgba(0,0,0,0.45)] ring-1 ring-white/[0.05] transition-colors duration-200 focus-within:border-[#2f8cff]/40 focus-within:ring-[#2f8cff]/25"
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
