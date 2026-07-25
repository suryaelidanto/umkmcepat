import { createFileRoute } from "@tanstack/react-router";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const CUID_RE = /^c[a-z0-9]{24}$/i;
const MAX_LIMIT = 200;

export const Route = createFileRoute("/api/user/energy-ledger")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await auth();

        if (!session?.user?.id) {
          return Response.json(
            { message: "Masuk dulu untuk melanjutkan." },
            { status: 401 },
          );
        }

        const url = new URL(request.url);
        const rawLimit = url.searchParams.get("limit");
        const rawProjectId = url.searchParams.get("projectId");

        const limit = Math.min(
          Math.max(1, Number.parseInt(rawLimit ?? "50", 10) || 50),
          MAX_LIMIT,
        );

        const projectId =
          rawProjectId && CUID_RE.test(rawProjectId) ? rawProjectId : undefined;

        const rows = await prisma.userCredit.findMany({
          where: {
            userId: session.user.id,
            amount: { lt: 0 },
            ...(projectId ? { projectId } : {}),
          },
          orderBy: { createdAt: "desc" },
          take: limit,
          select: {
            id: true,
            createdAt: true,
            reason: true,
            inputTokens: true,
            outputTokens: true,
            amount: true,
            projectId: true,
          },
        });

        return Response.json({
          entries: rows.map((row) => ({
            id: row.id,
            createdAt: row.createdAt.toISOString(),
            reason: row.reason,
            inputTokens: row.inputTokens,
            outputTokens: row.outputTokens,
            amount: row.amount,
            projectId: row.projectId,
          })),
        });
      },
    },
  },
});
