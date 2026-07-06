import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRuntimeSupervisor } from "@/lib/projects/runtime-supervisor";

export const runtime = "nodejs";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();

  if (!session?.user?.id) {
    return Response.json(
      { message: "Masuk dulu untuk melanjutkan." },
      { status: 401 },
    );
  }

  const { id } = await params;
  const project = await prisma.project.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true },
  });

  if (!project) {
    return Response.json(
      { message: "Proyek tidak ditemukan." },
      { status: 404 },
    );
  }

  const [build, deployment, publishedDeployment, events] = await Promise.all([
    prisma.projectBuild.findFirst({
      where: { projectId: project.id },
      orderBy: { createdAt: "desc" },
      select: {
        artifactRef: true,
        createdAt: true,
        finishedAt: true,
        id: true,
        logText: true,
        startedAt: true,
        status: true,
      },
    }),
    prisma.projectDeployment.findFirst({
      where: { kind: "preview", projectId: project.id },
      orderBy: { createdAt: "desc" },
      select: {
        createdAt: true,
        id: true,
        kind: true,
        lastRequestAt: true,
        publicPath: true,
        startedAt: true,
        status: true,
        stoppedAt: true,
        updatedAt: true,
      },
    }),
    prisma.projectDeployment.findFirst({
      where: { kind: "published", projectId: project.id },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        publicPath: true,
        slug: true,
        status: true,
        updatedAt: true,
      },
    }),
    prisma.runtimeEvent.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: "desc" },
      select: {
        buildId: true,
        createdAt: true,
        deploymentId: true,
        id: true,
        message: true,
        type: true,
      },
      take: 20,
    }),
  ]);
  const liveDeploymentStatus =
    deployment?.status === "running" || deployment?.status === "starting"
      ? await getRuntimeSupervisor().getDeploymentStatus(deployment.id)
      : deployment?.status;

  return Response.json({
    build,
    deployment: deployment
      ? {
          ...deployment,
          status: liveDeploymentStatus,
        }
      : null,
    events,
    publishedDeployment,
  });
}
