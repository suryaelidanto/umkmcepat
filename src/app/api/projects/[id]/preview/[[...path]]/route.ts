import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseGeneratedDistFiles } from "@/lib/projects/generated-source";
import {
  applyPreviewSandboxHeaders,
  proxyDeploymentRequest,
} from "@/lib/projects/runtime-proxy";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; path?: string[] }> },
) {
  const session = await auth();

  if (!session?.user?.id) {
    return Response.json(
      { message: "Masuk dulu untuk melanjutkan." },
      { status: 401 },
    );
  }

  const { id, path = [] } = await params;
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

  const deployment = await prisma.projectDeployment.findFirst({
    where: { kind: "preview", projectId: project.id },
    orderBy: { createdAt: "desc" },
    select: {
      build: { select: { artifactRef: true } },
      id: true,
      status: true,
    },
  });

  if (deployment?.build?.artifactRef) {
    const response = await proxyDeploymentRequest({
      deploymentId: deployment.id,
      deploymentStatus: deployment.status,
      pathSegments: path,
      request,
    });

    if (response) {
      await prisma.projectDeployment.update({
        where: { id: deployment.id },
        data: { lastRequestAt: new Date() },
      });
      return response;
    }

    return Response.json(
      { message: "Runtime preview belum bisa dimulai." },
      { status: 503 },
    );
  }

  const [row] = await prisma.$queryRaw<[{ distFiles: unknown }]>`
    SELECT "distFiles" FROM "Project" WHERE id = ${project.id} AND "userId" = ${session.user.id}
  `;
  const distFiles = parseGeneratedDistFiles(row?.distFiles);
  const requestedPath = path.join("/") || "index.html";
  const file =
    distFiles.find((item) => item.path === requestedPath) ||
    distFiles.find((item) => item.path === "index.html");

  if (!file) {
    return Response.json(
      { message: "Preview belum tersedia." },
      { status: 404 },
    );
  }

  return new Response(file.content, {
    headers: applyPreviewSandboxHeaders(
      new Headers({ "Content-Type": file.contentType }),
    ),
  });
}
