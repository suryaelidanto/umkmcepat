import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  createGeneratedProjectFiles,
  parseGeneratedProjectFiles,
} from "@/lib/projects/generated-source";
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
  const storedFiles = parseGeneratedProjectFiles(sourceRow?.sourceFiles);
  const siteSchema = parseProjectSiteSchema(
    (project as { siteSchema?: unknown }).siteSchema,
    project.prompt,
  );

  return Response.json({
    projectId: project.id,
    buildLog: sourceRow?.buildLog ?? "",
    buildStatus: sourceRow?.buildStatus ?? "not_started",
    files: storedFiles.length
      ? storedFiles
      : createGeneratedProjectFiles(project.id, siteSchema),
  });
}
