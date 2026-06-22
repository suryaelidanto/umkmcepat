"use client";

import { ArrowUp, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import { FormEvent, useEffect, useRef, useState, useTransition } from "react";

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
import { getNewProjectPath } from "@/lib/projects/workspace";

export function HomePromptForm() {
  const router = useRouter();
  const { status } = useSession();
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<WorkspaceMode>("discuss");
  const [loginOpen, setLoginOpen] = useState(false);
  const [isContinuing, setIsContinuing] = useState(false);
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

    const timeout = window.setTimeout(() => {
      router.push(getNewProjectPath(draft.prompt, draft.mode));
    }, 850);

    return () => window.clearTimeout(timeout);
  }, [router, status]);

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

  const [isPending, startTransition] = useTransition();
  const [isGenerating, setIsGenerating] = useState(false);
  const [messageIndex, setMessageIndex] = useState(0);

  const shortPrompt =
    prompt.length > 30 ? prompt.slice(0, 30).trim() + "..." : prompt;

  const loadingMessages = [
    `Menganalisis ide "${shortPrompt}"...`,
    "Merancang tata letak website...",
    "Membangun komponen UI...",
    "Menulis copywriting yang menarik...",
    "Menyiapkan ruang kerja Anda...",
  ];

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isGenerating || isPending) {
      interval = setInterval(() => {
        setMessageIndex((prev) => (prev + 1) % loadingMessages.length);
      }, 2500);
    }
    return () => clearInterval(interval);
  }, [isGenerating, isPending, loadingMessages.length]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      return;
    }

    setIsGenerating(true);

    try {
      const res = await fetch("/api/check-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: trimmedPrompt }),
      });

      const data = await res.json();
      if (data.banned) {
        // Jika IP diblokir, reload halaman agar Layout menampilkan layar Akses Ditolak
        window.location.reload();
        return;
      }
    } catch (e) {
      console.error("Gagal memeriksa prompt", e);
    }

    const path = getNewProjectPath(trimmedPrompt, mode);

    if (status !== "authenticated") {
    if (status !== "authenticated") {
      saveDraft(true);
      setLoginOpen(true);
      return;
    }

    window.localStorage.removeItem(PROJECT_DRAFT_STORAGE_KEY);
    startTransition(() => {
      router.push(path);
    });
  }

  const isLoading = isPending || isGenerating;

  return (
    <>
      <form
        onSubmit={handleSubmit}
        className="mt-spacing-12 w-full max-w-3xl overflow-visible rounded-[28px] border border-surface-warm-white/10 bg-[#232321] text-left shadow-[0_24px_80px_rgba(0,0,0,0.32)] transition-all duration-300"
      >
        <label htmlFor="hero-prompt" className="sr-only">
          Ceritakan usaha yang ingin dibuatkan website
        </label>

        {isLoading && !isContinuing ? (
          <div className="flex h-36 w-full items-center px-spacing-9 py-spacing-9">
            <div className="flex items-center space-x-2 text-surface-warm-white/80 sm:text-lg">
              <span className="font-mono">{loadingMessages[messageIndex]}</span>
              <span className="animate-pulse font-mono text-xl font-bold text-surface-warm-white">
                _
              </span>
            </div>
          </div>
        ) : (
        <textarea
          id="hero-prompt"
          name="prompt"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Tulis usahamu di sini... contoh: Saya jual sambal rumahan, butuh website hangat dengan tombol WhatsApp."
          disabled={isContinuing || isLoading}
          className="h-36 w-full resize-none bg-transparent px-spacing-9 py-spacing-9 text-base leading-7 text-surface-warm-white outline-none placeholder:text-surface-warm-white/42 disabled:opacity-70 sm:text-lg"
        />
        )}

        <div className="flex items-center justify-between gap-spacing-5 px-spacing-7 pb-spacing-7">
          <ModeSelect value={mode} onChange={setMode} disabled={isContinuing || isLoading} />
          <div className="flex items-center gap-spacing-4">
            {isContinuing ? (
              <span className="hidden text-sm text-surface-warm-white/58 sm:inline">
                Melanjutkan...
              </span>
            ) : null}
            <Button
              type="submit"
              size="icon"
              disabled={isContinuing || isLoading || !prompt.trim()}
              className="size-9 rounded-full bg-surface-warm-white text-foreground-primary hover:bg-surface-warm-white/86 disabled:opacity-50"
              aria-label="Buat halaman"
            >
              {isContinuing || isLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ArrowUp className="size-4" />
              )}
            </Button>
          </div>
        </div>
        {isContinuing ? (
          <p className="px-spacing-7 pb-spacing-7 text-sm text-surface-warm-white/58">
            Prompt kamu dipulihkan. Kami sedang menyiapkan proyekmu.
          </p>
        ) : null}
      </form>

      <Dialog open={loginOpen} onOpenChange={setLoginOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Masuk dulu untuk lanjut</DialogTitle>
            <DialogDescription>
              Prompt kamu sudah disimpan. Setelah masuk, kami lanjutkan otomatis
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
