import * as React from "react";

import { cn } from "@/lib/utils";

export function DarkPage({
  className,
  ...props
}: React.ComponentProps<"main">) {
  return (
    <main
      className={cn(
        "min-h-[calc(100dvh-4rem)] bg-[#eceae4] px-4 py-spacing-12 text-[#1c1c1c] transition-colors duration-200 dark:bg-[#151515] dark:text-surface-warm-white sm:px-spacing-9 lg:px-spacing-10",
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
        "rounded-[32px] border border-black/10 bg-[#fcfbf8] p-spacing-6 shadow-sm transition-colors duration-200 dark:border-surface-warm-white/10 dark:bg-[#232321] dark:shadow-[0_24px_80px_rgba(0,0,0,0.28)] sm:p-spacing-8",
        className,
      )}
      {...props}
    />
  );
}
