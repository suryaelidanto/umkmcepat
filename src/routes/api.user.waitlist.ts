import { createFileRoute } from "@tanstack/react-router";

import { auth } from "@/lib/auth";
import { isAdminEmail, isWaitlistApproved } from "@/lib/waitlist";

export const Route = createFileRoute("/api/user/waitlist")({
  server: {
    handlers: {
      // Returns the signed-in user's effective gate status. Admins are always
      // "approved". Anonymous users get { status: null } (gate leaves them
      // alone so the landing page + /waitlist are reachable). In non-production
      // (local dev), a signed-in user with NO waitlist entry is treated as
      // "approved" so the dev workflow isn't locked out — only an explicit
      // pending/rejected entry gates in dev. In production, null gates to
      // /waitlist (the pilot is closed unless approved).
      GET: async () => {
        const session = await auth();
        if (!session?.user?.email) {
          return Response.json({ status: null });
        }
        if (isAdminEmail(session.user.email)) {
          return Response.json({ status: "approved" });
        }
        const status = await isWaitlistApproved(session.user.email);
        const isProduction = process.env.NODE_ENV === "production";
        if (!isProduction && status === null) {
          return Response.json({ status: "approved" });
        }
        return Response.json({ status });
      },
    },
  },
});
