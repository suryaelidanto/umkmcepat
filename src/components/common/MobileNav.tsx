"use client";

import { useQuery } from "@tanstack/react-query";
import { Home, User, type LucideIcon } from "lucide-react";
import { useState } from "react";

import { Link } from "@/components/ui/link";
import { MobileSheet } from "@/components/ui/mobile-sheet";
import { useSession } from "@/lib/auth-client";
import { resolveHomeAccessState } from "@/lib/home-access-state";
import {
  resolveMobileNavModel,
  shouldRenderMobileNav,
  type MobileNavPrimaryItem,
} from "@/lib/mobile-nav-model";
import { usePathname } from "@/lib/navigation";
import {
  fetchWaitlistStatus,
  GATE_QUERY_OPTIONS,
  queryKeys,
  waitlistPendingPollInterval,
} from "@/lib/query-client";

const ICONS: Record<MobileNavPrimaryItem["icon"], LucideIcon> = {
  account: User,
  home: Home,
  waitlist: User,
};

const MOBILE_NAV_SKELETON_ITEMS = ["one", "two", "more"] as const;

function MobileNavSkeleton() {
  return (
    <nav
      aria-busy="true"
      aria-label="Memuat navigasi utama"
      className="fixed inset-x-0 bottom-0 z-40 flex h-16 min-w-0 max-w-full items-stretch justify-around overflow-x-clip border-t border-surface-warm-white/10 bg-[#151515]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      role="status"
    >
      {MOBILE_NAV_SKELETON_ITEMS.map((key) => (
        <div
          className="flex min-w-0 flex-1 flex-col items-center justify-center gap-1"
          key={key}
        >
          <span className="size-5 animate-pulse rounded-full bg-surface-warm-white/10" />
          <span className="h-2.5 w-10 animate-pulse rounded bg-surface-warm-white/8" />
        </div>
      ))}
    </nav>
  );
}

function MobileNavError({ onRetry }: { onRetry: () => void }) {
  return (
    <nav
      aria-label="Navigasi utama"
      className="fixed inset-x-0 bottom-0 z-40 flex h-16 min-w-0 max-w-full items-center justify-center overflow-x-clip border-t border-surface-warm-white/10 bg-[#151515]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <button
        className="rounded-radius-md border border-surface-warm-white/15 px-spacing-3 py-spacing-2 text-xs text-surface-warm-white/75"
        onClick={onRetry}
        type="button"
      >
        Muat ulang navigasi
      </button>
    </nav>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const { data: session, status } = useSession();
  const waitlistQuery = useQuery({
    queryKey: queryKeys.waitlistStatus,
    queryFn: fetchWaitlistStatus,
    enabled: status === "authenticated",
    ...GATE_QUERY_OPTIONS,
    refetchInterval: (query) => waitlistPendingPollInterval(query.state.data),
  });
  const navigationState = resolveHomeAccessState({
    authStatus: status,
    hasUser: status !== "unauthenticated",
    hasWaitlistData: Boolean(waitlistQuery.data),
    isApproved: waitlistQuery.data?.status === "approved",
    waitlistStatus: waitlistQuery.status,
  });
  const waitlisted = navigationState === "waitlisted";
  const isAdmin = session?.user?.admin === true;
  if (!shouldRenderMobileNav(status)) {
    return null;
  }
  if (navigationState === "loading") {
    return <MobileNavSkeleton />;
  }
  if (navigationState === "error") {
    return <MobileNavError onRetry={() => void waitlistQuery.refetch()} />;
  }

  const { overflow, primary: items } = resolveMobileNavModel({
    isAdmin,
    waitlisted,
  });

  return (
    <>
      <nav
        aria-label="Navigasi utama"
        className="fixed inset-x-0 bottom-0 z-40 flex h-16 min-w-0 max-w-full items-stretch justify-around overflow-x-clip border-t border-surface-warm-white/10 bg-[#151515]/95 backdrop-blur pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {items.map((item) => {
          const Icon = ICONS[item.icon];
          const active = pathname === item.href;
          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[10px] ${active ? "text-surface-warm-white" : "text-surface-warm-white/50"}`}
              href={item.href}
              key={item.href}
            >
              <Icon className="size-5" />
              <span className="max-w-full truncate whitespace-nowrap">
                {item.label}
              </span>
            </Link>
          );
        })}
        {overflow.length > 0 ? (
          <button
            aria-expanded={moreOpen}
            aria-haspopup="dialog"
            aria-label="Lainnya"
            className="flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[10px] text-surface-warm-white/50"
            onClick={() => setMoreOpen(true)}
            type="button"
          >
            <span className="text-base">⋯</span>
            <span>Lainnya</span>
          </button>
        ) : null}
      </nav>
      <MobileSheet onOpenChange={setMoreOpen} open={moreOpen} title="Lainnya">
        <ul className="flex flex-col gap-spacing-2">
          {overflow.map((item) => (
            <li key={item.href}>
              <Link
                className="block rounded-radius-md px-spacing-3 py-spacing-2 text-sm text-surface-warm-white/80 hover:bg-surface-warm-white/8"
                href={item.href}
                onClick={() => setMoreOpen(false)}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </MobileSheet>
    </>
  );
}
