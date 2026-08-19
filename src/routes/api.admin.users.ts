import { createFileRoute } from "@tanstack/react-router";

import type { Prisma } from "@prisma/client";

import { requireAdmin } from "@/lib/auth/auth-admin";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 20;

export type AdminUserStatusFilter = "active" | "banned" | "all";

function parseUserStatus(raw: string | null): AdminUserStatusFilter {
  if (raw === "active" || raw === "banned" || raw === "all") {
    return raw;
  }
  return "all";
}

function userWhere(
  status: AdminUserStatusFilter,
  q: string,
): Prisma.UserWhereInput {
  const parts: Prisma.UserWhereInput[] = [];
  if (status === "active") {
    parts.push({ bannedAt: null });
  } else if (status === "banned") {
    parts.push({ bannedAt: { not: null } });
  }
  if (q) {
    parts.push({
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
      ],
    });
  }
  if (parts.length === 0) {
    return {};
  }
  if (parts.length === 1) {
    return parts[0]!;
  }
  return { AND: parts };
}

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
        const status = parseUserStatus(url.searchParams.get("status"));
        const where = userWhere(status, q);
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
            projectsCount: u._count.projects,
          })),
          page,
          status,
          total,
          totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
        });
      },
    },
  },
});
