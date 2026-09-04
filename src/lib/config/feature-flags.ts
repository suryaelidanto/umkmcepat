import {
  PUBLIC_APP_SETTINGS,
  type PublicAppSettingKey,
} from "./feature-flags-keys";

import { getSetting } from "@/lib/config/app-settings";

export async function getPublicFlags(): Promise<
  Record<PublicAppSettingKey, boolean | string>
> {
  const entries = await Promise.all(
    PUBLIC_APP_SETTINGS.map(async (key) => {
      try {
        if (key === "feature.default_theme") {
          return [key, await getSetting(key, "system")] as const;
        }
        return [key, await getSetting(key, false)] as const;
      } catch {
        if (key === "feature.default_theme") {
          return [key, "system"] as const;
        }
        return [key, false] as const;
      }
    }),
  );
  return Object.fromEntries(entries) as Record<
    PublicAppSettingKey,
    boolean | string
  >;
}
