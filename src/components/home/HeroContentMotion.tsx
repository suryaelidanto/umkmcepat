import type React from "react";

export function HeroContentMotion({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-5.5rem)] sm:min-h-[calc(100dvh-6rem)] w-full max-w-5xl flex-col items-center justify-center text-center pb-12 sm:pb-16 -translate-y-6 sm:-translate-y-10">
      {children}
    </div>
  );
}

export function HeroMotionItem({
  children,
  className = "",
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className={className} style={style}>
      {children}
    </div>
  );
}
