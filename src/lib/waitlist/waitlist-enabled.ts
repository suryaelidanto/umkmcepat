import { getSetting } from "@/lib/config/app-settings";

// Waitlist onboarding gate. false = pass-through (signed-in users skip the
export async function isWaitlistEnabled(): Promise<boolean> {
  const value = await getSetting<boolean>("feature.waitlist_enabled", true);
  // Fail-safe: any non-false value is treated as true (matches old env semantics).
  return value !== false;
}
