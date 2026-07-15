import { QueryClient } from "@tanstack/react-query";

import { apiNetworkError, parseApiResponse } from "@/lib/api-client";

export const queryKeys = {
  energy: ["energy"] as const,
  verification: ["verification"] as const,
  projects: ["projects"] as const,
  projectRuntime: (projectId: string) =>
    ["projects", projectId, "runtime"] as const,
  projectWorkspace: (projectId: string) =>
    ["projects", projectId, "workspace"] as const,
  projectSource: (projectId: string) =>
    ["projects", projectId, "source"] as const,
  projectChat: (projectId: string) => ["projects", projectId, "chat"] as const,
};

export function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 10_000,
        gcTime: 5 * 60_000,
        retry: 1,
        refetchOnWindowFocus: true,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}

export async function fetchJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(input, init).catch((error: unknown) => {
    const networkError = apiNetworkError(error);
    throw new Error(
      networkError.ok
        ? "Network error"
        : networkError.error.message || "Network error",
    );
  });

  const result = await parseApiResponse<T>(response);

  if (!result.ok) {
    throw new Error(result.error.message || "Request failed");
  }

  return result.data;
}

export function notifyEnergyChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("umkm:energy-changed"));
  }
}
