import { createFileRoute } from "@tanstack/react-router";

import { requireAdmin } from "@/lib/auth-admin";
import {
  approveWaitlistEntry,
  listPendingWaitlist,
  rejectWaitlistEntry,
} from "@/lib/waitlist";

export const Route = createFileRoute("/api/admin/waitlist")({
  server: {
    handlers: {
      // List pending waitlist entries (admin-only).
      GET: async () => {
        const admin = await requireAdmin();
        if (!admin.ok) {
          return Response.json(
            { message: admin.message },
            { status: admin.status },
          );
        }
        const entries = await listPendingWaitlist();
        return Response.json({ entries });
      },

      // Approve or reject a waitlist entry. Body: { entryId, action: "approve"
      // | "reject", reason?: string }.
      POST: async ({ request }) => {
        const admin = await requireAdmin();
        if (!admin.ok) {
          return Response.json(
            { message: admin.message },
            { status: admin.status },
          );
        }

        const body = (await request.json().catch(() => ({}))) as {
          action?: string;
          entryId?: string;
          reason?: string;
        };

        if (!body.entryId || !body.action) {
          return Response.json(
            { message: "entryId dan action wajib diisi." },
            { status: 400 },
          );
        }

        if (body.action === "approve") {
          await approveWaitlistEntry(body.entryId, admin.admin.userId);
          return Response.json({ status: "approved" });
        }

        if (body.action === "reject") {
          await rejectWaitlistEntry(
            body.entryId,
            admin.admin.userId,
            body.reason ?? "",
          );
          return Response.json({ status: "rejected" });
        }

        return Response.json(
          { message: "action harus approve atau reject." },
          { status: 400 },
        );
      },
    },
  },
});
