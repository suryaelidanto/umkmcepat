import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-radius-lg text-sm font-[480] leading-[21px] transition-colors disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-action-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-invalid:ring-destructive/20 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          "bg-action-primary text-surface-warm-white hover:bg-action-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-foreground-primary/12 bg-surface-warm-white text-foreground-primary hover:bg-surface-muted",
        secondary:
          "bg-surface-muted text-foreground-primary hover:bg-surface-base",
        ghost: "text-foreground-primary hover:bg-surface-muted",
        link: "text-foreground-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-spacing-8 py-spacing-3 has-[>svg]:px-spacing-7",
        sm: "h-9 rounded-radius-md gap-spacing-3 px-spacing-7 has-[>svg]:px-spacing-6",
        lg: "h-12 rounded-radius-lg px-spacing-10 has-[>svg]:px-spacing-9",
        icon: "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
