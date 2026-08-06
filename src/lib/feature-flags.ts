import {
  PUBLIC_FEATURE_FLAGS,
  type PublicFeatureFlag,
} from "./feature-flags-keys";

import { getSetting } from "@/lib/app-settings";

export async function getPublicFlags(): Promise<
  Record<PublicFeatureFlag, boolean>
> {
  const entries = await Promise.all(
    PUBLIC_FEATURE_FLAGS.map(async (key) => {
      try {
        return [key, await getSetting(key, true)] as const;
      } catch {
        return [key, true] as const;
      }
    }),
  );
  return Object.fromEntries(entries) as Record<PublicFeatureFlag, boolean>;
}
