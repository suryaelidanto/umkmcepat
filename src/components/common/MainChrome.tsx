"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";

import { Footer } from "@/components/common/Footer";
import { Header } from "@/components/common/Header";
import { MobileNav } from "@/components/common/MobileNav";
import {
  useIsRoutePending,
  usePathname,
  useRouter,
  useTargetPathname,
} from "@/lib/navigation";
import { fetchJson, queryKeys } from "@/lib/query-client";
import { isWaitlistMarketingPublicPath } from "@/lib/waitlist-route-access";

export function MainChrome({ children }: { children: React.ReactNode }) {
  // Layout must follow the *committed* page (Outlet), not the in-flight target.
  // Otherwise project → home briefly shows home chrome around project chat.
  const pathname = usePathname();
  const targetPathname = useTargetPathname();
  const isRoutePending = useIsRoutePending();
  const router = useRouter();

  const isWorkspace =
    pathname.startsWith("/projects/") && pathname !== "/projects/new";
  const isVerifyPage = pathname === "/verify" || targetPathname === "/verify";
  const isWaitlistPage =
    pathname === "/waitlist" || targetPathname === "/waitlist";

  const verificationQuery = useQuery({
    queryKey: queryKeys.verification,
    queryFn: () =>
      fetchJson<{ verified: boolean }>("/api/user/verification", {
        cache: "no-store",
      }),
    enabled: !isVerifyPage,
    // Keep last answer across project↔home navigations so the whole shell
    // does not unmount into a blank spinner while revalidating.
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // Waitlist gate: only meaningful once verified. Anonymous users get status
  // null and are left alone (landing + /waitlist are reachable). A signed-in,
  // verified, non-approved user is redirected to /waitlist.
  const isVerified = Boolean(verificationQuery.data?.verified);
  const waitlistQuery = useQuery({
    queryKey: queryKeys.waitlistStatus,
    queryFn: () =>
      fetchJson<{
        status: string | null;
        own?: { businessName: string };
      }>("/api/user/waitlist", {
        cache: "no-store",
      }),
    enabled: isVerified && !isVerifyPage,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
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
      await queryClient.invalidateQueries({
        queryKey: queryKeys.waitlistStatus,
      });
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
      await queryClient.invalidateQueries({
        queryKey: queryKeys.waitlistStatus,
      });
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

    // Only redirect after a successful "not verified" response.
    // Errors should not bounce the user (matches previous allow-on-error).
    if (verificationQuery.isSuccess && !verificationQuery.data.verified) {
      router.replace("/verify");
      return;
    }

    // Waitlist gate: product routes only. Marketing-public paths stay open.
    if (
      isVerified &&
      waitlistQuery.isSuccess &&
      waitlistQuery.data.status !== "approved" &&
      !isWaitlistMarketingPublicPath(pathname)
    ) {
      router.replace("/waitlist");
    }
  }, [
    isVerifyPage,
    isWaitlistPage,
    isVerified,
    pathname,
    router,
    verificationQuery.data,
    verificationQuery.isSuccess,
    waitlistQuery.data,
    waitlistQuery.isSuccess,
  ]);

  if (isVerifyPage || isWaitlistPage) {
    return <>{children}</>;
  }

  // First load only: no cached verification yet.
  // Never blank the shell on background refetch (e.g. project → home).
  const firstLoadChecking =
    verificationQuery.isPending && verificationQuery.data === undefined;
  const blockingUnverified =
    verificationQuery.isSuccess && !verificationQuery.data.verified;

  if (firstLoadChecking || blockingUnverified) {
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
