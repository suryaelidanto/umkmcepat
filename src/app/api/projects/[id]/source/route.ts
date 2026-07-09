import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { selectActivePreviewDeployment } from "@/lib/projects/deployment-resolution";
import { parseGeneratedProjectFiles } from "@/lib/projects/generated-source";
import { readProjectSourceArtifact } from "@/lib/projects/runtime-artifacts";

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

  const [sourceRow] = await prisma.$queryRaw<
    [
      {
        sourceFiles: unknown;
        buildStatus: string | null;
        buildLog: string | null;
      },
    ]
  >`
    SELECT "sourceFiles", "buildStatus", "buildLog" FROM "Project" WHERE id = ${project.id} AND "userId" = ${session.user.id}
  `;
  const deployments = await prisma.projectDeployment.findMany({
    where: { kind: "preview", projectId: project.id },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      build: {
        select: {
          artifactRef: true,
          createdAt: true,
          id: true,
          logText: true,
          snapshotId: true,
          status: true,
          updatedAt: true,
        },
      },
      buildId: true,
      createdAt: true,
      id: true,
      kind: true,
      snapshot: {
        select: {
          createdAt: true,
          files: true,
          id: true,
          metadata: true,
          sourceRef: true,
          sourceType: true,
        },
      },
      snapshotId: true,
      status: true,
      updatedAt: true,
    },
  });
  const latestAttempt = await prisma.projectBuild.findFirst({
    where: { projectId: project.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      logText: true,
      snapshot: {
        select: {
          createdAt: true,
          files: true,
          id: true,
          metadata: true,
          sourceRef: true,
          sourceType: true,
        },
      },
      snapshotId: true,
      status: true,
    },
  });
  const activeDeployment = selectActivePreviewDeployment(deployments);
  const activeSnapshot = activeDeployment?.snapshot;
  const activeBuild = activeDeployment?.build;
  const fallbackSnapshot = activeDeployment
    ? null
    : await prisma.projectSnapshot.findFirst({
        where: { projectId: project.id },
        orderBy: { createdAt: "desc" },
        select: {
          createdAt: true,
          files: true,
          id: true,
          metadata: true,
          sourceRef: true,
          sourceType: true,
        },
      });
  const snapshot = activeSnapshot ?? fallbackSnapshot;
  const artifactFiles = snapshot?.sourceRef
    ? await readProjectSourceArtifact(snapshot.sourceRef).catch(() => [])
    : [];
  const storedFiles = artifactFiles.length
    ? artifactFiles
    : parseGeneratedProjectFiles(snapshot?.files).length
      ? parseGeneratedProjectFiles(snapshot?.files)
      : parseGeneratedProjectFiles(sourceRow?.sourceFiles);
  return Response.json({
    projectId: project.id,
    buildLog: activeBuild?.logText ?? sourceRow?.buildLog ?? "",
    buildStatus: mapBuildStatusForWorkspace(
      activeBuild?.status ?? sourceRow?.buildStatus,
    ),
    currentPreviewSource: snapshot
      ? createSourceSummary(snapshot, activeBuild ?? null)
      : null,
    files: storedFiles,
    latestAttempt: latestAttempt ? createBuildSummary(latestAttempt) : null,
    latestAttemptSource: latestAttempt?.snapshot
      ? createSourceSummary(latestAttempt.snapshot, latestAttempt)
      : null,
  });
}

function createBuildSummary(build: {
  id: string;
  logText?: string | null;
  snapshotId?: string | null;
  status: string;
}) {
  return {
    buildId: build.id,
    logText: build.logText ?? null,
    snapshotId: build.snapshotId ?? null,
    status: build.status,
  };
}

function createSourceSummary(
  snapshot: {
    createdAt?: Date | string | null;
    id: string;
    metadata?: unknown;
    sourceRef?: string | null;
    sourceType?: string | null;
  },
  build: { id: string; status: string } | null,
) {
  return {
    buildId: build?.id ?? null,
    buildStatus: build?.status ?? null,
    createdAt: snapshot.createdAt ?? null,
    metadata: snapshot.metadata ?? null,
    snapshotId: snapshot.id,
    sourceRef: snapshot.sourceRef ?? null,
    sourceType: snapshot.sourceType ?? null,
  };
}

function mapBuildStatusForWorkspace(status?: string | null) {
  if (status === "succeeded") {
    return "passed";
  }

  if (status === "failed") {
    return "failed";
  }

  if (status === "running" || status === "queued") {
    return "building";
  }

  if (status === "canceled") {
    return "stopped";
  }

  return status ?? "not_started";
}
