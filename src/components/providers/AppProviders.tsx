"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

import { SessionProvider } from "@/lib/auth-client";
import { createAppQueryClient } from "@/lib/query-client";

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => createAppQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>{children}</SessionProvider>
    </QueryClientProvider>
  );
}
