"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { createContext, useContext, useMemo, useState } from "react";

import { SessionProvider } from "@/lib/auth/auth-client";
import { useDefaultThemeSetting } from "@/lib/config/use-feature-flag";
import { createAppQueryClient } from "@/lib/query-client";

interface PublicConfig {
  turnstileSiteKey: string;
  maintenanceMode?: boolean;
  maintenanceMessage?: string;
}

const PublicConfigContext = createContext<PublicConfig>({
  turnstileSiteKey: "",
  maintenanceMode: false,
  maintenanceMessage: "",
});

export function usePublicConfig() {
  return useContext(PublicConfigContext);
}

function ThemedApp({
  children,
  initialTheme,
  nonce,
}: {
  children: React.ReactNode;
  initialTheme?: string;
  nonce?: string;
}) {
  const theme = useDefaultThemeSetting(initialTheme);

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme={theme}
      enableSystem
      forcedTheme={undefined}
      nonce={nonce}
    >
      <SessionProvider>{children}</SessionProvider>
    </ThemeProvider>
  );
}

export function AppProviders({
  children,
  initialTheme,
  nonce,
  turnstileSiteKey = "",
  maintenanceMode = false,
  maintenanceMessage = "",
}: {
  children: React.ReactNode;
  initialTheme?: string;
  nonce?: string;
  turnstileSiteKey?: string;
  maintenanceMode?: boolean;
  maintenanceMessage?: string;
}) {
  const [queryClient] = useState(() => createAppQueryClient());
  const publicConfig = useMemo(
    () => ({ turnstileSiteKey, maintenanceMode, maintenanceMessage }),
    [turnstileSiteKey, maintenanceMode, maintenanceMessage],
  );

  return (
    <PublicConfigContext.Provider value={publicConfig}>
      <QueryClientProvider client={queryClient}>
        <ThemedApp initialTheme={initialTheme} nonce={nonce}>
          {children}
        </ThemedApp>
      </QueryClientProvider>
    </PublicConfigContext.Provider>
  );
}
