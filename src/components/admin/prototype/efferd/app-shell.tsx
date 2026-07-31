"use client";

// PROTOTYPE — Efferd-inspired app shell for admin B–E. Throwaway.

import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import {
  ClipboardList,
  CreditCard,
  FolderKanban,
  LayoutDashboard,
  Menu,
  MessageSquare,
  Settings,
  Users,
  X,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import { type AdminVariant, withVariant } from "../types";

import { useStreamerMode } from "@/components/admin/streamer-mode-context";
import { Link } from "@/components/ui/link";
import { fetchJson } from "@/lib/query-client";
import { cn } from "@/lib/utils";

const TABS = [
  { label: "Ringkasan", to: "/admin", icon: LayoutDashboard },
  { label: "Pengguna", to: "/admin/users", icon: Users },
  { label: "Proyek", to: "/admin/projects", icon: FolderKanban },
  { label: "Antrean", to: "/admin/waitlist", icon: ClipboardList },
  { label: "Tiket", to: "/admin/tickets", icon: MessageSquare },
  { label: "Transaksi", to: "/admin/transactions", icon: CreditCard },
  { label: "Pengaturan", to: "/admin/settings", icon: Settings },
] as const;

function useUnread() {
  const q = useQuery({
    queryFn: () =>
      fetchJson<{ adminUnreadCount: number }>(
        "/api/admin/tickets/unread-count",
      ),
    queryKey: ["admin", "unread-tickets-count"],
    refetchOnWindowFocus: true,
  });
  return q.data?.adminUnreadCount ?? 0;
}

function NavLinks({
  variant,
  vertical,
  onNavigate,
}: {
  variant: AdminVariant;
  vertical?: boolean;
  onNavigate?: () => void;
}) {
  const { location } = useRouterState();
  const unread = useUnread();

  return (
    <nav
      aria-label="Navigasi admin"
      className={cn(
        vertical
          ? "flex flex-col gap-1 p-2"
          : "flex gap-1 overflow-x-auto border-b border-surface-warm-white/10 py-2",
      )}
    >
      {TABS.map((tab) => {
        const active =
          tab.to === "/admin"
            ? location.pathname === "/admin"
            : location.pathname.startsWith(tab.to);
        const Icon = tab.icon;
        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-radius-md text-sm",
              vertical
                ? "px-3 py-2"
                : "px-spacing-3 py-spacing-2 whitespace-nowrap",
              active
                ? "bg-surface-warm-white/15 font-medium text-surface-warm-white"
                : "text-surface-warm-white/70 hover:bg-surface-warm-white/8",
            )}
            href={withVariant(tab.to, variant)}
            key={tab.to}
            onClick={onNavigate}
          >
            <Icon className="size-4 shrink-0 opacity-80" />
            <span className="flex-1">{tab.label}</span>
            {tab.to === "/admin/tickets" && unread > 0 ? (
              <span className="flex size-4.5 items-center justify-center rounded-full bg-surface-warm-white/20 text-[9px] font-bold">
                {unread}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

function StreamerPill() {
  const on = useStreamerMode();
  return (
    <span
      className={cn(
        "rounded-radius-sm border px-2 py-0.5 text-[10px] font-medium",
        on
          ? "border-surface-warm-white/40 bg-surface-warm-white/10"
          : "border-surface-warm-white/15 text-surface-warm-white/50",
      )}
    >
      Streamer {on ? "ON" : "OFF"}
    </span>
  );
}

/** B — wide dense top chrome (Efferd dashboard density) */
function ShellB({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-spacing-4 pb-24 pt-spacing-4 text-surface-warm-white">
      <header className="mb-spacing-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.14em] text-surface-warm-white/45">
            Kontrol
          </p>
          <h1 className="text-2xl font-semibold">Admin</h1>
        </div>
        <StreamerPill />
      </header>
      <NavLinks variant="B" />
      <div className="mt-spacing-4">{children}</div>
    </main>
  );
}

/** C — classic app shell sidebar */
function ShellC({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-h-dvh w-full text-surface-warm-white">
      <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r border-surface-warm-white/10 bg-surface-warm-white/[0.03] md:flex">
        <div className="flex items-center justify-between px-4 py-4">
          <span className="text-sm font-semibold">Admin</span>
          <StreamerPill />
        </div>
        <NavLinks variant="C" vertical />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-surface-warm-white/10 px-4 py-3 md:hidden">
          <button
            aria-label={open ? "Tutup menu" : "Buka menu"}
            className="rounded-radius-md border border-surface-warm-white/15 p-2"
            onClick={() => setOpen((v) => !v)}
            type="button"
          >
            {open ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>
          <h1 className="text-lg font-semibold">Admin</h1>
          <div className="ml-auto">
            <StreamerPill />
          </div>
        </div>
        {open ? (
          <div className="border-b border-surface-warm-white/10 md:hidden">
            <NavLinks onNavigate={() => setOpen(false)} variant="C" vertical />
          </div>
        ) : null}
        <div className="mx-auto w-full max-w-5xl flex-1 px-spacing-4 pb-24 pt-spacing-4">
          {children}
        </div>
      </div>
    </div>
  );
}

/** D — full-bleed chart/table canvas */
function ShellD({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-7xl flex-col px-spacing-4 pb-24 pt-spacing-3 text-surface-warm-white">
      <header className="sticky top-0 z-10 -mx-spacing-4 border-b border-surface-warm-white/10 bg-[#151515]/95 px-spacing-4 backdrop-blur">
        <div className="flex items-center justify-between py-2">
          <h1 className="text-lg font-semibold">Admin · analytics</h1>
          <StreamerPill />
        </div>
        <NavLinks variant="D" />
      </header>
      <div className="mt-spacing-5">{children}</div>
    </main>
  );
}

/** E — ops command strip */
function ShellE({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-spacing-3 pb-24 pt-spacing-2 text-surface-warm-white">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-surface-warm-white/15 py-2">
        <div className="flex items-baseline gap-2">
          <h1 className="text-sm font-semibold uppercase tracking-[0.12em]">
            Admin
          </h1>
          <span className="text-[10px] text-surface-warm-white/45">ops</span>
        </div>
        <StreamerPill />
      </header>
      <NavLinks variant="E" />
      <div className="mt-spacing-3 text-[13px] leading-snug">{children}</div>
    </main>
  );
}

export function EfferdAppShell({
  variant,
  children,
}: {
  variant: Exclude<AdminVariant, "A">;
  children: ReactNode;
}) {
  if (variant === "B") {
    return <ShellB>{children}</ShellB>;
  }
  if (variant === "C") {
    return <ShellC>{children}</ShellC>;
  }
  if (variant === "D") {
    return <ShellD>{children}</ShellD>;
  }
  return <ShellE>{children}</ShellE>;
}
