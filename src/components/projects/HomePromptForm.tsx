"use client";

import { ArrowUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import { FormEvent, useState } from "react";

import {
  ModeSelect,
  type WorkspaceMode,
} from "@/components/projects/ModeSelect";
import { Button } from "@/components/ui/button";
import { getNewProjectPath } from "@/lib/projects/workspace";

export function HomePromptForm() {
  const router = useRouter();
  const { status } = useSession();
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<WorkspaceMode>("discuss");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const path = getNewProjectPath(prompt, mode);

    if (status !== "authenticated") {
      if (prompt.trim()) {
        window.sessionStorage.setItem("umkmcepat:draft-prompt", prompt.trim());
      }
      void signIn("google", { callbackUrl: path });
      return;
    }

    router.push(path);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-spacing-12 w-full max-w-3xl overflow-visible rounded-[28px] border border-surface-warm-white/10 bg-[#232321] text-left shadow-[0_24px_80px_rgba(0,0,0,0.32)]"
    >
      <label htmlFor="hero-prompt" className="sr-only">
        Ceritakan usaha yang ingin dibuatkan website
      </label>
      <textarea
        id="hero-prompt"
        name="prompt"
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        placeholder="Tulis usahamu di sini... contoh: Saya jual sambal rumahan, butuh website hangat dengan tombol WhatsApp."
        className="h-36 w-full resize-none bg-transparent px-spacing-9 py-spacing-9 text-base leading-7 text-surface-warm-white outline-none placeholder:text-surface-warm-white/42 sm:text-lg"
      />
      <div className="flex items-center justify-between gap-spacing-5 px-spacing-7 pb-spacing-7">
        <ModeSelect value={mode} onChange={setMode} />
        <Button
          type="submit"
          size="icon"
          className="size-9 rounded-full bg-surface-warm-white text-foreground-primary hover:bg-surface-warm-white/86"
          aria-label="Buat halaman"
        >
          <ArrowUp className="size-4" />
        </Button>
      </div>
    </form>
  );
}
