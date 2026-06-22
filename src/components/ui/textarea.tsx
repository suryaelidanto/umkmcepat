import * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "placeholder:text-text-secondary flex field-sizing-content min-h-24 w-full rounded-radius-lg border border-foreground-primary/12 bg-surface-warm-white px-spacing-7 py-spacing-6 text-base leading-[24px] text-foreground-primary transition-[color,box-shadow,border-color] outline-none focus-visible:border-action-primary focus-visible:ring-2 focus-visible:ring-action-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 md:text-sm aria-invalid:ring-destructive/20 aria-invalid:border-destructive",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
