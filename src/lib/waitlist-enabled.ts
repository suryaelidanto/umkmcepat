import { getSetting } from "@/lib/app-settings";

// Waitlist onboarding gate. false = pass-through (signed-in users skip the
// gate). Unset/invalid defaults true (fail-safe: over-gate rather than
// accidentally let everyone through). DB-overridable via AppSetting; falls
// back to WAITLIST_ENABLED env then hardcoded true.
export async function isWaitlistEnabled(): Promise<boolean> {
  const value = await getSetting<boolean>("feature.waitlist_enabled", true);
  // Fail-safe: any non-false value is treated as true (matches old env semantics).
  return value !== false;
}
