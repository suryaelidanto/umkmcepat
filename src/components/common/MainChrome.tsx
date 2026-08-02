"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";

import { Footer } from "@/components/common/Footer";
import { Header } from "@/components/common/Header";
import { MobileNav } from "@/components/common/MobileNav";
import { useSession } from "@/lib/auth-client";
import {
  shouldBlockMainChromeShell,
  shouldRedirectToVerify,
} from "@/lib/main-chrome-gate";
import {
  useIsRoutePending,
  usePathname,
  useRouter,
  useTargetPathname,
} from "@/lib/navigation";
import {
  fetchJson,
  fetchUserVerification,
  fetchWaitlistStatus,
  GATE_QUERY_OPTIONS,
  invalidateWaitlistStatus,
  queryKeys,
  waitlistPendingPollInterval,
} from "@/lib/query-client";
import { isWaitlistGateBypassPath } from "@/lib/waitlist-route-access";

export function MainChrome({ children }: { children: React.ReactNode }) {
  // Layout must follow the *committed* page (Outlet), not the in-flight target.
  // Otherwise project → home briefly shows home chrome around project chat.
  const pathname = usePathname();
  const targetPathname = useTargetPathname();
  const isRoutePending = useIsRoutePending();
  const router = useRouter();
  const { status: sessionStatus } = useSession();

  const isWorkspace =
    pathname.startsWith("/projects/") && pathname !== "/projects/new";
  const isVerifyPage = pathname === "/verify" || targetPathname === "/verify";
  const isWaitlistPage =
    pathname === "/waitlist" || targetPathname === "/waitlist";

  const verificationQuery = useQuery({
    queryKey: queryKeys.verification,
    queryFn: fetchUserVerification,
    // Guests always resolve verified:false; only signed-in users need this for
    // the full-page gate. Still fetch for guests so cache warms without blocking.
    enabled: !isVerifyPage,
    ...GATE_QUERY_OPTIONS,
    // 401 is success (guest). Do not retry that path under a spinner.
    retry: sessionStatus === "authenticated" ? 1 : 0,
  });

  // Waitlist gate: only meaningful once verified. Anonymous users get status
  // null and are left alone (landing + /waitlist are reachable). A signed-in,
  // verified, non-approved user is redirected to /waitlist.
  const isVerified = Boolean(
    verificationQuery.data?.signedIn && verificationQuery.data.verified,
  );
  const waitlistQuery = useQuery({
    queryKey: queryKeys.waitlistStatus,
    queryFn: fetchWaitlistStatus,
    enabled: isVerified && !isVerifyPage,
    ...GATE_QUERY_OPTIONS,
    refetchInterval: (query) => waitlistPendingPollInterval(query.state.data),
  });

  const isDev = import.meta.env.DEV;
  const hasOwnWaitlistEntry = Boolean(waitlistQuery.data?.own);
  const queryClient = useQueryClient();

  const devResetVerification = useMutation({
    mutationFn: async () =>
      fetchJson<{ message?: string }>("/api/dev/reset-verification", {
        method: "POST",
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.verification,
      });
      await invalidateWaitlistStatus(queryClient);
      toast.success("Verifikasi (OTP) di-reset. Refresh halaman.");
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Gagal reset verifikasi.",
      );
    },
  });

  const devResetWaitlist = useMutation({
    mutationFn: async () =>
      fetchJson<{ message?: string }>("/api/dev/reset-waitlist", {
        method: "POST",
      }),
    onSuccess: async () => {
      await invalidateWaitlistStatus(queryClient);
      toast.success("Approval di-reset. Refresh halaman.");
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Gagal reset approval.",
      );
    },
  });

  useEffect(() => {
    if (isVerifyPage || isWaitlistPage) {
      return;
    }

    // Only redirect when server confirms signed-in + unverified.
    // Guests (401 → signedIn:false) and errors must not bounce.
    if (
      shouldRedirectToVerify({
        sessionStatus,
        verificationPending: verificationQuery.isPending,
        verificationData: verificationQuery.data,
        verificationSuccess: verificationQuery.isSuccess,
      })
    ) {
      router.replace("/verify");
      return;
    }

    // Waitlist gate: product routes only. Marketing + /admin stay open
    // (/admin still enforced by requireAdmin on the server).
    if (
      isVerified &&
      waitlistQuery.isSuccess &&
      waitlistQuery.data.status !== "approved" &&
      !isWaitlistGateBypassPath(pathname)
    ) {
      router.replace("/waitlist");
    }
  }, [
    isVerifyPage,
    isWaitlistPage,
    isVerified,
    pathname,
    router,
    sessionStatus,
    verificationQuery.data,
    verificationQuery.isSuccess,
    waitlistQuery.data,
    waitlistQuery.isSuccess,
  ]);

  if (isVerifyPage || isWaitlistPage) {
    return <>{children}</>;
  }

  // First load only for signed-in users: no cached verification yet.
  // Guests never block — 401 maps to verified:false without throwing.
  // Never blank the shell on background refetch (e.g. project → home).
  if (
    shouldBlockMainChromeShell({
      sessionStatus,
      verificationPending: verificationQuery.isPending,
      verificationData: verificationQuery.data,
      verificationSuccess: verificationQuery.isSuccess,
    })
  ) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#151515]">
        <div className="size-8 animate-spin rounded-full border-2 border-surface-warm-white/12 border-t-surface-warm-white/82" />
      </div>
    );
  }

  // During a pending transition keep the previous chrome so header/footer
  // don't jump ahead of the still-mounted previous page content.
  if (isWorkspace || (isRoutePending && pathname.startsWith("/projects/"))) {
    return <main className="min-h-dvh bg-[#1b1b19]">{children}</main>;
  }

  return (
    <div className="relative flex min-h-screen flex-col bg-[#151515]">
      {isDev ? (
        <div className="flex items-center justify-center gap-spacing-3 border-b border-aurora-orange/30 bg-aurora-orange/10 px-spacing-4 py-spacing-2 text-xs text-aurora-orange">
          <span>DEV: Mode Pengembang</span>
          {isVerified ? (
            <button
              className="rounded-radius-sm border border-aurora-orange/40 px-spacing-2 py-spacing-1 text-[10px] font-semibold uppercase tracking-wider text-aurora-orange transition hover:bg-aurora-orange/20 disabled:opacity-50"
              disabled={devResetVerification.isPending}
              onClick={() => devResetVerification.mutate()}
              type="button"
            >
              {devResetVerification.isPending
                ? "Mereset OTP..."
                : "Reset Verifikasi (OTP)"}
            </button>
          ) : null}
          {hasOwnWaitlistEntry ? (
            <button
              className="rounded-radius-sm border border-aurora-orange/40 px-spacing-2 py-spacing-1 text-[10px] font-semibold uppercase tracking-wider text-aurora-orange transition hover:bg-aurora-orange/20 disabled:opacity-50"
              disabled={devResetWaitlist.isPending}
              onClick={() => devResetWaitlist.mutate()}
              type="button"
            >
              {devResetWaitlist.isPending
                ? "Mereset Antrian..."
                : "Reset Antrian (Waitlist)"}
            </button>
          ) : null}
        </div>
      ) : null}
      <Header />
      <main className="flex-1 pb-16 md:pb-0">{children}</main>
      <Footer />
      <MobileNav />
    </div>
  );
}
