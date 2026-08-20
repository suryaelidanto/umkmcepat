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
  projects: ["projects"] as const,
  projectRuntime: (projectId: string) =>
    ["projects", projectId, "runtime"] as const,
  projectWorkspace: (projectId: string) =>
    ["projects", projectId, "workspace"] as const,
  projectSource: (projectId: string) =>
    ["projects", projectId, "source"] as const,
  projectSnapshots: (projectId: string) =>
    ["projects", projectId, "snapshots"] as const,
  projectChat: (projectId: string) => ["projects", projectId, "chat"] as const,
  waitlistStatus: ["waitlist-status"] as const,
  adminWaitlist: ["admin", "waitlist"] as const,
  adminNavCounts: ["admin", "nav-counts"] as const,
  adminOverview: ["admin", "overview"] as const,
  adminStreamerMode: ["admin", "streamer-mode"] as const,
  boosterPacks: ["booster-packs"] as const,
};

export const GATE_QUERY_OPTIONS = {
  staleTime: 10_000,
  refetchOnWindowFocus: true,
  refetchOnReconnect: true,
  retry: 1,
} as const;

export const WAITLIST_PENDING_POLL_MS = 15_000;
export const ADMIN_WAITLIST_POLL_MS = 15_000;
export const ADMIN_SUMMARY_POLL_MS = 30_000;

let unauthorizedSignOut: Promise<void> | null = null;

export type WaitlistOwnStatus = {
  businessName: string;
  businessType: string | null;
  id: string;
  rejectionReason: string | null;
  status: string;
  story: string;
};

export type WaitlistStatusResponse = {
  canUseDevTools?: boolean;
  status: string | null;
  own?: WaitlistOwnStatus | null;
};

export function waitlistPendingPollInterval(
  data: WaitlistStatusResponse | undefined,
): number | false {
  if (!data || data.status === "approved") {
    return false;
  }
  const ownStatus = data.own?.status;
  if (ownStatus === "pending" || ownStatus === "waitlisted") {
    return WAITLIST_PENDING_POLL_MS;
  }
  return false;
}

export function waitlistPagePollInterval(
  data: WaitlistStatusResponse | undefined,
  submitted: boolean,
): number | false {
  if (!submitted) {
    return waitlistPendingPollInterval(data);
  }
  if (
    data?.status === "approved" ||
    data?.own?.status === "rejected" ||
    data?.own?.status === "approved"
  ) {
    return false;
  }
  return WAITLIST_PENDING_POLL_MS;
}

export function fetchWaitlistStatus() {
  return fetchJson<WaitlistStatusResponse>("/api/user/waitlist", {
    cache: "no-store",
  });
}

export async function invalidateWaitlistStatus(
  queryClient: QueryClient,
): Promise<void> {
  await queryClient.invalidateQueries({
    queryKey: queryKeys.waitlistStatus,
    refetchType: "active",
  });
}

export async function invalidateAdminWaitlistData(
  queryClient: QueryClient,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: queryKeys.adminWaitlist,
      refetchType: "active",
    }),
    queryClient.invalidateQueries({
      queryKey: queryKeys.adminNavCounts,
      refetchType: "active",
    }),
    queryClient.invalidateQueries({
      queryKey: queryKeys.adminOverview,
      refetchType: "active",
    }),
    invalidateWaitlistStatus(queryClient),
  ]);
}

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

  // Do not intercept auth calls (callbacks, sessions, CSRF token, etc)
  if (urlString.includes("/api/auth/")) {
    return;
  }

  if (unauthorizedSignOut) {
    return unauthorizedSignOut;
  }

  unauthorizedSignOut = (async () => {
    try {
      const { signOut } = await import("@/lib/auth/auth-client");
      // Clean sign out and redirect to home landing page.
      await signOut({ callbackUrl: "/" });
    } catch (error) {
      console.error("Failed to sign out on 401:", error);
    }
  })().finally(() => {
    unauthorizedSignOut = null;
  });

  return unauthorizedSignOut;
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
