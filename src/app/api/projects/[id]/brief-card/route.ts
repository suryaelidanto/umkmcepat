import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseProjectBrief } from "@/lib/projects/brief";
import { generateNextWorkspaceCard } from "@/lib/projects/brief-flow";

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
  const userId = session.user.id;
  const project = await prisma.project.findFirst({
    where: { id, userId },
    select: { prompt: true },
  });

  if (!project) {
    return Response.json(
      { message: "Proyek tidak ditemukan." },
      { status: 404 },
    );
  }

  const [row] = await prisma.$queryRaw<[{ brief: unknown }]>`
    SELECT "brief" FROM "Project" WHERE id = ${id} AND "userId" = ${userId}
  `;
  const brief = parseProjectBrief(row?.brief, project.prompt);
  const workspaceCard = await generateNextWorkspaceCard(brief);

  return Response.json({ brief, workspaceCard });
}
