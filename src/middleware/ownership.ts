import { prisma } from "@/lib/prisma";

export async function verifyProjectOwnership(
  projectId: string,
  userId: string,
): Promise<boolean> {
  if (!projectId || !userId) {
    return false;
  }

  try {
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        userId: userId,
      },
      select: {
        id: true,
      },
    });

    return !!project;
  } catch {
    return false;
  }
}
