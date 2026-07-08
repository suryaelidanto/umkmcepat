import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isPrismaDatabaseUnavailable } from "@/lib/prisma-errors";
import { parseProjectBrief } from "@/lib/projects/brief";
import { parseWorkspaceCard } from "@/lib/projects/brief-flow";

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
    select: {
      id: true,
      prompt: true,
      title: true,
    },
  });

  if (!project) {
    return Response.json(
      { message: "Proyek tidak ditemukan." },
      { status: 404 },
    );
  }

  let workspaceRow: { brief: unknown; workspaceCard: unknown } | undefined;

  try {
    [workspaceRow] = await prisma.$queryRaw<
      [{ brief: unknown; workspaceCard: unknown }]
    >`
      SELECT "brief", "workspaceCard" FROM "Project" WHERE id = ${project.id} AND "userId" = ${session.user.id}
    `;
  } catch (error) {
    if (isPrismaDatabaseUnavailable(error)) {
      return Response.json(
        {
          code: "database_unavailable",
          message: "Workspace lagi nyambung ulang. Coba lagi sebentar ya.",
        },
        { status: 503, headers: { "Retry-After": "3" } },
      );
    }

    throw error;
  }
  const brief = parseProjectBrief(workspaceRow?.brief, project.prompt);

  return Response.json({
    projectId: project.id,
    projectTitle: project.title,
    workspaceCard: parseWorkspaceCard(workspaceRow?.workspaceCard, brief),
  });
}
