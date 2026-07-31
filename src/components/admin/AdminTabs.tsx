import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";

import { withVariant } from "@/components/admin/prototype/types";
import { useAdminVariant } from "@/components/admin/prototype/useAdminVariant";
import { Link } from "@/components/ui/link";
import { fetchJson } from "@/lib/query-client";

const TABS = [
  { label: "Ringkasan", to: "/admin" },
  { label: "Pengguna", to: "/admin/users" },
  { label: "Proyek", to: "/admin/projects" },
  { label: "Antrean", to: "/admin/waitlist" },
  { label: "Tiket", to: "/admin/tickets" },
  { label: "Transaksi", to: "/admin/transactions" },
  { label: "Pengaturan", to: "/admin/settings" },
] as const;

export function AdminTabs() {
  const { location } = useRouterState();
  const variant = useAdminVariant();

  const unreadQuery = useQuery({
    queryFn: () =>
      fetchJson<{ adminUnreadCount: number }>(
        "/api/admin/tickets/unread-count",
      ),
    queryKey: ["admin", "unread-tickets-count"],
    refetchOnWindowFocus: true,
  });

  const unreadCount = unreadQuery.data?.adminUnreadCount ?? 0;

  return (
    <nav
      aria-label="Navigasi admin"
      className="sticky top-0 z-10 flex gap-spacing-1 overflow-x-auto border-b border-surface-warm-white/10 bg-surface-warm-white/5 px-spacing-2 py-spacing-2"
    >
      {TABS.map((tab) => {
        const active =
          tab.to === "/admin"
            ? location.pathname === "/admin"
            : location.pathname.startsWith(tab.to);
        const isTicketsTab = tab.to === "/admin/tickets";

        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "flex items-center gap-2 rounded-radius-md bg-surface-warm-white/15 px-spacing-3 py-spacing-2 text-sm font-medium text-surface-warm-white"
                : "flex items-center gap-2 rounded-radius-md px-spacing-3 py-spacing-2 text-sm text-surface-warm-white/70"
            }
            href={withVariant(tab.to, variant)}
            key={tab.to}
          >
            <span>{tab.label}</span>
            {isTicketsTab && unreadCount > 0 ? (
              <span className="flex size-4.5 items-center justify-center rounded-full bg-[#ff7a59] px-1 text-[9px] font-bold text-white">
                {unreadCount}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
