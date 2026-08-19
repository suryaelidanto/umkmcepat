import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type AdminProjectRow = {
  buildStatus: string;
  createdAt: Date;
  id: string;
  status: string;
  thumbnailRef: string | null;
  title: string;
  updatedAt: Date;
  user: {
    email: string | null;
    id: string;
    name: string | null;
  };
};

type AdminProjectsClient = {
  project: {
    findMany(args: {
      orderBy: { createdAt: "desc" };
      select: {
        buildStatus: true;
        createdAt: true;
        id: true;
        status: true;
        thumbnailRef: true;
        title: true;
        updatedAt: true;
        user: { select: { email: true; id: true; name: true } };
      };
      take: 50;
      where?: Prisma.ProjectWhereInput;
    }): Promise<AdminProjectRow[]>;
  };
};

export type AdminProject = {
  buildStatus: string;
  createdAt: string;
  id: string;
  owner: {
    email: string | null;
    id: string;
    name: string | null;
  };
  status: string;
  thumbnailUrl: string | null;
  title: string;
  updatedAt: string;
};

export type AdminProjectsResponse = {
  projects: AdminProject[];
};

export type AdminProjectFilter = "needs_attention" | "active" | "ready" | "all";

const FAIL_BUILD = ["stale", "canceled", "cancelled"] as const;
const ACTIVE_BUILD = [
  "running",
  "building",
  "generating",
  "editing",
  "repairing",
  "queued",
  "starting",
] as const;
const READY_BUILD = ["ready", "passed", "succeeded", "built"] as const;

export function parseAdminProjectFilter(
  raw: string | null | undefined,
): AdminProjectFilter {
  if (
    raw === "needs_attention" ||
    raw === "active" ||
    raw === "ready" ||
    raw === "all"
  ) {
    return raw;
  }
  return "active";
}

export function projectWhere(
  filter: AdminProjectFilter,
  searchQuery?: string,
): Prisma.ProjectWhereInput | undefined {
  const filterClause =
    filter === "all"
      ? undefined
      : filter === "needs_attention"
        ? {
            OR: [
              {
                buildStatus: { contains: "fail", mode: "insensitive" as const },
              },
              {
                buildStatus: {
                  contains: "error",
                  mode: "insensitive" as const,
                },
              },
              { buildStatus: { in: [...FAIL_BUILD] } },
              { status: { contains: "fail", mode: "insensitive" as const } },
              { status: { contains: "error", mode: "insensitive" as const } },
              { status: { in: [...FAIL_BUILD] } },
            ],
          }
        : filter === "active"
          ? {
              OR: [
                { buildStatus: { in: [...ACTIVE_BUILD] } },
                { status: { in: [...ACTIVE_BUILD] } },
              ],
            }
          : {
              OR: [
                { buildStatus: { in: [...READY_BUILD] } },
                { status: { in: [...READY_BUILD] } },
              ],
            };

  const trimmedSearch = searchQuery?.trim();
  const searchClause: Prisma.ProjectWhereInput | undefined = trimmedSearch
    ? {
        OR: [
          { title: { contains: trimmedSearch, mode: "insensitive" as const } },
          {
            user: {
              email: { contains: trimmedSearch, mode: "insensitive" as const },
            },
          },
          {
            user: {
              name: { contains: trimmedSearch, mode: "insensitive" as const },
            },
          },
        ],
      }
    : undefined;

  if (filterClause && searchClause) {
    return { AND: [filterClause, searchClause] };
  }
  return filterClause || searchClause;
}

export async function listAdminProjects(
  client: AdminProjectsClient = prisma,
  filter: AdminProjectFilter = "all",
  searchQuery?: string,
): Promise<AdminProjectsResponse> {
  const where = projectWhere(filter, searchQuery);
  const projects = await client.project.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      buildStatus: true,
      createdAt: true,
      id: true,
      status: true,
      thumbnailRef: true,
      title: true,
      updatedAt: true,
      user: { select: { email: true, id: true, name: true } },
    },
    take: 50,
    ...(where ? { where } : {}),
  });

  return {
    projects: projects.map((project) => ({
      buildStatus: project.buildStatus,
      createdAt: project.createdAt.toISOString(),
      id: project.id,
      owner: project.user,
      status: project.status,
      thumbnailUrl: project.thumbnailRef
        ? `/api/projects/${project.id}/thumbnail`
        : null,
      title: project.title,
      updatedAt: project.updatedAt.toISOString(),
    })),
  };
}
