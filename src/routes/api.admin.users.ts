import { createFileRoute } from "@tanstack/react-router";

import { requireAdmin } from "@/lib/auth-admin";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 20;

export const Route = createFileRoute("/api/admin/users")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const admin = await requireAdmin();
        if (!admin.ok) {
          return Response.json(
            { message: admin.message },
            { status: admin.status },
          );
        }
        const url = new URL(request.url);
        const q = url.searchParams.get("q")?.trim() ?? "";
        const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
        const where = q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" as const } },
                { email: { contains: q, mode: "insensitive" as const } },
              ],
            }
          : {};
        const [users, total] = await Promise.all([
          prisma.user.findMany({
            orderBy: { createdAt: "desc" },
            take: PAGE_SIZE,
            skip: (page - 1) * PAGE_SIZE,
            where,
            select: {
              bannedAt: true,
              createdAt: true,
              email: true,
              id: true,
              name: true,
              phone: true,
              verifiedAt: true,
              _count: { select: { projects: true } },
            },
          }),
          prisma.user.count({ where }),
        ]);
        return Response.json({
          users: users.map((u) => ({
            bannedAt: u.bannedAt?.toISOString() ?? null,
            createdAt: u.createdAt.toISOString(),
            email: u.email,
            id: u.id,
            name: u.name,
            phone: u.phone,
            projectsCount: u._count.projects,
            verified: Boolean(u.verifiedAt),
          })),
          page,
          total,
          totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
        });
      },
    },
  },
});
