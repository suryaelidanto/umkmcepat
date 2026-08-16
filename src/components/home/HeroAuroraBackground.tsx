"use client";

import { useEffect, useRef } from "react";

export function HeroAuroraBackground() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        el.classList.toggle("hero-aurora-paused", !entry.isIntersecting);
      },
      { threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="hero-aurora-orbs absolute inset-0 -z-10 overflow-hidden transition-colors duration-200"
    >
      <div className="hero-aurora-orb hero-aurora-orb-1" />
      <div className="hero-aurora-orb hero-aurora-orb-2" />
      <div className="hero-aurora-orb hero-aurora-orb-3" />
      <div className="hero-aurora-orb hero-aurora-orb-core" />
      <div className="hero-aurora-static-vignette" />
      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-[#eceae4] to-transparent dark:from-[#151515]" />
      <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-[#eceae4] via-aurora-orange/20 to-transparent dark:from-aurora-orange dark:via-aurora-rose/58" />
    </div>
  );
}
