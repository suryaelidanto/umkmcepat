import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function DashboardCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-radius-lg border border-black/10 bg-[#fcfbf8] shadow-sm transition-colors duration-200 dark:border-surface-warm-white/12 dark:bg-surface-warm-white/[0.04] dark:shadow-none",
        className,
      )}
    >
      {children}
    </div>
  );
}
