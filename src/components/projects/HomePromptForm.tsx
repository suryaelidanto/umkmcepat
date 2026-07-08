"use client";

import { ArrowUp, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  FormEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";

import { LoginConsentDialog } from "@/components/common/LoginConsentDialog";
import { Button } from "@/components/ui/button";
import { apiNetworkError, parseApiResponse } from "@/lib/api-client";
import {
  createProjectDraft,
  parseProjectDraft,
  PROJECT_DRAFT_STORAGE_KEY,
} from "@/lib/projects/draft";
import {
  PROJECT_REQUEST_MAX_LENGTH,
  validateProjectRequest,
} from "@/lib/projects/input";

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
  const { status } = useSession();
  const [prompt, setPrompt] = useState("");
  const [loginOpen, setLoginOpen] = useState(false);
  const [isContinuing, setIsContinuing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [moderationMessage, setModerationMessage] = useState("");
  const [isCheckingPrompt, setIsCheckingPrompt] = useState(false);
  const [isPending, startTransition] = useTransition();
  const hasAutoContinued = useRef(false);
  const isSubmittingRef = useRef(false);
  const moderationAbortRef = useRef<AbortController | null>(null);

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

  const createProject = useCallback(
    async (value: string) => {
      const idempotencyKey = getProjectCreateIdempotencyKey(value);
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({ idempotencyKey, prompt: value }),
      }).catch((error: unknown) => apiNetworkError(error));
      const result =
        response instanceof Response
          ? await parseApiResponse<{ path?: string }>(response)
          : response;

      if (!result.ok) {
        setErrorMessage(
          result.error.message ||
            "AI belum bisa menyiapkan website ini. Coba lagi nanti.",
        );
        setIsContinuing(false);
        isSubmittingRef.current = false;
        return;
      }

      if (!result.data.path) {
        setErrorMessage(
          "AI belum bisa menyiapkan website ini. Coba lagi nanti.",
        );
        setIsContinuing(false);
        isSubmittingRef.current = false;
        return;
      }

      window.localStorage.removeItem(PROJECT_DRAFT_STORAGE_KEY);
      startTransition(() => {
        router.push(result.data.path || "/");
      });
    },
    [router, startTransition],
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
    setIsContinuing(true);
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

  useEffect(() => {
    const validation = validateProjectRequest(prompt);

    moderationAbortRef.current?.abort();
    setModerationMessage("");

    if (!prompt.trim() || !validation.ok || prompt.trim().length < 8) {
      setIsCheckingPrompt(false);
      return;
    }

    const abortController = new AbortController();
    moderationAbortRef.current = abortController;
    const timeout = window.setTimeout(async () => {
      setIsCheckingPrompt(true);

      try {
        const response = await fetch("/api/moderation/project-request", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: validation.value }),
          signal: abortController.signal,
        });
        const result = (await response.json().catch(() => null)) as {
          allowed?: boolean;
          message?: string;
        } | null;

        if (!abortController.signal.aborted && result?.allowed === false) {
          setModerationMessage(
            result.message || "Permintaan ini belum bisa diproses.",
          );
        }
      } catch {
        if (!abortController.signal.aborted) {
          setModerationMessage("");
        }
      } finally {
        if (!abortController.signal.aborted) {
          setIsCheckingPrompt(false);
        }
      }
    }, 650);

    return () => {
      window.clearTimeout(timeout);
      abortController.abort();
    };
  }, [prompt]);

  const isLoading = isContinuing || isPending;

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

    if (moderationMessage) {
      setErrorMessage(moderationMessage);
      isSubmittingRef.current = false;
      return;
    }

    if (status !== "authenticated") {
      saveDraft(true);
      setLoginOpen(true);
      isSubmittingRef.current = false;
      return;
    }

    setIsContinuing(true);

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

  return (
    <>
      <form
        onSubmit={handleSubmit}
        className="mx-auto mt-spacing-12 w-full max-w-3xl overflow-visible rounded-[28px] border border-surface-warm-white/10 bg-[#232321] text-left shadow-[0_24px_80px_rgba(0,0,0,0.32)] transition-all duration-300"
      >
        <label htmlFor="hero-prompt" className="sr-only">
          Tulis kebutuhan usaha yang ingin dibuatkan website
        </label>
        <div className="relative">
          <textarea
            id="hero-prompt"
            name="business-story"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={handlePromptKeyDown}
            placeholder="Tulis kebutuhan usahamu di sini... contoh: Saya jual produk rumahan dan ingin pelanggan bisa pesan lewat WhatsApp."
            maxLength={PROJECT_REQUEST_MAX_LENGTH}
            disabled={isLoading}
            className="h-40 w-full resize-none break-words bg-transparent px-spacing-9 pb-spacing-13 pt-spacing-9 text-base leading-7 text-surface-warm-white outline-none [overflow-wrap:anywhere] [scrollbar-width:none] placeholder:text-surface-warm-white/42 disabled:opacity-70 [-ms-overflow-style:none] sm:h-36 sm:text-lg [&::-webkit-scrollbar]:hidden"
          />
          <span className="pointer-events-none absolute bottom-spacing-4 right-spacing-7 rounded-full bg-[#232321]/85 px-spacing-4 py-spacing-2 text-sm tabular-nums text-surface-warm-white/52 backdrop-blur-sm">
            {prompt.length.toLocaleString("id-ID")}/1.200
          </span>
        </div>
        <div className="flex items-center justify-between gap-spacing-5 px-spacing-7 pb-spacing-7">
          <div />
          <div className="flex items-center gap-spacing-4">
            {isLoading || isCheckingPrompt ? (
              <span className="hidden text-sm text-surface-warm-white/58 sm:inline">
                {isLoading ? "Menyiapkan..." : "Mengecek..."}
              </span>
            ) : null}
            <Button
              type="submit"
              size="icon"
              disabled={
                isLoading ||
                isCheckingPrompt ||
                Boolean(moderationMessage) ||
                !prompt.trim()
              }
              className="size-9 rounded-full bg-surface-warm-white text-foreground-primary hover:bg-surface-warm-white/86 disabled:opacity-50"
              aria-label="Buat halaman"
            >
              {isLoading || isCheckingPrompt ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ArrowUp className="size-4" />
              )}
            </Button>
          </div>
        </div>
        {moderationMessage ? (
          <p className="px-spacing-7 pb-spacing-5 text-sm leading-6 text-[#ffb4a6]">
            {moderationMessage}
          </p>
        ) : null}
        {errorMessage ? (
          <p className="px-spacing-7 pb-spacing-7 text-sm text-red-200">
            {errorMessage}
          </p>
        ) : null}
      </form>

      <LoginConsentDialog
        open={loginOpen}
        onOpenChange={setLoginOpen}
        title="Masuk dulu untuk lanjut"
        description="Chat kamu sudah disimpan. Setelah masuk, AI akan lanjut otomatis tanpa perlu mengetik ulang."
      />
    </>
  );
}
