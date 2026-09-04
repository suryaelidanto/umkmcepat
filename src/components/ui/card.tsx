import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

const cardVariants = cva(
  "group/card relative flex flex-col overflow-hidden rounded-radius-2xl border border-border text-card-foreground transition-all duration-200",
  {
    variants: {
      variant: {
        default: "bg-card shadow-2xs",
        muted: "bg-muted/40 shadow-2xs",
        outline: "bg-transparent",
        sunken: "bg-surface-sunken",
      },
      size: {
        default: "p-spacing-7 sm:p-spacing-8",
        sm: "p-spacing-5 sm:p-spacing-6",
        lg: "p-spacing-8 sm:p-spacing-9",
        none: "p-0",
      },
      interactive: {
        true: "cursor-pointer hover:border-foreground/20 hover:shadow-xs active:scale-[0.995]",
        false: "",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
      interactive: false,
    },
  },
);

export interface CardProps
  extends React.ComponentProps<"div">, VariantProps<typeof cardVariants> {
  as?: React.ElementType;
}

function Card({
  className,
  variant,
  size,
  interactive,
  as: Component = "div",
  ...props
}: CardProps) {
  return (
    <Component
      data-slot="card"
      data-interactive={interactive ? "true" : undefined}
      className={cn(cardVariants({ variant, size, interactive, className }))}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn("flex flex-col gap-spacing-2", className)}
      {...props}
    />
  );
}

function CardTitle({
  className,
  as: Component = "h3",
  ...props
}: React.ComponentProps<"h3"> & { as?: React.ElementType }) {
  return (
    <Component
      data-slot="card-title"
      className={cn(
        "text-lg font-semibold tracking-tight text-foreground sm:text-xl",
        className,
      )}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground leading-relaxed", className)}
      {...props}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn("shrink-0", className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("flex-1", className)}
      {...props}
    />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center gap-spacing-3 pt-spacing-4", className)}
      {...props}
    />
  );
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
  cardVariants,
};
