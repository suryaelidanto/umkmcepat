"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useState } from "react";

import { SessionProvider } from "@/lib/auth/auth-client";
import { useDefaultThemeSetting } from "@/lib/config/use-feature-flag";
import { createAppQueryClient } from "@/lib/query-client";

function ThemedApp({
  children,
  initialTheme,
}: {
  children: React.ReactNode;
  initialTheme?: string;
}) {
  const theme = useDefaultThemeSetting(initialTheme);

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme={theme}
      enableSystem={theme === "system"}
      forcedTheme={undefined}
    >
      <SessionProvider>{children}</SessionProvider>
    </ThemeProvider>
  );
}

export function AppProviders({
  children,
  initialTheme,
}: {
  children: React.ReactNode;
  initialTheme?: string;
}) {
  const [queryClient] = useState(() => createAppQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <ThemedApp initialTheme={initialTheme}>{children}</ThemedApp>
    </QueryClientProvider>
  );
}
