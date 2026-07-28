import { useRouterState } from "@tanstack/react-router";

import { Link } from "@/components/ui/link";

const TABS = [
  { label: "Ringkasan", to: "/admin" },
  { label: "Pengguna", to: "/admin/users" },
  { label: "Antrean", to: "/admin/waitlist" },
  { label: "Transaksi", to: "/admin/transactions" },
  { label: "Pengaturan", to: "/admin/settings" },
] as const;

export function AdminTabs() {
  const { location } = useRouterState();
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
        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "rounded-radius-md bg-surface-warm-white/15 px-spacing-3 py-spacing-2 text-sm font-medium text-surface-warm-white"
                : "rounded-radius-md px-spacing-3 py-spacing-2 text-sm text-surface-warm-white/70"
            }
            href={tab.to}
            key={tab.to}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
