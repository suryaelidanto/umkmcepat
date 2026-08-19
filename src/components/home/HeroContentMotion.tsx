import type React from "react";

export function HeroContentMotion({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-15rem)] sm:min-h-[calc(100dvh-13rem)] w-full max-w-5xl flex-col items-center justify-center text-center -translate-y-4 sm:-translate-y-6">
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
