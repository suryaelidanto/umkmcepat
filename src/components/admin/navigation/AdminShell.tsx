"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import {
  EyeOff,
  ShieldCheck,
  ClipboardList,
  CreditCard,
  FolderKanban,
  LayoutDashboard,
  MessageSquare,
  Settings,
  Users,
} from "lucide-react";

import type { ReactNode } from "react";

import { useStreamerMode } from "@/components/admin/streamer-mode/streamer-mode-context";
import { Link } from "@/components/ui/link";
import {
  ADMIN_SUMMARY_POLL_MS,
  fetchJson,
  queryKeys,
} from "@/lib/query-client";
import { cn } from "@/lib/utils";

type AdminNavCounts = {
  waitlistPending: number;
  ticketsUnread: number;
  paymentsPending: number;
  projectsReady: number;
  usersTotal: number;
};

const TABS = [
  {
    label: "Ringkasan",
    to: "/admin",
    icon: LayoutDashboard,
    badge: null,
  },
  {
    label: "Antrean",
    to: "/admin/waitlist",
    icon: ClipboardList,
    badge: "waitlistPending" as const,
  },
  {
    label: "Pengguna",
    to: "/admin/users",
    icon: Users,
    badge: "usersTotal" as const,
  },
  {
    label: "Proyek",
    to: "/admin/projects",
    icon: FolderKanban,
    badge: "projectsReady" as const,
  },
  {
    label: "Tiket",
    to: "/admin/tickets",
    icon: MessageSquare,
    badge: "ticketsUnread" as const,
  },
  {
    label: "Transaksi",
    to: "/admin/transactions",
    icon: CreditCard,
    badge: "paymentsPending" as const,
  },
  {
    label: "Pengaturan",
    to: "/admin/settings",
    icon: Settings,
    badge: null,
  },
] as const;

function formatBadge(n: number): string {
  if (n > 99) {
    return "99+";
  }
  return String(n);
}

function useNavCounts(): AdminNavCounts {
  const q = useQuery({
    queryFn: () => fetchJson<AdminNavCounts>("/api/admin/nav-counts"),
    queryKey: queryKeys.adminNavCounts,
    refetchInterval: ADMIN_SUMMARY_POLL_MS,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
  });
  return (
    q.data ?? {
      waitlistPending: 0,
      ticketsUnread: 0,
      paymentsPending: 0,
      projectsReady: 0,
      usersTotal: 0,
    }
  );
}

function StreamerPill() {
  const on = useStreamerMode();
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all shadow-2xs",
        on
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/15 dark:text-emerald-300"
          : "border-black/10 bg-black/[0.03] text-[#5f5f5d] dark:border-white/10 dark:bg-white/[0.04] dark:text-surface-warm-white/50",
      )}
      title={
        on
          ? "Streamer Mode Aktif: Data sensitif (email, telepon, nama) disamarkan untuk rekaman/streaming."
          : "Streamer Mode Nonaktif"
      }
    >
      {on ? (
        <>
          <span className="relative flex size-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
          </span>
          <EyeOff className="size-3.5 shrink-0" />
          <span className="text-[11px] font-bold tracking-tight">
            Streamer Mode
          </span>
        </>
      ) : (
        <>
          <ShieldCheck className="size-3.5 shrink-0 opacity-60" />
          <span className="text-[11px]">Streamer OFF</span>
        </>
      )}
    </div>
  );
}

function NavBadge({ count }: { count: number }) {
  if (count <= 0) {
    return null;
  }
  return (
    <span className="flex min-w-4.5 items-center justify-center rounded-full bg-black/10 px-1 text-[9px] font-bold tabular-nums text-[#1c1c1c] dark:bg-surface-warm-white/20 dark:text-surface-warm-white">
      {formatBadge(count)}
    </span>
  );
}

function AdminNav() {
  const { location } = useRouterState();
  const counts = useNavCounts();

  return (
    <nav
      aria-label="Navigasi admin"
      className="flex gap-1 overflow-x-auto border-b border-black/10 py-2 transition-colors dark:border-surface-warm-white/10"
    >
      {TABS.map((tab) => {
        const active =
          tab.to === "/admin"
            ? location.pathname === "/admin"
            : location.pathname.startsWith(tab.to);
        const Icon = tab.icon;
        const badgeCount = tab.badge ? counts[tab.badge] : 0;
        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 whitespace-nowrap rounded-radius-md px-spacing-3 py-spacing-2 text-sm transition-colors",
              active
                ? "bg-black/10 font-medium text-[#1c1c1c] dark:bg-surface-warm-white/15 dark:text-surface-warm-white"
                : "text-[#5f5f5d] hover:bg-black/5 dark:text-surface-warm-white/70 dark:hover:bg-surface-warm-white/8",
            )}
            href={tab.to}
            key={tab.to}
          >
            <Icon className="size-4 shrink-0 opacity-80" />
            <span>{tab.label}</span>
            <NavBadge count={badgeCount} />
          </Link>
        );
      })}
    </nav>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  const { location } = useRouterState();
  const isTicketDetail =
    location.pathname.startsWith("/admin/tickets/") &&
    location.pathname !== "/admin/tickets";

  if (isTicketDetail) {
    return (
      <div className="mx-auto flex h-full w-full max-w-7xl flex-col overflow-hidden px-3 pb-3 text-[#1c1c1c] transition-colors duration-200 dark:text-surface-warm-white sm:px-6 lg:px-8">
        {children}
      </div>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-7xl flex-col px-3 pb-24 pt-6 text-[#1c1c1c] transition-colors duration-200 dark:text-surface-warm-white sm:px-6 lg:px-8">
      <header className="mb-spacing-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Admin Panel</h1>
        </div>
        <StreamerPill />
      </header>
      <AdminNav />
      <div className="mt-spacing-6">{children}</div>
    </main>
  );
}
