"use client";

import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, type ReactNode } from "react";

import { fetchJson, queryKeys } from "@/lib/query-client";

const StreamerModeContext = createContext<boolean>(false);

async function fetchStreamerMode(): Promise<boolean> {
  const data = await fetchJson<{ enabled?: boolean }>(
    "/api/admin/streamer-mode",
    { cache: "no-store" },
  );
  return Boolean(data.enabled);
}

export function StreamerModeProvider({
  initialData,
  children,
}: {
  initialData: boolean;
  children: ReactNode;
}) {
  const { data } = useQuery({
    queryKey: queryKeys.adminStreamerMode,
    queryFn: fetchStreamerMode,
    initialData,
  });

  return (
    <StreamerModeContext.Provider value={data ?? initialData}>
      {children}
    </StreamerModeContext.Provider>
  );
}

export function useStreamerMode(): boolean {
  return useContext(StreamerModeContext);
}
