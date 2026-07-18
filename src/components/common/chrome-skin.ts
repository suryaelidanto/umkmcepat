// PROTOTYPE throwaway — chrome skins for header / account menu / footer.
// A = production current. Remove after a skin wins.

export type ChromeSkin = "A" | "B" | "C" | "D" | "E";

export const CHROME_SKINS: { key: ChromeSkin; label: string }[] = [
  { key: "A", label: "Current solid" },
  { key: "B", label: "Elevated match" },
  { key: "C", label: "Frosted glass" },
  { key: "D", label: "Minimal hairline" },
  { key: "E", label: "Soft pill" },
];

export const CHROME_KEYS = new Set(["A", "B", "C", "D", "E"]);

export function parseChromeSkin(raw: unknown): ChromeSkin {
  if (typeof raw === "string" && CHROME_KEYS.has(raw)) {
    return raw as ChromeSkin;
  }
  return "A";
}

export const headerSkin: Record<
  ChromeSkin,
  { bar: string; link: string; row: string }
> = {
  A: {
    bar: "border-b border-surface-warm-white/10 bg-[#151515]",
    link: "focus-visible:ring-offset-[#151515]",
    row: "h-16",
  },
  B: {
    bar: "border-b border-white/10 bg-[#1c1c1a]/95 shadow-[0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur-md",
    link: "focus-visible:ring-offset-[#1c1c1a]",
    row: "h-16",
  },
  C: {
    bar: "border-b border-white/10 bg-[#151515]/55 shadow-[0_8px_32px_rgba(0,0,0,0.25)] backdrop-blur-xl",
    link: "focus-visible:ring-offset-transparent",
    row: "h-16",
  },
  D: {
    bar: "border-b border-white/[0.07] bg-[#151515]",
    link: "focus-visible:ring-offset-[#151515]",
    row: "h-14",
  },
  E: {
    bar: "border-b border-white/10 bg-[#151515]",
    link: "focus-visible:ring-offset-[#151515]",
    row: "h-16",
  },
};

export const authSkin: Record<
  ChromeSkin,
  {
    login: string;
    trigger: string;
    menu: string;
    item: string;
    avatar: string;
  }
