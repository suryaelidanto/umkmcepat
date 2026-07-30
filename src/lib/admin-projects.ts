import { prisma } from "./prisma";

type AdminProjectRow = {
  buildStatus: string;
  createdAt: Date;
  id: string;
  status: string;
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
        title: true;
        updatedAt: true;
        user: { select: { email: true; id: true; name: true } };
      };
      take: 50;
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
  title: string;
  updatedAt: string;
};

export type AdminProjectsResponse = {
  projects: AdminProject[];
};

export async function listAdminProjects(
  client: AdminProjectsClient = prisma,
): Promise<AdminProjectsResponse> {
  const projects = await client.project.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      buildStatus: true,
      createdAt: true,
      id: true,
      status: true,
      title: true,
      updatedAt: true,
      user: { select: { email: true, id: true, name: true } },
    },
    take: 50,
  });

  return {
    projects: projects.map((project) => ({
      buildStatus: project.buildStatus,
      createdAt: project.createdAt.toISOString(),
      id: project.id,
      owner: project.user,
      status: project.status,
      title: project.title,
      updatedAt: project.updatedAt.toISOString(),
    })),
  };
}
