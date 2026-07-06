import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  createGeneratedProjectFiles,
  parseGeneratedProjectFiles,
} from "@/lib/projects/generated-source";
import { readProjectSourceArtifact } from "@/lib/projects/runtime-artifacts";
import { parseProjectSiteSchema } from "@/lib/projects/site-schema";

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
    select: { id: true, prompt: true, siteSchema: true },
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
  const latestSnapshot = await prisma.projectSnapshot.findFirst({
    where: { projectId: project.id },
    orderBy: { createdAt: "desc" },
    select: { files: true, sourceRef: true },
  });
  const latestBuild = await prisma.projectBuild.findFirst({
    where: { projectId: project.id },
    orderBy: { createdAt: "desc" },
    select: { logText: true, status: true },
  });
  const artifactFiles = latestSnapshot?.sourceRef
    ? await readProjectSourceArtifact(latestSnapshot.sourceRef).catch(() => [])
    : [];
  const storedFiles = artifactFiles.length
    ? artifactFiles
    : parseGeneratedProjectFiles(latestSnapshot?.files).length
      ? parseGeneratedProjectFiles(latestSnapshot?.files)
      : parseGeneratedProjectFiles(sourceRow?.sourceFiles);
  const siteSchema = parseProjectSiteSchema(
    (project as { siteSchema?: unknown }).siteSchema,
    project.prompt,
  );

  return Response.json({
    projectId: project.id,
    buildLog: latestBuild?.logText ?? sourceRow?.buildLog ?? "",
    buildStatus: mapBuildStatusForWorkspace(
      latestBuild?.status ?? sourceRow?.buildStatus,
    ),
    files: storedFiles.length
      ? storedFiles
      : createGeneratedProjectFiles(project.id, siteSchema),
  });
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
