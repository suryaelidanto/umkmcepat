"use client";

import { useQuery } from "@tanstack/react-query";

import { AuthButton } from "@/components/common/AuthButton";
import { EnergyDisplay } from "@/components/common/EnergyDisplay";
import { Image } from "@/components/ui/image";
import { Link } from "@/components/ui/link";
import { useSession } from "@/lib/auth-client";
import {
  fetchWaitlistStatus,
  GATE_QUERY_OPTIONS,
  queryKeys,
  waitlistPendingPollInterval,
} from "@/lib/query-client";

export function Header() {
  const { data: session, status } = useSession();
  const waitlistQuery = useQuery({
    queryKey: queryKeys.waitlistStatus,
    queryFn: fetchWaitlistStatus,
    enabled: status === "authenticated",
    ...GATE_QUERY_OPTIONS,
    refetchInterval: (query) => waitlistPendingPollInterval(query.state.data),
  });
  const waitlisted =
    status === "authenticated" &&
    waitlistQuery.isSuccess &&
    waitlistQuery.data.status !== "approved";
  void session;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/[0.07] bg-[#151515] text-surface-warm-white">
      <div className="mx-auto grid h-14 max-w-7xl grid-cols-[auto_1fr_auto] items-center px-spacing-7 sm:px-spacing-9 lg:px-spacing-10">
        <Link
          href="/"
          className="flex items-center gap-2 justify-self-start whitespace-nowrap rounded-radius-md text-base font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-surface-warm-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#151515] sm:text-lg"
          aria-label="UMKM Cepat beranda"
        >
          <Image
            src="/brand/umkmcepat-logo.svg"
            alt="Logo UMKM Cepat"
            width={32}
            height={32}
            priority
          />
          <span>UMKM Cepat</span>
        </Link>

        <div aria-hidden="true" />

        <div className="flex items-center justify-end gap-3">
          {!waitlisted ? <EnergyDisplay /> : null}
          <AuthButton />
        </div>
      </div>
    </header>
  );
}
