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
        "flex flex-col overflow-hidden rounded-radius-lg border border-surface-warm-white/12 bg-surface-warm-white/[0.04]",
        className,
      )}
    >
      {children}
    </div>
  );
}
