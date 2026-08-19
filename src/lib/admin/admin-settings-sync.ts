import { queryKeys } from "@/lib/query-client";

/** Query keys to invalidate after a successful PUT /api/admin/settings. */
export function settingsSaveInvalidateKeys(): readonly (readonly string[])[] {
  return [
    ["admin", "settings"],
    queryKeys.adminStreamerMode,
    queryKeys.boosterPacks,
    queryKeys.projects,
    queryKeys.energy,
    queryKeys.waitlistStatus,
  ];
}
