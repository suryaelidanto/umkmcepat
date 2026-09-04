"use client";

import { ArrowLeft, Globe2, Menu, MessageCircle, Pencil } from "lucide-react";

export type WorkspaceNavigationProps = {
  hasPreview: boolean;
  mobileSurface: "chat" | "preview";
  onOpenChat: () => void;
  onOpenMenu: () => void;
  onOpenPreview: () => void;
  onOpenRename: () => void;
  projectTitle: string;
  readOnly?: boolean;
};

export function WorkspaceNavigation({
  hasPreview,
  mobileSurface,
  onOpenChat,
  onOpenMenu,
  onOpenPreview,
  onOpenRename,
  projectTitle,
  readOnly = false,
}: WorkspaceNavigationProps) {
  return (
    <nav
      aria-label="Pilih tampilan ruang kerja"
      className="sticky bottom-0 z-20 flex flex-col gap-1 border-t border-black/10 bg-[#eceae4] px-3 py-1.5 pb-[calc(env(safe-area-inset-bottom)+0.375rem)] dark:border-surface-warm-white/10 dark:bg-[#1b1b19] lg:hidden"
    >
      {projectTitle ? (
        <div className="mx-auto flex max-w-[280px] items-center justify-center gap-1.5">
          <span
            className="truncate text-xs font-medium text-[#5f5f5d] dark:text-surface-warm-white/50"
            title={projectTitle}
          >
            {projectTitle}
          </span>
          {!readOnly ? (
            <button
              type="button"
              onClick={onOpenRename}
              className="flex size-5 items-center justify-center rounded-full text-[#5f5f5d] transition-colors hover:bg-black/5 hover:text-[#1c1c1c] dark:text-surface-warm-white/60 dark:hover:bg-white/10 dark:hover:text-surface-warm-white"
              aria-label="Ubah nama website"
            >
              <Pencil className="size-3" />
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="flex w-full items-center justify-between gap-1.5">
        <a
          href="/"
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-black/10 text-[#5f5f5d] transition-colors hover:bg-black/5 hover:text-[#1c1c1c] dark:border-surface-warm-white/10 dark:text-surface-warm-white/70 dark:hover:bg-surface-warm-white/8"
          title="Kembali ke Dashboard"
          aria-label="Kembali ke Dashboard"
        >
          <ArrowLeft className="size-4" />
        </a>
        {hasPreview ? (
          <div className="flex flex-1 items-center gap-1.5 rounded-xl border border-black/10 bg-black/5 p-1 dark:border-surface-warm-white/10 dark:bg-surface-warm-white/5">
            <button
              type="button"
              aria-pressed={mobileSurface === "chat"}
              onClick={onOpenChat}
              className="inline-flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 truncate rounded-lg text-xs font-semibold transition-colors aria-pressed:bg-white aria-pressed:text-[#1c1c1c] aria-pressed:shadow-xs text-[#5f5f5d] dark:aria-pressed:bg-surface-warm-white dark:aria-pressed:text-foreground-primary dark:text-surface-warm-white/70 cursor-pointer"
            >
              <MessageCircle className="size-3.5 shrink-0" />
              <span className="truncate">Diskusi</span>
            </button>
            <button
              type="button"
              aria-pressed={mobileSurface === "preview"}
              onClick={onOpenPreview}
              className="inline-flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 truncate rounded-lg text-xs font-semibold transition-colors aria-pressed:bg-white aria-pressed:text-[#1c1c1c] aria-pressed:shadow-xs text-[#5f5f5d] dark:aria-pressed:bg-surface-warm-white dark:aria-pressed:text-foreground-primary dark:text-surface-warm-white/70 cursor-pointer"
            >
              <Globe2 className="size-3.5 shrink-0" />
              <span className="truncate">Tampilan</span>
            </button>
          </div>
        ) : (
          <div className="flex min-w-0 flex-1 items-center justify-center px-2">
            <span className="truncate text-xs font-bold text-foreground dark:text-surface-warm-white">
              {projectTitle}
            </span>
          </div>
        )}
        <button
          type="button"
          aria-label="Buka menu proyek"
          onClick={onOpenMenu}
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-black/10 text-[#5f5f5d] transition-colors hover:bg-black/5 hover:text-[#1c1c1c] dark:border-surface-warm-white/10 dark:text-surface-warm-white/70 dark:hover:bg-surface-warm-white/8 cursor-pointer"
        >
          <Menu className="size-4" />
        </button>
      </div>
    </nav>
  );
}
