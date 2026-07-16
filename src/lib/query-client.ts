import {
  QueryClient,
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import { useRef } from "react";
import { toast } from "sonner";

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

export type CachePatch = {
  queryKey: readonly unknown[];
  updater: (previous: unknown) => unknown;
};

export type CacheMutationOptions<TData, TVariables> = {
  errorMessage?: string;
  invalidateKeys?: readonly (readonly unknown[])[];
  mutationFn: (variables: TVariables) => Promise<TData>;
  onError?: (error: Error, variables: TVariables) => void;
  onSuccess?: (data: TData, variables: TVariables) => void | Promise<void>;
  optimisticPatches?: readonly CachePatch[];
  successMessage?: string;
};

export function applyPatches<T>(
  previous: T,
  patches: readonly CachePatch[],
): T {
  return patches.reduce(
    (current, patch) => patch.updater(current) as T,
    previous,
  );
}

export function restoreSnapshots(
  snapshots: Map<string, unknown>,
  client: QueryClient,
): void {
  for (const [serialized, value] of snapshots) {
    const queryKey = JSON.parse(serialized) as readonly unknown[];
    client.setQueryData(queryKey, value);
  }
}

function snapshotKey(queryKey: readonly unknown[]): string {
  return JSON.stringify(queryKey);
}

export function useCacheMutation<TData, TVariables>(
  options: CacheMutationOptions<TData, TVariables>,
): UseMutationResult<TData, Error, TVariables> {
  const queryClient = useQueryClient();
  const snapshotsRef = useRef<Map<string, unknown> | null>(null);

  return useMutation<TData, Error, TVariables>({
    mutationFn: options.mutationFn,
    onMutate: async (variables) => {
      const patches = options.optimisticPatches ?? [];
      const snapshots = new Map<string, unknown>();

      for (const patch of patches) {
        const key = snapshotKey(patch.queryKey);
        snapshots.set(key, queryClient.getQueryData(patch.queryKey));
        queryClient.setQueryData(patch.queryKey, (previous: unknown) =>
          patch.updater(previous),
        );
      }

      snapshotsRef.current = snapshots;
      return variables;
    },
    onSuccess: async (data, variables) => {
      if (options.invalidateKeys) {
        await Promise.all(
          options.invalidateKeys.map((key) =>
            queryClient.invalidateQueries({
              queryKey: key as readonly unknown[],
              refetchType: "active",
            }),
          ),
        );
      }

      if (options.successMessage) {
        toast.success(options.successMessage);
      }

      await options.onSuccess?.(data, variables);
    },
    onError: (error, variables) => {
      const snapshots = snapshotsRef.current;

      if (snapshots) {
        restoreSnapshots(snapshots, queryClient);
      }

      toast.error(
        options.errorMessage ?? "Belum berhasil, coba lagi sebentar.",
      );
      options.onError?.(error, variables);
      snapshotsRef.current = null;
    },
    onSettled: () => {
      snapshotsRef.current = null;
    },
  });
}
