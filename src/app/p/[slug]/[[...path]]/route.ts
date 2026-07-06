import { prisma } from "@/lib/prisma";
import { proxyDeploymentRequest } from "@/lib/projects/runtime-proxy";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ path?: string[]; slug: string }> },
) {
  const { path = [], slug } = await params;
  const deployment = await prisma.projectDeployment.findFirst({
    where: { kind: "published", slug },
    orderBy: { updatedAt: "desc" },
    select: {
      build: { select: { artifactRef: true } },
      id: true,
      status: true,
    },
  });

  if (!deployment?.build?.artifactRef) {
    return Response.json(
      { message: "Website belum tersedia." },
      { status: 404 },
    );
  }

  const response = await proxyDeploymentRequest({
    deploymentId: deployment.id,
    deploymentStatus: deployment.status,
    noindex: false,
    pathSegments: path,
    request,
  });

  if (!response) {
    return Response.json(
      { message: "Website belum bisa dimulai." },
      { status: 503 },
    );
  }

  await prisma.projectDeployment.update({
    where: { id: deployment.id },
    data: { lastRequestAt: new Date() },
  });

  return response;
}
