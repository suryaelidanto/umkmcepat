export function isWaitlistMarketingPublicPath(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname === "/blocked" ||
    pathname === "/waitlist" ||
    pathname === "/verify" ||
    pathname === "/privacy" ||
    pathname === "/terms" ||
    pathname.startsWith("/booster/success/")
  );
}
