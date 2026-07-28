import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

import { resolveUserWaitlistStatus } from "./api.user.waitlist";

import { MainChrome } from "@/components/common/MainChrome";
import { auth } from "@/lib/auth";
import { isUserVerified } from "@/lib/user-credits";
import { isAdminEmail, isWaitlistApproved } from "@/lib/waitlist";
import { isWaitlistEnabled } from "@/lib/waitlist-enabled";

const checkRouteGates = createServerFn({ method: "GET" })
  .validator((d: { pathname: string }) => d)
  .handler(async ({ data: { pathname } }) => {
    const isPublicRoute =
      pathname === "/waitlist" ||
      pathname === "/privacy" ||
      pathname === "/terms";

    const session = await auth();

    if (!session?.user?.id) {
      return { ok: true as const };
    }

    // 1. Check OTP Verification
    const verified = await isUserVerified(session.user.id);
    if (!verified) {
      throw redirect({ to: "/verify" });
    }

    // 2. Check Waitlist Status
    if (!isPublicRoute) {
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
  });

// Pathless layout route: wraps every page under it in MainChrome (header,
// footer, verification gate), matching the previous (main) route group layout.
export const Route = createFileRoute("/_main")({
  beforeLoad: async ({ location }) => {
    await checkRouteGates({ data: { pathname: location.pathname } });
  },
  component: MainLayout,
});

function MainLayout() {
  return (
    <MainChrome>
      <Outlet />
    </MainChrome>
  );
}
