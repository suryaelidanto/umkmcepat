import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type AdminProjectRow = {
  buildCheckpoints?: Array<{ id: string }>;
  buildStatus: string;
  builds?: Array<{ id: string; status: string; artifactRef: string | null }>;
  createdAt: Date;
  deployments?: Array<{
    id: string;
    kind: string;
    slug: string | null;
    status: string;
  }>;
  id: string;
  status: string;
  thumbnailRef: string | null;
  thumbnailUpdatedAt?: Date | null;
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
    count(args?: { where?: Prisma.ProjectWhereInput }): Promise<number>;
    findMany(args: {
      orderBy: { createdAt: "desc" };
      select: {
        buildCheckpoints?: { select: { id: true }; take: 1 };
        buildStatus: true;
        builds?: {
          orderBy: { createdAt: "desc" };
          select: { artifactRef: true; id: true; status: true };
          take: 5;
        };
        createdAt: true;
        deployments?: {
          orderBy: { createdAt: "desc" };
          select: { id: true; kind: true; slug: true; status: true };
          take: 5;
        };
        id: true;
        status: true;
        thumbnailRef: true;
        thumbnailUpdatedAt?: true;
        title: true;
        updatedAt: true;
        user: { select: { email: true; id: true; name: true } };
      };
      take: 50;
      where?: Prisma.ProjectWhereInput;
    }): Promise<unknown>;
  };
};

export type AdminProjectAccessStatus = "published" | "has_preview" | "none";
export type AdminProjectOperationOutcome =
  "failed" | "running" | "succeeded" | "idle";

export type AdminProject = {
  accessStatus: AdminProjectAccessStatus;
  buildStatus: string;
  createdAt: string;
  hasWorkingSnapshot: boolean;
  id: string;
  latestOperationOutcome: AdminProjectOperationOutcome;
  owner: {
    email: string | null;
    id: string;
    name: string | null;
  };
  publishedUrl: string | null;
  status: string;
  thumbnailUrl: string | null;
  title: string;
  updatedAt: string;
};

export type AdminProjectsResponse = {
  projects: AdminProject[];
  total: number;
};

export type AdminProjectFilter =
  | "all"
  | "failed"
  | "running"
  | "published"
  | "has_preview"
  | "ready"
  | "active"
  | "needs_attention";

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
    raw === "all" ||
    raw === "failed" ||
    raw === "running" ||
    raw === "published" ||
    raw === "has_preview"
  ) {
    return raw;
  }
  // Backwards compatibility for old query params
  if (raw === "needs_attention") {
    return "failed";
  }
  if (raw === "active") {
    return "running";
  }
  if (raw === "ready") {
    return "has_preview";
  }
  return "all";
}

export function projectWhere(
  filter: AdminProjectFilter,
  searchQuery?: string,
): Prisma.ProjectWhereInput | undefined {
  const filterClause: Prisma.ProjectWhereInput | undefined =
    filter === "all"
      ? undefined
      : filter === "failed"
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
        : filter === "running"
          ? {
              OR: [
                { buildStatus: { in: [...ACTIVE_BUILD] } },
                { status: { in: [...ACTIVE_BUILD] } },
              ],
            }
          : filter === "published"
            ? {
                deployments: {
                  some: {
                    kind: "published",
                    status: { not: "failed" },
                  },
                },
              }
            : filter === "has_preview"
              ? {
                  OR: [
                    { buildCheckpoints: { some: {} } },
                    { builds: { some: { status: "succeeded" } } },
                    { status: "ready" },
                    { buildStatus: { in: [...READY_BUILD] } },
                  ],
                }
              : undefined;

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
  const [total, projects] = await Promise.all([
    client.project.count({ ...(where ? { where } : {}) }),
    client.project.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        buildCheckpoints: { select: { id: true }, take: 1 },
        buildStatus: true,
        builds: {
          orderBy: { createdAt: "desc" },
          select: { artifactRef: true, id: true, status: true },
          take: 5,
        },
        createdAt: true,
        deployments: {
          orderBy: { createdAt: "desc" },
          select: { id: true, kind: true, slug: true, status: true },
          take: 5,
        },
        id: true,
        status: true,
        thumbnailRef: true,
        thumbnailUpdatedAt: true,
        title: true,
        updatedAt: true,
        user: { select: { email: true, id: true, name: true } },
      },
      take: 50,
      ...(where ? { where } : {}),
    }) as Promise<AdminProjectRow[]>,
  ]);

  return {
    total,
    projects: projects.map((project) => {
      const isFailed =
        project.buildStatus.toLowerCase().includes("fail") ||
        project.buildStatus.toLowerCase().includes("error") ||
        project.status.toLowerCase().includes("fail") ||
        project.status.toLowerCase().includes("error") ||
        project.buildStatus === "canceled" ||
        project.status === "canceled";

      const isRunning =
        project.status === "building" ||
        project.buildStatus === "running" ||
        project.buildStatus === "building";

      const isSucceeded =
        project.buildStatus === "passed" ||
        project.buildStatus === "succeeded" ||
        project.buildStatus === "ready" ||
        project.status === "ready";

      const latestOperationOutcome: AdminProject["latestOperationOutcome"] =
        isFailed
          ? "failed"
          : isRunning
            ? "running"
            : isSucceeded
              ? "succeeded"
              : "idle";

      const hasCheckpoint = (project.buildCheckpoints?.length ?? 0) > 0;
      const hasSuccessfulBuild = (project.builds ?? []).some(
        (b) => b.status === "succeeded",
      );
      const hasWorkingSnapshot =
        hasCheckpoint || hasSuccessfulBuild || isSucceeded;

      const publishedDeployment = (project.deployments ?? []).find(
        (d) => d.kind === "published" && d.status !== "failed",
      );

      const accessStatus: AdminProject["accessStatus"] = publishedDeployment
        ? "published"
        : hasWorkingSnapshot
          ? "has_preview"
          : "none";

      const publishedUrl = publishedDeployment?.slug
        ? `https://${publishedDeployment.slug}.umkmcepat.com`
        : null;

      const cacheTimestamp =
        project.thumbnailUpdatedAt?.getTime() ?? project.updatedAt.getTime();

      return {
        accessStatus,
        buildStatus: project.buildStatus,
        createdAt: project.createdAt.toISOString(),
        hasWorkingSnapshot,
        id: project.id,
        latestOperationOutcome,
        owner: project.user,
        publishedUrl,
        status: project.status,
        thumbnailUrl: project.thumbnailRef
          ? `/api/projects/${project.id}/thumbnail?v=${cacheTimestamp}`
          : null,
        title: project.title,
        updatedAt: project.updatedAt.toISOString(),
      };
    }),
  };
}
