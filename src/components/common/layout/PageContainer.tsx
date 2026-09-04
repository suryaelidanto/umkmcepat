import type * as React from "react";

import { cn } from "@/lib/utils";

export type PageContainerSize = "sm" | "default" | "lg" | "full";

export interface PageContainerProps extends React.ComponentProps<"div"> {
  as?: React.ElementType;
  size?: PageContainerSize;
  padded?: boolean;
  [key: `data-${string}`]: unknown;
}

const sizeClasses: Record<PageContainerSize, string> = {
  sm: "max-w-4xl",
  default: "max-w-6xl",
  lg: "max-w-7xl",
  full: "w-full",
};

export function PageContainer({
  as: Component = "div",
  size = "default",
  padded = true,
  className,
  children,
  ...props
}: PageContainerProps) {
  return (
    <Component
      className={cn(
        "mx-auto w-full",
        sizeClasses[size],
        padded && "px-4 sm:px-6 lg:px-8",
        className,
      )}
      {...props}
    >
      {children}
    </Component>
  );
}

export type SectionContainerSpacing = "sm" | "default" | "lg";

export interface SectionContainerProps extends React.ComponentProps<"section"> {
  as?: React.ElementType;
  size?: PageContainerSize;
  spacing?: SectionContainerSpacing;
  padded?: boolean;
  containerClassName?: string;
  [key: `data-${string}`]: unknown;
}

const spacingClasses: Record<SectionContainerSpacing, string> = {
  sm: "py-8 sm:py-10",
  default: "py-spacing-12 sm:py-spacing-13 lg:py-spacing-14",
  lg: "py-spacing-14 sm:py-spacing-15 lg:py-spacing-16",
};

export function SectionContainer({
  as: Component = "section",
  size = "default",
  spacing = "default",
  padded = true,
  className,
  containerClassName,
  children,
  ...props
}: SectionContainerProps) {
  return (
    <Component
      className={cn(
        "w-full bg-background text-foreground",
        spacingClasses[spacing],
        className,
      )}
      {...props}
    >
      <PageContainer size={size} padded={padded} className={containerClassName}>
        {children}
      </PageContainer>
    </Component>
  );
}
