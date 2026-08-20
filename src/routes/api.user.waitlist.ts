import { createFileRoute } from "@tanstack/react-router";

import { canUseDevTools } from "@/lib/admin/dev-admin";
import { auth } from "@/lib/auth/auth";
import {
  type WaitlistStatus,
  isAdminEmail,
  isWaitlistApproved,
} from "@/lib/waitlist/waitlist";
import { isWaitlistEnabled } from "@/lib/waitlist/waitlist-enabled";
import {
  type OwnEntry,
  getOwnWaitlistEntry,
} from "@/lib/waitlist/waitlist-own-entry";

type ResolveInput = {
  email: string | null;
  isAdmin: boolean;
  isApproved: WaitlistStatus | null;
  isDevelopment: boolean;
  waitlistEnabled: boolean;
};

export function resolveUserWaitlistStatus({
  email,
  isAdmin,
  isApproved,
  isDevelopment,
  waitlistEnabled,
}: ResolveInput): {
  own?: OwnEntry;
  status: string | null;
  canUseDevTools: boolean;
} {
  const hasDevTools = canUseDevTools({ isDevelopment, isAdmin });
  if (!email) {
    return { status: null, canUseDevTools: false };
  }
  // In production, admins always bypass the gate. In dev, admins are treated
  if ((isAdmin && !isDevelopment) || !waitlistEnabled) {
    return { status: "approved", canUseDevTools: hasDevTools };
  }
  if (isApproved === "approved") {
    return { status: "approved", canUseDevTools: hasDevTools };
  }
  return { status: null, canUseDevTools: hasDevTools };
}

export const Route = createFileRoute("/api/user/waitlist")({
  server: {
    handlers: {
      // Returns the signed-in user's effective gate status + their own entry
      GET: async () => {
        const session = await auth();
        const email = session?.user?.email ?? null;
        const isAdmin = email ? isAdminEmail(email) : false;
        const waitlistEnabled = await isWaitlistEnabled();
        const isApproved = email ? await isWaitlistApproved(email) : null;
        const isDev = process.env.NODE_ENV === "development";
        const resolved = resolveUserWaitlistStatus({
          email,
          isAdmin,
          isApproved,
          isDevelopment: isDev,
          waitlistEnabled,
        });
        const own =
          email && (!isAdmin || isDev)
            ? await getOwnWaitlistEntry(email)
            : undefined;
        return Response.json({ ...resolved, own });
      },
    },
  },
});
