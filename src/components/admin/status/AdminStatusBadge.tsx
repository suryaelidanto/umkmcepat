import type { AdminStatusTone } from "./admin-status";
import type { ReactNode } from "react";

const TONE_CLASS: Record<AdminStatusTone, string> = {
  success:
    "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/15 dark:text-emerald-300",
  pending:
    "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:border-amber-400/30 dark:bg-amber-400/15 dark:text-amber-300",
  danger:
    "border-destructive/30 bg-destructive/10 text-destructive dark:border-destructive/40 dark:bg-destructive/15 dark:text-destructive",
  neutral:
    "border-black/10 bg-black/[0.04] text-[#5f5f5d] dark:border-white/10 dark:bg-white/[0.06] dark:text-surface-warm-white/70",
};

export function AdminStatusBadge({
  tone,
  children,
}: {
  tone: AdminStatusTone;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-spacing-2 py-0.5 text-[11px] font-medium leading-none ${TONE_CLASS[tone]}`}
    >
      {children}
    </span>
  );
}
