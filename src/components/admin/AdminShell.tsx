"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import {
  ClipboardList,
  CreditCard,
  FolderKanban,
  LayoutDashboard,
  MessageSquare,
  Settings,
  Users,
} from "lucide-react";

import type { ReactNode } from "react";

import { useStreamerMode } from "@/components/admin/streamer-mode-context";
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
  projectsActive: number;
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
    badge: null,
  },
  {
    label: "Proyek",
    to: "/admin/projects",
    icon: FolderKanban,
    badge: "projectsActive" as const,
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
      projectsActive: 0,
    }
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

function NavBadge({ count }: { count: number }) {
  if (count <= 0) {
    return null;
  }
  return (
    <span className="flex min-w-4.5 items-center justify-center rounded-full bg-surface-warm-white/20 px-1 text-[9px] font-bold tabular-nums">
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
      className="flex gap-1 overflow-x-auto border-b border-surface-warm-white/10 py-2"
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
              "flex items-center gap-2 whitespace-nowrap rounded-radius-md px-spacing-3 py-spacing-2 text-sm",
              active
                ? "bg-surface-warm-white/15 font-medium text-surface-warm-white"
                : "text-surface-warm-white/70 hover:bg-surface-warm-white/8",
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

/** Dense wide admin chrome. */
export function AdminShell({ children }: { children: ReactNode }) {
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
      <AdminNav />
      <div className="mt-spacing-4">{children}</div>
    </main>
  );
}