> = {
  A: {
    login:
      "rounded-radius-lg border-surface-warm-white/16 bg-surface-warm-white/8 px-spacing-8 text-surface-warm-white hover:bg-surface-warm-white/14 focus-visible:ring-2 focus-visible:ring-surface-warm-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#151515]",
    trigger:
      "rounded-full border border-surface-warm-white/16 bg-surface-warm-white/8 px-spacing-3 py-spacing-2 hover:bg-surface-warm-white/14 focus-visible:ring-offset-[#151515] sm:px-spacing-4",
    menu: "w-52 rounded-[18px] border border-surface-warm-white/12 bg-[#232321] p-spacing-2 ring-1 ring-surface-warm-white/6",
    item: "rounded-radius-lg px-spacing-4 py-spacing-3 hover:bg-surface-warm-white/8 focus-visible:bg-surface-warm-white/8",
    avatar:
      "size-7 bg-surface-warm-white text-xs font-semibold text-foreground-primary",
  },
  B: {
    login:
      "rounded-2xl border border-white/12 bg-[#1c1c1a] px-spacing-8 text-surface-warm-white shadow-[0_8px_24px_rgba(0,0,0,0.35)] hover:bg-[#242422] focus-visible:ring-2 focus-visible:ring-[#2f8cff]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#1c1c1a]",
    trigger:
      "rounded-2xl border border-white/10 bg-[#1c1c1a] px-spacing-3 py-spacing-2 shadow-[0_8px_24px_rgba(0,0,0,0.3)] hover:bg-[#242422] focus-visible:ring-2 focus-visible:ring-[#2f8cff]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#1c1c1a] sm:px-spacing-4",
    menu: "w-56 rounded-2xl border border-white/10 bg-[#1c1c1a] p-spacing-2 shadow-[0_24px_48px_rgba(0,0,0,0.5)] ring-1 ring-white/[0.05]",
    item: "rounded-xl px-spacing-4 py-spacing-3 hover:bg-white/[0.06] focus-visible:bg-white/[0.06]",
    avatar: "size-7 bg-white text-xs font-semibold text-[#141413]",
  },
  C: {
    login:
      "rounded-radius-lg border border-white/16 bg-white/[0.08] px-spacing-8 text-white backdrop-blur-md hover:bg-white/[0.14] focus-visible:ring-2 focus-visible:ring-white/70",
    trigger:
      "rounded-full border border-white/14 bg-white/[0.08] px-spacing-3 py-spacing-2 backdrop-blur-md hover:bg-white/[0.14] focus-visible:ring-2 focus-visible:ring-white/70 sm:px-spacing-4",
    menu: "w-52 rounded-[18px] border border-white/14 bg-[#1a1a18]/75 p-spacing-2 shadow-[0_20px_50px_rgba(0,0,0,0.45)] ring-1 ring-white/10 backdrop-blur-xl",
    item: "rounded-radius-lg px-spacing-4 py-spacing-3 hover:bg-white/10 focus-visible:bg-white/10",
    avatar: "size-7 bg-white/90 text-xs font-semibold text-[#141413]",
  },
  D: {
    login:
      "rounded-md border border-white/14 bg-transparent px-spacing-7 text-surface-warm-white hover:bg-white/[0.06] focus-visible:ring-1 focus-visible:ring-white/50",
    trigger:
      "rounded-md border border-transparent bg-transparent px-spacing-2 py-spacing-1.5 hover:bg-white/[0.05] focus-visible:ring-1 focus-visible:ring-white/40 sm:px-spacing-3",
    menu: "w-48 rounded-lg border border-white/10 bg-[#191918] p-1 shadow-xl",
    item: "rounded-md px-3 py-2.5 hover:bg-white/[0.06] focus-visible:bg-white/[0.06]",
    avatar:
      "size-6 bg-surface-warm-white text-[10px] font-semibold text-foreground-primary",
  },
  E: {
    login:
      "rounded-full border border-white/14 bg-white/10 px-spacing-8 text-white hover:bg-white/16 focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#151515]",
    trigger:
      "rounded-full border border-white/12 bg-white/[0.07] px-spacing-3 py-spacing-2 hover:bg-white/[0.12] focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#151515] sm:px-spacing-5",
    menu: "w-52 rounded-[22px] border border-white/12 bg-[#232321] p-spacing-2 ring-1 ring-white/[0.06]",
    item: "rounded-full px-spacing-4 py-spacing-3 hover:bg-white/[0.08] focus-visible:bg-white/[0.08]",
    avatar: "size-7 bg-white text-xs font-semibold text-[#141413]",
  },
};

export const footerSkin: Record<
  ChromeSkin,
  { bar: string; muted: string; link: string }
> = {
  A: {
    bar: "border-t border-surface-warm-white/10 bg-[#151515]",
    muted: "text-surface-warm-white/62",
    link: "text-surface-warm-white/62 hover:text-surface-warm-white focus-visible:text-surface-warm-white",
  },
  B: {
    bar: "border-t border-white/10 bg-[#1c1c1a]",
    muted: "text-surface-warm-white/58",
    link: "text-surface-warm-white/58 hover:text-white focus-visible:text-white",
  },
  C: {
    bar: "border-t border-white/10 bg-[#151515]/70 backdrop-blur-xl",
    muted: "text-white/60",
    link: "text-white/60 hover:text-white focus-visible:text-white",
  },
  D: {
    bar: "border-t border-white/[0.07] bg-[#151515]",
    muted: "text-surface-warm-white/50",
    link: "text-surface-warm-white/50 hover:text-surface-warm-white focus-visible:text-surface-warm-white",
  },
  E: {
    bar: "border-t border-white/10 bg-[#151515]",
    muted: "text-surface-warm-white/58",
    link: "text-surface-warm-white/58 hover:text-white focus-visible:text-white",
  },
};
