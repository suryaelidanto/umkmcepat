import { queryKeys } from "@/lib/query-client";

export function settingsSaveInvalidateKeys(): readonly (readonly string[])[] {
  return [
    ["admin", "settings"],
    ["public-flags"],
    queryKeys.adminStreamerMode,
    queryKeys.boosterPacks,
    queryKeys.projects,
    queryKeys.energy,
    queryKeys.waitlistStatus,
  ];
}
