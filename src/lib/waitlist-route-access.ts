export function isWaitlistMarketingPublicPath(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname === "/blocked" ||
    pathname === "/waitlist" ||
    pathname === "/privacy" ||
    pathname === "/terms" ||
    pathname.startsWith("/booster/success/")
  );
}

/** Paths waitlist must not block. Admin UI is still gated by requireAdmin(). */
export function isWaitlistGateBypassPath(pathname: string): boolean {
  return (
    isWaitlistMarketingPublicPath(pathname) ||
    pathname === "/admin" ||
    pathname.startsWith("/admin/")
  );
}
