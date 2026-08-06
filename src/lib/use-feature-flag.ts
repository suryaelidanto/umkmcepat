import { useQuery } from "@tanstack/react-query";

import type { PublicFeatureFlag } from "@/lib/feature-flags-keys";

import { getPublicFlags } from "@/lib/feature-flags";

const FLAGS_KEY = ["public-flags"] as const;

export function usePublicFlags() {
  return useQuery({
    queryFn: getPublicFlags,
    queryKey: FLAGS_KEY,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });
}

export function useFeatureFlag(key: PublicFeatureFlag): boolean {
  const { data } = usePublicFlags();
  return data?.[key] ?? true;
}
