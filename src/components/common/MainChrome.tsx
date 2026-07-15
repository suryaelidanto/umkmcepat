"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

import { Footer } from "@/components/common/Footer";
import { Header } from "@/components/common/Header";
import { usePathname, useRouter } from "@/lib/navigation";
import { fetchJson, queryKeys } from "@/lib/query-client";

export function MainChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isWorkspace =
    pathname.startsWith("/projects/") && pathname !== "/projects/new";
  const isVerifyPage = pathname === "/verify";

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

  useEffect(() => {
    if (isVerifyPage) {
      return;
    }

    // Only redirect after a successful "not verified" response.
    // Errors should not bounce the user (matches previous allow-on-error).
    if (verificationQuery.isSuccess && !verificationQuery.data.verified) {
      router.replace("/verify");
    }
  }, [
    isVerifyPage,
    router,
    verificationQuery.data,
    verificationQuery.isSuccess,
  ]);

  if (isVerifyPage) {
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
      <div className="flex min-h-screen items-center justify-center bg-surface-warm-white">
        <div className="size-8 animate-spin rounded-full border-2 border-surface-warm-white/12 border-t-surface-warm-white/82" />
      </div>
    );
  }

  if (isWorkspace) {
    return <main className="min-h-dvh bg-[#1b1b19]">{children}</main>;
  }

  return (
    <div className="relative flex min-h-screen flex-col bg-surface-warm-white">
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
