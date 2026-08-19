import { SupportCategory } from "@prisma/client";
import { createFileRoute } from "@tanstack/react-router";

import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/prisma";
import { createTicket } from "@/lib/support/service";
import { mapToUserFacingError } from "@/lib/user-facing-error";

export const Route = createFileRoute("/api/support/tickets")({
  server: {
    handlers: {
      GET: async () => {
        const session = await auth();
        if (!session?.user?.id) {
          return Response.json(
            { message: "Masuk dulu untuk melanjutkan." },
            { status: 401 },
          );
        }

        const tickets = await prisma.supportTicket.findMany({
          where: { userId: session.user.id },
          orderBy: { updatedAt: "desc" },
          include: {
            messages: {
              orderBy: { createdAt: "desc" },
              take: 1,
            },
          },
        });

        return Response.json({ tickets });
      },

      POST: async ({ request }) => {
        const session = await auth();
        if (!session?.user?.id) {
          return Response.json(
            { message: "Masuk dulu untuk melanjutkan." },
            { status: 401 },
          );
        }

        const body = (await request.json().catch(() => ({}))) as {
          subject?: string;
          category?: string;
          body?: string;
          assetIds?: string[];
        };

        if (!body.subject || !body.category || !body.body) {
          return Response.json(
            { message: "Subject, kategori, dan detail pesan wajib diisi." },
            { status: 400 },
          );
        }

        const allowedCategories = Object.values(SupportCategory);
        if (!allowedCategories.includes(body.category as SupportCategory)) {
          return Response.json(
            { message: "Kategori tidak valid." },
            { status: 400 },
          );
        }

        try {
          const result = await createTicket({
            userId: session.user.id,
            subject: body.subject,
            category: body.category as SupportCategory,
            body: body.body,
            assetIds: body.assetIds,
          });

          return Response.json(result, { status: 201 });
        } catch (error) {
          const raw = error instanceof Error ? error.message : "";
          console.error("[support] create ticket failed:", raw, error);
          const mapped = mapToUserFacingError(raw);
          return Response.json(
            {
              message:
                mapped === "Permintaan belum bisa diproses. Coba lagi nanti." &&
                raw
                  ? raw
                  : mapped,
            },
            { status: 400 },
          );
        }
      },
    },
  },
});
