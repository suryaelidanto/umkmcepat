import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseProjectBrief } from "@/lib/projects/brief";
import {
  generateNextWorkspaceCard,
  parseWorkspaceCard,
} from "@/lib/projects/brief-flow";

export async function GET(
  request: Request,
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

  const [row] = await prisma.$queryRaw<
    [{ brief: unknown; workspaceCard: unknown }]
  >`
    SELECT "brief", "workspaceCard" FROM "Project" WHERE id = ${id} AND "userId" = ${userId}
  `;
  const brief = parseProjectBrief(row?.brief, project.prompt);
  const shouldRegenerate =
    new URL(request.url).searchParams.get("regenerate") === "1";

  if (shouldRegenerate) {
    const workspaceCard = generateNextWorkspaceCard(brief);

    await prisma.$executeRaw`
      UPDATE "Project" SET "workspaceCard" = ${JSON.stringify(workspaceCard)}::jsonb WHERE id = ${id} AND "userId" = ${userId}
    `;

    return Response.json({ brief, workspaceCard });
  }

  return Response.json({
    brief,
    workspaceCard: parseWorkspaceCard(row?.workspaceCard, brief),
  });
}
