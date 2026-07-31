// Server-only gate for every _main.* page. Marked server-only via the
// @tanstack/react-start/server-only side-effect import so the import-protection
// plugin does not bundle it into the client.
import "@tanstack/react-start/server-only";

import { redirect } from "@tanstack/react-router";

import { getAuthState } from "@/lib/auth";
import { isUserVerified } from "@/lib/user-credits";
import { isAdminEmail, isWaitlistApproved } from "@/lib/waitlist";
import { isWaitlistEnabled } from "@/lib/waitlist-enabled";
import { isWaitlistGateBypassPath } from "@/lib/waitlist-route-access";
import { resolveUserWaitlistStatus } from "@/routes/api.user.waitlist";

export async function checkRouteGates(pathname: string) {
  const waitlistBypass = isWaitlistGateBypassPath(pathname);

  const { session, banned } = await getAuthState();

  if (banned && pathname !== "/blocked") {
    throw redirect({ to: "/blocked" });
  }

  if (banned) {
    return { ok: true as const };
  }

  if (!session?.user?.id) {
    return { ok: true as const };
  }

  const verified = await isUserVerified(session.user.id);
  if (!verified) {
    throw redirect({ to: "/verify" });
  }

  // Admin UI is gated by requireAdmin() (ADMIN_EMAILS allowlist), not
  // waitlist. Waitlisted real admins must still open /admin; product routes
  // stay waitlist-blocked so they experience the product as a normal user.
  if (!waitlistBypass) {
    const email = session.user.email ?? null;
    const isAdmin = email ? isAdminEmail(email) : false;
    const waitlistEnabled = await isWaitlistEnabled();
    const isApproved = email ? await isWaitlistApproved(email) : null;

    const resolved = resolveUserWaitlistStatus({
      email,
      isAdmin,
      isApproved,
      waitlistEnabled,
    });

    if (resolved.status !== "approved") {
      throw redirect({ to: "/waitlist" });
    }
  }

  return { ok: true as const };
}
