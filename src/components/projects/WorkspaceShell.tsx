"use client";

import { ArrowUp, Code2, Globe2, Monitor, Smartphone } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";

type WorkspaceShellProps = {
  initialModel?: string;
  initialPrompt?: string;
  projectTitle?: string;
};

const progress = [
  "Memahami usaha dan calon pembeli",
  "Menyusun struktur halaman",
  "Menulis copy berbahasa Indonesia",
  "Menyiapkan visual dan CTA WhatsApp",
];

export function WorkspaceShell({
  initialModel = "DeepSeek Pro",
  initialPrompt = "",
  projectTitle = "Proyek baru",
}: WorkspaceShellProps) {
  const [mode, setMode] = useState<"build" | "ask">("build");
  const [viewport, setViewport] = useState<"desktop" | "mobile">("desktop");
  const prompt =
    initialPrompt.trim() ||
    "Saya jual sambal rumahan, ingin website hangat dengan tombol WhatsApp.";

  const previewTitle = useMemo(() => {
    if (/sambal|makanan|kuliner/i.test(prompt)) {
      return "Sambal Rumahan Ibu Rani";
    }

    if (/laundry|cuci/i.test(prompt)) {
      return "Laundry Kilat Harian";
    }

    return "Website UMKM Kamu";
  }, [prompt]);

  return (
    <div className="min-h-[calc(100dvh-4rem)] bg-[#151515] text-surface-warm-white">
      <div className="mx-auto grid min-h-[calc(100dvh-4rem)] max-w-[1440px] gap-spacing-7 px-4 py-spacing-7 lg:grid-cols-[420px_1fr] lg:px-spacing-9">
        <aside className="flex min-h-[520px] flex-col rounded-[28px] border border-surface-warm-white/10 bg-[#1f1f1d] p-spacing-7 shadow-[0_24px_80px_rgba(0,0,0,0.24)]">
          <div className="flex items-center justify-between gap-spacing-7">
            <div>
              <p className="text-sm text-surface-warm-white/54">
                {projectTitle} · {initialModel.split("/").at(-1)}
              </p>
              <h1 className="mt-1 text-xl font-semibold tracking-[-0.04em]">
                Buat website
              </h1>
            </div>
            <div className="flex rounded-full border border-surface-warm-white/10 bg-surface-warm-white/6 p-1 text-sm">
              <button
                type="button"
                onClick={() => setMode("build")}
                className={`rounded-full px-spacing-7 py-spacing-3 transition ${mode === "build" ? "bg-surface-warm-white text-foreground-primary" : "text-surface-warm-white/62 hover:text-surface-warm-white"}`}
              >
                Buat
              </button>
              <button
                type="button"
                onClick={() => setMode("ask")}
                className={`rounded-full px-spacing-7 py-spacing-3 transition ${mode === "ask" ? "bg-surface-warm-white text-foreground-primary" : "text-surface-warm-white/62 hover:text-surface-warm-white"}`}
              >
                Tanya
              </button>
            </div>
          </div>

          <div className="mt-spacing-9 flex-1 space-y-spacing-7 overflow-y-auto pr-1">
            <div className="rounded-radius-2xl bg-surface-warm-white px-spacing-7 py-spacing-6 text-sm leading-6 text-foreground-primary">
              {prompt}
            </div>
            <div className="rounded-radius-2xl border border-surface-warm-white/10 bg-surface-warm-white/6 px-spacing-7 py-spacing-6 text-sm leading-6 text-surface-warm-white/76">
              {mode === "build"
                ? "Siap. Saya akan buat struktur website yang fokus ke pembeli, CTA jelas, dan nyaman dibuka dari HP."
                : "Silakan tanya tentang copy, desain, atau strategi halaman ini. Mode Tanya tidak mengubah preview."}
            </div>

            <div className="rounded-radius-2xl border border-surface-warm-white/10 bg-[#171716] p-spacing-7">
              <div className="flex items-center gap-spacing-5 text-sm font-medium">
                <Code2 className="size-4" aria-hidden="true" />
                Progress
              </div>
              <ul className="mt-spacing-6 space-y-spacing-5 text-sm text-surface-warm-white/64">
                {progress.map((item) => (
                  <li key={item} className="flex gap-spacing-5">
                    <span
                      className="mt-2 size-1.5 rounded-full bg-[#ff5e27]"
                      aria-hidden="true"
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <form className="mt-spacing-7 rounded-[24px] border border-surface-warm-white/10 bg-[#232321] p-spacing-5">
            <label htmlFor="workspace-message" className="sr-only">
              Pesan untuk AI
            </label>
            <textarea
              id="workspace-message"
              rows={3}
              placeholder={
                mode === "build"
                  ? "Minta perubahan, contoh: buat lebih premium..."
                  : "Tanya sesuatu tentang halaman ini..."
              }
              className="w-full resize-none bg-transparent px-spacing-4 py-spacing-4 text-sm leading-6 text-surface-warm-white outline-none placeholder:text-surface-warm-white/38"
            />
            <div className="flex justify-end">
              <Button
                type="button"
                size="icon"
                className="size-9 rounded-full bg-surface-warm-white text-foreground-primary hover:bg-surface-warm-white/86"
                aria-label="Kirim pesan"
              >
                <ArrowUp className="size-4" />
              </Button>
            </div>
          </form>
        </aside>

        <section className="rounded-[32px] border border-surface-warm-white/10 bg-[#eceae4] p-spacing-5 text-foreground-primary shadow-[0_24px_80px_rgba(0,0,0,0.22)]">
          <div className="mb-spacing-5 flex flex-wrap items-center justify-between gap-spacing-5 rounded-[22px] bg-surface-warm-white px-spacing-5 py-spacing-4">
            <div className="flex items-center gap-spacing-4 text-sm font-medium">
              <Globe2 className="size-4" aria-hidden="true" />
              Preview
            </div>
            <div className="flex rounded-full bg-surface-muted p-1 text-sm">
              <button
                type="button"
                onClick={() => setViewport("desktop")}
                className={`flex items-center gap-spacing-3 rounded-full px-spacing-6 py-spacing-3 transition ${viewport === "desktop" ? "bg-foreground-primary text-surface-warm-white" : "text-text-secondary hover:text-foreground-primary"}`}
              >
                <Monitor className="size-4" aria-hidden="true" />
                Web
              </button>
              <button
                type="button"
                onClick={() => setViewport("mobile")}
                className={`flex items-center gap-spacing-3 rounded-full px-spacing-6 py-spacing-3 transition ${viewport === "mobile" ? "bg-foreground-primary text-surface-warm-white" : "text-text-secondary hover:text-foreground-primary"}`}
              >
                <Smartphone className="size-4" aria-hidden="true" />
                Mobile
              </button>
            </div>
          </div>

          <div className="flex min-h-[640px] items-start justify-center overflow-auto rounded-[24px] bg-[#d8d3c8] p-spacing-5">
            <div
              className={`${viewport === "mobile" ? "max-w-[390px]" : "max-w-5xl"} w-full overflow-hidden rounded-[24px] bg-surface-warm-white shadow-[0_18px_48px_rgba(28,28,28,0.16)]`}
            >
              <div className="grid gap-spacing-10 p-spacing-10 md:grid-cols-[1.1fr_0.9fr] md:p-spacing-12">
                <div>
                  <p className="text-sm text-text-secondary">Preview website</p>
                  <h2 className="mt-spacing-7 text-[clamp(2.4rem,5vw,4.6rem)] font-semibold leading-[0.95] tracking-[-0.06em]">
                    {previewTitle}
                  </h2>
                  <p className="mt-spacing-7 max-w-xl text-lg leading-8 text-text-secondary">
                    Landing page yang dibuat untuk menjelaskan produk, membangun
                    rasa percaya, dan mengarahkan pembeli ke WhatsApp.
                  </p>
                  <Button className="mt-spacing-9 rounded-radius-lg bg-foreground-primary px-spacing-10 text-surface-warm-white hover:bg-foreground-primary/90">
                    Pesan via WhatsApp
                  </Button>
                </div>
                <div className="min-h-72 rounded-[28px] bg-[radial-gradient(circle_at_30%_20%,rgba(255,94,39,0.9),transparent_32%),radial-gradient(circle_at_72%_34%,rgba(255,31,128,0.76),transparent_30%),linear-gradient(135deg,#1c1c1c,#455ee8)]" />
              </div>
              <div className="grid gap-spacing-5 border-t border-foreground-primary/10 p-spacing-10 md:grid-cols-3">
                {["Copy jelas", "Visual rapi", "CTA fokus"].map((item) => (
                  <div
                    key={item}
                    className="rounded-radius-xl bg-surface-muted p-spacing-7"
                  >
                    <h3 className="font-semibold tracking-[-0.03em]">{item}</h3>
                    <p className="mt-spacing-4 text-sm leading-6 text-text-secondary">
                      Disusun agar pengunjung cepat paham dan mudah mengambil
                      tindakan.
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
