import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action-primary select-none",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        secondary: "bg-muted text-foreground hover:bg-muted/80",
        outline:
          "border border-border bg-transparent text-foreground hover:bg-muted/50",
        success:
          "border border-status-success/30 bg-status-success/15 text-status-success dark:bg-status-success/20",
        warning:
          "border border-status-warning/30 bg-status-warning/15 text-status-warning dark:bg-status-warning/20",
        destructive:
          "border border-destructive/30 bg-destructive/15 text-destructive dark:bg-destructive/20",
        accent:
          "border border-accent-orange/30 bg-accent-orange/15 text-accent-orange dark:bg-accent-orange/20",
      },
      size: {
        default: "h-6 px-2.5 text-xs rounded-full",
        sm: "h-5 px-2 text-[11px] rounded-full",
        lg: "h-7 px-3 text-xs rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface BadgeProps
  extends
    React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  as?: React.ElementType;
  href?: string;
  target?: string;
  rel?: string;
}

function Badge({
  className,
  variant,
  size,
  as: Component = "span",
  ...props
}: BadgeProps) {
  return (
    <Component
      data-slot="badge"
      className={cn(badgeVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
