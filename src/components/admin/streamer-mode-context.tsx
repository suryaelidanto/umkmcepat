"use client";

import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, type ReactNode } from "react";

import { loadStreamerMode } from "@/lib/admin-streamer-mode";
import { queryKeys } from "@/lib/query-client";

const StreamerModeContext = createContext<boolean>(false);

export function StreamerModeProvider({
  initialData,
  children,
}: {
  initialData: boolean;
  children: ReactNode;
}) {
  const { data } = useQuery({
    queryKey: queryKeys.adminStreamerMode,
    queryFn: () => loadStreamerMode(),
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
