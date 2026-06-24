"use client";

import { usePathname } from "next/navigation";

import { Footer } from "@/components/common/Footer";
import { Header } from "@/components/common/Header";

export function MainChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isWorkspace =
    pathname.startsWith("/projects/") && pathname !== "/projects/new";

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
