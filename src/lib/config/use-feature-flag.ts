import { useQuery } from "@tanstack/react-query";

import type { PublicAppSettingKey } from "@/lib/config/feature-flags-keys";

const FLAGS_KEY = ["public-flags"] as const;

async function fetchPublicFlags(): Promise<
  Record<PublicAppSettingKey, boolean | string>
> {
  const response = await fetch("/api/flags", { cache: "no-store" });
  return (await response.json()) as Record<
    PublicAppSettingKey,
    boolean | string
  >;
}

export function usePublicFlags() {
  return useQuery({
    queryFn: fetchPublicFlags,
    queryKey: FLAGS_KEY,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
}

export function useFeatureFlag(
  key:
    | "feature.composer_uploads_enabled"
    | "feature.visual_edit_enabled"
    | "feature.direct_edit_enabled",
): boolean {
  const { data } = usePublicFlags();
  if (
    key === "feature.visual_edit_enabled" ||
    key === "feature.direct_edit_enabled"
  ) {
    const val =
      data?.["feature.visual_edit_enabled"] ??
      data?.["feature.direct_edit_enabled"];
    return (val as boolean | undefined) ?? true;
  }
  return (data?.[key] as boolean | undefined) ?? true;
}

export function useDefaultThemeSetting(initialTheme?: string): string {
  const { data } = usePublicFlags();
  const val = data?.["feature.default_theme"];
  if (typeof val === "string") {
    return val;
  }
  return initialTheme || "dark";
}
