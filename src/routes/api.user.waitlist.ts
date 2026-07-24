import { createFileRoute } from "@tanstack/react-router";

import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/waitlist";
import { isWaitlistApproved } from "@/lib/waitlist";

export const Route = createFileRoute("/api/user/waitlist")({
  server: {
    handlers: {
      // Returns the signed-in user's waitlist status. Admins are always
      // "approved". Anonymous users get { status: null } (gate leaves them
      // alone so the landing page + /waitlist are reachable).
      GET: async () => {
        const session = await auth();
        if (!session?.user?.email) {
          return Response.json({ status: null });
        }
        if (isAdminEmail(session.user.email)) {
          return Response.json({ status: "approved" });
        }
        const status = await isWaitlistApproved(session.user.email);
        return Response.json({ status });
      },
    },
  },
});
