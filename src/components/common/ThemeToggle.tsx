"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted ? resolvedTheme === "dark" : true;

  return (
    <div
      id="header-theme-toggle"
      className={`relative inline-grid grid-cols-2 rounded-full p-[3px] shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)] transition-colors ${
        isDark
          ? "border border-white/10 bg-[#10100f]"
          : "border border-black/10 bg-[#e2dfd7]"
      }`}
      role="radiogroup"
      aria-label="Pilih tema tampilan"
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute left-[3px] top-[3px] h-[calc(100%-6px)] w-[calc(50%-3px)] rounded-full transition-transform duration-200 ease-out ${
          isDark
            ? "bg-[#ff7a59] shadow-[0_1px_4px_rgba(0,0,0,0.4)] translate-x-0"
            : "bg-white shadow-[0_1px_3px_rgba(0,0,0,0.12)] translate-x-full"
        }`}
      />
      <button
        id="header-btn-dark"
        type="button"
        role="radio"
        aria-checked={isDark}
        onClick={() => setTheme("dark")}
        className={`relative z-10 inline-flex items-center justify-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold tracking-tight transition-colors ${
          isDark ? "text-[#151515]" : "text-[#6b6964] hover:text-[#1c1c1c]"
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-3.5"
        >
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
        </svg>
        <span>Gelap</span>
      </button>
      <button
        id="header-btn-light"
        type="button"
        role="radio"
        aria-checked={!isDark}
        onClick={() => setTheme("light")}
        className={`relative z-10 inline-flex items-center justify-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold tracking-tight transition-colors ${
          !isDark
            ? "text-[#1c1c1c]"
            : "text-surface-warm-white/55 hover:text-surface-warm-white"
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-3.5"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        </svg>
        <span>Terang</span>
      </button>
    </div>
  );
}
