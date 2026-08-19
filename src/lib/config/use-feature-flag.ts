import { useQuery } from "@tanstack/react-query";

import type { PublicFeatureFlag } from "@/lib/config/feature-flags-keys";

const FLAGS_KEY = ["public-flags"] as const;

async function fetchPublicFlags(): Promise<Record<PublicFeatureFlag, boolean>> {
  const response = await fetch("/api/flags", { cache: "no-store" });
  return (await response.json()) as Record<PublicFeatureFlag, boolean>;
}

export function usePublicFlags() {
  return useQuery({
    queryFn: fetchPublicFlags,
    queryKey: FLAGS_KEY,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
}

export function useFeatureFlag(key: PublicFeatureFlag): boolean {
  const { data } = usePublicFlags();
  return data?.[key] ?? true;
}
