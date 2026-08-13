import type { GeneratedSiteDesignKitV1 } from "../generated-site-design-kits/types";
import type { GeneratedProjectFile } from "../generated-types";

const LAYOUT_SOURCE = (
  kitId: string,
): string => `import type { ReactElement, ReactNode } from "react";
import { cn } from "@/lib/utils";

const KIT_ID = "${kitId}";

const densityClasses = {
  compact: "py-12 md:py-16",
  regular: "py-16 md:py-24",
  airy: "py-24 md:py-32",
} as const;

const widthClasses = {
  reading: "max-w-2xl",
  content: "max-w-5xl",
  wide: "max-w-7xl",
} as const;

const surfaceClasses = {
  base: "bg-background text-foreground",
  muted: "bg-muted/40 text-foreground",
  contrast: "bg-foreground text-background",
} as const;

const stackClasses = {
  sm: "gap-3",
  md: "gap-6",
  lg: "gap-10",
  xl: "gap-16",
} as const;

export function SiteSection({
  children,
  density = "regular",
  surface = "base",
  width = "content",
  id,
  className,
}: {
  children: ReactNode;
  density?: keyof typeof densityClasses;
  surface?: keyof typeof surfaceClasses;
  width?: keyof typeof widthClasses;
  id?: string;
  className?: string;
}): ReactElement {
  return (
    <section id={id} data-site-kit={KIT_ID} className={cn(surfaceClasses[surface], densityClasses[density], className)}>
      <div className={cn("mx-auto w-full px-6", widthClasses[width])}>{children}</div>
    </section>
  );
}

export function SiteStack({
  children,
  gap = "md",
  className,
}: {
  children: ReactNode;
  gap?: keyof typeof stackClasses;
  className?: string;
}): ReactElement {
  return <div className={cn("flex flex-col", stackClasses[gap], className)}>{children}</div>;
}

export function SiteSplit({
  children,
  emphasis = "equal",
  className,
}: {
  children: ReactNode;
  emphasis?: "equal" | "leading" | "trailing";
  className?: string;
}): ReactElement {
  const columns = emphasis === "leading" ? "md:grid-cols-[1.2fr_.8fr]" : emphasis === "trailing" ? "md:grid-cols-[.8fr_1.2fr]" : "md:grid-cols-2";
  return <div className={cn("grid items-center gap-10 md:gap-16", columns, className)}>{children}</div>;
}

export function SiteCluster({
  children,
  justify = "start",
  className,
}: {
  children: ReactNode;
  justify?: "start" | "center" | "between";
  className?: string;
}): ReactElement {
  const justifyClass = justify === "center" ? "justify-center" : justify === "between" ? "justify-between" : "justify-start";
  return <div className={cn("flex flex-wrap items-center gap-3", justifyClass, className)}>{children}</div>;
}
`;

export function createGeneratedSitePrimitiveFiles(
  kit: GeneratedSiteDesignKitV1,
): GeneratedProjectFile[] {
  if (!kit.primitiveFileIds.includes("site-layout-v1")) {
    throw new Error(
      `generated-site kit lacks site layout primitive: ${kit.id}`,
    );
  }
  return [
    {
      path: "src/components/site/layout.tsx",
      content: LAYOUT_SOURCE(kit.id),
    },
  ];
}
