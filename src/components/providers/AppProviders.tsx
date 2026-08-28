"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { createContext, useContext, useMemo, useState } from "react";

import { SessionProvider } from "@/lib/auth/auth-client";
import { useDefaultThemeSetting } from "@/lib/config/use-feature-flag";
import { createAppQueryClient } from "@/lib/query-client";

interface PublicConfig {
  turnstileSiteKey: string;
}

const PublicConfigContext = createContext<PublicConfig>({
  turnstileSiteKey: "",
});

export function usePublicConfig() {
  return useContext(PublicConfigContext);
}

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
  turnstileSiteKey = "",
}: {
  children: React.ReactNode;
  initialTheme?: string;
  turnstileSiteKey?: string;
}) {
  const [queryClient] = useState(() => createAppQueryClient());
  const publicConfig = useMemo(
    () => ({ turnstileSiteKey }),
    [turnstileSiteKey],
  );

  return (
    <PublicConfigContext.Provider value={publicConfig}>
      <QueryClientProvider client={queryClient}>
        <ThemedApp initialTheme={initialTheme}>{children}</ThemedApp>
      </QueryClientProvider>
    </PublicConfigContext.Provider>
  );
}
