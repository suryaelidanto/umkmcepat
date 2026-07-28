import { createFileRoute } from "@tanstack/react-router";

import { auth } from "@/lib/auth";
import {
  type WaitlistStatus,
  isAdminEmail,
  isWaitlistApproved,
} from "@/lib/waitlist";
import { isWaitlistEnabled } from "@/lib/waitlist-enabled";
import { type OwnEntry, getOwnWaitlistEntry } from "@/lib/waitlist-own-entry";

type ResolveInput = {
  email: string | null;
  isAdmin: boolean;
  isApproved: WaitlistStatus | null;
  waitlistEnabled: boolean;
};

export function resolveUserWaitlistStatus({
  email,
  isAdmin,
  isApproved,
  waitlistEnabled,
}: ResolveInput): { own?: OwnEntry; status: string | null } {
  if (!email) {
    return { status: null };
  }
  // Admins always bypass the gate, in every environment. To exercise the
  // gate itself locally, sign in with a non-admin account instead.
  if (isAdmin) {
    return { status: "approved" };
  }
  if (!waitlistEnabled) {
    return { status: "approved" };
  }
  if (isApproved === "approved") {
    return { status: "approved" };
  }
  return { status: null };
}

export const Route = createFileRoute("/api/user/waitlist")({
  server: {
    handlers: {
      // Returns the signed-in user's effective gate status + their own entry
      // (for pre-fill on rejection). Admins are always "approved". Anonymous
      // users get { status: null } (gate leaves them alone so the landing
      // page + /waitlist are reachable). WAITLIST_ENABLED=false = pass-through
      // (signed-in non-admins skip the gate); unset/invalid defaults true.
      GET: async () => {
        const session = await auth();
        const email = session?.user?.email ?? null;
        const isAdmin = email ? isAdminEmail(email) : false;
        const waitlistEnabled = await isWaitlistEnabled();
        const isApproved = email ? await isWaitlistApproved(email) : null;
        const resolved = resolveUserWaitlistStatus({
          email,
          isAdmin,
          isApproved,
          waitlistEnabled,
        });
        const isDev = process.env.NODE_ENV === "development";
        const own =
          email && (!isAdmin || isDev)
            ? await getOwnWaitlistEntry(email)
            : undefined;
        return Response.json({ ...resolved, own });
      },
    },
  },
});
