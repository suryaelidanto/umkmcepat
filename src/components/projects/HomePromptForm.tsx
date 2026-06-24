"use client";

import { ArrowUp, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import {
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";

import {
  ModeSelect,
  type WorkspaceMode,
} from "@/components/projects/ModeSelect";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  createProjectDraft,
  parseProjectDraft,
  PROJECT_DRAFT_STORAGE_KEY,
} from "@/lib/projects/draft";
import {
  PROJECT_REQUEST_MAX_LENGTH,
  validateProjectRequest,
} from "@/lib/projects/input";

export function HomePromptForm() {
  const router = useRouter();
  const { status } = useSession();
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<WorkspaceMode>("discuss");
  const [loginOpen, setLoginOpen] = useState(false);
  const [isContinuing, setIsContinuing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const hasAutoContinued = useRef(false);

  useEffect(() => {
    const draft = parseProjectDraft(
      window.localStorage.getItem(PROJECT_DRAFT_STORAGE_KEY),
    );

    if (!draft) {
      return;
    }

    setPrompt((current) => current || draft.prompt);
    setMode(draft.mode);
  }, []);

  function saveDraft(continueAfterLogin = false) {
    const draft = createProjectDraft(
      prompt,
      mode,
      Date.now(),
      continueAfterLogin,
    );

    if (!draft) {
      return;
    }

    window.localStorage.setItem(
      PROJECT_DRAFT_STORAGE_KEY,
      JSON.stringify(draft),
    );
  }

  const createProject = useCallback(
    async (value: string, selectedMode: WorkspaceMode) => {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: value, mode: selectedMode }),
      });
      const result = (await response.json()) as {
        path?: string;
        message?: string;
      };

      if (!response.ok || !result.path) {
        setErrorMessage(
          result.message ||
            "AI belum bisa menyiapkan website ini. Coba lagi nanti.",
        );
        setIsContinuing(false);
        return;
      }

      window.localStorage.removeItem(PROJECT_DRAFT_STORAGE_KEY);
      startTransition(() => {
        router.push(result.path || "/");
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
      JSON.stringify({ ...draft, continueAfterLogin: false }),
    );

    void createProject(draft.prompt, draft.mode);
  }, [createProject, status]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    const validation = validateProjectRequest(prompt);

    if (!validation.ok) {
      setErrorMessage(validation.message);
      return;
    }

    if (status !== "authenticated") {
      saveDraft(true);
      setLoginOpen(true);
      return;
    }

    setIsContinuing(true);

    await createProject(validation.value, mode);
  }

  const isLoading = isContinuing || isPending;

  return (
    <>
      <form
        onSubmit={handleSubmit}
        className="mt-spacing-12 w-full max-w-3xl overflow-visible rounded-[28px] border border-surface-warm-white/10 bg-[#232321] text-left shadow-[0_24px_80px_rgba(0,0,0,0.32)] transition-all duration-300"
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
          <ModeSelect value={mode} onChange={setMode} disabled={isLoading} />
          <div className="flex items-center gap-spacing-4">
            {isLoading ? (
              <span className="hidden text-sm text-surface-warm-white/58 sm:inline">
                Menyiapkan...
              </span>
            ) : null}
            <Button
              type="submit"
              size="icon"
              disabled={isLoading || !prompt.trim()}
              className="size-9 rounded-full bg-surface-warm-white text-foreground-primary hover:bg-surface-warm-white/86 disabled:opacity-50"
              aria-label="Buat halaman"
            >
              {isLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ArrowUp className="size-4" />
              )}
            </Button>
          </div>
        </div>
        {errorMessage ? (
          <p className="px-spacing-7 pb-spacing-7 text-sm text-red-200">
            {errorMessage}
          </p>
        ) : null}
      </form>

      <Dialog open={loginOpen} onOpenChange={setLoginOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Masuk dulu untuk lanjut</DialogTitle>
            <DialogDescription>
              Chat kamu sudah disimpan. Setelah masuk, AI akan lanjut otomatis
              tanpa perlu mengetik ulang.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col-reverse gap-spacing-4 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setLoginOpen(false)}
            >
              Nanti dulu
            </Button>
            <Button
              type="button"
              onClick={() => signIn("google", { callbackUrl: "/" })}
            >
              Masuk dengan Google
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
