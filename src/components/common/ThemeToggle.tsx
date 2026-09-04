"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted
    ? resolvedTheme === "dark"
    : typeof document !== "undefined"
      ? document.documentElement.classList.contains("dark")
      : false;

  function toggleTheme() {
    setTheme(isDark ? "light" : "dark");
  }

  return (
    <button
      type="button"
      id="header-theme-toggle"
      onClick={toggleTheme}
      className="inline-flex size-8 items-center justify-center rounded-lg border border-border/90 bg-card text-foreground shadow-2xs transition-all hover:border-foreground/30 hover:bg-muted cursor-pointer active:scale-95 focus-visible:outline-none dark:border-white/15 dark:bg-[#252522] dark:hover:bg-[#2e2e2a]"
      aria-label="Ganti mode tampilan"
      title={
        mounted
          ? isDark
            ? "Mode Terang"
            : "Mode Gelap"
          : "Ganti Mode Tampilan"
      }
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-4 text-accent-orange hidden dark:block"
        aria-hidden="true"
      >
        <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
      </svg>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-4 text-[#5f5f5d] transition-colors hover:text-[#1c1c1c] block dark:hidden"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
      </svg>
    </button>
  );
}
