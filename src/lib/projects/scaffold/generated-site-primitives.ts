import type { GeneratedSiteDesignKitV1 } from "../generated-site-design-kits/types";
import type { GeneratedProjectFile } from "../generated-types";
import type { GeneratedSiteDesignKitV2 } from "../professional-site-kits";

type GeneratedSiteKit = GeneratedSiteDesignKitV1 | GeneratedSiteDesignKitV2;

const LAYOUT_SOURCE = (
  kitId: string,
  version: "v1" | "v2",
): string => `import type { ReactElement, ReactNode } from "react";
import { cn } from "@/lib/utils";

const KIT_ID = "${kitId}";
const KIT_VERSION = "${version}";

const densityClasses = {
  compact: "py-12 md:py-16",
  regular: "py-16 md:py-24",
  airy: "py-24 md:py-32",
} as const;

const widthClasses = {
  reading: "max-w-2xl",
  content: "max-w-5xl",
  wide: "max-w-7xl",
  full: "w-full",
} as const;

const surfaceClasses = {
  base: "bg-background text-foreground",
  muted: "bg-muted/40 text-foreground",
  contrast: "bg-foreground text-background",
  card: "bg-card text-card-foreground",
  accent: "bg-accent text-accent-foreground",
} as const;

const stackClasses = {
  xs: "gap-2",
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
    <section
      id={id}
      data-site-kit={KIT_ID}
      data-site-kit-version={KIT_VERSION}
      data-section-id={id}
      className={cn(surfaceClasses[surface], densityClasses[density], className)}
    >
      <div className={cn("mx-auto w-full px-6", widthClasses[width])}>
        {children}
      </div>
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
  return (
    <div className={cn("flex flex-col", stackClasses[gap], className)}>
      {children}
    </div>
  );
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
  const columns =
    emphasis === "leading"
      ? "md:grid-cols-[1.2fr_.8fr]"
      : emphasis === "trailing"
        ? "md:grid-cols-[.8fr_1.2fr]"
        : "md:grid-cols-2";
  return (
    <div className={cn("grid items-center gap-10 md:gap-16", columns, className)}>
      {children}
    </div>
  );
}

export function SiteCluster({
  children,
  justify = "start",
  className,
}: {
  children: ReactNode;
  justify?: "start" | "center" | "between" | "end";
  className?: string;
}): ReactElement {
  const justifyClass =
    justify === "center"
      ? "justify-center"
      : justify === "between"
        ? "justify-between"
        : justify === "end"
          ? "justify-end"
          : "justify-start";
  return (
    <div className={cn("flex flex-wrap items-center gap-3", justifyClass, className)}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 21st.dev-Inspired Creative Component Primitives

export function BentoGrid({
  children,
  cols = 3,
  className,
}: {
  children: ReactNode;
  cols?: 2 | 3 | 4;
  className?: string;
}): ReactElement {
  const gridCols =
    cols === 2
      ? "md:grid-cols-2"
      : cols === 4
        ? "md:grid-cols-2 lg:grid-cols-4"
        : "md:grid-cols-2 lg:grid-cols-3";
  return (
    <div className={cn("grid gap-4 sm:gap-6", gridCols, className)}>
      {children}
    </div>
  );
}

export function BentoCard({
  children,
  colSpan = 1,
  rowSpan = 1,
  className,
}: {
  children: ReactNode;
  colSpan?: 1 | 2 | 3;
  rowSpan?: 1 | 2;
  className?: string;
}): ReactElement {
  const colClass =
    colSpan === 2
      ? "md:col-span-2"
      : colSpan === 3
        ? "md:col-span-2 lg:col-span-3"
        : "col-span-1";
  const rowClass = rowSpan === 2 ? "row-span-2" : "row-span-1";
  return (
    <div
      className={cn(
        "relative flex flex-col justify-between overflow-hidden rounded-[1.75rem] border border-border bg-card p-6 sm:p-8 shadow-xs transition-all duration-300 hover:shadow-md",
        colClass,
        rowClass,
        className
      )}
    >
      {children}
    </div>
  );
}

export function BadgePill({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}): ReactElement {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/60 px-3.5 py-1 text-xs font-semibold tracking-wide text-foreground shadow-2xs backdrop-blur-xs",
        className
      )}
    >
      {children}
    </span>
  );
}

export function StatCounter({
  value,
  label,
  className,
}: {
  value: string;
  label: string;
  className?: string;
}): ReactElement {
  return (
    <div className={cn("flex flex-col gap-1 rounded-2xl border border-border/80 bg-card p-4 sm:p-5", className)}>
      <span className="font-serif text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
        {value}
      </span>
      <span className="text-xs font-medium text-muted-foreground sm:text-sm">
        {label}
      </span>
    </div>
  );
}

export function TestimonialCard({
  quote,
  author,
  role,
  rating = 5,
  className,
}: {
  quote: string;
  author: string;
  role?: string;
  rating?: number;
  className?: string;
}): ReactElement {
  return (
    <div className={cn("flex flex-col justify-between rounded-3xl border border-border bg-card p-6 sm:p-8 shadow-xs", className)}>
      <div>
        {rating > 0 && (
          <div className="mb-4 flex gap-1 text-accent text-sm" aria-label={\`Rating \${rating} bintang\`}>
            {"★".repeat(Math.min(5, Math.max(1, rating)))}
          </div>
        )}
        <p className="font-serif text-lg leading-relaxed text-foreground sm:text-xl">
          "{quote}"
        </p>
      </div>
      <div className="mt-6 flex items-center gap-3 border-t border-border pt-4">
        <div className="flex size-10 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground text-sm">
          {author.slice(0, 2).toUpperCase()}
        </div>
        <div>
          <p className="text-sm font-bold text-foreground">{author}</p>
          {role && <p className="text-xs text-muted-foreground">{role}</p>}
        </div>
      </div>
    </div>
  );
}

${
  version === "v2"
    ? `export function SiteFirstView({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}): ReactElement {
  return (
    <section data-first-view className={cn("min-h-[70dvh]", className)}>
      {children}
    </section>
  );
}

export function SiteSignature({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}): ReactElement {
  return (
    <div data-signature className={cn("relative", className)}>
      {children}
    </div>
  );
}
`
    : ""
}
`;

export function createGeneratedSitePrimitiveFiles(
  kit: GeneratedSiteKit,
): GeneratedProjectFile[] {
  const version = "v2" in kit || "version" in kit ? "v1" : "v2";
  return [
    {
      path: "src/components/site/layout.tsx",
      content: LAYOUT_SOURCE(kit.id, version),
    },
  ];
}
