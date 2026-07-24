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

  if (response.status === 401) {
    // Await so the signOut + redirect completes before `parseApiResponse`
    // throws below. Fire-and-forget (`void ...`) races the throw: the error
    // propagates (and the request unwinds) before the dynamic import +
    // signOut land, so a 401 could fail to sign the user out. The test
    // "triggers signOut when a request returns 401" depends on this ordering.
    await handleUnauthorizedError(input);
  }

  const result = await parseApiResponse<T>(response);

  if (!result.ok) {
    throw new Error(result.error.message || "Request failed");
  }

  return result.data;
}

async function handleUnauthorizedError(
  input: RequestInfo | URL,
): Promise<void> {
  if (typeof window === "undefined") {
    return;
  }

  const urlString =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

  // Do not intercept auth calls (callbacks, sessions, CSRF token, Otp verification, etc)
  if (urlString.includes("/api/auth/")) {
    return;
  }

  // Endpoints that are designed to be guest-safe: they return 401 when the
  // user is logged out, and the caller treats that as "no data" rather than
  // "session corrupt". Without this skip, a guest visiting the site (e.g. on
  // a fresh host where the auth cookie is for a different domain) would
  // enter a signOut → reload → 401 → signOut loop.
  if (
    urlString.includes("/api/user/verification") ||
    urlString.includes("/api/user/credits")
  ) {
    return;
  }

  try {
    const { signOut } = await import("./auth-client");
    // Clean sign out and redirect to home landing page
    await signOut({ callbackUrl: "/" });
  } catch (error) {
    console.error("Failed to sign out on 401:", error);
  }
}

export function notifyEnergyChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("umkm:energy-changed"));
  }
}

export type CachePatch<TVariables = void> = {
  queryKey: readonly unknown[];
  updater: (previous: unknown, variables: TVariables) => unknown;
};

export type CacheMutationOptions<TData, TVariables> = {
  errorMessage?: string;
  invalidateKeys?: readonly (readonly unknown[])[];
  mutationFn: (variables: TVariables) => Promise<TData>;
  onError?: (error: Error, variables: TVariables) => void;
  onSuccess?: (data: TData, variables: TVariables) => void | Promise<void>;
  optimisticPatches?: readonly CachePatch<TVariables>[];
  successMessage?: string;
};

export function applyPatches<T, TVariables = void>(
  previous: T,
  patches: readonly CachePatch<TVariables>[],
  variables: TVariables,
): T {
  return patches.reduce(
    (current, patch) => patch.updater(current, variables) as T,
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
          patch.updater(previous, variables),
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
