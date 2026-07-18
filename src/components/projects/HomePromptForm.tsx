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
import { cn } from "@/lib/utils";

// PROTOTYPE: shell skins for hero prompt. A = production current.
export type PromptShellAppearance = "A" | "B" | "C" | "D" | "E";

const SHELL: Record<
  PromptShellAppearance,
  {
    form: string;
    textarea: string;
    meta: string;
    loading: string;
    submit: string;
    error: string;
  }
> = {
  A: {
    form: "rounded-[28px] border border-surface-warm-white/12 bg-[#232321] ring-1 ring-surface-warm-white/6",
    textarea: "text-surface-warm-white placeholder:text-surface-warm-white/58",
    meta: "text-surface-warm-white/62",
    loading: "text-surface-warm-white/58",
    submit:
      "bg-surface-warm-white text-foreground-primary hover:bg-surface-warm-white/90",
    error: "border-t border-surface-warm-white/10 text-[#ffb4a6]",
  },
  // Frosted glass — sits on floating orbs without fighting them
  B: {
    form: "rounded-[28px] border border-white/14 bg-white/[0.08] shadow-[0_20px_60px_rgba(0,0,0,0.35)] ring-1 ring-white/10 backdrop-blur-xl",
    textarea: "text-white placeholder:text-white/55",
    meta: "text-white/55",
    loading: "text-white/55",
    submit:
      "bg-white text-[#141413] hover:bg-white/90 shadow-[0_0_0_1px_rgba(255,255,255,0.2)]",
    error: "border-t border-white/10 text-[#ffb4a6]",
  },
  // Soft pill — tighter, more chat-composer
  C: {
    form: "rounded-[36px] border border-white/10 bg-[#1a1a18]/88 shadow-[0_12px_40px_rgba(0,0,0,0.4)] ring-1 ring-white/[0.06]",
    textarea:
      "text-surface-warm-white placeholder:text-surface-warm-white/50 sm:min-h-0",
    meta: "text-surface-warm-white/55",
    loading: "text-surface-warm-white/55",
    submit:
      "bg-gradient-to-br from-[#2f8cff] to-[#7867ff] text-white hover:opacity-95",
    error: "border-t border-white/10 text-[#ffb4a6]",
  },
  // Outline only — lightest presence on aurora
  D: {
    form: "rounded-[28px] border border-white/22 bg-transparent ring-0",
    textarea: "text-white placeholder:text-white/50",
    meta: "text-white/50",
    loading: "text-white/50",
    submit:
      "border border-white/30 bg-white/10 text-white hover:bg-white/18 backdrop-blur-sm",
    error: "border-t border-white/15 text-[#ffb4a6]",
  },
  // Elevated solid — crisp card with blue focus ring personality
  E: {
    form: "rounded-2xl border border-white/10 bg-[#1c1c1a] shadow-[0_24px_48px_rgba(0,0,0,0.45)] ring-1 ring-white/[0.05] focus-within:border-[#2f8cff]/40 focus-within:ring-[#2f8cff]/25",
    textarea: "text-surface-warm-white placeholder:text-surface-warm-white/52",
    meta: "text-surface-warm-white/58",
    loading: "text-surface-warm-white/58",
    submit: "bg-white text-[#141413] hover:bg-white/92",
    error: "border-t border-white/10 text-[#ffb4a6]",
  },
};

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
  appearance = "A",
}: {
  appearance?: PromptShellAppearance;
} = {}) {
  const router = useRouter();
  const { overLimit } = useProjectLimit();
  const { status } = useSession();
  const [prompt, setPrompt] = useState("");
  const [loginOpen, setLoginOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const hasAutoContinued = useRef(false);
  const isSubmittingRef = useRef(false);
  const skin = SHELL[appearance] ?? SHELL.A;

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
        className={cn(
          "mx-auto mt-spacing-12 w-full max-w-3xl overflow-visible text-left transition-colors duration-200",
          skin.form,
        )}
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
          className={cn(
            "h-40 w-full resize-none break-words bg-transparent px-spacing-9 pb-spacing-7 pt-spacing-9 text-base leading-7 outline-none [overflow-wrap:anywhere] [scrollbar-width:none] disabled:opacity-70 [-ms-overflow-style:none] sm:h-36 sm:text-lg [&::-webkit-scrollbar]:hidden",
            skin.textarea,
          )}
        />
        <div className="flex items-center justify-between gap-spacing-7 px-spacing-9 pb-spacing-7">
          <span className={cn("text-sm tabular-nums", skin.meta)}>
            {prompt.length.toLocaleString("id-ID")} / 1.200 karakter
          </span>
          <div className="flex items-center gap-spacing-5">
            {isLoading ? (
              <span className={cn("hidden text-sm sm:inline", skin.loading)}>
                Menyiapkan...
              </span>
            ) : null}
            <Button
              type="submit"
              size="icon"
              disabled={isLoading || !prompt.trim()}
              aria-label="Buat website"
              className={cn(
                "size-11 rounded-full disabled:opacity-45",
                skin.submit,
              )}
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
          <p className={cn("px-spacing-9 py-spacing-4 text-sm", skin.error)}>
            {errorMessage}
          </p>
        ) : null}
      </form>

      <LoginConsentDialog open={loginOpen} onOpenChange={setLoginOpen} />
    </>
  );
}
