import type React from "react";

export function HeroContentMotion({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-12rem)] w-full max-w-5xl flex-col items-center justify-center text-center">
      {children}
    </div>
  );
}

export function HeroMotionItem({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`hero-reveal ${className}`}>{children}</div>;
}
