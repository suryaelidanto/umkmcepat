"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { Footer } from "@/components/common/Footer";
import { Header } from "@/components/common/Header";
import { useSession } from "@/lib/auth/auth-client";
import {
  useIsRoutePending,
  usePathname,
  useRouter,
  useTargetPathname,
} from "@/lib/navigation";
import {
  fetchJson,
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
  // Otherwise project → home briefly shows home chrome around project chat.
  const pathname = usePathname();
  const targetPathname = useTargetPathname();
  const isRoutePending = useIsRoutePending();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { status: sessionStatus } = useSession();

  const isWorkspace =
    pathname.startsWith("/projects/") && pathname !== "/projects/new";
  const isWaitlistPage = isWaitlistPagePath(pathname);
  const isNavigatingToWaitlist = targetPathname === "/waitlist";

  // Waitlist gate: only meaningful for signed-in users. Anonymous users get
  // status null and are left alone (landing + /waitlist are reachable). A
  // signed-in, non-approved user is redirected to /waitlist.
  const waitlistQuery = useQuery({
    queryKey: queryKeys.waitlistStatus,
    queryFn: fetchWaitlistStatus,
    enabled: sessionStatus === "authenticated" && !isWaitlistPage,
    ...GATE_QUERY_OPTIONS,
    refetchInterval: (query) => waitlistPendingPollInterval(query.state.data),
  });

  // Tracks the previous auth status so we can detect a fresh login (any
  // transition into "authenticated"), not just the first one ever.
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
    // 1. Right after login (auth transition): send the user to /waitlist so
    //    they know what to do — even from marketing pages like "/". They can
    //    still browse away afterwards.
    // 2. Product routes (non-bypass): keep redirecting while unapproved;
    //    marketing + /admin stay open (/admin still enforced by requireAdmin
    //    on the server).
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

  // Dev tools: admin reset-waitlist button (dev mode only)
  const devResetMutation = useMutation({
    mutationFn: async () =>
      fetchJson("/api/dev/reset-waitlist", {
        method: "POST",
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.waitlistStatus,
      });
      toast.success("Approval di-reset (dev mode). Refresh halaman.");
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Gagal reset approval.",
      );
    },
  });

  const isDevModeBannerVisible =
    waitlistQuery.isSuccess && waitlistQuery.data.canUseDevTools;

  if (isWaitlistPage) {
    return <>{children}</>;
  }

  // During a pending transition keep the previous chrome so header/footer
  // don't jump ahead of the still-mounted previous page content.
  if (isWorkspace || (isRoutePending && pathname.startsWith("/projects/"))) {
    return <main className="min-h-dvh bg-[#1b1b19]">{children}</main>;
  }

  return (
    <div className="relative flex min-h-screen flex-col bg-[#eceae4] text-[#1c1c1c] transition-colors duration-200 dark:bg-[#151515] dark:text-[#fcfbf8]">
      <Header
        devResetPending={devResetMutation.isPending}
        onDevReset={() => devResetMutation.mutate()}
        showDevBanner={isDevModeBannerVisible}
        showResetButton={Boolean(waitlistQuery.data?.own)}
      />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
