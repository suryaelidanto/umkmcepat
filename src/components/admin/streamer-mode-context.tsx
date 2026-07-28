"use client";

import { createContext, useContext, type ReactNode } from "react";

const StreamerModeContext = createContext<boolean>(false);

export function StreamerModeProvider({
  value,
  children,
}: {
  value: boolean;
  children: ReactNode;
}) {
  return (
    <StreamerModeContext.Provider value={value}>
      {children}
    </StreamerModeContext.Provider>
  );
}

export function useStreamerMode(): boolean {
  return useContext(StreamerModeContext);
}
