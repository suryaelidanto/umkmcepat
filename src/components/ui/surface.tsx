import * as React from "react";

import { cn } from "@/lib/utils";

export function DarkPage({
  className,
  ...props
}: React.ComponentProps<"main">) {
  return (
    <main
      className={cn(
        "min-h-[calc(100dvh-4rem)] bg-[#151515] px-4 py-spacing-12 text-surface-warm-white sm:px-spacing-9 lg:px-spacing-10",
        className,
      )}
      {...props}
    />
  );
}

export function DarkCard({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "rounded-[32px] border border-surface-warm-white/10 bg-[#232321] p-spacing-6 shadow-[0_24px_80px_rgba(0,0,0,0.28)] sm:p-spacing-8",
        className,
      )}
      {...props}
    />
  );
}
