import { createFileRoute } from "@tanstack/react-router";

import { requireAdmin } from "@/lib/auth/auth-admin";
import {
  sendWaitlistAccepted,
  sendWaitlistRejected,
} from "@/lib/email/templates";
import { prisma } from "@/lib/prisma";
import {
  approveWaitlistEntry,
  type AdminWaitlistStatusFilter,
  listPendingWaitlist,
  rejectWaitlistEntry,
} from "@/lib/waitlist/waitlist";

const WAITLIST_STATUS: AdminWaitlistStatusFilter[] = [
  "pending",
  "approved",
  "rejected",
  "all",
];

function parseWaitlistStatus(raw: string | null): AdminWaitlistStatusFilter {
  if (raw && WAITLIST_STATUS.includes(raw as AdminWaitlistStatusFilter)) {
    return raw as AdminWaitlistStatusFilter;
  }
  return "pending";
}

export const Route = createFileRoute("/api/admin/waitlist")({
  server: {
    handlers: {
      // List waitlist entries (admin-only). ?status=pending|approved|rejected|all
      GET: async ({ request }) => {
        const admin = await requireAdmin();
        if (!admin.ok) {
          return Response.json(
            { message: admin.message },
            { status: admin.status },
          );
        }
        const url = new URL(request.url);
        const status = parseWaitlistStatus(url.searchParams.get("status"));
        const q = url.searchParams.get("q") ?? undefined;
        const entries = await listPendingWaitlist(status, q);
        return Response.json({
          entries: entries.map((entry) => ({
            businessName: entry.businessName,
            businessType: entry.businessType,
            email: entry.email,
            id: entry.id,
            imageCount: entry.imageCount,
            phone: entry.phone,
            rejectionReason: entry.rejectionReason,
            status: entry.status,
            story: entry.story,
            submittedAt: entry.submittedAt.toISOString(),
          })),
          status,
        });
      },

      // Approve or reject a waitlist entry. Body: { entryId, action: "approve"
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
          // Non-fatal email
          prisma.waitlistEntry
            .findUnique({
              where: { id: body.entryId },
              select: { email: true, businessName: true },
            })
            .then((entry) => {
              if (entry?.email) {
                sendWaitlistAccepted(
                  entry.email,
                  entry.businessName ?? undefined,
                ).catch(() => undefined);
              }
            })
            .catch(() => undefined);
          return Response.json({ status: "approved" });
        }

        if (body.action === "reject") {
          await rejectWaitlistEntry(
            body.entryId,
            admin.admin.userId,
            body.reason ?? "",
          );
          // Non-fatal email
          prisma.waitlistEntry
            .findUnique({
              where: { id: body.entryId },
              select: { email: true, businessName: true },
            })
            .then((entry) => {
              if (entry?.email) {
                sendWaitlistRejected(
                  entry.email,
                  entry.businessName ?? undefined,
                  body.reason,
                ).catch(() => undefined);
              }
            })
            .catch(() => undefined);
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
