"use client";

import { useEffect, useState } from "react";

import { Footer } from "@/components/common/Footer";
import { Header } from "@/components/common/Header";
import { usePathname, useRouter } from "@/lib/navigation";

export function MainChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const isWorkspace =
    pathname.startsWith("/projects/") && pathname !== "/projects/new";
  const isVerifyPage = pathname === "/verify";

  useEffect(() => {
    if (isVerifyPage) {
      setChecking(false);
      return;
    }

    let canceled = false;

    void (async () => {
      try {
        const response = await fetch("/api/user/verification", {
          cache: "no-store",
        });
        if (canceled) {
          return;
        }

        if (response.ok) {
          const data = (await response.json()) as { verified: boolean };
          if (!data.verified) {
            router.replace("/verify");
            return;
          }
        }
      } catch {
        // ignore — allow access on error
      }
      if (!canceled) {
        setChecking(false);
      }
    })();

    return () => {
      canceled = true;
    };
  }, [isVerifyPage, router, pathname]);

  if (isVerifyPage) {
    return <>{children}</>;
  }

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
