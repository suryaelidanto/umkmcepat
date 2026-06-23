import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createGeneratedProjectFiles } from "@/lib/projects/generated-source";
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

  const siteSchema = parseProjectSiteSchema(
    (project as { siteSchema?: unknown }).siteSchema,
    project.prompt,
  );

  return Response.json({
    projectId: project.id,
    files: createGeneratedProjectFiles(project.id, siteSchema),
  });
}
