"use client";

import { ArrowUp, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import { FormEvent, useEffect, useRef, useState } from "react";

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

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const path = getNewProjectPath(prompt, mode);

    if (status !== "authenticated") {
      saveDraft(true);
      setLoginOpen(true);
      return;
    }

    window.localStorage.removeItem(PROJECT_DRAFT_STORAGE_KEY);
    router.push(path);
  }

  return (
    <>
      <form
        onSubmit={handleSubmit}
        className="mt-spacing-12 w-full max-w-3xl overflow-visible rounded-[28px] border border-surface-warm-white/10 bg-[#232321] text-left shadow-[0_24px_80px_rgba(0,0,0,0.32)]"
      >
        <label htmlFor="hero-prompt" className="sr-only">
          Ceritakan usaha yang ingin dibuatkan website
        </label>
        <textarea
          id="hero-prompt"
          name="business-story"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Tulis usahamu di sini... contoh: Saya jual sambal rumahan, butuh website hangat dengan tombol WhatsApp."
          disabled={isContinuing}
          className="h-36 w-full resize-none bg-transparent px-spacing-9 py-spacing-9 text-base leading-7 text-surface-warm-white outline-none placeholder:text-surface-warm-white/42 disabled:opacity-70 sm:text-lg"
        />
        <div className="flex items-center justify-between gap-spacing-5 px-spacing-7 pb-spacing-7">
          <ModeSelect value={mode} onChange={setMode} />
          <div className="flex items-center gap-spacing-4">
            {isContinuing ? (
              <span className="hidden text-sm text-surface-warm-white/58 sm:inline">
                Melanjutkan...
              </span>
            ) : null}
            <Button
              type="submit"
              size="icon"
              disabled={isContinuing}
              className="size-9 rounded-full bg-surface-warm-white text-foreground-primary hover:bg-surface-warm-white/86"
              aria-label="Buat halaman"
            >
              {isContinuing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ArrowUp className="size-4" />
              )}
            </Button>
          </div>
        </div>
        {isContinuing ? (
          <p className="px-spacing-7 pb-spacing-7 text-sm text-surface-warm-white/58">
            Cerita usahamu sudah tersimpan. AI sedang menyiapkan website kamu.
          </p>
        ) : null}
      </form>

      <Dialog open={loginOpen} onOpenChange={setLoginOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Masuk dulu untuk lanjut</DialogTitle>
            <DialogDescription>
              Cerita usahamu sudah disimpan. Setelah masuk, AI akan lanjut
              otomatis tanpa perlu mengetik ulang.
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
