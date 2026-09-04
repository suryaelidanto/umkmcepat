import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

import { resolveUserWaitlistStatus } from "./api.user.waitlist";

import { WaitlistFeature } from "@/components/waitlist/WaitlistFeature";
import { auth } from "@/lib/auth/auth";
import { isWaitlistEnabled } from "@/lib/waitlist/waitlist-enabled";
import { getOwnWaitlistEntry } from "@/lib/waitlist/waitlist-own-entry";

const gateIfApproved = createServerFn({ method: "GET" }).handler(async () => {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    throw redirect({ to: "/" });
  }

  const { isAdminEmail, isWaitlistApproved } =
    await import("@/lib/waitlist/waitlist");
  const email = session.user.email;
  const isAdmin = isAdminEmail(email);
  const isApproved = await isWaitlistApproved(email);
  const waitlistEnabled = await isWaitlistEnabled();
  const isDev = process.env.NODE_ENV === "development";

  const resolved = resolveUserWaitlistStatus({
    email,
    isAdmin,
    isApproved,
    isDevelopment: isDev,
    waitlistEnabled,
  });

  if (resolved.status === "approved") {
    throw redirect({ to: "/" });
  }

  const own = await getOwnWaitlistEntry(email);
  return { own, isAdmin };
});

export const Route = createFileRoute("/_main/waitlist")({
  loader: async () => await gateIfApproved(),
  component: WaitlistRoute,
});

function WaitlistRoute() {
  const { own, isAdmin } = Route.useLoaderData();
  return <WaitlistFeature initialOwn={own} isAdmin={isAdmin} />;
}
