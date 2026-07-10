import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readProjectThumbnail } from "@/lib/projects/project-thumbnail";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
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
    select: { thumbnailRef: true },
  });
  if (!project?.thumbnailRef) {
    return Response.json(
      { message: "Thumbnail tidak ditemukan." },
      { status: 404 },
    );
  }

  try {
    const bytes = await readProjectThumbnail(project.thumbnailRef);
    return new Response(bytes, {
      headers: {
        "Cache-Control": "private, max-age=31536000, immutable",
        "Content-Type": "image/jpeg",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return Response.json(
      { message: "Thumbnail tidak ditemukan." },
      { status: 404 },
    );
  }
}
