"use client";

import { usePathname } from "next/navigation";
import { SessionProvider } from "next-auth/react";

import QueryProvider from "@/components/providers/QueryProvider";

export function AppProviders({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const needsSession = pathname !== "/";

  return (
    <QueryProvider>
      {needsSession ? <SessionProvider>{children}</SessionProvider> : children}
    </QueryProvider>
  );
}
