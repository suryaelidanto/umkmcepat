"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useState } from "react";

import { SessionProvider } from "@/lib/auth/auth-client";
import { useDefaultThemeSetting } from "@/lib/config/use-feature-flag";
import { createAppQueryClient } from "@/lib/query-client";

function ThemedApp({ children }: { children: React.ReactNode }) {
  const defaultTheme = useDefaultThemeSetting();

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme={defaultTheme}
      enableSystem={defaultTheme === "system"}
      forcedTheme={undefined}
    >
      <SessionProvider>{children}</SessionProvider>
    </ThemeProvider>
  );
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => createAppQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <ThemedApp>{children}</ThemedApp>
    </QueryClientProvider>
  );
}
