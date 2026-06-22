"use client";

import { ArrowUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import { FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { getWorkspacePath } from "@/lib/projects/workspace";

const modelOptions = [
  { value: "cmc/deepseek/deepseek-v4-pro", label: "DeepSeek Pro" },
  { value: "cmc/deepseek/deepseek-v4-flash", label: "DeepSeek Flash" },
  { value: "cmc/moonshotai/Kimi-K2.6", label: "Kimi K2.6" },
];

export function HomePromptForm() {
  const router = useRouter();
  const { status } = useSession();
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState(modelOptions[0].value);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const path = getWorkspacePath(prompt, model);

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
      className="mt-spacing-12 w-full max-w-3xl overflow-hidden rounded-[28px] border border-surface-warm-white/10 bg-[#232321] text-left shadow-[0_24px_80px_rgba(0,0,0,0.32)]"
    >
      <label htmlFor="hero-prompt" className="sr-only">
        Ceritakan usaha yang ingin dibuatkan landing page
      </label>
      <textarea
        id="hero-prompt"
        name="prompt"
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        placeholder="Tulis usahamu di sini... contoh: Saya jual sambal rumahan, butuh landing page hangat dengan tombol WhatsApp."
        className="h-36 w-full resize-none bg-transparent px-spacing-9 py-spacing-9 text-base leading-7 text-surface-warm-white outline-none placeholder:text-surface-warm-white/42 sm:text-lg"
      />
      <div className="flex items-center justify-between gap-spacing-5 px-spacing-7 pb-spacing-7">
        <label className="sr-only" htmlFor="hero-model">
          Model AI
        </label>
        <select
          id="hero-model"
          value={model}
          onChange={(event) => setModel(event.target.value)}
          className="max-w-[220px] rounded-full border border-surface-warm-white/10 bg-surface-warm-white/5 px-spacing-6 py-spacing-3 text-sm text-surface-warm-white/72 outline-none transition hover:bg-surface-warm-white/10 focus-visible:ring-2 focus-visible:ring-surface-warm-white"
        >
          {modelOptions.map((option) => (
            <option
              key={option.value}
              value={option.value}
              className="bg-[#232321] text-surface-warm-white"
            >
              {option.label}
            </option>
          ))}
        </select>
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
