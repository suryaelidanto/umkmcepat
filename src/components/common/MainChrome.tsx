"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { Footer } from "@/components/common/Footer";
import { Header } from "@/components/common/Header";
import { usePublicConfig } from "@/components/providers/AppProviders";
import { useSession } from "@/lib/auth/auth-client";
import {
  useIsRoutePending,
  usePathname,
  useRouter,
  useTargetPathname,
} from "@/lib/navigation";
import {
  fetchWaitlistStatus,
  GATE_QUERY_OPTIONS,
  queryKeys,
  waitlistPendingPollInterval,
} from "@/lib/query-client";
import {
  isWaitlistGateBypassPath,
  isWaitlistPagePath,
} from "@/lib/waitlist/waitlist-route-access";

export function MainChrome({ children }: { children: React.ReactNode }) {
  // Layout must follow the *committed* page (Outlet), not the in-flight target.
  const pathname = usePathname();
  const targetPathname = useTargetPathname();
  const isRoutePending = useIsRoutePending();
  const router = useRouter();
  const { status: sessionStatus } = useSession();
  const { maintenanceMode, maintenanceMessage } = usePublicConfig();

  const isWorkspace =
    pathname.startsWith("/projects/") && pathname !== "/projects/new";
  const isTicketDetail =
    (pathname.startsWith("/admin/tickets/") && pathname !== "/admin/tickets") ||
    (pathname.startsWith("/support/") && pathname !== "/support");
  const isWaitlistPage = isWaitlistPagePath(pathname);
  const isNavigatingToWaitlist = targetPathname === "/waitlist";

  // Waitlist gate: only meaningful for signed-in users. Anonymous users get
  const waitlistQuery = useQuery({
    queryKey: queryKeys.waitlistStatus,
    queryFn: fetchWaitlistStatus,
    enabled: sessionStatus === "authenticated" && !isWaitlistPage,
    ...GATE_QUERY_OPTIONS,
    refetchInterval: (query) => waitlistPendingPollInterval(query.state.data),
  });

  // Tracks the previous auth status so we can detect a fresh login (any
  const previousAuthStatus = useRef(sessionStatus);

  useEffect(() => {
    if (isWaitlistPage || isNavigatingToWaitlist) {
      return;
    }

    const justLoggedIn =
      previousAuthStatus.current !== "authenticated" &&
      sessionStatus === "authenticated";
    previousAuthStatus.current = sessionStatus;

    // Waitlist gate. Two cases:
    if (
      sessionStatus === "authenticated" &&
      waitlistQuery.isSuccess &&
      waitlistQuery.data.status !== "approved" &&
      (justLoggedIn || !isWaitlistGateBypassPath(pathname))
    ) {
      void router.replace("/waitlist");
    }
  }, [
    isWaitlistPage,
    isNavigatingToWaitlist,
    pathname,
    router,
    sessionStatus,
    waitlistQuery.data,
    waitlistQuery.isSuccess,
  ]);

  // During a pending transition keep the previous chrome so header/footer
  if (isWorkspace || (isRoutePending && pathname.startsWith("/projects/"))) {
    return <main className="min-h-dvh bg-[#1b1b19]">{children}</main>;
  }

  return (
    <div
      className={`relative flex min-h-screen flex-col bg-[#eceae4] text-[#1c1c1c] dark:bg-[#151515] dark:text-[#fcfbf8] ${
        isTicketDetail ? "h-dvh overflow-hidden" : ""
      }`}
    >
      {maintenanceMode ? (
        <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center text-xs font-medium text-amber-800 dark:text-amber-300">
          <span>
            ⚠️{" "}
            {maintenanceMessage ||
              "Sistem sedang dalam pemeliharaan berkala. Pembuatan dan pembaruan website ditunda sementara."}
          </span>
        </div>
      ) : null}
      <Header />
      <main
        className={`flex-1 ${isTicketDetail ? "min-h-0 overflow-hidden flex flex-col" : ""}`}
      >
        {children}
      </main>
      {!isTicketDetail && <Footer />}
    </div>
  );
}
