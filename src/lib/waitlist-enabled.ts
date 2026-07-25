// Waitlist onboarding gate. false = pass-through (signed-in users skip the
// gate). Unset/invalid defaults true (fail-safe: over-gate rather than
// accidentally let everyone through). Prod/dev is the env value, not NODE_ENV.
export function isWaitlistEnabled(): boolean {
  return process.env.WAITLIST_ENABLED?.toLowerCase() !== "false";
}
