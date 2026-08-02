import type { AdminStatusTone } from "./admin-status";
import type { ReactNode } from "react";

const TONE_CLASS: Record<AdminStatusTone, string> = {
  success:
    "border-surface-warm-white/50 bg-surface-warm-white/15 text-surface-warm-white",
  pending:
    "border-surface-warm-white/30 bg-surface-warm-white/8 text-surface-warm-white/90",
  danger: "border-destructive/50 bg-destructive/15 text-destructive",
  neutral:
    "border-surface-warm-white/12 bg-transparent text-surface-warm-white/70",
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
