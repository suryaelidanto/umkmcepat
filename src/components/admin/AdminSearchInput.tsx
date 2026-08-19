import { Search } from "lucide-react";

import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export function AdminSearchInput({
  className,
  ...props
}: ComponentProps<"input">) {
  return (
    <div className="relative w-full">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#5f5f5d] dark:text-surface-warm-white/40"
        aria-hidden="true"
      />
      <input
        type="text"
        className={cn(
          "h-10 w-full rounded-xl border border-black/15 bg-white pl-9 pr-3 text-sm text-[#1c1c1c] outline-none transition placeholder:text-[#5f5f5d]/60 focus:border-accent-orange focus:ring-1 focus:ring-accent-orange dark:border-white/15 dark:bg-white/[0.04] dark:text-surface-warm-white dark:placeholder:text-surface-warm-white/40",
          className,
        )}
        {...props}
      />
    </div>
  );
}
