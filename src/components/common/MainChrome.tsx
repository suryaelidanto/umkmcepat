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
    staleTime: 30_000,
    retry: 1,
  });

  useEffect(() => {
    if (isVerifyPage) {
      return;
    }

    if (verificationQuery.data && !verificationQuery.data.verified) {
      router.replace("/verify");
    }
  }, [isVerifyPage, router, verificationQuery.data]);

  if (isVerifyPage) {
    return <>{children}</>;
  }

  const checking =
    verificationQuery.isPending ||
    (verificationQuery.isSuccess && !verificationQuery.data.verified);

  if (checking) {
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
