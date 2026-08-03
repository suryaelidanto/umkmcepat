export function postVerifyDestination(
  waitlistStatus: string | null | undefined,
): "/" | "/waitlist" {
  return waitlistStatus === "approved" ? "/" : "/waitlist";
}
